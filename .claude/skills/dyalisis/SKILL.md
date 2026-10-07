---
name: dyalisis
description: Framework visualisasi feature-analysis — engine Cytoscape.js + shadcn/ui (React) + Tailwind yang di-compile esbuild menjadi SATU file HTML mandiri. Dipakai lewat npm (`npx dyalisis init`): engine tetap read-only di paket, content hidup di proyek pemakai sebagai dyalisis.content.js. Hierarki 4 level (Aplikasi → Modul → Fitur → Aksi) sebagai compound boundary boxes (C4-style), layout Dagre/ELK/Breadthfirst/Circle/Grid, sidebar detail, seleksi compound-aware. Gunakan saat diminta memvisualisasikan fitur/daftar fitur aplikasi, flow aplikasi, node-flow, atau membangun diagram hierarki fungsional dari sebuah codebase/aplikasi.
---

# Dyalisis — Feature-Analysis Visualization Framework

Dyalisis mengubah daftar fitur sebuah aplikasi menjadi **satu file HTML interaktif
mandiri** (tanpa server, tanpa CDN saat runtime). Node aplikasi disusun sebagai
hierarki 4 level dan digambar sebagai *boundary boxes* bergaya C4.

## 1. Apa yang dihasilkan

- `dist/index.html` — SATU file, CSS + JS ter-inline. Buka langsung di browser.
- Graph interaktif: pan/zoom, layout berganti, klik node → sidebar detail,
  seleksi meredupkan elemen tak terkait, toggle level aksi (L3).
