// Service worker for background push notifications.
// Must live at the site root (Vite copies owner-app/public/* to dist/).
// The __FIREBASE_*__ tokens are replaced at build time by the Vite plugin in vite.config.js.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  messagingSenderId: "__FIREBASE_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
});

// Messages that carry a `notification` payload (ours do) are shown by the browser automatically.
firebase.messaging();
