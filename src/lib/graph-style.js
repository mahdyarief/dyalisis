// Dyalisis engine — cytoscape style dibangun dari tema (dark/light).
// Dipisah dari GraphCanvas agar tema bisa diganti saat runtime (cy.style().fromJson()).
// Warna domain TIDAK di-hardcode di sini: tiap node membawa data.color (dari DOMAINS),
// jadi style memakai mapping 'data(color)' dan tetap benar untuk content apa pun.

const PALETTES = {
  dark: {
    nodeText: '#e2e8f0', nodeBorder: '#0f172a',
    parentBg: '#0f172a', parentOpacity: 0.45, parentBorder: '#475569', parentText: '#e2e8f0',
    appBorder: '#38bdf8', actionText: '#94a3b8',
    edge: '#475569', edgeText: '#64748b', edgeTextBg: '#0f172a',
    selectedBorder: '#f8fafc', selectedText: '#f8fafc',
    blacken: -0.3, highlight: '#38bdf8', matchBorder: '#fbbf24'
  },
  light: {
    nodeText: '#0f172a', nodeBorder: '#ffffff',
    parentBg: '#f8fafc', parentOpacity: 1, parentBorder: '#cbd5e1', parentText: '#334155',
    appBorder: '#0284c7', actionText: '#64748b',
    edge: '#94a3b8', edgeText: '#475569', edgeTextBg: '#ffffff',
    selectedBorder: '#0f172a', selectedText: '#0f172a',
    blacken: 0, highlight: '#0284c7', matchBorder: '#d97706'
  }
};

export function graphPalette(theme) {
  return PALETTES[theme] || PALETTES.dark;
}

/** Bangun array style cytoscape untuk sebuah tema. */
export function buildGraphStyle(theme) {
  const p = graphPalette(theme);
  return [
    { selector: 'node', style: {
        label: 'data(label)',
        'background-color': 'data(color)',
        color: p.nodeText,
        'font-size': 11, 'font-weight': 600,
        'text-valign': 'bottom', 'text-margin-y': 6, 'text-outline-width': 0,
        width: 26, height: 26, shape: 'round-rectangle',
        'border-width': 2, 'border-color': p.nodeBorder,
        'text-wrap': 'wrap', 'text-max-width': 110 } },
    // ===== Compound / boundary boxes (C4 style) =====
    { selector: 'node:parent', style: {
        'background-color': p.parentBg, 'background-opacity': p.parentOpacity,
        'border-width': 1.5, 'border-style': 'dashed', 'border-color': p.parentBorder,
        shape: 'round-rectangle', padding: 18,
        'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -8,
        'font-size': 12, 'font-weight': 700, color: p.parentText,
        'text-wrap': 'wrap', 'text-max-width': 160 } },
    { selector: 'node[type = "app"]', style: {
        padding: 34, 'font-size': 16, 'background-opacity': Math.min(p.parentOpacity, 0.25),
        'border-width': 2, 'border-style': 'solid', 'border-color': p.appBorder } },
    { selector: 'node[type = "module"]', style: {
        padding: 22, 'font-size': 13, 'border-width': 2, 'border-style': 'solid',
        'border-color': 'data(color)' } },
    { selector: 'node[type = "action"]', style: {
        width: 14, height: 14, 'border-width': 1, 'border-color': p.nodeBorder,
        label: 'data(label)', 'font-size': 9, 'font-weight': 500, color: p.actionText,
        'text-valign': 'bottom', 'text-margin-y': 4, 'text-wrap': 'wrap',
        'text-max-width': 96, opacity: 0.95 } },
    { selector: 'node:selected', style: {
        'border-width': 4, 'border-color': p.selectedBorder,
        'background-blacken': p.blacken, 'font-size': 12, color: p.selectedText } },
    // Hasil pencarian: border amber agar mudah terlihat tanpa menimpa warna domain.
    { selector: 'node.match', style: { 'border-width': 4, 'border-color': p.matchBorder } },
    { selector: 'edge', style: {
        width: 1.6, 'line-color': p.edge, 'curve-style': 'bezier',
        'target-arrow-color': p.edge, 'target-arrow-shape': 'triangle', 'arrow-scale': 1,
        label: 'data(field)', 'font-size': 8, color: p.edgeText, 'text-rotation': 'autorotate',
        'text-background-color': p.edgeTextBg, 'text-background-opacity': 0.8, 'text-background-padding': 2 } },
    { selector: 'node.faded', style: { opacity: 0.15 } },
    { selector: 'edge.faded', style: { opacity: 0.06 } },
    { selector: 'edge.highlight', style: { 'line-color': p.highlight, 'target-arrow-color': p.highlight, width: 2.5 } }
  ];
}
