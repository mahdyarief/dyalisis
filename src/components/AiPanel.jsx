import * as React from 'react';
import { Button } from './ui.jsx';
import { IconClose, IconSparkle, IconCopy, IconCheck } from './icons.jsx';

// Panel Integrasi AI — bantu user memberi agent link machine-readable
// (.md / .json / llms.txt / mcp). URL di-derive dari location saat runtime
// (slug baru diketahui setelah dipublikasikan), jadi panel ikut ke mana pun
// file single-file ini disajikan. Saat dibuka offline (file://), panel
// menjelaskan bahwa endpoint baru aktif setelah `dyalisis publish`.

const ROWS = [
  { key: 'md',   label: 'Dokumentasi (Markdown)', hint: 'brief · goals · workflow · entitas · ERD', suffix: '.md' },
  { key: 'json', label: 'Struktur (JSON)',        hint: 'graph.json — node, edge, analisis',        suffix: '.json' },
  { key: 'llms', label: 'Indeks (llms.txt)',      hint: 'konvensi llmstxt.org — pintu masuk agent', suffix: '/llms.txt' },
  { key: 'mcp',  label: 'MCP endpoint',           hint: '6 tool graf via JSON-RPC (POST)',          suffix: '/mcp' },
];

// Basis URL publik di-derive dari location; null bila dibuka offline (file://).
function publishedBase() {
  if (typeof window === 'undefined') return null;
  const { protocol, origin, pathname } = window.location;
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  const p = pathname.replace(/\/index\.html?$/i, '').replace(/\/+$/, '');
  if (!p) return null; // root = bukan halaman publikasi
  return origin + p;
}

// Salin ke clipboard + fallback execCommand (Clipboard API butuh secure context).
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* jatuh ke fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function CopyButton({ text, label }) {
  const [done, setDone] = React.useState(false);
  const onClick = async () => {
    const ok = await copyText(text);
    if (ok) { setDone(true); setTimeout(() => setDone(false), 1400); }
  };
  return (
    <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 px-2 text-[11px]"
      onClick={onClick} title={`Salin ${label}`}>
      {done ? <IconCheck className="size-3 text-emerald-500" /> : <IconCopy className="size-3" />}
      <span className="hidden sm:inline">{done ? 'Tersalin' : 'Salin'}</span>
    </Button>
  );
}

export default function AiPanel({ app = {}, onClose }) {
  const base = publishedBase();
  const rows = ROWS.map((r) => ({ ...r, url: base ? base + r.suffix : null }));
  const prompt = base
    ? `Pelajari dokumentasi fitur aplikasi "${app.name || 'aplikasi ini'}" dari ${base}.md, `
      + 'lalu gunakan sebagai referensi untuk pengembangan.'
    : null;

  return (
    <div className="anim-backdrop-in fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Integrasi AI">
      <div className="anim-drawer-in flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <IconSparkle className="mt-0.5 size-4 text-primary" />
            <div>
              <h2 className="text-sm font-semibold leading-tight">Integrasi AI</h2>
              <p className="text-[11px] text-muted-foreground">
                {app.name || 'Dyalisis'} — sumber machine-readable untuk agent / LLM
              </p>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} title="Tutup"><IconClose /></Button>
        </header>

        {base ? (
          <>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Beri agent salah satu link berikut. Menambahkan <code className="rounded bg-muted px-1">.md</code> ke
              URL publik adalah pintu masuk paling ringkas.
            </p>
            <div className="space-y-1.5">
              {rows.map((r) => (
                <div key={r.key} className="rounded border bg-muted/20 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{r.label}</span>
                    <CopyButton text={r.url} label={r.label} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{r.hint}</p>
                  <code className="mt-0.5 block truncate text-[10px] text-foreground/80" title={r.url}>{r.url}</code>
                </div>
              ))}
            </div>
            <div className="rounded border bg-muted/20 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">Prompt siap pakai</span>
                <CopyButton text={prompt} label="prompt" />
              </div>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{prompt}</p>
            </div>
          </>
        ) : (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Panel ini aktif saat dokumen dipublikasikan (<code className="rounded bg-muted px-1">dyalisis publish</code>).
            Setelah itu URL <code className="rounded bg-muted px-1">.md</code>,{' '}
            <code className="rounded bg-muted px-1">.json</code>,{' '}
            <code className="rounded bg-muted px-1">/llms.txt</code>, dan{' '}
            <code className="rounded bg-muted px-1">/mcp</code> untuk agent akan tampil di sini.
          </p>
        )}
      </div>
    </div>
  );
}