// Dyalisis publish — unggah dist/index.html ke endpoint penerbit (mis.
// dyalisis.nimb.us.ci) lalu cetak URL publik. Dipakai `bin/dyalisis.mjs publish`.
//   npx dyalisis publish [--slug nama] [--url https://dyalisis.example]
//                        [--token <rahasia>] [--overwrite] [--no-build]
//                        [--content f] [--out f]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDyalisis, resolveContentFile } from '../build.mjs';
import { slugify } from './slug.mjs';

const DEFAULT_URL = 'https://dyalisis.nimb.us.ci';
const RC_FILE = '.dyalisisrc.json';
const MANIFEST_FILE = '.dyalisis-manifest.json';

export { slugify };

/** Baca konfigurasi dari .dyalisisrc.json proyek (opsional). */
function readRc(projectDir) {
  const f = resolve(projectDir, RC_FILE);
  if (!existsSync(f)) return {};
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; }
}

/** Tulis sebagian konfigurasi ke .dyalisisrc.json (merge, tak menimpa kunci lain). */
function writeRc(projectDir, patch) {
  const f = resolve(projectDir, RC_FILE);
  const next = { ...readRc(projectDir), ...patch };
  writeFileSync(f, JSON.stringify(next, null, 2) + '\n');
  return next;
}

