// Firestore Security Rules tests (run against the local Firestore emulator). Run: npm run test:rules
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where, orderBy, limit, serverTimestamp, Timestamp } from 'firebase/firestore';

const rules = readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8');
let env;

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-sudoku', firestore: { rules, host: '127.0.0.1', port: 8080 } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const utc = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
const hourAgo = () => Timestamp.fromMillis(Date.now() - 3600_000);
const dbOf = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const idOf = (board, uid) => board + '_' + uid;

const score = (uid, over = {}) => ({
  uid, board: 'easy', nickname: 'Alice', time: 120, mistakes: 1, clues: 37, ts: serverTimestamp(), ...over,
});
const put = (db, uid, over = {}) => {
  const d = score(uid, over);
  return setDoc(doc(db, 'scores', idOf(d.board, uid)), d);
};
// Seeds a score as if it had been written long ago (bypasses rules)
const seed = (uid, over = {}) => env.withSecurityRulesDisabled(async ctx => {
  const d = score(uid, { ts: hourAgo(), ...over });
  await setDoc(doc(ctx.firestore(), 'scores', idOf(d.board, uid)), d);
});

// ── reading ────────────────────────────────────────────────────────────────
test('anyone, even signed out, can read a leaderboard query', async () => {
  await seed('alice');
  await assertSucceeds(getDocs(query(collection(anon(), 'scores'), where('board', '==', 'easy'), orderBy('time'), limit(20))));
  await assertSucceeds(getDoc(doc(anon(), 'scores', 'easy_alice')));
});

test('unknown collections are closed', async () => {
  await assertFails(getDoc(doc(dbOf('alice'), 'secrets', 'x')));
  await assertFails(setDoc(doc(dbOf('alice'), 'secrets', 'x'), { a: 1 }));
});

// ── creating a score ───────────────────────────────────────────────────────
test('signed-out users cannot write', async () => {
  await assertFails(put(anon(), 'alice'));
});

test('a valid result is accepted on every leaderboard', async () => {
  const db = dbOf('alice');
  await assertSucceeds(put(db, 'alice', { board: 'easy', clues: 37 }));
  await assertSucceeds(put(db, 'alice', { board: 'medium', clues: 29, time: 200 }));
  await assertSucceeds(put(db, 'alice', { board: 'hard', clues: 24, time: 400 }));
  await assertSucceeds(put(db, 'alice', { board: 'daily-' + utc(0), clues: 29, time: 300 }));
  await assertSucceeds(put(db, 'alice', { board: 'daily-' + utc(-1), clues: 29, time: 300 }));   // finished just after UTC midnight
});

test('a player cannot write for someone else, or into someone else\'s document', async () => {
  await assertFails(put(dbOf('mallory'), 'alice'));                                        // uid field is alice, auth is mallory
  await assertFails(setDoc(doc(dbOf('mallory'), 'scores', 'easy_alice'), score('mallory')));   // id belongs to alice
});

test('document id must be <board>_<uid> (this is what prevents duplicates)', async () => {
  const db = dbOf('alice');
  await assertFails(setDoc(doc(db, 'scores', 'random-id'), score('alice')));
  await assertFails(setDoc(doc(db, 'scores', 'medium_alice'), score('alice', { board: 'easy' })));
});

test('shape: extra or missing fields are rejected', async () => {
  const db = dbOf('alice');
  await assertFails(setDoc(doc(db, 'scores', 'easy_alice'), { ...score('alice'), admin: true }));
  const { clues, ...noClues } = score('alice');
  await assertFails(setDoc(doc(db, 'scores', 'easy_alice'), noClues));
});

test('the timestamp must be the server\'s, not the device clock', async () => {
  const db = dbOf('alice');
  await assertFails(put(db, 'alice', { ts: Timestamp.fromMillis(Date.now() - 1000) }));
  await assertFails(put(db, 'alice', { ts: Date.now() }));
});

test('nicknames: 1-14 characters, trimmed, no control characters or < >', async () => {
  const db = dbOf('alice');
  await assertSucceeds(put(db, 'alice', { board: 'easy', nickname: 'A' }));
  await env.clearFirestore();
  await assertSucceeds(put(db, 'alice', { nickname: 'Élodie-Zoë 99' }));
  await env.clearFirestore();
  await assertSucceeds(put(db, 'alice', { nickname: '😀'.repeat(14) }));                      // emoji count as characters
  for (const bad of ['', ' ', ' Bob', 'Bob ', 'x'.repeat(15), '😀'.repeat(15), '<b>', 'a\tb', 'a\u0000b', 42, null]) {
    await assertFails(put(db, 'alice', { nickname: bad }));
  }
});

test('bounds: time, mistakes, clues', async () => {
  const db = dbOf('alice');
  const bad = [
    { time: 29 }, { time: 21601 }, { time: 60.5 }, { time: '60' }, { time: -5 },     // easy floor is 30 s
    { mistakes: 3 }, { mistakes: -1 }, { mistakes: 0.5 },                               // 3 mistakes = game over
    { clues: 36 }, { clues: 42 }, { clues: '37' },                                      // easy has 37-41 clues
    { board: 'medium', time: 44, clues: 29 }, { board: 'hard', time: 59, clues: 24 },   // per-difficulty floors
    { board: 'hard', clues: 31 },
  ];
  for (const over of bad) await assertFails(put(db, 'alice', over));
  await assertSucceeds(put(db, 'alice', { time: 30, mistakes: 0 }));                  // exactly at the floor is fine
});

