/* Paste YOUR Firebase web-app settings here (Firebase console > Project settings > General > Your apps).
   Use a NEW Firebase project for this app, separate from the Ikhlas School Manager project.
   These values are not secret; your data is protected by firestore.rules and by signing in. */
<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyAzLgPO5YKeZoW2oGOputc5v6WMQNAsm3Y",
    authDomain: "sam-db-iks.firebaseapp.com",
    projectId: "sam-db-iks",
    storageBucket: "sam-db-iks.firebasestorage.app",
    messagingSenderId: "1078772881778",
    appId: "1:1078772881778:web:12314849abc4f42690a5eb",
    measurementId: "G-NTGSKXKYY2"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>
