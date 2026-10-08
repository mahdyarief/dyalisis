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
Menu **Filter** di bawah toolbar memotong graf per domain, per level, atau hanya
node ber-Catatan (melengkapi pencarian teks). Satu tombol **Filter** dengan badge
jumlah aktif membuka panel berisi seksi Domain / Level / Catatan; filter aktif
tampil sebagai chip yang bisa dihapus di desktop dan ringkas jadi badge di mobile
— tanpa scroll horizontal di lebar layar mana pun. Saat tak ada node terpilih, sidebar
menampilkan panel **Insight** — analisis turunan dari graf relasi data: **hub**
(fitur paling banyak dihubungkan), **coupling lintas-modul**, dan fitur
**terisolasi**. Panel ini satu sumber dengan `dist/graph.json` (lihat §Analisis).
Tiap node punya **UML class diagram** di sidebar (atribut dari field kunci,
operasi dari aksi, asosiasi berlabel field penghubung) — digambar sebagai SVG
inline, theme-aware, tanpa dependency tambahan. Klik diagram → **modal perbesar**.
Bila content berasal dari ingest spec (lihat §Dari spec Markdown), sidebar juga
menampilkan seksi **Spesifikasi** (Brief/Goals/Workflow/Entity + chip sumber &
level bukti) dan **ERD modul** sebagai SVG (dari `erDiagram`, tanpa dependency).
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
npx dyalisis test                 # 65 self-check headless → harus semua PASS
npx dyalisis build                # → dist/index.html + dist/graph.json
```

Punya spec Markdown (lihat §Dari spec Markdown)? Lewati scaffold dan build
langsung dari spec — parser memetakannya ke kontrak content di build time.

```bash
npx dyalisis build --spec ./feature-analysis/spec   # tanpa menulis dyalisis.content.js
```

Buka `dist/index.html` di browser. AI agent cukup menyunting `dyalisis.content.js`
(kontrak ada di `.claude/skills/dyalisis/SKILL.md` yang ikut di-scaffold).

## Pakai untuk aplikasi Anda

1. `npx dyalisis init <nama-app>` → folder proyek + `dyalisis.content.js` (stub).
2. Isi `dyalisis.content.js` sesuai kontrak (§ Content contract di bawah).
3. `npx dyalisis test` → harus **65/65 PASS**.
4. `npx dyalisis build` → `dist/index.html` (+ `dist/graph.json`).

## Dari spec Markdown 4-aksis (opsional)

Kalau fitur sudah didokumentasikan sebagai spec Markdown, Dyalisis bisa
memetakannya ke kontrak content langsung di build time — tanpa menulis
`dyalisis.content.js` manual:

```bash
npx dyalisis build --spec ./feature-analysis/spec          # default: dist/index.html
npx dyalisis build --spec ./feature-analysis/spec --app-name "SoftMedis"
```

Folder spec berisi satu file per modul (`spec-01-*.md` …) dengan format:

- **H1** modul → judul + id `mod-<domain>` dalam backtick (mis.
  `# Spec 01 — Modul Pendaftaran (\`mod-pendaftaran\`)`).
- **Blokquote** intro modul (sebelum `##` pertama) → deskripsi modul.
- **```mermaid** `erDiagram` (opsional) → ERD modul, digambar sebagai SVG di sidebar.
- **Heading fitur** persis: ``### `<id>` — <Label> · cluster `mod-<domain>` ``.
- **Bullet 4-aksis** per fitur: `- **Brief.**`, `- **Goals.**`,
  `- **Workflow.**` (langkah dipisah `→` → tiap langkah jadi satu Aksi),
  `- **Entity.**` (`\`pasien\` (no_rm, nik); …` — atribut dari ERD melengkapi tipe).

`feature-registry.md` (satu level di atas folder spec) memasok **sumber** tiap
fitur (`APP:path`, dipisah `;`), **level bukti** (PROVEN/OBSERVED/REFERENCED/
PROPOSED), dan **status** — ditampilkan sebagai chip di sidebar. Judul
`00-INDEX.md` (opsional) memasok nama aplikasi.

Parser zero-dependency ini jalan **hanya di Node saat build**; hasilnya
diserialisasi ke modul content statis, jadi engine single-file tetap tak
berubah ukurannya (±10 KB) dan tak menambah runtime dependency.

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

### Username/handle bebas? Tergantung mode server

Mode ditentukan env `DYALISIS_PUBLISH_TOKEN` di server:

