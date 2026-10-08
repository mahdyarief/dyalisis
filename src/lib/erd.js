// Parser erDiagram (Mermaid) → model entitas + relasi. Isomorphic: dipakai parser
// spec (Node, lib/spec.mjs) dan renderer ERD (browser, ErdDiagram.jsx). Hanya
// sintaks terbatas yang dipakai spec: blok `ENT { type nama [PK|FK|UK] "note" }`
// dan relasi `A ||--o{ B : "label"`. Tanpa dependency; aman untuk bundle.

const OPEN = /^([A-Za-z_][\w-]*)\s*\{\s*$/;
const ATTR = /^([A-Za-z_][\w()]*)\s+([A-Za-z_][\w-]*)\s*(PK|FK|UK)?\s*(?:"([^"]*)")?\s*$/;
const REL = /^([A-Za-z_][\w-]*)\s+([|}o{]+)(--|\.\.)([|}o{]+)\s+([A-Za-z_][\w-]*)\s*(?::\s*"?([^"]*)"?)?$/;

/** Parse sumber `erDiagram` → { entities, relations }. Tahan input parsial. */
export function parseErd(source) {
  const entities = [];
  const relations = [];
  const byName = {};
  const ensure = (name) => {
    if (!byName[name]) { byName[name] = { name, attrs: [] }; entities.push(byName[name]); }
    return byName[name];
  };
  if (!source) return { entities, relations };

  let cur = null;
  for (const raw of String(source).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^erDiagram\b/i.test(line)) continue;

    const open = OPEN.exec(line);
    if (open) { cur = ensure(open[1]); continue; }
    if (line === '}') { cur = null; continue; }

    if (cur) {
      const a = ATTR.exec(line);
      if (a) cur.attrs.push({ type: a[1], name: a[2], key: a[3] || '', note: a[4] || '' });
      continue;
    }

    const r = REL.exec(line);
    if (r) relations.push({ from: r[1], to: r[5], fromCard: r[2], toCard: r[4], identifying: r[3] === '--', label: r[6] || '' });
  }

  // Entitas yang hanya muncul di relasi (tanpa blok atribut) tetap didaftarkan.
  for (const r of relations) { ensure(r.from); ensure(r.to); }
  return { entities, relations };
}

// Kardinalitas crow's-foot → label ringkas ("1", "0..1", "0..N", "1..N").
export function cardLabel(c) {
  const s = String(c || '');
  if (s.includes('{')) return s.includes('o') ? '0..N' : '1..N';
  if (s === '||') return '1';
  if (s.includes('o')) return '0..1';
  return '';
}

// Atribut blok `Entity { ... }` dari sumber erDiagram → peta nama→attrs.
export function erdEntityMap(source) {
  const map = {};
  for (const e of parseErd(source).entities) map[e.name] = e.attrs;
  return map;
}