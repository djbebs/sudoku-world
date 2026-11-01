// End-to-end test of the worldwide leaderboard: two real Chrome browsers (separate profiles = two
// anonymous identities) play Sudoku against the local Firebase emulators. Run: npm run test:e2e
//
// Needs Google Chrome (set CHROME_PATH if it is not in a standard place) and internet access
// (the Firebase SDK is loaded from gstatic.com, like in production). Nothing touches a real Firebase project.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 5173;
// E2E_BASE_PATH=/sudoku-world/ mimics GitHub Pages project hosting: files exist ONLY under that prefix
const SUB = (process.env.E2E_BASE_PATH || '/').replace(/^\/?/, '/').replace(/\/?$/, '/');
const BASE = `http://localhost:${PORT}${SUB}sudoku.html?emulator=1`;
const FS_REST = 'http://127.0.0.1:8080';
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome not found: set CHROME_PATH'); process.exit(2); }

const utcToday = new Date().toISOString().slice(0, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── tiny static server for the project folder ───────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!url.startsWith(SUB)) { res.writeHead(404).end('nope'); return; }
  let p = path.join(ROOT, url.slice(SUB.length));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');    // like GitHub Pages
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404).end('nope'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(PORT, r));

// ── Firestore emulator helpers (server-side truth, bypassing rules with the "owner" token) ─
const authz = { Authorization: 'Bearer owner' };
const val = f => f.stringValue ?? (f.integerValue !== undefined ? Number(f.integerValue) : f.timestampValue ?? f);
async function serverScores() {
  const r = await fetch(`${FS_REST}/v1/projects/demo-sudoku/databases/(default)/documents/scores?pageSize=300`, { headers: authz });
  const j = await r.json();
  return (j.documents || []).map(d => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, val(v)])) }));
}
await fetch(`${FS_REST}/emulator/v1/projects/demo-sudoku/databases/(default)/documents`, { method: 'DELETE' });

