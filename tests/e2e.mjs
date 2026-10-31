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

// ── runner ─────────────────────────────────────────────────────────────────
let failed = 0, passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e) { failed++; console.log('  ✘', name, '\n     ', String(e.message).split('\n').join('\n      ')); }
}

console.log('\nEnd-to-end: two players, two browsers\n');
let A, B, uidA, uidB, tFirstWrite;

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
    const rows = await waitRows(p, r => r.length === 2, 'two daily rows');
    assert.deepEqual(rows.map(r => [r.rank, r.name, r.time, r.hearts]), [['1', 'Alice', '1:40', 3], ['2', 'Bob', '2:00', 2]]);
    assert.deepEqual(rows.filter(r => r.me).map(r => r.name), [me]);
  }
});

await step('the list updates by itself when another player submits (no reload)', async () => {
  await startMode(A, 'daily');
  const before = (await readRows(A)).length;
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
});

await step('score persistence: after a reload the same identity, nickname and ranking are back', async () => {
  await A.reload({ waitUntil: 'load' });
  await A.waitForFunction(() => window.SudokuOnline && window.SudokuOnline.available);
  assert.equal(await A.evaluate(() => SudokuOnline.userId()), uidA);
  assert.equal(await A.evaluate(() => SudokuOnline.getNickname()), 'Alice');
  await A.click('#home-play');
  await A.click('#daily-btn');
  const rows = await waitRows(A, r => r.length === 3, 'three daily rows after reload');
  assert.deepEqual(rows.map(r => r.name), ['Carol', 'Alice', 'Bob']);
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
  const rows = await waitRows(A, r => r.length === 2, 'two easy rows');
  assert.deepEqual(rows.map(r => [r.name, r.time, r.hearts]), [['Alice', '1:00', 3], ['Bob', '1:00', 1]]);
});

await step('a nickname change renames existing entries everywhere, live', async () => {
  await setNickname(A, 'Alicia', '#ol-nick');
  const rows = await waitRows(B, r => r.some(x => x.name === 'Alicia'), 'Bob to see the new name');
  assert.ok(!rows.some(r => r.name === 'Alice'));
  const mine = (await serverScores()).filter(s => s.uid === uidA);
  assert.ok(mine.length >= 2 && mine.every(s => s.nickname === 'Alicia'), JSON.stringify(mine));
});

await step('offline: the game stays playable, the result is queued, then sent when back online', async () => {
  await startMode(B, 'medium');
  await B.setOfflineMode(true);
  await B.waitForFunction(() => /offline|hors ligne/i.test(document.getElementById('ol-status').textContent), { timeout: 15000 });
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

await step('mobile layout (390×844, touch): scoreboard stacked, worldwide list fits the screen', async () => {
  const M = await newPage(browserA, 'mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await M.tap('#home-play');
  await M.tap('#daily-btn');
  await waitRows(M, r => r.length >= 3, 'daily rows on mobile');
  const m = await M.evaluate(() => ({
    stack: document.body.classList.contains('stack'),
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    rowsRight: Math.max(...[...document.querySelectorAll('#ol-list .sb-row')].map(r => r.getBoundingClientRect().right)),
    vw: window.innerWidth,
  }));
  assert.equal(m.stack, true);
  assert.ok(m.overflowX <= 1, `horizontal overflow ${m.overflowX}px`);
  assert.ok(m.rowsRight <= m.vw, `rows overflow the viewport (${m.rowsRight} > ${m.vw})`);
  const shot = process.env.E2E_SHOT_DIR;
  if (shot) { await M.evaluate(() => document.getElementById('scoreboard').scrollIntoView()); await M.screenshot({ path: path.join(shot, 'mobile-worldwide.png') }); }
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
  await P.waitForFunction(() => /unavailable/i.test(document.getElementById('ol-status').textContent), { timeout: 15000 });
  assert.equal(await P.$eval('#ol-status', el => el.classList.contains('warn')), true);
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
  await P.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
const noteworthy = problems.filter((p, i) => problems.indexOf(p) === i);
if (noteworthy.length) { console.log('\nBrowser errors seen:'); noteworthy.forEach(p => console.log('  -', p)); }

await browserA.close(); await browserB.close(); server.close();
process.exit(failed ? 1 : 0);
