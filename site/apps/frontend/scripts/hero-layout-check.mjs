#!/usr/bin/env node
/**
 * The home page's first screen, measured in a real browser: titles of 4, 18, 30 and 52 characters
 * on twelve screens, from a 360 px phone to 1920×1080 and phones on their side. For each it checks
 * that the player bar stays away while the hero's player is on screen (and comes once it has
 * scrolled away), that Écouter and the actions are whole in the window and on one line, that the
 * cover is never under 8rem and carries « En direct » in its corner, that the title is at most
 * 40 px, that the header, the cover, the title and the thread do not overlap, and that nothing
 * scrolls sideways. Player and thread side by side (hero-split), the horizon and its « now » dot
 * are in the first screen, and from 1280×720 the thread's eight tracks too; on an upright phone,
 * at least its first three.
 *
 * Run on demand, not in CI: it needs a built site served locally and a Chromium.
 *   pnpm --filter=@aubesonore/frontend build
 *   pnpm --filter=@aubesonore/frontend exec vite preview --host 127.0.0.1 --port 4791 --strictPort
 *   CHROME=/path/to/chrome-headless-shell node scripts/hero-layout-check.mjs http://127.0.0.1:4791/
 * It talks to Chromium over the DevTools protocol (Node's own WebSocket, no dependency), answers
 * the live's now-playing request with each title and the history with eight tracks, and exits 1
 * when a check fails.
 * Diffuser shows only where the browser can cast: where it does not, a stand-in of its size is
 * put in the row, so the row is measured at its widest.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:4791/';
const chrome = process.env.CHROME;
if (!chrome) {
  console.error('Set CHROME to a Chromium binary (chrome-headless-shell works).');
  process.exit(2);
}

const VIEWPORTS = [
  [360, 740],
  [390, 844],
  [430, 932],
  [844, 390],
  [667, 375],
  [768, 1024],
  [1024, 700],
  [1000, 720],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];
const TITLES = [
  'Cire',
  'Everything Must Go',
  'Les nuits sans fin de Montréal',
  'Une chanson beaucoup trop longue pour tenir sur rien',
];
for (const [i, n] of [4, 18, 30, 52].entries()) {
  if (TITLES[i].length !== n) throw new Error(`title ${i} has ${TITLES[i].length} characters`);
}

// The thread: eight tracks before the one on air, four minutes apart.
function history() {
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: 9 }, (_, i) => ({
    sh_id: 100 - i,
    played_at: now - 30 - i * 240,
    duration: 240,
    playlist: 'main',
    streamer: '',
    is_request: false,
    song: {
      id: `s${i}`,
      art: 'https://radio.aubesonore.fr/api/station/1/art/none',
      text: '',
      artist: i === 0 ? 'Mickey 3D' : `Les Artistes ${i}`,
      title: i === 0 ? currentTitle : `Un titre du fil ${i}`,
      album: '',
      genre: '',
      isrc: '',
      lyrics: '',
    },
  }));
}

function nowPlaying(title) {
  const song = {
    id: 's1',
    art: 'https://radio.aubesonore.fr/api/station/1/art/none',
    text: `Mickey 3D - ${title}`,
    artist: 'Mickey 3D',
    title,
    album: 'Tu vas pas mourir de rire',
    genre: '',
    isrc: '',
    lyrics: '',
  };
  return {
    station: {
      id: 1,
      name: 'AubeSonore',
      shortcode: 'aubesonore',
      description: '',
      frontend: 'icecast',
      backend: 'liquidsoap',
      timezone: 'UTC',
      listen_url: 'https://radio.aubesonore.fr/listen/aubesonore/radio.mp3',
      url: '',
      public_player_url: '',
      playlist_pls_url: '',
      playlist_m3u_url: '',
      is_public: true,
      requests_enabled: false,
      mounts: [],
      remotes: [],
      hls_enabled: false,
      hls_url: null,
    },
    listeners: { total: 5, unique: 3, current: 3 },
    live: { is_live: false, streamer_name: '', broadcast_start: null, art: null },
    now_playing: {
      sh_id: 100,
      played_at: Math.floor(Date.now() / 1000) - 30,
      duration: 180,
      playlist: 'main',
      streamer: '',
      is_request: false,
      song,
      elapsed: 30,
      remaining: 150,
    },
    playing_next: null,
    song_history: [],
    is_online: true,
  };
}

/** A minimal DevTools client over one browser connection, sessions flattened. */
async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'hero-check-'));
  const proc = spawn(chrome, [
    '--headless',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--hide-scrollbars',
    // Inside a sandbox of its own (a container, bubblewrap), Chromium cannot open its own: then
    // CHROME_ARGS=--no-sandbox. The page measured is the local build, nothing else is loaded.
    ...(process.env.CHROME_ARGS ?? '').split(' ').filter(Boolean),
    'about:blank',
  ]);
  const wsUrl = await new Promise((resolve, reject) => {
    let err = '';
    proc.stderr.on('data', (chunk) => {
      err += chunk;
      const found = /DevTools listening on (ws:\S+)/.exec(err);
      if (found) resolve(found[1]);
    });
    proc.on('exit', () => reject(new Error(`Chromium exited: ${err}`)));
  });
  // Node's own client (Node 22+), from the global object: no dependency.
  const ws = new globalThis.WebSocket(wsUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else for (const listen of listeners) listen(msg);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const close = () => {
    ws.close();
    proc.kill();
    rmSync(profile, { recursive: true, force: true });
  };
  return { send, on: (fn) => listeners.add(fn), off: (fn) => listeners.delete(fn), close };
}

