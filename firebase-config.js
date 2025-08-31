// firebase-config.js — تهيئة واحدة فقط هنا
// استخدام مكتبات compat في HTML قبل هذا الملف:
// <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>


const firebaseConfig = {
apiKey: "AIzaSyAo8NPynRlZgoVspEH7uUwoOp2nNc-QBj8",
authDomain: "camera-share-demo.firebaseapp.com",
projectId: "camera-share-demo",
storageBucket: "camera-share-demo.firebasestorage.app",
messagingSenderId: "1084551271486",
appId: "1:1084551271486:web:929b1b0ac2dd7abf0aed6f",
measurementId: "G-Y0RWDV7FVF"
};


firebase.initializeApp(firebaseConfig);


// جعل الـ db و FieldValue متاحين عالميًا
window.db = firebase.firestore();
window.FieldValue = firebase.firestore.FieldValue;