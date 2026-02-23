import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { colors } from '../styles/theme.js';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from 'd3-force';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';

// ─── Monochromatic page tones (opacity-based, brand-aligned) ────────────────
// Each page gets a different opacity/lightness of the accent family
// Pure monochrome: accent at varying intensities
const PAGE_TONES = [
  { fill: 'rgba(148, 139, 114, 0.85)', stroke: 'rgba(148, 139, 114, 0.4)' }, // accent full
  { fill: 'rgba(148, 139, 114, 0.60)', stroke: 'rgba(148, 139, 114, 0.3)' }, // accent mid
  { fill: 'rgba(148, 139, 114, 0.40)', stroke: 'rgba(148, 139, 114, 0.2)' }, // accent light
  { fill: 'rgba(181, 174, 154, 0.70)', stroke: 'rgba(181, 174, 154, 0.3)' }, // primaryLight
  { fill: 'rgba(118, 111, 91, 0.80)',  stroke: 'rgba(118, 111, 91, 0.35)' }, // primaryDark
  { fill: 'rgba(148, 139, 114, 0.50)', stroke: 'rgba(148, 139, 114, 0.25)' },
  { fill: 'rgba(181, 174, 154, 0.50)', stroke: 'rgba(181, 174, 154, 0.25)' },
  { fill: 'rgba(118, 111, 91, 0.60)',  stroke: 'rgba(118, 111, 91, 0.3)' },
  { fill: 'rgba(148, 139, 114, 0.35)', stroke: 'rgba(148, 139, 114, 0.2)' },
  { fill: 'rgba(181, 174, 154, 0.45)', stroke: 'rgba(181, 174, 154, 0.2)' },
];

// Legend labels use solid hex so they're readable
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

/**
 * Force-directed graph visualization for note connections.
 *
 * Nodes = notes (toned by page, sized by connection count)
 * Edges = connections (colored by type)
 * Interactive: zoom/pan, hover preview, click to navigate
 */
