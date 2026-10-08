// Dyalisis self-test — headless (tanpa browser). Jalankan: `npm test`.
// Menguji content layer + engine: integritas hierarki, compound boundary boxes,
// keep-set saat klik, dan bahwa layout dagre & elk benar-benar menghasilkan posisi.
//   node test/run.mjs [--content src/data/nama-app.js]   (default: example.js)
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(__dirname, '..');          // direktori paket (engine)
const PROJECT = process.cwd();                    // direktori proyek pemakai
const require = createRequire(pathToFileURL(resolve(ENGINE, 'package.json')));

// Patch cytoscape-elk dari node_modules proyek (aman terhadap hoisting npm).
const { patchElk } = await import(pathToFileURL(resolve(ENGINE, 'lib/patch-elk.mjs')).href);
patchElk(PROJECT);

// Bare specifier: paket-paket ini membatasi subpath lewat field "exports",
// jadi `require('cytoscape-dagre/dist/...')` ditolak (ERR_PACKAGE_PATH_NOT_EXPORTED).
const cytoscape = require('cytoscape');
const dagre = require('cytoscape-dagre');
const elk = require('cytoscape-elk');

// Default ke content demo (example.js) supaya `npm test` jalan di repo framework
// yang tidak membawa data aplikasi. Override: `--content src/data/<app>.js`.
const args = process.argv.slice(2);
// Ambil nilai flag hanya bila flag benar-benar ada; jika tidak, indexOf = -1 dan
// args[indexOf+1] akan salah menangkap args[0] (mis. `--out` jadi path content).
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const contentArg = flagValue('--content');
// Default: content proyek `./dyalisis.content.js` kalau ada; jika tidak, content
// demo (example.js) yang di-ship bersama paket. Override dengan --content.
const localContent = resolve(PROJECT, 'dyalisis.content.js');
const CONTENT = contentArg
  ? resolve(PROJECT, contentArg)
  : (existsSync(localContent) ? localContent : resolve(ENGINE, 'src/data/example.js'));
const C = await import(pathToFileURL(CONTENT).href);

// Fungsi engine asli (bukan replika) — buildActivePath & style dipakai engine.
const { buildActivePath } = await import(pathToFileURL(resolve(ENGINE, 'src/lib/flow.js')).href);
const { buildGraphStyle, graphPalette } = await import(pathToFileURL(resolve(ENGINE, 'src/lib/graph-style.js')).href);
const { buildModel, degreeMap, godNodes, crossModuleLinks, isolatedFeatures, analyze, toGraphJson, noteInfo } =
  await import(pathToFileURL(resolve(ENGINE, 'src/lib/analysis.js')).href);
// Parser spec Markdown 4-aksis (Node-only) — dipakai flag `build --spec`.
const { parseSpecDir, parseErd, cardLabel } =
  await import(pathToFileURL(resolve(ENGINE, 'lib/spec.mjs')).href);
// Tools + proyeksi AI-friendly atas graph.json (dipakai server publish & MCP HTTP).
const { runTool, handleMessage } =
  await import(pathToFileURL(resolve(ENGINE, 'lib/graph-tools.mjs')).href);
const { graphToMarkdown, graphToLlmsTxt } =
  await import(pathToFileURL(resolve(ENGINE, 'lib/graph-md.mjs')).href);

// Registrasi extensions (dagre/elk export berupa fungsi register).
for (const ext of [dagre, elk]) {
  if (typeof ext === 'function') ext(cytoscape);
  else if (ext && ext.register) ext.register(cytoscape);
}

let failures = 0;
const check = (name, cond) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (!cond) failures++;
};

const { MODULES, NODES, ACTIONS, LEVELS, DATA_EDGES, levelOf, DOMAINS } = C;
const TYPES = ['app', 'module', 'feature', 'action'];
const allNodes = [
  ...(C.ROOT ? [{ ...C.ROOT }] : []),
  ...MODULES.map((m) => ({ ...m, parent: 'app' })),
  ...NODES.map((n) => ({ ...n, parent: `mod-${n.domain}` })),
  ...ACTIONS
].map((n) => ({ ...n, type: TYPES[levelOf(n.id)] || 'feature' }));
const byId = Object.fromEntries(allNodes.map((n) => [n.id, n]));
const ids = allNodes.map((n) => n.id);

