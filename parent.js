// parent.js — يستقبل الـ Offer، يرد بـ Answer، ويعرض الفيديو

const remoteVideo = document.getElementById('remoteVideo');
const waitingEl   = document.getElementById('waiting');
const statusEl    = document.getElementById('status');

let pc = null;
const OFFER_DOC  = 'child-offer';
const ANSWER_DOC = 'parent-answer';

function logStatus(t){ statusEl.textContent = t; console.log('[PARENT]', t); }

function createPeerConnection(){
  pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  pc.ontrack = (e) => {
    if (e.streams && e.streams[0]) {
      remoteVideo.srcObject = e.streams[0];
      waitingEl.style.display = 'none';
      logStatus('متصل – بث مباشر');
    }
  };

  pc.onicecandidate = async (e) => {
    if (e.candidate) {
      await db.collection('calls').doc(ANSWER_DOC).collection('iceCandidates').add({
        candidate: e.candidate.toJSON(),
        ts: FieldValue.serverTimestamp()
      });
    }
  };

  pc.onconnectionstatechange = () => {
    logStatus('حالة الاتصال: ' + pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      waitingEl.style.display = 'block';
    }
  };
}

function listenForOffer(){
  db.collection('calls').doc(OFFER_DOC).onSnapshot(async (snap) => {
    if (!snap.exists) {
      waitingEl.style.display = 'block';
      logStatus('في انتظار مشاركة من الابن…');
      return;
    }

    const data = snap.data();
    if (data.type !== 'offer') return;

    // تجاهل أي عرض جديد أثناء عدم الاستقرار لتجنب m-line mismatch
    if (pc && pc.signalingState !== 'stable' && pc.currentRemoteDescription) {
      console.warn('Ignoring new offer while signalingState=', pc.signalingState);
      return;
    }

    if (!pc) createPeerConnection();

    try {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await db.collection('calls').doc(ANSWER_DOC).set({
        type: 'answer',
        sdp: answer.sdp,
        ts: FieldValue.serverTimestamp()
      });

      logStatus('تم إرسال الإجابة، جاري إنشاء الاتصال...');

      // استقبل ICE من الطفل
      db.collection('calls').doc(OFFER_DOC).collection('iceCandidates')
        .onSnapshot((snap2) => {
          snap2.docChanges().forEach((c) => {
            if (c.type === 'added') {
              const d = c.doc.data();
              pc.addIceCandidate(new RTCIceCandidate(d.candidate)).catch(console.error);
            }
          });
        });

    } catch (err) {
      console.error(err);
      logStatus('خطأ أثناء إنشاء الاتصال: ' + err.message);
    }
  });
}

// ابدأ الاستماع عند تحميل الصفحة
listenForOffer();