const browser = await launch();
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
const page = (method, params) => browser.send(method, params, sessionId);

let currentTitle = TITLES[0];
browser.on((msg) => {
  if (msg.sessionId !== sessionId || msg.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = msg.params;
  // Another origin than the page's: the answer says it may be read (CORS).
  const cors = [
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Allow-Headers', value: '*' },
  ];
  // A request the next navigation cancelled is gone by the time it is answered: no matter.
  const answer = (method, params) => page(method, { requestId, ...params }).catch(() => {});
  if (request.method === 'OPTIONS') {
    void answer('Fetch.fulfillRequest', { responseCode: 204, responseHeaders: cors });
  } else if (request.url.includes('/api/nowplaying_static/')) {
    void answer('Fetch.fulfillRequest', {
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, ...cors],
      body: Buffer.from(JSON.stringify(nowPlaying(currentTitle))).toString('base64'),
    });
  } else if (request.url.includes('/api/radio/history')) {
    void answer('Fetch.fulfillRequest', {
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, ...cors],
      body: Buffer.from(JSON.stringify(history())).toString('base64'),
    });
  } else {
    void answer('Fetch.failRequest', { errorReason: 'BlockedByClient' });
  }
});
await page('Page.enable');
// SCHEME=dark measures the night (the device's dark setting); SHOTS=<dir> keeps a PNG of each case.
if (process.env.SCHEME) {
  await page('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: process.env.SCHEME }],
  });
}
await page('Fetch.enable', {
  patterns: [
    { urlPattern: '*radio.aubesonore.fr*' },
    { urlPattern: '*gstatic.com*' },
    { urlPattern: '*/api/radio/history*' },
  ],
});

async function evaluate(expression) {
  const { result, exceptionDetails } = await page('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'eval failed');
  return result.value;
}

async function open(width, height, title) {
  currentTitle = title;
  await page('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 1024 && width !== 768,
  });
  const loaded = new Promise((resolve) => {
    const fn = (msg) => {
      if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') {
        browser.off(fn);
        resolve();
      }
    };
    browser.on(fn);
  });
  await page('Page.navigate', { url });
  await loaded;
  await evaluate(`(async () => {
    await document.fonts.ready;
    for (let i = 0; i < 100; i++) {
      const h2 = document.querySelector('main h2');
      const thread = document.querySelectorAll('#depuis-l-aube li').length;
      if (h2 && h2.textContent === ${JSON.stringify(title)} && thread === 8) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    // Entrance animations settled, so boxes are where they rest.
    await new Promise((r) => setTimeout(r, 1200));
  })()`);
}

