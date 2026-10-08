// Dyalisis graph tools — operasi murni atas graph.json (tanpa Node/DOM).
// Dipakai bersama oleh transport stdio (lib/mcp.mjs) dan HTTP (server publish),
// supaya kedua transport mengekspos tool yang IDENTIK.
//   runTool(graph, name, args) → objek hasil (di-JSON-kan ke MCP)
//   handleMessage(graph, msg)  → balasan JSON-RPC, atau null untuk notifikasi

export const PROTOCOL = '2024-11-05';
export const SERVER_INFO = { name: 'dyalisis', version: '0.3.0' };

export const TOOLS = [
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

const indexById = (nodes) => Object.fromEntries(nodes.map((n) => [n.id, n]));
const childrenOf = (nodes, id) => nodes.filter((n) => n.parent === id);

/** BFS pada edge bertipe 'data': jalur from→to, atau himpunan node terjangkau bila to kosong. */
export function traceFlow(graph, from, to) {
  const nodes = graph.nodes || [];
  const byId = indexById(nodes);
  if (!byId[from]) return { error: `fitur awal tidak ditemukan: ${from}` };
  const adj = {};
  (graph.edges || []).filter((e) => e.type === 'data')
    .forEach((e) => { (adj[e.source] = adj[e.source] || []).push(e.target); });
  const label = (id) => ({ id, label: (byId[id] && byId[id].label) || id });
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

/** Eksekusi satu tool atas graph.json; mengembalikan objek hasil. */
export function runTool(graph, name, args = {}) {
  const nodes = graph.nodes || [];
  const byId = indexById(nodes);
  switch (name) {
    case 'graph_summary': {
      const a = graph.analysis || {};
      return { app: a.app ?? null, counts: a.counts, godNodes: a.godNodes,
        crossModule: a.crossModule, isolated: a.isolated };
    }
    case 'list_modules':
      return nodes.filter((n) => n.type === 'module')
        .map((m) => ({ ...m, features: childrenOf(nodes, m.id) }));
    case 'get_node': {
      const n = byId[args.id];
      if (!n) return { error: `node tidak ditemukan: ${args.id}` };
      return { ...n, children: childrenOf(nodes, n.id) };
    }
    case 'search_nodes': {
      const q = String(args.query || '').toLowerCase();
      return nodes.filter((n) =>
        n.id.toLowerCase().includes(q) || String(n.label || '').toLowerCase().includes(q));
    }
    case 'get_notes': {
      if (args.id == null) {
        const out = {};
        for (const n of nodes) if (n.note) out[n.id] = n.note;
        return out;
      }
      const n = byId[args.id];
      return { id: args.id, text: (n && n.note && n.note.text) ?? null,
        provenance: (n && n.note && n.note.provenance) ?? null };
    }
    case 'trace_flow':
      return traceFlow(graph, args.from, args.to);
    default:
      return { error: `tool tidak dikenal: ${name}` };
  }
}

/** Tangani satu pesan JSON-RPC; kembalikan balasan, atau null untuk notifikasi. */
export function handleMessage(graph, msg) {
  const { id, method, params } = msg || {};
  const result = (res) => ({ jsonrpc: '2.0', id, result: res });
  if (method === 'initialize') {
    return result({ protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
  }
  if (method === 'notifications/initialized' || id == null) return null;
  if (method === 'ping') return result({});
  if (method === 'tools/list') return result({ tools: TOOLS });
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    const out = runTool(graph, name, args || {});
    const isError = out && typeof out === 'object' && !Array.isArray(out) && 'error' in out;
    return result({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError });
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `method tidak dikenal: ${method}` } };
}