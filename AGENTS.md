# AGENTS.md — panduan untuk AI Agent

Repo ini adalah **Dyalisis**, framework visualisasi feature-analysis. Kalau Anda
(agent) diberi link repo ini dan diminta memvisualisasikan fitur sebuah aplikasi,
**baca `.claude/skills/dyalisis/SKILL.md`** — itu kontrak lengkapnya. Ringkas:

## Perintah kunci

```bash
npm install                              # WAJIB: postinstall mem-patch bug cytoscape-elk
npm run build                            # → dist/index.html (pakai src/data/example.js)
npm test                                 # 30 self-check headless, harus hijau
node build.mjs --content <file.js>       # build aplikasi tertentu
node test/run.mjs --content <file.js>    # uji content tertentu
```

## Alur kerja agent

1. Pelajari aplikasi target → susun hierarki 4 level: Aplikasi → Modul → Fitur → Aksi.
2. Salin `src/data/example.js` → `src/data/<app>.js`; isi sesuai kontrak (SKILL.md §4).
3. `node test/run.mjs --content src/data/<app>.js` → perbaiki sampai **30/30 PASS**.
4. `node build.mjs --content src/data/<app>.js` → hasilkan `dist/index.html`.

## Konvensi yang tidak boleh dilanggar

- `MODULES[i].id` **harus** `mod-<domain>` (engine menurunkan parent fitur dari `mod-${domain}`).
- Tiap modul punya ≥1 fitur; tiap fitur punya ≥1 aksi; semua `domain` terdaftar di `DOMAINS`.
- Jangan commit data aplikasi — `.gitignore` hanya meloloskan `src/data/example.js`.

## Gotcha

- **Jangan hapus `scripts/patch-elk.mjs`** — tanpa itu layout ELK mati saat ada compound node.
- `hierarchyHandling:'INCLUDE_CHILDREN'` harus di dalam `options.elk{}` (bukan level atas).
- ELK asinkron: tunggu event `layoutstop` sebelum baca posisi (lihat `test/run.mjs`).
- `npm install` ulang perlu, karena `postinstall` mem-patch `node_modules`.

Dokumentasi penuh: [`.claude/skills/dyalisis/SKILL.md`](.claude/skills/dyalisis/SKILL.md).