// ===== 1. Integritas hierarki =====
check('id unik', new Set(ids).size === ids.length);
check('parent merujuk node valid', allNodes.every((n) => !n.parent || byId[n.parent]));
check('tanpa siklus parent', allNodes.every((n) => {
  let p = n.parent, hop = 0;
  while (p) { if (++hop > 20) return false; p = byId[p] && byId[p].parent; }
  return true;
}));
check('levelOf: app=0 modul=1 fitur=2 aksi=3',
  levelOf('app') === 0 && MODULES.every((m) => levelOf(m.id) === 1) &&
  NODES.every((n) => levelOf(n.id) === 2) && ACTIONS.every((a) => levelOf(a.id) === 3));
check('tiap modul punya fitur', MODULES.every((m) => NODES.some((n) => `mod-${n.domain}` === m.id)));
check('tiap fitur punya aksi', NODES.every((n) => ACTIONS.some((a) => a.parent === n.id)));
check('LEVELS cocok jumlah node', LEVELS[0].length === 1 && LEVELS[1].length === MODULES.length &&
  LEVELS[2].length === NODES.length && LEVELS[3].length === ACTIONS.length);
check('domain valid', [...NODES, ...ACTIONS].every((n) => DOMAINS[n.domain]));

// ===== 2. Compound boundary boxes =====
const visible = allNodes.filter((n) => n.type !== 'action'); // default: aksi disembunyikan
const dataEdges = DATA_EDGES.filter(([s, t]) => visible.some((n) => n.id === s) && visible.some((n) => n.id === t));

function build() {
  return cytoscape({
    headless: true, styleEnabled: true,
    elements: [
      ...visible.map((n) => ({ data: { id: n.id, label: n.label, domain: n.domain, type: n.type, parent: n.parent } })),
      ...dataEdges.map(([s, t, f], i) => ({ data: { id: 'e' + i, source: s, target: t, field: f } }))
    ]
  });
}

{
  const cy = build();
  check('parent boxes = app + semua modul', cy.nodes(':parent').length === 1 + MODULES.length);
  check('app adalah parent', cy.getElementById('app').isParent());
}

// ===== 3. Keep-set saat klik (compound-aware) =====
function keepIds(cy, id) {
  const node = cy.getElementById(id);
  const neighbors = node.neighborhood().nodes();
  let keep = node.union(node.ancestors()).union(node.descendants()).union(node.neighborhood());
  neighbors.forEach((nb) => { keep = keep.union(nb.ancestors()); });
  return new Set(keep.map((e) => e.id()));
}
// Target diambil dari data (content-agnostic — tak hardcode id aplikasi tertentu).
const sampleFeature = visible.find((n) => n.type === 'feature');
const sampleModule = sampleFeature.parent;
{
  const k = keepIds(build(), sampleFeature.id);
  check(`klik fitur (${sampleFeature.id}): kotak modul + app tetap terang`, k.has(sampleModule) && k.has('app'));
}
{
  const k = keepIds(build(), sampleModule);
  const kids = visible.filter((n) => n.parent === sampleModule).map((n) => n.id);
  check(`klik modul (${sampleModule}): semua fitur anak tetap terang`, kids.every((cid) => k.has(cid)));
}

// ===== 4. Layout benar-benar menghasilkan posisi =====
function spread(cy) {
  const xs = new Set(cy.nodes().map((n) => Math.round(n.position('x'))));
  const ys = new Set(cy.nodes().map((n) => Math.round(n.position('y'))));
  const finite = cy.nodes().every((n) => isFinite(n.position('x')) && isFinite(n.position('y')));
  return xs.size >= 3 && ys.size >= 3 && finite;
}
{
  const cy = build();
  cy.layout({ name: 'dagre', rankDir: 'TB', animate: false, padding: 30 }).run();
  check('dagre menghasilkan posisi', spread(cy));
}