/** Baca manifest lokal (riwayat publish dari mesin ini). */
function readManifest(projectDir) {
  const f = resolve(projectDir, MANIFEST_FILE);
  if (!existsSync(f)) return [];
  try { const v = JSON.parse(readFileSync(f, 'utf8')); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Catat hasil publish ke manifest lokal (terbaru dulu, maksimum 200 entri). */
function appendManifest(projectDir, entry) {
  const list = readManifest(projectDir);
  list.unshift(entry);
  writeFileSync(resolve(projectDir, MANIFEST_FILE), JSON.stringify(list.slice(0, 200), null, 2) + '\n');
}

/** Resolusi endpoint & token: flag > env > .dyalisisrc.json > default. */
export function resolveConfig({ projectDir, url, token }) {
  const rc = readRc(projectDir);
  const endpoint = (url || process.env.DYALISIS_PUBLISH_URL || rc.publishUrl || DEFAULT_URL)
    .replace(/\/+$/, '');
  const authToken = token || process.env.DYALISIS_TOKEN || rc.publishToken || '';
  return { endpoint, token: authToken };
}

/** Ambil nama aplikasi dari content (untuk slug default). */
export async function appNameFromContent(projectDir, content) {
  try {
    const file = resolveContentFile(projectDir, content);
    const mod = await import(pathToFileURL(file).href);
    return mod.APP?.name || '';
  } catch { return ''; }
}

/** Unggah HTML mentah ke endpoint; kembalikan { slug, url }. */
export async function publishHtml({ endpoint, token, slug, html, graph = null, overwrite }) {
  const res = await fetch(`${endpoint}/api/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': graph ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
      Connection: 'close',
      'X-Dyalisis-Slug': slug,
      'X-Dyalisis-Overwrite': overwrite ? '1' : '0',
      ...(token ? { 'X-Dyalisis-Token': token } : {})
    },
    body: graph ? JSON.stringify({ html, graph }) : html
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `publish gagal (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  return { slug: data.slug, url: data.url };
}

/** Alur lengkap: (opsional build) → slug → unggah → URL publik. */
export async function publishDyalisis({
  projectDir = process.cwd(), content, out,
  slug, url, token, overwrite = false, build = true
} = {}) {
  const OUT = resolve(projectDir, out || 'dist/index.html');
  if (build || !existsSync(OUT)) {
    await buildDyalisis({ projectDir, content, out });
  }
  if (!existsSync(OUT)) throw new Error(`File output tak ditemukan: ${OUT}`);

  const { endpoint, token: authToken } = resolveConfig({ projectDir, url, token });
  const desired = slugify(slug || await appNameFromContent(projectDir, content));
  const html = readFileSync(OUT, 'utf8');

  // graph.json (di samping HTML) → ikut diunggah supaya endpoint AI tersedia.
  const GRAPH = resolve(dirname(OUT), 'graph.json');
  let graph = null;
  if (existsSync(GRAPH)) { try { graph = JSON.parse(readFileSync(GRAPH, 'utf8')); } catch { graph = null; } }

  const result = await publishHtml({ endpoint, token: authToken, slug: desired, html, graph, overwrite });

  console.log(`[dyalisis] dipublikasikan → ${result.url}`);
  if (result.slug !== desired) console.log(`[dyalisis] slug           : ${result.slug} (diminta: ${desired})`);
  if (graph) {
    console.log(`[dyalisis] graph.json     : ${result.url}.json`);
    console.log(`[dyalisis] markdown       : ${result.url}.md`);
    console.log(`[dyalisis] llms.txt       : ${result.url}/llms.txt`);
    console.log(`[dyalisis] MCP (HTTP)     : POST ${result.url}/mcp`);
  } else {
    console.log('[dyalisis] (graph.json tak ada — jalankan build dulu untuk endpoint AI-friendly)');
  }

  appendManifest(projectDir, {
    slug: result.slug, url: result.url, owner: authToken ? undefined : 'anonymous',
    publishedAt: new Date().toISOString()
  });
  return result;
}

/** Hapus publikasi dari server (mis. membersihkan slug orphan). */
export async function deleteDyalisis({ projectDir = process.cwd(), slug, url, token } = {}) {
  if (!slug) throw new Error('slug wajib: dyalisis delete <slug>');
  const { endpoint, token: authToken } = resolveConfig({ projectDir, url, token });
  const res = await fetch(`${endpoint}/api/publications/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: { Connection: 'close', ...(authToken ? { 'X-Dyalisis-Token': authToken } : {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `delete gagal (HTTP ${res.status})`);
  console.log(`[dyalisis] dihapus → ${slug}`);
  return data;
}

/** Login: daftarkan handle ke server → simpan token ke .dyalisisrc.json. */
export async function loginDyalisis({ projectDir = process.cwd(), handle, url, token } = {}) {
  if (!handle) throw new Error('handle wajib: dyalisis login <handle>');
  const { endpoint } = resolveConfig({ projectDir, url, token });
  const res = await fetch(`${endpoint}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify({ handle })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `login gagal (HTTP ${res.status})`);
  }
  writeRc(projectDir, { publishUrl: endpoint, publishToken: data.token, handle: data.handle });
  console.log(`[dyalisis] login sebagai "${data.handle}" — token tersimpan di ${RC_FILE}`);
  return data;
}

/** List: tampilkan riwayat publish lokal (manifest), atau `--remote` dari server. */
export async function listDyalisis({ projectDir = process.cwd(), url, token, remote = false } = {}) {
  const { endpoint, token: authToken } = resolveConfig({ projectDir, url, token });

  if (remote) {
    const rc = readRc(projectDir);
    const owner = rc.handle ? `?owner=${encodeURIComponent(rc.handle)}` : '';
    const res = await fetch(`${endpoint}/api/publications${owner}`, { headers: { Connection: 'close' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `list gagal (HTTP ${res.status})`);
    const pubs = data.publications || [];
    console.log(`[dyalisis] ${pubs.length} publikasi di ${endpoint}${rc.handle ? ` (owner: ${rc.handle})` : ''}`);
    for (const p of pubs) console.log(`  ${p.slug}  ${p.createdAt?.slice(0, 10) || ''}  ${p.owner || ''}`);
    return pubs;
  }

  const list = readManifest(projectDir);
  console.log(`[dyalisis] ${list.length} entri manifest lokal di ${projectDir}`);
  for (const e of list) console.log(`  ${e.slug}  ${e.publishedAt?.slice(0, 10) || ''}  ${e.url || ''}`);
  return list;
}