import * as React from 'react';

// Legenda overlay di atas graph: warna domain + bentuk level + edge data.
// pointer-events-auto karena container graph memakai default (bisa menerima event).
export default function Legend({ domains, showActions, appBorder = '#38bdf8',
  flowActive = false, notedCount = 0, highlight = '#38bdf8', noteColor = '#f472b6' }) {
  // Di layar kecil legenda default terlipat jadi tombol (agar tak menutupi kanvas);
  // di desktop tetap terbuka. State lokal karena Legend murni presentasional.
  const [open, setOpen] = React.useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 640px)').matches);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="pointer-events-auto absolute right-3 top-3 rounded-lg border bg-background/85 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground shadow backdrop-blur">
        Legenda
      </button>
    );
  }
  return (
    <div className="pointer-events-auto absolute right-3 top-3 w-44 rounded-lg border bg-background/85 p-3 text-xs shadow backdrop-blur">
      <button type="button" onClick={() => setOpen(false)}
        className="mb-2 flex w-full items-center justify-between font-semibold text-muted-foreground">
        <span>Legenda</span>
        <span className="text-[10px] leading-none opacity-70">✕</span>
      </button>
      <div className="space-y-1">
        {Object.entries(domains).map(([k, d]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="truncate">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-1 border-t pt-2 text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-sm border-2" style={{ borderColor: appBorder }} />
          <span>Aplikasi (L0)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-sm border-2 border-dashed border-muted-foreground" />
          <span>Modul (L1)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-sm bg-muted-foreground" />
          <span>Fitur (L2)</span>
        </div>
        {showActions && (
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
            <span>Aksi (L3)</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="h-px w-5 shrink-0 bg-muted-foreground" />
          <span>relasi data</span>
        </div>
        {notedCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="relative h-2.5 w-2.5 shrink-0 rounded-sm bg-muted-foreground">
              <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full" style={{ background: noteColor }} />
            </span>
            <span>ada catatan ({notedCount})</span>
          </div>
        )}
      </div>
      {flowActive && (
        <div className="mt-2 space-y-1 border-t pt-2 text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm border-2" style={{ borderColor: highlight }} />
            <span>node jalur Alur</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1 w-5 shrink-0 rounded" style={{ background: highlight }} />
            <span>langkah berurutan</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm border-2 border-foreground shadow" />
            <span>langkah aktif</span>
          </div>
        </div>
      )}
    </div>
  );
}