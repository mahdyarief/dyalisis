// Parser spec Markdown → content Dyalisis. Zero-dep (hanya Node builtin).
// Membaca `spec/*.md` (blok 4-aksis Brief/Goals/Workflow/Entity + ERD mermaid),
// `feature-registry.md` (sumber[] / level bukti / status), dan `spec-entity.md`
// (ERD gabungan). Referensi format: `spec/00-TEMPLATE.md`.
//   parseSpecDir(specDir) -> { APP, DOMAINS, ROOT, MODULES, NODES, ACTIONS,
//                              EDGES, DATA_EDGES, LEVELS, LEVEL_NAMES, levelOf }
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseErd } from '../src/lib/erd.js';

export { parseErd, cardLabel, erdEntityMap } from '../src/lib/erd.js';

const COLOR_CYCLE = ['#22d3ee', '#4ade80', '#a78bfa', '#f472b6', '#fbbf24',
  '#60a5fa', '#34d399', '#fb7185', '#c084fc', '#38bdf8', '#facc15', '#2dd4bf'];

const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

// Ambil isi blok ```mermaid ... ``` pertama dari sebuah teks.
function extractMermaid(text) {
  const m = /```mermaid\s*\n([\s\S]*?)```/.exec(text);
  return m ? m[1].trim() : '';
}