// ELK berjalan ASINKRON: tunggu event 'layoutstop' sebelum baca posisi.
{
  const cy = build();
  await new Promise((done) => {
    const layout = cy.layout({
      name: 'elk', animate: false, padding: 30, nodeDimensionsIncludeLabels: true,
      elk: {
        algorithm: 'layered', hierarchyHandling: 'INCLUDE_CHILDREN',
        'layered.spacing.nodeNodeBetweenLayers': 160, 'layered.spacing.nodeNode': 110,
        'layered.spacing.layerNode': 160, mergeEdges: true
      }
    });
    layout.one('layoutstop', done);
    setTimeout(done, 5000);
    layout.run();
  });
  const box = cy.getElementById(sampleModule);
  const bb = box.boundingBox();
  const outside = box.children().filter((k) => {
    const p = k.position();
    return p.x < bb.x1 - 1 || p.x > bb.x2 + 1 || p.y < bb.y1 - 1 || p.y > bb.y2 + 1;
  });
  check('elk+compound menghasilkan posisi', spread(cy));
  check(`kotak modul (${sampleModule}) membungkus fiturnya (elk)`, outside.length === 0);
}

// ===== 5. Relasi data & catatan menunjuk node nyata =====
check('DATA_EDGES: kedua ujung menunjuk node valid',
  DATA_EDGES.every(([s, t]) => byId[s] && byId[t]));
const NOTES = C.NOTES || {};
check('NOTES: kunci menunjuk node valid', Object.keys(NOTES).every((id) => byId[id]));

// ===== 6. Jalur Alur aktif (buildActivePath) =====
// Content-agnostic: target dipilih dari data, bukan hardcode id aplikasi.
const outCount = {};
DATA_EDGES.forEach(([s]) => { outCount[s] = (outCount[s] || 0) + 1; });
const branchNode = Object.keys(outCount).find((id) => outCount[id] > 1);
const flowStart = Object.keys(outCount)[0] || NODES[0].id;
{
  const base = buildActivePath(flowStart, DATA_EDGES, {});
  check('buildActivePath: start jadi langkah pertama', base.path[0] === flowStart);
  check('buildActivePath: tiap langkah dihubungkan edge DATA_EDGES',
    base.edges.every(([s, t]) => DATA_EDGES.some(([ds, dt]) => ds === s && dt === t)));
  check('buildActivePath: tanpa node berulang', new Set(base.path).size === base.path.length);
  check('buildActivePath: panjang jalur = jumlah edge + 1', base.path.length === base.edges.length + 1);
  // Jalur selektif: tanpa cabang, jumlah langkah < jumlah seluruh fitur.
  check('buildActivePath: selektif (bukan seluruh graph)',
    base.path.length < allNodes.length, `${base.path.length}/${allNodes.length}`);

  if (branchNode) {
    const succ = DATA_EDGES.filter(([s]) => s === branchNode).map(([, t]) => t);
    const b = buildActivePath(branchNode, DATA_EDGES, {});
    check('buildActivePath: branches memuat semua successor',
      (b.branches[branchNode] || []).length === succ.length, JSON.stringify(b.branches));
    // Pilih successor KEDUA → jalur harus lewat successor itu.
    const alt = succ[1];
    const chosen = buildActivePath(branchNode, DATA_EDGES, { [branchNode]: alt });
    check('buildActivePath: branchChoice mengubah cabang', chosen.path[1] === alt, chosen.path.join(','));
  }
}

