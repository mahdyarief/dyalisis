// Self-test publish (headless): slugify + round-trip server (unik, overwrite,
// listing, keamanan path). Jalan lokal tanpa domain nyata.
//   node test/publish.mjs
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { slugify, isSafeSlug } from '../lib/slug.mjs';
import { createPublishServer } from '../server/publish-server.mjs';
import { loginDyalisis, publishDyalisis, listDyalisis } from '../lib/publish.mjs';

let pass = 0, fail = 0;
const check = (name, cond, got) => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${got !== undefined ? `  (dapat: ${got})` : ''}`); }
};

// --- unit: slugify / isSafeSlug ---
check('slugify: "SoftMedis" → softmedis', slugify('SoftMedis') === 'softmedis', slugify('SoftMedis'));
check('slugify: "Acme Ops v2!" → acme-ops-v2', slugify('Acme Ops v2!') === 'acme-ops-v2', slugify('Acme Ops v2!'));
check('slugify: kosong → app', slugify('') === 'app', slugify(''));
check('isSafeSlug: softmedis ok', isSafeSlug('softmedis') === true);
check('isSafeSlug: ../etc ditolak', isSafeSlug('../etc') === false);
check('isSafeSlug: a/b ditolak', isSafeSlug('a/b') === false);
check('isSafeSlug: huruf besar ditolak', isSafeSlug('Softmedis') === false);

const dataDir = mkdtempSync(join(tmpdir(), 'dya-pub-'));
const server = createPublishServer({ dataDir, publicUrl: 'https://dya.test' });
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

// Connection: close → socket undici langsung dilepas; proses bisa keluar natural
// tanpa process.exit() (menghindari assertion libuv di Windows).
const withClose = (init = {}) => ({ ...init, headers: { Connection: 'close', ...(init.headers || {}) } });
const post = (path, opts = {}) => fetch(base + path, withClose({ method: 'POST', ...opts }));
const get = (path) => fetch(base + path, withClose());
const jsonBody = async (res) => { try { return await res.json(); } catch { return {}; } };

try {
  // --- register token ---
  const reg = await post('/api/register', {
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: 'Budi' })
  });
  const regData = await jsonBody(reg);
  check('register: ok + handle dinormalkan', reg.ok && regData.handle === 'budi', JSON.stringify(regData));
  const token = regData.token;

  const dup = await post('/api/register', {
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: 'budi' })
  });
  check('register: handle kembar ditolak (409)', dup.status === 409, dup.status);

  // --- publish (slug unik otomatis) ---
  const pub = (slug, overwrite, body = '<html>H</html>') => post('/api/publish', {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Dyalisis-Slug': slug,
      'X-Dyalisis-Overwrite': overwrite ? '1' : '0',
      'X-Dyalisis-Token': token
    },
    body
  });

  const p1 = await pub('softmedis', false, '<html>v1</html>');
  const d1 = await jsonBody(p1);
  check('publish: slug pertama = softmedis', d1.slug === 'softmedis', d1.slug);
  check('publish: url = base/softmedis', d1.url === 'https://dya.test/softmedis', d1.url);

  const p2 = await jsonBody(await pub('softmedis', false, '<html>v2</html>'));
  check('publish: kembar → softmedis-1', p2.slug === 'softmedis-1', p2.slug);
  const p3 = await jsonBody(await pub('softmedis', false, '<html>v3</html>'));
  check('publish: kembar lagi → softmedis-2', p3.slug === 'softmedis-2', p3.slug);

  const p4 = await jsonBody(await pub('softmedis', true, '<html>overwrite</html>'));
  check('publish: overwrite menimpa softmedis', p4.slug === 'softmedis', p4.slug);

  // --- serve artefak ---
  const serve = await get('/softmedis');
  const serveText = await serve.text();
  check('GET /softmedis → 200 + isi overwrite', serve.ok && serveText.includes('overwrite'));

  // --- listing ---
  const all = await jsonBody(await get('/api/publications'));
  check('API listing global: 3 publikasi', Array.isArray(all.publications) && all.publications.length === 3,
    all.publications?.length);
  const mine = await jsonBody(await get('/api/publications?owner=budi'));
  check('API listing ?owner=budi: 3 milik budi', mine.publications?.length === 3 && mine.publications.every((m) => m.owner === 'budi'),
    JSON.stringify(mine.publications?.map((m) => m.owner)));

  const profile = await get('/u/budi');
  check('GET /u/budi → 200 html', profile.ok && (await profile.text()).includes('softmedis'));
  const dir = await get('/');
  check('GET / → 200 html direktori', dir.ok && (await dir.text()).includes('Direktori'));

  // --- health & error ---
  check('GET /health → ok', (await jsonBody(await get('/health'))).ok === true);
  check('GET /tidak-ada → 404', (await get('/tidak-ada')).status === 404);
  check('path traversal → bukan 200', (await get('/%2e%2e%2fetc%2fpasswd')).status !== 200);

  // --- auth: token salah ditolak ---
  const bad = await post('/api/publish', {
    headers: { 'X-Dyalisis-Slug': 'x', 'X-Dyalisis-Token': 'salah' },
    body: '<html>x</html>'
  });
  check('publish: token tak dikenal → 401', bad.status === 401, bad.status);

  // --- envelope JSON + endpoint AI-friendly (JSON/Markdown/llms.txt/MCP) ---
  // Graph minimal (bentuk sama seperti graph.json hasil build) untuk uji round-trip.
  const sampleGraph = {
    app: { name: 'Aplikasi AI', subtitle: 'Uji endpoint AI' },
    nodes: [
      { id: 'mod-a', label: 'Modul A', domain: 'a', type: 'module', parent: null,
        erd: 'erDiagram\n  X { string id PK }' },
      { id: 'f-1', label: 'Fitur 1', domain: 'a', type: 'feature', parent: 'mod-a',
        brief: 'Ringkas 1.', goals: 'Tujuan 1.', workflow: 'Buka → Simpan',
        entities: [{ name: 'x', attrs: [{ name: 'id' }] }],
        sources: ['SM'], evidence: 'PROVEN', status: 'stabil' }
    ],
    edges: [{ source: 'mod-a', target: 'f-1', type: 'hierarchy' }],
    analysis: { app: 'Aplikasi AI',
      counts: { modules: 1, features: 1, actions: 0, dataEdges: 0 },
      godNodes: [], crossModule: [], isolated: [] }
  };
  const envData = await jsonBody(await post('/api/publish', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Dyalisis-Slug': 'ai-app', 'X-Dyalisis-Overwrite': '1', 'X-Dyalisis-Token': token
    },
    body: JSON.stringify({ html: '<html>AI</html>', graph: sampleGraph })
  }));
  check('envelope: publish {html,graph} → slug ai-app', envData.slug === 'ai-app', envData.slug);

  const jsRes = await get('/ai-app.json');
  check('endpoint: GET /ai-app.json → graph (application/json)',
    jsRes.ok && (jsRes.headers.get('content-type') || '').includes('application/json') &&
    (await jsonBody(jsRes)).nodes.length === 2);

  const mdRes = await get('/ai-app.md');
  const mdText = await mdRes.text();
  check('endpoint: GET /ai-app.md → Markdown prosa',
    mdRes.ok && (mdRes.headers.get('content-type') || '').includes('markdown') &&
    mdText.includes('# Aplikasi AI') && mdText.includes('**Brief.** Ringkas 1.'));

  const llmsText = await (await get('/ai-app/llms.txt')).text();
  check('endpoint: GET /ai-app/llms.txt → indeks + pointer',
    llmsText.includes('/ai-app.json') && llmsText.includes('/ai-app/mcp'));

  // Auto-discovery: HTML ber-graph disuntik <link rel="alternate"> (+ llms.txt).
  const aiHtml = await (await get('/ai-app')).text();
  check('discovery: HTML ber-graph → <link rel=alternate> .md + .json + llms.txt',
    aiHtml.includes('rel="alternate" type="text/markdown" href="/ai-app.md"') &&
    aiHtml.includes('rel="alternate" type="application/json" href="/ai-app.json"') &&
    aiHtml.includes('/ai-app/llms.txt'));
  // Negatif: publikasi lama tanpa graph tak disuntik (target akan 404).
  const oldHtml = await (await get('/softmedis')).text();
  check('discovery: HTML tanpa graph → tidak disuntik', !oldHtml.includes('rel="alternate"'));

  // MCP-over-HTTP (JSON-RPC via POST).
  const mcpInit = await jsonBody(await post('/ai-app/mcp', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })
  }));
  check('endpoint: POST /ai-app/mcp initialize → serverInfo dyalisis',
    mcpInit.result?.serverInfo?.name === 'dyalisis', JSON.stringify(mcpInit));
  const mcpCall = await jsonBody(await post('/ai-app/mcp', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'get_node', arguments: { id: 'f-1' } } })
  }));
  check('endpoint: MCP tools/call get_node → brief di hasil',
    !!mcpCall.result && JSON.parse(mcpCall.result.content[0].text).brief === 'Ringkas 1.');
  const mcpMiss = await jsonBody(await post('/softmedis/mcp', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' })
  }));
  check('endpoint: MCP slug tanpa graph → error JSON-RPC', !!mcpMiss.error);

  // DELETE: hapus publikasi, lalu akses ulang → 404.
  const delRes = await fetch(base + '/api/publications/ai-app',
    withClose({ method: 'DELETE', headers: { 'X-Dyalisis-Token': token } }));
  check('endpoint: DELETE /api/publications/ai-app → ok',
    delRes.ok && (await jsonBody(delRes)).ok === true, delRes.status);
  check('endpoint: GET /ai-app setelah delete → 404', (await get('/ai-app')).status === 404);
  const delMiss = await fetch(base + '/api/publications/tak-ada',
    withClose({ method: 'DELETE', headers: { 'X-Dyalisis-Token': token } }));
  check('endpoint: DELETE slug tak ada → 404', delMiss.status === 404, delMiss.status);

  // --- mode tertutup: endpoint tulis memakai token publish yang sama ---
  const sec = createPublishServer({ dataDir, token: 'rahasia', publicUrl: 'https://dya.test' });
  await new Promise((r) => sec.listen(0, r));
  const secBase = `http://127.0.0.1:${sec.address().port}`;
  const secPub = await fetch(secBase + '/api/publish', withClose({
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8',
      'X-Dyalisis-Slug': 'ai-secure', 'X-Dyalisis-Overwrite': '1', 'X-Dyalisis-Token': 'rahasia' },
    body: JSON.stringify({ html: '<html>S</html>', graph: sampleGraph })
  }));
  check('auth: publish mode tertutup dgn token → ok', secPub.ok, secPub.status);
  const mcpNoTok = await fetch(secBase + '/ai-secure/mcp', withClose({
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  }));
  const mcpNoTokBody = await jsonBody(mcpNoTok);
  check('auth: MCP tanpa token → 401 token salah',
    mcpNoTok.status === 401 && !!mcpNoTokBody.error, mcpNoTok.status);
  const mcpTok = await jsonBody(await fetch(secBase + '/ai-secure/mcp', withClose({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dyalisis-Token': 'rahasia' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  })));
  check('auth: MCP dgn token publish → tools/list ok',
    !!mcpTok.result && mcpTok.result.tools.length === 6);
  const delNoTok = await fetch(secBase + '/api/publications/ai-secure',
    withClose({ method: 'DELETE' }));
  check('auth: DELETE tanpa token → 401', delNoTok.status === 401, delNoTok.status);
  await new Promise((r) => sec.close(r));

  // --- integrasi client nyata: login → publish → list (terhadap server lokal) ---
  const projDir = mkdtempSync(join(tmpdir(), 'dya-proj-'));
  mkdirSync(join(projDir, 'dist'), { recursive: true });
  writeFileSync(join(projDir, 'dist/index.html'), '<html>PROYEK</html>');
  const cwd = process.cwd();
  process.chdir(projDir);
  try {
    const login = await loginDyalisis({ projectDir: projDir, handle: 'Sari', url: base });
    check('client login: handle = sari + token tersimpan', login.handle === 'sari');

    const rc = JSON.parse(readFileSync(join(projDir, '.dyalisisrc.json'), 'utf8'));
    check('client login: .dyalisisrc.json berisi token', !!rc.publishToken && rc.handle === 'sari');

    const res = await publishDyalisis({ projectDir: projDir, out: 'dist/index.html', build: false, slug: 'laporan', url: base });
    check('client publish: slug = laporan', res.slug === 'laporan', res.slug);

    const manifest = JSON.parse(readFileSync(join(projDir, '.dyalisis-manifest.json'), 'utf8'));
    check('client publish: tercatat di manifest lokal', manifest.length === 1 && manifest[0].slug === 'laporan');

    const localList = await listDyalisis({ projectDir: projDir });
    check('client list (lokal): 1 entri', Array.isArray(localList) && localList.length === 1);
    const remoteList = await listDyalisis({ projectDir: projDir, url: base, remote: true });
    check('client list (remote): milik sari', remoteList.some((m) => m.slug === 'laporan' && m.owner === 'sari'));
  } finally {
    process.chdir(cwd);
    rmSync(projDir, { recursive: true, force: true });
  }
} finally {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\n${fail === 0 ? 'All tests passed.' : `${fail} test gagal.`}  (${pass} PASS, ${fail} FAIL)`);
process.exitCode = fail === 0 ? 0 : 1;