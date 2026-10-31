// Firebase configuration for the worldwide leaderboard (project: sudoku-world-e6a6b-25bc5).
//
// If you ever put the YOUR_… placeholders back, the leaderboard switches itself off and Sudoku
// behaves exactly as before (local scoreboard only). See README.md → "Firebase setup".
//
// These values are NOT secrets: Firebase web config is meant to be public. What protects
// your data is firestore.rules (+ App Check), not hiding this file.
// See firebase-config.example.js for a filled-in example.
//
// The leaderboard uses Cloud Firestore + Anonymous Auth only — there is deliberately no
// databaseURL here (no Realtime Database).

export const firebaseConfig = {
  apiKey:            'AIzaSyBE8ImMz9kWg8cQyLCEFchXBfYFY952PTY',
  authDomain:        'sudoku-world-e6a6b-25bc5.firebaseapp.com',
  projectId:         'sudoku-world-e6a6b-25bc5',
  storageBucket:     'sudoku-world-e6a6b-25bc5.firebasestorage.app',
  messagingSenderId: '182526838112',
  appId:             '1:182526838112:web:863ece5f9d4a4819390a05',
};

// Optional but recommended: reCAPTCHA v3 site key for Firebase App Check ('' = App Check off).
export const appCheckSiteKey = '';
