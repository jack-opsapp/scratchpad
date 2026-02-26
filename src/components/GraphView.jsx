import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { colors } from '../styles/theme.js';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import { drag as d3Drag } from 'd3-drag';
import {
  forceSimulation, forceLink, forceManyBody,
  forceCollide, forceCenter, forceX, forceY,
} from 'd3-force';
import { easeCubicInOut } from 'd3-ease';

// ─── Monochromatic page tones ────────────────────────────────────────────────
const PAGE_TONES = [
  { fill: 'rgba(148, 139, 114, 0.85)', stroke: 'rgba(148, 139, 114, 0.4)' },
  { fill: 'rgba(148, 139, 114, 0.60)', stroke: 'rgba(148, 139, 114, 0.3)' },
  { fill: 'rgba(148, 139, 114, 0.40)', stroke: 'rgba(148, 139, 114, 0.2)' },
  { fill: 'rgba(181, 174, 154, 0.70)', stroke: 'rgba(181, 174, 154, 0.3)' },
  { fill: 'rgba(118, 111, 91, 0.80)', stroke: 'rgba(118, 111, 91, 0.35)' },
  { fill: 'rgba(148, 139, 114, 0.50)', stroke: 'rgba(148, 139, 114, 0.25)' },
  { fill: 'rgba(181, 174, 154, 0.50)', stroke: 'rgba(181, 174, 154, 0.25)' },
  { fill: 'rgba(118, 111, 91, 0.60)', stroke: 'rgba(118, 111, 91, 0.3)' },
  { fill: 'rgba(148, 139, 114, 0.35)', stroke: 'rgba(148, 139, 114, 0.2)' },
  { fill: 'rgba(181, 174, 154, 0.45)', stroke: 'rgba(181, 174, 154, 0.2)' },
];

const PAGE_LEGEND_COLORS = [
  '#948b72', '#8a8268', '#7d775f', '#b5ae9a', '#766f5b',
  '#a89f88', '#c2bba5', '#685f4d', '#b0a78e', '#9e9580',
];

// ─── Link styling ────────────────────────────────────────────────────────────
const LINK_COLORS = {
  hierarchical: 'rgba(255, 255, 255, 0.12)',
  wikilink: 'rgba(120, 160, 230, 0.5)',
  tag: 'rgba(255, 255, 255, 0.08)',
};

// Brighter versions for hover (color change, not opacity)
const LINK_COLORS_HOVER = {
  hierarchical: 'rgba(255, 255, 255, 0.5)',
  wikilink: 'rgba(150, 185, 255, 0.9)',
  tag: 'rgba(255, 255, 255, 0.4)',
};

const LINK_WIDTHS = {
  hierarchical: 0.3,
  wikilink: 0.5,
  tag: 0.3,
};

// ─── Node styling ────────────────────────────────────────────────────────────
const NODE_RADIUS = 2;

// Base colors: pages white, sections light grey, notes darker grey
const NODE_COLORS = {
  page: 'rgba(255, 255, 255, 0.9)',
  section: 'rgba(255, 255, 255, 0.4)',
  note: 'rgba(255, 255, 255, 0.18)',
};

// Zoomed-in colors: sections → white, notes → light grey
const NODE_COLORS_ZOOMED = {
  page: 'rgba(255, 255, 255, 0.9)',
  section: 'rgba(255, 255, 255, 0.85)',
  note: 'rgba(255, 255, 255, 0.45)',
};

// ─── Semantic zoom thresholds ────────────────────────────────────────────────
const ZOOM_FAR = 0.5;
const ZOOM_CLOSE = 2.5;
const ZOOM_ULTRA = 4.0;
const ZOOM_LABEL_COMPENSATE = 0.3;

// ═════════════════════════════════════════════════════════════════════════════
// Data structures
// ═════════════════════════════════════════════════════════════════════════════

