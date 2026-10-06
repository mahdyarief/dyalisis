// Dyalisis — patch upstream untuk `cytoscape-elk`.
//
// BUG (cytoscape-elk 1.2.2, node_modules/cytoscape-elk/cytoscape-elk.js:103):
//   getPos() membaca `parent.scratch('klay')` padahal makeNode() MENYIMPAN scratch
//   dengan key `'elk'` (baris 95/134/147). Ini sisa copy-paste dari cytoscape-klay
//   yang lupa di-rename. Akibatnya, begitu ada COMPOUND parent (parent/child),
//   `parent.scratch('klay')` = undefined → `kp.x` melempar TypeError dan layout ELK
//   mati. Layout tanpa compound tidak kena (loop `while(parent)` tak pernah jalan).
//
// Patch: ganti key 'klay' → 'elk'. Hanya menyentuh baris bug; tanpa compound
// (tak ada parent) loop tetap tidak jalan, jadi perilaku lama tak berubah.
//
// Idempoten & dependency-free. Dijalankan lewat `postinstall` (package.json) agar
// tetap berlaku setelah `npm install` ulang. Aman dijalankan berkali-kali.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, '..', 'node_modules/cytoscape-elk/cytoscape-elk.js');

const BUGGY = "var kp = parent.scratch('klay');";
const FIXED = "var kp = parent.scratch('elk');";

if (!existsSync(target)) {
  console.warn(`[patch-elk] dilewati — ${target} tidak ada (cytoscape-elk belum terpasang).`);
  process.exit(0);
}

const src = readFileSync(target, 'utf8');

if (src.includes(FIXED)) {
  console.log('[patch-elk] sudah dipatch (key \'elk\') — tidak ada aksi.');
  process.exit(0);
}
if (!src.includes(BUGGY)) {
  console.warn('[patch-elk] pola bug tidak ditemukan — versi cytoscape-elk mungkin sudah berbeda. Lewati.');
  process.exit(0);
}

writeFileSync(target, src.replace(BUGGY, FIXED));
console.log('[patch-elk] OK — getPos: parent.scratch(\'klay\') → parent.scratch(\'elk\').');