import { useId, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "../../lib/graph-types";

const home = { yaw: 0.25, pitch: -0.18 };
const clamp = (value: number) => Math.max(-1.35, Math.min(1.35, value));

export function SpatialGraph({ selected, incoming, outgoing, byId, inspect }: {
  selected: GraphNode;
  incoming: GraphEdge[];
  outgoing: GraphEdge[];
  byId: Map<string, GraphNode>;
  inspect: (id: string) => void;
}) {
  const [{ yaw, pitch }, setCamera] = useState(home);
  const drag = useRef<{ x: number; y: number }>(null);
  const directionMarker = useId();
  const bothDirections = incoming.length > 0 && outgoing.length > 0;
  const points = [incoming, outgoing].flatMap((edges, lane) => edges.map((edge, index) => {
    const side = lane ? 1 : -1;
    const angle = bothDirections
      ? edges.length > 1 ? -1.1 + index * 2.2 / (edges.length - 1) : 0
      : index * 2 * Math.PI / edges.length;
    const x = bothDirections ? side * (173 + 49 * Math.cos(angle)) : Math.cos(angle) * 221;
    const y = Math.sin(angle) * 141;
    const z = Math.sin(index * 2.39996 + lane) * 57;
    const rotatedX = x * Math.cos(yaw) + z * Math.sin(yaw);
    const rotatedZ = z * Math.cos(yaw) - x * Math.sin(yaw);
    const depth = rotatedZ * Math.cos(pitch) + y * Math.sin(pitch);
    const scale = 490 / (490 - depth);
    return {
      key: [edge.from, edge.kind, edge.to].join("/"), edge,
      node: byId.get(lane ? edge.to : edge.from),
      x: 320 + rotatedX * scale,
      y: 200 + (y * Math.cos(pitch) - rotatedZ * Math.sin(pitch)) * scale,
      scale, depth,
    };
  })).sort((a, b) => a.depth - b.depth);

  return <div className="graph-spatial">
    <div className="graph-orbit-controls" aria-label="3D rotation controls">
      <button type="button" aria-label="Rotate left" onClick={() => setCamera(camera => ({ ...camera, yaw: camera.yaw - 0.3 }))}>←</button>
      <button type="button" onClick={() => setCamera(home)}>Reset view</button>
      <button type="button" aria-label="Rotate right" onClick={() => setCamera(camera => ({ ...camera, yaw: camera.yaw + 0.3 }))}>→</button>
    </div>
    <div className="graph-orbit-canvas" role="group" aria-label="3D repository diagram">
      <svg viewBox="0 0 640 400" aria-hidden="true"
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={event => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x;
          const dy = event.clientY - drag.current.y;
          drag.current = { x: event.clientX, y: event.clientY };
          setCamera(camera => ({ yaw: camera.yaw + dx * 0.012, pitch: clamp(camera.pitch + dy * 0.012) }));
        }}
        onLostPointerCapture={() => { drag.current = null; }}>
        <defs><marker id={directionMarker} markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M1 1L6 4L1 7Z" fill="#d6beca" />
        </marker></defs>
        {points.map(({ key, edge, x, y, scale }) => {
          const center = "320 200";
          const neighbour = x + " " + y;
          const [from, to] = edge.to === selected.id ? [neighbour, center] : [center, neighbour];
          return <path key={key} d={`M ${from} L ${(320 + x) / 2} ${(200 + y) / 2} L ${to}`}
            markerMid={`url(#${directionMarker})`} className={edge.kind === "SUPERSEDES" ? "orbit-edge orbit-override" : "orbit-edge"}
            opacity={Math.min(1, scale * 0.74)} />;
        })}
      </svg>
      <div className="graph-orbit-focus"><small>Selected node</small><strong>{selected.label}</strong></div>
      {points.map(({ node, edge, key, x, y, scale }) => node && <button key={key} type="button" className="graph-orbit-node"
        style={{ left: (x / 6.4) + "%", top: (y / 4) + "%", "--node-scale": Math.max(0.8, Math.min(1.12, scale)) } as React.CSSProperties}
        onClick={() => inspect(node.id)} title={node.detail}
        aria-label={`${node.label}, ${edge.kind.toLowerCase()}, ${edge.to === selected.id ? "incoming" : "outgoing"}`}>
        <span>{node.label}</span>
      </button>)}
    </div>
    <small>Drag the diagram to orbit, or use the rotation controls.</small>
  </div>;
}
