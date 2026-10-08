import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, CardContent, Badge, Input } from './components/ui.jsx';
import { LAYOUT_DEFS, DEFAULT_LAYOUT } from './lib/layouts.js';
import { graphPalette } from './lib/graph-style.js';
import { buildActivePath } from './lib/flow.js';
import { analyze, noteInfo } from './lib/analysis.js';
import { cn } from './lib/utils.js';
import GraphCanvas from './components/GraphCanvas.jsx';
import Legend from './components/Legend.jsx';
import UmlDiagram from './components/UmlDiagram.jsx';
import ErdDiagram from './components/ErdDiagram.jsx';
import DocsPanel from './components/DocsPanel.jsx';
import InsightPanel from './components/InsightPanel.jsx';
import {
  IconPlus, IconMinus, IconFit, IconDownload, IconSun, IconMoon,
  IconSearch, IconPanel, IconChevron, IconArrowRight, IconArrowLeft, IconTarget,
  IconChevronDown, IconCheck, IconBook, IconClose, IconFilter
} from './components/icons.jsx';
// Content layer — alias `@dyalisis/content` dipasang build.mjs; engine tetap
// read-only karena tak ada file generated yang ditulis ke paket. Content diambil
// dari proyek pemakai (./dyalisis.content.js), bukan dari dalam paket.
import * as C from '@dyalisis/content';

const APP = C.APP || { name: 'Dyalisis', subtitle: 'Feature Analysis Graph' };

// Breakpoint desktop: panel samping inline (lg). Di bawahnya panel jadi drawer
// overlay yang bisa dibuka/tutup — supaya kanvas tetap lega di layar kecil.
const DESKTOP_MQ = '(min-width: 1024px)';
const isDesktopViewport = () =>
  typeof window !== 'undefined' && window.matchMedia(DESKTOP_MQ).matches;

// Pilihan level untuk filter facet (L1–L3) — dipakai tombol panel + chip aktif.
const LEVEL_CHOICES = [[1, 'Modul'], [2, 'Fitur'], [3, 'Aksi']];
const levelLabel = (lv) => (LEVEL_CHOICES.find(([v]) => v === lv) || [null, `L${lv}`])[1];

