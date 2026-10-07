// Dipanggil `node scripts/patch-elk.mjs` (repo engine) — pakai resolver dari repo.
// Proyek pemakai tidak memakai ini; build/test memanggil patchElk() dengan
// direktori proyek agar node_modules yang di-hoist tetap ter-patch.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { patchElk } from '../lib/patch-elk.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
patchElk(repo);