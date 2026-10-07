# Contributing to Dyalisis

Dyalisis = **engine** (framework umum) yang dipakai lewat npm; aplikasi seperti
SoftMedis = **content**. Dokumen ini untuk kontributor yang ingin
**mengembangkan engine** — bukan sekadar memakainya. Untuk cara memakai, lihat
[`README.md`](README.md) dan [`.claude/skills/dyalisis/SKILL.md`](.claude/skills/dyalisis/SKILL.md).
Kontrak kontribusi ringkas untuk AI agent ada di
[`.claude/skills/dyalisis-contribute/SKILL.md`](.claude/skills/dyalisis-contribute/SKILL.md).

## Prinsip inti

1. **Content-agnostic** — engine tak boleh tahu nama aplikasi, id node, atau
   domain tertentu. Semua target di test diambil dari data.
2. **Read-only package** — build tidak menulis file ke paket/node_modules;
   content proyek di-alias lewat esbuild (`@dyalisis/content`).
3. **Verifikasi headless** — setiap fitur baru wajib punya check di
   `test/run.mjs`; `npm test` harus hijau.
4. **Single-file output** — `dist/index.html` mandiri (tanpa server/CDN saat runtime).

## Setup dev

```bash
npm install
npm test          # 30 self-check headless (semua harus PASS)
npm run build     # → dist/index.html (demo dari src/data/example.js)
```

## Peta extension point

| Ingin menambah… | Sentuh file | Catatan |
|---|---|---|
| Layout baru (mis. cose, klay) | `src/lib/layouts.js` — `LAYOUT_DEFS` | tambah entri `{ label, options }`; daftar di toolbar ikut otomatis |
| Selector/warna visual | `src/lib/graph-style.js` — `buildGraphStyle`, `graphPalette` | urutan deklarasi selector = prioritas (`.anchor` menang atas `.flow`) |
| Algoritma Mode Alur | `src/lib/flow.js` — `buildActivePath` | kembalikan `{ path, edges, branches }` |
| Seksi panel Dokumentasi | `src/components/DocsPanel.jsx` | C4 / arc42 / ADR / glosarium / Diátaxis |
| Diagram per-node | `src/components/UmlDiagram.jsx` | SVG inline, theme-aware |
| Legenda | `src/components/Legend.jsx` | ikut saat tambah kelas visual baru |
| Wiring app / state | `src/index.jsx` | data → elemen cytoscape, toolbar, sidebar |
| Check verifikasi | `test/run.mjs` | `check('nama', kondisi)` |
| File proyek hasil scaffold | `lib/scaffold.mjs` | apa yang di-copy saat `init` |
| Alur CLI | `bin/dyalisis.mjs` | init / build / test / login / publish / list / serve |
| Client publish | `lib/publish.mjs` | resolveConfig, publishHtml, login/list |
| Slug unik & sanitize | `lib/slug.mjs` | `slugify`, `isSafeSlug` (dipakai client + server) |
| Server penerbit | `server/publish-server.mjs`, `server/store.mjs` | route HTTP + storage filesystem |
| Bundling | `build.mjs` | esbuild + tailwind → inline |

## Konvensi wajib

- `MODULES[i].id` **harus** `mod-<domain>`; engine menurunkan parent fitur dari
  `mod-${domain}`.
- Jangan hardcode id aplikasi di engine/test — ambil target dari data (lihat
  `sampleFeature`/`sampleModule` di `test/run.mjs`).
- `hierarchyHandling:'INCLUDE_CHILDREN'` **di dalam** `options.elk{}` (bukan level
  atas), atau kotak modul tak membungkus fitur.
- Selector cytoscape: taruh yang paling spesifik **terakhir** (array style
  dievaluasi berurutan; yang terakhir menang).

## Menambah check test

```js
check('deskripsi singkat', kondisi);          // di test/run.mjs
```

Target harus berasal dari content (mis. `visible.find(...)`), bukan id literal.
Kalau menambah kelas visual baru, tambahkan check resolve selector-nya (lihat
blok §7 di `test/run.mjs` untuk pola `flow`/`anchor`/`chain`/`noted`).

## Alur PR

1. Branch dari `main`.
2. Implementasi + tambah/ubah check di `test/run.mjs`.
3. `npm test` (harus hijau) dan `npm run build` (harus sukses).
4. Perbarui doc terkait bila alur berubah: `SKILL.md` (kontrak), `README.md`,
   `AGENTS.md`.
5. Buka PR dengan: apa yang berubah, mengapa, dan bukti `npm test`/`build`.

## Rilis (maintainer)

```bash
npm version patch|minor|major      # bump + tag
npm publish                        # paket `dyalisis`
```

Ingat `files` di `package.json` — hanya file yang listed yang ikut terbit.