// ── browsers: two separate profiles = two players ──────────────────────────
const launch = label => puppeteer.launch({
  executablePath: CHROME, headless: true, args: ['--no-sandbox'],
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), `sudoku-e2e-${label}-`)),
});
const browserA = await launch('a');
const browserB = await launch('b');
const problems = [];
async function newPage(browser, who, viewport) {
  const page = await browser.newPage();
  if (viewport) await page.setViewport(viewport);
  page.on('pageerror', e => problems.push(`[${who}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|offline/i.test(m.text())) problems.push(`[${who}] console.error: ${m.text()}`); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  return page;
}

// ── game helpers (the game's top-level `let`s are reachable from page.evaluate) ──
const inGame = page => page.$eval('body', b => !b.classList.contains('home-open'));
async function startMode(page, mode) {
  if (!(await inGame(page))) await page.click('#home-play');          // from the calendar screen: starts today's Daily
  if (mode === 'daily') await page.click('#daily-btn');
  else await page.click(`.diff-btn[data-diff="${mode}"]`);
}
// Fills the grid with the solution and finishes the run exactly like a real win would
async function winGame(page, { mode, time, mistakes = 0, name }) {
  await startMode(page, mode);
  await page.evaluate((secs, errs) => {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) board[r][c] = solution[r][c];
    timerSecs = secs; mistakes = errs;
    doWin();
  }, time, mistakes);
  await page.waitForSelector('#ov-form.on', { visible: true });
  await page.$eval('#ov-name', (el, v) => { el.value = v; }, name);
  await page.click('#ov-form button[type="submit"]');
  await page.waitForFunction(() => { const t = document.getElementById('ov-online').textContent; return t && !/Sending|Envoi/.test(t); }, { timeout: 45000 });
  return page.$eval('#ov-online', el => el.textContent);
}
const readRows = page => page.$$eval('#ol-list .sb-row', rows => rows.map(li => ({
  rank: li.querySelector('.sb-rank').textContent,
  name: li.querySelector('.sb-name').textContent,
  time: li.querySelector('.sb-time').textContent,
  hearts: li.querySelectorAll('.sb-heart:not(.lost)').length,
  me: li.classList.contains('me'),
})));
// Rows are rebuilt on every live update: aim at the position of the n-th row that is fully visible in the card
// (clear of the pinned footer) instead of holding on to a node that may be replaced
const rowCenter = (page, nth) => page.evaluate(n => {
  const box = document.getElementById('lb-scroll').getBoundingClientRect();
  const footTop = document.getElementById('ol-foot').getBoundingClientRect().top;
  const seen = [...document.querySelectorAll('#ol-list .sb-row')].map(r => r.getBoundingClientRect()).filter(b => b.top >= box.top && b.bottom <= Math.min(box.bottom, footTop));
  const b = seen[n - 1];
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, nth);
const clickRow = async (page, nth) => { const p = await rowCenter(page, nth); await page.mouse.click(p.x, p.y); };
const tapRow = async (page, nth) => { const p = await rowCenter(page, nth); await page.touchscreen.tap(p.x, p.y); };
const top20 = rows => rows.filter(r => !r.rank.startsWith('#'));   // without the player's own "#N" row shown below the "⋮"
async function waitRows(page, pred, what, timeout = 20000) {
  const t0 = Date.now(); let rows = [];
  while (Date.now() - t0 < timeout) { rows = await readRows(page); if (pred(rows)) return rows; await sleep(250); }
  throw new Error(`timeout waiting for ${what}; rows were ${JSON.stringify(rows)}`);
}
async function setNickname(page, nick, viaButton = '#home-nick') {
  await page.click(viaButton);
  await page.waitForSelector('#nick-modal:not([hidden])');
  await page.$eval('#nick-input', (el, v) => { el.value = v; }, nick);
  await page.click('#nick-form button[type="submit"]');
  await page.waitForSelector('#nick-modal', { hidden: true });
}

// ── leaderboard popup helpers (the ranking lives in a popup opened by the 🏆 button, top right) ──
const lbIsOpen = page => page.$eval('#lb-modal', el => !el.hidden);
async function openLb(page, level, tap = false) {
  await (tap ? page.tap('#lb-open') : page.click('#lb-open'));
  await page.waitForSelector('#lb-modal:not([hidden])');
  if (level) await (tap ? page.tap(`.lb-lvl[data-level="${level}"]`) : page.click(`.lb-lvl[data-level="${level}"]`));
}
async function closeLb(page) {
  await page.click('#lb-close');
  await page.waitForSelector('#lb-modal', { hidden: true });
}
// Writes scores straight into the emulator (bypassing the rules) to get a full top 20 and more
const toFs = v => typeof v === 'number' ? { integerValue: String(v) } : v instanceof Date ? { timestampValue: v.toISOString() } : { stringValue: v };
async function seedScore(board, i, time, mistakes = 0) {
  const fields = Object.fromEntries(Object.entries({ uid: 'seed' + i, board, nickname: 'Seed' + i, time, mistakes, clues: 25, ts: new Date(Date.now() - (1000 - i) * 1000) }).map(([k, v]) => [k, toFs(v)]));
  const r = await fetch(`${FS_REST}/v1/projects/demo-sudoku/databases/(default)/documents/scores/${board}_seed${i}`, { method: 'PATCH', headers: { ...authz, 'content-type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('seed failed: ' + await r.text());
}

// ── runner ─────────────────────────────────────────────────────────────────
let failed = 0, passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) {
    failed++;
    await Promise.all([A, B, D].filter(Boolean).map(p => p.evaluate(() => { if (typeof lbModal !== 'undefined' && !lbModal.hidden) closeLb(); }).catch(() => {})));
    const where = String(e.stack || '').split('\n').find(l => /e2e\.mjs:\d+/.test(l)) || '';
    console.log('  ✘', name, '\n     ', String(e.message).split('\n').join('\n      '), where ? '\n      @' + where.trim() : '');
  }
}

console.log('\nEnd-to-end: two players, two browsers\n');
let A, B, D, uidA, uidB, tFirstWrite;   // D: the fresh desktop player of the popup tests

await step('both browsers load the game; the online leaderboard activates (tabs appear)', async () => {
  A = await newPage(browserA, 'A');
  B = await newPage(browserB, 'B');
  for (const p of [A, B]) assert.equal(await p.$eval('#sb-tabs', el => !el.hidden), true);
});

await step('first launch asks for a nickname; each player picks a different one (remembered locally)', async () => {
  for (const [p, nick] of [[A, 'Alice'], [B, 'Bob']]) {
    await p.waitForSelector('#nick-modal:not([hidden])');             // first-launch prompt
    await p.$eval('#nick-input', (el, v) => { el.value = v; }, nick);
    await p.click('#nick-form button[type="submit"]');
    await p.waitForSelector('#nick-modal', { hidden: true });
    assert.equal(await p.evaluate(() => localStorage.getItem('sudoku-player-name')), nick);
  }
  uidA = await A.evaluate(() => SudokuOnline.userId());
  uidB = await B.evaluate(() => SudokuOnline.userId());
  assert.ok(uidA && uidB && uidA !== uidB, 'two browsers must have two different anonymous identities');
});

await step('Daily Challenge: both players get the very same puzzle (UTC date)', async () => {
  await A.click('#home-play'); await B.click('#home-play');
  const [pa, pb] = await Promise.all([A, B].map(p => p.evaluate(() => JSON.stringify({ d: dailyDate, p: puzzle }))));
  assert.equal(pa, pb);
  assert.equal(JSON.parse(pa).d, utcToday);
});

await step('Alice wins the Daily → worldwide #1; Bob wins slower → #2', async () => {
  const ta = await winGame(A, { mode: 'daily', time: 100, mistakes: 0, name: 'Alice' });
  tFirstWrite = Date.now();
  assert.match(ta, /#1\b/, ta);
  const tb = await winGame(B, { mode: 'daily', time: 120, mistakes: 1, name: 'Bob' });
  assert.match(tb, /#2\b/, tb);
});

await step('both players see the same ranking, own row highlighted', async () => {
  for (const [p, me] of [[A, 'Alice'], [B, 'Bob']]) {
    await p.click('#ov-newgame').catch(() => {});                     // dismiss the win screen
    await startMode(p, 'daily');
    await openLb(p);                                                  // opens on the ranking of the game being played: today's Daily
    const rows = await waitRows(p, r => r.length === 2, 'two daily rows');
    assert.deepEqual(rows.map(r => [r.rank, r.name, r.time, r.hearts]), [['1', 'Alice', '1:40', 3], ['2', 'Bob', '2:00', 2]]);
    assert.deepEqual(rows.filter(r => r.me).map(r => r.name), [me]);
    await closeLb(p);
  }
});

await step('the list updates by itself when another player submits (no reload)', async () => {
  await startMode(A, 'daily');
  await openLb(A);
  const before = (await waitRows(A, r => r.length === 2, 'the two daily rows')).length;
  await sleep(500);
  // a third identity (fresh incognito-like context) posts a faster time
  const ctx = await browserB.createBrowserContext();
  const C = await ctx.newPage();
  await C.goto(BASE, { waitUntil: 'load' });
  await C.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  await C.waitForSelector('#nick-modal:not([hidden])');
  await C.$eval('#nick-input', (el) => { el.value = 'Carol'; });
  await C.click('#nick-form button[type="submit"]');
  await winGame(C, { mode: 'daily', time: 80, mistakes: 0, name: 'Carol' });
  const rows = await waitRows(A, r => r.length === before + 1, 'Carol to appear on Alice\'s screen');
  assert.equal(rows[0].name, 'Carol');                                // fastest first
  assert.deepEqual(rows.map(r => r.rank), ['1', '2', '3']);
  await ctx.close();
  await closeLb(A);
});

await step('score persistence: after a reload the same identity, nickname and ranking are back', async () => {
  await A.reload({ waitUntil: 'load' });
  await A.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  assert.equal(await A.evaluate(() => SudokuOnline.userId()), uidA);
  assert.equal(await A.evaluate(() => SudokuOnline.getNickname()), 'Alice');
  await A.click('#home-play');
  await A.click('#daily-btn');
  await openLb(A);
  const rows = await waitRows(A, r => r.length === 3, 'three daily rows after reload');
  assert.deepEqual(rows.map(r => r.name), ['Carol', 'Alice', 'Bob']);
  await closeLb(A);
});

await step('duplicate prevention: a worse repeat run does not create or change an entry', async () => {
  const t = await winGame(A, { mode: 'daily', time: 150, mistakes: 0, name: 'Alice' });
  assert.match(t, /Not an online personal best/, t);
  assert.equal(await A.$eval('#ov-saved', el => el.classList.contains('on')), false);   // no "you are #N" without a worldwide rank
  const mine = (await serverScores()).filter(s => s.uid === uidA && s.board === 'daily-' + utcToday);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].time, 100);
});

await step('a better repeat run replaces the personal best (still one entry)', async () => {
  const wait = 10500 - (Date.now() - tFirstWrite);                    // rules: at most one update per 10 s
  if (wait > 0) await sleep(wait);
  const t = await winGame(A, { mode: 'daily', time: 90, mistakes: 0, name: 'Alice' });
  assert.match(t, /Worldwide: #2/, t);                                // Carol (80 s) is still ahead
  // The headline must use the WORLDWIDE rank (#2), not the rank on this device (Alice's 90 s is her best local run: #1)
  const localTop = await A.evaluate(() => loadScores(scoreKey()).sort(cmpScore)[0].time);
  assert.equal(localTop, 90);
  const headline = await A.$eval('#ov-saved', el => el.textContent);
  assert.match(headline, /you are #2!/, headline);
  assert.doesNotMatch(headline, /#1\b/, headline);
  const mine =(await serverScores()).filter(s => s.uid === uidA && s.board === 'daily-' + utcToday);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].time, 90);
});

await step('sorting: equal times are ordered by mistakes; hearts show the mistakes', async () => {
  await winGame(A, { mode: 'easy', time: 60, mistakes: 0, name: 'Alice' });
  await winGame(B, { mode: 'easy', time: 60, mistakes: 2, name: 'Bob' });
  await startMode(A, 'easy');
  await openLb(A);
  const rows = await waitRows(A, r => r.length === 2, 'two easy rows');
  assert.deepEqual(rows.map(r => [r.name, r.time, r.hearts]), [['Alice', '1:00', 3], ['Bob', '1:00', 1]]);
  await closeLb(A);
});

await step('a nickname change renames existing entries everywhere, live', async () => {
  await openLb(B);                                                    // Bob watches the Easy ranking (his game is on Easy)
  await openLb(A);
  await setNickname(A, 'Alicia', '#ol-nick');                         // the nickname dialog opens on top of the popup
  assert.equal(await lbIsOpen(A), true);
  const rows = await waitRows(B, r => r.some(x => x.name === 'Alicia'), 'Bob to see the new name');
  assert.ok(!rows.some(r => r.name === 'Alice'));
  const mine = (await serverScores()).filter(s => s.uid === uidA);
  assert.ok(mine.length >= 2 && mine.every(s => s.nickname === 'Alicia'), JSON.stringify(mine));
  await closeLb(A); await closeLb(B);
});

await step('offline: the game stays playable, the result is queued, then sent when back online', async () => {
  await startMode(B, 'medium');
  await openLb(B);
  await B.setOfflineMode(true);
  await B.waitForFunction(() => /offline|hors ligne/i.test(document.getElementById('ol-status').textContent), { timeout: 15000 });
  assert.equal(await B.$eval('#ol-status', el => el.classList.contains('warn')), true);
  await closeLb(B);
  const t = await winGame(B, { mode: 'medium', time: 200, mistakes: 0, name: 'Bob' });
  assert.match(t, /will be sent automatically later/, t);
  assert.equal(await B.evaluate(() => SudokuOnline.pendingCount()), 1);
  // still playable offline: start another game and place a number
  await B.click('.diff-btn[data-diff="easy"]');
  await B.evaluate(() => { const r = puzzle.findIndex(row => row.includes(0)); const c = puzzle[r].indexOf(0); onCellClick(r, c); onNumInput(solution[r][c]); });
  assert.ok(await B.evaluate(() => board.flat().some(Boolean)), 'a number could be placed while offline');
  await B.setOfflineMode(false);
  const t0 = Date.now(); let doc;
  while (Date.now() - t0 < 40000 && !doc) { doc = (await serverScores()).find(s => s.uid === uidB && s.board === 'medium'); if (!doc) await sleep(500); }
  assert.ok(doc, 'the queued medium score never reached Firestore');
  assert.equal(doc.time, 200);
  assert.equal(await B.evaluate(() => SudokuOnline.pendingCount()), 0);
});

await step('English and French interfaces', async () => {
  await A.click('#header .lang-toggle button[data-lang="fr"]');
  assert.equal(await A.$eval('#sb-tab-world', el => el.textContent), 'Monde');
  assert.equal(await A.$eval('#ol-refresh', el => el.textContent), 'Actualiser');
  assert.match(await A.$eval('#ol-nick', el => el.textContent), /^Pseudo/);
  assert.match(await A.$eval('#sb-mode', el => el.textContent), /Facile/);
  await A.click('#header .lang-toggle button[data-lang="en"]');
  assert.equal(await A.$eval('#sb-tab-world', el => el.textContent), 'Worldwide');
  assert.match(await A.$eval('#ol-nick', el => el.textContent), /^Playing as Alicia/);
});

await step('mobile layout (390×844, touch): the popup fits the screen, worldwide list inside', async () => {
  const M = await newPage(browserA, 'mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await M.tap('#home-play');
  await M.tap('#daily-btn');
  assert.equal(await lbIsOpen(M), false);
  const btn = await M.$eval('#lb-open', el => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, w: b.width, vw: innerWidth }; });
  assert.ok(btn.w > 0 && btn.l >= 0 && btn.r <= btn.vw, `🏆 button not fully visible on the phone: ${JSON.stringify(btn)}`);
  await openLb(M, null, true);
  await waitRows(M, r => r.length >= 3, 'daily rows on mobile');
  const m = await M.evaluate(() => {
    const c = document.getElementById('scoreboard').getBoundingClientRect();
    return {
      stack: document.body.classList.contains('stack'),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      rowsRight: Math.max(...[...document.querySelectorAll('#ol-list .sb-row')].map(r => r.getBoundingClientRect().right)),
      card: { l: c.left, r: c.right, t: c.top, b: c.bottom },
      pillsOverflow: document.getElementById('sb-levels').scrollWidth - document.getElementById('sb-levels').clientWidth,
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  assert.equal(m.stack, true);
  assert.ok(m.overflowX <= 1, `horizontal overflow ${m.overflowX}px`);
  assert.ok(m.rowsRight <= m.vw, `rows overflow the viewport (${m.rowsRight} > ${m.vw})`);
  assert.ok(m.card.l >= 0 && m.card.r <= m.vw && m.card.t >= 0 && m.card.b <= m.vh, `popup outside the screen: ${JSON.stringify(m.card)}`);
  assert.ok(m.pillsOverflow <= 0, `the four difficulty pills overflow by ${m.pillsOverflow}px`);
  const shot = process.env.E2E_SHOT_DIR;
  if (shot) await M.screenshot({ path: path.join(shot, 'mobile-worldwide.png') });
  await M.close();
});

await step('Firebase unreachable (SDK blocked while online): clear message, game playable, result queued', async () => {
  const ctx = await browserA.createBrowserContext();               // isolated storage: does not disturb Alice's real queue
  const P = await ctx.newPage();
  await P.setRequestInterception(true);
  P.on('request', r => (/gstatic\.com/.test(r.url()) ? r.abort() : r.continue()));
  await P.goto(BASE, { waitUntil: 'load' });
  await P.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  await P.waitForSelector('#nick-modal:not([hidden])');
  await P.click('#nick-cancel');
  await P.click('#home-play');
  await openLb(P);
  await P.waitForFunction(() => /unavailable/i.test(document.getElementById('ol-status').textContent), { timeout: 15000 });
  assert.equal(await P.$eval('#ol-status', el => el.classList.contains('warn')), true);
  await closeLb(P);
  const t = await winGame(P, { mode: 'easy', time: 61, mistakes: 0, name: 'Dana' });
  assert.match(t, /will be sent automatically later/, t);
  assert.equal(await P.evaluate(() => SudokuOnline.pendingCount()), 1);
  assert.equal(await P.$eval('#ov-saved', el => el.classList.contains('on')), false);   // no worldwide rank yet → no "you are #N"
  assert.equal(await P.evaluate(() => loadScores(scoreKey()).length), 1);              // the local scoreboard still records it
  await ctx.close();
});

await step('without configuration the leaderboard stays off and the game is unchanged', async () => {
  const P = await browserA.newPage();
  // no ?emulator, and firebase-config.js is swapped for the untouched placeholder version (the real file holds the live project)
  await P.setRequestInterception(true);
  P.on('request', r => (/\/firebase-config\.js$/.test(r.url())
    ? r.respond({ status: 200, contentType: 'text/javascript', body:
        "export const firebaseConfig = { apiKey: 'YOUR_API_KEY', authDomain: 'YOUR_PROJECT_ID.firebaseapp.com', projectId: 'YOUR_PROJECT_ID', appId: 'YOUR_APP_ID' }; export const appCheckSiteKey = '';" })
    : r.continue()));
  await P.goto(`http://localhost:${PORT}${SUB}sudoku.html`, { waitUntil: 'load' });
  await P.waitForFunction(() => window.SudokuOnline);
  assert.equal(await P.evaluate(() => SudokuOnline.available), false);
  assert.equal(await P.$eval('#sb-tabs', el => el.hidden), true);
  assert.equal(await P.$eval('#sb-list', el => el.hidden), false);                 // local scoreboard shown as before
  await P.click('#home-play');
  await P.evaluate(() => { for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) board[r][c] = solution[r][c]; timerSecs = 100; doWin(); });
  await P.waitForSelector('#ov-form.on', { visible: true });
  await P.$eval('#ov-name', el => { el.value = 'Solo'; });
  await P.click('#ov-form button[type="submit"]');
  assert.match(await P.$eval('#ov-saved', el => el.textContent), /Saved/);
  assert.equal(await P.$eval('#ov-online', el => el.textContent), '');
  // the popup still works: local ranking only (no Local | Worldwide tabs), the score is listed and highlighted
  await P.click('#ov-scores');                                      // the win screen's shortcut opens the popup on the ranking just played
  await P.waitForSelector('#lb-modal:not([hidden])');
  assert.equal(await P.$eval('#sb-tabs', el => el.hidden), true);
  assert.equal(await P.$eval('#sb-levels', el => el.hidden), false);
  // (this browser profile also holds Alice's earlier local scores: only the new one is highlighted)
  const local = await P.$$eval('#sb-list .sb-row', rows => rows.map(r => [r.querySelector('.sb-name').textContent, r.querySelector('.sb-time').textContent, r.classList.contains('me')]));
  assert.deepEqual(local.filter(r => r[2]), [['Solo', '1:40', true]]);
  assert.ok(local.length >= 1 && local.every(r => /^\d+:\d\d$/.test(r[1])));
  await P.close();
});

