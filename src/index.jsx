import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, CardContent, Badge, Input } from './components/ui.jsx';
import { LAYOUT_DEFS, DEFAULT_LAYOUT } from './lib/layouts.js';
import { cn } from './lib/utils.js';
import GraphCanvas from './components/GraphCanvas.jsx';
// Content layer — di-generate build.mjs dari --content (detachable).
import * as C from './content.js';

const APP = C.APP || { name: 'Dyalisis', subtitle: 'Feature Analysis Graph' };

export default function DyalisisApp() {
  const [layoutName, setLayoutName] = React.useState(DEFAULT_LAYOUT);
  const [selectedId, setSelectedId] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [cyRef, setCyRef] = React.useState(null);
  const [showActions, setShowActions] = React.useState(false);

  const domains = C.DOMAINS || {};

  // Semua node + parent (compound nesting): modul ⊂ app, fitur ⊂ modul, aksi ⊂ fitur.
  const allNodes = React.useMemo(() => {
    const levelOf = C.levelOf || (() => 0);
    const TYPES = ['app', 'module', 'feature', 'action'];
    const all = [
      ...(C.ROOT ? [{ ...C.ROOT }] : []),
      ...(C.MODULES || []).map((m) => ({ ...m, parent: 'app' })),
      ...(C.NODES || []).map((n) => ({ ...n, parent: `mod-${n.domain}` })),
      ...(C.ACTIONS || [])  // sudah punya parent = feature id
    ];
    return all.map((n) => {
      const level = levelOf(n.id);
      return { level, type: TYPES[level] || 'feature', ...n };
    });
  }, []);

  // Toggle L3 (aksi) — default disembunyikan agar compound view bersih seperti C4.
  const nodes = React.useMemo(
    () => (showActions ? allNodes : allNodes.filter((n) => n.type !== 'action')),
    [allNodes, showActions]
  );

  // Search: node yang match + seluruh ancestor-nya (agar compound tidak orphan).
  const filteredNodes = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const keep = new Set();
    nodes.forEach((n) => {
      if ((n.label || '').toLowerCase().includes(q) || (n.fields || '').toLowerCase().includes(q)) {
        keep.add(n.id);
        let p = n.parent;
        while (p) { keep.add(p); p = byId[p] && byId[p].parent; }
      }
    });
    return nodes.filter((n) => keep.has(n.id));
  }, [query, nodes]);

  // Panah relasi C4 = data-flow antar komponen; hanya tampil bila kedua ujung visible.
  const visibleIds = React.useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
  const edges = React.useMemo(
    () => (C.DATA_EDGES || []).filter(([s, t]) => visibleIds.has(s) && visibleIds.has(t)),
    [visibleIds]
  );

  const selected = nodes.find((n) => n.id === selectedId) || null;
  const d = selected && domains[selected.domain];
  // Aksi (L3) tak punya desc/fields/route sendiri — warisi info dari fitur induknya.
  const parentFeature = selected && selected.type === 'action'
    ? nodes.find((n) => n.id === selected.parent) : null;

  const handleFit = () => { if (cyRef) cyRef.fit(40); };

  return (
    <div className="flex h-full flex-col">
      {/* ===== Header ===== */}
      <header className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            {APP.name.slice(0, 1)}
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">{APP.name}</h1>
            <p className="text-xs text-muted-foreground">{APP.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{(C.MODULES || []).length} Modul</Badge>
          <Badge variant="secondary">{(C.NODES || []).length} Fitur</Badge>
          <Badge variant="secondary">{edges.length} Relasi</Badge>
        </div>
      </header>

      {/* ===== Toolbar ===== */}
      <div className="flex flex-wrap items-center gap-1 border-b bg-card/50 px-4 py-2">
        {Object.entries(LAYOUT_DEFS).map(([key, def]) => (
          <Button
            key={key}
            size="sm"
            variant={layoutName === key ? 'default' : 'ghost'}
            onClick={() => setLayoutName(key)}
          >
            {def.label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant={showActions ? 'default' : 'outline'}
            onClick={() => setShowActions((v) => !v)}
          >
            Aksi (L3)
          </Button>
          <Input
            className="h-8 w-48"
            placeholder="Cari fitur / field…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={handleFit}>
            Fit
          </Button>
        </div>
      </div>

      {/* ===== Main ===== */}
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <GraphCanvas
            nodes={filteredNodes}
            edges={edges}
            domains={domains}
            layoutName={layoutName}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReady={setCyRef}
          />
          {/* Overlay stats kecil */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
            {nodes.length} node · {edges.length} edge · level 0→{Math.max(0, ...Object.keys(C.LEVELS || {}).map(Number))}
          </div>
        </main>

        {/* ===== Sidebar detail ===== */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l p-3">
          {selected ? (
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <Badge style={{ borderColor: d?.color, color: d?.color }}>
                    {d?.label || selected.domain}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    Lv {selected.level}
                  </span>
                </div>
                <h2 className="text-base font-semibold">{selected.label}</h2>
                {selected.type === 'action' ? (
                  <>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Aksi/operasi di dalam fitur <b>{parentFeature?.label || selected.parent}</b>.
                    </p>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fitur induk</p>
                      <code className="block rounded bg-muted px-2 py-1 text-xs">{parentFeature?.label || selected.parent}</code>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Route fitur</p>
                      <code className="block rounded bg-muted px-2 py-1 text-xs">{parentFeature?.route || '-'}</code>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-muted-foreground">{selected.desc}</p>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Field kunci</p>
                      <code className="block rounded bg-muted px-2 py-1 text-xs">{selected.fields}</code>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Route</p>
                      <code className="block rounded bg-muted px-2 py-1 text-xs">{selected.route || '-'}</code>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Permission</p>
                      <code className="block rounded bg-muted px-2 py-1 text-xs">{selected.perm || '-'}</code>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Domain</h3>
                <div className="space-y-1">
                  {Object.entries(domains).map(([key, dom]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: dom.color }} />
                      <span className="flex-1">{dom.label}</span>
                      <span className="text-muted-foreground">{nodes.filter((n) => n.domain === key).length}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Leveling flow</h3>
                <div className="space-y-1">
                  {Object.entries(C.LEVELS || {}).map(([k, ids]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="h-5 min-w-6 justify-center px-1">{k}</Badge>
                      <span className="text-muted-foreground">{C.LEVEL_NAMES?.[k] || ''}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground/60">{ids.length}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<DyalisisApp />);