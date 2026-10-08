import * as React from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui.jsx';
import { IconClose, IconExpand } from './icons.jsx';
import { parseErd, cardLabel } from '../lib/erd.js';

// ERD (entity-relationship) ringkas untuk modul terpilih — SVG inline,
// theme-aware, tanpa dependency baru (tetap single-file). Sumbernya string
// `erDiagram` Mermaid yang di-parse oleh `parseErd` (isomorphic, dipakai juga
// oleh parser spec di lib/spec.mjs). Pratinjau kecil di sidebar bisa diklik →
// modal perbesar (portal ke <body>).

const BOX_W = 176;
const HDR_H = 26;
const ROW_H = 15;
const BODY_PAD = 6;
const GAP_X = 36;
const GAP_Y = 30;
const PAD = 16;
const MAX_ROWS = 7;

const PALETTE = {
  dark: {
    box: '#0b1220', border: '#334155', name: '#f1f5f9', text: '#94a3b8',
    sep: '#1e293b', line: '#475569', chip: '#0b1220', chipBorder: '#334155',
    chipText: '#cbd5e1', sub: '#64748b', accent: '#7dd3fc', pk: '#fbbf24', fk: '#38bdf8'
  },
  light: {
    box: '#ffffff', border: '#cbd5e1', name: '#0f172a', text: '#475569',
    sep: '#e2e8f0', line: '#94a3b8', chip: '#ffffff', chipBorder: '#cbd5e1',
    chipText: '#1e293b', sub: '#64748b', accent: '#0369a1', pk: '#b45309', fk: '#0369a1'
  }
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function truncate(s, n) {
  const t = String(s == null ? '' : s);
  return t.length > n ? t.slice(0, n - 1) + '\u2026' : t;
}

// Titik pertemuan garis relasi dengan tepi kotak, menuju titik (tx, ty).
function edgePoint(b, tx, ty) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : (b.w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (b.h / 2) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

// SVG inti — dipakai pratinjau sidebar maupun modal perbesar.
function ErdSvg({ erd, domains, domain, theme, uid }) {
  const P = PALETTE[theme] || PALETTE.dark;
  const color = (domains[domain] || {}).color || P.accent;
  const model = React.useMemo(() => parseErd(erd), [erd]);
  const ents = model.entities;
  if (!ents.length) return null;

  const boxes = ents.map((e) => {
    const shown = Math.min(e.attrs.length, MAX_ROWS);
    const extra = e.attrs.length > MAX_ROWS ? 1 : 0;
    return { e, h: HDR_H + BODY_PAD * 2 + (shown + extra) * ROW_H, shown, extra };
  });

  const n = boxes.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const rowH = [];
  for (let r = 0; r < rows; r++) {
    let mh = 0;
    for (let c = 0; c < cols; c++) { const i = r * cols + c; if (i < n) mh = Math.max(mh, boxes[i].h); }
    rowH.push(mh);
  }
  const W = PAD * 2 + cols * BOX_W + (cols - 1) * GAP_X;
  const H = PAD * 2 + rowH.reduce((a, b) => a + b, 0) + (rows - 1) * GAP_Y;

  const pos = {};
  let yy = PAD;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (i >= n) continue;
      pos[boxes[i].e.name] = { x: PAD + c * (BOX_W + GAP_X), y: yy, w: BOX_W, h: boxes[i].h };
    }
    yy += rowH[r] + GAP_Y;
  }

  const many = (c) => /N/.test(cardLabel(c));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="ERD modul">
      <defs>
        <marker id={`erd-one-${uid}`} viewBox="0 0 12 12" refX="6" refY="6"
          markerWidth="11" markerHeight="11" orient="auto-start-reverse">
          <path d="M6 1 V11" stroke={P.line} strokeWidth="1.5" fill="none" />
        </marker>
        <marker id={`erd-many-${uid}`} viewBox="0 0 12 12" refX="11" refY="6"
          markerWidth="12" markerHeight="12" orient="auto-start-reverse">
          <path d="M11 6 L2 1 M11 6 L2 11 M11 6 L0 6" stroke={P.line} strokeWidth="1.4" fill="none" />
        </marker>
      </defs>

      {model.relations.map((r, i) => {
        const a = pos[r.from], b = pos[r.to];
        if (!a || !b) return null;
        const p1 = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2);
        const p2 = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2);
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        const mk1 = many(r.fromCard) ? `erd-many-${uid}` : `erd-one-${uid}`;
        const mk2 = many(r.toCard) ? `erd-many-${uid}` : `erd-one-${uid}`;
        const lbl = r.label ? truncate(r.label, 16) : '';
        const lw = lbl ? lbl.length * 5.4 + 10 : 0;
        return (
          <g key={i}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={P.line} strokeWidth="1.2"
              markerStart={`url(#${mk1})`} markerEnd={`url(#${mk2})`}
              strokeDasharray={r.identifying ? undefined : '4 3'} />
            {lbl && (
              <>
                <rect x={mx - lw / 2} y={my - 8} width={lw} height={16} rx="4" fill={P.chip} stroke={P.chipBorder} />
                <text x={mx} y={my + 3} fontSize="8.5" textAnchor="middle" fill={P.chipText}>{lbl}</text>
              </>
            )}
          </g>
        );
      })}

      {boxes.map(({ e, shown, extra }) => {
        const b = pos[e.name];
        const attrs = e.attrs.length ? e.attrs.slice(0, MAX_ROWS) : [{ name: '\u2014', type: '', key: '' }];
        return (
          <g key={e.name}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6" fill={P.box} stroke={P.border} />
            <path d={`M${b.x} ${b.y + 6} a6 6 0 0 1 6 -6 h${b.w - 12} a6 6 0 0 1 6 6 v${HDR_H - 6} h${-b.w} z`} fill={color} opacity="0.18" />
            <text x={b.x + 8} y={b.y + 17} fontSize="11" fontWeight="600" fill={P.name}>{truncate(e.name, 20)}</text>
            <line x1={b.x} y1={b.y + HDR_H} x2={b.x + b.w} y2={b.y + HDR_H} stroke={P.sep} />
            {attrs.map((a, i) => {
              const ty = b.y + HDR_H + BODY_PAD + (i + 1) * ROW_H - 4;
              const keyCol = a.key === 'PK' ? P.pk : P.fk;
              return (
                <g key={i}>
                  <text x={b.x + 8} y={ty} fontSize="9" fontFamily={MONO} fill={P.text}>
                    {a.name === '\u2014' ? '\u2014' : `${truncate(a.name, 14)}${a.type ? ` : ${truncate(a.type, 8)}` : ''}`}
                  </text>
                  {a.key && <text x={b.x + b.w - 8} y={ty} fontSize="8" fontFamily={MONO} fontWeight="600" textAnchor="end" fill={keyCol}>{a.key}</text>}
                </g>
              );
            })}
            {extra && (
              <text x={b.x + 8} y={b.y + HDR_H + BODY_PAD + (shown + 1) * ROW_H - 4} fontSize="8.5" fill={P.sub}>{`+${e.attrs.length - MAX_ROWS} lagi`}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Pratinjau ERD di sidebar. Klik → modal perbesar (portal ke <body>).
export default function ErdDiagram({ erd, domains = {}, domain, theme = 'dark' }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!erd || !String(erd).trim()) return null;
  const model = parseErd(erd);
  if (!model.entities.length) return null;

  const svgProps = { erd, domains, domain, theme };
  const note = `Entitas: ${model.entities.length}. Relasi: ${model.relations.length}. PK/FK dari blok atribut ERD.`;

  return (
    <>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">ERD Modul</p>
          <button type="button" onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
            <IconExpand className="h-3.5 w-3.5" /> Perbesar
          </button>
        </div>
        <button type="button" onClick={() => setOpen(true)}
          className="block w-full cursor-zoom-in overflow-hidden rounded-md border bg-muted/20 p-1 text-left transition-colors hover:border-primary/60">
          <ErdSvg uid="preview" {...svgProps} />
        </button>
        <p className="text-[10px] leading-snug text-muted-foreground">{note}</p>
      </div>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="ERD modul">
          <div className="no-scrollbar max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Entity-Relationship Diagram</p>
                <p className="text-[11px] text-muted-foreground">{note}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)} title="Tutup"><IconClose /></Button>
            </div>
            <ErdSvg uid="modal" {...svgProps} />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}