export function GraphView({
  connections,
  notes,
  pages,
  sections,
  onNavigate,
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const simulationRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [filterType, setFilterType] = useState('all');
  const [filterPage, setFilterPage] = useState('all');
  const [isReady, setIsReady] = useState(false);

  // ─── Build page tone map ─────────────────────────────────────────────
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

  // ─── Build graph data from connections + notes ────────────────────────
  const graphData = useMemo(() => {
    if (!connections || !notes) return { nodes: [], links: [] };

    // Filter connections by type
    let filteredConns = connections;
    if (filterType !== 'all') {
      filteredConns = connections.filter(c => c.connection_type === filterType);
    }

    // Get unique note IDs from connections
    const connectedNoteIds = new Set();
    filteredConns.forEach(c => {
      connectedNoteIds.add(c.source_note_id);
      connectedNoteIds.add(c.target_note_id);
    });

    // Build nodes from notes that have connections
    const noteMap = {};
    notes.forEach(n => { noteMap[n.id] = n; });

    // Find page info for each note
    const sectionPageMap = {};
    (pages || []).forEach(p => {
      (p.sections || []).forEach(s => {
        sectionPageMap[s.id] = { pageId: p.id, pageName: p.name };
      });
    });

    const sectionNameMap = {};
    (sections || []).forEach(s => {
      sectionNameMap[s.id] = s.name;
    });

    const nodes = [];
    const nodeIdSet = new Set();
    connectedNoteIds.forEach(id => {
      const note = noteMap[id];
      if (!note) return;

      const pageInfo = sectionPageMap[note.sectionId] || {};
      if (filterPage !== 'all' && pageInfo.pageId !== filterPage) return;

      nodeIdSet.add(id);
      const connCount = filteredConns.filter(
        c => c.source_note_id === id || c.target_note_id === id
      ).length;

      const tone = pageToneMap[pageInfo.pageId] || PAGE_TONES[0];

      nodes.push({
        id,
        content: note.content,
        sectionId: note.sectionId,
        sectionName: sectionNameMap[note.sectionId] || '',
        pageId: pageInfo.pageId,
        pageName: pageInfo.pageName || '',
        fill: tone.fill,
        stroke: tone.stroke,
        legendColor: tone.legend,
        connectionCount: connCount,
        radius: Math.max(5, Math.min(16, 4 + connCount * 3)),
      });
    });

    // Build links (only between nodes that survived filtering)
    const links = filteredConns
      .filter(c => nodeIdSet.has(c.source_note_id) && nodeIdSet.has(c.target_note_id))
      .map(c => ({
        source: c.source_note_id,
        target: c.target_note_id,
        type: c.connection_type || 'related',
        id: c.connection_id,
      }));

    return { nodes, links };
  }, [connections, notes, pages, sections, pageToneMap, filterType, filterPage]);

  // ─── Measure container ────────────────────────────────────────────────
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

  // ─── D3 Force simulation ─────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) {
      setIsReady(true);
      return;
    }

    const svg = select(svgRef.current);
    const { width, height } = dimensions;

    // Clear previous render
    svg.selectAll('*').remove();

    // Defs for glow filter
    const defs = svg.append('defs');

    // Subtle glow filter
    const filter = defs.append('filter').attr('id', 'node-glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Hover glow filter (slightly stronger)
    const hoverFilter = defs.append('filter').attr('id', 'node-glow-hover');
    hoverFilter.append('feGaussianBlur').attr('stdDeviation', '6').attr('result', 'coloredBlur');
    const hoverMerge = hoverFilter.append('feMerge');
    hoverMerge.append('feMergeNode').attr('in', 'coloredBlur');
    hoverMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Main group for zoom/pan
    const g = svg.append('g');

    // Zoom behavior
    const zoomBehavior = d3Zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoomBehavior);

    // Initial zoom to fit
    svg.call(zoomBehavior.transform, zoomIdentity.translate(width / 2, height / 2).scale(0.9));

    // Clone data for D3 (it mutates objects)
    const nodeData = graphData.nodes.map(n => ({ ...n }));
    const linkData = graphData.links.map(l => ({ ...l }));

    // Create simulation
    const simulation = forceSimulation(nodeData)
      .force('link', forceLink(linkData).id(d => d.id).distance(80).strength(0.5))
      .force('charge', forceManyBody().strength(-200).distanceMax(300))
      .force('center', forceCenter(0, 0))
      .force('collision', forceCollide().radius(d => d.radius + 4))
      .force('x', forceX(0).strength(0.05))
      .force('y', forceY(0).strength(0.05))
      .alphaDecay(0.02)
      .velocityDecay(0.4);

    simulationRef.current = simulation;

    // ─── Render links ───────────────────────────────────────────────
    const linkGroup = g.append('g').attr('class', 'links');
    const link = linkGroup
      .selectAll('line')
      .data(linkData)
      .join('line')
      .attr('stroke', d => TYPE_COLORS[d.type] || TYPE_COLORS.related)
      .attr('stroke-width', 1)
      .attr('stroke-linecap', 'round')
      .style('opacity', 0)
      .transition()
      .delay((d, i) => 200 + i * 30)
      .duration(600)
      .style('opacity', 1);

    // Re-select without transition for tick updates
    const linkSelection = linkGroup.selectAll('line');

    // ─── Render nodes ───────────────────────────────────────────────
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const node = nodeGroup
      .selectAll('g')
      .data(nodeData)
      .join('g')
      .style('cursor', 'pointer')
      .style('opacity', 0);

    // Animate nodes in with stagger
    node
      .transition()
      .delay((d, i) => i * 40)
      .duration(500)
      .style('opacity', 1);

    // Outer glow circle
    node
      .append('circle')
      .attr('class', 'glow')
      .attr('r', d => d.radius + 4)
      .attr('fill', d => d.fill)
      .attr('opacity', 0.06)
      .attr('filter', 'url(#node-glow)');

    // Main node circle
    node
      .append('circle')
      .attr('class', 'main')
      .attr('r', d => d.radius)
      .attr('fill', d => d.fill)
      .attr('stroke', d => d.stroke)
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.4);

    // ─── Hover interactions ─────────────────────────────────────────
    node
      .on('mouseenter', function (event, d) {
        // Scale up node
        select(this).select('.main')
          .transition().duration(150)
          .attr('r', d.radius * 1.2)
          .attr('stroke-width', 1.5)
          .attr('stroke-opacity', 0.7);

        select(this).select('.glow')
          .transition().duration(150)
          .attr('r', d.radius * 1.2 + 8)
          .attr('opacity', 0.15)
          .attr('filter', 'url(#node-glow-hover)');

        // Highlight connected links
        linkSelection
          .transition().duration(150)
          .attr('stroke-width', l =>
            l.source.id === d.id || l.target.id === d.id ? 2 : 0.5
          )
          .style('opacity', l =>
            l.source.id === d.id || l.target.id === d.id ? 1 : 0.1
          );

        // Dim unconnected nodes
        node
          .transition().duration(150)
          .style('opacity', n => {
            if (n.id === d.id) return 1;
            const isConnected = linkData.some(
              l =>
                (l.source.id === d.id && l.target.id === n.id) ||
                (l.target.id === d.id && l.source.id === n.id)
            );
            return isConnected ? 1 : 0.1;
          });

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
        // Reset all
        node.selectAll('.main')
          .transition().duration(200)
          .attr('r', d => d.radius)
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 0.4);

        node.selectAll('.glow')
          .transition().duration(200)
          .attr('r', d => d.radius + 4)
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
        if (d.pageId && d.sectionId) {
          onNavigate(d.pageId, d.sectionId);
        }
      });

    // ─── Simulation tick ────────────────────────────────────────────
    simulation.on('tick', () => {
      linkSelection
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    setIsReady(true);

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [graphData, dimensions, onNavigate]);

  // ─── Unique connection types and pages for filters ────────────────────
  const connectionTypes = useMemo(() => {
    const types = new Set((connections || []).map(c => c.connection_type).filter(Boolean));
    return ['all', ...types];
  }, [connections]);

  const connectedPages = useMemo(() => {
    const pageIds = new Set();
    (connections || []).forEach(c => {
      if (c.source_page_id) pageIds.add(c.source_page_id);
      if (c.target_page_id) pageIds.add(c.target_page_id);
    });
    return (pages || []).filter(p => pageIds.has(p.id));
  }, [connections, pages]);

  // ─── Empty state ──────────────────────────────────────────────────────
  if (!connections || connections.length === 0) {
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
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
          <circle cx="18" cy="6" r="3" />
          <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" />
          <line x1="8.5" y1="6" x2="15" y2="6" />
        </svg>
        <div style={{ fontSize: 16, fontWeight: 500 }}>No connections yet</div>
        <div style={{ fontSize: 13, maxWidth: 280, textAlign: 'center', lineHeight: 1.6 }}>
          Type <span style={{ color: colors.primary, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, padding: '2px 6px', background: colors.surfaceRaised }}>[[</span> in any note to link it to another note, or use the AI agent.
        </div>
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
      {/* ─── Filter controls ──────────────────────────────────────────── */}
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
          style={{
            padding: '4px 8px',
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
          }}
        >
          {connectionTypes.map(t => (
            <option key={t} value={t}>
              {t === 'all' ? 'All types' : t}
            </option>
          ))}
        </select>

        {/* Page filter */}
        {connectedPages.length > 1 && (
          <select
            value={filterPage}
            onChange={e => setFilterPage(e.target.value)}
            style={{
              padding: '4px 8px',
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
            }}
          >
            <option value="all">All pages</option>
            {connectedPages.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ─── Stats badge ──────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        display: 'flex',
        gap: 12,
        zIndex: 10,
        color: colors.textMuted,
        fontSize: 11,
        fontFamily: "'Manrope', sans-serif",
      }}>
        <span>{graphData.nodes.length} notes</span>
        <span>{graphData.links.length} links</span>
      </div>

      {/* ─── SVG canvas ───────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{
          display: 'block',
          background: 'transparent',
        }}
      />

      {/* ─── Hover tooltip (frosted glass) ─────────────────────────────── */}
      {hoveredNode && (
        <div
          style={{
            position: 'absolute',
            top: tooltipPos.y,
            left: tooltipPos.x,
            width: 220,
            padding: '10px 12px',
            background: 'rgba(13, 13, 13, 0.85)',
            backdropFilter: 'blur(24px) saturate(150%)',
            WebkitBackdropFilter: 'blur(24px) saturate(150%)',
            border: `1px solid ${colors.border}`,
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
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
            {hoveredNode.content?.substring(0, 100)}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: hoveredNode.legendColor,
              flexShrink: 0,
            }} />
            <span style={{
              color: colors.textMuted,
              fontSize: 11,
              fontFamily: "'Manrope', sans-serif",
            }}>
              {hoveredNode.pageName}{hoveredNode.sectionName ? ` / ${hoveredNode.sectionName}` : ''}
            </span>
          </div>
          <div style={{
            color: colors.textMuted,
            fontSize: 10,
            fontFamily: "'Manrope', sans-serif",
            marginTop: 4,
          }}>
            {hoveredNode.connectionCount} connection{hoveredNode.connectionCount === 1 ? '' : 's'} &middot; Click to navigate
          </div>
        </div>
      )}

      {/* ─── Page legend (frosted glass) ──────────────────────────────── */}
      {connectedPages.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          zIndex: 10,
          padding: '6px 10px',
          background: 'rgba(13, 13, 13, 0.85)',
          backdropFilter: 'blur(24px) saturate(150%)',
          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
          borderRadius: 2,
          border: `1px solid ${colors.border}`,
        }}>
          {connectedPages.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: PAGE_LEGEND_COLORS[i % PAGE_LEGEND_COLORS.length],
              }} />
              <span style={{
                color: colors.textMuted,
                fontSize: 10,
                fontFamily: "'Manrope', sans-serif",
              }}>
                {p.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ─── Zoom hint ──────────────────────────────────────────────── */}
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
        Scroll to zoom &middot; Drag to pan
      </div>
    </div>
  );
}

export default GraphView;
