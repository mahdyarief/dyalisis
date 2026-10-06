import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, CardContent, Badge, Input } from './components/ui.jsx';
import { LAYOUT_DEFS, DEFAULT_LAYOUT } from './lib/layouts.js';
import { cn } from './lib/utils.js';
import GraphCanvas from './components/GraphCanvas.jsx';
import Legend from './components/Legend.jsx';
import UmlDiagram from './components/UmlDiagram.jsx';
import {
  IconPlus, IconMinus, IconFit, IconDownload, IconSun, IconMoon,
  IconSearch, IconPanel, IconChevron, IconArrowRight, IconArrowLeft, IconTarget,
  IconChevronDown, IconCheck
} from './components/icons.jsx';
// Content layer — di-generate build.mjs dari --content (detachable).
import * as C from './content.js';

const APP = C.APP || { name: 'Dyalisis', subtitle: 'Feature Analysis Graph' };

// Bangun jalur alur data end-to-end dari DATA_EDGES: telusuri ke hulu (edges
// yang menunjuk node) lalu ke hilir, tanpa mengunjungi node dua kali.
function buildFlow(startId, dataEdges) {
  const outMap = {};
  const inMap = {};
  (dataEdges || []).forEach(([s, t, f]) => {
    (outMap[s] = outMap[s] || []).push({ to: t, field: f });
    (inMap[t] = inMap[t] || []).push({ from: s, field: f });
  });
  const seen = new Set([startId]);
  const back = [];
  let cur = startId;
  while (inMap[cur]) {
    const nxt = inMap[cur].find((e) => !seen.has(e.from));
    if (!nxt) break;
    back.unshift(nxt.from);
    seen.add(nxt.from);
    cur = nxt.from;
  }
  const fwd = [];
  cur = startId;
  while (outMap[cur]) {
    const nxt = outMap[cur].find((e) => !seen.has(e.to));
    if (!nxt) break;
    fwd.push(nxt.to);
    seen.add(nxt.to);
    cur = nxt.to;
  }
  return [...back, startId, ...fwd];
}