// Measured in the page: boxes, in viewport coordinates, with the window at the top.
const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const main = document.querySelector('main');
  const hero = main.querySelector('.hero');
  const row = hero.querySelector('.hero-actions > div');
  if (!row.querySelector('[aria-label="Diffuser sur un appareil"]')) {
    const share = [...row.querySelectorAll('button')].find((b) => b.textContent === 'Partager');
    if (!share) throw new Error('no track in the hero: ' + hero.innerText.slice(0, 300));
    const stand = share.cloneNode(true);
    stand.querySelector('[data-label]').textContent = 'Diffuser';
    stand.setAttribute('aria-label', 'Diffuser sur un appareil');
    share.after(stand);
  }
  const buttons = [...row.querySelectorAll('button')];
  const disc = buttons[0];
  const inView = (b) => b && b.top >= 0 && b.left >= 0 && b.bottom <= vh && b.right <= vw;
  const header = box(hero.querySelector('header'));
  const coverEl = hero.querySelector('.cover-fit');
  const cover = box(coverEl);
  const h2 = hero.querySelector('.hero-player h2');
  const title = box(h2);
  const thread = box(hero.querySelector('#depuis-l-aube'));
  const threadRows = [...hero.querySelectorAll('#depuis-l-aube li')].map(box);
  const horizon = box(hero.querySelector('[data-horizon]'));
  const dot = box(hero.querySelector('.now-arrive'));
  const live = [...coverEl.querySelectorAll('span')].find((s) => s.textContent === 'En direct');
  const liveBox = box(live);
  const bar = document.querySelector('section[aria-label="Lecteur du direct"]');
  const overlap = (a, b) => a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const pairs = [['header', header], ['cover', cover], ['title', title], ['thread', thread]];
  const overlaps = [];
  for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++)
    if (overlap(pairs[i][1], pairs[j][1])) overlaps.push(pairs[i][0] + '/' + pairs[j][0]);
  const actionBoxes = buttons.map(box);
  const centers = actionBoxes.map((b) => b.top + b.height / 2);
  const style = getComputedStyle(h2);
  const lineHeight = parseFloat(style.lineHeight);
  // The lines the title would take unclamped.
  h2.style.webkitLineClamp = 'unset';
  h2.style.display = 'block';
  const naturalLines = Math.round(h2.getBoundingClientRect().height / lineHeight);
  h2.style.webkitLineClamp = '';
  h2.style.display = '';
  const labels = [...row.querySelectorAll('[data-label]')];
  return {
    cover: Math.round(cover.width),
    titlePx: Math.round(parseFloat(style.fontSize)),
    titleLines: naturalLines,
    discPx: Math.round(box(disc).width),
    discInView: inView(box(disc)),
    actionsInView: actionBoxes.every(inView),
    oneLine: Math.max(...centers) - Math.min(...centers) < 2,
    iconsOnly: labels.every((l) => l.getBoundingClientRect().width <= 1),
    names: buttons.map((b) => b.getAttribute('aria-label') || b.textContent).join('|'),
    horizonInView: horizon.bottom <= vh + 0.5,
    dotInView: inView(dot),
    overlaps,
    sideScroll: document.documentElement.scrollWidth > vw,
    barAway: bar.hasAttribute('inert') && getComputedStyle(bar).opacity === '0',
    heroHeight: Math.round(box(hero).height),
    // Paper left empty between the header and the player, past the hero's own gap.
    spaceAbove: Math.round(
      Math.min(cover.top, title.top) - header.bottom - parseFloat(getComputedStyle(hero).rowGap)
    ),
    split: cover.right <= thread.left,
    // « En direct » in the cover's top left corner.
    liveOnCover: !!liveBox && liveBox.left >= cover.left && liveBox.top >= cover.top && liveBox.left - cover.left <= 16 && liveBox.top - cover.top <= 16 && liveBox.right <= cover.right && liveBox.bottom <= cover.bottom,
    threadInView: threadRows.filter((r) => r.bottom <= vh + 0.5).length,
    slotBottom: box(hero.querySelector('.hero-actions')).bottom + window.scrollY,
  };
})()`;

async function scrolledBar(y, shown) {
  return evaluate(`(async () => {
    // Room to scroll the hero away, whatever the lists below hold (the API is not served here).
    document.body.style.minHeight = '400vh';
    window.scrollTo(0, ${y});
    const bar = document.querySelector('section[aria-label="Lecteur du direct"]');
    // The observer answers on a frame, then the bar slides for 500 ms: up to 3 s for it to rest.
    await new Promise((r) => setTimeout(r, 300));
    for (let i = 0; i < 27; i++) {
      const o = getComputedStyle(bar).opacity;
      if (o === '${shown ? 1 : 0}' && bar.hasAttribute('inert') !== ${shown}) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    // The slide ends on a spring past its opacity: let it rest before measuring where it is.
    await new Promise((r) => setTimeout(r, 600));
    // The track's title in the bar, as wide as it shows (the phone's line or the larger one's).
    const titleWidth = Math.max(
      ...[...bar.querySelectorAll('.truncate.font-semibold')].map((s) => s.getBoundingClientRect().width)
    );
    return {
      inert: bar.hasAttribute('inert'),
      opacity: getComputedStyle(bar).opacity,
      titleWidth: Math.round(titleWidth),
      // Edge to edge on the screen's foot, its line along the whole top edge.
      edgeToEdge: (() => {
        const r = bar.getBoundingClientRect();
        const line = bar.querySelector('canvas').getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const ok = r.left === 0 && Math.abs(r.right - vw) < 1 && Math.abs(r.bottom - window.innerHeight) < 1
          && line.left <= 0 && line.right >= vw - 1;
        return ok || JSON.stringify({ r, line, vw, vh: window.innerHeight });
      })(),
      barHeight: Math.round(bar.getBoundingClientRect().height),
    };
  })()`);
}

const rows = [];
let failures = 0;
for (const [width, height] of VIEWPORTS) {
  for (const title of TITLES) {
    await open(width, height, title);
    if (process.env.SHOTS) {
      const { data } = await page('Page.captureScreenshot', { format: 'png' });
      const name = `${width}x${height}-${title.length}-${process.env.SCHEME ?? 'light'}.png`;
      writeFileSync(join(process.env.SHOTS, name), Buffer.from(data, 'base64'));
    }
    const r = await evaluate(MEASURE);
    const fails = [];
    if (!r.barAway) fails.push('bar over the hero');
    if (!r.discInView) fails.push('Écouter out of the window');
    if (!r.actionsInView) fails.push('actions out of the window');
    if (!r.oneLine) fails.push('actions on two lines');
    if (width < 430 && !r.iconsOnly) fails.push('words beside the icons under 430');
    if (r.split && (!r.horizonInView || !r.dotInView))
      fails.push('horizon out of the first screen');
    if (r.cover < 128) fails.push('cover under 8rem');
    if (!r.liveOnCover) fails.push("« En direct » not in the cover's corner");
    if (r.titlePx > 40) fails.push(`title at ${r.titlePx} px, over 40`);
    // Beside the thread, the cover takes the height left: no band of empty paper above it.
    if (r.split && r.spaceAbove > 8) fails.push(`${r.spaceAbove} px empty above the player`);
    if (r.overlaps.length) fails.push(`overlap ${r.overlaps.join(', ')}`);
    if (r.sideScroll) fails.push('sideways scroll');
    if (r.titleLines > 3) fails.push(`title on ${r.titleLines} lines, cut at 3`);
    if (width >= 1280 && height >= 720 && r.threadInView < 8)
      fails.push(`${r.threadInView} of the thread's 8 tracks in the first screen`);
    if (width < 640 && height > width && r.threadInView < 3)
      fails.push(`${r.threadInView} of the thread's tracks in the first screen, under 3`);
    let scroll = '';
    if (title === TITLES[1]) {
      // The player scrolled away, then back.
      const away = await scrolledBar(Math.ceil(r.slotBottom) + 20, true);
      if (process.env.SHOTS) {
        const { data } = await page('Page.captureScreenshot', { format: 'png' });
        const name = `${width}x${height}-bar-${process.env.SCHEME ?? 'light'}.png`;
        writeFileSync(join(process.env.SHOTS, name), Buffer.from(data, 'base64'));
      }
      const back = await scrolledBar(0, false);
      const ok = !away.inert && away.opacity === '1' && back.inert && back.opacity === '0';
      if (away.edgeToEdge !== true)
        fails.push(`bar not edge to edge on the foot ${away.edgeToEdge}`);
      if (!ok) fails.push('bar does not follow the hero');
      scroll = ok
        ? `yes, ${away.barHeight} px high, title ${away.titleWidth} px`
        : `NO ${JSON.stringify({ away, back })}`;
    }
    failures += fails.length;
    rows.push(
      `| ${width}×${height} | ${title.length} | ${r.split ? 'split' : 'stacked'} | ${r.cover} | ${r.spaceAbove} | ${r.titlePx}/${r.titleLines} | ${r.threadInView} | ${r.discPx} | ${r.iconsOnly ? 'icons' : 'words'} | ${r.heroHeight} | ${scroll} | ${fails.length ? fails.join('; ') : 'ok'} |`
    );
  }
}

console.log(
  '| screen | title chars | layout | cover px | empty above px | title px/lines | thread lines seen | disc px | actions | hero px | bar follows scroll | checks |'
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
console.log(rows.join('\n'));
browser.close();
process.exit(failures ? 1 : 0);