export default function DyalisisApp() {
  const [layoutName, setLayoutName] = React.useState(DEFAULT_LAYOUT);
  const [selectedId, setSelectedId] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [cyRef, setCyRef] = React.useState(null);
  const [showActions, setShowActions] = React.useState(false);
  const [theme, setTheme] = React.useState('dark');
  const [sidebarOpen, setSidebarOpen] = React.useState(isDesktopViewport);
  const [layoutMenuOpen, setLayoutMenuOpen] = React.useState(false);
  const [flowMode, setFlowMode] = React.useState(false);
  const [flowStart, setFlowStart] = React.useState(null);       // fitur awal jalur Alur
  const [branchChoice, setBranchChoice] = React.useState({});   // { nodeId: successorId }
  const [docsOpen, setDocsOpen] = React.useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = React.useState(false);
  // Filter facet — potong graf per domain, per level, atau hanya node ber-Catatan.
  // Melengkapi pencarian teks: facet berlaku lebih dulu, lalu query mempersempit.
  const [facetDomain, setFacetDomain] = React.useState(null);
  const [facetLevel, setFacetLevel] = React.useState(null);
  const [facetNoted, setFacetNoted] = React.useState(false);
  const searchRef = React.useRef(null);
  const layoutMenuRef = React.useRef(null);
  const filterMenuRef = React.useRef(null);

  const domains = C.DOMAINS || {};

  // ===== Catatan node — VIEW dari content, bukan penyimpanan =====
  // Catatan kritis per node (aturan bisnis tak tertulis, jebakan integrasi,
  // sumber kebenaran data) datang dari simbol opsional `NOTES` di content:
  // { idNode: 'teks' }. Framework hanya MENAMPILKAN-nya sebagai view — badge
  // pada node, panel baca-saja di sidebar, hitungan di legenda. Tidak ada input
  // atau penyimpanan baru; ubah catatan dengan menyunting content lalu build.
  const notes = C.NOTES || {};
  const notedIds = Object.keys(notes);

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

  // Analisis graf turunan (hub/chokepoint, coupling lintas-modul, terisolasi).
  // Sama dengan yang mengisi dist/graph.json — dihitung sekali karena content statis.
  const insight = React.useMemo(() => analyze(C), []);

  // Toggle L3 (aksi) — default disembunyikan agar compound view bersih seperti C4.
  const nodes = React.useMemo(
    () => (showActions ? allNodes : allNodes.filter((n) => n.type !== 'action')),
    [allNodes, showActions]
  );

  // Filter facet: node yang lolos domain/level/catatan + seluruh ancestor-nya
  // (agar compound tidak orphan — pola sama seperti pencarian di bawah).
  const hasFacets = facetDomain != null || facetLevel != null || facetNoted;
  // Turunan facet untuk UI: hitungan aktif, reset, dan daftar chip yang bisa dihapus.
  const facetCount = (facetDomain != null ? 1 : 0) + (facetLevel != null ? 1 : 0) + (facetNoted ? 1 : 0);
  const resetFacets = React.useCallback(() => {
    setFacetDomain(null); setFacetLevel(null); setFacetNoted(false);
  }, []);
  const activeFacets = React.useMemo(() => {
    const out = [];
    if (facetDomain != null && domains[facetDomain]) {
      out.push({
        key: `dom-${facetDomain}`,
        label: domains[facetDomain].label,
        dot: domains[facetDomain].color,
        clear: () => setFacetDomain(null)
      });
    }
    if (facetLevel != null) {
      out.push({ key: `lvl-${facetLevel}`, label: levelLabel(facetLevel), clear: () => setFacetLevel(null) });
    }
    if (facetNoted) {
      out.push({ key: 'noted', label: 'Ber-Catatan', clear: () => setFacetNoted(false) });
    }
    return out;
  }, [facetDomain, facetLevel, facetNoted, domains]);
  const facetedNodes = React.useMemo(() => {
    if (!hasFacets) return nodes;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const effDomain = (n) => n.domain || (byId[n.parent] && byId[n.parent].domain);
    const keep = new Set();
    nodes.forEach((n) => {
      const ok =
        (facetDomain == null || effDomain(n) === facetDomain) &&
        (facetLevel == null || n.level === facetLevel) &&
        (!facetNoted || !!notes[n.id]);
      if (ok) {
        keep.add(n.id);
        let p = n.parent;
        while (p) { keep.add(p); p = byId[p] && byId[p].parent; }
      }
    });
    return nodes.filter((n) => keep.has(n.id));
  }, [nodes, facetDomain, facetLevel, facetNoted, hasFacets, notes]);

  // Hasil pencarian (untuk highlight di graph + state kosong).
  const matchIds = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return facetedNodes
      .filter((n) => (n.label || '').toLowerCase().includes(q) || (n.fields || '').toLowerCase().includes(q))
      .map((n) => n.id);
  }, [query, facetedNodes]);

  // Search: node yang match + seluruh ancestor-nya (agar compound tidak orphan).
  const filteredNodes = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return facetedNodes;
    const byId = Object.fromEntries(facetedNodes.map((n) => [n.id, n]));
    const keep = new Set();
    facetedNodes.forEach((n) => {
      if ((n.label || '').toLowerCase().includes(q) || (n.fields || '').toLowerCase().includes(q)) {
        keep.add(n.id);
        let p = n.parent;
        while (p) { keep.add(p); p = byId[p] && byId[p].parent; }
      }
    });
    return facetedNodes.filter((n) => keep.has(n.id));
  }, [query, facetedNodes]);

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
  // ERD modul: node modul pakai dirinya; fitur/aksi pakai modul induknya
  // (spec Markdown menaruh ERD di tingkat modul, bukan per fitur).
  const erdModule = React.useMemo(() => {
    if (!selected) return null;
    if (selected.type === 'module') return selected;
    return byIdAll[`mod-${selected.domain}`] || null;
  }, [selected, byIdAll]);

  // Mode Alur: susun SATU jalur aktif dari fitur start menuju hilir — selektif,
  // bukan sub-grafik penuh (yang di graph kecil menyalakan hampir semua node,
  // sampai highlight tak bermakna). Percabangan diselesaikan lewat branchChoice;
  // lihat buildActivePath() di src/lib/flow.js.
  const flow = React.useMemo(() => {
    if (!flowMode || !flowStart) return { path: [], edges: [], branches: {} };
    return buildActivePath(flowStart, C.DATA_EDGES || [], branchChoice);
  }, [flowMode, flowStart, branchChoice]);
  const flowPath = flow.path;

  // Field penghubung masuk per langkah (jalur linear → tiap langkah satu field).
  const flowIncoming = React.useMemo(() => {
    const m = {};
    flow.edges.forEach(([, t, f]) => { if (f) m[t] = f; });
    return m;
  }, [flow]);

  // Aktifkan Alur: kunci titik start dari fitur terpilih, reset pilihan cabang.
  const toggleFlow = React.useCallback(() => {
    if (!flowMode) {
      setFlowStart(selected && selected.type === 'feature' ? selected.id : null);
      setBranchChoice({});
    }
    setFlowMode((v) => !v);
  }, [flowMode, selected]);

  // Ganti cabang di satu titik percabangan → jalur dihitung ulang.
  const selectBranch = React.useCallback((nodeId, successorId) => {
    setBranchChoice((prev) => ({ ...prev, [nodeId]: successorId }));
  }, []);

  // Saat Alur aktif: memilih fitur DI LUAR jalur memindahkan titik start ke
  // fitur itu; memilih langkah yang sudah ada di jalur hanya memindahkan
  // penanda langkah aktif (tidak menghitung ulang dari langkah itu).
  React.useEffect(() => {
    if (!flowMode || !selected || selected.type !== 'feature') return;
    if (!flowStart) { setFlowStart(selected.id); return; }
    if (!flowPath.includes(selected.id)) setFlowStart(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, flowMode]);

  // Set node yang di-highlight di graph: pencarian menang, lalu mode Alur.
  const highlightIds = React.useMemo(() => {
    if (query.trim()) return matchIds;
    if (flowMode) return flowPath;
    return [];
  }, [query, matchIds, flowMode, flowPath]);

  // Saat pencarian aktif, bahasa visual Alur (border .flow + edge .chain) harus
  // mati — kalau tidak, hasil pencarian ikut ter-stempel sebagai node jalur alur
  // padahal bukan. Sidebar tetap menampilkan daftar langkahnya sebagai konteks.
  const graphFlowPath = query.trim() ? [] : flowPath;

  // Posisi node terpilih di dalam jalur Alur (untuk navigasi langkah).
  const flowIdx = selected ? flowPath.indexOf(selected.id) : -1;

  // Pilih node + pastikan ia terlihat (jika tersembunyi karena filter/toggle).
  const selectNode = React.useCallback((id) => {
    const node = byIdAll[id];
    if (!node) return;
    if (node.type === 'action' && !showActions) setShowActions(true);
    if (query && !visibleIds.has(id)) setQuery('');
    if (hasFacets && !visibleIds.has(id)) {
      resetFacets();
    }
    setSelectedId(id);
  }, [byIdAll, showActions, query, visibleIds, hasFacets, resetFacets]);

  // Tap pada kanvas: klik latar (id null) membersihkan seleksi sekaligus
  // melepas mode Alur, supaya fokus jalur tidak menggantung saat pengguna
  // menutup pilihan dengan klik di luar area. Klik node biasa hanya memindah
  // seleksi (mode Alur tetap aktif).
  const handleCanvasSelect = React.useCallback((id) => {
    if (id == null) {
      setSelectedId(null);
      setFlowMode(false);
    } else {
      setSelectedId(id);
    }
  }, []);

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

  // Panel samping: inline di desktop, drawer overlay di mobile. Ikuti breakpoint
  // saat ukuran layar berubah (buka di desktop, tutup di mobile) supaya state
  // tidak nyangkut setelah rotasi/resize.
  React.useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const onChange = (e) => setSidebarOpen(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Di mobile, memilih node membuka drawer detail (di desktop panel sudah tampak).
  React.useEffect(() => {
    if (selectedId && !window.matchMedia(DESKTOP_MQ).matches) setSidebarOpen(true);
  }, [selectedId]);

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

  // Tutup panel Filter saat klik di luar / Esc.
  React.useEffect(() => {
    if (!filterMenuOpen) return;
    const onDown = (e) => { if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) setFilterMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setFilterMenuOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [filterMenuOpen]);

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

  const noFacetMatch = hasFacets && facetedNodes.length === 0;
  const emptySearch = (!!query.trim() && matchIds.length === 0) || noFacetMatch;

  // Catatan node terpilih (teks + provenance) — dinormalkan lewat helper engine.
  const selectedNote = selected ? noteInfo(notes, selected.id) : { text: null, provenance: null };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b bg-card px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            {APP.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight">{APP.name}</h1>
            <p className="truncate text-xs text-muted-foreground">{APP.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="hidden sm:inline-flex">{(C.MODULES || []).length} Modul</Badge>
          <Badge variant="secondary" className="hidden sm:inline-flex">{(C.NODES || []).length} Fitur</Badge>
          <Badge variant="secondary" className="hidden md:inline-flex">{edges.length} Relasi</Badge>
          <Button size="icon" variant="ghost" title="Dokumentasi arsitektur (C4 · arc42 · ADR · Diátaxis)"
            onClick={() => setDocsOpen(true)}>
            <IconBook />
          </Button>
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

      <div className="flex flex-wrap items-center gap-2 border-b bg-card/50 px-3 py-2 sm:px-4">
        <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
          Mode layout &amp; tampilan Aksi (L3) ada di kanan-bawah kanvas.
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-56">
            <IconSearch className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input ref={searchRef} className="h-8 pl-7" placeholder="Cari fitur / field…"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex shrink-0 items-center gap-0.5 rounded-md border p-0.5">
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Zoom in" onClick={() => zoomBy(1.3)}><IconPlus /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Zoom out" onClick={() => zoomBy(1 / 1.3)}><IconMinus /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Fit ke layar" onClick={handleFit}><IconFit /></Button>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={exportPng}><IconDownload /><span className="hidden sm:inline">PNG</span></Button>
        </div>
      </div>

      {/* Filter facet — potong graf per domain / level / Catatan.
          Pola popover: satu tombol "Filter" + chip filter aktif; opsi lengkap
          di panel ter-anchor. Tanpa scroll horizontal di lebar mana pun. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-card/30 px-3 py-1.5 text-[11px] sm:px-4">
        <div ref={filterMenuRef} className="relative">
          <button
            className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors',
              hasFacets ? 'border-primary/40 bg-accent font-medium' : 'hover:bg-accent/50')}
            aria-expanded={filterMenuOpen}
            title="Filter graf per domain, level, atau catatan"
            onClick={() => setFilterMenuOpen((v) => !v)}>
            <IconFilter className="h-3.5 w-3.5" />
            Filter
            {facetCount > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                {facetCount}
              </span>
            )}
            <IconChevronDown className={cn('h-3 w-3 opacity-60 transition-transform', filterMenuOpen && 'rotate-180')} />
          </button>

          {filterMenuOpen && (
            <div className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border bg-popover shadow-lg">
              <div className="px-3 pb-1 pt-2.5">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Domain</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(domains).map(([key, dv]) => (
                    <button key={key}
                      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                        facetDomain === key ? 'bg-accent font-medium' : 'hover:bg-accent/50')}
                      onClick={() => setFacetDomain(facetDomain === key ? null : key)}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dv.color }} />
                      {dv.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="my-1 h-px bg-border" />
              <div className="px-3 pb-1">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Level</p>
                <div className="flex flex-wrap gap-1">
                  {LEVEL_CHOICES.map(([lv, label]) => (
                    <button key={lv}
                      className={cn('rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                        facetLevel === lv ? 'bg-accent font-medium' : 'hover:bg-accent/50')}
                      onClick={() => { const next = facetLevel === lv ? null : lv; setFacetLevel(next); if (next === 3) setShowActions(true); }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="my-1 h-px bg-border" />
              <div className="px-3 pb-2.5">
                <button
                  className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                    facetNoted ? 'bg-accent font-medium' : 'hover:bg-accent/50')}
                  onClick={() => setFacetNoted((v) => !v)}>
                  {facetNoted && <IconCheck className="h-3 w-3" />} Ber-Catatan
                </button>
              </div>
              {hasFacets && (
                <>
                  <div className="h-px bg-border" />
                  <button
                    className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                    onClick={resetFacets}>
                    <IconClose className="h-3 w-3" /> Reset semua filter
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Chip filter aktif — bisa dihapus. Di mobile disembunyikan (hemat ruang,
            tombol Filter sudah memuat badge jumlah). */}
        {activeFacets.length > 0 && (
          <div className="hidden min-w-0 flex-wrap items-center gap-1.5 sm:flex">
            {activeFacets.map((f) => (
              <button key={f.key}
                className="inline-flex items-center gap-1 rounded-full border bg-secondary/60 px-2 py-0.5 text-[11px] transition-colors hover:bg-secondary"
                title={`Hapus filter ${f.label}`}
                onClick={f.clear}>
                {f.dot != null && <span className="h-1.5 w-1.5 rounded-full" style={{ background: f.dot }} />}
                {f.label}
                <IconClose className="h-3 w-3 opacity-60" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <GraphCanvas nodes={filteredNodes} edges={edges} domains={domains} layoutName={layoutName}
            selectedId={selectedId} matchIds={highlightIds} flowPath={graphFlowPath} notedIds={notedIds}
            theme={theme} onSelect={handleCanvasSelect} onReady={setCyRef} />
          <Legend domains={domains} showActions={showActions} flowActive={flowMode && graphFlowPath.length > 1}
            notedCount={notedIds.length} highlight={graphPalette(theme).highlight}
            noteColor={graphPalette(theme).noteColor} />
          <div className="pointer-events-none absolute bottom-3 left-3 hidden rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur sm:block">
            {filteredNodes.length} node · {edges.length} edge
          </div>

          {/* Klaster mode: layout + tampilan Aksi (L3) — kontekstual ke kanvas. */}
          <div ref={layoutMenuRef} className="absolute bottom-3 right-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2">
            <Button size="sm" variant={flowMode ? 'default' : 'outline'} className="gap-1 shadow"
              title="Tampilkan jalur alur data end-to-end dari fitur terpilih" onClick={toggleFlow}>
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

        {sidebarOpen && (
          <div className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)} aria-hidden="true" />
        )}

        <aside className={cn(
          'no-scrollbar overflow-y-auto bg-card/30',
          // Mobile: drawer overlay dari kanan (lebar tetap, geser masuk/keluar).
          'fixed inset-y-0 right-0 z-30 w-80 max-w-[85vw] border-l p-3 shadow-xl transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full',
          // Desktop: kembali ke layout inline; lebar dikontrol lewat state.
          'lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:shadow-none lg:transition-none',
          sidebarOpen ? 'lg:w-80 lg:p-3' : 'lg:w-0 lg:overflow-hidden lg:border-l-0 lg:p-0'
        )}>
          {/* Mobile-only: tombol tutup (drawer menutupi sebagian besar layar,
              jadi strip backdrop terlalu tipis untuk diandalkan). */}
          <div className="mb-2 flex justify-end lg:hidden">
            <Button size="icon" variant="ghost" title="Tutup panel"
              className="h-8 w-8" onClick={() => setSidebarOpen(false)}>
              <IconClose />
            </Button>
          </div>
          {emptySearch ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 p-6 text-center">
              <IconSearch className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Tidak ada fitur cocok</p>
              <p className="text-xs text-muted-foreground">
                {query.trim()
                  ? <>Tidak ada fitur atau field yang mengandung “{query.trim()}”.</>
                  : <>Tidak ada node yang cocok dengan filter aktif.</>}
              </p>
              <Button size="sm" variant="outline"
                onClick={() => { setQuery(''); setFacetDomain(null); setFacetLevel(null); setFacetNoted(false); }}>
                Bersihkan
              </Button>
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

                {/* Catatan node — VIEW baca-saja dari content `NOTES`. Info yang
                    tak terlihat di graph (alasan bisnis, jebakan integrasi)
                    ditandai di content, lalu tampil di sini apa adanya. Tidak ada
                    input atau penyimpanan; ubah di content lalu build ulang. */}
                {selectedNote.text != null && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Catatan node
                      <span className={cn('rounded px-1 py-px text-[9px] font-medium normal-case tracking-normal',
                        selectedNote.provenance === 'inferred'
                          ? 'bg-amber-400/15 text-amber-600 dark:text-amber-400'
                          : 'bg-sky-400/15 text-sky-600 dark:text-sky-400')}
                        title={selectedNote.provenance === 'inferred'
                          ? 'Disimpulkan (bukan kutipan langsung dari dokumen)'
                          : 'Berdasar dokumen/spec'}>
                        {selectedNote.provenance}
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap rounded-md border border-pink-400/40 bg-pink-400/5 px-2 py-1.5 text-xs leading-relaxed">
                      {selectedNote.text}
                    </p>
                  </div>
                )}
                {/* Spesifikasi — sumbu 4-aksis dari spec Markdown (content hasil
                    `--spec`): prosa modul, Brief/Goals/Workflow/Entity, plus
                    sumber + level bukti + status. Baca-saja, dari content. */}
                {selected.type === 'module' && selected.spec && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Ruang lingkup modul</p>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{selected.spec}</p>
                  </div>
                )}
                {umlNode && (umlNode.brief || umlNode.goals || umlNode.workflow) && (
                  <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Spesifikasi</p>
                    {umlNode.brief && (
                      <div>
                        <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Brief</p>
                        <p className="text-xs leading-relaxed">{umlNode.brief}</p>
                      </div>
                    )}
                    {umlNode.goals && (
                      <div>
                        <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Goals</p>
                        <p className="text-xs leading-relaxed">{umlNode.goals}</p>
                      </div>
                    )}
                    {umlNode.workflow && (
                      <div>
                        <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Workflow</p>
                        <ol className="space-y-0.5">
                          {umlNode.workflow.split('→').map((s, i) => (
                            <li key={i} className="flex gap-1.5 text-xs leading-relaxed">
                              <span className="shrink-0 text-muted-foreground">{i + 1}.</span>
                              <span>{s.trim().replace(/^\(\d+\)\s*/, '')}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {Array.isArray(umlNode.entities) && umlNode.entities.length > 0 && (
                      <div>
                        <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Entity</p>
                        <div className="space-y-1">
                          {umlNode.entities.map((e) => (
                            <div key={e.name}>
                              <code className="text-[11px] font-medium">{e.name}</code>
                              <code className="block rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                                {e.attrs.map((a) => a.name + (a.key ? ` ${a.key}` : '')).join(', ') || '-'}
                              </code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {((umlNode.sources && umlNode.sources.length > 0) || umlNode.evidence || umlNode.status) && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {umlNode.evidence && (
                          <span className={cn('rounded px-1 py-px text-[9px] font-medium',
                            umlNode.evidence === 'PROVEN' ? 'bg-emerald-400/15 text-emerald-600 dark:text-emerald-400'
                              : umlNode.evidence === 'OBSERVED' ? 'bg-sky-400/15 text-sky-600 dark:text-sky-400'
                              : 'bg-amber-400/15 text-amber-600 dark:text-amber-400')}
                            title="Level bukti">
                            {umlNode.evidence}
                          </span>
                        )}
                        {umlNode.status && (
                          <span className="rounded bg-muted px-1 py-px text-[9px] font-medium text-muted-foreground">{umlNode.status}</span>
                        )}
                        {umlNode.sources && umlNode.sources.map((s, i) => (
                          <code key={i} className="rounded bg-muted px-1 py-px text-[9px] text-muted-foreground" title={s}>{s}</code>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {erdModule && erdModule.erd && (
                  <ErdDiagram erd={erdModule.erd} domains={domains} domain={erdModule.domain} theme={theme} />
                )}
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
                      Alur — jalur aktif ({flowPath.length} langkah)
                    </p>
                    <div className="space-y-1">
                      {flowPath.map((id, i) => {
                        const n = byIdAll[id];
                        const inField = flowIncoming[id];
                        const branches = flow.branches[id] || [];
                        return (
                          <React.Fragment key={id}>
                            {inField && (
                              <p className="pl-6 text-[9px] italic text-muted-foreground">↳ via {inField}</p>
                            )}
                            <button className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted',
                              id === selectedId && 'bg-muted font-medium')}
                              onClick={() => selectNode(id)}>
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground">{i + 1}</span>
                              <span className="flex-1 truncate">{n ? n.label : id}</span>
                              {notes[id] && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pink-400" title="punya catatan" />}
                            </button>
                            {branches.length > 1 && (
                              <div className="flex flex-wrap items-center gap-1 pl-6">
                                <span className="text-[9px] text-muted-foreground">cabang:</span>
                                {branches.map((b) => (
                                  <button key={b}
                                    className={cn('rounded px-1.5 py-0.5 text-[10px]',
                                      flowPath[i + 1] === b
                                        ? 'bg-foreground text-background font-medium'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/70')}
                                    onClick={() => selectBranch(id, b)}>
                                    {byIdAll[b] ? byIdAll[b].label : b}
                                  </button>
                                ))}
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Button size="sm" variant="outline" className="flex-1 gap-1" disabled={flowIdx <= 0}
                        onClick={() => selectNode(flowPath[flowIdx - 1])}>
                        <IconArrowLeft className="h-3.5 w-3.5" /> Sebelumnya
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 gap-1" disabled={flowIdx < 0 || flowIdx >= flowPath.length - 1}
                        onClick={() => selectNode(flowPath[flowIdx + 1])}>
                        Berikutnya <IconArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <InsightPanel analysis={insight} domains={domains} byId={byIdAll} onSelect={selectNode} />
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

      {docsOpen && (
        <DocsPanel app={APP} modules={C.MODULES || []} features={C.NODES || []}
          actions={C.ACTIONS || []} edges={C.DATA_EDGES || []} domains={domains}
          decisions={C.DECISIONS || []} arc42={C.ARC42 || []} glossary={C.GLOSSARY || []}
          docs={C.DOCS || []} onClose={() => setDocsOpen(false)} />
      )}
    </div>
  );
}

// Mount
const root = createRoot(document.getElementById('root'));
root.render(<DyalisisApp />);
