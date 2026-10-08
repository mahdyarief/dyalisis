// Dyalisis MCP server — graf fitur sebagai tool MCP via stdio (JSON-RPC 2.0).
// Protokol minimal di atas pesan JSON newline-delimited. Dipakai oleh
// `dyalisis serve --mcp` supaya agent bisa meng-query graf fitur tanpa membuka
// HTML: ringkasan analisis, daftar modul, detail node, catatan, pencarian, dan
// penelusuran alur pada DATA_EDGES.
//
// Logika tool tinggal di lib/graph-tools.mjs (operasi murni atas graph.json)
// supaya transport stdio dan HTTP mengekspos tool yang identik. Di sini kita
// cukup membangun graph.json dari content lalu meneruskan pesan ke handleMessage.
import { pathToFileURL } from 'node:url';
import { resolveContentFile } from '../build.mjs';
import { toGraphJson } from '../src/lib/analysis.js';
import { handleMessage } from './graph-tools.mjs';

/** Muat content proyek (resolusi sama seperti build) → graph.json ternormalisasi. */
async function loadGraph(projectDir, content) {
  const file = resolveContentFile(projectDir, content);
  const C = await import(pathToFileURL(file).href);
  return { file, graph: toGraphJson(C) };
}

/** Jalankan server MCP di atas stdio (newline-delimited JSON). */
export async function startMcp({ projectDir = process.cwd(), content } = {}) {
  const { file, graph } = await loadGraph(projectDir, content);
  process.stderr.write(`[dyalisis] MCP server — content: ${file}\n`);
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
      const reply = handleMessage(graph, msg);
      if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
    }
  });
  process.stdin.on('end', () => process.exit(0));
}