// ═══════════════════════════ leaderboard popup (🏆 button, top right) ═══════════════════════════
console.log('\nLeaderboard popup\n');
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const gameSnapshot = page => page.evaluate(() => ({
  difficulty, dailyMode, mistakes, puzzle: JSON.stringify(puzzle), board: JSON.stringify(board), timerSecs, over: gameOver,
  activeDiff: document.querySelector('.diff-btn.active')?.textContent, hearts: document.querySelectorAll('.heart.lost').length,
}));
for (let i = 1; i <= 22; i++) await seedScore('hard', i, 100 + i * 3, i % 3);   // 22 players already on the Hard ranking
await seedScore('daily-' + utcToday, 90, 500, 0);

await step('the 🏆 button is at the top right, visible, and the ranking is no longer on the page', async () => {
  const ctx = await browserB.createBrowserContext();
  D = await ctx.newPage();
  await D.setViewport(DESKTOP);
  D.on('pageerror', e => problems.push(`[D] pageerror: ${e.message}`));
  D.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|offline/i.test(m.text())) problems.push(`[D] console.error: ${m.text()}`); });
  await D.goto(BASE, { waitUntil: 'load' });
  await D.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  await D.waitForSelector('#nick-modal:not([hidden])');
  await D.click('#nick-cancel');
  await D.click('#home-play');
  const g = await D.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const btn = r('#lb-open'), head = r('#header');
    const side = document.querySelector('#layout #scoreboard');
    return { btnVisible: btn.width > 0 && btn.height > 0, btnRight: btn.right, headRight: head.right, btnBottom: btn.bottom, headTop: head.top, side: !!side, hidden: document.getElementById('lb-modal').hidden };
  });
  assert.ok(g.btnVisible);
  assert.ok(Math.abs(g.btnRight - g.headRight) <= 1, `button not aligned to the right edge of the game (${g.btnRight} vs ${g.headRight})`);
  assert.ok(g.btnBottom <= g.headTop + 1, 'button must sit above the game header');
  assert.equal(g.side, false, 'the permanent side ranking must be gone');
  assert.equal(g.hidden, true);
  assert.match(await D.$eval('#lb-open', el => el.textContent), /Leaderboard|Classement/);
});

