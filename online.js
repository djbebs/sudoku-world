// online.js — worldwide leaderboard for Sudoku (Firebase Firestore + Anonymous Auth + optional App Check).
//
// Loaded by sudoku.html as <script type="module">. It exposes `window.SudokuOnline` and fires a
// 'sudoku-online-ready' event. Everything here is optional: if this file fails to load, is not
// configured, or the network is down, the game itself keeps working (local scoreboard only).
//
// The Firebase SDK is downloaded lazily — only when the leaderboard is actually needed.

import { firebaseConfig, appCheckSiteKey } from './firebase-config.js';
import {
  TOP_N, MAX_NICK, cleanNickname, scoreDocId, isBetter, validateSubmission, parseQueue, enqueue,
} from './online-core.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.1.0';
const LS_NICK     = 'sudoku-player-name';      // shared with the local scoreboard
const LS_SYNCED   = 'sudoku-online-synced';    // "nickname|uid" last written to Firestore
const LS_QUEUE    = 'sudoku-online-queue';     // scores earned while offline
const WRITE_TIMEOUT_MS = 15000;

const host = location.hostname;
const local = host === 'localhost' || host === '127.0.0.1';
// ?emulator on localhost → talk to the Firebase Emulator Suite (used by the tests, never in production)
const useEmulator = local && new URLSearchParams(location.search).has('emulator');
const cfg = useEmulator
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-sudoku', appId: 'demo-app' }
  : firebaseConfig;

const placeholder = v => !v || /^YOUR_/.test(v);
const configured = useEmulator || (!placeholder(cfg.apiKey) && !placeholder(cfg.projectId) && !placeholder(cfg.appId));
const httpOrigin = location.protocol === 'http:' || location.protocol === 'https:';   // Firebase Auth needs one
const available = configured && httpOrigin;
if (!available) console.info('[online] Worldwide leaderboard is off:', !httpOrigin ? 'open the page over http(s), not file://' : 'fill in firebase-config.js');

// ── errors → what the UI should say ───────────────────────────────────────────
function classify(err) {
  const code = (err && err.code) || '';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (code === 'unavailable' || code === 'auth/network-request-failed' || code === 'deadline-exceeded' || code === 'timeout') return 'offline';
  // anything else that fails while the browser thinks it is online (SDK blocked, Firebase down, quota used up…) is 'error'
  if (code === 'permission-denied' || code === 'auth/operation-not-allowed') return 'denied';
  return 'error';
}

// ── lazy Firebase bootstrap ───────────────────────────────────────────────────
let readyPromise = null;

function ensureReady() {
  if (!available) return Promise.reject(Object.assign(new Error('online features unavailable'), { code: 'unavailable-config' }));
  if (!readyPromise) {
    readyPromise = (async () => {
      const [{ initializeApp }, authMod, fs] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      const app = initializeApp(cfg);

      if (appCheckSiteKey && !useEmulator) {
        // App Check must be initialised before the other services are used.
        if (local) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;      // dev: prints a debug token to register in the console
        const ac = await import(`${SDK}/firebase-app-check.js`);
        ac.initializeAppCheck(app, { provider: new ac.ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
      }

      const auth = authMod.getAuth(app);
      const db = fs.getFirestore(app);
      if (useEmulator) {
        authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
      }
      await auth.authStateReady();
      if (!auth.currentUser) await authMod.signInAnonymously(auth);    // persistent anonymous identity (IndexedDB)
      return { auth, db, fs, uid: auth.currentUser.uid };
    })().catch(err => { readyPromise = null; throw err; });            // allow a retry later
  }
  return readyPromise;
}

const withTimeout = (p, ms) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms)),
]);

// ── nickname ──────────────────────────────────────────────────────────────────
const getNickname = () => cleanNickname(localStorage.getItem(LS_NICK) || '');

