// Renders artist pages for the backend (artistPage.routes.ts), from the same build as the client:
// the markup it writes is the one the client hydrates. Reached only on the compose network.
//   POST /render  { path, data: { locale, profile, musilogy } }  →  the body of <div id="root">
//   GET  /health
import { createServer } from 'node:http';

const { artistPageHtml } = await import('./dist-ssr/entry-server.js');

const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY = 1_000_000;

// One render at a time: a render sets the page's language for the whole process (paraglide's
// overwriteGetLocale, the locale store), and an awaited lazy route lets another request in.
let queue = Promise.resolve();
function render(path, data) {
  const next = queue.then(() => artistPageHtml(data, path));
  queue = next.catch(() => undefined);
  return next;
}

function isRequest(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.path === 'string' &&
    /^\/(artiste|en\/artist)\/[^/]+$/.test(value.path) &&
    typeof value.data === 'object' &&
    value.data !== null &&
    (value.data.locale === 'fr' || value.data.locale === 'en') &&
    typeof value.data.profile?.slug === 'string'
  );
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (request.method !== 'POST' || request.url !== '/render') {
    response.writeHead(404).end();
    return;
  }
  let body;
  try {
    body = JSON.parse(await readBody(request));
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (!isRequest(body)) {
    response.writeHead(400).end();
    return;
  }
  try {
    const html = await render(body.path, body.data);
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
  } catch (err) {
    console.error(JSON.stringify({ event: 'render_failed', path: body.path, message: err.message }));
    response.writeHead(500).end();
  }
});

// The first render loads the lazy routes and warms the JIT: ~300 ms against ~100 after, past the
// backend's budget. Done before listening, so no listener's page pays it.
await render('/artiste/warm-up', {
  locale: 'fr',
  profile: {
    id: 'warm-up',
    name: 'AubeSonore',
    slug: 'warm-up',
    mbid: null,
    played: true,
    image: null,
    facts: null,
    summary: null,
    links: [],
  },
  musilogy: null,
});

server.listen(PORT, () => console.log(JSON.stringify({ event: 'listening', port: PORT })));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
