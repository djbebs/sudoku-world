// Static checks of the sharing setup: the link-preview (Open Graph / Twitter) tags, the share images, the FR / EN share
// pages and the "no ads, no tracking" promise. Facebook and WhatsApp do not run JavaScript when they build a preview,
// so everything here is read straight from the HTML files, exactly as their robots read it. Run: npm run test:share
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITE = 'https://djbebs.github.io/sudoku-world/';
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// every <meta property|name="…" content="…"> of the raw HTML, scripts left out
function metas(html) {
  const out = {};
  const bare = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const m of bare.matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"\s*\/?>/g)) (out[m[1]] ||= []).push(m[2]);
  return out;
}
function jpegSize(buf) {
  assert.ok(buf[0] === 0xff && buf[1] === 0xd8, 'not a JPEG');
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no size in JPEG');
}

const EN = { locale: 'en_US', alt: 'fr_FR', image: 'assets/og-sudoku-en.jpg', title: 'Sudoku World – No ads. Just Sudoku.', desc: 'Free Sudoku. Daily challenges. Global leaderboard.' };
const FR = { locale: 'fr_FR', alt: 'en_US', image: 'assets/og-sudoku-fr.jpg', title: 'Sudoku World – Zéro pub. Juste du Sudoku.', desc: 'Sudoku gratuit. Défis quotidiens. Classement mondial.' };
const PAGES = [
  { file: 'index.html', url: SITE, ...EN },
  { file: 'sudoku.html', url: SITE + 'sudoku.html', ...EN },
  { file: 'en/index.html', url: SITE + 'en/', ...EN },
  { file: 'fr/index.html', url: SITE + 'fr/', ...FR },
];