- **Mode terbuka** (tanpa token) — **username bebas**: siapa pun boleh
  `dyalisis login <handle>` dengan handle apa pun (harus unik; gagal bila sudah
  dipakai). Handle itu jadi **owner** publikasi dan muncul di listing per-user
  `https://<host>/u/<handle>`. Ini mode multi-tenant publik.
- **Mode tertutup** (token di-set) — registrasi mandiri **dimatikan**, jadi
  `dyalisis login` gagal (`403 registrasi dimatikan`). Semua publish memakai satu
  token bersama, dan **owner** diambil dari header `X-Dyalisis-Owner`
  (default `public`) — bukan dari handle.

Surface listing yang tersedia di kedua mode:

| Surface | URL |
|---|---|
| Listing global | `https://<host>/` |
| Listing per-user | `https://<host>/u/<owner>` |
| JSON semua publikasi | `https://<host>/api/publications` |
| JSON per-owner | `https://<host>/api/publications?owner=<owner>` |
| Artefak | `https://<host>/<slug>` |
| Health | `https://<host>/health` → `{ "ok": true }` |

## Content contract

Satu modul ES mengekspor: `APP`, `DOMAINS`, `ROOT`, `MODULES`, `NODES`, `ACTIONS`,
`EDGES`, `DATA_EDGES`, `LEVELS`, `LEVEL_NAMES`, `levelOf`. Detail + contoh ada di
`src/data/example.js` dan `.claude/skills/dyalisis/SKILL.md` §4.

Opsional (memperkaya panel Dokumentasi + catatan): `DECISIONS` (ADR), `ARC42`
(override narasi seksi), `GLOSSARY` (glosarium), `DOCS` (artefak Diátaxis),
`NOTES` (catatan per node: `{ idNode: 'catatan kritis...' }` atau
`{ idNode: { text, provenance } }` dengan provenance `spec` | `inferred`).

Aturan wajib: id unik, parent valid tanpa siklus, `MODULES[i].id` = `mod-<domain>`,
tiap modul ≥1 fitur, tiap fitur ≥1 aksi, semua `domain` terdaftar di `DOMAINS`.

Field opsional dari ingest spec (dipakai seksi **Spesifikasi** sidebar): modul
boleh membawa `erd` (sumber `erDiagram`) + `spec` (prosa intro); fitur boleh
membawa `brief`, `goals`, `workflow`, `entities`, `sources`, `evidence`, `status`.
Semuanya diabaikan bila kosong, jadi content manual tetap valid. Field ini juga
ikut terserialisasi ke `dist/graph.json` dan balasan MCP (`get_node`) — hanya
disertakan bila ada, sehingga skema tetap ringkas dan backward-compatible.

## Analisis & graph.json (opsional)

Selain `dist/index.html`, `build` juga menulis **`dist/graph.json`** — model
ternormalisasi (node + edge + blok `analysis`) yang bisa di-query ulang tanpa
browser, di-diff antar-build, atau dibaca tool lain. Turunannya dihitung oleh
`src/lib/analysis.js` (fungsi murni, isomorphic — dipakai build, UI, test, MCP):

- **God nodes / chokepoint** — fitur dengan derajat tertinggi pada `DATA_EDGES`.
- **Coupling lintas-modul** — relasi data yang melintasi batas modul.
- **Fitur terisolasi** — fitur tanpa satu pun relasi data.
- **Provenance catatan** — hitungan catatan `inferred`.

## MCP server (opsional)

`npx dyalisis serve --mcp` menjalankan server **MCP stdio** (JSON-RPC 2.0, tanpa
dependency) yang mengekspos graf fitur sebagai tool untuk agent:
`graph_summary`, `list_modules`, `get_node`, `search_nodes`, `get_notes`,
`trace_flow`. Content di-resolve sama seperti `build` (dari cwd), jadi bisa
dijalankan di dalam proyek content mana pun. Self-test: `npm run test:mcp`.

## Struktur

```
bin/dyalisis.mjs  CLI (init/build/test/publish/serve/login/list)
build.mjs         bundler → HTML+graph.json  src/index.jsx     app React
lib/scaffold.mjs  scaffolder proyek        src/components/     GraphCanvas + ui/*
lib/patch-elk.mjs patch cytoscape-elk      src/lib/            layout + flow + analysis
lib/publish.mjs   client publish           test/run.mjs        self-test (65)
lib/slug.mjs      slug unik bersama        test/mcp.mjs        self-test MCP
lib/mcp.mjs       server MCP stdio         test/publish.mjs    self-test publish
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