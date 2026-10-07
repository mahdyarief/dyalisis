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