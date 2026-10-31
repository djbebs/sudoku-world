// Unit tests for online-core.js (pure helpers). Run: npm run test:core
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  utcDateStr, boardId, isDailyBoard, categoryOf, scoreDocId, cleanNickname, compareScores, isBetter,
  validateSubmission, parseQueue, enqueue, MAX_NICK,
} from '../online-core.js';

const NOW = new Date('2026-10-31T23:30:00Z');
const ok = (over = {}) => ({ board: 'easy', time: 120, mistakes: 1, clues: 37, nickname: 'Alice', ...over });

test('UTC date does not depend on the local time zone', () => {
  assert.equal(utcDateStr(new Date('2026-10-31T23:59:59Z')), '2026-10-31');
  assert.equal(utcDateStr(new Date('2026-11-01T00:00:00Z')), '2026-11-01');
  assert.equal(utcDateStr(new Date('2026-10-31T23:30:00-05:00')), '2026-11-01');   // 04:30 UTC next day
});

test('board ids and document ids', () => {
  assert.equal(boardId(false, 'hard', '2026-10-31'), 'hard');
  assert.equal(boardId(true, 'hard', '2026-10-31'), 'daily-2026-10-31');
  assert.ok(isDailyBoard('daily-2026-10-31'));
  assert.ok(!isDailyBoard('daily-tomorrow') && !isDailyBoard('easy'));
  assert.equal(categoryOf('daily-2026-10-31'), 'daily');
  assert.equal(categoryOf('medium'), 'medium');
  assert.equal(scoreDocId('easy', 'u1'), 'easy_u1');          // one doc per player per board → no duplicates
});

test('nickname cleaning', () => {
  assert.equal(cleanNickname('  Bob  '), 'Bob');
  assert.equal(cleanNickname('<b>Eve</b>'), 'bEve/b');
  assert.equal(cleanNickname('a\u0000b\nc'), 'abc');
  assert.equal(cleanNickname('x'.repeat(40)).length, MAX_NICK);
  assert.equal(Array.from(cleanNickname('😀'.repeat(20))).length, MAX_NICK);   // code points, not UTF-16 units
  assert.equal(cleanNickname(null), '');
  assert.equal(cleanNickname('    '), '');
});

test('leaderboard ordering: time, then mistakes, then earliest', () => {
  const rows = [
    { n: 'c', time: 100, mistakes: 1, tsMillis: 1 },
    { n: 'a', time: 90,  mistakes: 2, tsMillis: 9 },
    { n: 'b', time: 100, mistakes: 0, tsMillis: 5 },
    { n: 'd', time: 100, mistakes: 0, tsMillis: 2 },
  ];
  assert.deepEqual(rows.sort(compareScores).map(r => r.n), ['a', 'd', 'b', 'c']);
});

test('personal best: only strictly better results replace the stored one', () => {
  const prev = { time: 100, mistakes: 1 };
  assert.ok(isBetter({ time: 99, mistakes: 2 }, prev));
  assert.ok(isBetter({ time: 100, mistakes: 0 }, prev));
  assert.ok(!isBetter({ time: 100, mistakes: 1 }, prev));
  assert.ok(!isBetter({ time: 101, mistakes: 0 }, prev));
});

test('validateSubmission accepts honest results', () => {
  assert.equal(validateSubmission(ok(), NOW), null);
  assert.equal(validateSubmission(ok({ board: 'hard', time: 900, clues: 25 }), NOW), null);
  assert.equal(validateSubmission(ok({ board: 'daily-2026-10-31', clues: 29, time: 300 }), NOW), null);
  assert.equal(validateSubmission(ok({ board: 'daily-2026-10-30', clues: 29, time: 300 }), NOW), null);   // finished just after midnight UTC
});

test('validateSubmission rejects bad results', () => {
  assert.equal(validateSubmission(null, NOW), 'invalid');
  assert.equal(validateSubmission(ok({ board: 'insane' }), NOW), 'board');
  assert.equal(validateSubmission(ok({ board: 'daily-2026-11-01', clues: 29 }), NOW), 'date');   // tomorrow
  assert.equal(validateSubmission(ok({ board: 'daily-2026-10-28', clues: 29 }), NOW), 'date');   // too old
  assert.equal(validateSubmission(ok({ time: 29 }), NOW), 'time');                               // below the easy floor
  assert.equal(validateSubmission(ok({ time: 21601 }), NOW), 'time');
  assert.equal(validateSubmission(ok({ time: 60.5 }), NOW), 'time');
  assert.equal(validateSubmission(ok({ mistakes: 3 }), NOW), 'mistakes');
  assert.equal(validateSubmission(ok({ mistakes: -1 }), NOW), 'mistakes');
  assert.equal(validateSubmission(ok({ clues: 20 }), NOW), 'clues');
  assert.equal(validateSubmission(ok({ nickname: '' }), NOW), 'nickname');
  assert.equal(validateSubmission(ok({ nickname: ' padded ' }), NOW), 'nickname');
});

test('offline queue keeps one (the best) entry per board and survives bad JSON', () => {
  assert.deepEqual(parseQueue('not json'), []);
  assert.deepEqual(parseQueue('{"a":1}'), []);
  let q = [];
  q = enqueue(q, ok({ time: 200 }));
  q = enqueue(q, ok({ time: 150 }));                 // better → replaces
  q = enqueue(q, ok({ time: 180 }));                 // worse → ignored
  q = enqueue(q, ok({ board: 'hard', time: 400, clues: 25 }));
  assert.equal(q.length, 2);
  assert.equal(q.find(x => x.board === 'easy').time, 150);
  for (let i = 0; i < 30; i++) q = enqueue(q, ok({ board: 'daily-2026-10-' + String(i + 1).padStart(2, '0'), clues: 29 }));
  assert.ok(q.length <= 10);
});
