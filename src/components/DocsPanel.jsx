import * as React from 'react';
import { Button, Badge } from './ui.jsx';
import { IconClose } from './icons.jsx';
import { cn } from '../lib/utils.js';

// Panel Dokumentasi — kerangka arsitektur standar (C4, arc42, ADR, Diátaxis)
// diturunkan dari content. Content-agnostic; `DECISIONS` opsional.

// Pemetaan 4 level Dyalisis ke C4 Model.
const C4 = [
  { lv: 0, code: 'Context',   level: 'Aplikasi', desc: 'Sistem dalam lingkungan pemakainya.' },
  { lv: 1, code: 'Container', level: 'Modul',    desc: 'Domain fungsional / unit yang dapat dipakai.' },
  { lv: 2, code: 'Component', level: 'Fitur',    desc: 'Komponen di dalam modul.' },
  { lv: 3, code: 'Code',      level: 'Aksi',     desc: 'Detail operasi / route.' },
];

// Empat jenis dokumentasi Diátaxis, dipetakan ke level.
const DIATAXIS = [
  { kind: 'Tutorial',    scope: 'L0-L1', use: 'Orientasi awal — mulai dari mana.' },
  { kind: 'How-to',      scope: 'L2',    use: 'Langkah menyelesaikan tugas konkret.' },
  { kind: 'Reference',   scope: 'L2',    use: 'Katalog field, route, permission.' },
  { kind: 'Explanation', scope: 'L1-L3', use: 'Alasan desain, relasi, dan alur.' },
];

const ADR_STATUS = {
  proposed:   'border-amber-500/60 text-amber-600 dark:text-amber-400',
  accepted:   'border-emerald-500/60 text-emerald-600 dark:text-emerald-400',
  rejected:   'border-rose-500/60 text-rose-600 dark:text-rose-400',
  deprecated: 'border-slate-500/60 text-slate-500 dark:text-slate-400',
};

function Section({ title, hint, children }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide">{title}</h3>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// Drawer dokumentasi arsitektur. Content-agnostic: C4/arc42/diátaxis diturunkan
// dari content; ADR dari array `DECISIONS` (opsional, lihat content contract).
export default function DocsPanel({ app = {}, modules = [], features = [], actions = [], edges = [], domains = {}, decisions = [], onClose }) {
  const counts = [1, modules.length, features.length, actions.length];
  const domainCount = Object.keys(domains).length;
  const edgeEnds = new Set();
  edges.forEach(([s, t]) => { edgeEnds.add(s); edgeEnds.add(t); });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Dokumentasi arsitektur">
      <div className="no-scrollbar flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Dokumentasi Arsitektur</h2>
            <p className="text-[11px] text-muted-foreground">{app.name || 'Dyalisis'} — kerangka C4 · arc42 · ADR · Diátaxis</p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} title="Tutup"><IconClose /></Button>
        </header>

        <Section title="C4 Model" hint="pemetaan level">
          <div className="space-y-1">
            {C4.map((c) => (
              <div key={c.lv} className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold text-primary">{c.lv}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{c.code} <span className="font-normal text-muted-foreground">· {c.level}</span></p>
                  <p className="truncate text-[10px] text-muted-foreground">{c.desc}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">{counts[c.lv]}</Badge>
              </div>
            ))}
          </div>
        </Section>

        <Section title="arc42" hint="outline relevan">
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            <li><b className="text-foreground">1 · Intro &amp; Goals</b> — {app.subtitle || 'tujuan sistem'}</li>
            <li><b className="text-foreground">3 · Context &amp; Scope</b> — {modules.length} modul, {domainCount} domain</li>
            <li><b className="text-foreground">5 · Building Blocks</b> — {features.length} fitur, {actions.length} aksi</li>
            <li><b className="text-foreground">6 · Runtime View</b> — {edges.length} relasi data antar fitur</li>
            <li><b className="text-foreground">8 · Crosscutting</b> — permission, route, warna domain</li>
          </ul>
        </Section>

        <Section title="ADR" hint={decisions.length ? `${decisions.length} keputusan` : 'opsional'}>
          {decisions.length ? (
            <div className="space-y-1.5">
              {decisions.map((dd, i) => (
                <div key={i} className="rounded border bg-muted/20 p-2">
                  <div className="mb-0.5 flex items-center gap-2">
                    <Badge variant="outline" className={cn('text-[9px] uppercase', ADR_STATUS[dd.status] || '')}>{dd.status || 'proposed'}</Badge>
                    <span className="truncate text-xs font-medium">{dd.title}</span>
                  </div>
                  {dd.context && <p className="text-[10px] leading-snug text-muted-foreground"><b>Konteks:</b> {dd.context}</p>}
                  {dd.decision && <p className="text-[10px] leading-snug text-muted-foreground"><b>Keputusan:</b> {dd.decision}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Belum ada ADR. Tambahkan array <code className="rounded bg-muted px-1">DECISIONS</code> ke content
              (<code className="rounded bg-muted px-1">{'{ title, status, context, decision }'}</code>).
            </p>
          )}
        </Section>

        <Section title="Diátaxis" hint="cara menulis">
          <div className="space-y-1">
            {DIATAXIS.map((dd) => (
              <div key={dd.kind} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 shrink-0 font-medium">{dd.kind}</span>
                <code className="shrink-0 rounded bg-muted px-1 text-[10px]">{dd.scope}</code>
                <span className="truncate text-muted-foreground">{dd.use}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
