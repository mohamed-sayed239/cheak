// parent.js — يستقبل الـ Offer، يرد بـ Answer، ويعرض الفيديو

const remoteVideo = document.getElementById('remoteVideo');
const waitingEl = document.getElementById('waiting');
const statusEl = document.getElementById('status');

let pc = null;
const OFFER_DOC = 'child-offer';
const ANSWER_DOC = 'parent-answer';

// 🟢 لازم نعرف FieldValue هنا
const FieldValue = firebase.firestore.FieldValue;

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
      logStatus('متصل - بث مباشر');
    }
  };

  // إرسال ICE إلى Firestore
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      db.collection('calls').doc(ANSWER_DOC).collection('iceCandidates').add({
        candidate: e.candidate.toJSON(),   // ✅ نخزن كـ JSON
        ts: FieldValue.serverTimestamp()
      });
    }
  };
}

function listenForOffer(){
  db.collection('calls').doc(OFFER_DOC).onSnapshot(async (snap) => {
    if (!snap.exists) {
      waitingEl.style.display = 'flex';
      logStatus('في انتظار مشاركة من الابن...');
      return;
    }
    const data = snap.data();
    if (data?.type === 'offer') {
      if (!pc) createPeerConnection();

      logStatus('تم استقبال العرض، جاري إنشاء الإجابة...');
      const offer = new RTCSessionDescription({ type:'offer', sdp:data.sdp });
      await pc.setRemoteDescription(offer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await db.collection('calls').doc(ANSWER_DOC).set({
        type:'answer',
        sdp:answer.sdp,
        ts: FieldValue.serverTimestamp()
      });

      logStatus('تم إرسال الإجابة...');
      
      // استقبل ICE من الابن
      db.collection('calls').doc(OFFER_DOC).collection('iceCandidates')
        .onSnapshot((snapshot) => {
          snapshot.docChanges().forEach((c) => {
            if (c.type === 'added') {
              const data = c.doc.data();
              pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(console.error);
            }
          });
        });
    }
  });
}

document.addEventListener('DOMContentLoaded', listenForOffer);
