import * as React from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import elk from 'cytoscape-elk';
import { applyLayout, LAYOUT_DEFS, DEFAULT_LAYOUT } from '../lib/layouts.js';

// Registrasi extension — pola register-vs-use: dagre/elk mengekspor fungsi
// register(cytoscape), bukan objek. Dipanggil sekali saat module load.
function registerExtensions() {
  for (const ext of [dagre, elk]) {
    if (typeof ext === 'function') ext(cytoscape);
    else if (ext && typeof ext.register === 'function') ext.register(cytoscape);
  }
}
registerExtensions();

/** Convert content {nodes,edges} → cytoscape elements. */
export function toElements(nodes, edges) {
  return {
    nodes: nodes.map((n) => ({
      data: { id: n.id, label: n.label, domain: n.domain, level: n.level, ...n },
      grabbable: true
    })),
    edges: edges.map(([s, t, f], i) => ({
      data: { id: `e${i}`, source: s, target: t, field: f }
    }))
  };
}

/** Cytoscape graph canvas. Controlled-ish: exposes the cy instance via onReady. */
export default function GraphCanvas({ nodes, edges, domains, layoutName, onSelect, selectedId, onReady }) {
  const containerRef = React.useRef(null);
  const cyRef = React.useRef(null);
  const layoutRef = React.useRef(null);       // layout yang sedang berjalan (untuk .stop())
  const firstRunRef = React.useRef(true);     // lewati run pertama effect layoutName (sudah di-init)
  const dataRunRef = React.useRef(true);      // lewati run pertama effect data (elemen sudah di-init)

  // Init sekali
  React.useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      elements: toElements(nodes, edges),
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'background-color': (el) => (domains[el.data('domain')] || { color: '#94a3b8' }).color,
            color: '#e2e8f0',
            'font-size': 11,
            'font-weight': 600,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-outline-width': 0,
            // Ukuran TETAP (bukan fungsi) — fungsi dimensi bikin bounding box graf besar
            // → fit zoom-out → node tampak mengecil. Samakan dengan versi asli (26×26).
            width: 26,
            height: 26,
            'shape': 'round-rectangle',
            'border-width': 2,
            'border-color': '#0f172a',
            'text-wrap': 'wrap',
            'text-max-width': 110
          }
        },
        // ===== Compound / boundary boxes (C4 style) =====
        // Node yang punya anak (:parent) digambar otomatis sbg kotak pembungkus.
        { selector: 'node:parent', style: {
            'background-color': '#0f172a', 'background-opacity': 0.45,
            'border-width': 1.5, 'border-style': 'dashed', 'border-color': '#475569',
            'shape': 'round-rectangle', padding: 18,
            'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -8,
            'font-size': 12, 'font-weight': 700, color: '#e2e8f0',
            'text-wrap': 'wrap', 'text-max-width': 160
        } },
        { selector: 'node[type = "app"]', style: {
            padding: 34, 'font-size': 16, 'background-opacity': 0.25,
            'border-width': 2, 'border-style': 'solid', 'border-color': '#38bdf8'
        } },
        { selector: 'node[type = "module"]', style: {
            padding: 22, 'font-size': 13,
            'border-width': 2, 'border-style': 'solid',
            'border-color': (el) => (domains[el.data('domain')] || { color: '#475569' }).color
        } },
        { selector: 'node[type = "action"]', style: {
            // aksi = daun. Label ditampilkan: tanpa ini L3 hanya berupa dot tanpa makna
            // (informasi tidak lengkap). Dot diperbesar sedikit + teks redup agar terbaca.
            width: 14, height: 14, 'border-width': 1, 'border-color': '#0f172a',
            label: 'data(label)',
            'font-size': 9, 'font-weight': 500, color: '#94a3b8',
            'text-valign': 'bottom', 'text-margin-y': 4,
            'text-wrap': 'wrap', 'text-max-width': 96, opacity: 0.95
        } },
        {
          // Efek pilih persis versi asli cytoscape-softmedis.html (baris 117-120):
          // border putih tebal + node di-brighten (background-blacken negatif),
          // warna domain TETAP (tidak ditimpa) → "focus color", sisanya meredup.
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#f8fafc',
            'background-blacken': -0.3,
            'font-size': 12,
            color: '#f8fafc'
          }
        },
        {
          selector: 'edge',
          style: {
            width: 1.6,
            'line-color': '#475569',
            'curve-style': 'bezier',
            'target-arrow-color': '#475569',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 1,
            label: 'data(field)',
            'font-size': 8,
            color: '#64748b',
            'text-rotation': 'autorotate',
            'text-background-color': '#0f172a',
            'text-background-opacity': 0.8,
            'text-background-padding': 2
          }
        },
        // Efek dim persis versi asli: node redup 0.15, edge redup 0.06 (nyaris hilang).
        { selector: 'node.faded', style: { opacity: 0.15 } },
        { selector: 'edge.faded', style: { opacity: 0.06 } },
        { selector: 'edge.highlight', style: { 'line-color': '#38bdf8', 'target-arrow-color': '#38bdf8', width: 2.5 } }
      ],
      minZoom: 0.2,
      maxZoom: 6,
      // 0.25 terlalu lambat (tiap tick scroll hanya menggeser zoom sedikit);
      // cytoscape default = 1. Naikkan agar zoom in/out responsif.
      wheelSensitivity: 1.2
    });

    cy.on('tap', 'node', (evt) => onSelect && onSelect(evt.target.id()));
    cy.on('tap', (evt) => { if (evt.target === cy && onSelect) onSelect(null); });

    cyRef.current = cy;
    // Layout awal INSTAN (tanpa animasi) — mencegah node "berhamburan" dari posisi
    // tumpuk saat first refresh. Animasi hanya untuk perpindahan layout oleh user.
    layoutRef.current = applyLayout(cy, DEFAULT_LAYOUT, { animate: false });
    if (onReady) onReady(cy);

    return () => { cy.destroy(); cyRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run layout saat layoutName berubah
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // Lewati run pertama (saat mount) — layout awal sudah dijalankan instan di
    // effect init. Tanpa ini dagre jalan dua kali saat refresh pertama.
    if (firstRunRef.current) { firstRunRef.current = false; return; }
    if (!layoutName || !LAYOUT_DEFS[layoutName]) return;
    // Stop layout sebelumnya dulu — mencegah dua layout (mis. ELK async +
    // animasi) saling tumpang-tindih saat tombol diklik cepat.
    if (layoutRef.current && layoutRef.current.stop) layoutRef.current.stop();
    layoutRef.current = applyLayout(cy, layoutName, { animate: true });
  }, [layoutName]);

  // Highlight selection + 1-hop neighborhood
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('faded highlight');
    if (!selectedId) return;
    const node = cy.getElementById(selectedId);
    if (node.empty()) return;
    // Compound-aware: yang dijaga tetap terang = node terpilih + LELUHUR (kotak
    // pembungkusnya) + ANAK (isi kotak, bila yang diklik modul) + TETANGGA + kotak
    // dari tiap tetangga. Tanpa ini: klik fitur → kotak modulnya meredup; klik modul
    // → seluruh fiturnya meredup (terlihat "hilang").
    const neighborNodes = node.neighborhood().nodes();
    let keep = node.union(node.ancestors()).union(node.descendants()).union(node.neighborhood());
    neighborNodes.forEach((n) => { keep = keep.union(n.ancestors()); });
    const keepEdges = keep.edges().union(node.connectedEdges());
    cy.elements().not(keep).addClass('faded');
    keepEdges.addClass('highlight');
  }, [selectedId]);

  // Live update data (jarang berubah, tapi content bisa diganti dinamis)
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // Lewati run pertama (mount) — elemen sudah dibuat di effect init. Tanpa ini
    // elemen dihapus & ditambah ulang + layout jalan lagi saat refresh pertama.
    if (dataRunRef.current) { dataRunRef.current = false; return; }
    cy.batch(() => {
      cy.elements().remove();
      cy.add(toElements(nodes, edges));
    });
    if (layoutRef.current && layoutRef.current.stop) layoutRef.current.stop();
    layoutRef.current = applyLayout(cy, DEFAULT_LAYOUT, { animate: false });
  }, [nodes, edges]);

  return <div ref={containerRef} className="h-full w-full" />;
}
