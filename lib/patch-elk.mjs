// Dyalisis — patch upstream `cytoscape-elk` (idempoten, resolver-agnostic).
//
// BUG (cytoscape-elk 1.2.2, node_modules/cytoscape-elk/cytoscape-elk.js:103):
//   getPos() membaca `parent.scratch('klay')` padahal makeNode() MENYIMPAN scratch
//   dengan key `'elk'` (baris 95/134/147) — sisa copy-paste dari cytoscape-klay.
//   Begitu ada COMPOUND parent, `parent.scratch('klay')` = undefined → `kp.x`
//   melempar TypeError dan layout ELK mati.
//
// Patch: ganti key 'klay' → 'elk'. Dipanggil saat build/test (bukan postinstall),
// sehingga tetap berlaku baik di repo engine maupun di proyek pemakai, dan tahan
// terhadap hoisting npm (file cytoscape-elk di-resolve dari node_modules proyek).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BUGGY = "var kp = parent.scratch('klay');";
const FIXED = "var kp = parent.scratch('elk');";

/** Path file cytoscape-elk.js yang terlihat dari baseDir, atau null. */
function findElkFile(baseDir) {
  try {
    const req = createRequire(pathToFileURL(resolve(baseDir, 'package.json')));
    return req.resolve('cytoscape-elk');
  } catch {
    return null;
  }
}

/** Terapkan patch ke cytoscape-elk yang ter-resolve dari baseDir. Idempoten. */
export function patchElk(baseDir) {
  const file = findElkFile(baseDir);
  if (!file || !existsSync(file)) {
    console.warn(`[patch-elk] cytoscape-elk tak ditemukan dari ${baseDir} — lewati.`);
    return false;
  }
  const src = readFileSync(file, 'utf8');
  if (src.includes(FIXED)) return true;
  if (!src.includes(BUGGY)) {
    console.warn('[patch-elk] pola bug tak ditemukan — versi cytoscape-elk mungkin berbeda. Lewati.');
    return true;
  }
  writeFileSync(file, src.replace(BUGGY, FIXED));
  console.log("[patch-elk] OK — parent.scratch('klay') → parent.scratch('elk').");
  return true;
}