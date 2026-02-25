import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { colors } from '../styles/theme.js';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import { drag as d3Drag } from 'd3-drag';
import { easeCubicInOut } from 'd3-ease';

// ─── Layout constants ────────────────────────────────────────────────────────
const PAGE_RING_RADIUS = 700;
const SECTION_RING_RADIUS = 150;
const NOTE_SPACING = 18;
const NOTE_RADIUS_BASE = 5;
const NOTE_RADIUS_MAX = 14;

// ─── Semantic zoom thresholds ────────────────────────────────────────────────
const ZOOM_SECTION = 1.2;  // k > 1.2: section detail
const ZOOM_PAGE = 0.5;     // 0.5 < k <= 1.2: page detail
// k <= 0.5: global view

// ─── Monochromatic page tones (opacity-based, brand-aligned) ─────────────────
const PAGE_TONES = [
  { fill: 'rgba(148, 139, 114, 0.85)', stroke: 'rgba(148, 139, 114, 0.4)' },
  { fill: 'rgba(148, 139, 114, 0.60)', stroke: 'rgba(148, 139, 114, 0.3)' },
  { fill: 'rgba(148, 139, 114, 0.40)', stroke: 'rgba(148, 139, 114, 0.2)' },
  { fill: 'rgba(181, 174, 154, 0.70)', stroke: 'rgba(181, 174, 154, 0.3)' },
  { fill: 'rgba(118, 111, 91, 0.80)',  stroke: 'rgba(118, 111, 91, 0.35)' },
  { fill: 'rgba(148, 139, 114, 0.50)', stroke: 'rgba(148, 139, 114, 0.25)' },
  { fill: 'rgba(181, 174, 154, 0.50)', stroke: 'rgba(181, 174, 154, 0.25)' },
  { fill: 'rgba(118, 111, 91, 0.60)',  stroke: 'rgba(118, 111, 91, 0.3)' },
  { fill: 'rgba(148, 139, 114, 0.35)', stroke: 'rgba(148, 139, 114, 0.2)' },
  { fill: 'rgba(181, 174, 154, 0.45)', stroke: 'rgba(181, 174, 154, 0.2)' },
];

const PAGE_LEGEND_COLORS = [
  '#948b72', '#8a8268', '#7d775f', '#b5ae9a', '#766f5b',
  '#a89f88', '#c2bba5', '#685f4d', '#b0a78e', '#9e9580',
];

const TYPE_COLORS = {
  related: 'rgba(148, 139, 114, 0.4)',
  supports: 'rgba(45, 107, 58, 0.5)',
  contradicts: 'rgba(184, 60, 42, 0.5)',
  extends: 'rgba(148, 139, 114, 0.6)',
  source: 'rgba(122, 92, 26, 0.5)',
};