// Baca baris blockquote intro modul (setelah H1, sebelum heading `##`).
function readIntro(text) {
  const out = [];
  let seenH1 = false;
  for (const ln of text.split(/\r?\n/)) {
    if (/^#\s/.test(ln)) { seenH1 = true; continue; }
    if (!seenH1) continue;
    if (/^##\s/.test(ln)) break;
    if (/^>\s?/.test(ln)) out.push(ln.replace(/^>\s?/, ''));
    else if (out.length) out.push('');
  }
  return out.join('\n').trim();
}

// Parse satu blok 4-aksis (- **Brief.** … dst, lanjutan indent).
function parseAxes(body) {
  const names = { Brief: 'brief', Goals: 'goals', Workflow: 'workflow', Entity: 'entity' };
  const buf = { brief: [], goals: [], workflow: [], entity: [] };
  let cur = null;
  for (const ln of body.split(/\r?\n/)) {
    const h = /^-\s*\*\*(Brief|Goals|Workflow|Entity)\.\*\*\s*(.*)$/.exec(ln);
    if (h) { cur = names[h[1]]; if (h[2]) buf[cur].push(h[2]); continue; }
    if (!cur) continue;
    if (/^###/.test(ln)) { cur = null; continue; }
    buf[cur].push(ln.replace(/^\s{1,3}/, ''));
  }
  const out = {};
  for (const k in buf) out[k] = buf[k].join('\n').replace(/\s*\n\s*/g, ' ').trim();
  return out;
}

// Parse daftar entitas dari teks aksis Entity: `pasien` (no_rm, nik, ...); ...
function parseEntities(entityText, erdMap) {
  const out = [];
  const re = /`([^`]+)`\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(entityText))) {
    const name = m[1].trim();
    // Tolak frasa relasi (mis. "pasien 1—N consent") — bukan definisi entitas.
    if (!/^[A-Za-z_][\w-]*$/.test(name)) continue;
    const attrs = m[2].split(',').map((s) => s.trim()).filter(Boolean).map((f) => {
      const parts = f.split(/\s+/);
      return { type: '', name: parts[0], key: (parts[1] || '').toUpperCase(), note: '' };
    });
    const erdAttrs = erdMap[name.toUpperCase()] || erdMap[name];
    if (erdAttrs) {
      for (const a of attrs) {
        const hit = erdAttrs.find((e) => e.name.toLowerCase() === a.name.toLowerCase());
        if (hit) { a.type = hit.type; if (!a.key) a.key = hit.key; if (hit.note) a.note = hit.note; }
      }
    }
    out.push({ name, attrs });
  }
  return out;
}

// Parse tabel registry §3: | `id` | Fitur | Sumber | Level | Status |.
function parseRegistry(text) {
  const byId = {};
  for (const ln of text.split(/\r?\n/)) {
    if (!/^\|/.test(ln)) continue;
    const cells = ln.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const idM = /^`([^`]+)`$/.exec(cells[0]);
    if (!idM) continue;
    const sources = cells[2].split(';').map((s) => s.trim().replace(/^`+|`+$/g, '')).filter(Boolean);
    byId[idM[1]] = { label: cells[1], sources, evidence: cells[3], status: cells[4] };
  }
  return byId;
}

// H1 spec tidak seragam: "Spec Modul X (`mod-x`)", "Spec 02 — Modul X (`mod-x`)",
// "Spec — Modul X (cluster `mod-x`)", dst. Ambil module id dari backtick `mod-*`
// mana pun, lalu turunkan label dengan membuang prefiks/ekor umum.
function parseH1(text) {
  const line = (/^#\s+(.+)$/m.exec(text) || [])[1];
  if (!line) return null;
  const idm = /`(mod-[^`]+)`/.exec(line);
  if (!idm) return null;
  const moduleId = idm[1];
  const label = line
    .replace(/^\d*-?spec\b/i, '')
    .replace(/^[\s\d—–·:\-]+/, '')
    .replace(/^Modul\s+/i, '')
    .replace(/\s*\([^)]*`mod-[^`]+`[^)]*\)/g, '')
    .replace(/·?\s*cluster\s*`[^`]*`.*$/, '')
    .trim();
  return { moduleId, label: label || moduleId.replace(/^mod-/, '') };
}

// Nama aplikasi diringkas dari judul 00-INDEX.md (fallback: nama folder induk).
function deriveAppName(specDir, override) {
  if (override) return override;
  for (const p of [resolve(specDir, '..', '00-INDEX.md'), resolve(specDir, '00-INDEX.md')]) {
    const m = /^#\s+(.+)$/m.exec(readText(p));
    if (m) {
      const cleaned = m[1]
        .replace(/^\d*-?\s*INDEX\s*[—–-]\s*/i, '')
        .replace(/\s*\(.*\)\s*$/, '')
        .trim();
      if (cleaned) return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  const base = resolve(specDir, '..').split(/[\\/]/).filter(Boolean).pop() || 'Spec';
  return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse seluruh folder spec → objek content siap pakai. */
export function parseSpecDir(specDir, { appName } = {}) {
  const dir = resolve(specDir);
  const files = readdirSync(dir).filter((f) => /^spec-\d.*\.md$/.test(f)).sort();
  const registry = parseRegistry(readText(resolve(dir, '..', 'feature-registry.md')) || readText(resolve(dir, 'feature-registry.md')));

  const DOMAINS = {};
  const DOMAIN_KEYS = [];
  const MODULES = [];
  const NODES = [];
  const ACTIONS = [];
  // Spec boleh mendefinisikan fitur yang sama di dua modul (mis. apotek-bpjs di
  // farmasi & bridging). Kontrak mewajibkan id unik → pakai kemunculan pertama.
  const seenFeatureIds = new Set();

  for (const f of files) {
    const text = readText(resolve(dir, f));
    if (!text) continue;
    const h1 = parseH1(text);
    if (!h1) continue;
    const moduleLabel = h1.label;
    const moduleId = h1.moduleId;
    const domain = moduleId.replace(/^mod-/, '');
    const intro = readIntro(text);
    const erd = extractMermaid(text);

    if (!DOMAINS[domain]) {
      DOMAINS[domain] = { label: moduleLabel || domain, color: COLOR_CYCLE[DOMAIN_KEYS.length % COLOR_CYCLE.length] };
      DOMAIN_KEYS.push(domain);
    }
    MODULES.push({
      id: moduleId, label: moduleLabel || domain, domain,
      desc: (intro.split('\n')[0] || `Modul ${domain}.`).slice(0, 160),
      spec: intro, erd, route: '', perm: ''
    });

    const erdMap = {};
    for (const e of parseErd(erd).entities) erdMap[e.name] = e.attrs;

    const fRe = /^###\s+`([^`]+)`\s+—\s+(.+?)\s+·\s+cluster\s+`([^`]+)`\s*$/gm;
    const marks = [];
    let m;
    while ((m = fRe.exec(text))) marks.push({ id: m[1], label: m[2].trim(), bodyStart: fRe.lastIndex, start: m.index });
    for (let i = 0; i < marks.length; i++) {
      if (seenFeatureIds.has(marks[i].id)) continue;
      seenFeatureIds.add(marks[i].id);
      const body = text.slice(marks[i].bodyStart, i + 1 < marks.length ? marks[i + 1].start : text.length);
      const ax = parseAxes(body);
      const entities = parseEntities(ax.entity, erdMap);
      const primary = entities[0];
      const reg = registry[marks[i].id] || {};
      NODES.push({
        id: marks[i].id, label: marks[i].label, domain,
        desc: (ax.brief.split('\n')[0] || marks[i].label).slice(0, 160),
        fields: primary ? primary.attrs.map((a) => a.name).join(', ') : '',
        route: '', perm: '',
        brief: ax.brief, goals: ax.goals, workflow: ax.workflow, entities,
        sources: reg.sources || [], evidence: reg.evidence || '', status: reg.status || ''
      });
      const steps = ax.workflow.split('→').map((s) => s.trim()).filter(Boolean);
      if (steps.length) {
        steps.forEach((s, k) => ACTIONS.push({
          id: `${marks[i].id}~${k}`,
          label: s.replace(/^\(\d+\)\s*/, '').slice(0, 48) || `Langkah ${k + 1}`,
          parent: marks[i].id, domain
        }));
      } else {
        ACTIONS.push({ id: `${marks[i].id}~0`, label: marks[i].label.slice(0, 48), parent: marks[i].id, domain });
      }
    }
  }

  // Relasi data: fitur yang berbagi entitas yang sama dihubungkan (bintang).
  const byEntity = {};
  for (const n of NODES) for (const e of (n.entities || [])) {
    const key = e.name.toUpperCase();
    (byEntity[key] = byEntity[key] || []).push(n.id);
  }
  const DATA_EDGES = [];
  for (const [ent, ids] of Object.entries(byEntity)) {
    const uniq = [...new Set(ids)];
    if (uniq.length < 2) continue;
    for (let i = 1; i < uniq.length; i++) DATA_EDGES.push([uniq[0], uniq[i], ent.toLowerCase()]);
  }

  const name = deriveAppName(dir, appName);
  const APP = { name, subtitle: 'Dibangun dari spec Markdown 4-aksis' };
  const ROOT = { id: 'app', label: name, domain: DOMAIN_KEYS[0] || 'spec', desc: APP.subtitle };
  const EDGES = [
    ...MODULES.map((mm) => ['app', mm.id, 'modul']),
    ...NODES.map((n) => [`mod-${n.domain}`, n.id, 'fitur']),
    ...ACTIONS.map((a) => [a.parent, a.id, 'aksi'])
  ];
  const LEVELS = { 0: ['app'], 1: MODULES.map((x) => x.id), 2: NODES.map((x) => x.id), 3: ACTIONS.map((x) => x.id) };
  const LEVEL_NAMES = { 0: 'Aplikasi', 1: 'Modul', 2: 'Fitur', 3: 'Aksi' };
  const levelOf = (id) => { for (const k in LEVELS) if (LEVELS[k].includes(id)) return +k; return 0; };

  return { APP, DOMAINS, ROOT, MODULES, NODES, ACTIONS, EDGES, DATA_EDGES, LEVELS, LEVEL_NAMES, levelOf };
}