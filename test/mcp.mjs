// Uji server MCP Dyalisis — spawn `bin/dyalisis.mjs serve --mcp`, kirim JSON-RPC
// lewat stdin, periksa balasan di stdout. Jalankan: `node test/mcp.mjs [proyek]`.
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const project = process.argv[2] || ENGINE;

const child = spawn(process.execPath, [resolve(ENGINE, 'bin/dyalisis.mjs'), 'serve', '--mcp'], {
  cwd: project, stdio: ['pipe', 'pipe', 'inherit']
});

let failures = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  (${detail})`}`);
  if (!cond) failures++;
};

// Kumpulkan balasan: baris stdout = satu pesan JSON-RPC.
const pending = [];
let buf = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) { try { pending.push(JSON.parse(line)); } catch { /* abaikan */ } }
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rpc = async (id, method, params) => {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  for (let t = 0; t < 500; t++) {
    const m = pending.find((x) => x.id === id);
    if (m) return m;
    await sleep(10);
  }
  throw new Error(`timeout rpc ${method}`);
};
const callTool = async (id, name, args) => {
  const r = await rpc(id, 'tools/call', { name, arguments: args });
  const text = r.result.content[0].text;
  return { isError: r.result.isError, data: JSON.parse(text) };
};

try {
  const init = await rpc(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  check('mcp: initialize balas serverInfo', init.result.serverInfo.name === 'dyalisis', JSON.stringify(init.result.serverInfo));

  const list = await rpc(2, 'tools/list', {});
  const names = list.result.tools.map((t) => t.name);
  check('mcp: tools/list >= 6 tool', names.length >= 6, String(names.length));
  check('mcp: tools/list memuat graph_summary', names.includes('graph_summary'), names.join(','));

  const sum = await callTool(3, 'graph_summary', {});
  check('mcp: graph_summary punya counts', sum.data.counts && typeof sum.data.counts.features === 'number', JSON.stringify(sum.data.counts));

  const mods = await callTool(4, 'list_modules', {});
  check('mcp: list_modules mengembalikan modul', Array.isArray(mods.data) && mods.data.length >= 1, String(mods.data.length));
  check('mcp: tiap modul punya features', mods.data.every((m) => Array.isArray(m.features)), 'ok');

  const god = sum.data.godNodes && sum.data.godNodes[0];
  if (god) {
    const node = await callTool(5, 'get_node', { id: god.id });
    check('mcp: get_node mengembalikan label + children', node.data.id === god.id && Array.isArray(node.data.children), JSON.stringify(node.data.id));
  } else {
    check('mcp: get_node (dilewati, tak ada godNode)', true);
  }

  const search = await callTool(6, 'search_nodes', { query: 'p' });
  check('mcp: search_nodes mengembalikan array', Array.isArray(search.data), 'ok');

  const flow = await callTool(7, 'trace_flow', { from: god ? god.id : 'x' });
  check('mcp: trace_flow balas reachable/path', 'reachable' in flow.data || 'path' in flow.data || 'error' in flow.data, JSON.stringify(Object.keys(flow.data)));

  const miss = await callTool(8, 'get_node', { id: '__tidak_ada__' });
  check('mcp: get_node id tak ada → isError', miss.isError === true, String(miss.isError));

  const notes = await callTool(9, 'get_notes', {});
  check('mcp: get_notes mengembalikan objek', notes.data && typeof notes.data === 'object', 'ok');
} catch (err) {
  console.error('ERROR:', err.message);
  failures++;
} finally {
  child.kill();
}

console.log(failures === 0 ? '\nMCP tests passed.' : `\n${failures} MCP test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);