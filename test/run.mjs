// Dyalisis self-test — headless (tanpa browser). Jalankan: `npm test`.
// Menguji content layer + engine: integritas hierarki, compound boundary boxes,
// keep-set saat klik, dan bahwa layout dagre & elk benar-benar menghasilkan posisi.
//   node test/run.mjs [--content src/data/nama-app.js]   (default: example.js)
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const require = createRequire(pathToFileURL(resolve(REPO, 'package.json')));

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
const CONTENT = contentArg ? resolve(REPO, contentArg) : resolve(REPO, 'src/data/example.js');
const C = await import(pathToFileURL(CONTENT).href);

// Fungsi engine asli (bukan replika) — buildActivePath & style dipakai engine.
const { buildActivePath } = await import(pathToFileURL(resolve(REPO, 'src/lib/flow.js')).href);
const { buildGraphStyle, graphPalette } = await import(pathToFileURL(resolve(REPO, 'src/lib/graph-style.js')).href);

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
  check('kelas noted: pakai noteColor (pie)', s['pie-1-background-color'] === rgb(pal.noteColor), String(s['pie-1-background-color']));
  check('kelas noted: irisan pie kecil (<50%)', num(s['pie-1-background-size']) < 50, String(s['pie-1-background-size']));
}

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
