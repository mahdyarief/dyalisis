import * as React from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui.jsx';
import { IconClose, IconExpand } from './icons.jsx';

// UML class diagram ringkas untuk node terpilih — SVG inline, theme-aware, tanpa
// dependency baru (tetap single-file). Model: kotak kelas 3 kompartemen
// («stereotype» + nama / atribut dari `fields` / operasi dari anak) + asosiasi
// ke kelas tetangga (relasi data) berlabel field penghubung (gaya focus+context).
// Pratinjau kecil di sidebar bisa diklik → modal perbesar (portal ke <body>).

const W = 300;
const PAD = 12;
const LN = 15;        // jarak baris
const COMP_PAD = 6;   // padding kompartemen
const HDR_H = 34;     // tinggi header kelas
const ROW_H = 34;     // tinggi baris asosiasi

const PALETTE = {
  dark: {
    box: '#0b1220', border: '#334155', name: '#f1f5f9', stereo: '#7dd3fc',
    text: '#94a3b8', sep: '#1e293b', line: '#475569', chip: '#0b1220',
    chipBorder: '#334155', chipText: '#cbd5e1', sub: '#64748b'
  },
  light: {
    box: '#ffffff', border: '#cbd5e1', name: '#0f172a', stereo: '#0369a1',
    text: '#475569', sep: '#e2e8f0', line: '#94a3b8', chip: '#ffffff',
    chipBorder: '#cbd5e1', chipText: '#1e293b', sub: '#64748b'
  }
};

const STEREOTYPE = { app: 'Application', module: 'Module', feature: 'Feature', action: 'Action' };

function truncate(s, n) {
  const t = String(s == null ? '' : s);
  return t.length > n ? t.slice(0, n - 1) + '\u2026' : t;
}