export default function DyalisisApp() {
  const [layoutName, setLayoutName] = React.useState(DEFAULT_LAYOUT);
  const [selectedId, setSelectedId] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [cyRef, setCyRef] = React.useState(null);
  const [showActions, setShowActions] = React.useState(false);
  const [theme, setTheme] = React.useState('dark');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [layoutMenuOpen, setLayoutMenuOpen] = React.useState(false);
  const [flowMode, setFlowMode] = React.useState(false);
  const searchRef = React.useRef(null);
  const layoutMenuRef = React.useRef(null);

  const domains = C.DOMAINS || {};

  // Semua node + parent (compound nesting): modul ⊂ app, fitur ⊂ modul, aksi ⊂ fitur.
  const allNodes = React.useMemo(() => {
    const levelOf = C.levelOf || (() => 0);
    const all = [
      ...(C.ROOT ? [{ ...C.ROOT }] : []),
      ...(C.MODULES || []).map((m) => ({ ...m, parent: 'app' })),
      ...(C.NODES || []).map((n) => ({ ...n, parent: `mod-${n.domain}` })),
      ...(C.ACTIONS || []) // sudah punya parent = feature id
    ];
    return all.map((n) => ({ level: levelOf(n.id), type: ['app', 'module', 'feature', 'action'][levelOf(n.id)] || 'feature', ...n }));
  }, []);
  const byIdAll = React.useMemo(() => Object.fromEntries(allNodes.map((n) => [n.id, n])), [allNodes]);

  // Toggle L3 (aksi) — default disembunyikan agar compound view bersih seperti C4.
  const nodes = React.useMemo(
    () => (showActions ? allNodes : allNodes.filter((n) => n.type !== 'action')),
    [allNodes, showActions]
  );

  // Hasil pencarian (untuk highlight di graph + state kosong).
  const matchIds = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes
      .filter((n) => (n.label || '').toLowerCase().includes(q) || (n.fields || '').toLowerCase().includes(q))
      .map((n) => n.id);
  }, [query, nodes]);

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

  // Breadcrumb: rantai leluhur Aplikasi › Modul › Fitur › Aksi.
  const chain = React.useMemo(() => {
    if (!selected) return [];
    const out = [];
    let cur = selected;
    while (cur) { out.unshift(cur); cur = cur.parent ? byIdAll[cur.parent] : null; }
    return out;
  }, [selected, byIdAll]);

  // Anak langsung (modul→fitur, fitur→aksi, app→modul) — dari allNodes.
  const children = React.useMemo(
    () => (selected ? allNodes.filter((n) => n.parent === selected.id) : []),
    [selected, allNodes]
  );

  // Relasi data (DATA_EDGES) yang menyentuh node ini.
  const related = React.useMemo(() => {
    if (!selected) return [];
    const out = [];
    (C.DATA_EDGES || []).forEach(([s, t, f]) => {
      if (s === selected.id) out.push({ out: true, other: t, field: f });
      else if (t === selected.id) out.push({ out: false, other: s, field: f });
    });
    return out;
  }, [selected]);

  // UML class diagram: untuk aksi (L3) tampilkan kelas fitur induknya.
  const umlNode = selected && selected.type === 'action' ? (parentFeature || selected) : selected;
  const umlRelated = React.useMemo(() => {
    if (!umlNode) return [];
    const out = [];
    (C.DATA_EDGES || []).forEach(([s, t, f]) => {
      if (s === umlNode.id) out.push({ out: true, other: t, field: f });
      else if (t === umlNode.id) out.push({ out: false, other: s, field: f });
    });
    return out;
  }, [umlNode]);
  const umlChildren = React.useMemo(
    () => (umlNode ? allNodes.filter((n) => n.parent === umlNode.id) : []),
    [umlNode, allNodes]
  );

  // Mode Alur: dari fitur terpilih, telusuri rantai relasi data end-to-end.
  const flowPath = React.useMemo(() => {
    if (!flowMode || !selected || selected.type !== 'feature') return [];
    return buildFlow(selected.id, C.DATA_EDGES || []);
  }, [flowMode, selected]);

  // Set node yang di-highlight di graph: pencarian menang, lalu mode Alur.
  const highlightIds = React.useMemo(() => {
    if (query.trim()) return matchIds;
    if (flowMode) return flowPath;
    return [];
  }, [query, matchIds, flowMode, flowPath]);

  // Pilih node + pastikan ia terlihat (jika tersembunyi karena filter/toggle).
  const selectNode = React.useCallback((id) => {
    const node = byIdAll[id];
    if (!node) return;
    if (node.type === 'action' && !showActions) setShowActions(true);
    if (query && !visibleIds.has(id)) setQuery('');
    setSelectedId(id);
  }, [byIdAll, showActions, query, visibleIds]);

  // Center ke node terpilih (dipakai anak/relasi/breadcrumb & tombol Zoom).
  const zoomToNode = React.useCallback((id) => {
    const cy = cyRef;
    if (!cy) return;
    const n = cy.getElementById(id);
    if (n.empty()) return;
    cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1.3), duration: 350, easing: 'ease-in-out' });
  }, [cyRef]);

  React.useEffect(() => {
    if (!selectedId) return;
    const t = setTimeout(() => zoomToNode(selectedId), 30);
    return () => clearTimeout(t);
  }, [selectedId, zoomToNode]);

  // Terapkan tema ke <html> (kelas .dark) agar token shadcn ikut berubah.
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Pintasan keyboard: "/" fokus ke pencarian, Esc bersihkan.
  React.useEffect(() => {
    const onKey = (e) => {
      const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
      if (e.key === '/' && !typing) { e.preventDefault(); if (searchRef.current) searchRef.current.focus(); }
      else if (e.key === 'Escape') { setQuery(''); if (document.activeElement) document.activeElement.blur(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Tutup dropdown mode saat klik di luar / Esc.
  React.useEffect(() => {
    if (!layoutMenuOpen) return;
    const onDown = (e) => { if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target)) setLayoutMenuOpen(false); };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [layoutMenuOpen]);

  const zoomBy = (f) => {
    const cy = cyRef;
    if (!cy) return;
    const level = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * f));
    cy.zoom({ level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };
  const handleFit = () => { if (cyRef) cyRef.fit(40); };
  const exportPng = () => {
    const cy = cyRef;
    if (!cy) return;
    const uri = cy.png({ full: true, scale: 2, bg: theme === 'dark' ? '#020617' : '#ffffff' });
    const a = document.createElement('a');
    a.href = uri;
    a.download = `${(APP.name || 'dyalisis').replace(/\s+/g, '-').toLowerCase()}-feature-graph.png`;
    a.click();
  };

  const emptySearch = !!query.trim() && matchIds.length === 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b bg-card px-4 py-2">
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
          <Badge variant="secondary" className="hidden sm:inline-flex">{(C.MODULES || []).length} Modul</Badge>
          <Badge variant="secondary" className="hidden sm:inline-flex">{(C.NODES || []).length} Fitur</Badge>
          <Badge variant="secondary" className="hidden md:inline-flex">{edges.length} Relasi</Badge>
          <Button size="icon" variant="ghost" title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </Button>
          <Button size="icon" variant="ghost" title={sidebarOpen ? 'Sembunyikan panel' : 'Tampilkan panel'}
            onClick={() => setSidebarOpen((v) => !v)}>
            <IconPanel />
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1 border-b bg-card/50 px-4 py-2">
        <span className="hidden text-xs text-muted-foreground md:inline">
          Mode layout & tampilan Aksi (L3) ada di kanan-bawah kanvas.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input ref={searchRef} className="h-8 w-44 pl-7 md:w-56" placeholder="Cari fitur / field…  ( / )"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Zoom in" onClick={() => zoomBy(1.3)}><IconPlus /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Zoom out" onClick={() => zoomBy(1 / 1.3)}><IconMinus /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Fit ke layar" onClick={handleFit}><IconFit /></Button>
          </div>
          <Button size="sm" variant="outline" className="gap-1" onClick={exportPng}><IconDownload /> PNG</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <GraphCanvas nodes={filteredNodes} edges={edges} domains={domains} layoutName={layoutName}
            selectedId={selectedId} matchIds={highlightIds} theme={theme} onSelect={setSelectedId} onReady={setCyRef} />
          <Legend domains={domains} showActions={showActions} />
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
            {filteredNodes.length} node · {edges.length} edge
          </div>

          {/* Klaster mode: layout + tampilan Aksi (L3) — kontekstual ke kanvas. */}
          <div ref={layoutMenuRef} className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
            <Button size="sm" variant={flowMode ? 'default' : 'outline'} className="gap-1 shadow"
              title="Tampilkan jalur alur data end-to-end dari fitur terpilih" onClick={() => setFlowMode((v) => !v)}>
              {flowMode && <IconCheck className="h-3.5 w-3.5" />} Alur
            </Button>
            <Button size="sm" variant={showActions ? 'default' : 'outline'} className="gap-1 shadow"
              title="Tampilkan/sembunyikan level Aksi (L3)" onClick={() => setShowActions((v) => !v)}>
              {showActions && <IconCheck className="h-3.5 w-3.5" />} Aksi (L3)
            </Button>
            <div className="relative">
              <Button size="sm" variant="secondary" className="gap-1 shadow"
                title="Mode layout" onClick={() => setLayoutMenuOpen((v) => !v)}>
                {LAYOUT_DEFS[layoutName].label} <IconChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
              {layoutMenuOpen && (
                <div className="absolute bottom-full right-0 mb-1 w-52 overflow-hidden rounded-md border bg-popover p-1 shadow-md">
                  {Object.entries(LAYOUT_DEFS).map(([key, def]) => (
                    <button key={key}
                      className={cn('flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent',
                        key === layoutName && 'bg-accent/60 font-medium')}
                      onClick={() => { setLayoutName(key); setLayoutMenuOpen(false); }}>
                      {def.label}
                      {key === layoutName && <IconCheck className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className={cn('no-scrollbar shrink-0 overflow-y-auto border-l bg-card/30 transition-all duration-200',
          sidebarOpen ? 'w-80 p-3' : 'w-0 overflow-hidden border-l-0 p-0')}>
          {emptySearch ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 p-6 text-center">
              <IconSearch className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Tidak ada fitur cocok</p>
              <p className="text-xs text-muted-foreground">Tidak ada fitur atau field yang mengandung “{query.trim()}”.</p>
              <Button size="sm" variant="outline" onClick={() => setQuery('')}>Bersihkan</Button>
            </div>
          ) : selected ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <nav className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  {chain.map((n, i) => (
                    <React.Fragment key={n.id}>
                      {i > 0 && <IconChevron className="h-3 w-3 opacity-60" />}
                      <button className={cn('rounded px-1 hover:text-foreground', i === chain.length - 1 && 'font-medium text-foreground')}
                        onClick={() => selectNode(n.id)}>{n.label}</button>
                    </React.Fragment>
                  ))}
                </nav>
                <div className="flex items-center justify-between">
                  <Badge style={{ borderColor: d && d.color, color: d && d.color }}>{d ? d.label : selected.domain}</Badge>
                  <span className="text-[11px] text-muted-foreground">Lv {selected.level}</span>
                </div>
                <h2 className="text-base font-semibold">{selected.label}</h2>
                {selected.type === 'action' ? (
                  <>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Aksi/operasi di dalam fitur <b>{parentFeature ? parentFeature.label : selected.parent}</b>.
                    </p>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fitur induk</p>
                      <code className="block rounded bg-muted px-2 py-1 text-xs">{parentFeature ? parentFeature.label : selected.parent}</code>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Route fitur</p>
                      <code className="block rounded bg-muted px-2 py-1 text-xs">{(parentFeature && parentFeature.route) || '-'}</code>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed text-muted-foreground">{selected.desc}</p>
                    <div>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Field kunci</p>
                      <code className="block rounded bg-muted px-2 py-1 text-xs">{selected.fields || '-'}</code>
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
                <Button size="sm" variant="outline" className="w-full gap-1" onClick={() => zoomToNode(selected.id)}>
                  <IconTarget /> Zoom ke node
                </Button>
                {umlNode && (
                  <UmlDiagram node={umlNode} byId={byIdAll} related={umlRelated}
                    children={umlChildren} domains={domains} theme={theme}
                    highlight={selected.type === 'action' ? selected.label : null} />
                )}
                {children.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Isi ({children.length})</p>
                    <div className="space-y-1">
                      {children.map((c) => (
                        <button key={c.id} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                          onClick={() => selectNode(c.id)}>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: (domains[c.domain] || {}).color || '#94a3b8' }} />
                          <span className="flex-1 truncate">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {related.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Relasi data</p>
                    <div className="space-y-1">
                      {related.map((r, i) => (
                        <button key={i} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                          onClick={() => selectNode(r.other)}>
                          {r.out ? <IconArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                 : <IconArrowLeft className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          <span className="flex-1 truncate">{byIdAll[r.other] ? byIdAll[r.other].label : r.other}</span>
                          <code className="text-[10px] text-muted-foreground">{r.field}</code>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {flowMode && flowPath.length > 1 && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Alur End-to-End ({flowPath.length} langkah)
                    </p>
                    <div className="space-y-1">
                      {flowPath.map((id, i) => {
                        const n = byIdAll[id];
                        return (
                          <button key={id} className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted',
                            id === selectedId && 'bg-muted font-medium')}
                            onClick={() => selectNode(id)}>
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground">{i + 1}</span>
                            <span className="flex-1 truncate">{n ? n.label : id}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Graph memetakan aplikasi dalam empat tingkat: <b>Aplikasi</b> (root) berisi
                <b> Modul</b> (domain fungsional), tiap modul berisi <b>Fitur</b>, dan tiap fitur
                dapat dibuka sampai <b>Aksi</b> (operasi/route). Klik node untuk detailnya; klik
                node di dalam kotak untuk drill-down level berikutnya. Warna & bentuk node
                dijelaskan di legenda pojok kanan atas.
              </p>
              <div className="rounded-md border bg-muted/40 p-2 text-[11px] text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Pintasan</p>
                <p>“/” fokus pencarian · Esc bersihkan</p>
                <p>Mode layout, “Alur” (jalur end-to-end), &amp; “Aksi (L3)” ada di kanan-bawah kanvas.</p>
                <p>Klik node → sidebar memuat detail + UML class diagram.</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// Mount
const root = createRoot(document.getElementById('root'));
root.render(<DyalisisApp />);
