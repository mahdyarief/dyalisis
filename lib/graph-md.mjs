// Proyeksi graph.json → Markdown + llms.txt (murni, zero-dep).
// Tujuan: URL publik hasil `dyalisis publish` bisa dipakai agent sebagai
// sumber dokumentasi/analisis fitur — brief/goals/workflow/entities/ERD
// per modul+fitur, tanpa perlu membuka HTML interaktif.

const asArray = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]));
const oneLine = (s) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();

// Slug heading ala GitHub (untuk anchor di llms.txt).
const headingSlug = (s) => oneLine(s).toLowerCase()
  .replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');

// Entitas → "`pasien` (no_rm, nik); `kunjungan` (…)".
function entityLine(entities) {
  return asArray(entities).map((e) => {
    const attrs = asArray(e && e.attrs).map((a) => a.name).filter(Boolean).join(', ');
    return attrs ? `\`${e.name}\` (${attrs})` : `\`${e.name}\``;
  }).join('; ');
}

/** Render graph.json → Markdown dokumentasi fitur (struktur + prosa). */
export function graphToMarkdown(graph) {
  const app = graph.app || {};
  const a = graph.analysis || {};
  const c = a.counts || {};
  const nodes = graph.nodes || [];
  const modules = nodes.filter((n) => n.type === 'module');
  const out = [];

  out.push(`# ${app.name || 'Dyalisis'} — Dokumentasi Fitur`, '');
  if (app.subtitle) out.push(`> ${oneLine(app.subtitle)}`, '');
  out.push(`${c.modules || modules.length} modul · ${c.features || 0} fitur · ` +
    `${c.actions || 0} aksi · ${c.dataEdges || 0} relasi data.`, '');
  out.push('_Diproyeksikan otomatis oleh Dyalisis dari graph.json._', '');

  if (asArray(a.godNodes).length) {
    out.push('## Fitur hub (god nodes)', '');
    for (const g of a.godNodes) out.push(`- \`${g.id}\` ${g.label} (${g.total} relasi)`);
    out.push('');
  }
  if (asArray(a.crossModule).length) {
    out.push('## Coupling lintas-modul', '');
    for (const x of a.crossModule) out.push(`- \`${x.source}\` → \`${x.target}\` (${x.fromDomain} → ${x.toDomain})`);
    out.push('');
  }
  if (asArray(a.isolated).length) {
    out.push('## Fitur terisolasi (tanpa relasi data)', '');
    for (const i of a.isolated) out.push(`- \`${i.id}\` ${i.label}`);
    out.push('');
  }

  for (const m of modules) {
    out.push(`## Modul: ${m.label} (\`${m.id}\`)`, '');
    if (m.spec) out.push(m.spec, '');
    else if (m.desc) out.push(m.desc, '');

    for (const f of nodes.filter((n) => n.type === 'feature' && n.parent === m.id)) {
      out.push(`### Fitur: ${f.label} (\`${f.id}\`)`, '');
      if (f.brief) out.push(`- **Brief.** ${oneLine(f.brief)}`);
      if (f.goals) out.push(`- **Goals.** ${oneLine(f.goals)}`);
      if (f.workflow) out.push(`- **Workflow.** ${oneLine(f.workflow)}`);
      const ents = entityLine(f.entities);
      if (ents) out.push(`- **Entities.** ${ents}`);
      const meta = [];
      if (asArray(f.sources).length) meta.push(`**Sumber.** ${f.sources.join('; ')}`);
      if (f.evidence) meta.push(`**Level.** ${f.evidence}`);
      if (f.status) meta.push(`**Status.** ${oneLine(f.status)}`);
      if (meta.length) out.push(`- ${meta.join(' · ')}`);
      out.push('');

      const actions = nodes.filter((n) => n.type === 'action' && n.parent === f.id);
      if (actions.length) {
        out.push('#### Aksi', '');
        actions.forEach((x, i) => out.push(`${i + 1}. ${x.label}`));
        out.push('');
      }
    }

    if (m.erd) {
      out.push(`#### ERD (${m.label})`, '', '```mermaid', m.erd, '```', '');
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** Render indeks llms.txt (konvensi llmstxt.org) — ringkasan + pointer. */
export function graphToLlmsTxt(graph, { base = '' } = {}) {
  const app = graph.app || {};
  const a = graph.analysis || {};
  const c = a.counts || {};
  const nodes = graph.nodes || [];
  const modules = nodes.filter((n) => n.type === 'module');
  const mdUrl = base ? `${base}.md` : 'index.md';
  const jsonUrl = base ? `${base}.json` : 'graph.json';
  const mcpUrl = base ? `${base}/mcp` : 'mcp';
  const out = [];

  out.push(`# ${app.name || 'Dyalisis'}`, '');
  out.push(`> ${app.subtitle ? oneLine(app.subtitle) : 'Dokumentasi & analisis fitur (SIMRS blueprint).'}`, '');
  out.push(`Blueprint fitur untuk development: ${c.modules || modules.length} modul, ` +
    `${c.features || 0} fitur, ${c.actions || 0} aksi, ${c.dataEdges || 0} relasi data. ` +
    'Setiap fitur membawa brief/goals/workflow/entities + sumber & level bukti; tiap modul membawa ERD.', '');

  out.push('## Sumber', '');
  out.push(`- [Dokumentasi Markdown](${mdUrl}): prosa lengkap per modul & fitur (brief/goals/workflow/entities/ERD).`);
  out.push(`- [Graph JSON](${jsonUrl}): model ternormalisasi (node, edge, analisis hub/coupling) — machine-readable.`);
  out.push(`- MCP (Streamable HTTP): \`POST ${mcpUrl}\` — tools: graph_summary, list_modules, get_node, search_nodes, get_notes, trace_flow.`, '');

  out.push('## Modul', '');
  for (const m of modules) {
    const feats = nodes.filter((n) => n.type === 'feature' && n.parent === m.id).length;
    out.push(`- [${m.label}](${mdUrl}#${headingSlug(`Modul: ${m.label} (${m.id})`)}): ${feats} fitur`);
  }
  out.push('');

  return out.join('\n').trimEnd() + '\n';
}