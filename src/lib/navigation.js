// Navigation helpers shared by the browser and headless checks.
export function collapseGraph(nodes, edges, collapsed = []) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const closed = new Set(collapsed);
  const representative = id => {
    let result = id, current = byId.get(id);
    while (current?.parent) {
      if (closed.has(current.parent)) result = current.parent;
      current = byId.get(current.parent);
    }
    return result;
  };
  const visible = nodes.filter(n => representative(n.id) === n.id);
  const ids = new Set(visible.map(n => n.id));
  const grouped = new Map();
  for (const [source, target, field] of edges) {
    const s = representative(source), t = representative(target);
    if (!ids.has(s) || !ids.has(t) || s === t) continue;
    const key = JSON.stringify([s, t]);
    if (!grouped.has(key)) grouped.set(key, [s, t, []]);
    if (field && !grouped.get(key)[2].includes(field)) grouped.get(key)[2].push(field);
  }
  return { nodes: visible, edges: [...grouped.values()].map(([s,t,f]) => [s,t,f.join(', ')]) };
}
export function revealNode(cy, id, { focus = false, reducedMotion = false } = {}) {
  const node = cy.getElementById(id);
  if (node.empty()) return false;
  const box = node.renderedBoundingBox();
  if (!focus && box.x2 >= 0 && box.y2 >= 0 && box.x1 <= cy.width() && box.y1 <= cy.height()) return false;
  cy.stop(true, false);
  let context = node;
  if (focus && ['feature', 'action'].includes(node.data('type'))) {
    const anchor = node.data('type') === 'action' ? node.parent() : node;
    const origin = anchor.position();
    const nearby = cy.nodes().filter(n => n.data('type') === 'feature' && n.id() !== anchor.id())
      .sort((a, b) => {
        const distance = n => (n.position().x - origin.x) ** 2 + (n.position().y - origin.y) ** 2;
        return distance(a) - distance(b);
      }).slice(0, 3);
    context = context.union(anchor).union(nearby);
  }
  let options = { center: { eles: node } };
  if (focus) {
    const bounds = context.boundingBox();
    const zoom = Math.max(cy.minZoom(), Math.min(1.2, cy.maxZoom(),
      (cy.width() - 120) / bounds.w, (cy.height() - 120) / bounds.h));
    options = { zoom, pan: {
      x: cy.width() / 2 - zoom * (bounds.x1 + bounds.x2) / 2,
      y: cy.height() / 2 - zoom * (bounds.y1 + bounds.y2) / 2
    } };
  }
  if (reducedMotion) { if (focus) cy.viewport(options); else cy.center(node); }
  else cy.animate({ ...options, duration: 250 });
  return true;
}
export function syncElements(cy, elements, cache) {
  const viewport = { zoom: cy.zoom(), pan: { ...cy.pan() } };
  cy.nodes().forEach(n => cache.set(n.id(), { ...n.position() }));
  const incoming = [...elements.nodes, ...elements.edges];
  const ids = new Set(incoming.map(e => e.data.id));
  cy.batch(() => {
    cy.elements().filter(e => !ids.has(e.id())).remove();
    incoming.forEach((e, i) => {
      const old = cy.getElementById(e.data.id);
      if (old.nonempty()) { old.data(e.data); return; }
      const parent = cache.get(e.data.parent) || { x: 0, y: 0 };
      cy.add({ ...e, position: cache.get(e.data.id) || { x: parent.x + 50 + (i % 5) * 45, y: parent.y + 50 + Math.floor(i / 5) * 45 } });
    });
  });
  cy.viewport(viewport);
}
