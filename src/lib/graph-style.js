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
    blacken: -0.3, highlight: '#38bdf8', matchBorder: '#fbbf24', noteColor: '#f472b6',
    flowStart: '#34d399', flowEnd: '#fbbf24', flowBranch: '#94a3b8'
  },
  light: {
    nodeText: '#0f172a', nodeBorder: '#ffffff',
    parentBg: '#f8fafc', parentOpacity: 1, parentBorder: '#cbd5e1', parentText: '#334155',
    appBorder: '#0284c7', actionText: '#64748b',
    edge: '#94a3b8', edgeText: '#475569', edgeTextBg: '#ffffff',
    selectedBorder: '#0f172a', selectedText: '#0f172a',
    blacken: 0, highlight: '#0284c7', matchBorder: '#d97706', noteColor: '#db2777',
    flowStart: '#059669', flowEnd: '#d97706', flowBranch: '#94a3b8'
  }
};

export function graphPalette(theme) {
  return PALETTES[theme] || PALETTES.dark;
}

// Dot notifikasi (SVG) untuk node ber-catatan: lingkaran penuh warna noteColor
// dengan cincin putih agar tetap terbaca di atas warna domain, pada kedua tema.
// Dipakai sebagai background-image di sudut kanan-atas node (bukan pie wedge).
const noteDot = (color) => 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
  + `<circle cx="8" cy="8" r="6" fill="${color}" stroke="#ffffff" stroke-width="2.5"/></svg>`
);

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
        'text-wrap': 'wrap', 'text-max-width': 110,
        // Transisi halus saat kelas seleksi/alur berubah (bukan fade mendadak).
        'transition-property': 'border-color, border-width, background-color, opacity, font-size, width, height',
        'transition-duration': '200ms', 'transition-timing-function': 'ease-in-out' } },
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
    // Badge catatan: dot lingkaran (ala notifikasi) di sudut kanan-atas node —
    // penanda bahwa node punya notes (jembatan Manusia↔AI) tanpa menutupi warna
    // domain. background-image ditumpuk di atas background-color, bukan pie wedge.
    { selector: 'node.noted', style: {
        'background-image': noteDot(p.noteColor),
        'background-fit': 'none',
        'background-width': 12, 'background-height': 12,
        'background-position-x': '100%', 'background-position-y': '0%',
        'background-repeat': 'no-repeat', 'background-clip': 'none',
        'background-image-opacity': 1 } },
    // Node pada jalur Alur: border pakai warna `highlight` yang sama dengan panah,
    // supaya node + panah terbaca sebagai satu kesatuan jalur (bukan dua bahasa warna).
    { selector: 'node.flow', style: {
        'border-width': 4, 'border-color': p.highlight, 'font-weight': 700,
        'text-outline-color': p.nodeBorder, 'text-outline-width': 2 } },
    // Titik awal (MULAI) & akhir (AKHIR) jalur Alur — warna berbeda supaya arah
    // dan batas jalur terbaca sekilas, walau semua node jalur ber-.flow.
    { selector: 'node.flow-start', style: {
        'border-color': p.flowStart, 'border-width': 5,
        'underlay-color': p.flowStart, 'underlay-opacity': 0.35,
        'underlay-padding': 8, 'underlay-shape': 'round-rectangle' } },
    { selector: 'node.flow-end', style: {
        'border-color': p.flowEnd, 'border-width': 5,
        'underlay-color': p.flowEnd, 'underlay-opacity': 0.35,
        'underlay-padding': 8, 'underlay-shape': 'round-rectangle' } },
    // Cabang alternatif di luar jalur aktif: tetap terlihat (dashed abu) agar
    // percabangan terbaca sebagai cabang, bukan sekadar hilang.
    { selector: 'node.flow-branch', style: {
        'border-color': p.flowBranch, 'border-width': 2, 'border-style': 'dashed', opacity: 0.55 } },
    // Anchor = langkah yang sedang dipilih. Dideklarasikan TERAKHIR di antara
    // penanda node agar border putihnya menang atas .match/.flow (di mode Alur
    // semua node jalur ber-.flow, jadi tanpa ini pengguna tak tahu sedang di
    // langkah mana). Pakai kelas, bukan :selected, karena seleksi bisa datang
    // dari sidebar/tombol Berikutnya, bukan klik langsung pada kanvas.
    { selector: 'node.anchor', style: {
        'border-width': 5, 'border-color': p.selectedBorder,
        'background-blacken': p.blacken, 'font-size': 12, 'font-weight': 700,
        color: p.selectedText, 'text-outline-color': p.nodeBorder, 'text-outline-width': 2,
        'underlay-color': p.selectedBorder, 'underlay-opacity': 0.3,
        'underlay-padding': 7, 'underlay-shape': 'round-rectangle' } },
    { selector: 'edge', style: {
        width: 1.6, 'line-color': p.edge, 'curve-style': 'bezier',
        'target-arrow-color': p.edge, 'target-arrow-shape': 'triangle', 'arrow-scale': 1,
        label: 'data(field)', 'font-size': 8, color: p.edgeText, 'text-rotation': 'autorotate',
        'text-background-color': p.edgeTextBg, 'text-background-opacity': 0.8, 'text-background-padding': 2,
        'transition-property': 'line-color, target-arrow-color, width, opacity',
        'transition-duration': '200ms', 'transition-timing-function': 'ease-in-out' } },
    { selector: 'node.faded', style: { opacity: 0.15 } },
    { selector: 'edge.faded', style: { opacity: 0.06 } },
    { selector: 'edge.highlight', style: { 'line-color': p.highlight, 'target-arrow-color': p.highlight, width: 2.5 } },
    // Edge antar-langkah berurutan pada jalur Alur — lebih tebal & panah lebih
    // besar dari edge.highlight biasa. Dideklarasikan setelahnya agar menang.
    { selector: 'edge.chain', style: {
        width: 3.5, 'arrow-scale': 1.5, 'line-color': p.highlight,
        'target-arrow-color': p.highlight, 'font-size': 9, 'font-weight': 700 } },
    // Edge menuju cabang alternatif (di luar jalur aktif): dashed abu, tetap
    // terlihat agar percabangan terbaca sebagai cabang.
    { selector: 'edge.flow-branch', style: {
        'line-style': 'dashed', 'line-color': p.flowBranch,
        'target-arrow-color': p.flowBranch, width: 1.6, opacity: 0.5 } }
  ];
}
