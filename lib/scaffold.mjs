// Dyalisis scaffolder — `dyalisis init [dir]` menyiapkan proyek content baru.
// Non-destruktif: folder tujuan harus kosong (atau --force untuk menimpa).
// Engine tetap di paket npm; proyek hanya berisi content + kontrak agent.
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const AGENTS = (name) => `# ${name} — content Dyalisis

Proyek ini **hanya content**; engine-nya paket npm \`dyalisis\` (framework umum).
Isi \`dyalisis.content.js\` sesuai kontrak di \`.claude/skills/dyalisis/SKILL.md\`.

\`\`\`bash
npm install
npx dyalisis test     # validasi content (semua check harus PASS)
npx dyalisis build    # → dist/index.html (single-file, offline)
\`\`\`
`;

const README = (name) => `# ${name}

Visualisasi feature-analysis (hierarki Aplikasi → Modul → Fitur → Aksi) yang
dibangun dengan framework [Dyalisis](../../../dyalisis). Content ada di
\`dyalisis.content.js\`; sunting lalu \`npx dyalisis build\`.
`;

export function scaffold({ engineDir, dir, force = false }) {
  const target = resolve(process.cwd(), dir || 'dyalisis-app');
  if (existsSync(target) && readdirSync(target).length && !force) {
    throw new Error(`Folder ${target} tidak kosong — pakai --force untuk menimpa.`);
  }
  mkdirSync(target, { recursive: true });
  const name = basename(target);

  // Content awal = contoh generik yang di-ship paket; sunting sesuai aplikasi.
  copyFileSync(resolve(engineDir, 'src/data/example.js'), resolve(target, 'dyalisis.content.js'));

  writeFileSync(resolve(target, 'package.json'), JSON.stringify({
    name, version: '0.1.0', private: true, type: 'module',
    scripts: { build: 'dyalisis build', test: 'dyalisis test' },
    dependencies: { dyalisis: '^0.1.0' }
  }, null, 2) + '\n');
  writeFileSync(resolve(target, '.gitignore'), 'node_modules/\ndist/\n.dyalisis-tmp/\n');
  writeFileSync(resolve(target, 'AGENTS.md'), AGENTS(name));
  writeFileSync(resolve(target, 'README.md'), README(name));

  // Salin kontrak agent supaya AI langsung tahu cara mengisi content.
  const skillDir = resolve(target, '.claude/skills/dyalisis');
  mkdirSync(skillDir, { recursive: true });
  copyFileSync(resolve(engineDir, '.claude/skills/dyalisis/SKILL.md'), resolve(skillDir, 'SKILL.md'));

  console.log(`[dyalisis] proyek dibuat di ${target}`);
  console.log('  1) npm install');
  console.log('  2) sunting dyalisis.content.js (lihat AGENTS.md / SKILL.md)');
  console.log('  3) npx dyalisis build  → dist/index.html');
}