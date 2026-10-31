// online-core.js — pure helpers for the worldwide leaderboard.
// No Firebase, no DOM: imported by online.js in the browser and by the Node tests (tests/core.test.mjs).
// The limits below MIRROR firestore.rules — change both together.

export const TOP_N = 20;            // rows shown per leaderboard
export const MAX_NICK = 14;
export const DIFFICULTIES = ['easy', 'medium', 'hard'];

export const MAX_TIME = 21600;                                     // 6 h, in seconds
export const MIN_TIME = { easy: 30, medium: 45, hard: 60, daily: 45 };   // below this a solve is not plausible
// Clue counts the generator really produces (measured): easy 37, medium/daily 29, hard 23-27
export const CLUE_RANGE = { easy: [37, 41], medium: [29, 33], hard: [23, 30], daily: [29, 33] };

const DAILY_RE = /^daily-\d{4}-\d{2}-\d{2}$/;
const QUEUE_MAX = 10;

// "YYYY-MM-DD" in UTC, so every device gets the same Daily Challenge on the same date
export function utcDateStr(d = new Date()) { return d.toISOString().slice(0, 10); }

export function isDailyBoard(board) { return DAILY_RE.test(board); }
export function categoryOf(board) { return isDailyBoard(board) ? 'daily' : board; }
export function boardId(daily, difficulty, dailyDate) { return daily ? 'daily-' + dailyDate : difficulty; }
// One document per player per leaderboard: this id is what prevents duplicate entries
export function scoreDocId(board, uid) { return board + '_' + uid; }

// Trims, removes control characters and < >, keeps at most MAX_NICK characters (code points, so emoji count as 1)
export function cleanNickname(raw) {
  const stripped = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  return Array.from(stripped).slice(0, MAX_NICK).join('').trim();
}

// Fastest time first; equal time → fewer mistakes; then the earlier submission
export function compareScores(a, b) {
  return a.time - b.time || a.mistakes - b.mistakes || (a.tsMillis || 0) - (b.tsMillis || 0);
}

// Is `next` an improvement over the stored `prev`? (same rule as firestore.rules)
export function isBetter(next, prev) {
  return next.time < prev.time || (next.time === prev.time && next.mistakes < prev.mistakes);
}

// Returns an error code, or null when the submission is acceptable. `now` lets tests fix the date.
export function validateSubmission(s, now = new Date()) {
  if (!s || typeof s !== 'object') return 'invalid';
  const { board, time, mistakes, clues, nickname } = s;
  const cat = DIFFICULTIES.includes(board) ? board : isDailyBoard(board) ? 'daily' : null;
  if (!cat) return 'board';
  if (cat === 'daily') {
    const today = utcDateStr(now);
    const yesterday = utcDateStr(new Date(now.getTime() - 86400000));
    if (board !== 'daily-' + today && board !== 'daily-' + yesterday) return 'date';
  }
  if (!Number.isInteger(time) || time < MIN_TIME[cat] || time > MAX_TIME) return 'time';
  if (!Number.isInteger(mistakes) || mistakes < 0 || mistakes > 2) return 'mistakes';   // 3 mistakes = game over
  if (!Number.isInteger(clues) || clues < CLUE_RANGE[cat][0] || clues > CLUE_RANGE[cat][1]) return 'clues';
  if (!nickname || cleanNickname(nickname) !== nickname) return 'nickname';
  return null;
}

// ── offline queue (scores earned while offline, sent later) ──
export function parseQueue(json) {
  try {
    const q = JSON.parse(json);
    return Array.isArray(q) ? q.filter(x => x && typeof x.board === 'string' && Number.isInteger(x.time)).slice(0, QUEUE_MAX) : [];
  } catch (_) { return []; }
}

// One pending entry per board: keep the better one
export function enqueue(queue, item) {
  const out = queue.filter(x => x.board !== item.board || isBetter(x, item));
  if (!out.some(x => x.board === item.board)) out.push(item);
  return out.slice(-QUEUE_MAX);
}