await step('opening: centred card over the game, light dimming; the game and its timer are not touched', async () => {
  await D.click('.diff-btn[data-diff="medium"]');
  await D.evaluate(() => { for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!puzzle[r][c]) { onCellClick(r, c); onNumInput(solution[r][c]); return; } });   // first move: starts the timer
  await sleep(1200);
  const before = await gameSnapshot(D);
  assert.ok(before.timerSecs >= 1, 'the timer should be running');
  await D.click('#lb-open');
  await D.waitForSelector('#lb-modal:not([hidden])');
  const geo = await D.evaluate(() => {
    const c = document.getElementById('scoreboard').getBoundingClientRect();
    const m = document.getElementById('lb-modal');
    return { cx: (c.left + c.right) / 2, cy: (c.top + c.bottom) / 2, vw: innerWidth, vh: innerHeight, w: c.width, h: c.height,
      bg: getComputedStyle(m).backgroundColor, blur: getComputedStyle(m).backdropFilter, pos: getComputedStyle(m).position,
      z: +getComputedStyle(m).zIndex, focusInside: document.getElementById('scoreboard').contains(document.activeElement) || document.activeElement === document.getElementById('scoreboard') };
  });
  assert.ok(Math.abs(geo.cx - geo.vw / 2) <= 2 && Math.abs(geo.cy - geo.vh / 2) <= 2, `card not centred: ${JSON.stringify(geo)}`);
  assert.equal(geo.pos, 'fixed');
  assert.ok(geo.z >= 50);
  const alpha = +(geo.bg.match(/rgba?\(([^)]+)\)/)[1].split(',')[3] ?? 1);
  assert.ok(alpha > 0.2 && alpha < 0.7, `backdrop should be lightly dimmed, alpha=${alpha}`);
  assert.equal(geo.blur, 'none');
  assert.equal(geo.focusInside, true, 'focus should move into the popup');
  await sleep(2200);                                                   // popup stays open: the timer must keep counting
  const during = await gameSnapshot(D);
  assert.ok(during.timerSecs >= before.timerSecs + 2, `timer stopped while the popup was open (${before.timerSecs} → ${during.timerSecs})`);
  await D.click('#lb-close');
  await D.waitForSelector('#lb-modal', { hidden: true });
  const after = await gameSnapshot(D);
  assert.deepEqual({ ...after, timerSecs: 0 }, { ...before, timerSecs: 0 }, 'the game must be untouched by opening / closing the popup');
  assert.ok(after.timerSecs >= during.timerSecs);
});