// ===== 7. Bahasa visual mode Alur & catatan (resolve selector) =====
const rgb = (hex) => {
  const h = String(hex).replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)})`;
};
const num = (v) => parseFloat(v);
function buildStyled(theme) {
  return cytoscape({
    headless: true, styleEnabled: true, style: buildGraphStyle(theme),
    elements: [
      ...visible.map((n) => ({ data: { id: n.id, label: n.label, domain: n.domain, type: n.type, parent: n.parent, color: (DOMAINS[n.domain] || {}).color || '#94a3b8' } })),
      ...dataEdges.map(([s, t, f], i) => ({ data: { id: 'e' + i, source: s, target: t, field: f } }))
    ]
  });
}
{
  const pal = graphPalette('dark');
  const feats = visible.filter((n) => n.type === 'feature');
  const anchorId = feats[0].id;
  const flowOnlyId = (feats[1] && feats[1].id) || sampleModule;
  const cy = buildStyled('dark');
  cy.getElementById(flowOnlyId).addClass('match flow');
  cy.getElementById(anchorId).addClass('match flow anchor');
  const sf = cy.getElementById(flowOnlyId).style();
  const sa = cy.getElementById(anchorId).style();
  check('kelas flow: border = warna highlight', sf['border-color'] === rgb(pal.highlight), sf['border-color']);
  check('kelas anchor: border = selectedBorder (menang atas flow)', sa['border-color'] === rgb(pal.selectedBorder), sa['border-color']);
  check('kelas anchor: border lebih tebal dari flow', num(sa['border-width']) > num(sf['border-width']), `${sa['border-width']} vs ${sf['border-width']}`);
}
{
  const cy = buildStyled('dark');
  const chain = cy.edges()[0];
  const plainWidth = num(cy.edges()[1].style()['width']);
  chain.addClass('highlight chain');
  check('kelas chain: lebih tebal dari edge biasa', num(chain.style()['width']) > plainWidth, `${chain.style()['width']} vs ${plainWidth}`);
}
{
  const pal = graphPalette('dark');
  const cy = buildStyled('dark');
  const n = cy.getElementById(sampleFeature.id);
  n.addClass('noted');
  const s = n.style();
  // Badge = dot lingkaran (background-image SVG), bukan lagi irisan pie.
  const svg = decodeURIComponent(String(s['background-image']).replace(/^data:image\/svg\+xml,/, ''));
  check('kelas noted: dot SVG pakai noteColor', svg.includes(`fill="${pal.noteColor}"`), String(s['background-image']).slice(0, 48));
  check('kelas noted: dot di sudut kanan-atas', s['background-position-x'] === '100%' && s['background-position-y'] === '0%', `${s['background-position-x']} / ${s['background-position-y']}`);
}

// ===== Analisis graf (src/lib/analysis.js) — dipakai build & panel Insight =====
{
  const model = buildModel(C);
  check('analysis: buildModel node count = node content', model.nodes.length === allNodes.length, `${model.nodes.length} vs ${allNodes.length}`);
  check('analysis: buildModel byId memuat tiap node', model.nodes.every((n) => model.byId[n.id] === n));
  check('analysis: tipe node dari levelOf konsisten', model.nodes.every((n) => n.type === (TYPES[levelOf(n.id)] || 'feature')));

  const deg = degreeMap(model);
  const degSum = Object.values(deg).reduce((a, d) => a + d.total, 0);
  check('analysis: sigma derajat = 2 x edge data', degSum === 2 * (DATA_EDGES || []).length, `${degSum} vs ${2 * (DATA_EDGES || []).length}`);

  const gods = godNodes(model, { top: 3 });
  check('analysis: godNodes dibatasi top-N', gods.length <= 3, String(gods.length));
  check('analysis: godNodes urut menurun', gods.every((g, i) => i === 0 || gods[i - 1].total >= g.total));
  check('analysis: godNodes hanya fitur ber-derajat', gods.every((g) => g.total >= 1 && model.byId[g.id].type === 'feature'));

  const xmod = crossModuleLinks(model);
  check('analysis: crossModule selalu lintas domain', xmod.every((e) => e.fromDomain !== e.toDomain), String(xmod.length));

  const isolated = isolatedFeatures(model);
  const touched = new Set();
  (DATA_EDGES || []).forEach(([s2, t2]) => { touched.add(s2); touched.add(t2); });
  check('analysis: isolated tak tersentuh DATA_EDGES', isolated.every((n) => !touched.has(n.id)));

  const rep = analyze(C);
  check('analysis: counts cocok content', rep.counts.modules === MODULES.length
    && rep.counts.features === NODES.length
    && rep.counts.actions === ACTIONS.length
    && rep.counts.dataEdges === (DATA_EDGES || []).length);

  const gj = toGraphJson(C);
  check('analysis: toGraphJson serializable', JSON.parse(JSON.stringify(gj)).nodes.length === allNodes.length);
  check('analysis: toGraphJson memuat edges + analysis',
    gj.edges.length === (C.EDGES || []).length + (DATA_EDGES || []).length && !!gj.analysis);

  // Provenance catatan (spec vs inferred) — normalisasi lewat noteInfo.
  const noteIds = Object.keys(C.NOTES || {});
  check('analysis: noteInfo tiap catatan punya text + provenance valid',
    noteIds.every((id) => {
      const ni = noteInfo(C.NOTES, id);
      return typeof ni.text === 'string' && ['spec', 'inferred'].includes(ni.provenance);
    }));
  check('analysis: noteInfo id tak ada → text null', noteInfo(C.NOTES, '__x__').text === null);
  check('analysis: counts.inferred = jumlah catatan inferred',
    rep.counts.inferred === noteIds.filter((id) => noteInfo(C.NOTES, id).provenance === 'inferred').length,
    `${rep.counts.inferred}`);
  check('analysis: toGraphJson menormalkan note ke { text, provenance }',
    gj.nodes.every((n) => n.note == null
      || (typeof n.note.text === 'string' && ['spec', 'inferred'].includes(n.note.provenance))));
}

// ===== 8. Parser spec Markdown 4-aksis (lib/spec.mjs) =====
// Fixture ditulis ke temp dir supaya `npm test` tetap hijau tanpa folder spec
// aplikasi nyata (content-agnostic; asersi pakai literal, bukan data app).
{
  const erdLit = [
    'erDiagram',
    '  PASIEN {',
    '    string no_rm PK "nomor rekam medis"',
    '    string nik',
    '  }',
    '  PASIEN ||--o{ KUNJUNGAN : "punya"',
    '  KUNJUNGAN {',
    '    string id PK',
    '  }'
  ].join('\n');
  const E = parseErd(erdLit);
  const entNames = E.entities.map((e) => e.name);
  check('parseErd: memuat entitas (blok + rujukan relasi)',
    entNames.includes('PASIEN') && entNames.includes('KUNJUNGAN'), entNames.join(','));
  const pasien = E.entities.find((e) => e.name === 'PASIEN');
  check('parseErd: atribut + tipe + PK + note ter-parse',
    pasien.attrs.length === 2 && pasien.attrs[0].name === 'no_rm' &&
    pasien.attrs[0].type === 'string' && pasien.attrs[0].key === 'PK' &&
    pasien.attrs[0].note === 'nomor rekam medis', JSON.stringify(pasien.attrs));
  check('parseErd: relasi + kardinalitas crow-foot + label',
    E.relations.length === 1 && E.relations[0].from === 'PASIEN' && E.relations[0].to === 'KUNJUNGAN' &&
    E.relations[0].fromCard === '||' && E.relations[0].toCard === 'o{' &&
    E.relations[0].identifying === true && E.relations[0].label === 'punya', JSON.stringify(E.relations));
  check('cardLabel: || → 1, o{ → 0..N', cardLabel('||') === '1' && cardLabel('o{') === '0..N',
    `${cardLabel('||')} / ${cardLabel('o{')}`);

  const root = mkdtempSync(resolve(tmpdir(), 'dyalisis-spec-'));
  const specDir = resolve(root, 'spec');
  mkdirSync(specDir, { recursive: true });
  writeFileSync(resolve(root, '00-INDEX.md'), '# 00-INDEX — Aplikasi Uji\n\nRegistri fitur.\n');
  writeFileSync(resolve(root, 'feature-registry.md'), [
    '## 3. Registri',
    '| Fitur | Nama | Sumber | Level | Status |',
    '|---|---|---|---|---|',
    '| `f-a` | Fitur A | `APP:src/a.ts`; `APP:src/a2.ts` | PROVEN | stabil |',
    '| `f-b` | Fitur B | `APP:src/b.ts` | OBSERVED | draft |'
  ].join('\n') + '\n');
  writeFileSync(resolve(specDir, 'spec-01-uji.md'), [
    '# Spec 01 — Modul Uji (`mod-uji`)',
    '',
    '> Ruang lingkup modul uji.',
    '',
    '```mermaid',
    erdLit,
    '```',
    '',
    '### `f-a` — Fitur A · cluster `mod-uji`',
    '',
    '- **Brief.** Ringkasan A.',
    '- **Goals.** Tujuan A.',
    '- **Workflow.** (1) Daftar → (2) Verifikasi → (3) Simpan',
    '- **Entity.** `pasien` (no_rm, nik); `kunjungan` (id).',
    '',
    '### `f-b` — Fitur B · cluster `mod-uji`',
    '',
    '- **Brief.** Ringkasan B.',
    '- **Goals.** Tujuan B.',
    '- **Workflow.** Buka → Tutup',
    '- **Entity.** `pasien` (no_rm, nik).',
    ''
  ].join('\n') + '\n');

  const S = parseSpecDir(specDir);
  const Sids = [S.ROOT.id, ...S.MODULES.map((m) => m.id), ...S.NODES.map((n) => n.id), ...S.ACTIONS.map((a) => a.id)];
  check('spec: APP name dari 00-INDEX', S.APP.name === 'Aplikasi Uji', S.APP.name);
  check('spec: satu modul mod-uji (domain uji)', S.MODULES.length === 1 &&
    S.MODULES[0].id === 'mod-uji' && S.MODULES[0].domain === 'uji', S.MODULES.map((m) => m.id).join(','));
  check('spec: modul menyimpan ERD (erDiagram) + intro spec',
    /erDiagram/.test(S.MODULES[0].erd) && S.MODULES[0].spec.length > 0);
  check('spec: dua fitur ter-parse dengan id benar', S.NODES.length === 2 &&
    S.NODES.map((n) => n.id).sort().join(',') === 'f-a,f-b', S.NODES.map((n) => n.id).join(','));
  check('spec: fitur membawa brief/goals/workflow', S.NODES.every((n) => n.brief && n.goals && n.workflow));
  check('spec: fitur membawa entitas ter-parse',
    S.NODES.every((n) => n.entities.length >= 1 && n.entities[0].name === 'pasien'));
  check('spec: atribut entitas ter-isi tipe dari ERD',
    (S.NODES[0].entities[0].attrs.find((a) => a.name === 'no_rm') || {}).type === 'string');
  check('spec: sumber/level/status dari registry',
    S.NODES[0].sources.length === 2 && S.NODES[0].evidence === 'PROVEN' && S.NODES[0].status === 'stabil');
  check('spec: aksi diturunkan dari Workflow (id fitur~k)',
    S.ACTIONS.every((a) => a.id.startsWith(a.parent + '~')) &&
    S.ACTIONS.filter((a) => a.parent === 'f-a').length === 3, `${S.ACTIONS.length}`);
  check('spec: DATA_EDGES menghubungkan fitur berbagi entitas', S.DATA_EDGES.length === 1 &&
    S.DATA_EDGES[0][0] === 'f-a' && S.DATA_EDGES[0][1] === 'f-b' && S.DATA_EDGES[0][2] === 'pasien',
    JSON.stringify(S.DATA_EDGES));
  check('spec: LEVELS + levelOf konsisten', S.LEVELS[0].length === 1 && S.LEVELS[1].length === 1 &&
    S.LEVELS[2].length === 2 && S.levelOf('f-a') === 2 && S.levelOf('f-a~0') === 3);
  check('spec: kontrak valid (id unik, mod-<domain>, modul≥1 fitur, fitur≥1 aksi, domain valid)',
    new Set(Sids).size === Sids.length &&
    S.MODULES.every((m) => m.id === `mod-${m.domain}` && S.NODES.some((n) => `mod-${n.domain}` === m.id)) &&
    S.NODES.every((n) => S.ACTIONS.some((a) => a.parent === n.id)) &&
    [...S.NODES, ...S.ACTIONS].every((n) => S.DOMAINS[n.domain]));

  // Proyeksi spec → consumers non-UI: field 4-aksis harus ikut di graph.json
  // (toGraphJson) dan di balasan MCP (viewNode pakai helper yang sama).
  const gjS = toGraphJson(S);
  const gFeat = gjS.nodes.find((n) => n.id === 'f-a');
  const gMod = gjS.nodes.find((n) => n.id === 'mod-uji');
  check('spec: toGraphJson membawa field 4-aksis fitur (brief/goals/workflow/entities/sources/evidence/status)',
    !!gFeat && gFeat.brief === 'Ringkasan A.' && gFeat.goals === 'Tujuan A.' &&
    typeof gFeat.workflow === 'string' && Array.isArray(gFeat.entities) &&
    gFeat.entities[0].name === 'pasien' && gFeat.sources.length === 2 &&
    gFeat.evidence === 'PROVEN' && gFeat.status === 'stabil', JSON.stringify(gFeat));
  check('spec: toGraphJson membawa ERD + intro modul',
    !!gMod && /erDiagram/.test(gMod.erd) && gMod.spec.length > 0);
  check('spec: field spec hanya muncul bila ada (node tanpa spec tak dapat field)',
    gjS.nodes.filter((n) => n.type === 'action').every((n) =>
      !('brief' in n) && !('entities' in n) && !('erd' in n)));

  rmSync(root, { recursive: true, force: true });
}

