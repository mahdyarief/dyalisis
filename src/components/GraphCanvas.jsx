import * as React from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import elk from 'cytoscape-elk';
import { applyLayout, LAYOUT_DEFS, DEFAULT_LAYOUT } from '../lib/layouts.js';
import { buildGraphStyle } from '../lib/graph-style.js';
import { syncElements } from '../lib/navigation.js';

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
      grabbable: false, pannable: true
    })),
    edges: edges.map(([s, t, f], i) => ({
      data: { id: `e${i}`, source: s, target: t, field: f }
    }))
  };
}

/** Tandai edge antar-langkah berurutan pada jalur Alur aktif (garis lebih
 *  tebal, panah lebih besar) agar arah alur terbaca. Jalur aktif linear, jadi
 *  adjacency indeks tepat; edge menuju cabang alternatif tidak ikut menyala. */
function markChainEdges(cy, flowPath) {
  const pos = new Map(flowPath.map((id, i) => [id, i]));
  cy.edges().forEach((e) => {
    const s = pos.get(e.data('source'));
    const t = pos.get(e.data('target'));
    if (s !== undefined && t !== undefined && Math.abs(s - t) === 1) e.addClass('chain');
  });
}

/** Tandai node terpilih sebagai "langkah saat ini". Lewat kelas, bukan
 *  :selected, karena seleksi bisa datang dari sidebar/tombol Berikutnya. */
function markAnchor(cy, selectedId) {
  if (selectedId) cy.getElementById(selectedId).addClass('anchor');
}