// Pisahkan anotasi dalam tanda kurung (mis. "nama_kolom (catatan)") jadi {name, note}.
function stripNote(s) {
  const m = /^([^(]+?)\s*(?:\((.*)\))?$/.exec(String(s).trim());
  return { name: (m ? m[1] : s).trim(), note: m && m[2] ? m[2].trim() : '' };
}

// Tebak tipe pseudo-UML dari pola nama field (tanpa skema DB).
function inferType(name) {
  const n = String(name).toLowerCase();
  if (/(^|_)(tgl|tanggal|date)|^thn$|period/.test(n)) return 'date';
  if (/^(no_|kd_|kode_|nip$|nik$|sku$)|_id$|^id$/.test(n)) return 'ref';
  if (/jumlah|qty|total|amount|stok|gapok|biaya|tarif|nominal|harga/.test(n)) return 'number';
  return 'string';
}

export function parseAttributes(fields) {
  if (!fields) return [];
  return String(fields)
    .split(',')
    .map(stripNote)
    .filter((a) => a.name && !/^-+$/.test(a.name));
}

// SVG inti — dipakai oleh pratinjau sidebar maupun modal perbesar.
// uid membuat id marker unik agar dua SVG yang tampil bersamaan tidak bentrok.
function UmlSvg({ node, byId, related, children, domains, theme, highlight, uid }) {
  const P = PALETTE[theme] || PALETTE.dark;
  const color = (domains[node.domain] || {}).color || P.line;
  const markerId = `uml-arrow-${uid}`;

  const attrs = parseAttributes(node.fields);
  const ops = children.map((c) => c.label);
  const attrList = attrs.length ? attrs.slice(0, 7) : [{ name: '-' }];
  const opList = ops.length ? ops.slice(0, 7) : ['-'];

  const FOCUS_X = PAD;
  const FOCUS_W = W - 2 * PAD;
  const focusTop = PAD;
  const attrTop = focusTop + HDR_H;
  const attrH = attrList.length * LN + COMP_PAD;
  const opTop = attrTop + attrH;
  const opH = opList.length * LN + COMP_PAD;
  const focusBot = opTop + opH;

  const inRel = related.filter((r) => !r.out);
  const outRel = related.filter((r) => r.out);

  const chipX = PAD + 34;
  const chipW = W - chipX - PAD;
  const busX = PAD + 10;

  let y = focusBot + 24;
  const rows = [];
  const pushGroup = (label, list, glyph) => {
    if (!list.length) return;
    rows.push({ kind: 'group', y, label });
    y += 16;
    list.slice(0, 6).forEach((r) => { rows.push({ kind: 'rel', y, r, glyph }); y += ROW_H; });
    if (list.length > 6) { rows.push({ kind: 'more', y, n: list.length - 6 }); y += 22; }
    y += 4;
  };
  pushGroup('membaca dari (reads)', inRel, 'in');
  pushGroup('menulis ke (writes)', outRel, 'out');
  const H = (rows.length ? y - 4 : focusBot + PAD) + PAD;
  const busEnd = rows.length ? rows[rows.length - 1].y + ROW_H / 2 : focusBot;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`UML ${node.label}`}>
      <defs>
        <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4"
          markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill={P.line} />
        </marker>
      </defs>

      <rect x={FOCUS_X} y={focusTop} width={FOCUS_W} height={focusBot - focusTop} rx="6" fill={P.box} stroke={P.border} />
      <path d={`M${FOCUS_X} ${focusTop + 6} a6 6 0 0 1 6 -6 h${FOCUS_W - 12} a6 6 0 0 1 6 6 v${HDR_H - 6} h${-FOCUS_W} z`} fill={color} opacity="0.16" />
      <text x={FOCUS_X + 10} y={focusTop + 14} fontSize="9" fill={P.stereo} fontStyle="italic">{`\u00ab${STEREOTYPE[node.type] || 'Class'}\u00bb`}</text>
      <text x={FOCUS_X + 10} y={focusTop + 28} fontSize="13" fontWeight="600" fill={P.name}>{truncate(node.entity || node.label, 24)}</text>

      <line x1={FOCUS_X} y1={attrTop} x2={FOCUS_X + FOCUS_W} y2={attrTop} stroke={P.sep} />
      {attrList.map((a, i) => (
        <text key={i} x={FOCUS_X + 10} y={attrTop + COMP_PAD + (i + 1) * LN - 4}
          fontSize="10" fill={P.text} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
          {a.name === '-' ? '\u2014' : `+ ${truncate(a.name, 20)} : ${inferType(a.name)}`}
        </text>
      ))}

      <line x1={FOCUS_X} y1={opTop} x2={FOCUS_X + FOCUS_W} y2={opTop} stroke={P.sep} />
      {opList.map((o, i) => (
        <text key={i} x={FOCUS_X + 10} y={opTop + COMP_PAD + (i + 1) * LN - 4}
          fontSize="10" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fill={highlight && o === highlight ? color : P.text}
          fontWeight={highlight && o === highlight ? 600 : 400}>
          {o === '-' ? '\u2014' : `+ ${truncate(o, 20)}()`}
        </text>
      ))}

      {rows.length > 0 && <line x1={busX} y1={focusBot} x2={busX} y2={busEnd} stroke={P.line} strokeDasharray="3 3" />}
      {rows.map((row, i) => {
        if (row.kind === 'group') {
          return <text key={i} x={PAD} y={row.y + 11} fontSize="9" fill={P.sub} fontWeight="600">{row.label}</text>;
        }
        if (row.kind === 'more') {
          return <text key={i} x={PAD} y={row.y + 10} fontSize="9" fill={P.sub}>{`+${row.n} asosiasi lainnya`}</text>;
        }
        const cy = row.y + ROW_H / 2;
        const other = byId[row.r.other];
        const label = other ? other.label : row.r.other;
        const isOut = row.glyph === 'out';
        const x1 = isOut ? busX : chipX;
        const x2 = isOut ? chipX : busX;
        return (
          <g key={i}>
            <line x1={x1} y1={cy} x2={x2} y2={cy} stroke={P.line} markerEnd={`url(#${markerId})`} />
            <rect x={chipX} y={cy - 13} width={chipW} height={26} rx="4" fill={P.chip} stroke={P.chipBorder} />
            <text x={chipX + 8} y={cy - 2} fontSize="10" fill={P.chipText}>{truncate(label, 22)}</text>
            <text x={chipX + 8} y={cy + 10} fontSize="8" fill={P.sub} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">{truncate(row.r.field, 30)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Pratinjau UML di sidebar. Klik → modal perbesar (portal ke <body>).
export default function UmlDiagram({ node, byId = {}, related = [], children = [], domains = {}, theme = 'dark', highlight = null }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!node) return null;

  const svgProps = { node, byId, related, children, domains, theme, highlight };

  return (
    <>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">UML Class Diagram</p>
          <button type="button" onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
            <IconExpand className="h-3.5 w-3.5" /> Perbesar
          </button>
        </div>
        <button type="button" onClick={() => setOpen(true)}
          className="block w-full cursor-zoom-in overflow-hidden rounded-md border bg-muted/20 p-1 text-left transition-colors hover:border-primary/60">
          <UmlSvg uid="preview" {...svgProps} />
        </button>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Kotak: kelas data fitur (atribut dari field kunci, operasi dari aksi). Panah: asosiasi via field penghubung.
        </p>
      </div>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={`UML ${node.entity || node.label}`}>
          <div className="no-scrollbar max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{node.entity || node.label}</p>
                <p className="text-[11px] text-muted-foreground">UML Class Diagram</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)} title="Tutup"><IconClose /></Button>
            </div>
            <UmlSvg uid="modal" {...svgProps} />
            <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
              Kotak: kelas data fitur (atribut dari field kunci, operasi dari aksi). Panah: asosiasi via field penghubung.
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
