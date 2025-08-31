// child.js — يبدأ مشاركة (كاميرا/ميك/شاشة)، ينشئ Offer مرة واحدة، ويستقبل Answer

const shareCameraBtn = document.getElementById('shareCamera');
const shareMicBtn    = document.getElementById('shareMic');
const shareScreenBtn = document.getElementById('shareScreen');
const stopBtn        = document.getElementById('stop');
const localVideo     = document.getElementById('localVideo');
const statusEl       = document.getElementById('status');

let pc = null;
let localStream = null;
let offerSent = false;  // منع إنشاء عروض متكررة

const OFFER_DOC  = 'child-offer';
const ANSWER_DOC = 'parent-answer';

function logStatus(t){ statusEl.textContent = t; console.log('[CHILD]', t); }

function createPeerConnection(){
  pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  pc.onicecandidate = async (e) => {
    if (e.candidate) {
      await db.collection('calls').doc(OFFER_DOC).collection('iceCandidates').add({
        candidate: e.candidate.toJSON(),
        ts: FieldValue.serverTimestamp()
      });
    }
  };

  pc.onconnectionstatechange = () => {
    logStatus('حالة الاتصال: ' + pc.connectionState);
  };
}

async function startWith(opts, label){
  try {
    logStatus('طلب صلاحيات: ' + label + '...');
    const isDisplay = !!opts.display;
    localStream = await navigator.mediaDevices[isDisplay ? 'getDisplayMedia' : 'getUserMedia'](opts.getter);

    // عرض المعاينة
    localVideo.srcObject = localStream;

    // تعطيل أزرار البدء وتفعيل الإيقاف
    shareCameraBtn.disabled = shareMicBtn.disabled = shareScreenBtn.disabled = true;
    stopBtn.disabled = false;

    createPeerConnection();

    // أضف التراكات قبل إنشاء الـ Offer
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    await createAndSendOffer();

  } catch (err) {
    logStatus('خطأ: ' + err.message);
    console.error(err);
  }
}

async function createAndSendOffer(){
  if (offerSent) return; // منع التكرار
  offerSent = true;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await db.collection('calls').doc(OFFER_DOC).set({
    type: 'offer',
    sdp: offer.sdp,
    ts: FieldValue.serverTimestamp()
  });

  logStatus('تم إرسال العرض، في انتظار إجابة الأب...');

  // استقبل الإجابة من الأب
  db.collection('calls').doc(ANSWER_DOC).onSnapshot((snap) => {
    if (!snap.exists) return;
    const d = snap.data();
    if (d.type === 'answer' && !pc.currentRemoteDescription) {
      const answer = new RTCSessionDescription({ type: 'answer', sdp: d.sdp });
      pc.setRemoteDescription(answer)
        .then(() => logStatus('تم إنشاء الاتصال!'))
        .catch(console.error);
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
}

function stopSharing(){
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

    // تنظيف مستندات هذه الجلسة
    db.collection('calls').doc(OFFER_DOC).delete().catch(()=>{});
    db.collection('calls').doc(OFFER_DOC).collection('iceCandidates')
      .get().then(s => s.forEach(d => d.ref.delete()));
  } catch(e){ console.error(e); }
}

// أحداث الأزرار
shareCameraBtn.onclick = () => startWith({ getter:{ video:true, audio:true } }, 'كاميرا + ميك');
shareMicBtn.onclick    = () => startWith({ getter:{ audio:true }, display:false }, 'ميكروفون');
shareScreenBtn.onclick = () => startWith({ getter:{ video:true, audio:true }, display:true }, 'مشاركة الشاشة');
stopBtn.onclick        = stopSharing;
