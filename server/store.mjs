// Penyimpanan publish — filesystem, zero-dep, mudah dipindah ke SQLite nanti.
// Layout: DATA/<slug>/index.html + DATA/<slug>/meta.json ; DATA/_tokens.json
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { slugify, isSafeSlug } from '../lib/slug.mjs';

/** Baca graph.json sebuah publikasi; null bila tak ada / rusak. */
function readGraph(dir) {
  const file = join(dir, 'graph.json');
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * @param {string} dataDir direktori data (dibuat bila belum ada)
 */
export function createStore(dataDir) {
  const root = resolve(dataDir);
  mkdirSync(root, { recursive: true });
  const tokensFile = join(root, '_tokens.json');

  const readTokens = () => {
    try { return JSON.parse(readFileSync(tokensFile, 'utf8')); } catch { return {}; }
  };
  const writeTokens = (o) => writeFileSync(tokensFile, JSON.stringify(o, null, 2) + '\n');

  return {
    root,

    /** Alokasi slug unik via mkdir atomik; kembalikan slug final. */
    allocate(desired, overwrite = false) {
      const base = slugify(desired);
      if (overwrite) {
        rmSync(join(root, base), { recursive: true, force: true });
        mkdirSync(join(root, base));
        return base;
      }
      let n = 0, candidate = base;
      for (;;) {
        try { mkdirSync(join(root, candidate)); return candidate; }
        catch (e) {
          if (e.code !== 'EEXIST') throw e;
          n++;
          if (n > 9999) throw new Error('terlalu banyak duplikat untuk slug ini');
          candidate = `${base}-${n}`;
        }
      }
    },

    /** Simpan artefak + metadata. `graph` (opsional) = model ternormalisasi. */
    save(slug, html, meta, graph = null) {
      const dir = join(root, slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), html);
      writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
      if (graph) writeFileSync(join(dir, 'graph.json'), JSON.stringify(graph) + '\n');
      return meta;
    },

    /** Ambil publikasi; null bila tak ada / slug tak aman. `graph` null bila tak ada. */
    get(slug) {
      if (!isSafeSlug(slug)) return null;
      const dir = join(root, slug);
      const file = join(dir, 'index.html');
      if (!existsSync(file)) return null;
      let meta = { slug };
      try { meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')); } catch { /* biarkan */ }
      return { html: readFileSync(file, 'utf8'), meta, graph: readGraph(dir) };
    },

    /** Hapus publikasi; true bila terhapus, false bila tak ada / slug tak aman. */
    remove(slug) {
      if (!isSafeSlug(slug)) return false;
      const dir = join(root, slug);
      if (!existsSync(join(dir, 'meta.json'))) return false;
      rmSync(dir, { recursive: true, force: true });
      return true;
    },

    /** Daftar publikasi (opsional filter owner), terbaru dulu. */
    list(owner) {
      const out = [];
      for (const name of readdirSync(root)) {
        if (name.startsWith('_')) continue;
        const metaFile = join(root, name, 'meta.json');
        if (!existsSync(metaFile)) continue;
        let m;
        try { m = JSON.parse(readFileSync(metaFile, 'utf8')); } catch { continue; }
        if (owner && m.owner !== owner) continue;
        out.push(m);
      }
      return out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    },

    /** Registrasi handle → token. Handle unik; kembalikan { token, handle } | { error }. */
    register(handle) {
      const h = slugify(handle);
      const tokens = readTokens();
      for (const v of Object.values(tokens)) {
        if (v.handle === h) return { error: `handle "${h}" sudah dipakai` };
      }
      const token = randomUUID().replace(/-/g, '');
      tokens[token] = { handle: h, createdAt: new Date().toISOString() };
      writeTokens(tokens);
      return { token, handle: h };
    },

    /** Handle pemilik dari token (null bila token kosong/tak dikenal). */
    ownerOf(token) {
      if (!token) return null;
      const t = readTokens()[token];
      return t ? t.handle : null;
    }
  };
}