function buildNodes(notes, pages, sections, connections, pageToneMap) {
  const nodes = [];

  // Connection counts per note (for note radius sizing)
  const connCountMap = {};
  (connections || []).forEach(c => {
    connCountMap[c.source_note_id] = (connCountMap[c.source_note_id] || 0) + 1;
    connCountMap[c.target_note_id] = (connCountMap[c.target_note_id] || 0) + 1;
  });

  // Section→page mapping
  const sectionPageMap = {};
  const pageSectionsMap = {};
  (pages || []).forEach(p => {
    pageSectionsMap[p.id] = [];
    (p.sections || []).forEach(s => {
      sectionPageMap[s.id] = p.id;
      pageSectionsMap[p.id].push(s.id);
    });
  });

  // Name lookups
  const sectionNameMap = {};
  (sections || []).forEach(s => { sectionNameMap[s.id] = s.name; });
  const pageNameMap = {};
  (pages || []).forEach(p => { pageNameMap[p.id] = p.name; });

  // Note counts per section/page
  const notesPerSection = {};
  const notesPerPage = {};
  (notes || []).forEach(n => {
    const pageId = sectionPageMap[n.sectionId];
    if (!pageId) return;
    notesPerSection[n.sectionId] = (notesPerSection[n.sectionId] || 0) + 1;
    notesPerPage[pageId] = (notesPerPage[pageId] || 0) + 1;
  });

  // ── Page nodes (only pages with notes) ──
  (pages || []).forEach((p, i) => {
    if (!notesPerPage[p.id]) return;
    const activeSections = (pageSectionsMap[p.id] || []).filter(sid => notesPerSection[sid] > 0);
    nodes.push({
      id: `page-${p.id}`,
      entityId: p.id,
      type: 'page',
      label: p.name,
      radius: NODE_RADIUS,
      sectionCount: activeSections.length,
      noteCount: notesPerPage[p.id] || 0,
      toneIndex: i % PAGE_TONES.length,
      legendColor: pageToneMap[p.id]?.legend || PAGE_LEGEND_COLORS[0],
    });
  });

  // ── Section nodes (only sections with notes) ──
  (sections || []).forEach(s => {
    const pageId = sectionPageMap[s.id];
    if (!pageId || !notesPerSection[s.id]) return;
    nodes.push({
      id: `section-${s.id}`,
      entityId: s.id,
      type: 'section',
      label: s.name,
      radius: NODE_RADIUS,
      parentId: `page-${pageId}`,
      pageEntityId: pageId,
      pageName: pageNameMap[pageId],
      noteCount: notesPerSection[s.id] || 0,
      legendColor: pageToneMap[pageId]?.legend || PAGE_LEGEND_COLORS[0],
    });
  });

  // ── Note nodes ──
  (notes || []).forEach(n => {
    const pageId = sectionPageMap[n.sectionId];
    if (!pageId) return;
    const connCount = connCountMap[n.id] || 0;
    nodes.push({
      id: `note-${n.id}`,
      entityId: n.id,
      type: 'note',
      content: n.content,
      tags: n.tags || [],
      radius: NODE_RADIUS,
      parentId: `section-${n.sectionId}`,
      pageEntityId: pageId,
      sectionEntityId: n.sectionId,
      pageName: pageNameMap[pageId],
      sectionName: sectionNameMap[n.sectionId] || '',
      connectionCount: connCount,
      legendColor: pageToneMap[pageId]?.legend || PAGE_LEGEND_COLORS[0],
    });
  });

  return nodes;
}

function buildLinks(nodes, connections) {
  const links = [];
  const nodeIdSet = new Set(nodes.map(n => n.id));

  // Hierarchical links: note→section, section→page
  nodes.forEach(n => {
    if (n.parentId && nodeIdSet.has(n.parentId)) {
      links.push({
        source: n.id,
        target: n.parentId,
        linkType: 'hierarchical',
        strength: n.type === 'note' ? 0.8 : 0.6,
        distance: n.type === 'note' ? 30 : 80,
      });
    }
  });

  // Wikilink links from connections
  (connections || []).forEach(c => {
    const sourceId = `note-${c.source_note_id}`;
    const targetId = `note-${c.target_note_id}`;
    if (nodeIdSet.has(sourceId) && nodeIdSet.has(targetId)) {
      links.push({
        source: sourceId,
        target: targetId,
        linkType: 'wikilink',
        strength: 0.3,
        distance: 60,
      });
    }
  });

  // Tag links: chain topology (A→B→C, not clique)
  const tagNoteMap = {};
  nodes.forEach(n => {
    if (n.type === 'note' && n.tags) {
      n.tags.forEach(tag => {
        if (!tagNoteMap[tag]) tagNoteMap[tag] = [];
        tagNoteMap[tag].push(n.id);
      });
    }
  });

  const tagLinkSet = new Set();
  Object.values(tagNoteMap).forEach(noteIds => {
    if (noteIds.length < 2) return;
    for (let i = 0; i < noteIds.length - 1; i++) {
      const key = [noteIds[i], noteIds[i + 1]].sort().join('|');
      if (tagLinkSet.has(key)) continue;
      tagLinkSet.add(key);
      links.push({
        source: noteIds[i],
        target: noteIds[i + 1],
        linkType: 'tag',
        strength: 0.1,
        distance: 100,
      });
    }
  });

  return links;
}

