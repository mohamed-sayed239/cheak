// webrtc-handler.js - معالج اتصالات WebRTC مع تحسينات تخزين ICE Candidates

// تهيئة Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAo8NPynRlZgoVspEH7uUwoOp2nNc-QBj8",
    authDomain: "camera-share-demo.firebaseapp.com",
    projectId: "camera-share-demo",
    storageBucket: "camera-share-demo.firebasestorage.app",
    messagingSenderId: "1084551271486",
    appId: "1:1084551271486:web:929b1b0ac2dd7abf0aed6f",
    measurementId: "G-Y0RWDV7FVF"
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// متغيرات عامة
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let isCaller = false;
let callDoc = null;

// تكوين ICE Servers لـ WebRTC
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// إنشاء PeerConnection جديد
function createPeerConnection() {
    try {
        peerConnection = new RTCPeerConnection(iceServers);
        
        // إضافة معالج لمرشحات ICE
        peerConnection.onicecandidate = handleICECandidateEvent;
        
        // معالج لاستقبال التدفق عن بعد
        peerConnection.ontrack = handleTrackEvent;
        
        // معالج لتغير حالة الاتصال
        peerConnection.onconnectionstatechange = handleConnectionStateChange;
        
        // معالج لإشارات ICE Connection State
        peerConnection.oniceconnectionstatechange = handleICEConnectionStateChange;
        
        console.log('تم إنشاء PeerConnection بنجاح');
        return peerConnection;
    } catch (error) {
        console.error('خطأ في إنشاء PeerConnection:', error);
        return null;
    }
}

// معالج مرشحات ICE - محسن لتخزين JSON
async function handleICECandidateEvent(event) {
    if (event.candidate) {
        console.log('تم إنشاء مرشح ICE جديد:', event.candidate);
        
        try {
            // تحويل الـ ICE Candidate إلى JSON لتخزينه في Firestore
            const candidateData = {
                candidate: event.candidate.toJSON(), // ✅ تحويل للـ JSON
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // تحديد المجموعة المناسبة بناءً على الدور
            const collectionName = isCaller ? 'offerCandidates' : 'answerCandidates';
            
            // إضافة المرشح إلى المجموعة المناسبة
            await db.collection('calls').doc('currentCall').collection(collectionName).add(candidateData);
            console.log('تم إرسال مرشح ICE بنجاح إلى', collectionName);
        } catch (error) {
            console.error('خطأ في إرسال مرشح ICE:', error);
        }
    }
}

// معالج استقبال التدفق عن بعد
function handleTrackEvent(event) {
    console.log('تم استقبال تدفق عن بعد:', event.streams);
    remoteStream = event.streams[0];
    
    // إرسال حدث لتحديث الفيديو في الواجهة
    const videoEvent = new CustomEvent('remoteStreamReceived', { detail: remoteStream });
    document.dispatchEvent(videoEvent);
}

// معالج تغير حالة الاتصال
function handleConnectionStateChange() {
    if (peerConnection) {
        console.log('حالة الاتصال تغيرت إلى:', peerConnection.connectionState);
        
        // إرسال حدث لتحديث الواجهة
        const stateEvent = new CustomEvent('connectionStateChanged', { 
            detail: peerConnection.connectionState 
        });
        document.dispatchEvent(stateEvent);
    }
}

// معالج تغير حالة ICE Connection
function handleICEConnectionStateChange() {
    if (peerConnection) {
        console.log('حالة ICE Connection تغيرت إلى:', peerConnection.iceConnectionState);
        
        // إرسال حدث لتحديث الواجهة
        const iceStateEvent = new CustomEvent('iceConnectionStateChanged', { 
            detail: peerConnection.iceConnectionState 
        });
        document.dispatchEvent(iceStateEvent);
    }
}

// إنشاء Offer وإرساله (للطفل)
async function createAndSendOffer(stream) {
    try {
        isCaller = true;
        
        // إنشاء PeerConnection إذا لم يكن موجودًا
        if (!peerConnection) {
            createPeerConnection();
        }
        
        // إضافة التدفق المحلي إلى PeerConnection
        if (stream) {
            stream.getTracks().forEach(track => {
                peerConnection.addTrack(track, stream);
            });
        }
        
        // إنشاء Offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        console.log('تم إنشاء Offer بنجاح:', offer);
        
        // حفظ Offer في Firestore
        const offerData = {
            type: 'offer',
            sdp: offer.sdp,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('calls').doc('currentCall').set(offerData);
        console.log('تم إرسال Offer إلى Firestore');
        
        // الاستماع للإجابة
        listenForAnswer();
        
        // الاستماع لمرشحات ICE من الطرف الآخر
        listenForRemoteCandidates('answerCandidates');
        
        return true;
    } catch (error) {
        console.error('خطأ في إنشاء أو إرسال Offer:', error);
        return false;
    }
}

// الاستماع للإجابة (للطفل)
function listenForAnswer() {
    db.collection('calls').doc('currentCall')
        .onSnapshot(async (snapshot) => {
            if (snapshot.exists) {
                const data = snapshot.data();
                
                if (data.type === 'answer' && peerConnection.signalingState !== 'stable') {
                    console.log('تم استقبال Answer:', data);
                    
                    const answerDescription = new RTCSessionDescription({
                        type: 'answer',
                        sdp: data.sdp
                    });
                    
                    try {
                        await peerConnection.setRemoteDescription(answerDescription);
                        console.log('تم تعيين Answer كـ RemoteDescription بنجاح');
                    } catch (error) {
                        console.error('خطأ في تعيين Answer:', error);
                    }
                }
            }
        });
}

// الاستماع للعرض وإنشاء إجابة (للأب)
async function listenForOfferAndCreateAnswer() {
    isCaller = false;
    
    // إنشاء PeerConnection إذا لم يكن موجودًا
    if (!peerConnection) {
        createPeerConnection();
    }
    
    db.collection('calls').doc('currentCall')
        .onSnapshot(async (snapshot) => {
            if (snapshot.exists) {
                const data = snapshot.data();
                
                if (data.type === 'offer' && (!peerConnection.currentRemoteDescription || 
                    peerConnection.currentRemoteDescription.type !== 'offer')) {
                    console.log('تم استقبال Offer:', data);
                    
                    const offerDescription = new RTCSessionDescription({
                        type: 'offer',
                        sdp: data.sdp
                    });
                    
                    try {
                        await peerConnection.setRemoteDescription(offerDescription);
                        console.log('تم تعيين Offer كـ RemoteDescription بنجاح');
                        
                        // إنشاء Answer
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        
                        console.log('تم إنشاء Answer بنجاح:', answer);
                        
                        // حفظ Answer في Firestore
                        const answerData = {
                            type: 'answer',
                            sdp: answer.sdp,
                            timestamp: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        
                        await db.collection('calls').doc('currentCall').set(answerData);
                        console.log('تم إرسال Answer إلى Firestore');
                        
                        // الاستماع لمرشحات ICE من الطرف الآخر
                        listenForRemoteCandidates('offerCandidates');
                        
                    } catch (error) {
                        console.error('خطأ في معالجة Offer أو إنشاء Answer:', error);
                    }
                }
            }
        });
}

// الاستماع لمرشحات ICE من الطرف الآخر - محسن لاستقبال JSON
function listenForRemoteCandidates(collectionName) {
    db.collection('calls').doc('currentCall').collection(collectionName)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    
                    try {
                        // ✅ تحويل JSON المرسل إلى RTCIceCandidate object
                        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                        console.log('تم إضافة مرشح ICE من الطرف الآخر:', data.candidate);
                    } catch (error) {
                        console.error('خطأ في إضافة مرشح ICE:', error);
                    }
                }
            });
        });
}

