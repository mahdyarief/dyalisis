import * as React from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import elk from 'cytoscape-elk';
import { applyLayout, LAYOUT_DEFS, DEFAULT_LAYOUT } from '../lib/layouts.js';
import { buildGraphStyle } from '../lib/graph-style.js';

// Registrasi extension — pola register-vs-use: dagre/elk mengekspor fungsi
// register(cytoscape), bukan objek. Dipanggil sekali saat module load.
function registerExtensions() {
  for (const ext of [dagre, elk]) {
    if (typeof ext === 'function') ext(cytoscape);
    else if (ext && typeof ext.register === 'function') ext.register(cytoscape);
  }
}
registerExtensions();

/** Convert content {nodes,edges} → cytoscape elements.
 *  Tiap node membawa data.color (warna domain) agar style pakai 'data(color)'
 *  — tak perlu fungsi style, sehingga aman di-rebuild saat tema berganti. */
export function toElements(nodes, edges, domains = {}) {
  return {
    nodes: nodes.map((n) => ({
      data: { id: n.id, label: n.label, domain: n.domain, level: n.level,
        color: (domains[n.domain] || {}).color || '#94a3b8', ...n },
      grabbable: true
    })),
    edges: edges.map(([s, t, f], i) => ({
      data: { id: `e${i}`, source: s, target: t, field: f }
    }))
  };
}

/** Cytoscape graph canvas. Controlled-ish: exposes the cy instance via onReady. */
export default function GraphCanvas({ nodes, edges, domains, layoutName, onSelect, selectedId, onReady, matchIds, theme = 'dark' }) {
  const containerRef = React.useRef(null);
  const cyRef = React.useRef(null);
  const layoutRef = React.useRef(null);       // layout yang sedang berjalan (untuk .stop())
  const firstRunRef = React.useRef(true);     // lewati run pertama effect layoutName (sudah di-init)
  const dataRunRef = React.useRef(true);      // lewati run pertama effect data (elemen sudah di-init)
  const domainsRef = React.useRef(domains);   // hindari dependency re-init saat domains baru
  domainsRef.current = domains;

  // Init sekali
  React.useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      elements: toElements(nodes, edges, domains),
      style: buildGraphStyle(theme),
      minZoom: 0.2,
      maxZoom: 6,
      wheelSensitivity: 1.2
    });
    cy.on('tap', 'node', (evt) => { if (onSelect) onSelect(evt.target.id()); });
    cy.on('tap', (evt) => { if (evt.target === cy && onSelect) onSelect(null); });
    cyRef.current = cy;
    // Instan (tanpa animasi) saat mount supaya tak ada transisi aneh saat refresh.
    layoutRef.current = applyLayout(cy, DEFAULT_LAYOUT, { animate: false });
    if (onReady) onReady(cy);
    return () => { cy.destroy(); cyRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ganti tema: rebuild style pada instance yang sama (tanpa menyentuh posisi).
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style().fromJson(buildGraphStyle(theme)).update();
  }, [theme]);

  // Layout saat layoutName berubah — lewati run pertama (sudah di-init).
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (firstRunRef.current) { firstRunRef.current = false; return; }
    if (layoutRef.current && layoutRef.current.stop) layoutRef.current.stop();
    layoutRef.current = applyLayout(cy, layoutName, { animate: true });
  }, [layoutName]);

  // Data berubah (search/toggle aksi): ganti elemen, lalu layout instan agar rapi.
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (dataRunRef.current) { dataRunRef.current = false; return; }
    cy.batch(() => {
      cy.elements().remove();
      cy.add(toElements(nodes, edges, domainsRef.current));
    });
    if (layoutRef.current && layoutRef.current.stop) layoutRef.current.stop();
    layoutRef.current = applyLayout(cy, layoutName, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // Efek seleksi/pencarian compound-aware.
  // Prioritas: hasil pencarian (matchIds) > seleksi manual (selectedId).
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('faded highlight match');

    if (matchIds && matchIds.length) {
      let keep = cy.collection();
      matchIds.forEach((id) => {
        const n = cy.getElementById(id);
        if (n.nonempty()) keep = keep.union(n).union(n.ancestors());
      });
      const keepEdges = keep.edges();
      cy.elements().not(keep).not(keepEdges).addClass('faded');
      cy.collection(matchIds.map((id) => cy.getElementById(id)).filter((n) => n.nonempty())).addClass('match');
      keepEdges.addClass('highlight');
      return;
    }

    if (!selectedId) return;
    const node = cy.getElementById(selectedId);
    if (node.empty()) return;
    const neighborNodes = node.neighborhood().nodes();
    let keep = node.union(node.ancestors()).union(node.descendants()).union(node.neighborhood());
    neighborNodes.forEach((n) => { keep = keep.union(n.ancestors()); });
    const keepEdges = keep.edges().union(node.connectedEdges());
    cy.elements().not(keep).addClass('faded');
    keepEdges.addClass('highlight');
  }, [selectedId, matchIds]);

  return <div ref={containerRef} className="h-full w-full" />;
}
