---
name: dyalisis-contribute
description: Panduan untuk AI agent yang ingin MENGEMBANGKAN/MENINGKATKAN engine Dyalisis (bukan sekadar memakainya sebagai framework). Gunakan saat ditanya cara menambah layout, kelas visual, seksi dokumentasi, diagram, check test, file scaffold, command CLI, atau cara mempublikasikan paket. Berisi prinsip content-agnostic, peta extension point, konvensi wajib, dan alur PR/rilis.
---

# Dyalisis — panduan kontribusi engine

Skill ini untuk **mengembangkan Dyalisis sendiri** (engine/framework). Untuk cara
**memakai** Dyalisis sebagai framework content, baca
[`../dyalisis/SKILL.md`](../dyalisis/SKILL.md). Dokumen lengkap (untuk manusia)
ada di [`CONTRIBUTING.md`](../../../CONTRIBUTING.md).

## Prinsip inti (jangan dilanggar)

1. **Content-agnostic** — engine tak boleh tahu nama aplikasi, id node, atau
   domain tertentu. Di test, ambil target dari data (`visible.find(...)`), bukan
   id literal.
2. **Read-only package** — build tak menulis file ke paket/node_modules. Content
   proyek di-alias lewat esbuild (`@dyalisis/content`).
3. **Verifikasi headless** — fitur baru wajib punya check di `test/run.mjs`;
   `npm test` harus hijau sebelum PR.
4. **Single-file output** — `dist/index.html` mandiri (tanpa server/CDN saat runtime).

## Setup dev

```bash
npm install
npm test          # 46 self-check headless (semua PASS)
npm run build     # → dist/index.html + dist/graph.json (demo dari src/data/example.js)
```

## Peta extension point

| Ingin menambah… | Sentuh file | Catatan |
|---|---|---|
| Layout baru (cose, klay, …) | `src/lib/layouts.js` — `LAYOUT_DEFS` | tambah `{ label, options }`; toolbar ikut otomatis |
| Selector/warna visual | `src/lib/graph-style.js` — `buildGraphStyle`, `graphPalette` | urutan deklarasi = prioritas; paling spesifik **terakhir** |
| Algoritma Mode Alur | `src/lib/flow.js` — `buildActivePath` | kembalikan `{ path, edges, branches }` |
| Analisis graf (hub/coupling/provenance) | `src/lib/analysis.js` | fungsi murni isomorphic; dipakai build + UI + test + MCP |
| Panel Insight sidebar | `src/components/InsightPanel.jsx` | tampil saat tak ada node terpilih |
| Server MCP | `lib/mcp.mjs` | `serve --mcp`, JSON-RPC stdio tanpa dependency |
| Seksi Dokumentasi | `src/components/DocsPanel.jsx` | C4 / arc42 / ADR / glosarium / Diátaxis |
| Diagram per-node | `src/components/UmlDiagram.jsx` | SVG inline, theme-aware |
| Legenda | `src/components/Legend.jsx` | ikut saat menambah kelas visual baru |
| Wiring app / state | `src/index.jsx` | content → elemen cytoscape, toolbar, sidebar |
| Check verifikasi | `test/run.mjs` | `check('nama', kondisi)` |
| File hasil scaffold | `lib/scaffold.mjs` | yang di-copy saat `dyalisis init` |
| Command CLI | `bin/dyalisis.mjs` | init / build / test |
| Bundling | `build.mjs` | esbuild + tailwind → inline ke template |

## Konvensi wajib (gotcha)

- `MODULES[i].id` **harus** `mod-<domain>` — engine menurunkan parent fitur dari
  `mod-${domain}`.
- `hierarchyHandling:'INCLUDE_CHILDREN'` **di dalam** `options.elk{}`, bukan di
  level atas, atau kotak modul tak membungkus fitur.
- Selector cytoscape: array style dievaluasi berurutan, yang **terakhir menang**
  (`.anchor` harus dideklarasikan setelah `.flow`/`.match`).
- Patch cytoscape-elk (`lib/patch-elk.mjs`) dipanggil **lazy** dari
  `build.mjs`/`test/run.mjs` — jangan ganti ke `postinstall`.

## Menambah check test

```js
check('deskripsi singkat', kondisi);          // di test/run.mjs
```

Bila menambah kelas visual baru, tambahkan juga check resolve selector-nya
(pola `flow`/`anchor`/`chain`/`noted` di blok §7 `test/run.mjs`).

## Alur PR & rilis

1. Branch dari `main`; implementasi + tambah/ubah check di `test/run.mjs`.
2. `npm test` (hijau) dan `npm run build` (sukses).
3. Perbarui doc bila alur berubah: `SKILL.md`, `README.md`, `AGENTS.md`.
4. PR: jelaskan apa yang berubah, mengapa, dan bukti `npm test`/`build`.
5. Rilis (maintainer): `npm version patch|minor|major` lalu `npm publish`.
   Ingat field `files` di `package.json` menentukan apa yang ikut terbit.