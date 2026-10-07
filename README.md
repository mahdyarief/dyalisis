# Dyalisis

**Reusable feature-analysis visualization framework.** Ubah daftar fitur sebuah
aplikasi menjadi **satu file HTML interaktif mandiri** (tanpa server, tanpa CDN).

Dibangun dari Cytoscape.js + shadcn/ui (React) + Tailwind, di-bundle esbuild.
Engine dan content **terpisah total** — ganti satu file data untuk aplikasi baru.

## Model visual

Dekomposisi fungsional 4 tingkat, digambar sebagai *compound boundary boxes*
(gaya C4):

| Level | Arti | Contoh |
|---|---|---|
| L0 | Aplikasi | Acme Ops |
| L1 | Modul (domain fungsional) | Penjualan |
| L2 | Fitur (fungsi utama) | Pesanan |
| L3 | Aksi (operasi/route) | Buat Pesanan |

Graph interaktif: pan/zoom, ganti layout (Dagre/ELK/Breadthfirst/Circle/Grid),
klik node → sidebar detail, seleksi meredupkan elemen tak terkait, toggle L3.
Tiap node punya **UML class diagram** di sidebar (atribut dari field kunci,
operasi dari aksi, asosiasi berlabel field penghubung) — digambar sebagai SVG
inline, theme-aware, tanpa dependency tambahan. Klik diagram → **modal perbesar**.
Mode **Alur** menyorot rantai fitur end-to-end dari relasi data (mis. Pendaftaran →
Periksa → SOAP → Resep → Billing) di sidebar + highlight pada graph. Node jalur,
panah berurutan, dan langkah yang sedang dipilih memakai **satu bahasa warna**
sehingga alur terbaca sebagai satu kesatuan; penanda tiap keadaan dijelaskan di
legenda. Tiap node juga bisa punya **catatan** (aturan bisnis tak tertulis,
jebakan integrasi) sebagai jembatan Manusia↔AI — ditandai di content lewat
`NOTES` dan ditampilkan sebagai **view baca-saja** (tanpa penyimpanan), dengan
badge pada node, hitungan di legenda, dan dot pada daftar langkah Alur. Panel
**Dokumentasi** (ikon buku di header)
menyusun perspektif **C4 Model**, **arc42** (12 seksi lengkap), daftar **ADR**
(dari `DECISIONS` opsional), **glosarium** (dari `GLOSSARY` opsional), dan
**Diátaxis** (artefak nyata dari data). Tiap seksi punya default turunan dari
data; content boleh menimpanya lewat `ARC42`/`DOCS`.

## Quickstart

```bash
npm install     # postinstall mem-patch bug upstream cytoscape-elk (WAJIB)
npm run build   # → dist/index.html (demo dari src/data/example.js)
npm test        # 15 self-check headless
```

Buka `dist/index.html` di browser.

## Pakai untuk aplikasi Anda

1. Salin `src/data/example.js` → `src/data/app-anda.js`.
2. Isi sesuai kontrak (§ Content contract di bawah).
3. `node test/run.mjs --content src/data/app-anda.js` → harus **15/15 PASS**.
4. `node build.mjs --content src/data/app-anda.js` → `dist/index.html`.

## Content contract

Satu modul ES mengekspor: `APP`, `DOMAINS`, `ROOT`, `MODULES`, `NODES`, `ACTIONS`,
`EDGES`, `DATA_EDGES`, `LEVELS`, `LEVEL_NAMES`, `levelOf`. Detail + contoh ada di
`src/data/example.js` dan `.claude/skills/dyalisis/SKILL.md` §4.

Opsional (memperkaya panel Dokumentasi + catatan): `DECISIONS` (ADR), `ARC42`
(override narasi seksi), `GLOSSARY` (glosarium), `DOCS` (artefak Diátaxis),
`NOTES` (seed catatan per node: `{ idNode: 'catatan kritis...' }`).

Aturan wajib: id unik, parent valid tanpa siklus, `MODULES[i].id` = `mod-<domain>`,
tiap modul ≥1 fitur, tiap fitur ≥1 aksi, semua `domain` terdaftar di `DOMAINS`.

## Struktur

```
build.mjs      bundler → single HTML      src/index.jsx       app React
src/lib/       preset layout              src/components/     GraphCanvas + ui/*
src/data/      content layer              test/run.mjs        self-test
scripts/       patch-elk.mjs              template.html       shell HTML
```

## Untuk AI Agent

Repo ini dirancang ramah agent. Baca [`AGENTS.md`](AGENTS.md) (ringkas) atau
[`.claude/skills/dyalisis/SKILL.md`](.claude/skills/dyalisis/SKILL.md) (lengkap)
sebelum mulai — keduanya memuat kontrak content, alur kerja, dan gotcha.

## Catatan teknis

- **Single-file**: esbuild bundle (IIFE, minify) → CSS+JS di-inline ke template.
- **Patch cytoscape-elk**: versi 1.2.2 punya bug yang mematikan layout ELK saat ada
  compound node; `scripts/patch-elk.mjs` memperbaikinya via `postinstall`.
- **Repo ini hanya membawa engine** — `src/data/*` (selain `example.js`) di-gitignore.