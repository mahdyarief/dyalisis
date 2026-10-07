// Dyalisis publish server (zero-dep) — backend untuk `npx dyalisis publish`.
//   POST /api/register            { handle }        → { token } (mode terbuka)
//   POST /api/publish             (body HTML)       → { slug, url }
//   GET  /api/publications?owner=                   → { publications: [...] }
//   GET  /health                                    → { ok: true }
//   GET  /                                          → direktori global (HTML)
//   GET  /u/<owner>                                 → listing per-user (HTML)
//   GET  /<slug>                                    → halaman publik (HTML)
// Env: PORT, DYALISIS_DATA_DIR, DYALISIS_PUBLISH_TOKEN, DYALISIS_PUBLIC_URL.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createStore } from './store.mjs';
import { slugify, isSafeSlug } from '../lib/slug.mjs';

const MAX_BODY = 25 * 1024 * 1024;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function readBody(req) {
  return new Promise((ok, err) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { err(new Error('body terlalu besar')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', err);
  });
}

const page = (title, body) => `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:0 1rem;
background:#0b0f14;color:#e6edf3}a{color:#22d3ee}h1{font-size:1.4rem}
li{margin:.4rem 0}.m{color:#8b949e;font-size:.85rem}code{background:#161b22;padding:.1rem .3rem;border-radius:.25rem}</style>
</head><body>${body}</body></html>`;

function listingHtml(title, items) {
  const rows = items.length
    ? `<ul>${items.map((m) => `<li><a href="/${esc(m.slug)}">${esc(m.title || m.slug)}</a> ` +
        `<span class="m">/${esc(m.slug)}${m.owner ? ' · ' + esc(m.owner) : ''} · ${esc((m.createdAt || '').slice(0, 10))}</span></li>`).join('')}</ul>`
    : '<p class="m">Belum ada publikasi.</p>';
  return page(title, `<h1>${esc(title)}</h1>${rows}<p class="m">Dyalisis publish server</p>`);
}

export function createPublishServer({ dataDir, token = '', publicUrl = '' } = {}) {
  const store = createStore(dataDir || process.env.DYALISIS_DATA_DIR || './data');
  const requireToken = token || process.env.DYALISIS_PUBLISH_TOKEN || '';

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    const send = (code, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, { 'Content-Type': type });
      res.end(body);
    };
    const json = (code, obj) => send(code, JSON.stringify(obj), 'application/json');
    const base = (publicUrl || process.env.DYALISIS_PUBLIC_URL || `http://${req.headers.host || 'localhost'}`).replace(/\/+$/, '');

    try {
      // --- API: register (mode terbuka saja) ---
      if (req.method === 'POST' && path === '/api/register') {
        if (requireToken) return json(403, { ok: false, error: 'registrasi dimatikan' });
        const body = JSON.parse((await readBody(req)).toString() || '{}');
        if (!body.handle) return json(400, { ok: false, error: 'handle wajib' });
        const r = store.register(body.handle);
        if (r.error) return json(409, { ok: false, error: r.error });
        return json(200, { ok: true, ...r });
      }

      // --- API: publish ---
      if (req.method === 'POST' && path === '/api/publish') {
        const clientToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
          || req.headers['x-dyalisis-token'] || '';
        let owner = 'anonymous';
        if (requireToken) {
          if (clientToken !== requireToken) return json(401, { ok: false, error: 'token salah' });
          owner = slugify(req.headers['x-dyalisis-owner'] || 'public');
        } else if (clientToken) {
          const h = store.ownerOf(clientToken);
          if (!h) return json(401, { ok: false, error: 'token tak dikenal' });
          owner = h;
        }
        const desired = req.headers['x-dyalisis-slug'] || 'app';
        const overwrite = req.headers['x-dyalisis-overwrite'] === '1';
        const html = (await readBody(req)).toString('utf8');
        if (!html.trim()) return json(400, { ok: false, error: 'body HTML kosong' });
        const slug = store.allocate(desired, overwrite);
        store.save(slug, html, {
          slug, owner, title: slug, bytes: Buffer.byteLength(html),
          createdAt: new Date().toISOString()
        });
        return json(200, { ok: true, slug, url: `${base}/${slug}` });
      }

      // --- API: listing ---
      if (req.method === 'GET' && path === '/api/publications') {
        const owner = url.searchParams.get('owner') || '';
        return json(200, { ok: true, publications: store.list(owner ? slugify(owner) : undefined) });
      }

      if (req.method === 'GET' && path === '/health') return json(200, { ok: true });

      // --- Halaman: profil per-user ---
      if (req.method === 'GET' && path.startsWith('/u/')) {
        const owner = slugify(path.slice(3));
        return send(200, listingHtml(`Publikasi: ${owner}`, store.list(owner)), 'text/html; charset=utf-8');
      }

      // --- Halaman: direktori global ---
      if (req.method === 'GET' && (path === '/' || path === '')) {
        return send(200, listingHtml('Direktori Publikasi', store.list()), 'text/html; charset=utf-8');
      }

      // --- Halaman: artefak publik ---
      if (req.method === 'GET') {
        const slug = path.replace(/^\/+|\/+$/g, '');
        if (isSafeSlug(slug)) {
          const pub = store.get(slug);
          if (pub) return send(200, pub.html, 'text/html; charset=utf-8');
        }
        return send(404, page('404', '<h1>404</h1><p class="m">Publikasi tak ditemukan.</p>'), 'text/html; charset=utf-8');
      }

      return send(405, 'method not allowed');
    } catch (e) {
      return json(500, { ok: false, error: e.message });
    }
  });
}

/** Jalankan server dari CLI. */
export function startServer({ port, dataDir, token, publicUrl } = {}) {
  const p = Number(port || process.env.PORT || 8787);
  const server = createPublishServer({ dataDir, token, publicUrl });
  server.listen(p, () => {
    const dir = resolve(dataDir || process.env.DYALISIS_DATA_DIR || './data');
    console.log(`[dyalisis] publish server jalan di http://localhost:${p}`);
    console.log(`[dyalisis] data    : ${dir}`);
    console.log(`[dyalisis] auth    : ${token || process.env.DYALISIS_PUBLISH_TOKEN ? 'token wajib' : 'terbuka (siapa saja boleh publish)'}`);
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.slice(1))) {
  startServer({});
}