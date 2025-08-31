// child.js — يبدأ مشاركة (كاميرا/ميك/شاشة)، ينشئ Offer مرة واحدة، ويستقبل Answer

const localVideo = document.getElementById('localVideo');
const shareCameraBtn = document.getElementById('shareCamera');
const shareMicBtn = document.getElementById('shareMicrophone');
const shareScreenBtn = document.getElementById('shareScreen');
const stopBtn = document.getElementById('stopSharing');
const statusEl = document.getElementById('statusText');

let localStream = null;
let pc = null;
let offerSent = false;

const OFFER_DOC = 'child-offer';
const ANSWER_DOC = 'parent-answer';

// 🟢 لازم نعرف FieldValue هنا
const FieldValue = firebase.firestore.FieldValue;

function logStatus(t) {
  statusEl.textContent = t;
  console.log('[CHILD]', t);
}

async function startWith(opts, label) {
  if (offerSent) return;
  try {
    logStatus(`جاري طلب إذن لـ ${label}...`);
    localStream = opts.display
      ? await navigator.mediaDevices.getDisplayMedia(opts.getter)
      : await navigator.mediaDevices.getUserMedia(opts.getter);

    localVideo.srcObject = localStream;

    pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // إرسال الـ ICE Candidates للـ Firestore
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        db.collection('calls').doc(OFFER_DOC).collection('iceCandidates').add({
          candidate: e.candidate.toJSON(),   // ✅ نخزن كـ JSON
          ts: FieldValue.serverTimestamp()
        });
      }
    };

    // عمل Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await db.collection('calls').doc(OFFER_DOC).set({
      type: 'offer',
      sdp: offer.sdp,
      ts: FieldValue.serverTimestamp()
    });

    offerSent = true;
    logStatus('تم إرسال العرض، في انتظار الرد...');

    // استقبل Answer من الأب
    db.collection('calls').doc(ANSWER_DOC).onSnapshot((snap) => {
      const d = snap.data();
      if (d?.type === 'answer' && !pc.currentRemoteDescription) {
        const answer = new RTCSessionDescription({ type: 'answer', sdp: d.sdp });
        pc.setRemoteDescription(answer).then(() => {
          logStatus('تم إنشاء الاتصال!');
        }).catch(console.error);
      }
    });

    // استقبل ICE من الأب
    db.collection('calls').doc(ANSWER_DOC).collection('iceCandidates')
      .onSnapshot((snap) => {
        snap.docChanges().forEach((c) => {
          if (c.type === 'added') {
            const data = c.doc.data();
            pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(console.error);
          }
        });
      });

  } catch (err) {
    logStatus('خطأ: ' + err.message);
  }
}

function stopSharing() {
  try {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
      localVideo.srcObject = null;
    }
    if (pc) { pc.close(); pc = null; }
    offerSent = false;

    shareCameraBtn.disabled = shareMicBtn.disabled = shareScreenBtn.disabled = false;
    stopBtn.disabled = true;
    logStatus('تم إيقاف المشاركة');

    // تنظيف Firestore
    db.collection('calls').doc(OFFER_DOC).delete().catch(()=>{});
    db.collection('calls').doc(OFFER_DOC).collection('iceCandidates').get()
      .then(s => s.forEach(d => d.ref.delete()));
  } catch(e){ console.error(e); }
}

// أزرار
shareCameraBtn.onclick = () => startWith({ getter:{ video:true, audio:true } }, 'كاميرا + ميك');
shareMicBtn.onclick = () => startWith({ getter:{ audio:true }, display:false }, 'ميكروفون');
shareScreenBtn.onclick = () => startWith({ getter:{ video:true, audio:true }, display:true }, 'مشاركة الشاشة');
stopBtn.onclick = stopSharing;