await step('closing: click outside, click on a passive spot inside, ✕ button and Esc', async () => {
  const stillOpen = () => lbIsOpen(D);
  // 1) outside (the dimmed backdrop)
  await openLb(D);
  await D.mouse.click(6, 6);
  assert.equal(await stillOpen(), false, 'outside click should close');
  // 2) passive spot inside: the title
  await openLb(D);
  await D.click('#sb-title');
  assert.equal(await stillOpen(), false, 'click on the title should close');
  // 3) passive spot inside: the card padding (bottom-right corner, below the list)
  await openLb(D);
  const pad = await D.$eval('#scoreboard', el => { const b = el.getBoundingClientRect(); return { x: b.right - 6, y: b.bottom - 6 }; });
  await D.mouse.click(pad.x, pad.y);
  assert.equal(await stillOpen(), false, 'click on the card padding should close');
  // 4) the ✕
  await openLb(D);
  await D.click('#lb-close');
  assert.equal(await stillOpen(), false, '✕ should close');
  // 5) Esc — and it must not leak into the game (selected cell stays selected, digits are not typed)
  await D.evaluate(() => { const r = puzzle.findIndex(row => row.includes(0)); const c = puzzle[r].indexOf(0); onCellClick(r, c); });
  const sel = await D.evaluate(() => JSON.stringify(selected));
  const boardBefore = await D.evaluate(() => JSON.stringify(board));
  await openLb(D);
  await D.keyboard.press('5');
  await D.keyboard.press('ArrowLeft');
  assert.equal(await D.evaluate(() => JSON.stringify(board)), boardBefore, 'game keys must be inert while the popup is open');
  assert.equal(await D.evaluate(() => JSON.stringify(selected)), sel);
  await D.keyboard.press('Escape');
  assert.equal(await stillOpen(), false, 'Esc should close');
  assert.equal(await D.evaluate(() => JSON.stringify(selected)), sel, 'Esc closing the popup must not also deselect the cell');
  assert.equal(await D.$eval('body', b => b.classList.contains('lb-open')), false);
  // focus returns to the 🏆 button; the page behind is not left locked
  assert.equal(await D.evaluate(() => document.activeElement && document.activeElement.id), 'lb-open');
});