// إيقاف المشاركة وإنهاء الاتصال
async function stopSharing() {
    try {
        // إيقاف جميع المسارات المحلية
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        // إغلاق PeerConnection
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        // مسح البيانات من Firestore
        await db.collection('calls').doc('currentCall').delete();
        
        // مسح مرشحات ICE
        const offerCandidates = await db.collection('calls').doc('currentCall').collection('offerCandidates').get();
        offerCandidates.forEach(doc => doc.ref.delete());
        
        const answerCandidates = await db.collection('calls').doc('currentCall').collection('answerCandidates').get();
        answerCandidates.forEach(doc => doc.ref.delete());
        
        console.log('تم إيقاف المشاركة وإنهاء الاتصال بنجاح');
        
        // إرسال حدث لإعلام الواجهة
        const stopEvent = new CustomEvent('sharingStopped');
        document.dispatchEvent(stopEvent);
        
        return true;
    } catch (error) {
        console.error('خطأ في إيقاف المشاركة:', error);
        return false;
    }
}

// الحصول على تدفق وسائط (كاميرا، ميكروفون، أو شاشة)
async function getMediaStream(constraints) {
    try {
        let stream;
        
        if (constraints.video && constraints.video.displaySurface) {
            // مشاركة الشاشة
            stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } else {
            // كاميرا أو ميكروفون
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        }
        
        localStream = stream;
        
        // إرسال حدث لتحديث الفيديو المحلي في الواجهة
        const videoEvent = new CustomEvent('localStreamReceived', { detail: localStream });
        document.dispatchEvent(videoEvent);
        
        return stream;
    } catch (error) {
        console.error('خطأ في الحصول على تدفق الوسائط:', error);
        throw error;
    }
}

// تصدير الدوال للاستخدام في الملفات الأخرى
window.WebRTCHandler = {
    createPeerConnection,
    createAndSendOffer,
    listenForOfferAndCreateAnswer,
    stopSharing,
    getMediaStream
};