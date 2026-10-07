// Dyalisis MCP server — graf fitur sebagai tool MCP via stdio (JSON-RPC 2.0).
// Tanpa dependency eksternal: protokol MCP minimal di atas pesan JSON
// newline-delimited. Dipakai oleh `dyalisis serve --mcp` supaya agent bisa
// meng-query graf fitur tanpa membuka HTML: ringkasan analisis, daftar modul,
// detail node, catatan, pencarian, dan penelusuran alur pada DATA_EDGES.
import { pathToFileURL } from 'node:url';
import { resolveContentFile } from '../build.mjs';
import { buildModel, analyze, noteInfo } from '../src/lib/analysis.js';

const PROTOCOL = '2024-11-05';
const SERVER = { name: 'dyalisis', version: '0.1.0' };

/** Muat content proyek (resolusi sama seperti build) lalu siapkan model + indeks. */
async function loadContext(projectDir, content) {
  const file = resolveContentFile(projectDir, content);
  const C = await import(pathToFileURL(file).href);
  const model = buildModel(C);
  const notes = C.NOTES || {};
  return { file, C, model, notes };
}

/** Representasi ringkas satu node untuk balasan tool. */
const viewNode = (ctx, n) => {
  const { text, provenance } = noteInfo(ctx.notes, n.id);
  return {
    id: n.id, label: n.label, domain: n.domain, type: n.type, level: n.level,
    parent: n.parent || null, route: n.route || null, fields: n.fields || null,
    perm: n.perm || null,
    note: text != null ? { text, provenance } : null
  };
};

const TOOLS = [
  { name: 'graph_summary',
    description: 'Ringkasan aplikasi: jumlah modul/fitur/aksi, fitur hub (god nodes), coupling lintas-modul, dan fitur terisolasi.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_modules',
    description: 'Daftar modul beserta fitur di dalamnya.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_node',
    description: 'Detail satu node (fitur/modul/aksi) berdasarkan id, termasuk catatan dan anak.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'id node' } }, required: ['id'], additionalProperties: false } },
  { name: 'search_nodes',
    description: 'Cari node berdasarkan kecocokan label/id (case-insensitive).',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } },
  { name: 'get_notes',
    description: 'Ambil catatan (tacit knowledge) untuk satu node, atau semua catatan bila id kosong.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: false } },
  { name: 'trace_flow',
    description: 'Telusuri alur data antar-fitur lewat DATA_EDGES dari sebuah fitur awal (opsional sampai fitur tujuan).',
    inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from'], additionalProperties: false } }
];

/** BFS pada DATA_EDGES: jalur from→to, atau himpunan node terjangkau bila to kosong. */
function traceFlow(model, from, to) {
  if (!model.byId[from]) return { error: `fitur awal tidak ditemukan: ${from}` };
  const adj = {};
  model.dataEdges.forEach((e) => { (adj[e.source] = adj[e.source] || []).push(e.target); });
  const label = (id) => ({ id, label: (model.byId[id] && model.byId[id].label) || id });
  const seen = new Set([from]);
  const queue = [[from]];
  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    for (const next of (adj[last] || [])) {
      if (seen.has(next)) continue;
      seen.add(next);
      const np = path.concat(next);
      if (to && next === to) return { from, to, path: np.map(label) };
      queue.push(np);
    }
  }
  if (to) return { from, to, path: null };
  return { from, reachable: [...seen].filter((id) => id !== from).map(label) };
}

/** Eksekusi satu tool; mengembalikan objek yang kemudian di-JSON-kan ke MCP. */
function runTool(ctx, name, args = {}) {
  const { model, notes } = ctx;
  switch (name) {
    case 'graph_summary': {
      const a = analyze(ctx.C);
      return { app: a.app, counts: a.counts, godNodes: a.godNodes, crossModule: a.crossModule, isolated: a.isolated };
    }
    case 'list_modules': {
      return model.nodes.filter((n) => n.type === 'module').map((m) => ({
        ...viewNode(ctx, m),
        features: model.nodes.filter((f) => f.parent === m.id).map((f) => viewNode(ctx, f))
      }));
    }
    case 'get_node': {
      const n = model.byId[args.id];
      if (!n) return { error: `node tidak ditemukan: ${args.id}` };
      return { ...viewNode(ctx, n), children: model.nodes.filter((c) => c.parent === n.id).map((c) => viewNode(ctx, c)) };
    }
    case 'search_nodes': {
      const q = String(args.query || '').toLowerCase();
      return model.nodes
        .filter((n) => n.id.toLowerCase().includes(q) || String(n.label || '').toLowerCase().includes(q))
        .map((n) => viewNode(ctx, n));
    }
    case 'get_notes':
      if (args.id == null) return notes;
      return { id: args.id, ...noteInfo(notes, args.id) };
    case 'trace_flow':
      return traceFlow(model, args.from, args.to);
    default:
      return { error: `tool tidak dikenal: ${name}` };
  }
}

/** Tangani satu pesan JSON-RPC; kembalikan balasan, atau null untuk notifikasi. */
function handle(ctx, msg) {
  const { id, method, params } = msg;
  const result = (res) => ({ jsonrpc: '2.0', id, result: res });
  if (method === 'initialize') {
    return result({ protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: SERVER });
  }
  if (method === 'notifications/initialized' || id == null) return null;
  if (method === 'ping') return result({});
  if (method === 'tools/list') return result({ tools: TOOLS });
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    const out = runTool(ctx, name, args || {});
    const isError = out && typeof out === 'object' && !Array.isArray(out) && 'error' in out;
    return result({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError });
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `method tidak dikenal: ${method}` } };
}

/** Jalankan server MCP di atas stdio (newline-delimited JSON). */
export async function startMcp({ projectDir = process.cwd(), content } = {}) {
  const ctx = await loadContext(projectDir, content);
  process.stderr.write(`[dyalisis] MCP server — content: ${ctx.file}\n`);
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const reply = handle(ctx, msg);
      if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
    }
  });
  process.stdin.on('end', () => process.exit(0));
}