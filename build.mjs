// Dyalisis build — compile engine (paket) + content (proyek) menjadi SATU file
// HTML mandiri (CSS + JS inline). Engine diambil dari direktori paket ini;
// content dari proyek pemakai (default ./dyalisis.content.js, atau --content).
//   node build.mjs [--content <file>] [--spec <dir>] [--out <file>]
// `--spec <dir>` men-generate content dari spec Markdown 4-aksis (lihat
// lib/spec.mjs) alih-alih file content. Dipakai juga sebagai library oleh
// bin/dyalisis.mjs.
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

// Serialisasi objek content → modul ES statis (tanpa import Node apa pun),
// supaya parser spec TIDAK ikut ter-bundle ke dalam HTML single-file.
function serializeContent(C) {
  const json = (v) => JSON.stringify(v, null, 2);
  return [
    '// GENERATED dari spec Markdown — jangan disunting manual.',
    `export const APP = ${json(C.APP)};`,
    `export const DOMAINS = ${json(C.DOMAINS)};`,
    `export const ROOT = ${json(C.ROOT)};`,
    `export const MODULES = ${json(C.MODULES)};`,
    `export const NODES = ${json(C.NODES)};`,
    `export const ACTIONS = ${json(C.ACTIONS)};`,
    `export const EDGES = ${json(C.EDGES)};`,
    `export const DATA_EDGES = ${json(C.DATA_EDGES)};`,
    `export const LEVELS = ${json(C.LEVELS)};`,
    `export const LEVEL_NAMES = ${json(C.LEVEL_NAMES)};`,
    'export const levelOf = (id) => { for (const k in LEVELS) if (LEVELS[k].includes(id)) return +k; return 0; };',
    ''
  ].join('\n');
}

/** Build engine + content → satu file HTML mandiri. */
export async function buildDyalisis({ engineDir = ENGINE_DIR, projectDir = process.cwd(), content, spec, appName, out } = {}) {
  const OUT = out ? resolve(projectDir, out) : resolve(projectDir, 'dist/index.html');
  const tmp = resolve(projectDir, '.dyalisis-tmp');
  mkdirSync(tmp, { recursive: true });

  // Bila --spec diberikan: parse spec → tulis content statis sementara, lalu
  // pakai file itu sebagai content. Parser hanya jalan di Node (build time).
  let CONTENT;
  let generatedSpec = null;
  if (spec) {
    const { parseSpecDir } = await import('./lib/spec.mjs');
    const C = parseSpecDir(resolve(projectDir, spec), { appName });
    if (!C.MODULES.length) throw new Error(`[dyalisis] --spec: tak ada modul ter-parse di ${spec}`);
    generatedSpec = resolve(projectDir, '.dyalisis-spec.content.mjs');
    writeFileSync(generatedSpec, serializeContent(C));
    CONTENT = generatedSpec;
  } else {
    CONTENT = resolveContentFile(projectDir, content);
  }

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

  // 3. Import content sekali — dipakai untuk nama app (<title>) dan graph.json.
  //    Membaca modul jauh lebih andal daripada regex atas source, yang gagal
  //    pada key ber-quote hasil JSON.stringify (`"name":`).
  const C = await import(pathToFileURL(CONTENT).href);
  const APP_NAME = C.APP?.name || 'Dyalisis';

  // 4. Inline CSS+JS ke template → output final.
  const template = readFileSync(resolve(engineDir, 'template.html'), 'utf8');
  const css = readFileSync(resolve(tmp, 'styles.css'), 'utf8');
  const js = readFileSync(resolve(tmp, 'bundle.js'), 'utf8');
  mkdirSync(dirname(OUT), { recursive: true });
  const html = template
    .replace('<!--DYALISIS_CSS-->', () => `<style>${css}</style>`)
    .replace('<!--DYALISIS_JS-->', () => `<script>${js}<\/script>`)
    .replace('DYALISIS_APP_NAME', () => APP_NAME);
  writeFileSync(OUT, html);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`[dyalisis] DONE → ${OUT} (${(html.length / 1024).toFixed(0)} KB)`);

  // 5. Export graph.json (model ternormalisasi + analisis) di samping HTML.
  //    Dipakai untuk re-query tanpa browser, diff antar-build, dan server publish.
  const GRAPH_OUT = resolve(dirname(OUT), 'graph.json');
  writeFileSync(GRAPH_OUT, JSON.stringify(toGraphJson(C), null, 2) + '\n');
  console.log(`[dyalisis] graph   : ${GRAPH_OUT}`);

  // Bersihkan content temporer hasil --spec (dipakai sampai graph.json di atas).
  if (generatedSpec) rmSync(generatedSpec, { force: true });
}

// CLI: `node build.mjs [--content f] [--spec dir] [--out f]` (dipakai di repo engine).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flagValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  await buildDyalisis({
    content: flagValue('--content'),
    spec: flagValue('--spec'),
    appName: flagValue('--app-name'),
    out: flagValue('--out')
  });
}