- **UML class diagram per node** di sidebar: kotak kelas 3 kompartemen
  («stereotype» + nama / atribut dari `fields` / operasi dari anak) + asosiasi
  ke kelas tetangga berlabel field penghubung. SVG inline, theme-aware, tanpa
  dependency baru. Pratinjau kecil bisa **diklik → modal perbesar** (portal ke
  `<body>`, tutup via klik luar / Esc).

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
├── bin/dyalisis.mjs       # CLI: init / build / test (shebang, dipasang via `bin`)
├── build.mjs              # bundler engine+content → dist/index.html (juga library)
├── lib/
│   ├── scaffold.mjs       # scaffolder proyek content (`dyalisis init`)
│   └── patch-elk.mjs      # patch bug upstream cytoscape-elk (lazy, lihat §7)
├── template.html          # shell HTML (placeholder CSS/JS/title)
├── tailwind.config.js
├── package.json           # bin, files, engines, deps (build/test via bin)
├── src/
│   ├── index.jsx          # React app: data → elemen cytoscape, toolbar, sidebar
│   ├── styles.css         # Tailwind + CSS vars shadcn (tema dark)
│   ├── components/        # GraphCanvas.jsx (cytoscape) + ui/* (shadcn-style)
│   ├── lib/layouts.js     # preset layout + applyLayout()
│   ├── lib/flow.js        # buildActivePath() untuk Mode Alur
│   └── data/
│       └── example.js     # CONTENT demo generik (di-ship bersama framework)
└── test/run.mjs           # self-test headless (integritas, compound, layout, flow)
```

**Engine vs content terpisah total.** Engine (semua kecuali content) tidak tahu
aplikasi apa pun. Paket ini read-only: content proyek pemakai
(`./dyalisis.content.js`) di-alias lewat esbuild (`@dyalisis/content`) saat build,
jadi tidak ada file generated yang ditulis ke `node_modules`.

## 3. Quickstart

Dipakai sebagai framework npm — scaffold proyek content baru:

```bash
npx dyalisis init aplikasi-saya   # folder proyek + dyalisis.content.js (stub)
cd aplikasi-saya
npm install
npx dyalisis test                 # 30 self-check headless → semua PASS
npx dyalisis build                # → dist/index.html (single-file, offline)
```

Untuk aplikasi nyata, cukup sunting `dyalisis.content.js` lalu ulangi
`test` → `build`. `--content <file>` dan `--out <file>` bisa dipakai untuk
menunjuk file/lokasi lain (default: `./dyalisis.content.js` dan `dist/index.html`).

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
  { id, label, domain, desc, fields, route, perm,
    entity }                                                 // entity = nama class UML (opsional)
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

**Simbol opsional (memperkaya panel Dokumentasi):**

```js
export const DECISIONS = [{ title, status, context, decision }]; // ADR (arc42 §9)
export const ARC42     = [{ no: 2, body: '...' }];               // override narasi seksi arc42 (1–12)
export const GLOSSARY  = [{ term, definition }];                 // glosarium (arc42 §12)
export const DOCS      = [{ kind: 'How-to', items: ['...'] }];   // artefak Diátaxis (menimpa turunan)
export const NOTES     = { idNode: 'catatan kritis...' };        // seed catatan per node
```

**Aturan struktur yang diuji `npm test` (30 check):**
- `id` unik di seluruh node.
- `parent` tiap node merujuk id yang ada; **tanpa siklus**.
- `MODULES[i].id` **harus** `mod-<domain>` — engine menurunkan parent fitur dari
  `mod-${node.domain}`, jadi konvensi ini wajib.
- Tiap modul punya ≥1 fitur; tiap fitur punya ≥1 aksi.
- `LEVELS` konsisten dengan panjang `MODULES`/`NODES`/`ACTIONS`; `levelOf` benar.
- Semua `domain` node/aksi terdaftar di `DOMAINS`.
- `DATA_EDGES` kedua ujungnya menunjuk node nyata; kunci `NOTES` menunjuk node nyata.
- `buildActivePath()` (jalur Alur) menguji langsung fungsi engine: langkah pertama
  = start, tiap langkah terhubung `DATA_EDGES`, tanpa node berulang, selektif
  (bukan seluruh graph), `branches` memuat semua successor, dan `branchChoice`
  benar-benar mengubah cabang.
- Bahasa visual diuji lewat resolusi selector cytoscape: `node.flow` border =
  `highlight`, `node.anchor` menang atas `flow`, `edge.chain` lebih tebal dari
  edge biasa, `node.noted` memakai `pie-1-background-size` kecil.

**UML class diagram (otomatis dari data):** komponen `UmlDiagram.jsx` mengubah
`fields` (CSV) jadi atribut kelas, anak node jadi operasi, dan `DATA_EDGES` yang
menyentuh node jadi asosiasi berlabel field. `entity` (opsional) menamai kelas;
tanpa itu dipakai `label`. Tipe atribut ditebak dari pola nama (ref/date/number/
string). Tidak perlu konfigurasi tambahan.

**Panel Dokumentasi (`DocsPanel.jsx`):** dibuka dari ikon buku di header. Menyusun
empat perspektif arsitektur — **seluruhnya content-agnostic**: nilai default
dihitung dari data, lalu content boleh menimpa lewat simbol opsional.

- **C4 Model** — pemetaan L0–L3 → Context/Container/Component/Code + jumlah node.
- **arc42** — **12 seksi lengkap** (Intro & Goals, Constraints, Context & Scope,
  Solution Strategy, Building Blocks, Runtime View, Deployment, Crosscutting,
  Decisions, Quality, Risks & Debt, Glossary). Tiap seksi punya ringkasan turunan
  dari data; content dapat menimpanya lewat `ARC42: [{ no, body }]` (nomor seksi 1–12).
- **ADR** — dari array opsional `DECISIONS`: `{ title, status, context, decision }`
  dengan `status` salah satu dari `proposed|accepted|rejected|deprecated`.
- **Glosarium** — dari array opsional `GLOSSARY`: `{ term, definition }` (tampil di
  seksi tersendiri + mengisi arc42 §12).
- **Diátaxis** — empat jenis dokumen (Tutorial/How-to/Reference/Explanation) dengan
  **artefak nyata** diturunkan dari data (modul awal, fitur+route, katalog field,
  relasi data); content dapat menimpanya lewat `DOCS: [{ kind, items }]`.

**Mode Alur:** tombol "Alur" di kanan-bawah kanvas menyorot **satu jalur aktif**
dari fitur terpilih menuju hilir. `buildActivePath()` (src/lib/flow.js) sengaja
tidak menyorot seluruh sub-grafik: pada graph kecil, seluruh node hulu+hilir
hampir menyalakan semua node (terukur ~92% pada example.js), sehingga highlight
kehilangan makna. Alih-alih, framework menelusuri satu jalur; di tiap
percabangan beda, sidebar menampilkan pemilih cabang (`⇉ cabang: A | B`) yang
bisa diganti user — pemilihan disimpan di state `branchChoice` dan jalur
dihitung ulang. Titik start (`flowStart`) terpisah dari langkah aktif
(`selectedId`), sehingga mengklik langkah lain hanya memindahkan penanda, bukan
mengubah root jalur. Node di luar jalur tetap redup tapi terlihat, jadi cabang
alternatif tersedia tanpa membanjiri kanvas.

Bahasa visualnya satu warna: node jalur **dan** panah sama-sama memakai warna
`highlight` dari palet tema, jadi jalur terbaca sebagai satu kesatuan — bukan
"panah menyala, node tidak". Kelas yang dipasang (`GraphCanvas.jsx`):

| Kelas | Arti | Penanda visual |
|---|---|---|
| `node.flow` | node ikut jalur Alur | border warna `highlight`, tebal 4, label bold |
| `edge.chain` | edge **antar-langkah berurutan** di jalur aktif | tebal 3.5, panah 1.5×, warna `highlight` |
| `node.anchor` | langkah yang **sedang dipilih** | border putih (5) + halo underlay |
| `node.noted` | node punya catatan | irisan pie `noteColor` di sudut node |
| `node.match` / `.faded` | hasil pencarian / di luar konteks | border amber / opacity turun |

`anchor` dideklarasikan **terakhir** di antara penanda node pada
`buildGraphStyle()`, karena cytoscape menyelesaikan konflik selector lewat
urutan deklarasi — di mode Alur semua node jalur ber-`.flow`, jadi tanpa
prioritas ini pengguna tidak tahu sedang berdiri di langkah mana. Kelas dipakai
(bukan `:selected`) sebab seleksi bisa datang dari sidebar atau tombol
Berikutnya, bukan klik pada kanvas.

**Catatan node (jembatan Manusia↔AI):** tiap node bisa membawa catatan kritis
— aturan bisnis tak tertulis, jebakan integrasi, alasan sebuah keputusan — lewat
simbol opsional `NOTES` (`{ idNode: 'teks' }`). Ini murni **view baca-saja**:
framework hanya menampilkan informasi yang Anda tandai di content, tanpa input,
tanpa penyimpanan, tanpa `localStorage`. Untuk mengubahnya, sunting `NOTES` lalu
build ulang — sehingga kurasi penulis/AI selalu ikut terbawa ke artefak.
Penandanya: badge pie pada node, hitungan di legenda, dan dot pada daftar
langkah Alur.

## 5. Menambah aplikasi baru (langkah)

1. `npx dyalisis init <app>` → folder proyek + `dyalisis.content.js` (stub dari
   `example.js`).
2. Isi `APP`, `DOMAINS` (label + warna), `ROOT`, `MODULES`, `NODES`, lalu
   `ACTION_DEFS` (map `idFitur → [label aksi...]`) dan turunkan `ACTIONS`.
3. Tulis `DATA_EDGES` = relasi data antar-fitur `[dari, ke, field_kunci]`.
4. Jalankan `npx dyalisis test` → harus 30/30 PASS.
5. `npx dyalisis build` → `dist/index.html`.

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
Dyalisis. `lib/patch-elk.mjs` memperbaikinya (idempoten, dependency-free), dan
dipanggil **lazy** dari `build.mjs`/`test/run.mjs` — di-resolve dari proyek pemakai
via `createRequire`, jadi aman untuk npm hoisting. Tidak ada `postinstall` yang
rapuh. Jangan hapus langkah ini.

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
- **Content detachable**: engine mengimpor spesifier sintetis `@dyalisis/content`;
  `build.mjs` meng-alias spesifier itu ke file content proyek pemakai. Tidak ada
  file generated yang ditulis ke paket/node_modules — paket tetap read-only.

## 10. Publikasi & kontribusi

Repo mengirim **hanya engine**; data aplikasi tidak ikut. `.gitignore` sudah
mengecualikan `node_modules/`, `dist/`, dan `.dyalisis-tmp/`. Pengguna memasang
via npm (`npx dyalisis init`) — `example.js` di-ship sebagai content demo default.

Ingin **mengembangkan/meningkatkan framework-nya sendiri** (bukan sekadar memakai)?
Baca [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) dan skill
[`.claude/skills/dyalisis-contribute/SKILL.md`](../dyalisis-contribute/SKILL.md):
peta extension point, konvensi wajib, cara menambah check test, dan alur rilis.

## 11. Case study — contoh SIMRS SaaS multi-tenant

Contoh anonim pemakaian Dyalisis pada sebuah aplikasi **SIMRS/HMS** (sistem
informasi rumah sakit modern, SaaS multi-tenant, Laravel + Inertia.js +
Livewire). Content: `src/data/<app>.js` (mis. 30-an fitur, 7 domain, ratusan
route dan permission) — dipakai sebagai studi kasus untuk membuktikan panel
Dokumentasi terisi penuh dari data nyata.

**Pemetaan 4 level → C4:**

| Level | C4 | Contoh SIMRS |
|---|---|---|
| L0 | Context | SIMRS (tenant SaaS) |
| L1 | Container | Pendaftaran, Klinis, Farmasi, Keuangan, SDM & Aset, Bridging, Master & Setting |
| L2 | Component | fitur (Pendaftaran Pasien, SOAP, E-Resep, Billing, Jurnal, bridging BPJS, bridging FHIR, …) |
| L3 | Code | aksi/route tiap fitur (mis. `registrasi/*`, `api/antrian/*`) |

**arc42 terisi (beberapa seksi naratif + sisanya turunan otomatis).** Karena
framework menghitung default dari data, hanya seksi yang butuh narasi domain
yang diisi lewat `ARC42`:

```js
export const ARC42 = [
  { no: 2,  body: 'Laravel/Inertia/Livewire (SPA), named routes; DB per tenant; auth token + 2FA panel admin; integrasi eksternal: bridging BPJS & FHIR.' },
  { no: 4,  body: 'SaaS multi-tenant (database per tenant); modul dipisah per domain; RBAC granular menggerakkan visibilitas menu.' },
  { no: 7,  body: 'Aplikasi tenant + panel super-admin terpisah; siklus hidup trial → active → readonly → suspend → archive.' },
  { no: 10, body: 'Transaksi klinis-billing utuh; jejak audit via jurnal double-entry; interoperabilitas FHIR.' },
  { no: 11, body: 'Ratusan route & permission = permukaan uji besar; ketergantungan pada satu kunci kunjungan; integrasi eksternal rawan downtime partner.' }
];
```

Seksi lain (Intro & Goals, Context & Scope, Building Blocks, Runtime View,
Crosscutting, Decisions, Glossary) terisi otomatis: dari `app.subtitle`,
jumlah modul/fitur/aksi, jumlah `DATA_EDGES`, dan `DECISIONS`/`GLOSSARY`.
Kunci kunjungan muncul sebagai contoh hubungan kunci bisnis di seksi Glossary
dan Crosscutting (mengikat klinis → farmasi → keuangan).

**Diátaxis terisi dengan artefak nyata.** Tanpa `DOCS`, framework sudah
menurunkan artefak dari data: *Tutorial* = daftar modul sebagai titik masuk;
*How-to* = fitur + route-nya; *Reference* = jumlah fitur/field/permission/relasi;
*Explanation* = relasi data antar fitur. Pada SIMRS, `DOCS` dipakai untuk
menyampaikan alur end-to-end yang spesifik domain:

```js
export const DOCS = [
  { kind: 'Tutorial', items: ['Mulai Pendaftaran → terbitkan ID rekam medis, live ID kunjungan.', 'Lanjut Klinis → SOAP, resep, lab/rad.', 'Tutup Keuangan → billing, kasir, jurnal.'] },
  { kind: 'How-to',   items: ['Daftarkan pasien: pendaftaran → registrasi periksa.', 'Resep & serahkan obat: rawat-jalan → farmasi.', 'Tagih & bayar: billing → kasir → akuntansi/jurnal.'] },
  { kind: 'Reference', items: ['Kunci lintas modul: <id_kunjungan>, <id_pasien>, <kode_unit>, <kode_barang>, <kode_akun>.', 'ratusan route · puluhan segmen URI · puluhan keluarga API · ratusan permission.'] },
  { kind: 'Explanation', items: ['<id_kunjungan> = kunci tunggal klinis → farmasi → keuangan.', 'SaaS multi-tenant: satu basis kode, DB per fasyankes.'] }
];
```

**ADR** (`DECISIONS`) mencatat keputusan arsitektur inti: SaaS
database-per-tenant, satu kunci kunjungan sebagai kunci tunggal, RBAC granular
menggerakkan menu, dan integrasi eksternal diisolasi di modul bridging.

**Pelajarannya:** panel Dokumentasi tidak perlu konfigurasi penuh — framework
sudah menyediakan default dari data; content cukup menyuplai bagian naratif
yang tak bisa diturunkan (batasan, strategi, deployment, kualitas, risiko,
glosarium, dan alur domain-spesifik).
