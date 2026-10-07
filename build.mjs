// Dyalisis build — compile engine (paket) + content (proyek) menjadi SATU file
// HTML mandiri (CSS + JS inline). Engine diambil dari direktori paket ini;
// content dari proyek pemakai (default ./dyalisis.content.js, atau --content).
//   node build.mjs [--content <file>] [--out <file>]
// Dipakai juga sebagai library oleh bin/dyalisis.mjs.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { patchElk } from './lib/patch-elk.mjs';
import { toGraphJson } from './src/lib/analysis.js';

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
const requireFromEngine = createRequire(pathToFileURL(resolve(ENGINE_DIR, 'package.json')));
const depDir = (name) => dirname(requireFromEngine.resolve(`${name}/package.json`));

// Content default: file proyek `dyalisis.content.js` kalau ada; jika tidak,
// jatuh ke content demo (example.js) yang ikut di-ship bersama paket.
export function resolveContentFile(projectDir, explicit) {
  if (explicit) return resolve(projectDir, explicit);
  const local = resolve(projectDir, 'dyalisis.content.js');
  return existsSync(local) ? local : resolve(ENGINE_DIR, 'src/data/example.js');
}

/** Build engine + content → satu file HTML mandiri. */
export async function buildDyalisis({ engineDir = ENGINE_DIR, projectDir = process.cwd(), content, out } = {}) {
  const CONTENT = resolveContentFile(projectDir, content);
  const OUT = out ? resolve(projectDir, out) : resolve(projectDir, 'dist/index.html');
  const tmp = resolve(projectDir, '.dyalisis-tmp');
  mkdirSync(tmp, { recursive: true });

  console.log(`[dyalisis] content : ${CONTENT}`);
  console.log(`[dyalisis] output  : ${OUT}`);
  patchElk(projectDir);

  // 1. Bundle engine. Content di-alias `@dyalisis/content` supaya paket tetap
  //    read-only — tak ada file generated yang ditulis ke node_modules.
  await build({
    entryPoints: [resolve(engineDir, 'src/index.jsx')],
    outfile: resolve(tmp, 'bundle.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020', 'chrome90', 'firefox90', 'safari14'],
    alias: {
      '@dyalisis/content': CONTENT,
      // cytoscape-elk meng-require("elkjs") → entry Node memakai worker fallback
      // browser. Paksa ke elk.bundled.js (single-file, tanpa worker).
      elkjs: resolve(depDir('elkjs'), 'lib/elk.bundled.js')
    },
    logLevel: 'info'
  });

  // 2. Tailwind: scan JSX engine + template → CSS.
  const tailwindCli = resolve(depDir('tailwindcss'), 'lib/cli.js');
  execSync(
    `node "${tailwindCli}" -i "${resolve(engineDir, 'src/styles.css')}" ` +
    `-o "${resolve(tmp, 'styles.css')}" --minify`,
    { stdio: 'inherit', cwd: engineDir }
  );

  // 3. Inline CSS+JS ke template → output final.
  const template = readFileSync(resolve(engineDir, 'template.html'), 'utf8');
  const css = readFileSync(resolve(tmp, 'styles.css'), 'utf8');
  const js = readFileSync(resolve(tmp, 'bundle.js'), 'utf8');
  mkdirSync(dirname(OUT), { recursive: true });
  const html = template
    .replace('<!--DYALISIS_CSS-->', () => `<style>${css}</style>`)
    .replace('<!--DYALISIS_JS-->', () => `<script>${js}<\/script>`)
    .replace('DYALISIS_APP_NAME', () => {
      try {
        const raw = readFileSync(CONTENT, 'utf8');
        const m = /export const APP\s*=\s*\{[^}]*name:\s*['"]([^'"]+)['"]/.exec(raw);
        return m ? m[1] : 'Dyalisis';
      } catch { return 'Dyalisis'; }
    });
  writeFileSync(OUT, html);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`[dyalisis] DONE → ${OUT} (${(html.length / 1024).toFixed(0)} KB)`);

  // 4. Export graph.json (model ternormalisasi + analisis) di samping HTML.
  //    Dipakai untuk re-query tanpa browser, diff antar-build, dan server MCP.
  const C = await import(pathToFileURL(CONTENT).href);
  const GRAPH_OUT = resolve(dirname(OUT), 'graph.json');
  writeFileSync(GRAPH_OUT, JSON.stringify(toGraphJson(C), null, 2) + '\n');
  console.log(`[dyalisis] graph   : ${GRAPH_OUT}`);
}

// CLI: `node build.mjs [--content f] [--out f]` (dipakai di repo engine).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flagValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  await buildDyalisis({ content: flagValue('--content'), out: flagValue('--out') });
}