// Writes players/{uid} and renames the player's existing leaderboard entries.
// Concurrent calls for the same nickname share one run (the rules allow one players/{uid} write per 3 s).
let syncing = null;
function syncNickname(nick, S) {
  const key = nick + '|' + S.uid;
  if (localStorage.getItem(LS_SYNCED) === key) return Promise.resolve();
  if (!syncing || syncing.key !== key) {
    const run = doSyncNickname(nick, S).finally(() => { if (syncing && syncing.run === run) syncing = null; });
    syncing = { key, run };
  }
  return syncing.run;
}

async function doSyncNickname(nick, S) {
  const { db, fs, uid } = S;
  await fs.setDoc(fs.doc(db, 'players', uid), { nickname: nick, updatedAt: fs.serverTimestamp() });

  // Only the entries that can still be on a visible board: the 3 personal bests + today's and yesterday's Daily
  const now = Date.now();
  const day = d => new Date(d).toISOString().slice(0, 10);
  const ids = ['easy', 'medium', 'hard', 'daily-' + day(now), 'daily-' + day(now - 86400000)].map(b => scoreDocId(b, uid));
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'scores'), fs.where(fs.documentId(), 'in', ids)));
  const stale = snap.docs.filter(d => d.data().nickname !== nick);
  if (stale.length) {
    const batch = fs.writeBatch(db);
    stale.forEach(d => batch.update(d.ref, { nickname: nick }));
    await batch.commit();
  }
  localStorage.setItem(LS_SYNCED, nick + '|' + uid);
}

async function setNickname(raw) {
  const nick = cleanNickname(raw);
  if (!nick) return { status: 'invalid' };
  localStorage.setItem(LS_NICK, nick);                              // the name is always kept locally first
  try {
    await syncNickname(nick, await ensureReady());
    return { status: 'synced', nickname: nick };
  } catch (err) {
    return { status: 'local', nickname: nick, reason: classify(err) };   // synced with the next submission
  }
}

// ── scores ────────────────────────────────────────────────────────────────────
async function getMine(board) {
  const S = await ensureReady();
  const { db, fs, uid } = S;
  const snap = await fs.getDoc(fs.doc(db, 'scores', scoreDocId(board, uid)));
  if (!snap.exists()) return null;
  const d = snap.data();
  // rank = 1 + number of players with a strictly faster time (ties are not broken here)
  const faster = await fs.getCountFromServer(fs.query(fs.collection(db, 'scores'), fs.where('board', '==', board), fs.where('time', '<', d.time)));
  return { nickname: d.nickname, time: d.time, mistakes: d.mistakes, rank: faster.data().count + 1 };
}

async function writeScore(sub, S) {
  const { db, fs, uid } = S;
  // The nickname is also stored on the score itself, so a refused players/{uid} update (rate limit)
  // must not stop the score; it is simply retried with the next submission.
  try { await syncNickname(sub.nickname, S); }
  catch (err) { if (classify(err) !== 'denied') throw err; }
  const ref = fs.doc(db, 'scores', scoreDocId(sub.board, uid));
  const cur = await fs.getDoc(ref);                                 // 1 read: also tells us create vs update
  if (cur.exists() && !isBetter(sub, cur.data())) {
    return { status: 'kept', best: { time: cur.data().time, mistakes: cur.data().mistakes } };
  }
  const data = {
    uid, board: sub.board, nickname: sub.nickname,
    time: sub.time, mistakes: sub.mistakes, clues: sub.clues,
    ts: fs.serverTimestamp(),
  };
  await withTimeout(cur.exists() ? fs.updateDoc(ref, data) : fs.setDoc(ref, data), WRITE_TIMEOUT_MS);
  return { status: 'saved' };
}