// ─── Compute hierarchical layout ─────────────────────────────────────────────
function computeLayout(notes, pages, sections, connections, pageToneMap) {
  const pageLayouts = new Map();
  const sectionLayouts = new Map();
  const noteNodes = [];

  if (!notes?.length || !pages?.length) return { pageLayouts, sectionLayouts, noteNodes };

  // Build lookup maps
  const sectionPageMap = {};
  const pageSectionsMap = {};
  (pages || []).forEach(p => {
    pageSectionsMap[p.id] = [];
    (p.sections || []).forEach(s => {
      sectionPageMap[s.id] = p.id;
      pageSectionsMap[p.id].push(s.id);
    });
  });

  const sectionNameMap = {};
  (sections || []).forEach(s => { sectionNameMap[s.id] = s.name; });

  const pageNameMap = {};
  (pages || []).forEach(p => { pageNameMap[p.id] = p.name; });

  // Count connections per note
  const connCountMap = {};
  (connections || []).forEach(c => {
    connCountMap[c.source_note_id] = (connCountMap[c.source_note_id] || 0) + 1;
    connCountMap[c.target_note_id] = (connCountMap[c.target_note_id] || 0) + 1;
  });

  // Group notes by page → section
  const notesBySection = {};
  const notesByPage = {};
  notes.forEach(n => {
    const pageId = sectionPageMap[n.sectionId];
    if (!pageId) return;
    if (!notesBySection[n.sectionId]) notesBySection[n.sectionId] = [];
    notesBySection[n.sectionId].push(n);
    if (!notesByPage[pageId]) notesByPage[pageId] = [];
    notesByPage[pageId].push(n);
  });

  // Filter pages that have notes
  const activePages = pages.filter(p => notesByPage[p.id]?.length > 0);
  const pageCount = activePages.length;

  // Page positioning — ring or horizontal for 1-2
  activePages.forEach((page, i) => {
    let cx, cy;
    if (pageCount <= 2) {
      const totalWidth = (pageCount - 1) * PAGE_RING_RADIUS;
      cx = -totalWidth / 2 + i * PAGE_RING_RADIUS;
      cy = 0;
    } else {
      const angle = (2 * Math.PI * i) / pageCount - Math.PI / 2;
      cx = Math.cos(angle) * PAGE_RING_RADIUS;
      cy = Math.sin(angle) * PAGE_RING_RADIUS;
    }

    pageLayouts.set(page.id, { cx, cy, radius: 0, name: page.name });

    // Section positioning within page
    const pageSectionIds = (pageSectionsMap[page.id] || []).filter(
      sid => notesBySection[sid]?.length > 0
    );
    const sectionCount = pageSectionIds.length;

    pageSectionIds.forEach((sectionId, si) => {
      let sx, sy;
      if (sectionCount === 1) {
        sx = cx;
        sy = cy;
      } else if (sectionCount === 2) {
        sx = cx + (si === 0 ? -SECTION_RING_RADIUS * 0.6 : SECTION_RING_RADIUS * 0.6);
        sy = cy;
      } else {
        const sAngle = (2 * Math.PI * si) / sectionCount - Math.PI / 2;
        sx = cx + Math.cos(sAngle) * SECTION_RING_RADIUS;
        sy = cy + Math.sin(sAngle) * SECTION_RING_RADIUS;
      }

      sectionLayouts.set(sectionId, {
        cx: sx, cy: sy, radius: 0,
        name: sectionNameMap[sectionId] || '',
        pageId: page.id,
      });

      // Note positioning — spiral pack from section center
      const sectionNotes = notesBySection[sectionId] || [];
      sectionNotes.forEach((note, ni) => {
        const connCount = connCountMap[note.id] || 0;
        const r = Math.max(NOTE_RADIUS_BASE, Math.min(NOTE_RADIUS_MAX, 4 + connCount * 2));
        const tone = pageToneMap[page.id] || PAGE_TONES[0];

        // Spiral positioning
        let nx, ny;
        if (ni === 0) {
          nx = sx;
          ny = sy;
        } else {
          const spiralAngle = ni * 0.8;
          const spiralRadius = NOTE_SPACING * Math.sqrt(ni);
          nx = sx + Math.cos(spiralAngle) * spiralRadius;
          ny = sy + Math.sin(spiralAngle) * spiralRadius;
        }

        noteNodes.push({
          id: note.id,
          x: nx,
          y: ny,
          r,
          sectionId: note.sectionId,
          pageId: page.id,
          content: note.content,
          tags: note.tags || [],
          connectionCount: connCount,
          pageTone: tone,
          legendColor: pageToneMap[page.id]?.legend || PAGE_LEGEND_COLORS[0],
          pageName: page.name,
          sectionName: sectionNameMap[note.sectionId] || '',
        });
      });

      // Update section radius from bounding box of its notes
      const sNotes = noteNodes.filter(n => n.sectionId === sectionId);
      if (sNotes.length > 0) {
        const maxDist = Math.max(...sNotes.map(n =>
          Math.sqrt((n.x - sx) ** 2 + (n.y - sy) ** 2) + n.r
        ));
        sectionLayouts.get(sectionId).radius = maxDist + 20;
      }
    });

    // Update page radius from bounding box of its sections
    const pNotes = noteNodes.filter(n => n.pageId === page.id);
    if (pNotes.length > 0) {
      const maxDist = Math.max(...pNotes.map(n =>
        Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2) + n.r
      ));
      pageLayouts.get(page.id).radius = maxDist + 32;
    }
  });

  return { pageLayouts, sectionLayouts, noteNodes };
}

