# AGENTS.md — panduan untuk AI Agent

**Dyalisis** adalah framework visualisasi feature-analysis yang dipakai lewat npm.
Kalau Anda (agent) diminta memvisualisasikan fitur sebuah aplikasi, alurnya:
scaffold proyek content → sunting `dyalisis.content.js` → test → build. Kontrak
lengkapnya ada di **`.claude/skills/dyalisis/SKILL.md`** — baca itu dulu.

## Perintah kunci

```bash
npx dyalisis init <nama-app>   # scaffold proyek content baru (folder + stub)
npx dyalisis test              # 46 self-check headless, harus hijau
npx dyalisis build             # → dist/index.html + dist/graph.json
npx dyalisis login <handle>    # daftar identitas → simpan token
npx dyalisis publish           # build + unggah → URL publik (slug unik otomatis)
npx dyalisis list --remote     # lihat publikasi milikmu
npx dyalisis serve --mcp       # graf fitur sebagai tool MCP (stdio) untuk agent
```

Di repo engine ini sendiri (dev), `npm run build` / `npm test` setara; engine &
content di repo ini memakai `src/data/example.js` sebagai demo.

## Publish & mode auth (singkat)

`login`/`publish`/`list --remote` bergantung pada mode server (`DYALISIS_PUBLISH_TOKEN`):

- **Mode terbuka** (tanpa token): `login <handle>` berhasil; handle bebas tapi unik
  → jadi **owner** publikasi (listing `/u/<handle>`).
- **Mode tertutup** (token di-set): `login` **gagal** (`403 registrasi dimatikan`);
  publish pakai satu token bersama, owner dari header `X-Dyalisis-Owner` (default
  `public`) — bukan handle.

Detail lengkap: `.claude/skills/dyalisis/SKILL.md` §10.

## Alur kerja agent

1. Pelajari aplikasi target → susun hierarki 4 level: Aplikasi → Modul → Fitur → Aksi.
2. `npx dyalisis init <app>` → isi `dyalisis.content.js` sesuai kontrak (SKILL.md §4).
3. `npx dyalisis test` → perbaiki sampai **46/46 PASS**.
4. `npx dyalisis build` → hasilkan `dist/index.html` (+ `dist/graph.json`).

## Konvensi yang tidak boleh dilanggar

- `MODULES[i].id` **harus** `mod-<domain>` (engine menurunkan parent fitur dari `mod-${domain}`).
- Tiap modul punya ≥1 fitur; tiap fitur punya ≥1 aksi; semua `domain` terdaftar di `DOMAINS`.
- **Notes adalah view baca-saja** dari content `NOTES` — tak ada penyimpanan/editor.

## Gotcha

- **Patch cytoscape-elk**: bug upstream mematikan layout ELK saat ada compound node;
  `lib/patch-elk.mjs` mem-patch saat `build`/`test` (lazy, aman untuk npm hoisting).
  Tidak ada `postinstall`.
- Content proyek di-alias lewat esbuild (`@dyalisis/content`) — paket tetap read-only,
  tidak ada file generated yang ditulis ke `node_modules`.
- `hierarchyHandling:'INCLUDE_CHILDREN'` harus di dalam `options.elk{}` (bukan level atas).
- ELK asinkron: tunggu event `layoutstop` sebelum baca posisi (lihat `test/run.mjs`).

## Dua mode agent

| Mode | Untuk | Baca |
|---|---|---|
| **Usage** | memvisualisasikan fitur sebuah aplikasi (konsumen paket) | `.claude/skills/dyalisis/SKILL.md` |
| **Contribute** | mengembangkan/meningkatkan engine Dyalisis sendiri | `.claude/skills/dyalisis-contribute/SKILL.md` + [`CONTRIBUTING.md`](CONTRIBUTING.md) |

Dokumentasi usage lengkap: [`.claude/skills/dyalisis/SKILL.md`](.claude/skills/dyalisis/SKILL.md).
Panduan kontribusi (manusia + agent): [`CONTRIBUTING.md`](CONTRIBUTING.md).