# Dyalisis

**Feature-analysis visualization framework.** Ubah daftar fitur sebuah
aplikasi menjadi **satu file HTML interaktif mandiri** (tanpa server, tanpa CDN).

Dibangun dari Cytoscape.js + shadcn/ui (React) + Tailwind, di-bundle esbuild.
Engine dan content **terpisah total** — ganti satu file data untuk aplikasi baru.
Dipakai sebagai paket npm (`npx dyalisis init`) di mana content hidup di proyek
pemakai dan engine tetap read-only di dalam paket.

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

Pakai sebagai framework npm — buat proyek content baru, lalu isi data aplikasi:

```bash
npx dyalisis init aplikasi-saya   # scaffold folder proyek content
cd aplikasi-saya
npm install
npx dyalisis test                 # 30 self-check headless → harus semua PASS
npx dyalisis build                # → dist/index.html (single-file, offline)
```

Buka `dist/index.html` di browser. AI agent cukup menyunting `dyalisis.content.js`
(kontrak ada di `.claude/skills/dyalisis/SKILL.md` yang ikut di-scaffold).

## Pakai untuk aplikasi Anda

1. `npx dyalisis init <nama-app>` → folder proyek + `dyalisis.content.js` (stub).
2. Isi `dyalisis.content.js` sesuai kontrak (§ Content contract di bawah).
3. `npx dyalisis test` → harus **30/30 PASS**.
4. `npx dyalisis build` → `dist/index.html`.

## Publish ke domain (opsional)

Setelah build, publikasikan `dist/index.html` ke endpoint penerbit supaya bisa
diakses publik (mis. `https://dyalisis.nimb.us.ci/softmedis`):

```bash
npx dyalisis login <handle>             # sekali: daftar identitas → simpan token
npx dyalisis publish                    # build + unggah (slug default = nama app)
npx dyalisis publish --slug softmedis   # custom naming
npx dyalisis publish --overwrite        # timpa publikasi lama (slug sama)
npx dyalisis list --remote              # lihat publikasi milikmu di server
```

Slug **otomatis unik**: kalau `softmedis` sudah ada, jadi `softmedis-1`, dst.
Server penerbit (zero-dep, tanpa DB) ada di [`server/`](server); cara deploy ke
VPS + HTTPS ada di [`DEPLOY.md`](DEPLOY.md). Endpoint & token diambil dari
`--url`/`--token`, env `DYALISIS_PUBLISH_URL`/`DYALISIS_TOKEN`, atau
`.dyalisisrc.json`.

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
bin/dyalisis.mjs  CLI (init/build/test/publish/serve/login/list)
build.mjs         bundler → single HTML   src/index.jsx       app React
lib/scaffold.mjs  scaffolder proyek        src/components/     GraphCanvas + ui/*
lib/patch-elk.mjs patch cytoscape-elk      src/lib/            preset layout + flow
lib/publish.mjs   client publish           test/run.mjs        self-test (30)
lib/slug.mjs      slug unik bersama        test/publish.mjs    self-test publish
server/           publish server (zero-dep, tanpa DB)
src/data/         contoh content           template.html       shell HTML
```

Engine diambil dari direktori paket; **content** dari proyek pemakai
(`./dyalisis.content.js`) di-alias lewat esbuild — paket tetap read-only.

## Untuk AI Agent

Repo ini dirancang ramah agent. Baca [`AGENTS.md`](AGENTS.md) (ringkas) atau
[`.claude/skills/dyalisis/SKILL.md`](.claude/skills/dyalisis/SKILL.md) (lengkap)
sebelum mulai — keduanya memuat kontrak content, alur kerja, dan gotcha.

## Catatan teknis

- **Single-file**: esbuild bundle (IIFE, minify) → CSS+JS di-inline ke template.
- **Patch cytoscape-elk**: versi 1.2.2 punya bug yang mematikan layout ELK saat ada
  compound node; `lib/patch-elk.mjs` memperbaikinya **lazy** (saat `build`/`test`),
  di-resolve dari proyek pemakai — jadi aman untuk npm hoisting dan tanpa
  `postinstall` yang rapuh.
- **Paket read-only**: content proyek di-alias lewat esbuild (`@dyalisis/content`),
  sehingga tidak ada file generated yang ditulis ke `node_modules`.
- **Kontrak content** ikut di-scaffold ke `.claude/skills/dyalisis/SKILL.md` supaya
  AI agent di proyek pemakai langsung tahu cara mengisi `dyalisis.content.js`.