/**
 * Hierarchical spatial graph visualization for note connections.
 *
 * All notes organized by page/section clusters, connection lines overlaid.
 * Opens at appropriate zoom level based on navigation context.
 */
export function GraphView({
  connections,
  notes,
  pages,
  sections,
  currentPageId,
  currentSectionId,
  onNavigate,
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const zoomBehaviorRef = useRef(null);
  const mainGroupRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [filterType, setFilterType] = useState('all');
  const [showConnectionsOnly, setShowConnectionsOnly] = useState(false);
  const [currentZoomLevel, setCurrentZoomLevel] = useState(0.35);
  const draggedRef = useRef(false);
  const zoomLevelRef = useRef(0.35);

  // ─── Build page tone map ────────────────────────────────────────────────
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

  // ─── Compute layout ────────────────────────────────────────────────────
  const layout = useMemo(
    () => computeLayout(notes, pages, sections, connections, pageToneMap),
    [notes, pages, sections, connections, pageToneMap]
  );

  const { pageLayouts, sectionLayouts, noteNodes } = layout;

  // ─── Filter connections by type ─────────────────────────────────────────
  const filteredConnections = useMemo(() => {
    if (!connections) return [];
    if (filterType === 'all') return connections;
    return connections.filter(c => c.connection_type === filterType);
  }, [connections, filterType]);

  // ─── Build note lookup for connection rendering ─────────────────────────
  const noteNodeMap = useMemo(() => {
    const map = new Map();
    noteNodes.forEach(n => map.set(n.id, n));
    return map;
  }, [noteNodes]);

  // ─── Connection links (only where both notes exist) ─────────────────────
  const connectionLinks = useMemo(() => {
    return filteredConnections
      .filter(c => noteNodeMap.has(c.source_note_id) && noteNodeMap.has(c.target_note_id))
      .map(c => ({
        source: noteNodeMap.get(c.source_note_id),
        target: noteNodeMap.get(c.target_note_id),
        type: c.connection_type || 'related',
        id: c.connection_id,
      }));
  }, [filteredConnections, noteNodeMap]);

  // ─── Connected note IDs set ────────────────────────────────────────────
  const connectedNoteIds = useMemo(() => {
    const ids = new Set();
    connectionLinks.forEach(l => {
      ids.add(l.source.id);
      ids.add(l.target.id);
    });
    return ids;
  }, [connectionLinks]);

  // ─── Display nodes (filtered if showConnectionsOnly) ───────────────────
  const displayNodes = useMemo(() => {
    if (!showConnectionsOnly) return noteNodes;
    return noteNodes.filter(n => connectedNoteIds.has(n.id));
  }, [noteNodes, showConnectionsOnly, connectedNoteIds]);

  // ─── Unique connection types for filter ─────────────────────────────────
  const connectionTypes = useMemo(() => {
    const types = new Set((connections || []).map(c => c.connection_type).filter(Boolean));
    return ['all', ...types];
  }, [connections]);

  // ─── Pages with notes for legend ────────────────────────────────────────
  const pagesWithNotes = useMemo(() => {
    const pageIds = new Set(noteNodes.map(n => n.pageId));
    return (pages || []).filter(p => pageIds.has(p.id));
  }, [pages, noteNodes]);

  // ─── Measure container ─────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width || 800, height: rect.height || 600 });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ─── Apply semantic zoom styling ────────────────────────────────────────
  const applySemanticZoom = useCallback((g, k, transform) => {
    zoomLevelRef.current = k;
    setCurrentZoomLevel(k);

    const isGlobal = k <= ZOOM_PAGE;
    const isPage = k > ZOOM_PAGE && k <= ZOOM_SECTION;
    const isSection = k > ZOOM_SECTION;

    // Page boundaries
    g.selectAll('.page-boundary rect')
      .attr('stroke-opacity', isGlobal ? 0.08 : isPage ? 0.05 : 0.03);
    g.selectAll('.page-boundary text')
      .attr('font-size', isGlobal ? 14 : isPage ? 12 : 10)
      .attr('opacity', isGlobal ? 0.8 : isPage ? 0.5 : 0.3);

    // Section boundaries
    g.selectAll('.section-boundary')
      .attr('opacity', isGlobal ? 0 : 1);
    g.selectAll('.section-boundary text')
      .attr('font-size', isSection ? 11 : 10);

    // Notes
    const noteScale = isGlobal ? 0.4 : isPage ? 0.7 : 1.0;
    g.selectAll('.note-node .main')
      .attr('r', d => d.r * noteScale);
    g.selectAll('.note-node .glow')
      .attr('r', d => d.r * noteScale + 4)
      .attr('opacity', isGlobal ? 0 : isPage ? 0.03 : 0.06);

    // Connection lines
    g.selectAll('.connection-line')
      .attr('stroke-width', isGlobal ? 0 : isPage ? 0.5 : 1)
      .attr('opacity', isGlobal ? 0 : isPage ? 0.3 : 1);

    // Section-level focus dimming
    if (isSection && transform) {
      const { width, height } = dimensions;
      // Viewport center in graph coordinates
      const vcx = (width / 2 - transform.x) / transform.k;
      const vcy = (height / 2 - transform.y) / transform.k;

      // Find closest section to viewport center
      let closestSection = null;
      let closestDist = Infinity;
      sectionLayouts.forEach((sl, sid) => {
        const dist = Math.sqrt((sl.cx - vcx) ** 2 + (sl.cy - vcy) ** 2);
        if (dist < closestDist) {
          closestDist = dist;
          closestSection = sid;
        }
      });

      if (closestSection) {
        const focusPageId = sectionLayouts.get(closestSection)?.pageId;
        g.selectAll('.note-node')
          .attr('opacity', d => {
            if (d.sectionId === closestSection) return 1.0;
            const isConnected = connectionLinks.some(
              l => (l.source.id === d.id && l.target.sectionId === closestSection) ||
                   (l.target.id === d.id && l.source.sectionId === closestSection)
            );
            if (d.pageId === focusPageId) return isConnected ? 0.5 : 0.35;
            return isConnected ? 0.27 : 0.12;
          });
      }
    } else {
      g.selectAll('.note-node').attr('opacity', 1);
    }
  }, [dimensions, sectionLayouts, connectionLinks]);

  // ─── D3 rendering ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = select(svgRef.current);
    const { width, height } = dimensions;

    // Clear previous render
    svg.selectAll('*').remove();

    // Defs for glow filter
    const defs = svg.append('defs');

    const filter = defs.append('filter').attr('id', 'node-glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const hoverFilter = defs.append('filter').attr('id', 'node-glow-hover');
    hoverFilter.append('feGaussianBlur').attr('stdDeviation', '6').attr('result', 'coloredBlur');
    const hoverMerge = hoverFilter.append('feMerge');
    hoverMerge.append('feMergeNode').attr('in', 'coloredBlur');
    hoverMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Main group for zoom/pan
    const g = svg.append('g');
    mainGroupRef.current = g;

    // ─── Layer 1: Page boundaries ──────────────────────────────────────
    const pageGroup = g.append('g').attr('class', 'page-boundaries');
    pageLayouts.forEach((pl, pageId) => {
      // Compute bounding box from notes in this page
      const pNotes = displayNodes.filter(n => n.pageId === pageId);
      if (pNotes.length === 0) return;

      const padding = 32;
      const minX = Math.min(...pNotes.map(n => n.x - n.r)) - padding;
      const maxX = Math.max(...pNotes.map(n => n.x + n.r)) + padding;
      const minY = Math.min(...pNotes.map(n => n.y - n.r)) - padding;
      const maxY = Math.max(...pNotes.map(n => n.y + n.r)) + padding;

      const pg = pageGroup.append('g').attr('class', 'page-boundary');

      pg.append('rect')
        .attr('x', minX)
        .attr('y', minY)
        .attr('width', maxX - minX)
        .attr('height', maxY - minY)
        .attr('rx', 2)
        .attr('ry', 2)
        .attr('fill', 'rgba(255, 255, 255, 0.02)')
        .attr('stroke', 'rgba(255, 255, 255, 0.05)')
        .attr('stroke-width', 1);

      pg.append('text')
        .attr('x', minX + 8)
        .attr('y', minY - 6)
        .attr('fill', colors.textMuted)
        .attr('font-size', 11)
        .attr('font-family', "'Manrope', sans-serif")
        .attr('font-weight', 600)
        .attr('letter-spacing', '0.5px')
        .text(pl.name.toUpperCase())
        .style('cursor', 'pointer')
        .on('click', (event) => {
          event.stopPropagation();
          onNavigate(pageId, null);
        });
    });

    // ─── Layer 2: Section boundaries ───────────────────────────────────
    const sectionGroup = g.append('g').attr('class', 'section-boundaries');
    sectionLayouts.forEach((sl, sectionId) => {
      const sNotes = displayNodes.filter(n => n.sectionId === sectionId);
      if (sNotes.length === 0) return;

      const padding = 20;
      const minX = Math.min(...sNotes.map(n => n.x - n.r)) - padding;
      const maxX = Math.max(...sNotes.map(n => n.x + n.r)) + padding;
      const minY = Math.min(...sNotes.map(n => n.y - n.r)) - padding;
      const maxY = Math.max(...sNotes.map(n => n.y + n.r)) + padding;

      const sg = sectionGroup.append('g').attr('class', 'section-boundary');

      sg.append('rect')
        .attr('x', minX)
        .attr('y', minY)
        .attr('width', maxX - minX)
        .attr('height', maxY - minY)
        .attr('rx', 2)
        .attr('ry', 2)
        .attr('fill', 'rgba(255, 255, 255, 0.015)')
        .attr('stroke', 'rgba(255, 255, 255, 0.04)')
        .attr('stroke-width', 1);

      sg.append('text')
        .attr('x', minX + 6)
        .attr('y', minY - 4)
        .attr('fill', colors.textMuted)
        .attr('font-size', 10)
        .attr('font-family', "'Manrope', sans-serif")
        .attr('font-weight', 500)
        .attr('opacity', 0.6)
        .text(sl.name)
        .style('cursor', 'pointer')
        .on('click', (event) => {
          event.stopPropagation();
          onNavigate(sl.pageId, sectionId);
        });
    });

    // ─── Layer 3: Connection lines ─────────────────────────────────────
    const linkGroup = g.append('g').attr('class', 'connections');
    connectionLinks.forEach(link => {
      // Only render if both notes are in displayNodes
      if (!displayNodes.find(n => n.id === link.source.id)) return;
      if (!displayNodes.find(n => n.id === link.target.id)) return;

      linkGroup.append('line')
        .attr('class', 'connection-line')
        .attr('x1', link.source.x)
        .attr('y1', link.source.y)
        .attr('x2', link.target.x)
        .attr('y2', link.target.y)
        .attr('stroke', TYPE_COLORS[link.type] || TYPE_COLORS.related)
        .attr('stroke-width', 1)
        .attr('stroke-linecap', 'round')
        .style('opacity', 0)
        .transition()
        .delay((d, i) => 200 + i * 15)
        .duration(400)
        .style('opacity', 1);
    });

    // Re-select for interactions
    const linkSelection = linkGroup.selectAll('.connection-line');

    // ─── Layer 4: Note nodes ───────────────────────────────────────────
    const nodeGroup = g.append('g').attr('class', 'notes');
    const node = nodeGroup
      .selectAll('g')
      .data(displayNodes, d => d.id)
      .join('g')
      .attr('class', 'note-node')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', 'pointer')
      .style('opacity', 0);

    // Staggered fade-in
    node
      .transition()
      .delay((d, i) => i * 40)
      .duration(200)
      .style('opacity', 1);

    // Outer glow circle
    node
      .append('circle')
      .attr('class', 'glow')
      .attr('r', d => d.r + 4)
      .attr('fill', d => d.pageTone.fill)
      .attr('opacity', 0.06)
      .attr('filter', 'url(#node-glow)');

    // Main node circle
    node
      .append('circle')
      .attr('class', 'main')
      .attr('r', d => d.r)
      .attr('fill', d => d.pageTone.fill)
      .attr('stroke', d => d.pageTone.stroke)
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.4);

    // ─── Hover interactions ────────────────────────────────────────────
    node
      .on('mouseenter', function (event, d) {
        select(this).select('.main')
          .transition().duration(150)
          .attr('r', d.r * 1.2)
          .attr('stroke-width', 1.5)
          .attr('stroke-opacity', 0.7);

        select(this).select('.glow')
          .transition().duration(150)
          .attr('r', d.r * 1.2 + 8)
          .attr('opacity', 0.15)
          .attr('filter', 'url(#node-glow-hover)');

        // Highlight connected links
        linkSelection
          .transition().duration(150)
          .attr('stroke-width', function () {
            const line = select(this);
            const x1 = +line.attr('x1'), y1 = +line.attr('y1');
            const x2 = +line.attr('x2'), y2 = +line.attr('y2');
            const isConnected = connectionLinks.some(
              l => (l.source.id === d.id || l.target.id === d.id) &&
                   ((Math.abs(l.source.x - x1) < 0.1 && Math.abs(l.source.y - y1) < 0.1) ||
                    (Math.abs(l.target.x - x1) < 0.1 && Math.abs(l.target.y - y1) < 0.1))
            );
            return isConnected ? 2 : 0.5;
          })
          .style('opacity', function () {
            const line = select(this);
            const x1 = +line.attr('x1'), y1 = +line.attr('y1');
            const isConnected = connectionLinks.some(
              l => (l.source.id === d.id || l.target.id === d.id) &&
                   ((Math.abs(l.source.x - x1) < 0.1 && Math.abs(l.source.y - y1) < 0.1) ||
                    (Math.abs(l.target.x - x1) < 0.1 && Math.abs(l.target.y - y1) < 0.1))
            );
            return isConnected ? 1 : 0.1;
          });

        // Dim unconnected nodes
        const connectedIds = new Set();
        connectedIds.add(d.id);
        connectionLinks.forEach(l => {
          if (l.source.id === d.id) connectedIds.add(l.target.id);
          if (l.target.id === d.id) connectedIds.add(l.source.id);
        });

        node
          .transition().duration(150)
          .style('opacity', n => connectedIds.has(n.id) ? 1 : 0.1);

        // Show tooltip
        const svgRect = svgRef.current.getBoundingClientRect();
        setHoveredNode(d);
        setTooltipPos({
          x: event.clientX - svgRect.left + 16,
          y: event.clientY - svgRect.top - 10,
        });
      })
      .on('mousemove', function (event) {
        const svgRect = svgRef.current.getBoundingClientRect();
        setTooltipPos({
          x: event.clientX - svgRect.left + 16,
          y: event.clientY - svgRect.top - 10,
        });
      })
      .on('mouseleave', function () {
        node.selectAll('.main')
          .transition().duration(200)
          .attr('r', d => d.r)
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 0.4);

        node.selectAll('.glow')
          .transition().duration(200)
          .attr('r', d => d.r + 4)
          .attr('opacity', 0.06)
          .attr('filter', 'url(#node-glow)');

        linkSelection
          .transition().duration(200)
          .attr('stroke-width', 1)
          .style('opacity', 1);

        node
          .transition().duration(200)
          .style('opacity', 1);

        setHoveredNode(null);
      })
      .on('click', function (event, d) {
        event.stopPropagation();
        if (draggedRef.current) return;
        if (d.pageId && d.sectionId) {
          onNavigate(d.pageId, d.sectionId);
        }
      });

    // ─── Drag behavior ─────────────────────────────────────────────────
    const dragBehavior = d3Drag()
      .on('start', function (event, d) {
        draggedRef.current = false;
      })
      .on('drag', function (event, d) {
        draggedRef.current = true;
        d.x = event.x;
        d.y = event.y;
        select(this).attr('transform', `translate(${d.x},${d.y})`);

        // Update connected lines
        linkSelection.each(function () {
          const line = select(this);
          connectionLinks.forEach(l => {
            if (l.source.id === d.id) {
              if (Math.abs(+line.attr('x1') - l.source.x) < 1 &&
                  Math.abs(+line.attr('y1') - l.source.y) < 1) {
                // This won't match after first drag — use data binding instead
              }
            }
          });
        });

        // Simpler: update all lines connected to this node
        connectionLinks.forEach(l => {
          if (l.source.id === d.id) {
            l.source.x = d.x;
            l.source.y = d.y;
          }
          if (l.target.id === d.id) {
            l.target.x = d.x;
            l.target.y = d.y;
          }
        });

        // Re-render connection lines positions
        linkGroup.selectAll('.connection-line').each(function (_, i) {
          const link = connectionLinks[i];
          if (link) {
            select(this)
              .attr('x1', link.source.x)
              .attr('y1', link.source.y)
              .attr('x2', link.target.x)
              .attr('y2', link.target.y);
          }
        });
      })
      .on('end', function () {
        // draggedRef stays set until click handler checks it
      });

    node.call(dragBehavior);

    // ─── Zoom behavior ─────────────────────────────────────────────────
    let rafId = null;
    const zoomBehavior = d3Zoom()
      .scaleExtent([0.15, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          applySemanticZoom(g, event.transform.k, event.transform);
          rafId = null;
        });
      });

    svg.call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;

    // ─── Initial zoom from navigation context ──────────────────────────
    let targetCx = 0, targetCy = 0, targetScale = 0.35;

    if (currentSectionId && sectionLayouts.has(currentSectionId)) {
      const sl = sectionLayouts.get(currentSectionId);
      targetCx = sl.cx;
      targetCy = sl.cy;
      targetScale = 1.5;
    } else if (currentPageId && pageLayouts.has(currentPageId)) {
      const pl = pageLayouts.get(currentPageId);
      targetCx = pl.cx;
      targetCy = pl.cy;
      targetScale = 0.7;
    }

    const initialTransform = zoomIdentity
      .translate(width / 2, height / 2)
      .scale(targetScale)
      .translate(-targetCx, -targetCy);

    svg.transition()
      .duration(800)
      .ease(easeCubicInOut)
      .call(zoomBehavior.transform, initialTransform);

    // Apply initial semantic zoom after animation
    setTimeout(() => {
      applySemanticZoom(g, targetScale, initialTransform);
    }, 850);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [displayNodes, connectionLinks, dimensions, pageLayouts, sectionLayouts,
      currentPageId, currentSectionId, onNavigate, applySemanticZoom]);

  // ─── Zoom controls ──────────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = select(svgRef.current);
    svg.transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 1.5);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const svg = select(svgRef.current);
    svg.transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 1 / 1.5);
  }, []);

  const handleFitAll = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || displayNodes.length === 0) return;

    const { width, height } = dimensions;
    const padding = 60;

    const minX = Math.min(...displayNodes.map(n => n.x));
    const maxX = Math.max(...displayNodes.map(n => n.x));
    const minY = Math.min(...displayNodes.map(n => n.y));
    const maxY = Math.max(...displayNodes.map(n => n.y));

    const graphWidth = maxX - minX || 1;
    const graphHeight = maxY - minY || 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const scale = Math.min(
      (width - padding * 2) / graphWidth,
      (height - padding * 2) / graphHeight,
      2
    );

    const transform = zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-cx, -cy);

    const svg = select(svgRef.current);
    svg.transition().duration(600).ease(easeCubicInOut)
      .call(zoomBehaviorRef.current.transform, transform);
  }, [displayNodes, dimensions]);

  // ─── Frosted glass control style ────────────────────────────────────────
  const controlStyle = {
    background: 'rgba(13, 13, 13, 0.85)',
    backdropFilter: 'blur(24px) saturate(150%)',
    WebkitBackdropFilter: 'blur(24px) saturate(150%)',
    border: `1px solid ${colors.border}`,
    borderRadius: 2,
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: "'Manrope', sans-serif",
    cursor: 'pointer',
    outline: 'none',
  };

  // ─── Empty state ───────────────────────────────────────────────────────
  if (!notes || notes.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 400,
        gap: 16,
        color: colors.textMuted,
        fontFamily: "'Manrope', sans-serif",
      }}>
        <div style={{ fontSize: 16, fontWeight: 500 }}>No notes yet</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 500,
        background: colors.bg,
        overflow: 'hidden',
      }}
    >
      {/* ─── Filter controls (top-left) ──────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        display: 'flex',
        gap: 8,
        zIndex: 10,
      }}>
        {/* Type filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ ...controlStyle, padding: '4px 8px' }}
        >
          {connectionTypes.map(t => (
            <option key={t} value={t}>
              {t === 'all' ? 'All types' : t}
            </option>
          ))}
        </select>

        {/* Show connections only toggle */}
        <button
          onClick={() => setShowConnectionsOnly(s => !s)}
          style={{
            ...controlStyle,
            padding: '4px 8px',
            border: `1px solid ${showConnectionsOnly ? colors.primary : colors.border}`,
            color: showConnectionsOnly ? colors.primary : colors.textSecondary,
            transition: 'color 0.15s ease, border-color 0.15s ease',
          }}
        >
          Connections only
        </button>
      </div>

      {/* ─── Zoom controls (top-right) ───────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        zIndex: 10,
      }}>
        <button onClick={handleZoomIn} style={{ ...controlStyle, padding: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        <button onClick={handleZoomOut} style={{ ...controlStyle, padding: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&minus;</button>
        <button onClick={handleFitAll} style={{ ...controlStyle, padding: 0, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>Fit</button>
      </div>

      {/* ─── SVG canvas ────────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ display: 'block', background: 'transparent' }}
      />

      {/* ─── Hover tooltip (frosted glass) ──────────────────────────────── */}
      {hoveredNode && (
        <div
          style={{
            position: 'absolute',
            top: tooltipPos.y,
            left: tooltipPos.x,
            maxWidth: 300,
            padding: '10px 12px',
            ...controlStyle,
            cursor: 'default',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          {currentZoomLevel <= ZOOM_PAGE ? (
            // Global zoom: page name + note count
            <div style={{
              color: colors.textPrimary,
              fontSize: 12,
              fontFamily: "'Manrope', sans-serif",
            }}>
              {hoveredNode.pageName} &middot; {hoveredNode.connectionCount} connection{hoveredNode.connectionCount === 1 ? '' : 's'}
            </div>
          ) : (
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
              <div style={{
                color: colors.textMuted, fontSize: 10,
                fontFamily: "'Manrope', sans-serif", marginTop: 4,
              }}>
                {hoveredNode.connectionCount} connection{hoveredNode.connectionCount === 1 ? '' : 's'} &middot; Click to navigate
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Page legend (bottom-left) ───────────────────────────────────── */}
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

      {/* ─── Stats (bottom-right) ────────────────────────────────────────── */}
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
        {displayNodes.length} notes &middot; {connectionLinks.length} connections
      </div>
    </div>
  );
}

export default GraphView;