// ===== 9. Tools + proyeksi graph.json (lib/graph-tools.mjs, lib/graph-md.mjs) =====
// Dipakai server publish untuk endpoint AI-friendly (JSON/Markdown/llms.txt/MCP)
// dan serve --mcp (stdio). Diuji di atas graph.json dari content demo.
{
  const graph = toGraphJson(C);
  const summary = runTool(graph, 'graph_summary');
  check('graph-tools: graph_summary punya counts + analisis',
    summary.counts && summary.counts.features === NODES.length && Array.isArray(summary.godNodes));

  const mods = runTool(graph, 'list_modules');
  check('graph-tools: list_modules menampung fitur anak',
    mods.length === MODULES.length && mods.every((m) => Array.isArray(m.features)));

  const feat = NODES[0];
  const got = runTool(graph, 'get_node', { id: feat.id });
  check('graph-tools: get_node membawa id + anak', got.id === feat.id && Array.isArray(got.children));
  check('graph-tools: get_node id tak ada → error',
    typeof runTool(graph, 'get_node', { id: '__x__' }).error === 'string');

  check('graph-tools: search_nodes mengembalikan array',
    Array.isArray(runTool(graph, 'search_nodes', { query: feat.id.slice(0, 3) })));

  // trace_flow: dari node ber-derajat data (bila ada) harus balas reachable/path.
  const dataSrc = (DATA_EDGES || [])[0] && DATA_EDGES[0][0];
  const flow = runTool(graph, 'trace_flow', { from: dataSrc || feat.id });
  check('graph-tools: trace_flow balas reachable/path/error',
    'reachable' in flow || 'path' in flow || 'error' in flow);

  // Dispatch JSON-RPC (dipakai stdio MCP & HTTP MCP).
  const init = handleMessage(graph, { id: 1, method: 'initialize' });
  check('graph-tools: initialize → serverInfo dyalisis',
    init.result.serverInfo.name === 'dyalisis' && init.result.protocolVersion);
  check('graph-tools: tools/list memuat 6 tool',
    handleMessage(graph, { id: 2, method: 'tools/list' }).result.tools.length === 6);
  const call = handleMessage(graph, { id: 3, method: 'tools/call',
    params: { name: 'get_node', arguments: { id: '__x__' } } });
  check('graph-tools: tools/call id tak ada → isError', call.result.isError === true);
  check('graph-tools: notifikasi (tanpa id) → null',
    handleMessage(graph, { method: 'notifications/initialized' }) === null);

  // Proyeksi Markdown + llms.txt.
  const md = graphToMarkdown(graph);
  check('graph-md: Markdown memuat judul app + prosa fitur', md.includes('# ') &&
    md.includes('## Modul:') && md.includes('### Fitur:'));
  const llms = graphToLlmsTxt(graph, { base: 'https://x.test/app' });
  check('graph-md: llms.txt memuat pointer JSON/Markdown/MCP',
    llms.includes('https://x.test/app.json') && llms.includes('https://x.test/app.md') &&
    llms.includes('https://x.test/app/mcp'));
}

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
