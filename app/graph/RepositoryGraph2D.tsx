"use client";

import { useMemo } from "react";
import type { KeyboardEvent } from "react";
import type { GraphEdge, GraphNode } from "../../lib/graph-types";

const colors: Record<GraphEdge["kind"], string> = {
  CONTAINS: "#53627b", IMPORTS: "#5d9de6", PARENT: "#8e8297", INCLUDES: "#ad81a2",
  REFERENCES: "#71aab2", SUPERSEDES: "#ff9d74", COVERS: "#78b8a9",
};

function fill(node: GraphNode) {
  if (node.kind === "risk") return node.risk!.riskScore >= .7 ? "#ff846b" : node.risk!.riskScore >= .35 ? "#ffc171" : "#7dc4b6";
  return ({ folder: "#609dff", file: "#54c6c0", package: "#caadff", pull: "#ffb94f", commit: "#9ca9c4" } as const)[node.kind];
}

export function RepositoryGraph2D({ nodes, edges, selectedId, onSelect }: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const layout = useMemo(() => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const degree = new Map(nodes.map(node => [node.id, 0]));
    for (const edge of edges) {
      if (degree.has(edge.from)) degree.set(edge.from, degree.get(edge.from)! + 1);
      if (degree.has(edge.to)) degree.set(edge.to, degree.get(edge.to)! + 1);
    }
    const center = (selectedId && byId.get(selectedId)) || [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0];
    if (!center) return { points: [] as { node: GraphNode; x: number; y: number; radius: number }[], visible: new Set<string>(), shownEdges: [] as GraphEdge[] };

    const neighborIds = new Set(edges.flatMap(edge => edge.from === center.id ? [edge.to] : edge.to === center.id ? [edge.from] : []));
    const adjacent = [...neighborIds].filter(id => byId.has(id)).sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b));
    const selectedNodes = [center, ...adjacent.slice(0, 23).map(id => byId.get(id)!)];
    const chosen = new Set(selectedNodes.map(node => node.id));
    for (const node of [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))) {
      if (chosen.size >= 30) break;
      chosen.add(node.id);
    }
    const visible = chosen;
    const ringOne = selectedNodes.slice(1);
    const ringTwo = [...visible].filter(id => id !== center.id && !neighborIds.has(id)).map(id => byId.get(id)!);
    const points = [{ node: center, x: 480, y: 290, radius: 19 }];
    const placeRing = (items: GraphNode[], radius: number, phase = -Math.PI / 2) => items.forEach((node, index) => {
      const angle = phase + index * Math.PI * 2 / Math.max(items.length, 1);
      const size = node.kind === "folder" || node.kind === "risk" ? 15 : 11;
      points.push({ node, x: 480 + Math.cos(angle) * radius, y: 290 + Math.sin(angle) * radius, radius: size });
    });
    placeRing(ringOne, 160);
    placeRing(ringTwo, 265, -Math.PI / 2 + .11);
    const pointIds = new Set(points.map(point => point.node.id));
    const shownEdges = edges.filter(edge => pointIds.has(edge.from) && pointIds.has(edge.to)).slice(0, 58);
    return { points, shownEdges };
  }, [nodes, edges, selectedId]);

  const positions = new Map(layout.points.map(point => [point.node.id, point]));
  function keyboardSelect(event: KeyboardEvent<SVGGElement>, id: string) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(id); }
  }

  return <div className="graph2d-shell">
    <div className="graph2d-legend" aria-label="Graph legend"><span><i className="legend-folder" />Code</span><span><i className="legend-pull" />Pull request</span><span><i className="legend-risk" />Risk area</span><span><i className="legend-reversal" />Decision link</span></div>
    <svg className="graph2d-canvas" viewBox="0 0 960 580" role="group" aria-label={`2D repository graph with ${layout.points.length} visible nodes`}>
      <defs>
        <radialGradient id="graph2d-glow"><stop stopColor="#5b789c" stopOpacity=".18" /><stop offset="1" stopColor="#12151c" stopOpacity="0" /></radialGradient>
        <filter id="graph2d-shadow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width="960" height="580" rx="16" fill="#11141a" />
      <circle cx="480" cy="290" r="310" fill="url(#graph2d-glow)" />
      <circle cx="480" cy="290" r="160" fill="none" stroke="#c3d5ef" strokeOpacity=".07" strokeDasharray="3 8" />
      <circle cx="480" cy="290" r="265" fill="none" stroke="#c3d5ef" strokeOpacity=".045" strokeDasharray="3 9" />
      {layout.shownEdges.map((edge, index) => {
        const from = positions.get(edge.from); const to = positions.get(edge.to);
        if (!from || !to) return null;
        const highlighted = edge.kind === "SUPERSEDES" || edge.kind === "COVERS";
        return <line key={`${edge.from}:${edge.to}:${edge.kind}:${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={colors[edge.kind]} strokeWidth={highlighted ? 2.3 : 1.1} strokeDasharray={edge.kind === "REFERENCES" ? "5 5" : undefined}
          strokeOpacity={highlighted ? .82 : .38} />;
      })}
      {layout.points.map(({ node, x, y, radius }) => {
        const active = node.id === selectedId;
        const label = node.label.length > 24 ? node.label.slice(0, 22) + "…" : node.label;
        return <g key={node.id} className={`graph2d-node ${active ? "is-active" : ""}`} role="button" tabIndex={0}
          aria-label={`${node.label}: ${node.detail}`} aria-pressed={active} onClick={() => onSelect(node.id)} onKeyDown={event => keyboardSelect(event, node.id)}>
          <title>{node.label} · {node.detail}</title>
          {active && <circle cx={x} cy={y} r={radius + 9} fill={fill(node)} fillOpacity=".12" />}
          <circle cx={x} cy={y} r={radius} fill={fill(node)} fillOpacity={active ? 1 : .86} stroke={active ? "#ffe1c7" : "#ffffff55"}
            strokeWidth={active ? 2.5 : 1.25} filter={active ? "url(#graph2d-shadow)" : undefined} />
          <text x={x} y={y + radius + 17} textAnchor="middle" className={active ? "graph2d-label is-active" : "graph2d-label"}>{label}</text>
        </g>;
      })}
      {!layout.points.length && <text x="480" y="290" textAnchor="middle" className="graph2d-empty">No connected nodes in this view.</text>}
    </svg>
    <p className="graph2d-caption">Showing a focused cluster · Select a node to explore its neighbors</p>
  </div>;
}