/** Cytoscape graph canvas. Controlled-ish: exposes the cy instance via onReady. */
export default function GraphCanvas({ nodes, edges, domains, layoutName, layoutRevision = 0, arrange = false, neighborhood = false, onSelect, selectedId, onReady, matchIds, flowPath = null, flowBranchIds = null, notedIds = null, theme = 'dark' }) {
  const positionsRef = React.useRef(new Map());
  const selectRef = React.useRef(onSelect);
  selectRef.current = onSelect;
  const [reducedMotion, setReducedMotion] = React.useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { setReducedMotion(mq.matches); cyRef.current?.stop(true, false); layoutRef.current?.stop(); };
    mq.addEventListener('change', change);
    return () => mq.removeEventListener('change', change);
  }, []);
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
      style: buildGraphStyle(theme, reducedMotion),
      minZoom: 0.2,
      maxZoom: 6,
      wheelSensitivity: 0.2,
      autoungrabify: true,
      // Sentuh: matikan box-select supaya tap-drag = pan (bukan seleksi area),
      // dan longgarkan ambang tap agar jari tidak salah memilih node.
      boxSelectionEnabled: false,
      touchTapThreshold: 8,
      desktopTapThreshold: 4
    });
    cy.on('tap', 'node', (evt) => selectRef.current?.(evt.target.id()));
    cy.on('tap', (evt) => { if (evt.target === cy) selectRef.current?.(null); });
    const interrupt = () => { cy.stop(true, false); layoutRef.current?.stop(); };
    const el = containerRef.current;
    el.addEventListener('pointerdown', interrupt, true);
    el.addEventListener('wheel', interrupt, { capture: true, passive: true });
    cy.on('destroy', () => {
      el.removeEventListener('pointerdown', interrupt, true);
      el.removeEventListener('wheel', interrupt, true);
    });
    cyRef.current = cy;
    // Instan (tanpa animasi) saat mount supaya tak ada transisi aneh saat refresh.
    layoutRef.current = applyLayout(cy, DEFAULT_LAYOUT, { animate: false });
    if (onReady) onReady(cy);
    return () => { cy.destroy(); cyRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cytoscape tak memantau perubahan ukuran container; resize manual saat
  // layout berubah (rotasi layar, sidebar buka/tutup) agar kanvas tidak salah skala.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const cy = cyRef.current;
      if (!cy) return;
      const viewport = { zoom: cy.zoom(), pan: { ...cy.pan() } };
      cy.resize();
      cy.viewport(viewport);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ganti tema: rebuild style pada instance yang sama (tanpa menyentuh posisi).
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style().fromJson(buildGraphStyle(theme, reducedMotion)).update();
  }, [theme, reducedMotion]);

  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.autoungrabify(!arrange);
    cy.nodes().grabify();
    if (arrange) cy.nodes().unpanify(); else cy.nodes().panify();
    containerRef.current.style.cursor = arrange ? 'default' : 'grab';
  }, [arrange, nodes]);

  // Layout saat layoutName berubah — lewati run pertama (sudah di-init).
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (firstRunRef.current) { firstRunRef.current = false; return; }
    if (layoutRef.current && layoutRef.current.stop) layoutRef.current.stop();
    layoutRef.current = applyLayout(cy, layoutName, { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  }, [layoutName, layoutRevision]);

  // Data berubah (search/toggle aksi): ganti elemen, lalu layout instan agar rapi.
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (dataRunRef.current) { dataRunRef.current = false; return; }
    cy.stop(true, false);
    layoutRef.current?.stop();
    syncElements(cy, toElements(nodes, edges, domainsRef.current), positionsRef.current);
    cy.nodes().grabify();
    if (arrange) cy.nodes().unpanify(); else cy.nodes().panify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // Efek seleksi/pencarian compound-aware.
  // Prioritas: hasil pencarian (matchIds) > seleksi manual (selectedId).
  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('faded highlight match anchor flow chain flow-start flow-end flow-branch noted');

    // Badge catatan (jembatan Manusia↔AI) — independen dari mode seleksi.
    if (notedIds && notedIds.length) {
      notedIds.forEach((id) => cy.getElementById(id).addClass('noted'));
    }

    const flowActive = flowPath && flowPath.length > 1;

    if (matchIds && matchIds.length) {
      let keep = cy.collection();
      let matched = cy.collection();
      matchIds.forEach((id) => {
        const n = cy.getElementById(id);
        if (n.nonempty()) {
          // Node match + ancestor (agar compound tak orphan) + descendant
          // (agar aksi L3 di dalam fitur yang ter-highlight tidak ikut ter-fade).
          keep = keep.union(n).union(n.ancestors()).union(n.descendants());
          matched = matched.union(n);
        }
      });
      // Mode Alur: hanya edge DI jalur aktif yang terang. Edge menuju cabang
      // alternatif (di luar jalur) sengaja tidak di-highlight agar redup —
      // supaya alur terbaca sebagai satu jalur, bukan banjir edge menyala.
      const keepEdges = flowActive
        ? keep.edgesWith(keep)
        : keep.edgesWith(keep).union(matched.connectedEdges());
      cy.elements().not(keep).not(keepEdges).addClass('faded');
      matched.addClass('match');
      // Aksi (L3) milik fitur yang ter-highlight juga disorot.
      matched.descendants().addClass('match');
      keepEdges.addClass('highlight');
      // Mode Alur: node jalur memakai warna border yang sama dengan panah
      // (kelas .flow) dan edge antar-langkah berurutan dipertebal (.chain),
      // supaya jalur terbaca sebagai satu kesatuan, bukan "semua menyala".
      if (flowActive) {
        matched.addClass('flow');
        markChainEdges(cy, flowPath);
        // Penanda arah: titik awal (hijau) & akhir (kuning) jalur agar batas
        // dan orientasi alur terbaca sekilas, bukan sekadar deretan node menyala.
        cy.getElementById(flowPath[0]).addClass('flow-start');
        cy.getElementById(flowPath[flowPath.length - 1]).addClass('flow-end');
        // Cabang alternatif (di luar jalur aktif): tetap terlihat (dashed) agar
        // percabangan terbaca sebagai cabang — bukan hilang begitu saja.
        (flowBranchIds || []).forEach((id) => {
          const n = cy.getElementById(id);
          if (n.nonempty()) {
            n.removeClass('faded').addClass('flow-branch');
            n.connectedEdges().removeClass('faded').addClass('flow-branch');
          }
        });
      }
      // Langkah yang sedang dipilih selalu ditandai, di mode apa pun.
      markAnchor(cy, selectedId);
      return;
    }

    if (!selectedId) return;
    const node = cy.getElementById(selectedId);
    if (node.empty()) return;
    if (!neighborhood) { markAnchor(cy, selectedId); return; }
    const neighborNodes = node.neighborhood().nodes();
    let keep = node.union(node.ancestors()).union(node.descendants()).union(node.neighborhood());
    neighborNodes.forEach((n) => { keep = keep.union(n.ancestors()); });
    const keepEdges = keep.edgesWith(keep).union(node.connectedEdges());
    cy.elements().not(keep).not(keepEdges).addClass('faded');
    keepEdges.addClass('highlight');
    markAnchor(cy, selectedId);
  }, [selectedId, matchIds, flowPath, flowBranchIds, notedIds, nodes, edges, neighborhood]);

  return <div ref={containerRef} className="h-full w-full" />;
}
