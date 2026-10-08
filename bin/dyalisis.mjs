#!/usr/bin/env node
// Dyalisis CLI — `npx dyalisis <init|build|test|publish|serve|login|list>`.
//   init [dir]     scaffold proyek content baru (default ./dyalisis-app)
//   build  [--content f] [--spec dir] [--out f]   build → single-file HTML
//   test   [--content f]             validasi content (headless)
//   login <handle> [--url u]         daftar handle → token (disimpan .dyalisisrc.json)
//   publish [--slug nama] [--url u] [--token t] [--overwrite] [--no-build]
//   list   [--remote]                riwayat publish (manifest lokal / server)
//   serve   [--port n] [--data dir] [--token t]   jalankan publish server lokal
//   serve   --mcp [--content f]                   graf fitur sebagai tool MCP (stdio)
// Engine & build tool hidup di paket ini; content hidup di proyek pemakai.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENGINE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lib = (f) => pathToFileURL(resolve(ENGINE_DIR, f)).href;

const flagValue = (args, name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = (args) => args.find((a) => !a.startsWith('-'));

const HELP = `dyalisis — feature-analysis visualization framework

Pemakaian:
  npx dyalisis init [dir]                      scaffold proyek content baru
  npx dyalisis build [--content f] [--spec dir] [--out f]
                                               build → dist/index.html
                                               (--spec: content dari spec Markdown)
  npx dyalisis test  [--content f]             validasi content (headless)
  npx dyalisis login <handle> [--url u]        daftar identitas → simpan token
  npx dyalisis publish [--slug nama] [--url u] [--token t] [--overwrite] [--no-build]
                                               publikasikan → URL publik
  npx dyalisis list [--remote] [--url u]       riwayat publikasi (lokal/server)
  npx dyalisis serve [--port n] [--data dir] [--token t]
                                               jalankan publish server lokal
  npx dyalisis serve --mcp                     ekspos graf fitur sebagai MCP
                                               (stdio) untuk agent

Config publish (mis. .dyalisisrc.json): { "publishUrl", "publishToken", "handle" }
Atau env: DYALISIS_PUBLISH_URL, DYALISIS_TOKEN.

Alur: init → sunting dyalisis.content.js → test → build → login → publish.`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === 'init') {
    const { scaffold } = await import(lib('lib/scaffold.mjs'));
    scaffold({ engineDir: ENGINE_DIR, dir: positional(rest), force: rest.includes('--force') });
    return;
  }

  if (cmd === 'build') {
    const { buildDyalisis } = await import(lib('build.mjs'));
    await buildDyalisis({
      content: flagValue(rest, '--content'),
      spec: flagValue(rest, '--spec'),
      appName: flagValue(rest, '--app-name'),
      out: flagValue(rest, '--out')
    });
    return;
  }

  if (cmd === 'test') {
    const res = spawnSync(process.execPath, [resolve(ENGINE_DIR, 'test/run.mjs'), ...rest], { stdio: 'inherit' });
    process.exit(res.status ?? 1);
  }

  if (cmd === 'login') {
    const { loginDyalisis } = await import(lib('lib/publish.mjs'));
    await loginDyalisis({ handle: positional(rest), url: flagValue(rest, '--url'), token: flagValue(rest, '--token') });
    return;
  }

  if (cmd === 'publish') {
    const { publishDyalisis } = await import(lib('lib/publish.mjs'));
    await publishDyalisis({
      content: flagValue(rest, '--content'),
      out: flagValue(rest, '--out'),
      slug: flagValue(rest, '--slug'),
      url: flagValue(rest, '--url'),
      token: flagValue(rest, '--token'),
      overwrite: rest.includes('--overwrite') || rest.includes('--force'),
      build: !rest.includes('--no-build')
    });
    return;
  }

  if (cmd === 'list') {
    const { listDyalisis } = await import(lib('lib/publish.mjs'));
    await listDyalisis({ url: flagValue(rest, '--url'), token: flagValue(rest, '--token'), remote: rest.includes('--remote') });
    return;
  }

  if (cmd === 'serve') {
    // `serve --mcp` mengekspos graf fitur sebagai tool MCP (stdio) untuk agent;
    // tanpa flag itu, tetap menjalankan publish server HTTP seperti semula.
    if (rest.includes('--mcp')) {
      const { startMcp } = await import(lib('lib/mcp.mjs'));
      await startMcp({ content: flagValue(rest, '--content') });
      return;
    }
    const { startServer } = await import(lib('server/publish-server.mjs'));
    startServer({
      port: flagValue(rest, '--port'),
      dataDir: flagValue(rest, '--data'),
      token: flagValue(rest, '--token')
    });
    return;
  }

  console.log(HELP);
  process.exit(cmd && cmd !== 'help' ? 1 : 0);
}

await main();