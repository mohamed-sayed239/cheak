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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();