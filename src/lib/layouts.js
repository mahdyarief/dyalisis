// Dyalisis engine — validated Cytoscape layout presets.
// Ported from .claude/skills/cytoscape-layouts (headless-verified density ≈41).
export const LAYOUT_DEFS = {
  dagre: {
    label: 'Dagre (Level Flow)',
    options: { name: 'dagre', rankDir: 'TB', animate: true, animationDuration: 400, padding: 30, fit: true }
  },
  elk: {
    label: 'ELK Layered (renggang)',
    options: {
      name: 'elk', animate: true, animationDuration: 400, padding: 30, fit: true,
      nodeDimensionsIncludeLabels: true,
      elk: {
        algorithm: 'layered',
        // WAJIB compound nodes: cytoscape-elk mengirim objek ini langsung sebagai
        // `layoutOptions` ke ELK (lihat cytoscape-elk.js:241). hierarchyHandling di
        // level options lain akan DIBUANG → kotak modul tak membungkus fitur.
        hierarchyHandling: 'INCLUDE_CHILDREN',
        'layered.spacing.nodeNodeBetweenLayers': 160,
        'layered.spacing.nodeNode': 110,
        'layered.spacing.layerNode': 160,
        'layered.spacing.edgeNode': 40,
        mergeEdges: true
      }
    }
  },
  breadthfirst: {
    label: 'Breadthfirst (alur)',
    options: {
      name: 'breadthfirst', directed: true, spacingFactor: 1.3,
      grid: true, animate: true, animationDuration: 400, padding: 30, fit: true
    }
  },
  circle: {
    label: 'Circle',
    options: { name: 'circle', animate: true, animationDuration: 400, padding: 30, fit: true }
  },
  grid: {
    label: 'Grid',
    options: {
      name: 'grid', animate: true, animationDuration: 400,
      padding: 30, spacingFactor: 1.3, fit: true
    }
  }
};

export const DEFAULT_LAYOUT = 'dagre';

/** Apply a layout to a cytoscape instance.
 *  @param {object} cy cytoscape instance
 *  @param {string} name layout key
 *  @param {object} [opts] { animate } — animate:false untuk layout instan (mis. saat mount)
 *  @returns {object} layout instance (bisa .stop() oleh pemanggil)
 */
export function applyLayout(cy, name, { animate = true } = {}) {
  const def = LAYOUT_DEFS[name] || LAYOUT_DEFS[DEFAULT_LAYOUT];
  // Deep-copy options tiap run: cytoscape memutasi objek options saat run(),
  // jadi reuse referensi yang sama antar-panggilan menyisakan state basi →
  // transisi antar-layout jadi aneh (mis. dagre→ELK tidak sesuai).
  const options = JSON.parse(JSON.stringify(def.options));
  options.animate = animate;
  if (animate) {
    options.animationDuration = 500;
    options.animationEasing = 'ease-in-out';
  }
  const layout = cy.layout(options);
  layout.run();
  return layout;
}