await step('exceptions: tabs, difficulty pills, buttons and the gaps between them never close the popup', async () => {
  await openLb(D);
  const open = async what => assert.equal(await lbIsOpen(D), true, `${what} closed the popup`);
  await D.click('#sb-tab-local');           await open('Local tab');
  await D.click('#sb-tab-world');           await open('World tab');
  for (const lvl of ['easy', 'medium', 'hard', 'daily']) { await D.click(`.lb-lvl[data-level="${lvl}"]`); await open(`${lvl} pill`); }
  await D.click('#ol-refresh');             await open('Refresh');
  // the 4 px gap between two pills, and the empty strip of the footer, are near-misses, not passive spots
  const gap = await D.evaluate(() => { const a = document.querySelector('.lb-lvl[data-level="easy"]').getBoundingClientRect(), b = document.querySelector('.lb-lvl[data-level="medium"]').getBoundingClientRect(); return { x: (a.right + b.left) / 2, y: (a.top + a.bottom) / 2 }; });
  await D.mouse.click(gap.x, gap.y);        await open('the gap between two pills');
  const foot = await D.evaluate(() => { const a = document.getElementById('ol-nick').getBoundingClientRect(), b = document.getElementById('ol-refresh').getBoundingClientRect(); return { x: (a.right + b.left) / 2, y: (a.top + a.bottom) / 2 }; });
  await D.mouse.click(foot.x, foot.y);      await open('the footer strip');
  await D.click('#ol-nick');                                          // nickname dialog on top of the popup
  await D.waitForSelector('#nick-modal:not([hidden])');
  await D.keyboard.press('Escape');                                   // closes ONLY the nickname dialog
  await D.waitForSelector('#nick-modal', { hidden: true });
  await open('Esc in the nickname dialog');
  await D.click('#ol-nick');
  await D.waitForSelector('#nick-modal:not([hidden])');
  await D.click('#nick-cancel');
  await D.waitForSelector('#nick-modal', { hidden: true });
  await open('the nickname dialog');
  await closeLb(D);
});

await step('Local ⇄ Worldwide and the four difficulties, without closing; the game keeps its own difficulty', async () => {
  const game = await gameSnapshot(D);
  await openLb(D);
  // Local tab: the device's own list; World tab: the live list
  await D.click('#sb-tab-local');
  assert.deepEqual(await D.evaluate(() => [document.getElementById('ol').hidden, document.getElementById('sb-list').hidden]), [true, false]);
  await D.click('#sb-tab-world');
  assert.deepEqual(await D.evaluate(() => [document.getElementById('ol').hidden, document.getElementById('sb-list').hidden]), [false, true]);
  const labels = {};
  for (const lvl of ['easy', 'medium', 'hard', 'daily']) {
    await D.click(`.lb-lvl[data-level="${lvl}"]`);
    labels[lvl] = await D.evaluate(() => ({ mode: document.getElementById('sb-mode').textContent, active: [...document.querySelectorAll('.lb-lvl.active')].map(b => b.dataset.level), selected: [...document.querySelectorAll('.lb-lvl')].filter(b => b.getAttribute('aria-selected') === 'true').length }));
    assert.deepEqual(labels[lvl].active, [lvl]);
    assert.equal(labels[lvl].selected, 1);
  }
  assert.match(labels.easy.mode, /Easy|Facile/); assert.match(labels.medium.mode, /Medium|Moyen/); assert.match(labels.hard.mode, /Hard|Difficile/);
  assert.match(labels.daily.mode, new RegExp(utcToday));
  // each pill shows the right worldwide ranking: Hard has the 22 seeded players (top 20 shown), Daily has today's three + seed
  await D.click('.lb-lvl[data-level="hard"]');
  const hard = await waitRows(D, r => r.length === 20, '20 Hard rows');
  assert.deepEqual(hard.slice(0, 2).map(r => [r.rank, r.name]), [['1', 'Seed1'], ['2', 'Seed2']]);
  await D.click('.lb-lvl[data-level="daily"]');
  const daily = await waitRows(D, r => r.length >= 3 && !r.some(x => x.name === 'Seed1'), 'Daily rows');
  assert.ok(daily.some(r => r.name === 'Carol'));
  assert.equal(await lbIsOpen(D), true);
  assert.deepEqual({ ...(await gameSnapshot(D)), timerSecs: 0 }, { ...game, timerSecs: 0 }, 'browsing the rankings must not change the game being played');
  await closeLb(D);
});

await step('the last tab and the last difficulty are remembered for the session', async () => {
  await openLb(D, 'hard');
  await D.click('#sb-tab-local');
  await closeLb(D);
  await D.click('.diff-btn[data-diff="easy"]');                       // the game moves to Easy: the popup must still remember Hard
  await openLb(D);
  assert.deepEqual(await D.evaluate(() => [document.querySelector('.lb-lvl.active').dataset.level, document.getElementById('ol').hidden]), ['hard', true]);
  await closeLb(D);
  await D.reload({ waitUntil: 'load' });                              // same browser tab = same session
  await D.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  await D.click('#home-play');
  await openLb(D);
  assert.deepEqual(await D.evaluate(() => [document.querySelector('.lb-lvl.active').dataset.level, document.getElementById('ol').hidden]), ['hard', true]);
  await D.click('#sb-tab-world');
  await closeLb(D);
});

