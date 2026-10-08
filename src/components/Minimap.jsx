import * as React from 'react';

export default function Minimap({ cy }) {
  const [snapshot, setSnapshot] = React.useState(null);
  React.useEffect(() => {
    if (!cy) return;
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = cy.elements().boundingBox();
        if (!Number.isFinite(box.x1)) return;
        setSnapshot({ box, extent: cy.extent(), nodes: cy.nodes().map(n => ({ id: n.id(), ...n.position(), color: n.data('color'), parent: n.isParent() })) });
      });
    };
    cy.on('pan zoom position add remove layoutstop resize', update); update();
    return () => { cancelAnimationFrame(frame); cy.off('pan zoom position add remove layoutstop resize', update); };
  }, [cy]);
  if (!snapshot) return null;
  const { box, extent, nodes } = snapshot;
  const width = Math.max(box.w, 1), height = Math.max(box.h, 1);
  const move = (x, y) => { cy.stop(true, false); cy.pan({ x: cy.width() / 2 - x * cy.zoom(), y: cy.height() / 2 - y * cy.zoom() }); };
  return <svg aria-label="Graph minimap" role="button" tabIndex={0} className="absolute left-2 top-2 h-24 w-36 rounded border bg-card/90" viewBox={`${box.x1} ${box.y1} ${width} ${height}`} preserveAspectRatio="none"
    onKeyDown={e => { const delta = { ArrowLeft: [-width / 10, 0], ArrowRight: [width / 10, 0], ArrowUp: [0, -height / 10], ArrowDown: [0, height / 10] }[e.key]; if (delta) { e.preventDefault(); move((extent.x1 + extent.x2) / 2 + delta[0], (extent.y1 + extent.y2) / 2 + delta[1]); } }}
    onPointerDown={e => { const rect = e.currentTarget.getBoundingClientRect(); move(box.x1 + (e.clientX - rect.left) / rect.width * width, box.y1 + (e.clientY - rect.top) / rect.height * height); }}>
    {nodes.filter(n => !n.parent).map(n => <circle key={n.id} cx={n.x} cy={n.y} r={width / 110} fill={n.color} />)}
    <rect x={extent.x1} y={extent.y1} width={extent.w} height={extent.h} fill="none" stroke="currentColor" strokeWidth={width / 200} />
  </svg>;
}