for (const p of PAGES) {
  test(`${p.file}: every Open Graph / Twitter tag is in the static HTML, with the right values`, () => {
    const m = metas(read(p.file));
    const one = k => { assert.equal((m[k] || []).length, 1, `${k} must appear exactly once`); return m[k][0]; };
    assert.equal(one('og:title'), p.title);
    assert.equal(one('og:description'), p.desc);
    assert.equal(one('og:url'), p.url);
    assert.equal(one('og:type'), 'website');
    assert.equal(one('og:locale'), p.locale);
    assert.deepEqual(m['og:locale:alternate'], [p.alt]);
    assert.equal(one('og:site_name'), 'Sudoku World');
    assert.equal(one('og:image'), SITE + p.image);
    assert.equal(one('og:image:secure_url'), SITE + p.image);
    assert.equal(one('og:image:type'), 'image/jpeg');
    assert.equal(one('og:image:width'), '1200');
    assert.equal(one('og:image:height'), '630');
    assert.ok(one('og:image:alt').length > 10);
    assert.equal(one('twitter:card'), 'summary_large_image');
    assert.equal(one('twitter:title'), p.title);
    assert.equal(one('twitter:description'), p.desc);
    assert.equal(one('twitter:image'), SITE + p.image);
    for (const k of ['og:url', 'og:image', 'twitter:image']) assert.match(m[k][0], /^https:\/\/djbebs\.github\.io\/sudoku-world\//, `${k} must be an absolute https URL`);
  });
}

for (const [name, file] of [['English', 'assets/og-sudoku-en.jpg'], ['French', 'assets/og-sudoku-fr.jpg']]) {
  test(`${name} share image: a real 1200×630 JPEG under WhatsApp's ~300 KB limit`, () => {
    const buf = fs.readFileSync(path.join(ROOT, file));
    assert.deepEqual(jpegSize(buf), { w: 1200, h: 630 });
    assert.ok(buf.length < 300 * 1024, `${file} is ${buf.length} bytes`);
  });
}

test('the logo shown in the share popup and on the share pages is published', () => {
  const buf = fs.readFileSync(path.join(ROOT, 'assets/logo-sudoku.png'));
  assert.equal(buf.subarray(1, 4).toString(), 'PNG');
  assert.equal(buf.readUInt32BE(16), buf.readUInt32BE(20), 'square');
  assert.ok(buf.length < 200 * 1024);
});

test('the English / French share pages: own language, canonical + hreflang, redirect by JavaScript only', () => {
  for (const [file, lang, url] of [['fr/index.html', 'fr', SITE + 'fr/'], ['en/index.html', 'en', SITE + 'en/']]) {
    const html = read(file);
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
    for (const h of [`hreflang="fr" href="${SITE}fr/"`, `hreflang="en" href="${SITE}en/"`, `hreflang="x-default" href="${SITE}"`]) assert.ok(html.includes(h), h);
    // robots must keep reading THIS page: no meta refresh (a robot might follow it to the English default page)
    assert.ok(!/http-equiv\s*=\s*["']?refresh/i.test(html), 'no meta refresh on the language pages');
    assert.ok(html.includes(`location.replace('../sudoku.html?lang=${lang}'`), 'humans are sent to the game in their language');
    assert.ok(html.includes(`<a href="../sudoku.html?lang=${lang}">`), 'without JavaScript a visible button leads to the game');
    assert.ok(html.includes('src="../assets/logo-sudoku.png"'));
  }
  assert.ok(read('fr/index.html').includes('Zéro pub. Juste du Sudoku.'));
  assert.ok(read('en/index.html').includes('No ads. Just Sudoku.'));
});

test('the existing addresses still work: index.html keeps its redirect to the game', () => {
  const html = read('index.html');
  assert.ok(html.includes("location.replace('sudoku.html'"));
  assert.ok(html.includes('hreflang="fr"') && html.includes('hreflang="en"'));
});

test('the game builds the Facebook / WhatsApp links from the public share pages and its own (FR / EN) texts', () => {
  const g = read('sudoku.html');
  assert.ok(g.includes("en: 'https://djbebs.github.io/sudoku-world/en/'") && g.includes("fr: 'https://djbebs.github.io/sudoku-world/fr/'"));
  assert.ok(g.includes("'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url)"), 'Facebook: public link-share URL');
  assert.ok(g.includes("'https://wa.me/?text=' + encodeURIComponent(t('shareWaMsg') + url)"), 'WhatsApp: official wa.me link');
  for (const s of [
    "shareSlogan: 'No ads. Just Sudoku.'", "shareDesc: 'Free Sudoku. Daily challenges. Global leaderboard.'", "shareFb: 'Share on Facebook'", "shareWa: 'Share on WhatsApp'", "shareCopy: 'Copy link'", "shareCopied: 'Link copied!'",
    "shareSlogan: 'Zéro pub. Juste du Sudoku.'", "shareDesc: 'Sudoku gratuit. Défis quotidiens. Classement mondial.'", "shareFb: 'Partager sur Facebook'", "shareWa: 'Partager sur WhatsApp'", "shareCopy: 'Copier le lien'", "shareCopied: 'Lien copié' + NBSP + '!'",
    "inviteBravo: '🏆 Well done!'", "inviteText: 'Challenge your friends!'", "inviteBravo: '🏆 Bravo' + NBSP + '!'", "inviteText: 'Défie tes amis' + NBSP + '!'",
    'shareWaMsg: \'🧩 No ads. Just Sudoku.\\n\\nPlay for free and challenge me on the global leaderboard!\\n\\n\'',
    'shareWaMsg: \'🧩 Zéro pub. Juste du Sudoku.\\n\\nJoue gratuitement et défie-moi au classement mondial !\\n\\n\'',
  ]) assert.ok(g.includes(s), `missing: ${s}`);
});

test('no ads, no tracking: no pixel, no analytics, no ad SDK, no Facebook SDK in any published page', () => {
  const files = [...fs.readdirSync(ROOT).filter(f => f.endsWith('.html')), 'fr/index.html', 'en/index.html'];
  assert.ok(files.length >= 8);
  const banned = /fbq\s*\(|connect\.facebook\.net|facebook\.com\/tr\b|FB\.init|fb-root|googletagmanager|google-analytics|gtag\s*\(|adsbygoogle|googlesyndication|doubleclick|adservice|hotjar|clarity\.ms|mixpanel|segment\.com|sentry|plausible|matomo/i;
  for (const f of files) assert.ok(!banned.test(read(f)), `${f} contains an ad / tracking reference`);
  // the game's only script files are its own; the single third-party code is the Firebase SDK (loaded by online.js for the leaderboard)
  for (const f of ['sudoku.html', 'index.html', 'fr/index.html', 'en/index.html']) {
    const external = [...read(f).matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(external.every(src => !/^(https?:)?\/\//.test(src)), `${f} loads an external script: ${external}`);
  }
  const online = read('online.js');
  const hosts = new Set([...online.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(m => m[1]));
  assert.ok([...hosts].every(h => /(^|\.)(gstatic\.com|googleapis\.com|127\.0\.0\.1|localhost)$/.test(h)), `unexpected hosts in online.js: ${[...hosts]}`);
});

test('the new files are on the publication allow-list (.gitignore)', () => {
  const gi = read('.gitignore');
  for (const line of ['!/fr/', '!/fr/index.html', '!/en/', '!/en/index.html', '!/assets/og-sudoku-en.jpg', '!/assets/og-sudoku-fr.jpg', '!/assets/logo-sudoku.png', '!/tests/share.test.mjs']) {
    assert.ok(gi.split('\n').includes(line), `${line} missing from .gitignore`);
  }
});
