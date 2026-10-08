// Dyalisis engine — analisis graf turunan dari content layer (isomorphic).
// Fungsi murni tanpa API Node/DOM, sehingga dipakai oleh:
//   - build.mjs      (export dist/graph.json)
//   - src/index.jsx  (panel Insight di UI)
//   - test/run.mjs   (unit test)
//   - lib/mcp.mjs    (server MCP stdio)
// Semua turunan dihitung dari data — tidak ada id aplikasi yang di-hardcode,
// jadi hasilnya benar untuk content apa pun.

const TYPES = ['app', 'module', 'feature', 'action'];

/** Semua node sebagai daftar datar { id, label, domain, type, level, parent }. */
export function flattenNodes(C) {
  const MODULES = C.MODULES || [];
  const NODES = C.NODES || [];
  const ACTIONS = C.ACTIONS || [];
  const lv = (id) => (typeof C.levelOf === 'function' ? C.levelOf(id) : 0);
  return [
    ...(C.ROOT ? [{ ...C.ROOT, parent: undefined }] : []),
    ...MODULES.map((m) => ({ ...m, parent: 'app' })),
    ...NODES.map((n) => ({ ...n, parent: `mod-${n.domain}` })),
    ...ACTIONS
  ].map((n) => ({ ...n, level: lv(n.id), type: TYPES[lv(n.id)] || 'feature' }));
}

/** Model ternormalisasi: node datar, edge hierarki, edge data, domain, app. */
export function buildModel(C) {
  const nodes = flattenNodes(C);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const dataEdges = (C.DATA_EDGES || []).map(([source, target, field]) => ({ source, target, field }));
  const hierarchy = (C.EDGES || []).map(([source, target, kind]) => ({ source, target, kind }));
  return { app: C.APP || null, domains: C.DOMAINS || {}, nodes, byId, dataEdges, hierarchy };
}

/** Derajat (in/out/total) tiap node dari DATA_EDGES; edge paralel dihitung. */
export function degreeMap(model) {
  const deg = {};
  const bump = (id, key) => {
    const d = (deg[id] = deg[id] || { in: 0, out: 0, total: 0 });
    d[key]++; d.total++;
  };
  model.dataEdges.forEach((e) => { bump(e.source, 'out'); bump(e.target, 'in'); });
  return deg;
}

/** Fitur dengan derajat tertinggi (hub/chokepoint). Urut total desc, lalu id asc. */
export function godNodes(model, { top = 5, minDegree = 1 } = {}) {
  const deg = degreeMap(model);
  return model.nodes
    .filter((n) => n.type === 'feature')
    .map((n) => ({ id: n.id, label: n.label, domain: n.domain,
      ...(deg[n.id] || { in: 0, out: 0, total: 0 }) }))
    .filter((n) => n.total >= minDegree)
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))
    .slice(0, top);
}

/** DATA_EDGES yang melintasi batas modul (domain sumber ≠ domain target). */
export function crossModuleLinks(model) {
  return model.dataEdges
    .map((e) => {
      const a = model.byId[e.source];
      const b = model.byId[e.target];
      if (!a || !b || a.domain === b.domain) return null;
      return { source: e.source, target: e.target, field: e.field,
        fromDomain: a.domain, toDomain: b.domain };
    })
    .filter(Boolean);
}

/** Fitur tanpa satu pun relasi data (tak tersentuh DATA_EDGES). */
export function isolatedFeatures(model) {
  const touched = new Set();
  model.dataEdges.forEach((e) => { touched.add(e.source); touched.add(e.target); });
  return model.nodes
    .filter((n) => n.type === 'feature' && !touched.has(n.id))
    .map((n) => ({ id: n.id, label: n.label, domain: n.domain }));
}

// Provenance catatan — dari mana sebuah catatan berasal, supaya pembaca tahu
// mana yang berdasar dokumen ("spec") dan mana yang disimpulkan ("inferred").
// Backward-compatible: NOTES[id] boleh string (dianggap 'spec') atau objek
// { text, provenance }. Semua pembaca catatan lewat helper ini.
const PROVENANCE = new Set(['spec', 'inferred']);

export function noteInfo(notes, id) {
  const raw = notes ? notes[id] : null;
  if (raw == null) return { text: null, provenance: null };
  if (typeof raw === 'string') return { text: raw, provenance: 'spec' };
  const provenance = PROVENANCE.has(raw.provenance) ? raw.provenance : 'spec';
  return { text: raw.text || '', provenance };
}

export function noteText(notes, id) {
  return noteInfo(notes, id).text;
}

/** Ringkasan analisis: jumlah, god nodes, coupling lintas-modul, terisolasi. */
export function analyze(C, opts = {}) {
  const model = buildModel(C);
  const notes = C.NOTES || {};
  const counts = {
    modules: model.nodes.filter((n) => n.type === 'module').length,
    features: model.nodes.filter((n) => n.type === 'feature').length,
    actions: model.nodes.filter((n) => n.type === 'action').length,
    dataEdges: model.dataEdges.length,
    notes: Object.keys(notes).length,
    inferred: Object.keys(notes).filter((id) => noteInfo(notes, id).provenance === 'inferred').length
  };
  return {
    app: model.app ? model.app.name : null,
    counts,
    godNodes: godNodes(model, opts),
    crossModule: crossModuleLinks(model),
    isolated: isolatedFeatures(model)
  };
}

/** Ekspor serializable: node, edge, analisis. Ditulis sebagai dist/graph.json. */
// Field content opsional hasil spec 4-aksis (Brief/Goals/Workflow/Entity) +
// ERD modul. Disertakan hanya bila ada supaya graph.json tetap ringkas dan
// backward-compatible untuk content yang tidak memakai spec.
const SPEC_FIELDS = ['brief', 'goals', 'workflow', 'entities', 'sources',
  'evidence', 'status', 'erd', 'spec'];

export function specFields(n) {
  const out = {};
  for (const k of SPEC_FIELDS) if (n[k] != null) out[k] = n[k];
  return out;
}

export function toGraphJson(C, opts = {}) {
  const model = buildModel(C);
  const notes = C.NOTES || {};
  const nodes = model.nodes.map((n) => {
    const { text, provenance } = noteInfo(notes, n.id);
    return {
      id: n.id, label: n.label, domain: n.domain, type: n.type, level: n.level,
      parent: n.parent || null, route: n.route || null, fields: n.fields || null,
      perm: n.perm || null,
      ...specFields(n),
      note: text != null ? { text, provenance } : null
    };
  });
  const edges = [
    ...model.hierarchy.map((e) => ({ source: e.source, target: e.target,
      type: 'hierarchy', kind: e.kind || 'hierarchy' })),
    ...model.dataEdges.map((e) => ({ source: e.source, target: e.target,
      type: 'data', field: e.field || null }))
  ];
  return {
    version: 1,
    generator: 'dyalisis',
    app: C.APP || null,
    domains: C.DOMAINS || {},
    nodes,
    edges,
    analysis: analyze(C, opts)
  };
}