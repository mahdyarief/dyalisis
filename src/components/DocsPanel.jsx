import * as React from 'react';
import { Button, Badge } from './ui.jsx';
import { IconClose } from './icons.jsx';
import { cn } from '../lib/utils.js';

// Panel Dokumentasi — kerangka arsitektur standar (C4, arc42, ADR, Diátaxis)
// diturunkan dari content. Content-agnostic: tiap seksi punya default yang
// dihitung dari data; content boleh menimpa narasi via `ARC42`, `GLOSSARY`,
// dan `DOCS` (semua opsional).

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

// 12 seksi arc42 standar.
const ARC42_SECTIONS = [
  { no: 1,  title: 'Intro & Goals' },
  { no: 2,  title: 'Constraints' },
  { no: 3,  title: 'Context & Scope' },
  { no: 4,  title: 'Solution Strategy' },
  { no: 5,  title: 'Building Blocks' },
  { no: 6,  title: 'Runtime View' },
  { no: 7,  title: 'Deployment' },
  { no: 8,  title: 'Crosscutting' },
  { no: 9,  title: 'Decisions (ADR)' },
  { no: 10, title: 'Quality' },
  { no: 11, title: 'Risks & Debt' },
  { no: 12, title: 'Glossary' },
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

// Satu baris arc42: nomor + judul + ringkasan (opsional).
function ArcRow({ no, title, body }) {
  return (
    <li className="flex gap-2 text-[11px]">
      <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded bg-muted text-[9px] font-semibold text-muted-foreground">{no}</span>
      <span className="min-w-0 leading-snug">
        <b className="text-foreground">{title}</b>
        {body ? <span className="text-muted-foreground"> — {body}</span> : null}
      </span>
    </li>
  );
}

// Drawer dokumentasi arsitektur. Content-agnostic: nilai arc42 & Diátaxis
// dihitung dari data; content boleh menimpanya lewat `ARC42`/`GLOSSARY`/`DOCS`.
export default function DocsPanel({
  app = {}, modules = [], features = [], actions = [], edges = [], domains = {},
  decisions = [], arc42 = [], glossary = [], docs = [], onClose
}) {
  const counts = [1, modules.length, features.length, actions.length];
  const domainCount = Object.keys(domains).length;
  const labelOf = (id) => { const f = features.find((x) => x.id === id); return f ? f.label : id; };

  // ===== arc42: 12 seksi. Default dihitung dari data; `ARC42` menimpa per nomor.
  const override = (no) => { const s = arc42.find((x) => x.no === no); return s && s.body ? s.body : null; };
  const derived = {
    1: app.subtitle || null,
    2: Array.isArray(app.constraints) ? app.constraints.join(' · ') : (app.constraints || null),
    3: `${modules.length} modul · ${domainCount} domain`,
    4: app.strategy || null,
    5: `${features.length} fitur · ${actions.length} aksi`,
    6: `${edges.length} relasi data antar fitur`,
    7: app.deployment || null,
    8: app.crosscutting || null,
    9: decisions.length ? `${decisions.length} keputusan` : null,
    10: app.quality || null,
    11: app.risks || null,
    12: glossary.length ? `${glossary.length} istilah` : null,
  };
  const arcRows = ARC42_SECTIONS.map((s) => ({ ...s, body: override(s.no) ?? derived[s.no] }));

  // ===== Diátaxis: artefak nyata diturunkan dari data; `DOCS` menimpa per kind.
  const fieldSet = new Set();
  features.forEach((f) => {
    if (!f.fields) return;
    String(f.fields).split(',').forEach((s) => { const t = s.trim(); if (t) fieldSet.add(t); });
  });
  const derivedDocs = {
    Tutorial: modules.slice(0, 6).map((m) => m.label),
    'How-to': features.filter((f) => f.route).slice(0, 6).map((f) => `${f.label} — ${f.route}`),
    Reference: [
      `${features.length} fitur`,
      `${fieldSet.size} field kunci`,
      `${features.filter((f) => f.perm).length} fitur ber-permission`,
      `${edges.length} relasi data`,
    ],
    Explanation: edges.slice(0, 6).map(([s, t, f]) => `${labelOf(s)} → ${labelOf(t)} (${f})`),
  };
  const docsOf = (kind) => {
    const o = docs.find((d) => d.kind === kind);
    return (o && o.items && o.items.length) ? o.items : (derivedDocs[kind] || []);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Dokumentasi arsitektur">
      <div className="no-scrollbar flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Dokumentasi Arsitektur</h2>
            <p className="text-[11px] text-muted-foreground">{app.name || 'Dyalisis'} — C4 · arc42 · ADR · Diátaxis</p>
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

        <Section title="arc42" hint="12 seksi">
          <ul className="space-y-1">
            {arcRows.map((r) => <ArcRow key={r.no} no={r.no} title={r.title} body={r.body} />)}
          </ul>
        </Section>

        {glossary.length > 0 && (
          <Section title="Glosarium" hint={`${glossary.length} istilah`}>
            <dl className="space-y-1 text-[11px]">
              {glossary.map((g, i) => (
                <div key={i} className="flex gap-2">
                  <dt className="w-24 shrink-0 truncate font-medium text-foreground">{g.term}</dt>
                  <dd className="min-w-0 leading-snug text-muted-foreground">{g.definition}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

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

        <Section title="Diátaxis" hint="artefak dari data">
          <div className="space-y-2">
            {DIATAXIS.map((dd) => {
              const items = docsOf(dd.kind);
              return (
                <div key={dd.kind} className="rounded border bg-muted/20 p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-medium">{dd.kind}</span>
                    <code className="rounded bg-muted px-1 text-[10px]">{dd.scope}</code>
                    <span className="truncate text-[10px] text-muted-foreground">{dd.use}</span>
                  </div>
                  {items.length ? (
                    <ul className="space-y-0.5 text-[10px] text-muted-foreground">
                      {items.map((it, i) => <li key={i} className="truncate">· {it}</li>)}
                    </ul>
                  ) : <p className="text-[10px] text-muted-foreground">—</p>}
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </div>
  );
}
