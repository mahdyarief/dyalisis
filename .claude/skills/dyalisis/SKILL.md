---
name: dyalisis
description: Framework visualisasi feature-analysis reusable — engine Cytoscape.js + shadcn/ui (React) + Tailwind yang di-compile esbuild menjadi SATU file HTML mandiri. Engine & content terpisah: ganti src/data/*.js untuk aplikasi apa pun. Hierarki 4 level (Aplikasi → Modul → Fitur → Aksi) sebagai compound boundary boxes (C4-style), layout Dagre/ELK/Breadthfirst/Circle/Grid, sidebar detail, seleksi compound-aware. Gunakan saat diminta memvisualisasikan fitur/daftar fitur aplikasi, flow aplikasi, node-flow, atau membangun diagram hierarki fungsional dari sebuah codebase/aplikasi.
---

# Dyalisis — Reusable Feature-Analysis Visualization Framework

Dyalisis mengubah daftar fitur sebuah aplikasi menjadi **satu file HTML interaktif
mandiri** (tanpa server, tanpa CDN saat runtime). Node aplikasi disusun sebagai
hierarki 4 level dan digambar sebagai *boundary boxes* bergaya C4.

## 1. Apa yang dihasilkan

- `dist/index.html` — SATU file, CSS + JS ter-inline. Buka langsung di browser.
- Graph interaktif: pan/zoom, layout berganti, klik node → sidebar detail,
  seleksi meredupkan elemen tak terkait, toggle level aksi (L3).

Model data = dekomposisi fungsional 4 tingkat:

| Level | Nama | Contoh | Peran di graph |
|---|---|---|---|
| L0 | Aplikasi | Acme Ops | root, parent tertinggi |
| L1 | Modul | Penjualan | compound box |
| L2 | Fitur | Pesanan | leaf (atau parent L3) |
| L3 | Aksi | Buat Pesanan | leaf kecil berlabel |

Tiap level diturunkan dari level di atasnya (parent/child → compound node).

## 2. Struktur repo

```
dyalisis/
├── build.mjs              # bundler: source modular → dist/index.html
├── template.html          # shell HTML (placeholder CSS/JS/title)
├── tailwind.config.js
├── package.json           # build, test, postinstall
├── src/
│   ├── index.jsx          # React app: data → elemen cytoscape, toolbar, sidebar
│   ├── content.js         # GENERATED oleh build.mjs (re-export content)
│   ├── styles.css         # Tailwind + CSS vars shadcn (tema dark)
│   ├── components/        # GraphCanvas.jsx (cytoscape) + ui/* (shadcn-style)
│   ├── lib/layouts.js     # preset layout + applyLayout()
│   └── data/
│       └── example.js     # CONTENT demo generik (di-ship bersama framework)
├── scripts/patch-elk.mjs  # patch bug upstream cytoscape-elk (lihat §7)
└── test/run.mjs           # self-test headless (integritas, compound, layout)
```

**Engine vs content terpisah total.** Engine (semua kecuali `src/data/*.js`) tidak
tahu aplikasi apa pun. Untuk aplikasi baru, cukup tambah satu file content.

## 3. Quickstart

```bash
npm install          # postinstall menjalankan patch-elk otomatis
npm run build        # → dist/index.html (memakai src/data/example.js)
npm test             # self-test headless
```

Untuk aplikasi nyata:

```bash
node build.mjs --content src/data/nama-app.js
node test/run.mjs --content src/data/nama-app.js
```

`--out ./somewhere/index.html` mengubah lokasi output.

## 4. Kontrak content layer (WAJIB)

Satu modul ES yang mengekspor 11 simbol. Lihat `src/data/example.js` sebagai
template terpendek yang lolos semua test.

```js
export const APP = { name, subtitle };                       // judul + subjudul
export const DOMAINS = {                                     // warna + label per domain
  domainId: { label: 'Penjualan', color: '#22d3ee' }
};
export const ROOT = { id: 'app', label, domain,
  desc, fields, route };                                     // node L0 (tunggal)

export const MODULES = [                                     // L1 — 1 per domain
  { id: 'mod-<domain>', label, domain, desc, fields, route, perm }
];

export const NODES = [                                       // L2 — fitur
  { id, label, domain, desc, fields, route, perm }
];

export const ACTIONS = [                                     // L3 — aksi/route
  { id, label, parent: <idFitur>, domain }
];

export const EDGES = [                                       // hierarki (opsional dipakai UI)
  ['app', 'mod-x', 'modul'], ['mod-x', 'fitur-x', 'fitur'], ['fitur-x', 'fitur-x~0', 'aksi']
];

export const DATA_EDGES = [                                  // relasi data antar-fitur (berlabel)
  ['fiturA', 'fiturB', 'field_kunci']
];

export const LEVELS = { 0:[...], 1:[...], 2:[...], 3:[...] }; // id per level (untuk levelOf)
export const LEVEL_NAMES = { 0:'Aplikasi', 1:'Modul', 2:'Fitur', 3:'Aksi' };
export const levelOf = (id) => { /* 0..3 */ };
```

**Aturan struktur yang diuji `npm test`:**
- `id` unik di seluruh node.
- `parent` tiap node merujuk id yang ada; **tanpa siklus**.
- `MODULES[i].id` **harus** `mod-<domain>` — engine menurunkan parent fitur dari
  `mod-${node.domain}`, jadi konvensi ini wajib.
- Tiap modul punya ≥1 fitur; tiap fitur punya ≥1 aksi.
- `LEVELS` konsisten dengan panjang `MODULES`/`NODES`/`ACTIONS`; `levelOf` benar.
- Semua `domain` node/aksi terdaftar di `DOMAINS`.

## 5. Menambah aplikasi baru (langkah)

1. Salin `src/data/example.js` → `src/data/<app>.js`.
2. Isi `APP`, `DOMAINS` (label + warna), `ROOT`, `MODULES`, `NODES`, lalu
   `ACTION_DEFS` (map `idFitur → [label aksi...]`) dan turunkan `ACTIONS`.
3. Tulis `DATA_EDGES` = relasi data antar-fitur `[dari, ke, field_kunci]`.
4. Jalankan `node test/run.mjs --content src/data/<app>.js` → harus 15/15 PASS.
5. `node build.mjs --content src/data/<app>.js` → `dist/index.html`.

**Tips model:** domain = kelompok fungsional (bukan tim). Fitur = fungsi utama
yang punya route/menu sendiri. Aksi = operasi/tombol/route di dalam fitur.
Field kunci = kolom basis data yang mengikat fitur secara lintas-modul.

## 6. Layout tersedia

Preset di `src/lib/layouts.js` (`LAYOUT_DEFS`): `dagre` (default, level-flow),
`elk` (layered renggang, compound-aware), `breadthfirst` (alur), `circle`, `grid`.

`applyLayout(cy, name, { animate })` deep-copy options tiap run — cytoscape
**memutasi** objek options saat `run()`, jadi reuse referensi bikin transisi antar
layout rusak. Layout instant saat mount pakai `animate:false`.

## 7. GOTCHA — patch cytoscape-elk (WAJIB)

`cytoscape-elk` 1.2.2 punya bug upstream: `getPos()` membaca
`parent.scratch('klay')` padahal scratch disimpan dengan key `'elk'`. Akibatnya
**layout ELK mati begitu ada compound parent (parent/child)** — yang justru inti
Dyalisis. `scripts/patch-elk.mjs` memperbaikinya (idempoten, dependency-free),
dijalankan otomatis via `postinstall`. Jangan hapus langkah ini.

Catatan ELK compound: `hierarchyHandling:'INCLUDE_CHILDREN'` **harus** berada di
dalam objek `options.elk{}` — cytoscape-elk hanya meneruskan `options.elk` sebagai
`layoutOptions`; opsi di level atas dibuang. ELK juga **asinkron** (posisi terisi
setelah `layoutstop`).

## 8. Testing

`npm test` menjalankan `test/run.mjs` headless (tanpa browser) dan menguji:
integritas hierarki (8), compound boundary boxes (2), keep-set seleksi
compound-aware (2), dan bahwa dagre + ELK benar-benar menghasilkan posisi (3).
Semua target diambil **dari data** — tidak ada id aplikasi yang di-hardcode,
sehingga test jalan untuk content apa pun.

## 9. Arsitektur (mengapa begini)

- **Single-file output**: esbuild bundle `src/index.jsx` (IIFE, minify) lalu
  inline CSS+JS ke `template.html`. `elkjs` di-alias ke `elk.bundled.js` agar
  entry Node (worker/fs) tidak bocor ke browser.
- **shadcn asli**: komponen shadcn di-copy (Button/Card/Badge/Input) sebagai
  React + Tailwind — bukan paket CLI `shadcn-ui` (yang merupakan CLI Node usang).
- **Content detachable**: `build.mjs` menulis `src/content.js` yang hanya
  `export * from <CONTENT>`. Engine mengimpor `./content` — tak tahu aplikasi apa.

## 10. Publish ke GitHub (framework-only)

Repo mengirim **hanya engine**; data aplikasi tidak ikut. `.gitignore` sudah
mengecualikan `node_modules/`, `dist/`, `src/content.js`, dan semua
`src/data/*` kecuali `example.js`. Aman: pengguna repo menjalankan
`npm install && npm run build` dan langsung dapat demo dari `example.js`.