async function submit(sub) {
  const nickname = cleanNickname(sub && sub.nickname);
  const entry = { board: sub && sub.board, time: sub && sub.time, mistakes: sub && sub.mistakes, clues: sub && sub.clues, nickname };
  const bad = validateSubmission(entry);
  if (bad) return { status: 'invalid', reason: bad };
  localStorage.setItem(LS_NICK, nickname);
  try {
    const S = await ensureReady();
    const res = await writeScore(entry, S);
    try { res.mine = await getMine(entry.board); } catch (_) { /* rank is a bonus */ }
    return res;
  } catch (err) {
    const kind = classify(err);
    if (kind === 'offline' || kind === 'error') {                   // keep it and retry later
      localStorage.setItem(LS_QUEUE, JSON.stringify(enqueue(parseQueue(localStorage.getItem(LS_QUEUE)), entry)));
      return { status: 'queued', reason: kind };
    }
    return { status: 'denied', reason: kind };
  }
}

// Sends the scores earned while offline. Called when the connection returns.
let flushing = false;
async function flushQueue() {
  if (!available || flushing) return;
  const queue = parseQueue(localStorage.getItem(LS_QUEUE));
  if (!queue.length) return;
  flushing = true;
  try {
    const S = await ensureReady();
    let rest = queue.slice();
    for (const item of queue) {
      try {
        if (validateSubmission(item)) { rest = rest.filter(x => x !== item); continue; }   // e.g. Daily date too old
        await writeScore(item, S);
        rest = rest.filter(x => x !== item);
      } catch (err) {
        if (classify(err) === 'denied') rest = rest.filter(x => x !== item);              // rejected for good: drop it
        else break;                                                                         // still offline: keep the rest
      }
    }
    localStorage.setItem(LS_QUEUE, JSON.stringify(rest));
  } catch (_) { /* still offline */ }
  finally { flushing = false; }
}

// ── live leaderboard ──────────────────────────────────────────────────────────
// cb({ state:'loading' | 'ok' | 'offline' | 'error', entries?, fromCache? }); returns an unsubscribe function.
function subscribe(board, cb) {
  let unsub = null, cancelled = false;
  (async () => {
    cb({ state: 'loading' });
    let S;
    try { S = await ensureReady(); } catch (err) { if (!cancelled) cb({ state: classify(err) === 'offline' ? 'offline' : 'error' }); return; }
    if (cancelled) return;
    const { db, fs, uid } = S;
    const q = fs.query(fs.collection(db, 'scores'), fs.where('board', '==', board),
      fs.orderBy('time'), fs.orderBy('mistakes'), fs.orderBy('ts'), fs.limit(TOP_N));
    unsub = fs.onSnapshot(q, { includeMetadataChanges: true }, snap => {
      if (cancelled) return;
      const entries = snap.docs.map((d, i) => {
        const x = d.data({ serverTimestamps: 'estimate' });
        return { rank: i + 1, uid: x.uid, nickname: x.nickname, time: x.time, mistakes: x.mistakes, me: x.uid === uid };
      });
      cb({ state: 'ok', entries, fromCache: snap.metadata.fromCache });
    }, err => { if (!cancelled) cb({ state: classify(err) === 'offline' ? 'offline' : 'error', code: err.code }); });
  })();
  return () => { cancelled = true; if (unsub) unsub(); };
}

// ── public API ────────────────────────────────────────────────────────────────
window.SudokuOnline = {
  available, maxNick: MAX_NICK, topN: TOP_N,
  cleanNickname, getNickname, setNickname,
  subscribe, submit, getMine, flushQueue,
  pendingCount: () => parseQueue(localStorage.getItem(LS_QUEUE)).length,
  userId: () => ensureReady().then(S => S.uid),
};

if (available) {
  window.addEventListener('online', () => { flushQueue(); });
  if (parseQueue(localStorage.getItem(LS_QUEUE)).length && navigator.onLine) flushQueue();
  // The 'online' event is not reliable on every phone: also retry now and then while something is waiting
  setInterval(() => { if (navigator.onLine && parseQueue(localStorage.getItem(LS_QUEUE)).length) flushQueue(); }, 20000);
}
window.dispatchEvent(new CustomEvent('sudoku-online-ready'));
