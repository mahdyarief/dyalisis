// Panel Insight — analisis turunan graf fitur (hub/chokepoint, coupling
// lintas-modul, fitur terisolasi). Ditampilkan saat tak ada node terpilih.
// Datanya dari src/lib/analysis.js (isomorphic — sama yang mengisi graph.json).
import * as React from 'react';

const Stat = ({ label, value }) => (
  <div className="rounded-md border bg-muted/40 px-1.5 py-1.5 text-center">
    <div className="text-sm font-semibold tabular-nums">{value}</div>
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
  </div>
);

export default function InsightPanel({ analysis, domains, byId, onSelect }) {
  if (!analysis) return null;
  const { counts, godNodes, crossModule, isolated } = analysis;
  const labelOf = (id) => (byId[id] ? byId[id].label : id);
  const colorOf = (id) => ((domains[(byId[id] || {}).domain] || {}).color) || '#94a3b8';

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Turunan otomatis dari graf relasi data — bukan taksonomi yang ditulis manual.
        <b> Hub</b> menandai fitur paling banyak dihubungkan (chokepoint);
        <b> coupling</b> menandai relasi yang melintasi batas modul.
      </p>

      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="modul" value={counts.modules} />
        <Stat label="fitur" value={counts.features} />
        <Stat label="aksi" value={counts.actions} />
        <Stat label="relasi" value={counts.dataEdges} />
        <Stat label="catatan" value={counts.notes} />
        <Stat label="hub" value={godNodes.length} />
      </div>

      {godNodes.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Hub / chokepoint (derajat tertinggi)
          </p>
          <div className="space-y-1">
            {godNodes.map((g) => (
              <button key={g.id} onClick={() => onSelect(g.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(g.id) }} />
                <span className="flex-1 truncate">{g.label}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" title="masuk / keluar · total">
                  {g.in}/{g.out} · {g.total}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {crossModule.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Coupling lintas-modul ({crossModule.length})
          </p>
          <div className="space-y-1">
            {crossModule.map((e, i) => (
              <button key={i} onClick={() => onSelect(e.source)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-muted">
                <span className="min-w-0 flex-1 truncate">{labelOf(e.source)}</span>
                <span className="shrink-0 text-muted-foreground">&rarr;</span>
                <span className="min-w-0 flex-1 truncate">{labelOf(e.target)}</span>
                <code className="shrink-0 text-[10px] text-muted-foreground">{e.field}</code>
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] italic text-muted-foreground">
            Relasi yang keluar dari modul asalnya — kandidat coupling tersembunyi.
          </p>
        </div>
      )}

      {isolated.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Fitur terisolasi ({isolated.length})
          </p>
          <div className="space-y-1">
            {isolated.map((n) => (
              <button key={n.id} onClick={() => onSelect(n.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(n.id) }} />
                <span className="flex-1 truncate">{n.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] italic text-muted-foreground">
            Fitur tanpa relasi data — mungkin belum dipetakan, atau memang berdiri sendiri.
          </p>
        </div>
      )}
    </div>
  );
}