await step('listening is tied to the popup: no live listener while closed, one while open, no duplicates', async () => {
  await D.evaluate(() => {
    const api = window.SudokuOnline, orig = api.subscribe;
    window.__active = 0; window.__subs = 0;
    api.subscribe = (board, cb) => { window.__active++; window.__subs++; const un = orig(board, cb); let done = false; return () => { if (!done) { done = true; window.__active--; } un(); }; };
  });
  const active = () => D.evaluate(() => window.__active);
  assert.equal(await active(), 0);
  await openLb(D, 'hard');
  await D.click('#sb-tab-world');
  assert.equal(await active(), 1);
  for (const lvl of ['easy', 'medium', 'hard', 'daily', 'hard']) { await D.click(`.lb-lvl[data-level="${lvl}"]`); assert.equal(await active(), 1, `listeners after picking ${lvl}`); }
  await D.click('#sb-tab-local');  assert.equal(await active(), 0);
  await D.click('#sb-tab-world');  assert.equal(await active(), 1);
  await D.click('#ol-refresh');    // pinned at the bottom of the card, reachable while the 20 rows scroll
  assert.equal(await active(), 1);
  await closeLb(D);                assert.equal(await active(), 0, 'closing the popup must stop listening');
  await openLb(D);                 assert.equal(await active(), 1);
  // live: another player appears while the popup is open → the list updates by itself, with the right ranks
  await waitRows(D, r => r.length === 20, 'Hard top 20');
  await seedScore('hard', 99, 101, 0);                                  // faster than everybody except Seed… → rank 1
  const rows = await waitRows(D, r => r[0] && r[0].name === 'Seed99', 'the new fastest player to appear');
  assert.equal(rows.length, 20);
  assert.deepEqual(rows.map(r => r.rank), Array.from({ length: 20 }, (_, i) => String(i + 1)));
  await closeLb(D);
});

