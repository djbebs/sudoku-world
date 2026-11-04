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
  // the share links open real public hosts: they are blocked here, so the tests never reach Facebook or WhatsApp
  executablePath: CHROME, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP www.facebook.com ~NOTFOUND, MAP wa.me ~NOTFOUND, MAP www.messenger.com ~NOTFOUND, MAP api.whatsapp.com ~NOTFOUND'],
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
// The game is the first screen (the calendar sits behind 📅): nothing to click, only wait for it
const enterGame = page => page.waitForSelector('#board', { visible: true });
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
let A, B, D, Dctx, uidA, uidB, tFirstWrite;   // D: the fresh desktop player of the popup tests

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
  await enterGame(A); await enterGame(B);
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
  await enterGame(A);
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
  assert.equal(await A.$eval('#sb-sub', el => el.textContent), 'Meilleur score par joueur');
  await A.click('#header .lang-toggle button[data-lang="en"]');
  assert.equal(await A.$eval('#sb-tab-world', el => el.textContent), 'Worldwide');
  assert.match(await A.$eval('#ol-nick', el => el.textContent), /^Playing as Alicia/);
});

await step('mobile layout (390×844, touch): the popup fits the screen, worldwide list inside', async () => {
  const M = await newPage(browserA, 'mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await enterGame(M);
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
  await enterGame(P);
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
  await enterGame(P);
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

await step('the 🏆 button is in the first header row, right of the logo, visible, and the ranking is no longer on the page', async () => {
  Dctx = await browserB.createBrowserContext();
  await Dctx.overridePermissions(`http://localhost:${PORT}`, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  D = await Dctx.newPage();
  await D.setViewport(DESKTOP);
  D.on('pageerror', e => problems.push(`[D] pageerror: ${e.message}`));
  D.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|offline/i.test(m.text())) problems.push(`[D] console.error: ${m.text()}`); });
  await D.goto(BASE, { waitUntil: 'load' });
  await D.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  await D.waitForSelector('#nick-modal:not([hidden])');
  await D.click('#nick-cancel');
  await enterGame(D);
  const g = await D.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const btn = r('#lb-open'), head = r('#header'), logo = r('#header h1'), theme = r('#header .theme-toggle');
    const side = document.querySelector('#layout #scoreboard');
    return { btnVisible: btn.width > 0 && btn.height > 0, inHeader: document.getElementById('header').contains(document.getElementById('lb-open')),
      btnLeft: btn.left, logoRight: logo.right, rowGap: Math.abs((btn.top + btn.bottom) / 2 - (logo.top + logo.bottom) / 2),
      themeRight: theme.right, headRight: head.right, btnBottom: btn.bottom, headTop: head.top, side: !!side, hidden: document.getElementById('lb-modal').hidden };
  });
  assert.ok(g.btnVisible);
  assert.ok(g.inHeader, 'the 🏆 button belongs to the header');
  assert.ok(g.btnLeft > g.logoRight && g.rowGap <= 4, `🏆 must sit right of the logo, on its row (gap ${g.rowGap})`);
  assert.ok(Math.abs(g.themeRight - g.headRight) <= 1, `the theme button is the last one, at the right edge of the header (${g.themeRight} vs ${g.headRight})`);
  assert.ok(g.btnBottom > g.headTop, 'the button is part of the header, not above it');
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
  assert.equal(await D.$eval('body', b => b.classList.contains('popup-open')), false);
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
  for (const lvl of ['easy', 'medium', 'hard']) assert.ok(!/easy|medium|hard|facile|moyen|expert|łatwy|średni|ekspert/i.test(labels[lvl].mode), `${lvl}: the difficulty is not repeated above the table (the active pill says it)`);
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
  await enterGame(D);
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
  await enterGame(M);
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

await step('English, French and Polish: button, titles, tabs, pills and ✕', async () => {
  const expect = {
    fr: { btn: 'Classement', title: 'Classement', tabs: ['Cet appareil', 'Monde'], pills: ['Facile', 'Moyen', 'Expert', 'Défi du jour'], close: 'Fermer', refresh: 'Actualiser' },
    en: { btn: 'Leaderboard', title: 'Leaderboard', tabs: ['This device', 'Worldwide'], pills: ['Easy', 'Medium', 'Hard', 'Daily'], close: 'Close', refresh: 'Refresh' },
    pl: { btn: 'Ranking', title: 'Ranking', tabs: ['To urządzenie', 'Świat'], pills: ['Łatwy', 'Średni', 'Ekspert', 'Wyzwanie dnia'], close: 'Zamknij', refresh: 'Odśwież' },
  };
  for (const lang of ['fr', 'pl', 'en']) {
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

await step('subtitles: This device → "My game history", World → "Best score per player" (EN / FR / PL), immediate, difficulty not repeated, game untouched', async () => {
  const SUB = { en: { local: 'My game history', world: 'Best score per player' }, fr: { local: 'Historique de mes parties', world: 'Meilleur score par joueur' }, pl: { local: 'Historia moich gier', world: 'Najlepszy wynik każdego gracza' } };
  const game = await gameSnapshot(D);
  await openLb(D, 'easy');
  for (const lang of ['en', 'fr', 'pl']) {
    await D.evaluate(l => document.querySelector(`#header .lang-toggle button[data-lang="${l}"]`).click(), lang);   // the language changes while the popup is open
    for (const lvl of ['easy', 'medium', 'hard', 'daily']) {
      await D.click(`.lb-lvl[data-level="${lvl}"]`);
      for (const tab of ['local', 'world', 'local']) {
        // click and read in the same task: nothing is awaited between them, so the subtitle follows the tab at once
        const x = await D.evaluate(tab => {
          document.getElementById('sb-tab-' + tab).click();
          return { text: document.getElementById('sb-sub').textContent, date: document.getElementById('sb-date').textContent, dateShown: getComputedStyle(document.getElementById('sb-date')).display !== 'none',
            mode: document.getElementById('sb-mode').textContent, listShown: tab === 'world' ? !document.getElementById('ol').hidden : !document.getElementById('sb-list').hidden };
        }, tab);
        const where = `${lang} / ${lvl} / ${tab}`;
        assert.equal(x.text, SUB[lang][tab], where);
        assert.equal(x.listShown, true, `${where}: the list that goes with the subtitle is the one on screen`);
        if (lvl === 'daily') assert.ok(x.dateShown && x.date === `${utcToday} (UTC)`, `${where}: Daily names its UTC day`);
        else assert.ok(!x.dateShown && x.date === '' && !/easy|medium|hard|facile|moyen|expert|łatwy|średni|ekspert/i.test(x.mode), `${where}: nothing repeats the difficulty`);
      }
    }
  }
  assert.equal(await lbIsOpen(D), true, 'switching tabs / languages never closes the popup');
  await D.evaluate(() => { document.getElementById('sb-tab-world').click(); document.querySelector('#header .lang-toggle button[data-lang="en"]').click(); });   // back to English (the snapshot holds translated labels)
  assert.deepEqual({ ...(await gameSnapshot(D)), timerSecs: 0 }, { ...game, timerSecs: 0 }, 'the game in progress is untouched');
  await closeLb(D);
});

await step('subtitle colours: readable (≥ 4.5:1) on the card in the Night and the Day theme, smaller than the title', async () => {
  const rgba = v => { const m = (v.match(/[\d.]+/g) || []).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const mix = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lumi = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratioOf = (a, b) => { const [hi, lo] = [lumi(a), lumi(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  await openLb(D, 'daily');                                               // Daily shows the second line (the date) too
  for (const theme of ['night', 'day']) {
    if ((await D.$eval('body', b => b.classList.contains('day'))) !== (theme === 'day')) await D.evaluate(() => document.querySelector('#header .theme-toggle').click());
    for (const tab of ['local', 'world']) {
      await D.evaluate(tab => document.getElementById('sb-tab-' + tab).click(), tab);
      const c = await D.evaluate(() => { const st = id => getComputedStyle(document.getElementById(id)); return { sub: st('sb-sub').color, date: st('sb-date').color, card: st('scoreboard').backgroundColor, body: st('lb-modal').backgroundColor,
        subPx: parseFloat(st('sb-sub').fontSize), titlePx: parseFloat(st('sb-title').fontSize), subTransform: st('sb-sub').textTransform, subCursor: st('sb-sub').cursor }; });
      const card = mix(rgba(c.card), { r: 128, g: 128, b: 128, a: 1 });   // an opaque card: the backdrop behind it does not matter
      for (const k of ['sub', 'date']) {
        const r = ratioOf(mix(rgba(c[k]), card), card);
        assert.ok(r >= 4.5, `${theme} / ${tab}: ${k} text is only ${r.toFixed(2)}:1`);
      }
      assert.ok(c.subPx < c.titlePx && c.subPx >= 11.5, `${theme}: subtitle ${c.subPx}px vs title ${c.titlePx}px`);
      assert.ok(c.subCursor !== 'pointer', 'the subtitle does not look like a button');
    }
  }
  await D.evaluate(() => { document.getElementById('sb-tab-world').click(); if (document.body.classList.contains('day')) document.querySelector('#header .theme-toggle').click(); });
  await closeLb(D);
});

await step('subtitles fit on 320 / 375 / 390 / 430 / 768 px (EN, FR and PL, both tabs, Daily = longest): no overflow, card on screen, tabs and pills still usable', async () => {
  const ctx = await browserB.createBrowserContext();
  const M = await ctx.newPage();
  M.on('pageerror', e => problems.push(`[Msub] pageerror: ${e.message}`));
  await M.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await M.goto(BASE, { waitUntil: 'load' });
  await M.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  await M.waitForSelector('#nick-modal:not([hidden])');
  await M.tap('#nick-cancel');
  await enterGame(M);
  await openLb(M, 'daily', true);
  const heights = {};
  for (const [w, h] of [[320, 568], [375, 812], [390, 844], [430, 932], [768, 1024]]) {
    await M.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await sleep(250);
    for (const lang of ['en', 'fr', 'pl']) {
      await M.evaluate(l => document.querySelector(`#header .lang-toggle button[data-lang="${l}"]`).click(), lang);
      for (const tab of ['local', 'world']) {
        await M.tap(`#sb-tab-${tab}`);
        const g = await M.evaluate(() => {
          const r = id => document.getElementById(id).getBoundingClientRect(), sub = document.getElementById('sb-sub'), card = r('scoreboard');
          return { subOver: sub.scrollWidth - sub.clientWidth, subH: r('sb-sub').height, subLine: parseFloat(getComputedStyle(sub).lineHeight), subL: r('sb-sub').left, subR: r('sb-sub').right, cardL: card.left, cardR: card.right, cardT: card.top, cardB: card.bottom,
            vw: innerWidth, vh: innerHeight, ox: document.documentElement.scrollWidth - innerWidth, text: sub.textContent, tabW: r('sb-tab-local').width };
        });
        const where = `${w}px ${lang} ${tab}`;
        assert.ok(g.subOver <= 0 && g.subL >= g.cardL && g.subR <= g.cardR, `${where}: subtitle overflows ${JSON.stringify(g)}`);
        assert.ok(g.cardL >= 0 && g.cardR <= g.vw && g.cardT >= 0 && g.cardB <= g.vh && g.ox <= 1, `${where}: card or page overflows ${JSON.stringify(g)}`);
        assert.ok(g.subH <= g.subLine * 2 + 1, `${where}: subtitle takes ${g.subH}px (> 2 lines)`);
        assert.ok(g.tabW >= 44, `${where}: tab touch target ${g.tabW}px`);
        heights[`${w}/${lang}`] = Math.max(heights[`${w}/${lang}`] || 0, g.subH);
      }
    }
    // the four difficulties and the popup itself still answer on this width
    for (const lvl of ['easy', 'hard', 'daily']) await M.tap(`.lb-lvl[data-level="${lvl}"]`);
    assert.equal(await lbIsOpen(M), true, `${w}px: tapping tabs and pills must not close the popup`);
  }
  await M.touchscreen.tap(6, 6);                                           // the dimmed backdrop closes it, as before
  await M.waitForSelector('#lb-modal', { hidden: true });
  await ctx.close();
});

await step('same player, several games: "This device" lists each one (times, hearts), "World" keeps one row per player — the best', async () => {
  const games = [[330, 0], [280, 0], [400, 2]];                           // first score, a better one, a worse one
  const said = [];
  for (const [i, [time, mistakes]] of games.entries()) {
    if (i === 1) await sleep(11000);                                      // the rules allow one update of a score every 10 s (a real game lasts far longer)
    said.push(await winGame(D, { mode: 'medium', time, mistakes, name: 'Zed' }));
    await D.click('#ov-newgame').catch(() => {});
  }
  await openLb(D, 'medium');
  await D.evaluate(() => document.getElementById('sb-tab-local').click());
  const local = await D.$$eval('#sb-list .sb-row', rows => rows.map(r => [r.querySelector('.sb-name').textContent, r.querySelector('.sb-time').textContent, r.querySelectorAll('.sb-heart:not(.lost)').length]));
  assert.deepEqual(local, [['Zed', '4:40', 3], ['Zed', '5:30', 3], ['Zed', '6:40', 1]], 'every game stays in the history of this device, with its time and hearts');
  assert.equal(await D.$eval('#sb-sub', el => el.textContent), 'My game history');
  await D.evaluate(() => document.getElementById('sb-tab-world').click());
  const world = await waitRows(D, r => r.some(x => x.name === 'Zed'), 'Zed on the worldwide Medium ranking');
  const zed = world.filter(r => r.name === 'Zed');
  assert.equal(zed.length, 1, 'one row per player: the three games of Zed make a single world entry');
  assert.deepEqual([zed[0].time, zed[0].hearts, zed[0].me], ['4:40', 3, true], 'and it is his best');
  assert.equal(new Set(world.map(r => r.name)).size, world.length, 'no player appears twice on the ranking');
  assert.equal(await D.$eval('#sb-sub', el => el.textContent), 'Best score per player');
  const mine = await D.evaluate(() => SudokuOnline.getMine('medium'));
  assert.equal(mine.time, 280, 'the server keeps the best of the three');
  await closeLb(D);
});

// ═══════════════════════════ sharing (Share button, popup, win invitation) ═══════════════════════════
console.log('\nSharing\n');
const SHARE = { en: 'https://djbebs.github.io/sudoku-world/en/', fr: 'https://djbebs.github.io/sudoku-world/fr/', pl: 'https://djbebs.github.io/sudoku-world/pl/' };
const WA_MSG = {
  en: '🧩 No ads. Just Sudoku.\n\nPlay for free and challenge me on the global leaderboard!\n\n',
  fr: '🧩 Zéro pub. Juste du Sudoku.\n\nJoue gratuitement et défie-moi au classement mondial !\n\n',
  pl: '🧩 Bez reklam. Tylko Sudoku.\n\nGraj za darmo i zmierz się ze mną w światowym rankingu!\n\n',
};
const TXT = {
  en: { btn: 'Share', title: 'Sudoku World', slogan: 'No ads. Just Sudoku.', desc: 'Free Sudoku. Daily challenges. Global leaderboard.', fb: 'Share on Facebook', ms: 'Share on Messenger', wa: 'Share on WhatsApp', copy: 'Copy link', copied: 'Link copied!', msCopied: 'Link copied. Paste it in Messenger.', msMissing: "Couldn't open Messenger. Link copied.", bravo: '🏆 Well done!', invite: 'Challenge your friends!' },
  fr: { btn: 'Partager', title: 'Sudoku World', slogan: 'Zéro pub. Juste du Sudoku.', desc: 'Sudoku gratuit. Défis quotidiens. Classement mondial.', fb: 'Partager sur Facebook', ms: 'Partager sur Messenger', wa: 'Partager sur WhatsApp', copy: 'Copier le lien', copied: 'Lien copié !', msCopied: 'Lien copié. Colle-le dans Messenger.', msMissing: "Impossible d'ouvrir Messenger. Lien copié.", bravo: '🏆 Bravo !', invite: 'Défie tes amis !' },
  pl: { btn: 'Udostępnij', title: 'Sudoku World', slogan: 'Bez reklam. Tylko Sudoku.', desc: 'Darmowe Sudoku. Codzienne wyzwania. Światowy ranking.', fb: 'Udostępnij na Facebooku', ms: 'Udostępnij w Messengerze', wa: 'Udostępnij na WhatsAppie', copy: 'Kopiuj link', copied: 'Link skopiowany!', msCopied: 'Link skopiowany. Wklej go w Messengerze.', msMissing: 'Nie udało się otworzyć Messengera. Link skopiowany.', bravo: '🏆 Brawo!', invite: 'Rzuć wyzwanie znajomym!' },
};
const norm = s => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();   // the no-break space before "!" is typography, not content
const shareIsOpen = page => page.$eval('#share-modal', el => !el.hidden);
async function openShare(page, tap = false) {
  await (tap ? page.tap('#share-open') : page.click('#share-open'));
  await page.waitForSelector('#share-modal:not([hidden])');
}
async function closeShare(page) {
  await page.click('#share-close');
  await page.waitForSelector('#share-modal', { hidden: true });
}
async function setLang(page, lang, tap = false) {
  const sel = `#header .lang-toggle button[data-lang="${lang}"]`;
  await (tap ? page.tap(sel) : page.click(sel));
}
const readShare = page => page.evaluate(() => {
  const txt = id => document.getElementById(id).textContent;
  const fb = document.getElementById('share-fb'), wa = document.getElementById('share-wa'), ms = document.getElementById('share-ms');
  return {
    btn: document.querySelector('#share-open span').textContent, title: txt('share-title'), slogan: txt('share-slogan'), desc: txt('share-desc'),
    fb: fb.textContent, ms: ms.textContent, wa: wa.textContent, copy: txt('share-copy'),
    fbHref: fb.href, msHref: ms.href, waHref: wa.href, fbTarget: fb.target, msTarget: ms.getAttribute('target'), waTarget: wa.target, fbRel: fb.rel, msRel: ms.rel, waRel: wa.rel,
  };
});
// Clicking a share link opens a new tab (the hosts are blocked in these browsers, nothing leaves the machine): close it again
async function clickAndCloseNewTab(ctx, page, selector) {
  const known = new Set(await ctx.pages());
  await page.click(selector);
  const fresh = async () => (await ctx.pages()).filter(p => !known.has(p));
  const t0 = Date.now();
  while (!(await fresh()).length && Date.now() - t0 < 5000) await sleep(100);
  const opened = await fresh();
  assert.ok(opened.length > 0, `${selector} did not open a new tab`);
  for (const p of opened) await p.close();
  await page.bringToFront();
}

await step('the Share button sits in the header, right next to 🏆 (icon + text on a computer), visible; nothing opens by itself', async () => {
  const g = await D.evaluate(() => {
    const r = id => document.getElementById(id).getBoundingClientRect();
    const s = r('share-open'), l = r('lb-open'), h = document.getElementById('header').getBoundingClientRect();
    const txt = document.querySelector('#share-open .lb-text').getBoundingClientRect();
    return { sw: s.width, sh: s.height, sRight: s.right, sLeft: s.left, sTop: s.top, lLeft: l.left, lTop: l.top, lRight: l.right, hLeft: h.left, hRight: h.right, hTop: h.top, sBottom: s.bottom,
      textShown: txt.width > 10 && txt.height > 5, hasIcon: !!document.querySelector('#share-open svg'), aria: document.getElementById('share-open').getAttribute('aria-label'),
      text: document.querySelector('#share-open .lb-text').textContent, open: !document.getElementById('share-modal').hidden };
  });
  assert.ok(g.sw > 0 && g.sh > 0);
  assert.ok(g.lRight <= g.sLeft && g.sLeft - g.lRight < 20, `Share must be right next to 🏆 (${g.lRight} → ${g.sLeft})`);
  assert.ok(Math.abs(g.sTop - g.lTop) <= 2, 'same row as 🏆');
  assert.ok(g.lLeft >= g.hLeft - 1 && g.sRight <= g.hRight + 1, 'inside the width of the header');
  assert.ok(g.sBottom > g.hTop, 'part of the header, not above it');
  assert.ok(g.hasIcon && g.textShown, 'icon + text on a computer');
  assert.equal(g.text, 'Share');
  assert.equal(g.aria, 'Share');
  assert.equal(g.open, false);
});

await step('the popup shows the real logo, name, slogan, description and the four buttons (EN)', async () => {
  await openShare(D);
  await D.waitForFunction(() => document.getElementById('share-logo').complete && document.getElementById('share-logo').naturalWidth > 0);
  const logo = await D.$eval('#share-logo', el => ({ src: new URL(el.src).pathname, w: el.naturalWidth, shown: el.getBoundingClientRect().width }));
  assert.match(logo.src, /\/assets\/logo-sudoku\.png$/);
  assert.ok(logo.w >= 300 && logo.shown >= 100);
  const st = await readShare(D);
  for (const k of ['title', 'slogan', 'desc']) assert.equal(norm(st[k]), TXT.en[k], k);
  assert.equal(norm(st.fb), TXT.en.fb); assert.equal(norm(st.ms), TXT.en.ms); assert.equal(norm(st.wa), TXT.en.wa); assert.equal(norm(st.copy), TXT.en.copy);
  const geo = await D.evaluate(() => {
    const c = document.getElementById('share-card').getBoundingClientRect(), m = document.getElementById('share-modal');
    return { cx: (c.left + c.right) / 2, cy: (c.top + c.bottom) / 2, vw: innerWidth, vh: innerHeight, bg: getComputedStyle(m).backgroundColor, blur: getComputedStyle(m).backdropFilter, cls: document.body.classList.contains('popup-open'),
      card: getComputedStyle(document.getElementById('share-card')).backgroundColor, lbCard: getComputedStyle(document.getElementById('scoreboard')).backgroundColor, lbModalBg: getComputedStyle(document.getElementById('lb-modal')).backgroundColor };
  });
  assert.ok(Math.abs(geo.cx - geo.vw / 2) <= 2 && Math.abs(geo.cy - geo.vh / 2) <= 2, 'centred');
  assert.equal(geo.card, geo.lbCard, 'same card style as the leaderboard');
  assert.equal(geo.bg, geo.lbModalBg, 'same light dimming as the leaderboard');
  assert.equal(geo.blur, 'none'); assert.equal(geo.cls, true);
  await closeShare(D);
});

await step('closing: outside, passive spot inside, ✕, Esc — and the share buttons never close it', async () => {
  const open = () => shareIsOpen(D);
  await openShare(D); await D.mouse.click(6, 6);                       assert.equal(await open(), false, 'outside click');
  await openShare(D); await D.click('#share-title');                    assert.equal(await open(), false, 'click on the title');
  await openShare(D); await D.click('#share-desc');                     assert.equal(await open(), false, 'click on the description');
  await openShare(D); await D.click('#share-close');                    assert.equal(await open(), false, '✕');
  await openShare(D); await D.keyboard.press('Escape');                 assert.equal(await open(), false, 'Esc');
  assert.equal(await D.evaluate(() => document.activeElement.id), 'share-open', 'focus goes back to the Share button');
  await openShare(D);
  const gap = await D.evaluate(() => { const a = document.getElementById('share-fb').getBoundingClientRect(), b = document.getElementById('share-ms').getBoundingClientRect(); return { x: (a.left + a.right) / 2, y: (a.bottom + b.top) / 2 }; });
  await D.mouse.click(gap.x, gap.y);                                    assert.equal(await open(), true, 'the gap between two buttons closed it');
  await clickAndCloseNewTab(Dctx, D, '#share-fb');                      assert.equal(await open(), true, 'Facebook closed it');
  await clickAndCloseNewTab(Dctx, D, '#share-ms');                      assert.equal(await open(), true, 'Messenger closed it');
  await clickAndCloseNewTab(Dctx, D, '#share-wa');                      assert.equal(await open(), true, 'WhatsApp closed it');
  await D.click('#share-copy');                                         assert.equal(await open(), true, 'Copy closed it');
  assert.ok(D.url().includes('sudoku.html'), 'the game page itself did not navigate');
  // game keys are inert while it is open
  const before = await D.evaluate(() => JSON.stringify(board));
  await D.keyboard.press('5'); await D.keyboard.press('ArrowRight');
  assert.equal(await D.evaluate(() => JSON.stringify(board)), before);
  await D.keyboard.press('Escape');                                     assert.equal(await open(), false);
});

await step('Facebook, Messenger and WhatsApp links in English, French and Polish (exact text, public share page, new tab)', async () => {
  for (const lang of ['en', 'pl', 'fr']) {
    await setLang(D, lang);
    await openShare(D);
    const st = await readShare(D);
    const e = TXT[lang];
    assert.equal(norm(st.btn), e.btn);
    for (const k of ['title', 'slogan', 'desc', 'fb', 'ms', 'wa', 'copy']) assert.equal(norm(st[k]), e[k], `${lang} ${k}`);
    const fb = new URL(st.fbHref);
    assert.equal(fb.origin + fb.pathname, 'https://www.facebook.com/sharer/sharer.php');
    assert.equal(fb.searchParams.get('u'), SHARE[lang]);
    assert.deepEqual([...fb.searchParams.keys()], ['u'], 'only the link is passed to Facebook');
    const wa = new URL(st.waHref);
    assert.equal(wa.origin + wa.pathname, 'https://api.whatsapp.com/send');
    assert.equal(wa.searchParams.get('text'), WA_MSG[lang] + SHARE[lang], `${lang} WhatsApp message`);
    assert.ok(!/\d:\d\d|score|time/i.test(wa.searchParams.get('text').replace(/Sudoku World/g, '')), 'no score in the message');
    assert.equal(st.msHref, 'https://www.messenger.com/', 'computer: Messenger opens messenger.com (no app id needed)');
    for (const [t, r] of [[st.fbTarget, st.fbRel], [st.msTarget, st.msRel], [st.waTarget, st.waRel]]) { assert.equal(t, '_blank'); assert.match(r, /noopener/); }
    await closeShare(D);
  }
  await setLang(D, 'en');
});

await step('Copy link: the public share page of the current language lands in the clipboard, with a discreet confirmation', async () => {
  for (const lang of ['en', 'pl', 'fr']) {
    await setLang(D, lang);
    await openShare(D);
    await D.bringToFront();
    await D.evaluate(() => navigator.clipboard.writeText('before'));
    await D.click('#share-copy');
    await D.waitForFunction(() => document.getElementById('share-status').textContent !== '');
    assert.equal(await D.evaluate(() => navigator.clipboard.readText()), SHARE[lang]);
    assert.equal(norm(await D.$eval('#share-status', el => el.textContent)), TXT[lang].copied);
    assert.equal(await D.$eval('#share-manual', el => el.classList.contains('on')), false);
    assert.equal(await shareIsOpen(D), true);
    if (lang === 'en') { await sleep(3000); assert.equal(await D.$eval('#share-status', el => el.textContent), '', 'the confirmation fades by itself'); }
    await closeShare(D);
  }
  await setLang(D, 'en');
});

await step('Copy link fallbacks: no Clipboard API → execCommand; permission refused → execCommand; nothing works → link shown, selected', async () => {
  await openShare(D);
  const cleanup = () => D.evaluate(() => { delete navigator.clipboard; delete document.execCommand; });
  // 1) no async Clipboard API at all
  await D.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    window.__copied = null;
    document.execCommand = cmd => { const a = document.activeElement; window.__copied = cmd === 'copy' ? a.value.substring(a.selectionStart, a.selectionEnd) : null; return true; };
  });
  await D.click('#share-copy');
  assert.equal(await D.evaluate(() => window.__copied), SHARE.en, 'execCommand copied the selected link');
  assert.equal(norm(await D.$eval('#share-status', el => el.textContent)), TXT.en.copied);
  // 2) the Clipboard API refuses (permission denied)
  await D.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }, configurable: true });
    window.__copied = null;
  });
  await D.click('#share-copy');
  assert.equal(await D.evaluate(() => window.__copied), SHARE.en);
  // 3) nothing works: the link is shown and selected so it can be copied by hand
  await D.evaluate(() => { document.execCommand = () => false; });
  await D.click('#share-copy');
  const man = await D.evaluate(() => { const i = document.getElementById('share-manual'); return { on: i.classList.contains('on'), v: i.value, focus: document.activeElement === i, sel: [i.selectionStart, i.selectionEnd], ro: i.readOnly, status: document.getElementById('share-status').textContent }; });
  assert.deepEqual([man.on, man.v, man.focus, man.ro], [true, SHARE.en, true, true]);
  assert.deepEqual(man.sel, [0, SHARE.en.length]);
  assert.equal(man.status, 'Copy the link below');
  assert.equal(await shareIsOpen(D), true);
  await sleep(3000);
  assert.equal(await D.$eval('#share-status', el => el.textContent), 'Copy the link below', 'the instruction stays while the link is shown');
  await cleanup();
  await closeShare(D);
  await openShare(D);                                                  // reopening resets the fallback field
  assert.equal(await D.$eval('#share-manual', el => el.classList.contains('on')), false);
  await closeShare(D);
});

await step('Messenger on a computer: messenger.com opens in a new tab, the share link is copied, and the instruction stays up (EN, FR and PL)', async () => {
  for (const lang of ['en', 'pl', 'fr']) {
    await setLang(D, lang);
    await openShare(D);
    await D.bringToFront();
    await D.evaluate(() => navigator.clipboard.writeText('before'));
    await clickAndCloseNewTab(Dctx, D, '#share-ms');
    await D.waitForFunction(() => document.getElementById('share-status').textContent !== '');
    assert.equal(await D.evaluate(() => navigator.clipboard.readText()), SHARE[lang]);
    assert.equal(norm(await D.$eval('#share-status', el => el.textContent)), TXT[lang].msCopied);
    await sleep(3000);
    assert.equal(norm(await D.$eval('#share-status', el => el.textContent)), TXT[lang].msCopied, 'the instruction stays: the player is in another tab meanwhile');
    assert.equal(await shareIsOpen(D), true);
    await closeShare(D);
    await openShare(D);
    assert.equal(await D.$eval('#share-status', el => el.textContent), '', 'reopening the popup clears it');
    await closeShare(D);
  }
  await setLang(D, 'en');
});

await step('Messenger on a phone: its own link opens the app; when nothing opens the link is copied and the player is told (EN, FR and PL)', async () => {
  const ctx = await browserB.createBrowserContext();
  await ctx.overridePermissions(`http://localhost:${PORT}`, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const M = await ctx.newPage();
  await M.setViewport(PHONE);
  await M.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1');
  M.on('pageerror', e => problems.push(`[Mmessenger] pageerror: ${e.message}`));
  await M.goto(BASE, { waitUntil: 'load' });
  await M.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  await M.waitForSelector('#nick-modal:not([hidden])');
  await M.tap('#nick-cancel');
  await enterGame(M);
  for (const lang of ['en', 'pl', 'fr']) {
    await setLang(M, lang, true);
    await openShare(M, true);
    await M.bringToFront();
    const st = await readShare(M);
    assert.equal(st.msHref, 'fb-messenger://share/?link=' + encodeURIComponent(SHARE[lang]), `${lang}: the Messenger share link`);
    assert.equal(st.msTarget, null, 'an app link opens in place, not in a blank tab');
    assert.equal(norm(st.ms), TXT[lang].ms);
    // 1) no Messenger app (the headless browser has none): the page stays in front, so the link is copied and the player is told
    await M.evaluate(() => navigator.clipboard.writeText('before'));
    await M.click('#share-ms');
    assert.equal(await M.$eval('#share-status', el => el.textContent), '', 'nothing is said while we wait for the app');
    await M.waitForFunction(() => document.getElementById('share-status').textContent !== '', { timeout: 4000 });
    assert.equal(norm(await M.$eval('#share-status', el => el.textContent)), TXT[lang].msMissing);
    assert.equal(await M.evaluate(() => navigator.clipboard.readText()), SHARE[lang]);
    assert.equal(await shareIsOpen(M), true);
    // 2) the app takes over (simulated: the page goes to the background right after the tap): the clipboard is left alone
    await M.touchscreen.tap(8, 8);
    await M.waitForSelector('#share-modal', { hidden: true });
    await openShare(M, true);
    await M.evaluate(() => navigator.clipboard.writeText('before'));
    await M.click('#share-ms');
    await M.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(2200);
    await M.evaluate(() => { delete document.visibilityState; });
    assert.equal(await M.$eval('#share-status', el => el.textContent), '', 'the app opened: no message');
    assert.equal(await M.evaluate(() => navigator.clipboard.readText()), 'before', 'the app opened: the clipboard is untouched');
    // 3) closing the popup while we wait cancels the fallback
    await M.evaluate(() => navigator.clipboard.writeText('before'));
    await M.click('#share-ms');
    await M.touchscreen.tap(8, 8);
    await M.waitForSelector('#share-modal', { hidden: true });
    await sleep(2200);
    assert.equal(await M.evaluate(() => navigator.clipboard.readText()), 'before', 'popup closed: nothing is copied behind the player');
  }
  await ctx.close();
});

await step('a shared link opens the game in its language (?lang=) without overriding the saved choice; static FR / EN / PL pages redirect there; the browser language picks Polish by default', async () => {
  const origin = `http://localhost:${PORT}${SUB}`;
  const ctx = await browserB.createBrowserContext();
  const noFirebase = page => page.setRequestInterception(true).then(() => page.on('request', r => (/\/firebase-config\.js$/.test(r.url())
    ? r.respond({ status: 200, contentType: 'text/javascript', body: "export const firebaseConfig = { apiKey: 'YOUR_API_KEY', authDomain: 'x', projectId: 'YOUR_PROJECT_ID', appId: 'YOUR_APP_ID' }; export const appCheckSiteKey = '';" })
    : r.continue())));
  const info = page => page.evaluate(() => ({ lang, html: document.documentElement.lang, saved: localStorage.getItem('sudoku-lang'), search: location.search, btn: document.querySelector('#share-open span').textContent }));
  const P = await ctx.newPage();
  P.on('pageerror', e => problems.push(`[lang] pageerror: ${e.message}`));
  await noFirebase(P);
  for (const lang of ['fr', 'pl', 'en']) {
    await P.goto(`${origin}${lang}/`, { waitUntil: 'load' });           // the static page, then the redirect
    await P.waitForFunction(() => /sudoku\.html/.test(location.pathname), { timeout: 10000 });
    const i = await info(P);
    assert.equal(i.lang, lang); assert.equal(i.html, lang); assert.equal(i.saved, null, 'the link must not overwrite the saved choice');
    assert.equal(norm(i.btn), TXT[lang].btn);
    assert.match(i.search, new RegExp(`lang=${lang}`));
  }
  await P.goto(`${origin}sudoku.html?lang=fr&x=1`, { waitUntil: 'load' });
  await P.evaluate(() => localStorage.setItem('sudoku-lang', 'en'));   // a saved choice exists…
  await P.reload({ waitUntil: 'load' });
  assert.equal((await info(P)).lang, 'fr', '…but the link says French, for this visit');
  await P.click('#header .lang-toggle button[data-lang="en"]');
  const after = await info(P);
  assert.equal(after.lang, 'en'); assert.equal(after.saved, 'en');
  assert.ok(!/lang=/.test(after.search) && /x=1/.test(after.search), `the link's language is dropped once the player chooses (${after.search})`);
  await P.goto(`${origin}sudoku.html?lang=xx`, { waitUntil: 'load' });
  assert.ok(['en', 'fr', 'pl'].includes((await info(P)).lang), 'an unknown language is ignored');
  // no link, nothing saved: the browser language decides (Polish → PL, anything unknown → EN)
  for (const [nav, want] of [['pl-PL', 'pl'], ['fr-CA', 'fr'], ['de-DE', 'en']]) {
    const C = await browserB.createBrowserContext();                    // fresh storage: no saved choice
    const Q = await C.newPage();
    await noFirebase(Q);
    await Q.evaluateOnNewDocument(l => Object.defineProperty(navigator, 'language', { get: () => l }), nav);
    await Q.goto(`${origin}sudoku.html`, { waitUntil: 'load' });
    assert.equal((await info(Q)).lang, want, `browser language ${nav}`);
    await C.close();
  }
  await P.goto(`${origin}?x=1`, { waitUntil: 'load' });                  // the existing bare address still works
  await P.waitForFunction(() => /sudoku\.html/.test(location.pathname), { timeout: 10000 });
  await ctx.close();
});

await step('win screen: a discreet invitation to share; it never opens by itself and the score logic is untouched', async () => {
  await D.evaluate(() => { window.__opens = 0; const o = window.open; window.open = (...a) => { window.__opens++; return o.apply(window, a); }; });
  const tabs = (await Dctx.pages()).length;
  const t = await winGame(D, { mode: 'easy', time: 200, mistakes: 0, name: 'Zed' });
  assert.match(t, /Worldwide/, t);                                      // the worldwide result line is still there
  const inv = await D.evaluate(() => {
    const v = id => { const e = document.getElementById(id), b = e.getBoundingClientRect(); return { shown: getComputedStyle(e).display !== 'none' && b.width > 0, text: e.textContent }; };
    return { invite: v('ov-invite'), btn: v('ov-share'), saved: v('ov-saved'), online: v('ov-online'), nbtn: v('ov-newgame'), board: v('ov-scores'), title: v('ov-title'), msg: v('ov-msg'),
      inside: document.getElementById('ov-invite').getBoundingClientRect().bottom <= document.getElementById('board-wrap').getBoundingClientRect().bottom };
  });
  assert.ok(inv.invite.shown && inv.btn.shown && inv.inside);
  assert.equal(norm(inv.invite.text), '🏆 Well done! Challenge your friends! Share');
  for (const k of ['saved', 'online', 'nbtn', 'board', 'title', 'msg']) assert.ok(inv[k].shown, `${k} is still there`);
  await sleep(1500);
  assert.equal(await shareIsOpen(D), false, 'the share popup must not open by itself');
  assert.equal(await D.evaluate(() => window.__opens), 0);
  assert.equal((await Dctx.pages()).length, tabs, 'no tab was opened');
  // the score was saved exactly as before (local + worldwide)
  assert.ok(await D.evaluate(() => loadScores(scoreKey()).some(s => s.time === 200 && s.name === 'Zed')));
  assert.equal((await serverScores()).filter(s => s.board === 'easy' && s.nickname === 'Zed' && s.time === 200).length, 1);
  // French wording, then the click opens the popup (and only then)
  await setLang(D, 'fr');
  assert.equal(norm(await D.$eval('#ov-invite', el => el.textContent)), '🏆 Bravo ! Défie tes amis ! Partager');
  await setLang(D, 'en');
  await D.click('#ov-share');
  await D.waitForSelector('#share-modal:not([hidden])');
  assert.equal(await D.evaluate(() => window.__opens), 0, 'opening the popup shares nothing');
  await D.keyboard.press('Escape');
  await D.waitForSelector('#share-modal', { hidden: true });
  assert.equal(await D.evaluate(() => document.activeElement.id), 'ov-share');
  // no invitation on the game-over screen, nor once a new game started
  await D.click('#ov-newgame');
  assert.equal(await D.$eval('#ov-invite', el => getComputedStyle(el).display), 'none');
  await D.evaluate(() => doGameOver());
  assert.equal(await D.$eval('#ov-invite', el => getComputedStyle(el).display), 'none', 'no invitation after a loss');
  await D.click('#ov-newgame');
});

await step('phone 390 px (EN, FR and PL), touch: buttons fit, popup fits, share and copy work; also 320 px and landscape', async () => {
  const ctx = await browserB.createBrowserContext();
  await ctx.overridePermissions(`http://localhost:${PORT}`, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const M = await ctx.newPage();
  await M.setViewport(PHONE);
  M.on('pageerror', e => problems.push(`[Mshare] pageerror: ${e.message}`));
  await M.goto(BASE, { waitUntil: 'load' });
  await M.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  await M.waitForSelector('#nick-modal:not([hidden])');
  await M.tap('#nick-cancel');
  await enterGame(M);
  const fits = () => M.evaluate(() => {
    const r = id => document.getElementById(id).getBoundingClientRect(), s = r('share-open'), l = r('lb-open');
    const card = r('share-card');
    const btns = [...document.querySelectorAll('.share-btn')].map(b => ({ w: b.getBoundingClientRect().width, over: b.scrollWidth - b.clientWidth }));
    return { vw: innerWidth, vh: innerHeight, s: [s.left, s.right], l: [l.left, l.right], row: [s.top, l.top], ox: document.documentElement.scrollWidth - innerWidth,
      card: { l: card.left, r: card.right, t: card.top, b: card.bottom, sh: document.getElementById('share-card').scrollHeight, ch: document.getElementById('share-card').clientHeight }, btns,
      slogan: document.getElementById('share-slogan').scrollWidth - document.getElementById('share-slogan').clientWidth };
  });
  for (const lang of ['en', 'fr', 'pl']) {
    await setLang(M, lang, true);
    const a = await fits();
    assert.ok(a.l[0] >= 0 && a.s[1] <= a.vw && a.l[1] <= a.s[0], `header buttons overlap or leave the screen (${lang}): ${JSON.stringify(a)}`);
    assert.ok(Math.abs(a.row[0] - a.row[1]) <= 2 && a.ox <= 1);
    await openShare(M, true);
    const b = await fits();
    assert.ok(b.card.l >= 0 && b.card.r <= b.vw && b.card.t >= 0 && b.card.b <= b.vh, `popup outside the screen (${lang}): ${JSON.stringify(b.card)}`);
    assert.ok(b.btns.length === 4 && b.btns.every(x => x.w >= 250 && x.over <= 0), `a share button is too narrow or its label overflows (${lang}): ${JSON.stringify(b.btns)}`);
    assert.ok(b.slogan <= 0);
    await M.tap('#share-copy');
    await M.waitForFunction(() => document.getElementById('share-status').textContent !== '');
    await M.bringToFront();
    assert.equal(await M.evaluate(() => navigator.clipboard.readText()), SHARE[lang]);
    await clickAndCloseNewTab(ctx, M, '#share-wa');                    // (a click, not a tap: puppeteer's tap does not open tabs reliably)
    assert.equal(await shareIsOpen(M), true, 'tapping a share button must not close the popup');
    const shot = process.env.E2E_SHOT_DIR;
    if (shot) await M.screenshot({ path: path.join(shot, `share-phone-${lang}.png`) });
    await M.touchscreen.tap(8, 8);                                      // the dimmed backdrop
    await M.waitForSelector('#share-modal', { hidden: true });
  }
  // a very small phone
  await M.setViewport({ width: 320, height: 568, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await openShare(M, true);
  const small = await fits();
  assert.ok(small.l[0] >= 0 && small.s[1] <= small.vw && small.l[1] <= small.s[0], `320 px: ${JSON.stringify(small)}`);
  assert.ok(small.card.l >= 0 && small.card.r <= small.vw && small.card.b <= small.vh && small.btns.every(x => x.over <= 0), `320 px popup: ${JSON.stringify(small.card)}`);
  await M.touchscreen.tap(6, 6);
  await M.waitForSelector('#share-modal', { hidden: true });
  // landscape phone: short screen, the card scrolls and every button stays reachable
  await M.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await openShare(M, true);
  const land = await fits();
  assert.ok(land.card.t >= 0 && land.card.b <= land.vh, `landscape: card taller than the screen ${JSON.stringify(land.card)}`);
  await M.$eval('#share-card', el => { el.scrollTop = el.scrollHeight; });
  const last = await M.$eval('#share-copy', el => { const b = el.getBoundingClientRect(); return { y: b.bottom, vh: innerHeight }; });
  assert.ok(last.y <= last.vh, 'the last button must be reachable by scrolling');
  await M.tap('#share-copy');
  assert.equal(await shareIsOpen(M), true, 'a scrolling card is not closed by tapping its content');
  await ctx.close();
});

// ═══════════════════════════ Candidates button (pencil marks): toggle, themes, first-use tip, phones ═══════════════════════════
console.log('\nCandidates button\n');
const NO_FIREBASE = "export const firebaseConfig = { apiKey: 'YOUR_API_KEY', authDomain: 'x', projectId: 'YOUR_PROJECT_ID', appId: 'YOUR_APP_ID' }; export const appCheckSiteKey = '';";
// A fresh player (own context) on the game screen, online features off: these tests are about the keypad only
async function candPage(viewport, { lang = 'en', tap = false } = {}) {
  const ctx = await browserB.createBrowserContext();
  const P = await ctx.newPage();
  await P.setViewport(viewport);
  P.on('pageerror', e => problems.push(`[cand] pageerror: ${e.message}`));
  P.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) problems.push(`[cand] console.error: ${m.text()}`); });
  await P.setRequestInterception(true);
  P.on('request', r => (/\/firebase-config\.js$/.test(r.url()) ? r.respond({ status: 200, contentType: 'text/javascript', body: NO_FIREBASE }) : r.continue()));
  await P.evaluateOnNewDocument(l => { if (!localStorage.getItem('sudoku-lang')) localStorage.setItem('sudoku-lang', l); }, lang);
  await P.goto(`http://localhost:${PORT}${SUB}sudoku.html`, { waitUntil: 'load' });
  await enterGame(P);
  await P.waitForSelector('#notes-toggle', { visible: true });
  return { ctx, P };
}
const pressed = P => P.$eval('#notes-toggle', b => b.getAttribute('aria-pressed'));
const tipShown = P => P.$eval('#cand-tip', el => !el.hidden);
const tipFlag = P => P.evaluate(() => localStorage.getItem('sudoku-cand-tip'));
const setTheme = async (P, theme) => { if ((await P.$eval('body', b => b.classList.contains('day'))) !== (theme === 'day')) await P.click('#header .theme-toggle'); };
const setCand = async (P, on) => { if ((await pressed(P)) !== String(on)) await P.click('#notes-toggle'); };
const emptyCell = P => P.evaluate(() => { for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!puzzle[r][c]) return [r, c, solution[r][c]]; });

// WCAG contrast of computed colours (rgba blended over what is behind them)
const rgbaOf = s => { const m = (s.match(/[\d.]+/g) || []).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const candStyle = P => P.evaluate(() => {
  const b = document.getElementById('notes-toggle'), cs = getComputedStyle(b), box = getComputedStyle(b.querySelector('.cand-box')), label = getComputedStyle(b.querySelector('.cand-label'));
  const r = b.getBoundingClientRect();
  return { bg: cs.backgroundColor, border: cs.borderTopColor, bw: cs.borderTopWidth, fg: label.color, boxBorder: box.borderTopColor, boxBg: box.backgroundColor, tick: box.color, transform: cs.transform,
    outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, page: getComputedStyle(document.body).backgroundColor, w: r.width, h: r.height, pressed: b.getAttribute('aria-pressed') };
});

await step('Candidates button: label, real toggle (aria-pressed), same size ON and OFF, ✓ shape, click + N key + Space/Enter', async () => {
  const { ctx, P } = await candPage({ width: 1280, height: 800 });
  const txt = await P.$eval('#notes-toggle', b => b.querySelector('.cand-label').textContent);
  assert.equal(txt, 'Candidates');
  assert.equal(await P.$eval('#notes-toggle', b => b.tagName + ':' + b.type), 'BUTTON:button');
  assert.equal(await pressed(P), 'false');
  const size = async () => P.$eval('#notes-toggle', b => { const r = b.getBoundingClientRect(); return [r.width, r.height]; });
  const off = await size();
  const tick = () => P.$eval('#notes-toggle .cand-box', el => getComputedStyle(el).color);
  const tickOff = await tick();
  await P.click('#notes-toggle');
  assert.equal(await pressed(P), 'true');
  assert.equal(await P.evaluate(() => notesMode), true);
  assert.deepEqual(await size(), off, 'the button must not change size when switched on');
  assert.equal(await P.$eval('#notes-toggle .cand-label', e => e.textContent), 'Candidates', 'same label in both states');
  assert.notEqual(await tick(), tickOff, 'the ✓ shows only when ON');
  await P.click('#notes-toggle');
  assert.equal(await pressed(P), 'false'); assert.equal(await P.evaluate(() => notesMode), false);
  assert.equal(await tick(), tickOff);
  await P.keyboard.press('n');   assert.equal(await pressed(P), 'true');
  await P.keyboard.press('N');   assert.equal(await pressed(P), 'false');
  // keyboard navigation: Tab reaches it, a visible focus ring appears, Space and Enter toggle it
  await P.evaluate(() => document.activeElement && document.activeElement.blur());
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) { await P.keyboard.press('Tab'); reached = await P.evaluate(() => document.activeElement && document.activeElement.id === 'notes-toggle'); }
  assert.ok(reached, 'Tab never reached the Candidates button');
  const ring = await P.$eval('#notes-toggle', b => { const cs = getComputedStyle(b); return { fv: b.matches(':focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }; });
  assert.deepEqual([ring.fv, ring.style], [true, 'solid']); assert.ok(ring.width >= 2, 'visible focus ring');
  await P.keyboard.press('Space'); assert.equal(await pressed(P), 'true');
  await P.keyboard.press('Enter'); assert.equal(await pressed(P), 'false');
  await ctx.close();
});

await step('Day / Night × ON / OFF: contrast, distinct states, ✓ shape, hover, pressed, focus ring, same size (and screenshots)', async () => {
  const { ctx, P } = await candPage({ width: 1280, height: 800 });
  const sizes = [], seen = {}, borders = new Set();
  for (const theme of ['night', 'day']) {
    for (const on of [false, true]) {
      await setTheme(P, theme); await setCand(P, on);
      await P.mouse.move(5, 5); await sleep(300);
      const st = await candStyle(P);
      seen[`${theme}-${on}`] = st; sizes.push([st.w, st.h]);
      assert.equal(st.pressed, String(on));
      borders.add(st.bw);   // (the browser snaps it to whole screen pixels when the layout is scaled, so only equality matters)
      const page = rgbaOf(st.page), bg = over(rgbaOf(st.bg), page), fg = over(rgbaOf(st.fg), bg);
      assert.ok(contrast(fg, bg) >= 4.5, `${theme}/${on ? 'ON' : 'OFF'} label contrast ${contrast(fg, bg).toFixed(2)}`);
      const boxBorder = over(rgbaOf(st.boxBorder), bg);
      if (on) {
        const boxBg = over(rgbaOf(st.boxBg), bg), tick = over(rgbaOf(st.tick), boxBg);
        assert.ok(contrast(tick, boxBg) >= 4.5, `${theme} ON ✓ contrast ${contrast(tick, boxBg).toFixed(2)}`);
        assert.ok(contrast(boxBg, bg) >= 3, `${theme} ON box vs button ${contrast(boxBg, bg).toFixed(2)}`);
        assert.ok(contrast(over(rgbaOf(st.border), page), bg) >= 3 || contrast(over(rgbaOf(st.border), page), page) >= 3, `${theme} ON accent border`);
        assert.ok(bg.b > 150 && bg.g < 80 && bg.b > bg.r * 1.4, `${theme} ON background must be violet: ${JSON.stringify(bg)}`);
        if (theme === 'day') assert.ok(lum(bg) < 0.15, 'day ON background dark enough for white text');
        assert.ok(st.transform === 'none');
      } else {
        assert.ok(contrast(boxBorder, bg) >= 3, `${theme} OFF empty box outline ${contrast(boxBorder, bg).toFixed(2)}`);
        assert.ok(Math.abs(bg.b - bg.r) < 60, `${theme} OFF must look neutral, not violet: ${JSON.stringify(bg)}`);
        assert.equal(rgbaOf(st.tick).a === 0 || st.tick === 'rgba(0, 0, 0, 0)', true, '✓ invisible while OFF');
      }
      const box = await P.$eval('#numpad', e => { const r = e.getBoundingClientRect(); return { x: r.left - 10, y: r.top - 8, width: r.width + 20, height: r.height + 16 }; });
      const shot = process.env.E2E_SHOT_DIR;
      if (shot) await P.screenshot({ path: path.join(shot, `cand-${theme}-${on ? 'on' : 'off'}.png`), clip: box });
      // hover (a tint that is not the ON look) and pressed (a small press, text still readable), then focus ring
      await P.hover('#notes-toggle'); await sleep(250);
      const hv = await candStyle(P);
      assert.notEqual(hv.bg, st.bg, `${theme}/${on ? 'ON' : 'OFF'} hover must be visible`);
      assert.ok(contrast(over(rgbaOf(hv.fg), over(rgbaOf(hv.bg), page)), over(rgbaOf(hv.bg), page)) >= 4.5, 'hover contrast');
      if (!on) assert.equal(hv.pressed, 'false', 'hovering never looks like ON');
      await P.mouse.down(); await sleep(200);
      const pr = await candStyle(P);
      assert.notEqual(pr.transform, 'none', 'pressed feedback');
      assert.ok(contrast(over(rgbaOf(pr.fg), over(rgbaOf(pr.bg), page)), over(rgbaOf(pr.bg), page)) >= 4.5, 'pressed contrast');
      await P.mouse.move(5, 5); await P.mouse.up();          // released elsewhere: no click, the state is unchanged
      assert.equal(await pressed(P), String(on));
      await P.evaluate(() => document.activeElement && document.activeElement.blur());
      for (let i = 0; i < 60 && !(await P.evaluate(() => document.activeElement && document.activeElement.id === 'notes-toggle')); i++) await P.keyboard.press('Tab');
      const fo = await candStyle(P);
      const ring = fo.outline.match(/^(\w+) ([\d.]+)px (rgb.*)$/);
      assert.ok(ring && ring[1] === 'solid' && +ring[2] >= 2, `focus ring: ${fo.outline}`);   // 3 px, snapped to whole screen pixels on a scaled layout
      assert.ok(contrast(over(rgbaOf(ring[3]), page), page) >= 3, `${theme} focus ring contrast ${contrast(over(rgbaOf(ring[3]), page), page).toFixed(2)}`);
      await P.evaluate(() => document.activeElement.blur());
    }
  }
  assert.ok(sizes.every(s => s[0] === sizes[0][0] && s[1] === sizes[0][1]), `the button keeps its size in the four states: ${JSON.stringify(sizes)}`);
  assert.equal(borders.size, 1, `the border keeps its width in the four states: ${[...borders]}`);
  // ON and OFF are clearly different in each theme (not just a hue shift)
  for (const th of ['night', 'day']) {
    const a = rgbaOf(seen[`${th}-false`].bg), b = rgbaOf(seen[`${th}-true`].bg);
    assert.ok(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 150, `${th}: ON vs OFF backgrounds too close`);
  }
  await ctx.close();
});

await step('switching Day ⇄ Night while the mode is ON keeps it ON and working', async () => {
  const { ctx, P } = await candPage({ width: 1280, height: 800 });
  await setCand(P, true);
  for (let i = 0; i < 3; i++) {
    await P.click('#header .theme-toggle');
    assert.equal(await pressed(P), 'true', `ON must survive theme switch #${i + 1}`);
    assert.equal(await P.evaluate(() => notesMode), true);
  }
  const [r, c] = await emptyCell(P);
  await P.click(`.sd-cell[data-r="${r}"][data-c="${c}"]`);
  await P.keyboard.press('4');
  assert.equal(await P.evaluate((r, c) => notes[r][c].has(4), r, c), true, 'still entering candidates after the theme change');
  // and OFF stays OFF
  await setCand(P, false);
  await P.click('#header .theme-toggle');
  assert.equal(await pressed(P), 'false');
  await ctx.close();
});

await step('candidates: enter and remove them; no final digit is placed, no mistake is counted while the mode is ON', async () => {
  const { ctx, P } = await candPage({ width: 1280, height: 800 });
  const [r, c, sol] = await emptyCell(P);
  const wrong = sol === 7 ? 8 : 7;
  const cell = `.sd-cell[data-r="${r}"][data-c="${c}"]`;
  const state = () => P.evaluate((r, c, v) => ({ cand: [...notes[r][c]].sort(), board: board[r][c], mistakes, lost: document.querySelectorAll('.heart.lost').length, vis: cellEls[r][c].querySelectorAll('.note.vis').length, over: gameOver }), r, c);
  await P.click('#notes-toggle');
  await P.click(cell);
  await P.keyboard.press(String(wrong));                               // a wrong digit: only a candidate, no error
  let s = await state();
  assert.deepEqual([s.cand, s.board, s.mistakes, s.lost, s.vis], [[wrong], 0, 0, 0, 1]);
  await P.keyboard.press(String(sol));                                 // the right digit: also only a candidate
  s = await state();
  assert.deepEqual([s.cand, s.board, s.vis], [[Math.min(wrong, sol), Math.max(wrong, sol)], 0, 2]);
  await P.keyboard.press(String(wrong));                               // the same key again removes it
  s = await state();
  assert.deepEqual([s.cand, s.vis], [[sol], 1]);
  await P.keyboard.press('Delete');                                    // erase empties the cell
  s = await state();
  assert.deepEqual([s.cand, s.board, s.vis], [[], 0, 0]);
  // mouse way: pick a digit on the keypad, then the cell
  await P.click('.num-btn[data-v="2"]'); await P.click(cell);
  assert.deepEqual((await state()).cand, [2]);
  await P.click('.num-btn[data-v="2"]');                               // un-pick the digit
  // switching OFF puts digits back to normal: the right one is placed for good and clears the candidates
  await P.click('#notes-toggle');
  if (!(await P.evaluate(() => selected))) await P.click(cell);          // (clicking the selected cell again would deselect it)
  await P.keyboard.press(String(sol));
  s = await state();
  assert.deepEqual([s.board, s.cand, s.mistakes], [sol, [], 0]);
  await ctx.close();
});

await step('first-use tip (FR, night): shown once next to the button, never over the digits, game stays playable, remembered', async () => {
  const { ctx, P } = await candPage({ width: 1280, height: 800 }, { lang: 'fr' });
  assert.equal(await tipShown(P), false);
  assert.equal(await tipFlag(P), null);
  const keysBefore = await P.evaluate(() => Object.keys(localStorage).sort());
  await P.click('#notes-toggle');
  assert.equal(await tipShown(P), true);
  assert.equal(await P.$eval('#cand-tip span', e => e.textContent), 'Inscris de petits chiffres possibles dans les cases.');
  assert.equal(await P.$eval('#notes-toggle .cand-label', e => e.textContent), 'Candidats');
  assert.equal(await tipFlag(P), '1');
  const keysAfter = await P.evaluate(() => Object.keys(localStorage).sort());
  assert.deepEqual(keysAfter.filter(k => !keysBefore.includes(k)), ['sudoku-cand-tip'], 'only the tip flag is added to localStorage');
  const g = await P.evaluate(() => {
    const r = e => e.getBoundingClientRect(), t = r(document.getElementById('cand-tip')), b = r(document.getElementById('notes-toggle'));
    const digits = [...document.querySelectorAll('.num-btn')].map(r);
    return { below: t.top >= b.bottom, inside: t.left >= 0 && t.right <= innerWidth && t.bottom <= innerHeight, hitsDigit: digits.some(d => !(t.right < d.left || t.left > d.right || t.bottom < d.top || t.top > d.bottom)),
      bg: getComputedStyle(document.getElementById('cand-tip')).backgroundColor, fg: getComputedStyle(document.getElementById('cand-tip')).color };
  });
  assert.deepEqual([g.below, g.inside, g.hitsDigit], [true, true, false], 'the tip sits under the button and covers no key');
  assert.ok(contrast(over(rgbaOf(g.fg), rgbaOf(g.bg)), rgbaOf(g.bg)) >= 4.5, 'night tip contrast');
  // the game is not blocked: a click on the board both works and dismisses the tip
  const [r, c] = await emptyCell(P);
  await P.click(`.sd-cell[data-r="${r}"][data-c="${c}"]`);
  assert.deepEqual(await P.evaluate(() => selected), { r, c });
  assert.equal(await tipShown(P), false, 'click outside dismisses it');
  // not shown again: off/on, and after a reload
  await P.click('#notes-toggle'); await P.click('#notes-toggle');
  assert.equal(await pressed(P), 'true'); assert.equal(await tipShown(P), false);
  await P.reload({ waitUntil: 'load' });
  await enterGame(P);
  await P.click('#notes-toggle');
  assert.equal(await pressed(P), 'true'); assert.equal(await tipShown(P), false, 'not shown again after a reload');
  assert.equal(await tipFlag(P), '1');
  await ctx.close();
});

await step('first-use tip (EN, day): ✕ closes it, Esc closes it first, key N shows it too, turning the mode off hides it, contrast', async () => {
  // via the N key, closed with the ✕
  let { ctx, P } = await candPage({ width: 1280, height: 800 }, { lang: 'en' });
  await setTheme(P, 'day');
  await P.keyboard.press('n');
  assert.equal(await tipShown(P), true);
  assert.equal(await P.$eval('#cand-tip span', e => e.textContent), 'Add possible numbers as small notes in cells.');
  assert.equal(await P.$eval('#cand-tip-close', e => e.getAttribute('aria-label')), 'Close');
  const dayTip = await P.evaluate(() => ({ bg: getComputedStyle(document.getElementById('cand-tip')).backgroundColor, fg: getComputedStyle(document.getElementById('cand-tip')).color }));
  assert.ok(contrast(over(rgbaOf(dayTip.fg), rgbaOf(dayTip.bg)), rgbaOf(dayTip.bg)) >= 4.5, 'day tip contrast');
  const shot = process.env.E2E_SHOT_DIR;
  if (shot) await P.screenshot({ path: path.join(shot, 'cand-day-tip.png'), clip: await P.$eval('#numpad', e => { const r = e.getBoundingClientRect(); return { x: r.left - 10, y: r.top - 8, width: r.width + 20, height: r.height + 80 }; }) });
  await P.click('#cand-tip-close');
  assert.equal(await tipShown(P), false); assert.equal(await pressed(P), 'true', 'closing the tip does not change the mode');
  await ctx.close();
  // Esc closes the tip before it deselects the cell
  ({ ctx, P } = await candPage({ width: 1280, height: 800 }, { lang: 'en' }));
  const [r, c] = await emptyCell(P);
  await P.click(`.sd-cell[data-r="${r}"][data-c="${c}"]`);
  await P.keyboard.press('n');
  assert.equal(await tipShown(P), true);
  await P.keyboard.press('Escape');
  assert.deepEqual([await tipShown(P), await P.evaluate(() => selected !== null)], [false, true], 'first Esc: tip only');
  await P.keyboard.press('Escape');
  assert.equal(await P.evaluate(() => selected), null, 'second Esc: the usual deselect');
  await ctx.close();
  // turning the mode off while the tip is showing hides it
  ({ ctx, P } = await candPage({ width: 1280, height: 800 }, { lang: 'en' }));
  await P.click('#notes-toggle'); assert.equal(await tipShown(P), true);
  await P.keyboard.press('n');
  assert.deepEqual([await pressed(P), await tipShown(P)], ['false', false]);
  await ctx.close();
});

await step('phones 320 / 375 / 390 px, touch, English, French and Polish: ≥ 44 px target, label complete, no overflow, aligned, tip on screen', async () => {
  const shot = process.env.E2E_SHOT_DIR;
  for (const w of [320, 375, 390]) {
    for (const lang of ['en', 'fr', 'pl']) {
      const { ctx, P } = await candPage({ width: w, height: w === 320 ? 568 : 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { lang, tap: true });
      const m = await P.evaluate(() => {
        const r = e => e.getBoundingClientRect(), b = document.getElementById('notes-toggle'), pad = document.getElementById('numpad'), br = r(b), pr = r(pad);
        const lab = b.querySelector('.cand-label'), digits = [...document.querySelectorAll('.num-btn[data-v]')].map(r);
        return { vw: innerWidth, w: br.width, h: br.height, left: br.left, right: br.right, padLeft: pr.left, padRight: pr.right, ox: document.documentElement.scrollWidth - innerWidth,
          btnOver: b.scrollWidth - b.clientWidth, labOver: lab.scrollWidth - lab.clientWidth, label: lab.textContent, fontPx: parseFloat(getComputedStyle(lab).fontSize) * (r(b).width / b.offsetWidth),
          dh: Math.min(...digits.map(d => d.height)), dw: Math.min(...digits.map(d => d.width)), nd: digits.length, fit: +getComputedStyle(document.documentElement).getPropertyValue('--fit') };
      });
      const tag = `${w}px ${lang}`;
      assert.equal(m.label, { en: 'Candidates', fr: 'Candidats', pl: 'Notatki' }[lang]);
      assert.ok(m.w >= 44 && m.h >= 43.5, `${tag}: touch target ${m.w.toFixed(1)}×${m.h.toFixed(1)}`);
      assert.ok(m.left >= 0 && m.right <= m.vw && m.ox <= 1, `${tag}: horizontal overflow`);
      assert.ok(Math.abs(m.left - m.padLeft) <= 1.5 && Math.abs(m.right - m.padRight) <= 1.5, `${tag}: not aligned with the keypad`);
      assert.ok(m.btnOver <= 0 && m.labOver <= 0, `${tag}: label cut off`);
      assert.ok(m.fontPx >= 14, `${tag}: label text only ${m.fontPx.toFixed(1)} px on screen`);
      assert.ok(m.nd === 10 && m.dh >= 43.5 && m.dw >= 40, `${tag}: digit keys ${m.dw.toFixed(1)}×${m.dh.toFixed(1)}`);
      // tap it: pressed, tip on screen and clear of the keys; tap ✕
      await P.tap('#notes-toggle');
      assert.equal(await pressed(P), 'true');
      await P.waitForFunction(() => !document.getElementById('cand-tip').hidden);
      await sleep(800);                                                  // smooth scroll into view, if the page scrolls
      const t = await P.evaluate(() => {
        const r = e => e.getBoundingClientRect(), tip = r(document.getElementById('cand-tip')), b = r(document.getElementById('notes-toggle'));
        return { l: tip.left, r: tip.right, top: tip.top, bottom: tip.bottom, vw: innerWidth, vh: innerHeight, below: tip.top >= b.bottom,
          keys: [...document.querySelectorAll('.num-btn')].some(d => { const x = r(d); return !(tip.right < x.left || tip.left > x.right || tip.bottom < x.top || tip.top > x.bottom); }), over: document.documentElement.scrollWidth - innerWidth };
      });
      assert.ok(t.l >= 0 && t.r <= t.vw && t.below && !t.keys && t.over <= 1, `${tag}: tip placement ${JSON.stringify(t)}`);
      assert.ok(t.top >= 0 && t.bottom <= t.vh + 1, `${tag}: the tip is not visible on screen (${t.top}–${t.bottom} of ${t.vh})`);
      if (shot && (w === 320 || w === 390)) await P.screenshot({ path: path.join(shot, `cand-phone-${w}-${lang}.png`) });
      await P.tap('#cand-tip-close');
      assert.equal(await tipShown(P), false);
      assert.equal(await pressed(P), 'true');
      // the keypad still works: a candidate by touch (cell, then a key of the keypad)
      const [r, c] = await emptyCell(P);
      await P.tap(`.sd-cell[data-r="${r}"][data-c="${c}"]`);
      await P.tap('.num-btn[data-v="6"]');
      await P.tap(`.sd-cell[data-r="${r}"][data-c="${c}"]`);
      assert.equal(await P.evaluate((r, c) => notes[r][c].has(6) && board[r][c] === 0, r, c), true, `${tag}: candidate by touch`);
      await ctx.close();
    }
  }
});

// ═══════════════════════════ header: two rows of controls + the stats row, computer and phone ═══════════════════════════
console.log('\nHeader layout\n');
const HEADER_TXT = {
  en: { lb: 'Leaderboard', share: 'Share', diffs: ['Easy', 'Medium', 'Hard'], daily: 'Daily Challenge', newGame: 'New Game', stats: ['Time', 'Best', 'Mistakes'], theme: 'Toggle theme', cal: 'Calendar', language: 'Language', difficulty: 'Difficulty' },
  fr: { lb: 'Classement', share: 'Partager', diffs: ['Facile', 'Moyen', 'Expert'], daily: 'Défi du jour', newGame: 'Nouvelle partie', stats: ['Temps', 'Record', 'Erreurs'], theme: 'Changer de thème', cal: 'Calendrier', language: 'Langue', difficulty: 'Difficulté' },
  pl: { lb: 'Ranking', share: 'Udostępnij', diffs: ['Łatwy', 'Średni', 'Ekspert'], daily: 'Wyzwanie dnia', newGame: 'Nowa gra', stats: ['Czas', 'Rekord', 'Błędy'], theme: 'Zmień motyw', cal: 'Kalendarz', language: 'Język', difficulty: 'Poziom trudności' },
};
// every control of the header and the stats row, in the order they are meant to read on a computer
const HEADER_CTRL = {
  logo: '#header h1', lb: '#lb-open', share: '#share-open', langEn: '#header .lang-toggle [data-lang="en"]', langFr: '#header .lang-toggle [data-lang="fr"]', langPl: '#header .lang-toggle [data-lang="pl"]', theme: '#header .theme-toggle',
  easy: '.diff-btn[data-diff="easy"]', medium: '.diff-btn[data-diff="medium"]', hard: '.diff-btn[data-diff="hard"]', cal: '#home-btn', daily: '#daily-btn', newGame: '#newbtn',
  time: '#stats > :nth-child(1)', best: '#stats > :nth-child(2)', hearts: '#hearts-wrap', board: '#board',
};
const headerRects = (P, sels = HEADER_CTRL) => P.evaluate(sels => {
  const out = {};
  for (const [k, s] of Object.entries(sels)) { const e = document.querySelector(s), b = e.getBoundingClientRect(); out[k] = { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 }; }
  return out;
}, sels);
const overlapping = R => {
  const ks = Object.keys(R).filter(k => k !== 'board'), bad = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = R[ks[i]], b = R[ks[j]];
    if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) bad.push(`${ks[i]}×${ks[j]}`);
  }
  return bad;
};

await step('the FIRST page is the game with the Daily Challenge of the day, not the calendar (computer + phone, EN + FR + PL); 📅 opens the calendar, Play comes back; once the Daily is done a reload opens a regular game', async () => {
  for (const [vp, tap] of [[{ width: 1280, height: 800 }, false], [{ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true]]) for (const lang of ['en', 'fr', 'pl']) {
    const { ctx, P } = await candPage(vp, { lang, tap });
    const s = await P.evaluate(() => ({ home: document.body.classList.contains('home-open'), booting: document.body.classList.contains('booting'), daily: dailyMode, active: document.getElementById('daily-btn').classList.contains('active'),
      boardW: document.getElementById('board').getBoundingClientRect().width, calendarShown: getComputedStyle(document.getElementById('home')).display !== 'none', puzzle: JSON.stringify(puzzle),
      expect: JSON.stringify(generatePuzzleSeeded('medium', mulberry32(strToSeed('sudoku-daily-' + getDailyDateStr()))).puzzle), date: getDailyDateStr() }));
    assert.deepEqual([s.home, s.booting, s.calendarShown], [false, false, false], `${lang}: the calendar must not be the first page`);
    assert.ok(s.boardW > 200, 'the grid is on screen');
    assert.deepEqual([s.daily, s.active, s.puzzle === s.expect, s.date], [true, true, true, utcToday], `${lang}: today's Daily Challenge (UTC) is loaded`);
    await P.click('#home-btn');                                         // 📅 → calendar
    assert.equal(await P.evaluate(() => document.body.classList.contains('home-open')), true);
    await P.click('#home-play');                                        // Play → back to the Daily
    assert.equal(await P.evaluate(() => [document.body.classList.contains('home-open'), dailyMode]).then(x => x.join()), 'false,true');
    await ctx.close();
  }
  // Daily already done today: a reload opens a regular game (last difficulty: Easy), the Daily button shows its ✓
  const { ctx, P } = await candPage({ width: 1280, height: 800 }, { lang: 'en' });
  await P.evaluate(d => localStorage.setItem('sudoku-daily-' + d + '-done', '1'), utcToday);
  await P.reload({ waitUntil: 'load' });
  await enterGame(P);
  const r = await P.evaluate(() => ({ home: document.body.classList.contains('home-open'), daily: dailyMode, diff: difficulty, done: document.getElementById('daily-btn').classList.contains('done'), active: document.querySelector('#diff-btns .diff-btn.active')?.dataset.diff }));
  assert.deepEqual(r, { home: false, daily: false, diff: 'easy', done: true, active: 'easy' });
  await ctx.close();
});

await step('computer 1280×800 (EN + FR + PL): row 1 = logo · 🏆 Share || EN/FR/PL theme, row 2 = difficulty · calendar + daily · New Game, row 3 = Time · Best · Mistakes; exact labels', async () => {
  for (const lang of ['en', 'fr', 'pl']) {
    const { ctx, P } = await candPage({ width: 1280, height: 800 }, { lang });
    const X = HEADER_TXT[lang], R = await headerRects(P);
    const row1 = ['logo', 'lb', 'share', 'langEn', 'langFr', 'langPl', 'theme'], row2 = ['easy', 'medium', 'hard', 'cal', 'daily', 'newGame'];
    for (const [row, keys] of [['1', row1], ['2', row2]]) {
      for (let i = 1; i < keys.length; i++) assert.ok(R[keys[i]].l >= R[keys[i - 1]].r - 0.5, `${lang}: row ${row}: ${keys[i - 1]} → ${keys[i]} out of order`);
      for (const k of keys) assert.ok(Math.abs(R[k].cy - R[keys[0]].cy) <= 4, `${lang}: ${k} is not on row ${row} (${R[k].cy.toFixed(1)} vs ${R[keys[0]].cy.toFixed(1)})`);
    }
    assert.ok(R.easy.t > R.logo.b - 4 && R.easy.t > R.lb.b, `${lang}: row 2 under row 1`);
    // the two groups of row 1 are told apart by their spacing alone
    assert.ok(R.langEn.l - R.share.r > (R.share.l - R.lb.r) + 6, `${lang}: 🏆/Share must read as a group apart from EN-FR-PL/theme (gaps ${(R.share.l - R.lb.r).toFixed(1)} vs ${(R.langEn.l - R.share.r).toFixed(1)})`);
    // calendar and daily touch, difficulty is a separate group, New Game is the last of the row, flush right with the header
    assert.ok(R.daily.l - R.cal.r <= 6, `${lang}: calendar and daily must be one group`);
    assert.ok(R.cal.l - R.hard.r > R.daily.l - R.cal.r + 4, `${lang}: difficulty and daily groups must be apart`);
    const head = await P.$eval('#header', h => h.getBoundingClientRect().right);
    assert.ok(Math.abs(R.newGame.r - head) <= 3 && Math.abs(R.theme.r - head) <= 3, `${lang}: rows end at the right edge of the header`);
    // row 3: three boxes, one line, same size, then the grid right under
    const st = await P.evaluate(() => [...document.querySelectorAll('#stats > *')].map(e => { const b = e.getBoundingClientRect(); return { t: b.top, h: b.height, l: b.left, r: b.right, label: e.querySelector('.slabel, #hearts-label').textContent, bottom: b.bottom }; }));
    assert.deepEqual(st.map(s => s.label), X.stats);
    assert.ok(st.every(s => Math.abs(s.t - st[0].t) <= 1 && Math.abs(s.h - st[0].h) <= 1), `${lang}: Time / Best / Mistakes on one line, same height`);
    assert.ok(st[0].r <= st[1].l && st[1].r <= st[2].l);
    assert.ok(st[0].t >= R.newGame.b, `${lang}: stats under row 2`);
    assert.ok(R.board.t - st[0].bottom >= 4 && R.board.t - st[0].bottom <= 24, `${lang}: the grid starts right under the stats (${(R.board.t - st[0].bottom).toFixed(1)} px)`);
    assert.ok(R.board.t < 230, `${lang}: header + stats must leave room for the grid (grid top at ${R.board.t.toFixed(0)} px)`);
    assert.deepEqual(overlapping(R), [], `${lang}: controls overlap`);
    // exact texts and accessible names
    const t = await P.evaluate(() => {
      const tx = s => document.querySelector(s).textContent.trim(), ar = (s, a = 'aria-label') => document.querySelector(s).getAttribute(a);
      return { lb: tx('#lb-open .lb-text'), share: tx('#share-open .lb-text'), diffs: ['easy', 'medium', 'hard'].map(d => tx(`.diff-btn[data-diff="${d}"]`)), daily: tx('#daily-btn'), newGame: tx('#newbtn'),
        lbAria: ar('#lb-open'), shareAria: ar('#share-open'), themeAria: ar('#header .theme-toggle'), calAria: ar('#home-btn'), langAria: ar('#header .lang-toggle'), diffAria: ar('#diff-btns'), calTitle: document.getElementById('home-btn').title };
    });
    assert.deepEqual([t.lb, t.share, t.diffs, t.daily, t.newGame], [X.lb, X.share, X.diffs, X.daily, X.newGame], `${lang}: labels`);
    assert.deepEqual([t.lbAria, t.shareAria, t.themeAria, t.calAria, t.langAria, t.diffAria, t.calTitle], [X.lb, X.share, X.theme, X.cal, X.language, X.difficulty, X.cal], `${lang}: accessible names`);
    await ctx.close();
  }
});

await step('"NEW" tag on the PL button (game header and calendar screen): shown to a player who has not used Polish, purely decorative and never moves the header; gone for good once Polish is used, and after a month', async () => {
  const PL = '#header .lang-toggle [data-lang="pl"]';
  const tags = P => P.evaluate(() => [...document.querySelectorAll('.lang-toggle button[data-lang="pl"]')].map(b => {
    const cs = getComputedStyle(b, '::after');
    return { is: b.classList.contains('is-new'), text: b.textContent.trim(), content: cs.content, events: cs.pointerEvents, aria: b.getAttribute('aria-label') };
  }));
  const seen = P => P.evaluate(() => localStorage.getItem('sudoku-pl-new-seen'));
  for (const [vp, where] of [[{ width: 1280, height: 800 }, 'computer'], [{ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'phone'], [{ width: 320, height: 568, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'narrow phone']]) {
    const { ctx, P } = await candPage(vp, { lang: 'fr' });
    const T = await tags(P);
    assert.equal(T.length, 2, `${where}: one PL button in the game header, one on the calendar screen`);
    for (const x of T) {
      assert.ok(x.is && /NEW/.test(x.content), `${where}: the tag is shown (${x.content})`);
      assert.equal(x.text, 'PL', `${where}: the tag adds no text to the button`);
      assert.equal(x.events, 'none', `${where}: clicks go through the tag`);
      assert.equal(x.aria, null, `${where}: the button keeps its own name`);
    }
    // it floats: taking it away moves nothing and adds no scrolling
    const keys = ['logo', 'lb', 'share', 'langEn', 'langFr', 'langPl', 'theme', 'easy', 'medium', 'hard', 'cal', 'daily', 'newGame'];
    const sels = Object.fromEntries(keys.map(k => [k, HEADER_CTRL[k]]));
    const withTag = await headerRects(P, sels), ox = await P.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    await P.evaluate(() => document.querySelectorAll('.lang-toggle button').forEach(b => b.classList.remove('is-new')));
    assert.deepEqual(await headerRects(P, sels), withTag, `${where}: the tag must not move any control`);
    assert.ok(ox <= 0, `${where}: the tag must not make the page scroll sideways (${ox} px)`);
    await ctx.close();
  }
  // using Polish ends it, for good (all PL buttons, also after going back to another language and after a reload)
  {
    const { ctx, P } = await candPage({ width: 1280, height: 800 }, { lang: 'fr' });
    assert.equal(await seen(P), null);
    await P.click(PL);
    assert.deepEqual((await tags(P)).map(x => x.is), [false, false], 'picking Polish removes the tag');
    assert.equal(await seen(P), '1');
    await P.click('#header .lang-toggle [data-lang="en"]');
    assert.deepEqual((await tags(P)).map(x => x.is), [false, false], 'it does not come back with another language');
    await P.reload({ waitUntil: 'load' }); await enterGame(P);
    assert.deepEqual((await tags(P)).map(x => x.is), [false, false], 'nor after a reload');
    await ctx.close();
  }
  // a player who already reads the game in Polish (saved choice, link or browser) never sees it
  {
    const { ctx, P } = await candPage({ width: 1280, height: 800 }, { lang: 'pl' });
    assert.deepEqual((await tags(P)).map(x => x.is), [false, false]);
    assert.equal(await seen(P), '1');
    await ctx.close();
  }
  // a month after the launch it is gone for everybody
  {
    const { ctx, P } = await candPage({ width: 1280, height: 800 }, { lang: 'fr' });
    assert.deepEqual((await tags(P)).map(x => x.is), [true, true]);
    await P.evaluateOnNewDocument(() => { Date.now = () => Date.UTC(2027, 0, 1); });
    await P.reload({ waitUntil: 'load' }); await enterGame(P);
    assert.deepEqual((await tags(P)).map(x => x.is), [false, false], 'the tag expires');
    await ctx.close();
  }
});

await step('the browser tab says exactly "Sudoku": calendar screen, game, every language, popups open; the entry pages too', async () => {
  const { ctx, P } = await candPage({ width: 1280, height: 800 }, { lang: 'en' });
  assert.equal(await P.title(), 'Sudoku');
  await P.click('#home-btn');                                           // the calendar screen
  assert.equal(await P.title(), 'Sudoku');
  await P.click('#home-play');
  await P.click('#header .lang-toggle [data-lang="fr"]');
  assert.equal(await P.title(), 'Sudoku');
  await P.click('#lb-open'); await P.waitForSelector('#lb-modal:not([hidden])');
  assert.equal(await P.title(), 'Sudoku');
  await P.keyboard.press('Escape');
  for (const url of ['', 'en/', 'fr/', 'pl/']) {
    const r = await fetch(`http://localhost:${PORT}${SUB}${url}`);
    assert.match(await r.text(), /<title>Sudoku<\/title>/, `entry page /${url}`);
  }
  await ctx.close();
});

await step('7 widths (320 375 390 430 768 1024 1440) × EN/FR/PL × Night/Day: no overflow, nothing cut, nothing overlapping, nothing covered; phones: icon-only 🏆/Share, 44 px targets, readable text', async () => {
  const shot = process.env.E2E_SHOT_DIR;
  const views = [{ width: 320, height: 568, phone: 1 }, { width: 375, height: 667, phone: 1 }, { width: 390, height: 844, phone: 1 }, { width: 430, height: 932, phone: 1 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }];
  for (const v of views) {
    const vp = v.phone ? { width: v.width, height: v.height, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { width: v.width, height: v.height };
    for (const lang of ['en', 'fr', 'pl']) {
      const { ctx, P } = await candPage(vp, { lang, tap: !!v.phone });
      for (const theme of ['night', 'day']) {
        await setTheme(P, theme);
        const tag = `${v.width}px ${lang} ${theme}`, X = HEADER_TXT[lang];
        const R = await headerRects(P);
        const info = await P.evaluate(() => {
          const px = e => parseFloat(getComputedStyle(e).fontSize) * (e.getBoundingClientRect().width / e.offsetWidth);
          const covered = [];
          for (const s of ['#lb-open', '#share-open', '#header .lang-toggle [data-lang="en"]', '#header .lang-toggle [data-lang="fr"]', '#header .lang-toggle [data-lang="pl"]', '#header .theme-toggle', '.diff-btn[data-diff="easy"]', '.diff-btn[data-diff="medium"]', '.diff-btn[data-diff="hard"]', '#home-btn', '#daily-btn', '#newbtn']) {
            const e = document.querySelector(s), b = e.getBoundingClientRect(), hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
            if (!hit || !(hit === e || e.contains(hit))) covered.push(s);
          }
          const txt = document.querySelector('#share-open .lb-text').getBoundingClientRect();
          return { ox: document.documentElement.scrollWidth - innerWidth, vw: innerWidth, stack: document.body.classList.contains('stack'), covered, textShown: txt.width > 10,
            fonts: { diff: px(document.querySelector('.diff-btn[data-diff="medium"]')), daily: px(document.getElementById('daily-btn')), newGame: px(document.getElementById('newbtn')), lang: px(document.querySelector('#header .lang-toggle button')), label: px(document.querySelector('#stats .slabel')), val: px(document.querySelector('#timer-el')) },
            lbName: document.getElementById('lb-open').getAttribute('aria-label'), shareName: document.getElementById('share-open').getAttribute('aria-label'),
            over: ['#lb-open', '#share-open', '#daily-btn', '#newbtn', '#diff-btns', '.daily-group', '#header .hd-row'].map(s => { const e = document.querySelector(s); return [s, e.scrollWidth - e.clientWidth]; }).filter(x => x[1] > 0) };
        });
        assert.ok(info.ox <= 1, `${tag}: horizontal overflow ${info.ox}px`);
        for (const [k, r] of Object.entries(R)) assert.ok(r.l >= -0.5 && r.r <= info.vw + 0.5 && r.w > 0 && r.h > 0, `${tag}: ${k} is cut or off screen (${r.l.toFixed(1)}–${r.r.toFixed(1)} of ${info.vw})`);
        assert.deepEqual(overlapping(R), [], `${tag}: controls overlap`);
        assert.deepEqual(info.covered, [], `${tag}: covered controls`);
        assert.deepEqual(info.over, [], `${tag}: a label is cut off`);
        assert.equal(info.stack, !!v.phone, `${tag}: layout mode`);
        assert.equal(info.lbName, X.lb); assert.equal(info.shareName, X.share);
        if (v.phone) {
          assert.equal(info.textShown, false, `${tag}: 🏆 / Share are icon-only on a phone`);
          for (const k of ['lb', 'share', 'theme']) assert.ok(R[k].w >= 43.5 && R[k].h >= 43.5, `${tag}: ${k} target ${R[k].w.toFixed(1)}×${R[k].h.toFixed(1)}`);
          for (const k of ['langEn', 'langFr', 'langPl']) assert.ok(R[k].h >= 35.5 && R[k].w >= 27.5, `${tag}: ${k} target ${R[k].w.toFixed(1)}×${R[k].h.toFixed(1)}`);
          assert.ok(R.cal.w >= 38 && R.cal.h >= 27, `${tag}: calendar target ${R.cal.w.toFixed(1)}×${R.cal.h.toFixed(1)}`);
          for (const k of ['easy', 'medium', 'hard', 'daily', 'newGame']) assert.ok(R[k].h >= 27 && R[k].w >= 40, `${tag}: ${k} target ${R[k].w.toFixed(1)}×${R[k].h.toFixed(1)}`);
          assert.ok(info.fonts.diff >= 11 && info.fonts.daily >= 10.5 && info.fonts.newGame >= 10.5 && info.fonts.lang >= 11, `${tag}: header text too small on screen ${JSON.stringify(info.fonts)}`);
          assert.ok(info.fonts.label >= 9 && info.fonts.val >= 15, `${tag}: stats text too small on screen ${JSON.stringify(info.fonts)}`);
          // New Game sits under the difficulty buttons, the calendar next to the daily button
          assert.ok(R.newGame.t >= R.easy.b - 0.5 && R.daily.t >= R.easy.b - 0.5, `${tag}: New Game and Daily go under the difficulty buttons`);
          assert.ok(R.daily.l - R.cal.r <= 6 && Math.abs(R.cal.cy - R.daily.cy) <= 3, `${tag}: calendar next to Daily`);
        } else {
          assert.equal(info.textShown, true, `${tag}: 🏆 / Share keep icon + text on a computer`);
        }
        // the stats stay on one line
        assert.ok(Math.abs(R.time.t - R.best.t) <= 1 && Math.abs(R.time.t - R.hearts.t) <= 1, `${tag}: Time / Best / Mistakes on one line`);
        if (shot && (v.width === 320 || v.width === 390 || v.width === 1024)) await P.screenshot({ path: path.join(shot, `header-${v.width}-${lang}-${theme}.png`) });
      }
      await ctx.close();
    }
  }
});

await step('short landscape phones (844×390, 667×375): nothing overflows or overlaps, every control reachable', async () => {
  for (const [w, h] of [[844, 390], [667, 375]]) for (const lang of ['en', 'fr', 'pl']) {
    const { ctx, P } = await candPage({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { lang, tap: true });
    const R = await headerRects(P), ox = await P.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(ox <= 1, `${w}×${h} ${lang}: horizontal overflow ${ox}`);
    for (const [k, r] of Object.entries(R)) assert.ok(r.l >= -0.5 && r.r <= w + 0.5 && r.w > 0, `${w}×${h} ${lang}: ${k} cut`);
    assert.deepEqual(overlapping(R), [], `${w}×${h} ${lang}: overlap`);
    await ctx.close();
  }
});

await step('the controls still do their job: difficulty, calendar, daily (UTC grid), New Game; popups open and close; theme and language keep the game as it is', async () => {
  const { ctx, P } = await candPage({ width: 1280, height: 800 }, { lang: 'en' });
  const state = () => P.evaluate(() => ({ difficulty, dailyMode, timerSecs, notesMode, board: JSON.stringify(board), puzzle: JSON.stringify(puzzle), mistakes, home: document.body.classList.contains('home-open'),
    active: [...document.querySelectorAll('#header .active')].map(e => e.dataset.diff || e.id || e.dataset.lang), clues: puzzle.flat().filter(Boolean).length, day: document.body.classList.contains('day'), lang }));
  // difficulty buttons pick the right grids
  const clues = {};
  for (const d of ['easy', 'medium', 'hard']) { await P.click(`.diff-btn[data-diff="${d}"]`); const s = await state(); assert.equal(s.difficulty, d); assert.equal(s.dailyMode, false); assert.ok(s.active.includes(d) && !s.active.includes('daily-btn'), `${d} highlighted: ${s.active}`); clues[d] = s.clues; }
  assert.ok(clues.easy > clues.medium && clues.medium > clues.hard, `easy > medium > hard clues: ${JSON.stringify(clues)}`);
  // daily: the UTC grid of today, exactly as the game computes it
  await P.click('#daily-btn');
  const daily = await P.evaluate(() => ({ dailyMode, active: document.getElementById('daily-btn').classList.contains('active'), puzzle: JSON.stringify(puzzle), expect: JSON.stringify(generatePuzzleSeeded('medium', mulberry32(strToSeed('sudoku-daily-' + getDailyDateStr()))).puzzle), date: getDailyDateStr(), anyDiff: !!document.querySelector('#diff-btns .diff-btn.active') }));
  assert.equal(daily.dailyMode, true); assert.equal(daily.active, true); assert.equal(daily.anyDiff, false);
  assert.equal(daily.puzzle, daily.expect); assert.equal(daily.date, utcToday);
  // New Game: leaves the daily, a fresh grid of the chosen level
  const before = await state();
  await P.click('#newbtn');
  const after = await state();
  assert.equal(after.dailyMode, false); assert.equal(after.timerSecs, 0); assert.notEqual(after.puzzle, before.puzzle); assert.ok(after.active.includes('hard'), 'New Game keeps the chosen level (hard was the last one picked)');
  // calendar → calendar screen; Play → the daily
  await P.click('#home-btn');
  assert.equal((await state()).home, true); assert.equal(await P.$eval('#home', h => getComputedStyle(h).display !== 'none'), true);
  await P.click('#home-play');
  assert.equal((await state()).home, false);
  // popups: Leaderboard and Share open and close normally
  await P.click('#lb-open'); await P.waitForSelector('#lb-modal:not([hidden])'); await P.keyboard.press('Escape'); await P.waitForSelector('#lb-modal', { hidden: true });
  await P.click('#share-open'); await P.waitForSelector('#share-modal:not([hidden])'); await P.click('#share-close'); await P.waitForSelector('#share-modal', { hidden: true });
  // theme + language switches in the middle of a game keep everything
  await P.click('.diff-btn[data-diff="hard"]');
  const [r, c, v] = await emptyCell(P);
  await P.click(`.sd-cell[data-r="${r}"][data-c="${c}"]`); await P.click(`.num-btn[data-v="${v}"]`);
  await P.click('#notes-toggle');
  await sleep(1300);
  const mid = await state();
  assert.ok(mid.timerSecs >= 1 && mid.notesMode === true);
  for (const act of [() => P.click('#header .theme-toggle'), () => P.click('#header .lang-toggle [data-lang="fr"]'), () => P.click('#header .theme-toggle'), () => P.click('#header .lang-toggle [data-lang="en"]')]) {
    await act();
    const s = await state();
    assert.equal(s.difficulty, 'hard'); assert.equal(s.board, mid.board); assert.equal(s.puzzle, mid.puzzle); assert.equal(s.notesMode, true); assert.ok(s.timerSecs >= mid.timerSecs, 'the timer keeps running'); assert.equal(s.mistakes, mid.mistakes);
    assert.ok(s.active.includes('hard'));
  }
  await ctx.close();
});

await step('keyboard: Tab walks the header in reading order, every stop has a visible focus ring, Enter/Space work', async () => {
  const { ctx, P } = await candPage({ width: 1280, height: 800 }, { lang: 'fr' });
  await P.evaluate(() => document.getElementById('lb-open').focus());
  await P.keyboard.down('Shift'); await P.keyboard.press('Tab'); await P.keyboard.up('Shift'); await P.keyboard.press('Tab');   // back on 🏆, by keyboard (so :focus-visible applies)
  const order = [], rings = [];
  for (let i = 0; i < 12; i++) {
    await sleep(260);                                                  // the ring may fade in (transition)
    const f = await P.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e), fit = +getComputedStyle(document.documentElement).getPropertyValue('--fit'); return { id: e.id || e.dataset.diff || e.dataset.lang || (e.classList.contains('theme-toggle') ? 'theme-toggle' : e.className), ring: s.outlineStyle === 'solid' && parseFloat(s.outlineWidth) * fit >= 1.9 && s.outlineColor === 'rgb(0, 204, 255)' }; });
    order.push(f.id); rings.push(f.ring);
    await P.keyboard.press('Tab');
  }
  assert.deepEqual(order, ['lb-open', 'share-open', 'en', 'fr', 'pl', 'theme-toggle', 'easy', 'medium', 'hard', 'home-btn', 'daily-btn', 'newbtn']);
  assert.ok(rings.every(Boolean), `every control shows a focus ring: ${JSON.stringify(rings)}`);
  await P.focus('.diff-btn[data-diff="medium"]'); await P.keyboard.press('Enter');
  assert.equal(await P.evaluate(() => difficulty), 'medium');
  await P.focus('#home-btn'); await P.keyboard.press('Space');
  assert.equal(await P.evaluate(() => document.body.classList.contains('home-open')), true);
  await ctx.close();
});

await step('hints use the Candidates vocabulary; the keypad row is complete (1-9 + erase) and the old pencil button is gone', async () => {
  for (const [lang, expect] of [['en', 'N = candidates'], ['fr', 'N = candidats']]) {
    const { ctx, P } = await candPage({ width: 1280, height: 800 }, { lang });
    assert.match(await P.$eval('#hint', h => h.textContent), new RegExp(expect));
    assert.doesNotMatch(await P.$eval('#hint', h => h.textContent) + await P.$eval('#notes-toggle', b => b.title), /notes?\b|pencil|crayon/i);
    assert.deepEqual(await P.$$eval('#numpad .num-btn', bs => bs.map(b => b.dataset.v)), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    assert.equal(await P.$$eval('#numpad .num-btn', bs => bs.some(b => b.textContent.trim() === '✎')), false);
    await ctx.close();
  }
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