function buildAdjacencyMap(links) {
  const adj = new Map();
  links.forEach(l => {
    const sid = typeof l.source === 'object' ? l.source.id : l.source;
    const tid = typeof l.target === 'object' ? l.target.id : l.target;
    if (!adj.has(sid)) adj.set(sid, new Set());
    if (!adj.has(tid)) adj.set(tid, new Set());
    adj.get(sid).add(tid);
    adj.get(tid).add(sid);
  });
  return adj;
}

// ═════════════════════════════════════════════════════════════════════════════
// GraphView Component
// ═════════════════════════════════════════════════════════════════════════════

export function GraphView({
  connections,
  notes,
  pages,
  sections,
  currentPageId,
  currentSectionId,
  onNavigate,
}) {
  // ─── Refs ──────────────────────────────────────────────────────────────────
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const simulationRef = useRef(null);
  const zoomBehaviorRef = useRef(null);
  const mainGroupRef = useRef(null);
  const nodeSelRef = useRef(null);
  const linkSelRef = useRef(null);
  const zoomLevelRef = useRef(0.35);
  const draggedRef = useRef(false);
  const selectedNodesRef = useRef(new Set());
  const applyTogglesRef = useRef(null);
  const visibilityRef = useRef({ pages: true, sections: true, wikilinks: true, tags: true });

  // ─── State ─────────────────────────────────────────────────────────────────
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showPages, setShowPages] = useState(true);
  const [showSections, setShowSections] = useState(true);
  const [showWikilinks, setShowWikilinks] = useState(true);
  const [showTags, setShowTags] = useState(true);

  // ─── Derived data ──────────────────────────────────────────────────────────
  const pageToneMap = useMemo(() => {
    const map = {};
    (pages || []).forEach((p, i) => {
      map[p.id] = {
        ...PAGE_TONES[i % PAGE_TONES.length],
        legend: PAGE_LEGEND_COLORS[i % PAGE_LEGEND_COLORS.length],
      };
    });
    return map;
  }, [pages]);

  const graphNodes = useMemo(
    () => buildNodes(notes, pages, sections, connections, pageToneMap),
    [notes, pages, sections, connections, pageToneMap]
  );

  const graphLinks = useMemo(
    () => buildLinks(graphNodes, connections),
    [graphNodes, connections]
  );

  const adjacencyMap = useMemo(
    () => buildAdjacencyMap(graphLinks),
    [graphLinks]
  );

  const pagesWithNotes = useMemo(() => {
    const pageIds = new Set(graphNodes.filter(n => n.type === 'page').map(n => n.entityId));
    return (pages || []).filter(p => pageIds.has(p.id));
  }, [pages, graphNodes]);

  // ─── Measure container (full viewport) ───────────────────────────────────
  useEffect(() => {
    const measure = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ─── Sync visibility refs + apply ──────────────────────────────────────────
  useEffect(() => {
    visibilityRef.current = { pages: showPages, sections: showSections, wikilinks: showWikilinks, tags: showTags };
    applyTogglesRef.current?.();
  }, [showPages, showSections, showWikilinks, showTags]);

  // ─── Main D3 rendering + simulation ────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !graphNodes.length) return;

    const svg = select(svgRef.current);
    const { width, height } = dimensions;

    // Fresh SVG setup (only on data/dimension change)
    svg.selectAll('*').remove();

    // ── Defs: glow filters ──
    const defs = svg.append('defs');

    const glowFilter = defs.append('filter').attr('id', 'glow');
    glowFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    const m1 = glowFilter.append('feMerge');
    m1.append('feMergeNode').attr('in', 'blur');
    m1.append('feMergeNode').attr('in', 'SourceGraphic');

    const glowBright = defs.append('filter').attr('id', 'glow-bright');
    glowBright.append('feGaussianBlur').attr('stdDeviation', '6').attr('result', 'blur');
    const m2 = glowBright.append('feMerge');
    m2.append('feMergeNode').attr('in', 'blur');
    m2.append('feMergeNode').attr('in', 'SourceGraphic');

    const glowHover = defs.append('filter').attr('id', 'glow-hover');
    glowHover.append('feGaussianBlur').attr('stdDeviation', '8').attr('result', 'blur');
    const m3 = glowHover.append('feMerge');
    m3.append('feMergeNode').attr('in', 'blur');
    m3.append('feMergeNode').attr('in', 'SourceGraphic');

    // ── Main group (zoom/pan container) ──
    const g = svg.append('g').attr('class', 'graph-main');
    mainGroupRef.current = g;

    // ── Initial node positions (faster settling) ──
    const pageNodes = graphNodes.filter(n => n.type === 'page');
    const pageCount = pageNodes.length;
    pageNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(pageCount, 1) - Math.PI / 2;
      n.x = Math.cos(angle) * 300;
      n.y = Math.sin(angle) * 300;
    });

    const pagePos = {};
    pageNodes.forEach(n => { pagePos[n.id] = { x: n.x, y: n.y }; });

    graphNodes.filter(n => n.type === 'section').forEach(n => {
      const pp = pagePos[n.parentId];
      if (pp) {
        n.x = pp.x + (Math.random() - 0.5) * 100;
        n.y = pp.y + (Math.random() - 0.5) * 100;
      }
    });

    const secPos = {};
    graphNodes.filter(n => n.type === 'section').forEach(n => {
      secPos[n.id] = { x: n.x || 0, y: n.y || 0 };
    });

    graphNodes.filter(n => n.type === 'note').forEach(n => {
      const sp = secPos[n.parentId];
      if (sp) {
        n.x = sp.x + (Math.random() - 0.5) * 50;
        n.y = sp.y + (Math.random() - 0.5) * 50;
      }
    });

    // ── Link layer ──
    const linkGroup = g.append('g').attr('class', 'graph-links');
    const linkSel = linkGroup.selectAll('line')
      .data(graphLinks, d => `${d.source}-${d.target}-${d.linkType}`)
      .join('line')
      .attr('stroke', d => LINK_COLORS[d.linkType])
      .attr('stroke-width', d => LINK_WIDTHS[d.linkType])
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0);

    linkSelRef.current = linkSel;

    // Fade in links
    linkSel.transition()
      .delay((d, i) => 80 + i * 1.5)
      .duration(300)
      .attr('opacity', 1);

    // ── Node layer ──
    const nodeGroup = g.append('g').attr('class', 'graph-nodes');
    const nodeSel = nodeGroup.selectAll('g')
      .data(graphNodes, d => d.id)
      .join(
        enter => {
          const grp = enter.append('g')
            .attr('class', d => `graph-node node-${d.type}`)
            .style('cursor', 'pointer')
            .style('opacity', 0);

          // Selection ring (hidden by default)
          grp.append('circle')
            .attr('class', 'selection-ring')
            .attr('r', d => d.radius + 3)
            .attr('fill', 'none')
            .attr('stroke', 'rgba(255, 255, 255, 0.5)')
            .attr('stroke-width', 1)
            .attr('opacity', 0);

          // Glow
          grp.append('circle')
            .attr('class', 'glow')
            .attr('r', d => d.radius + 4)
            .attr('fill', d => NODE_COLORS[d.type])
            .attr('opacity', d => d.type === 'page' ? 0.15 : 0.06)
            .attr('filter', 'url(#glow)');

          // Main circle (point-like, no stroke)
          grp.append('circle')
            .attr('class', 'main')
            .attr('r', d => d.radius)
            .attr('fill', d => NODE_COLORS[d.type])
            .attr('stroke', 'none');

          // Page labels (always visible)
          grp.filter(d => d.type === 'page')
            .append('text')
            .attr('class', 'page-label')
            .attr('text-anchor', 'middle')
            .attr('y', d => d.radius + 10)
            .attr('fill', colors.textPrimary)
            .attr('font-size', 11)
            .attr('font-family', "'Manrope', sans-serif")
            .attr('font-weight', 600)
            .attr('pointer-events', 'none')
            .text(d => d.label);

          // Staggered entrance
          grp.transition()
            .delay((d, i) => i * 12)
            .duration(300)
            .style('opacity', 1);

          return grp;
        },
        update => update,
        exit => exit.transition().duration(200).style('opacity', 0).remove()
      );

    nodeSelRef.current = nodeSel;

    // ── Force simulation ──
    const simulation = forceSimulation(graphNodes)
      .velocityDecay(0.4)
      .alpha(1)
      .alphaDecay(0.01)
      .force('link', forceLink(graphLinks)
        .id(d => d.id)
        .distance(d => d.distance)
        .strength(d => d.strength)
        .iterations(2)
      )
      .force('charge', forceManyBody()
        .strength(d => {
          if (d.type === 'page') return -800;
          if (d.type === 'section') return -200;
          return -30;
        })
        .distanceMax(500)
      )
      .force('collide', forceCollide()
        .radius(d => d.radius + 1)
        .strength(0.7)
        .iterations(2)
      )
      .force('center', forceCenter(0, 0).strength(0.05))
      .force('x', forceX(0).strength(0.02))
      .force('y', forceY(0).strength(0.02));

    simulationRef.current = simulation;

    // ── Tick handler (position updates only) ──
    simulation.on('tick', () => {
      linkSel
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // ── Semantic zoom ──
    const applySemanticZoom = (k) => {
      zoomLevelRef.current = k;

      // Interpolate node colors: as user zooms in, sections→white, notes→lighter
      const zoomT = Math.min(1, Math.max(0, (k - ZOOM_FAR) / (ZOOM_CLOSE - ZOOM_FAR)));
      nodeSel.each(function (d) {
        if (select(this).attr('display') === 'none') return;
        const base = NODE_COLORS[d.type];
        const zoomed = NODE_COLORS_ZOOMED[d.type];
        const fill = zoomT > 0.01 ? zoomed : base;
        // Smooth transition: use zoomed colors when zoomed in past midpoint
        const useZoomed = k > 1.0;
        select(this).select('.main').attr('fill', useZoomed ? zoomed : base);
        select(this).select('.glow').attr('fill', useZoomed ? zoomed : base);
      });

      // Page labels: compensate scale at far zoom so they stay readable
      nodeSel.selectAll('.page-label')
        .attr('font-size', k < ZOOM_LABEL_COMPENSATE ? 11 * ZOOM_LABEL_COMPENSATE / k : 11);
    };

    // ── Zoom behavior ──
    let rafId = null;
    const zoomBehavior = d3Zoom()
      .scaleExtent([0.1, 6])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          applySemanticZoom(event.transform.k);
          rafId = null;
        });
      });

    svg.call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;

    // ── Hover interactions ──
    nodeSel
      .on('mouseenter', function (event, d) {
        const connected = adjacencyMap.get(d.id) || new Set();

        // Dim unconnected nodes, brighten connected (color change, no opacity)
        nodeSel.each(function (n) {
          const el = select(this);
          if (el.attr('display') === 'none') return;
          const isActive = n.id === d.id || connected.has(n.id);
          el.select('.main').transition().duration(120)
            .attr('fill', isActive ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.04)');
          el.select('.glow').transition().duration(120)
            .attr('fill', isActive ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.02)');
        });

        // Brighten connected links, dim rest (color change, not opacity)
        linkSel.each(function (l) {
          const el = select(this);
          if (el.attr('display') === 'none') return;
          const isActive = l.source.id === d.id || l.target.id === d.id;
          el.transition().duration(120)
            .attr('stroke', isActive ? LINK_COLORS_HOVER[l.linkType] : 'rgba(255, 255, 255, 0.03)')
            .attr('stroke-width', isActive ? 1 : LINK_WIDTHS[l.linkType]);
        });

        // Enlarge hovered node
        select(this).select('.main')
          .transition().duration(120)
          .attr('r', d.radius * 2);
        select(this).select('.glow')
          .transition().duration(120)
          .attr('r', d.radius * 2 + 5)
          .attr('opacity', 0.25)
          .attr('filter', 'url(#glow-hover)');

        // Tooltip
        setHoveredNode(d);
        const svgRect = svgRef.current.getBoundingClientRect();
        setTooltipPos({
          x: Math.min(event.clientX - svgRect.left + 16, svgRect.width - 320),
          y: Math.min(event.clientY - svgRect.top - 10, svgRect.height - 140),
        });
      })
      .on('mousemove', function (event) {
        const svgRect = svgRef.current.getBoundingClientRect();
        setTooltipPos({
          x: Math.min(event.clientX - svgRect.left + 16, svgRect.width - 320),
          y: Math.min(event.clientY - svgRect.top - 10, svgRect.height - 140),
        });
      })
      .on('mouseleave', function () {
        const k = zoomLevelRef.current;
        const useZoomed = k > 1.0;

        // Restore node colors
        nodeSel.each(function (d) {
          const el = select(this);
          const colors = useZoomed ? NODE_COLORS_ZOOMED : NODE_COLORS;
          el.select('.main').transition().duration(200).attr('fill', colors[d.type]);
          el.select('.glow').transition().duration(200).attr('fill', colors[d.type]);
        });
        nodeSel.selectAll('.main')
          .transition().duration(200)
          .attr('r', d => d.radius);
        nodeSel.selectAll('.glow')
          .transition().duration(200)
          .attr('r', d => d.radius + 4)
          .attr('opacity', d => d.type === 'page' ? 0.15 : 0.06)
          .attr('filter', 'url(#glow)');

        // Restore link colors
        linkSel.transition().duration(200)
          .attr('stroke', d => LINK_COLORS[d.linkType])
          .attr('stroke-width', d => LINK_WIDTHS[d.linkType]);

        setHoveredNode(null);
      })
      // ── Click ──
      .on('click', function (event, d) {
        event.stopPropagation();
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }

        // Shift+click: multi-select
        if (event.shiftKey) {
          const sel = selectedNodesRef.current;
          if (sel.has(d.id)) {
            sel.delete(d.id);
            select(this).select('.selection-ring').attr('opacity', 0);
          } else {
            sel.add(d.id);
            select(this).select('.selection-ring').attr('opacity', 1);
          }
          return;
        }

        // Navigate
        if (d.type === 'page') {
          onNavigate(d.entityId, null);
        } else if (d.type === 'section') {
          onNavigate(d.pageEntityId, d.entityId);
        } else if (d.type === 'note') {
          onNavigate(d.pageEntityId, d.sectionEntityId);
        }
      });

    // ── Drag behavior ──
    const dragBehavior = d3Drag()
      .on('start', function (event, d) {
        draggedRef.current = false;
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;

        // Pin all selected nodes for group drag
        if (selectedNodesRef.current.has(d.id) && selectedNodesRef.current.size > 1) {
          simulation.nodes().forEach(n => {
            if (selectedNodesRef.current.has(n.id) && n.id !== d.id) {
              n.fx = n.x;
              n.fy = n.y;
            }
          });
        }
      })
      .on('drag', function (event, d) {
        draggedRef.current = true;
        const dx = event.x - d.fx;
        const dy = event.y - d.fy;
        d.fx = event.x;
        d.fy = event.y;

        // Move all selected together
        if (selectedNodesRef.current.has(d.id) && selectedNodesRef.current.size > 1) {
          simulation.nodes().forEach(n => {
            if (selectedNodesRef.current.has(n.id) && n.id !== d.id) {
              n.fx += dx;
              n.fy += dy;
            }
          });
        }
      })
      .on('end', function (event, d) {
        if (!event.active) simulation.alphaTarget(0);
        // Release → spring back
        d.fx = null;
        d.fy = null;
        if (selectedNodesRef.current.size > 0) {
          simulation.nodes().forEach(n => {
            if (selectedNodesRef.current.has(n.id)) {
              n.fx = null;
              n.fy = null;
            }
          });
        }
      });

    nodeSel.call(dragBehavior);

    // ── Background click: clear selection ──
    svg.on('click', () => {
      if (selectedNodesRef.current.size > 0) {
        selectedNodesRef.current.clear();
        nodeSel.selectAll('.selection-ring').attr('opacity', 0);
      }
    });

    // ── Visibility toggle helper ──
    const applyToggles = () => {
      const v = visibilityRef.current;
      nodeSel.filter('.node-page').attr('display', v.pages ? null : 'none');
      nodeSel.filter('.node-section').attr('display', v.sections ? null : 'none');
      linkSel.each(function (d) {
        const el = select(this);
        if (d.linkType === 'wikilink') {
          el.attr('display', v.wikilinks ? null : 'none');
        } else if (d.linkType === 'tag') {
          el.attr('display', v.tags ? null : 'none');
        } else if (d.linkType === 'hierarchical') {
          const srcType = d.source.type || d.source;
          const tgtType = d.target.type || d.target;
          const vis = (srcType !== 'page' || v.pages) &&
                      (tgtType !== 'page' || v.pages) &&
                      (srcType !== 'section' || v.sections) &&
                      (tgtType !== 'section' || v.sections);
          el.attr('display', vis ? null : 'none');
        }
      });
    };
    applyTogglesRef.current = applyToggles;
    applyToggles(); // apply current state

    // ── Initial zoom (after brief settling) ──
    setTimeout(() => {
      if (!svgRef.current) return;

      let targetCx = 0, targetCy = 0, targetScale = 0.35;

      if (currentSectionId) {
        const sNode = graphNodes.find(n => n.entityId === currentSectionId && n.type === 'section');
        if (sNode) {
          targetCx = sNode.x || 0;
          targetCy = sNode.y || 0;
          targetScale = 1.5;
        }
      } else if (currentPageId) {
        const pNode = graphNodes.find(n => n.entityId === currentPageId && n.type === 'page');
        if (pNode) {
          targetCx = pNode.x || 0;
          targetCy = pNode.y || 0;
          targetScale = 0.7;
        }
      } else {
        // Fit all
        const xs = graphNodes.map(n => n.x || 0);
        const ys = graphNodes.map(n => n.y || 0);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        targetCx = (minX + maxX) / 2;
        targetCy = (minY + maxY) / 2;
        const gW = (maxX - minX) || 1;
        const gH = (maxY - minY) || 1;
        targetScale = Math.min((width - 120) / gW, (height - 120) / gH, 1.5);
      }

      const transform = zoomIdentity
        .translate(width / 2, height / 2)
        .scale(targetScale)
        .translate(-targetCx, -targetCy);

      select(svgRef.current)
        .transition()
        .duration(800)
        .ease(easeCubicInOut)
        .call(zoomBehavior.transform, transform);

      setTimeout(() => applySemanticZoom(targetScale), 850);
    }, 500);

    // ── Verification log ──
    const byType = { page: 0, section: 0, note: 0 };
    graphNodes.forEach(n => byType[n.type]++);
    const byLink = { hierarchical: 0, wikilink: 0, tag: 0 };
    graphLinks.forEach(l => byLink[l.linkType]++);
    console.log('[GraphView] Nodes:', byType, '| Links:', byLink);

    return () => {
      simulation.stop();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [graphNodes, graphLinks, adjacencyMap, dimensions, currentPageId, currentSectionId, onNavigate]);

  // ─── Zoom controls ─────────────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(300)
      .call(zoomBehaviorRef.current.scaleBy, 1.5);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(300)
      .call(zoomBehaviorRef.current.scaleBy, 1 / 1.5);
  }, []);

  const handleFit = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || !graphNodes.length) return;
    const { width, height } = dimensions;
    const xs = graphNodes.map(n => n.x || 0);
    const ys = graphNodes.map(n => n.y || 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const gW = (maxX - minX) || 1, gH = (maxY - minY) || 1;
    const scale = Math.min((width - 80) / gW, (height - 80) / gH, 2);

    const transform = zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-cx, -cy);

    select(svgRef.current).transition().duration(600).ease(easeCubicInOut)
      .call(zoomBehaviorRef.current.transform, transform);
  }, [graphNodes, dimensions]);

  const handleReset = useCallback(() => {
    if (!simulationRef.current) return;
    simulationRef.current.alpha(1).restart();
  }, []);

  const handleCluster = useCallback(() => {
    if (!simulationRef.current) return;
    const sim = simulationRef.current;

    // Temporarily tighten hierarchical forces, weaken charge
    sim.force('link')
      .distance(d => d.linkType === 'hierarchical' ? d.distance * 0.4 : d.distance)
      .strength(d => d.linkType === 'hierarchical' ? d.strength * 2.0 : d.strength);
    sim.force('charge')
      .strength(d => {
        if (d.type === 'page') return -400;
        if (d.type === 'section') return -100;
        return -15;
      });

    sim.alpha(0.8).restart();

    // Restore after 3 seconds
    setTimeout(() => {
      if (!simulationRef.current) return;
      sim.force('link')
        .distance(d => d.distance)
        .strength(d => d.strength);
      sim.force('charge')
        .strength(d => {
          if (d.type === 'page') return -800;
          if (d.type === 'section') return -200;
          return -30;
        });
      sim.alpha(0.3).restart();
    }, 3000);
  }, []);

  // ─── Styles ────────────────────────────────────────────────────────────────
  const controlStyle = {
    background: 'rgba(28, 28, 30, 0.46)',
    backdropFilter: 'blur(50px) saturate(180%)',
    WebkitBackdropFilter: 'blur(50px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: "'Manrope', sans-serif",
    cursor: 'pointer',
    outline: 'none',
  };

  const toggleBtnStyle = (active) => ({
    ...controlStyle,
    padding: '4px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    border: `1px solid rgba(255, 255, 255, ${active ? '0.15' : '0.08'})`,
    color: active ? colors.textPrimary : colors.textMuted,
    transition: 'color 0.15s ease, border-color 0.15s ease',
  });

  const zoomBtnStyle = {
    ...controlStyle,
    padding: 0,
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // ─── Empty state ───────────────────────────────────────────────────────────
  if (!notes || notes.length === 0) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.bg,
        zIndex: 2,
        gap: 16,
        color: colors.textMuted,
        fontFamily: "'Manrope', sans-serif",
      }}>
        <div style={{ fontSize: 16, fontWeight: 500 }}>No notes yet</div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        background: colors.bg,
        overflow: 'hidden',
        zIndex: 2,
      }}
    >
      {/* ─── Visibility toggles (top-left) ──────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        zIndex: 10,
      }}>
        <button onClick={() => setShowPages(v => !v)} style={toggleBtnStyle(showPages)}>
          Pages
        </button>
        <button onClick={() => setShowSections(v => !v)} style={toggleBtnStyle(showSections)}>
          Sections
        </button>
        <button onClick={() => setShowWikilinks(v => !v)} style={toggleBtnStyle(showWikilinks)}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: LINK_COLORS.wikilink, flexShrink: 0,
          }} />
          Wikilinks
        </button>
        <button onClick={() => setShowTags(v => !v)} style={toggleBtnStyle(showTags)}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: LINK_COLORS.tag, flexShrink: 0,
          }} />
          Tags
        </button>
      </div>

      {/* ─── Zoom + arrange controls (top-right) ─────────────────────── */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        zIndex: 10,
      }}>
        <button onClick={handleZoomIn} style={zoomBtnStyle}>+</button>
        <button onClick={handleZoomOut} style={zoomBtnStyle}>&minus;</button>
        <button onClick={handleFit} style={{ ...zoomBtnStyle, fontSize: 9 }}>Fit</button>
        <div style={{ height: 4 }} />
        <button onClick={handleReset} style={{ ...zoomBtnStyle, fontSize: 8 }}>Reset</button>
        <button onClick={handleCluster} style={{ ...zoomBtnStyle, fontSize: 7, letterSpacing: '0.3px' }}>
          Cluster
        </button>
      </div>

      {/* ─── SVG canvas ──────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ display: 'block', background: 'transparent' }}
      />

      {/* ─── Hover tooltip (frosted glass) ───────────────────────────── */}
      {hoveredNode && (
        <div
          style={{
            position: 'absolute',
            top: tooltipPos.y,
            left: tooltipPos.x,
            maxWidth: 300,
            padding: '10px 14px',
            ...controlStyle,
            cursor: 'default',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          {hoveredNode.type === 'note' && (
            <>
              <div style={{
                color: colors.textPrimary,
                fontSize: 13,
                fontFamily: "'Manrope', sans-serif",
                lineHeight: 1.5,
                marginBottom: 6,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              }}>
                {hoveredNode.content?.substring(0, 150)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: hoveredNode.legendColor, flexShrink: 0,
                }} />
                <span style={{
                  color: colors.textMuted, fontSize: 11,
                  fontFamily: "'Manrope', sans-serif",
                }}>
                  {hoveredNode.pageName}{hoveredNode.sectionName ? ` / ${hoveredNode.sectionName}` : ''}
                </span>
              </div>
              {hoveredNode.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                  {hoveredNode.tags.slice(0, 3).map(tag => (
                    <span key={tag} style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 2,
                      background: 'rgba(100, 140, 180, 0.15)',
                      color: 'rgba(100, 140, 180, 0.8)',
                      fontFamily: "'Manrope', sans-serif",
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div style={{
                color: colors.textMuted, fontSize: 10,
                fontFamily: "'Manrope', sans-serif",
              }}>
                {hoveredNode.connectionCount} connection{hoveredNode.connectionCount === 1 ? '' : 's'}
              </div>
            </>
          )}

          {hoveredNode.type === 'section' && (
            <div style={{ fontFamily: "'Manrope', sans-serif" }}>
              <div style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {hoveredNode.label}
              </div>
              <div style={{ color: colors.textMuted, fontSize: 11 }}>
                {hoveredNode.noteCount} note{hoveredNode.noteCount === 1 ? '' : 's'} &middot; {hoveredNode.pageName}
              </div>
            </div>
          )}

          {hoveredNode.type === 'page' && (
            <div style={{ fontFamily: "'Manrope', sans-serif" }}>
              <div style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {hoveredNode.label}
              </div>
              <div style={{ color: colors.textMuted, fontSize: 11 }}>
                {hoveredNode.sectionCount} section{hoveredNode.sectionCount === 1 ? '' : 's'} &middot; {hoveredNode.noteCount} note{hoveredNode.noteCount === 1 ? '' : 's'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Page legend (bottom-left) ────────────────────────────────── */}
      {pagesWithNotes.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          zIndex: 10,
          padding: '6px 10px',
          ...controlStyle,
          cursor: 'default',
        }}>
          {pagesWithNotes.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: PAGE_LEGEND_COLORS[i % PAGE_LEGEND_COLORS.length],
              }} />
              <span style={{
                color: colors.textMuted, fontSize: 10,
                fontFamily: "'Manrope', sans-serif",
              }}>
                {p.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ─── Stats (bottom-right) ─────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        color: colors.textMuted,
        fontSize: 10,
        fontFamily: "'Manrope', sans-serif",
        opacity: 0.5,
        zIndex: 10,
      }}>
        {graphNodes.filter(n => n.type === 'note').length} notes &middot;{' '}
        {graphLinks.filter(l => l.linkType !== 'hierarchical').length} connections
      </div>
    </div>
  );
}

export default GraphView;
