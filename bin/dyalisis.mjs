#!/usr/bin/env node
// Dyalisis CLI — `npx dyalisis <init|build|test>`.
//   init [dir]        scaffold proyek content baru (default ./dyalisis-app)
//   build [--content f] [--out f]   build → single-file HTML
//   test  [--content f]             validasi content (headless)
// Engine & build tool hidup di paket ini; content hidup di proyek pemakai.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENGINE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const flagValue = (args, name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const HELP = `dyalisis — feature-analysis visualization framework

Pemakaian:
  npx dyalisis init [dir]                  scaffold proyek content baru
  npx dyalisis build [--content f] [--out f]   build → dist/index.html
  npx dyalisis test  [--content f]             validasi content (headless)

Alur: init → sunting dyalisis.content.js → test → build.`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === 'init') {
    const { scaffold } = await import(pathToFileURL(resolve(ENGINE_DIR, 'lib/scaffold.mjs')).href);
    scaffold({ engineDir: ENGINE_DIR, dir: rest.find((a) => !a.startsWith('-')), force: rest.includes('--force') });
    return;
  }

  if (cmd === 'build') {
    const { buildDyalisis } = await import(pathToFileURL(resolve(ENGINE_DIR, 'build.mjs')).href);
    await buildDyalisis({ content: flagValue(rest, '--content'), out: flagValue(rest, '--out') });
    return;
  }

  if (cmd === 'test') {
    const res = spawnSync(process.execPath, [resolve(ENGINE_DIR, 'test/run.mjs'), ...rest], { stdio: 'inherit' });
    process.exit(res.status ?? 1);
  }

  console.log(HELP);
  process.exit(cmd && cmd !== 'help' ? 1 : 0);
}

await main();