await step('personal rank: outside the top 20 the player is shown below a "⋮", highlighted', async () => {
  const t = await winGame(D, { mode: 'hard', time: 900, mistakes: 0, name: 'Zed' });
  assert.match(t, /#24\b/, t);                                           // 22 seeds + Seed99 ahead of him
  await D.click('#ov-scores');                                           // the win screen shortcut opens the ranking just played
  await D.waitForSelector('#lb-modal:not([hidden])');
  assert.equal(await D.evaluate(() => document.querySelector('.lb-lvl.active').dataset.level), 'hard');
  await waitRows(D, r => top20(r).length === 20, 'Hard top 20');
  await D.waitForSelector('#ol-list .ol-gap');
  const mine = await D.$eval('#ol-list .sb-row.me', el => [el.querySelector('.sb-rank').textContent, el.querySelector('.sb-name').textContent, el.querySelector('.sb-time').textContent]);
  assert.deepEqual(mine, ['#24', 'Zed', '15:00']);
  await closeLb(D);
});

await step('20 scores scroll inside the card (desktop): scrolling, clicking rows or dragging out of the list never closes it', async () => {
  await openLb(D, 'hard');
  await waitRows(D, r => top20(r).length === 20, 'Hard top 20');
  await D.waitForSelector('#ol-list .ol-gap');                          // Zed (rank 24) is listed below the "⋮": 21 rows to scroll through
  const sc = await D.$eval('#lb-scroll', el => ({ sh: el.scrollHeight, ch: el.clientHeight, ov: getComputedStyle(el).overflowY }));
  assert.ok(sc.sh > sc.ch && sc.ov === 'auto', `the list should scroll: ${JSON.stringify(sc)}`);
  const card = await D.$eval('#scoreboard', el => el.getBoundingClientRect().height);
  assert.ok(card <= DESKTOP.height - 30, `card taller than the screen (${card})`);
  const box = await D.$eval('#lb-scroll', el => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await D.mouse.move(box.x, box.y);
  await D.mouse.wheel({ deltaY: 400 });
  await sleep(200);
  assert.ok(await D.$eval('#lb-scroll', el => el.scrollTop) > 100, 'wheel should scroll the list');
  assert.equal(await lbIsOpen(D), true);
  assert.equal(await D.evaluate(() => window.scrollY), 0);
  await clickRow(D, 5);                      // a row of a list that scrolls: not a closing spot
  assert.equal(await lbIsOpen(D), true, 'clicking a row of a scrolling list closed the popup');
  // press inside the list, release on the backdrop (what dragging a scrollbar thumb out of the card does) → must stay open
  await D.mouse.move(box.x, box.y); await D.mouse.down(); await D.mouse.move(6, 6, { steps: 5 }); await D.mouse.up();
  assert.equal(await lbIsOpen(D), true, 'press in the list + release outside closed the popup');
  // press on the backdrop and drag away: a drag, not a click
  await D.mouse.move(6, 6); await D.mouse.down(); await D.mouse.move(120, 90, { steps: 5 }); await D.mouse.up();
  assert.equal(await lbIsOpen(D), true, 'a drag starting on the backdrop closed the popup');
  await D.mouse.click(6, 6);
  assert.equal(await lbIsOpen(D), false);
});

await step('a ranking that fits (no scrolling) closes on a click anywhere passive, even on a row', async () => {
  await openLb(D, 'daily');
  await waitRows(D, r => r.length >= 3, 'daily rows');
  assert.ok(await D.$eval('#lb-scroll', el => el.scrollHeight <= el.clientHeight + 1));
  await clickRow(D, 1);
  assert.equal(await lbIsOpen(D), false);
});

await step('phone 390 px: touch scrolling of the 20 scores keeps the popup open; tap outside closes it', async () => {
  const ctx = await browserB.createBrowserContext();
  const M = await ctx.newPage();
  await M.setViewport(PHONE);
  M.on('pageerror', e => problems.push(`[M] pageerror: ${e.message}`));
  await M.goto(BASE, { waitUntil: 'load' });
  await M.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  await M.waitForSelector('#nick-modal:not([hidden])');
  await M.tap('#nick-cancel');
  await M.tap('#home-play');
  await openLb(M, 'hard', true);
  await M.tap('#sb-tab-world');
  await waitRows(M, r => r.length === 20, 'Hard top 20 on the phone');
  const g = await M.evaluate(() => {
    const c = document.getElementById('scoreboard').getBoundingClientRect(), s = document.getElementById('lb-scroll');
    return { l: c.left, r: c.right, t: c.top, b: c.bottom, vw: innerWidth, vh: innerHeight, sh: s.scrollHeight, ch: s.clientHeight, ox: document.documentElement.scrollWidth - innerWidth,
      pills: document.getElementById('sb-levels').scrollWidth - document.getElementById('sb-levels').clientWidth };
  });
  assert.ok(g.l >= 0 && g.r <= g.vw && g.t >= 0 && g.b <= g.vh, `card outside the screen ${JSON.stringify(g)}`);
  assert.ok(g.sh > g.ch, 'the 20 scores should scroll inside the card on a phone');
  assert.ok(g.ox <= 1 && g.pills <= 0);
  const shot = process.env.E2E_SHOT_DIR;
  if (shot) await M.screenshot({ path: path.join(shot, 'mobile-popup-hard.png') });
  // real touch scrolling: a finger on the list, dragged up. No "click" may close the popup.
  const at = await M.$eval('#lb-scroll', el => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; });
  const finger = await M.touchscreen.touchStart(at.x, at.y + 150);
  for (let i = 1; i <= 8; i++) { await finger.move(at.x, at.y + 150 - 15 * i); await sleep(16); }
  await finger.end();
  await sleep(500);
  const top = await M.$eval('#lb-scroll', el => el.scrollTop);
  assert.ok(top > 50, `touch scroll did not move the list (scrollTop=${top})`);
  assert.equal(await lbIsOpen(M), true, 'touch scrolling closed the popup');
  assert.equal(await M.evaluate(() => window.scrollY), 0, 'the page behind must not scroll');
  // the last row is reachable
  await M.$eval('#lb-scroll', el => { el.scrollTop = el.scrollHeight; });
  const last = await M.$eval('#ol-list .sb-row:last-of-type', el => el.getBoundingClientRect().bottom);
  assert.ok(last <= g.b, 'the last row is hidden below the card');
  // tapping a row of the scrolling list, a tab, a pill: still open
  await tapRow(M, 3);           assert.equal(await lbIsOpen(M), true, 'tapping a row closed the popup');
  await M.tap('#sb-tab-local'); await M.tap('#sb-tab-world'); await M.tap('.lb-lvl[data-level="easy"]'); await M.tap('.lb-lvl[data-level="hard"]');
  assert.equal(await lbIsOpen(M), true);
  // tap on the dimmed backdrop → closes
  await M.touchscreen.tap(8, 8);
  await M.waitForSelector('#lb-modal', { hidden: true });
  await ctx.close();
});

await step('English and French: button, titles, tabs, pills and ✕', async () => {
  const expect = {
    fr: { btn: 'Classement', title: 'Classement', tabs: ['Cet appareil', 'Monde'], pills: ['Facile', 'Moyen', 'Difficile', 'Défi du jour'], close: 'Fermer', refresh: 'Actualiser' },
    en: { btn: 'Leaderboard', title: 'Leaderboard', tabs: ['This device', 'Worldwide'], pills: ['Easy', 'Medium', 'Hard', 'Daily'], close: 'Close', refresh: 'Refresh' },
  };
  for (const lang of ['fr', 'en']) {
    await D.click(`#header .lang-toggle button[data-lang="${lang}"]`);
    const e = expect[lang];
    assert.equal(await D.$eval('#lb-open', el => el.textContent.replace(/\s+/g, ' ').trim()), '🏆 ' + e.btn);
    await openLb(D);
    const got = await D.evaluate(() => ({
      title: document.getElementById('sb-title').textContent,
      tabs: [...document.querySelectorAll('#sb-tabs button')].map(b => b.textContent),
      pills: [...document.querySelectorAll('.lb-lvl')].map(b => b.textContent),
      close: document.getElementById('lb-close').getAttribute('aria-label'), closeTitle: document.getElementById('lb-close').title,
      refresh: document.getElementById('ol-refresh').textContent,
      overflow: document.getElementById('sb-levels').scrollWidth - document.getElementById('sb-levels').clientWidth,
    }));
    assert.equal(got.title, e.title); assert.deepEqual(got.tabs, e.tabs); assert.deepEqual(got.pills, e.pills);
    assert.equal(got.close, e.close); assert.equal(got.closeTitle, e.close); assert.equal(got.refresh, e.refresh);
    assert.ok(got.overflow <= 0, `pills overflow in ${lang}`);
    await closeLb(D);
  }
});

await step('day theme: the popup follows the theme', async () => {
  await D.click('#header .theme-toggle');
  await openLb(D);
  const c = await D.evaluate(() => ({ card: getComputedStyle(document.getElementById('scoreboard')).backgroundColor, back: getComputedStyle(document.getElementById('lb-modal')).backgroundColor }));
  assert.equal(c.card, 'rgb(221, 213, 200)');
  assert.match(c.back, /rgba\(44, 31, 14, 0\.28\)/);
  await closeLb(D);
  await D.click('#header .theme-toggle');
});

await step('nothing was lost: local scores and the worldwide data are intact, no JavaScript error anywhere', async () => {
  const d = await D.evaluate(() => Object.keys(localStorage).filter(k => /^sudoku-scores-/.test(k)));
  assert.ok(d.includes('sudoku-scores-hard'), 'the local score saved by the game is still there');
  assert.equal(problems.length, 0, problems.join('\n'));
  await D.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
const noteworthy = problems.filter((p, i) => problems.indexOf(p) === i);
if (noteworthy.length) { console.log('\nBrowser errors seen:'); noteworthy.forEach(p => console.log('  -', p)); }

await browserA.close(); await browserB.close(); server.close();
process.exit(failed ? 1 : 0);