test('boards: only the 3 difficulties and today\'s/yesterday\'s UTC Daily', async () => {
  const db = dbOf('alice');
  for (const board of ['insane', 'daily', 'daily-' + utc(1), 'daily-' + utc(-2), 'daily-2020-01-01', 'daily-2026-1-1', '', 7]) {
    await assertFails(put(db, 'alice', { board, clues: 29, time: 300 }));
  }
});

// ── updating: personal best only ───────────────────────────────────────────
test('a second create of the same board is only allowed as a real improvement', async () => {
  await seed('alice', { time: 120, mistakes: 1 });
  const db = dbOf('alice');
  await assertFails(put(db, 'alice', { time: 130 }));                  // worse
  await assertFails(put(db, 'alice', { time: 120, mistakes: 1 }));     // identical
  await assertFails(put(db, 'alice', { time: 120, mistakes: 2 }));     // same time, more mistakes
  await assertSucceeds(put(db, 'alice', { time: 119 }));               // faster
});

test('same time with fewer mistakes counts as an improvement', async () => {
  await seed('alice', { time: 120, mistakes: 2 });
  await assertSucceeds(put(dbOf('alice'), 'alice', { time: 120, mistakes: 1 }));
});

test('rate limit: no update within 10 s of the previous one', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'scores', 'easy_alice'), score('alice', { ts: Timestamp.fromMillis(Date.now() - 2000) }));
  });
  await assertFails(put(dbOf('alice'), 'alice', { time: 100 }));       // better, but only 2 s after the last write
});

test('uid and board cannot be changed by an update', async () => {
  await seed('alice');
  const db = dbOf('alice');
  await assertFails(updateDoc(doc(db, 'scores', 'easy_alice'), { uid: 'mallory', time: 100, ts: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'scores', 'easy_alice'), { board: 'hard', clues: 24, time: 100, ts: serverTimestamp() }));
});

test('nobody else can update or delete a player\'s score', async () => {
  await seed('alice');
  const mallory = dbOf('mallory');
  await assertFails(updateDoc(doc(mallory, 'scores', 'easy_alice'), { time: 30, ts: serverTimestamp() }));
  await assertFails(updateDoc(doc(mallory, 'scores', 'easy_alice'), { nickname: 'Hacked' }));
  await assertFails(deleteDoc(doc(mallory, 'scores', 'easy_alice')));
  await assertFails(deleteDoc(doc(dbOf('alice'), 'scores', 'easy_alice')));      // not even the owner
});

test('an old Daily board cannot be improved retroactively', async () => {
  const board = 'daily-' + utc(-3);
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'scores', idOf(board, 'alice')), score('alice', { board, clues: 29, time: 300, ts: hourAgo() }));
  });
  await assertFails(put(dbOf('alice'), 'alice', { board, clues: 29, time: 100 }));
});

// ── renaming ───────────────────────────────────────────────────────────────
test('the owner can rename an entry (nickname only), but nothing else rides along', async () => {
  await seed('alice', { time: 120 });
  const db = dbOf('alice');
  await assertSucceeds(updateDoc(doc(db, 'scores', 'easy_alice'), { nickname: 'Alicia' }));
  await assertFails(updateDoc(doc(db, 'scores', 'easy_alice'), { nickname: 'Alicia', time: 31 }));       // sneaking a time in
  await assertFails(updateDoc(doc(db, 'scores', 'easy_alice'), { nickname: '<script>' }));
  await assertFails(updateDoc(doc(db, 'scores', 'easy_alice'), { nickname: 'x'.repeat(15) }));
});

// ── players ────────────────────────────────────────────────────────────────
test('players/{uid}: private to its owner', async () => {
  const db = dbOf('alice');
  await assertSucceeds(setDoc(doc(db, 'players', 'alice'), { nickname: 'Alice', updatedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(db, 'players', 'alice')));
  await assertFails(getDoc(doc(dbOf('mallory'), 'players', 'alice')));
  await assertFails(getDoc(doc(anon(), 'players', 'alice')));
  await assertFails(getDocs(collection(db, 'players')));
  await assertFails(setDoc(doc(dbOf('mallory'), 'players', 'alice'), { nickname: 'Evil', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db, 'players', 'alice')));
});

test('players/{uid}: shape and rate limit', async () => {
  const db = dbOf('alice');
  await assertFails(setDoc(doc(db, 'players', 'alice'), { nickname: 'Alice', updatedAt: serverTimestamp(), role: 'admin' }));
  await assertFails(setDoc(doc(db, 'players', 'alice'), { nickname: '', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'players', 'alice'), { nickname: 'Alice', updatedAt: Timestamp.now() }));      // client clock
  await assertSucceeds(setDoc(doc(db, 'players', 'alice'), { nickname: 'Alice', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'players', 'alice'), { nickname: 'Alice2', updatedAt: serverTimestamp() }));   // < 3 s later
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'players', 'alice'), { nickname: 'Alice', updatedAt: hourAgo() });
  });
  await assertSucceeds(setDoc(doc(db, 'players', 'alice'), { nickname: 'Alice2', updatedAt: serverTimestamp() }));
});
