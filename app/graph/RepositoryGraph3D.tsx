"use client";

import { useEffect, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "../../lib/graph-types";

const edgeColors: Record<GraphEdge["kind"], number> = {
  CONTAINS: 0x414d63, IMPORTS: 0x5383c8, PARENT: 0x7c7184, INCLUDES: 0x8e718d,
  REFERENCES: 0x6d9aa5, SUPERSEDES: 0xffa273, COVERS: 0x7eb4ad,
};
const visibleNodeLimit = 68;

function palette(kind: GraphNode["kind"], riskScore = 0) {
  if (kind === "risk") return riskScore >= 0.7 ? 0xff846b : riskScore >= 0.35 ? 0xffc171 : 0x7dc4b6;
  if (kind === "folder") return 0x609dff;
  if (kind === "file") return 0x54c6c0;
  if (kind === "package") return 0xcaadff;
  if (kind === "pull") return 0xffb94f;
  return 0x9ca9c4;
}

export function RepositoryGraph3D({ nodes, edges, selectedId, onSelect }: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const selectHandler = useRef(onSelect);
  const [fallback, setFallback] = useState(false);

  useEffect(() => { selectHandler.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const element = host.current;
    if (!element || !nodes.length) return;
    setFallback(false);
    let renderer: import("three").WebGLRenderer | undefined;
    let labels: import("three/addons/renderers/CSS2DRenderer.js").CSS2DRenderer | undefined;
    let controls: import("three/addons/controls/OrbitControls.js").OrbitControls | undefined;
    let frame = 0;
    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let removeInteractions: (() => void) | undefined;
    const objects = new Map<string, import("three").Object3D>();
    let scene: import("three").Scene | undefined;

    void (async () => {
      try {
        const THREE = await import("three");
        const [{ OrbitControls }, { CSS2DObject, CSS2DRenderer }] = await Promise.all([
          import("three/addons/controls/OrbitControls.js"),
          import("three/addons/renderers/CSS2DRenderer.js"),
        ]);
        if (disposed || !host.current) return;

        scene = new THREE.Scene();
        const graphScene = scene;
        graphScene.background = new THREE.Color(0x101116);
        graphScene.fog = new THREE.FogExp2(0x101116, 0.026);
        const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 1000);
        camera.position.set(0, 0, 23);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.className = "graph3d-webgl";
        renderer.domElement.setAttribute("aria-hidden", "true");
        labels = new CSS2DRenderer();
        labels.domElement.className = "graph3d-labels";
        labels.domElement.setAttribute("aria-hidden", "true");
        element.replaceChildren(renderer.domElement, labels.domElement);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        controls.dampingFactor = 0.075;
        controls.minDistance = 6;
        controls.maxDistance = 44;
        controls.maxPolarAngle = Math.PI * 0.92;
        controls.target.set(0, 0, 0);
        graphScene.add(new THREE.AmbientLight(0xc1d0ff, 1.6));
        const keyLight = new THREE.PointLight(0xffb888, 90, 60);
        keyLight.position.set(-7, 9, 11);
        graphScene.add(keyLight);
        const fillLight = new THREE.PointLight(0x669dff, 55, 45);
        fillLight.position.set(10, -4, -8);
        graphScene.add(fillLight);

        const grid = new THREE.GridHelper(24, 24, 0x314054, 0x202b3a);
        grid.position.y = -7.5;
        (grid.material as import("three").Material).transparent = true;
        (grid.material as import("three").Material).opacity = 0.38;
        graphScene.add(grid);

        const starPositions = new Float32Array(150 * 3);
        for (let i = 0; i < 150; i++) {
          starPositions[i * 3] = (Math.random() - 0.5) * 48;
          starPositions[i * 3 + 1] = (Math.random() - 0.5) * 30;
          starPositions[i * 3 + 2] = (Math.random() - 0.5) * 32;
        }
        const starsGeometry = new THREE.BufferGeometry();
        starsGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
        const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xaebdda, size: 0.035, transparent: true, opacity: 0.62 }));
        graphScene.add(stars);

        const degreeById = new Map(nodes.map(node => [node.id, 0]));
        for (const edge of edges) {
          if (degreeById.has(edge.from)) degreeById.set(edge.from, degreeById.get(edge.from)! + 1);
          if (degreeById.has(edge.to)) degreeById.set(edge.to, degreeById.get(edge.to)! + 1);
        }
        const nodeById = new Map(nodes.map(node => [node.id, node]));
        const poolIds = new Set<string>();
        if (selectedId && nodeById.has(selectedId)) poolIds.add(selectedId);
        const immediate = edges.flatMap(edge => edge.from === selectedId ? [edge.to] : edge.to === selectedId ? [edge.from] : [])
          .sort((a, b) => (degreeById.get(b) ?? 0) - (degreeById.get(a) ?? 0) || a.localeCompare(b));
        immediate.forEach(id => { if (poolIds.size < visibleNodeLimit) poolIds.add(id); });
        const buckets = new Map<string, GraphNode[]>();
        for (const node of nodes) {
          if (poolIds.has(node.id)) continue;
          const path = node.kind === "risk" ? node.risk?.path : node.detail;
          const group = node.kind === "pull" ? "Pull requests" : node.kind === "commit" ? "Commits"
            : node.kind === "risk" ? "Risk areas" : (path?.split("/").filter(Boolean)[0] || "Repository");
          const bucket = buckets.get(group) ?? [];
          bucket.push(node);
          buckets.set(group, bucket);
        }
        const balanced = Array.from(buckets).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
        balanced.forEach(([, bucket]) => bucket.sort((a, b) => (degreeById.get(b.id) ?? 0) - (degreeById.get(a.id) ?? 0) || a.id.localeCompare(b.id)));
        for (let offset = 0; poolIds.size < Math.min(nodes.length, visibleNodeLimit); offset++) {
          let added = false;
          for (const [, bucket] of balanced) {
            const node = bucket[offset];
            if (node && poolIds.size < visibleNodeLimit) { poolIds.add(node.id); added = true; }
          }
          if (!added) break;
        }
        const pool = Array.from(poolIds, id => nodeById.get(id)!).filter(Boolean);
        const visibleIds = new Set(pool.map(node => node.id));
        const positions = new Map<string, import("three").Vector3>();
        const golden = Math.PI * (3 - Math.sqrt(5));
        const notableRiskIds = nodes.filter(node => node.kind === "risk")
          .sort((a, b) => (b.risk?.riskScore ?? 0) - (a.risk?.riskScore ?? 0) || a.id.localeCompare(b.id))
          .slice(0, 4).map(node => node.id);
        const labelIds = new Set([selectedId, ...immediate, ...notableRiskIds]);
        const clusters = new Map<string, GraphNode[]>();
        for (const node of pool) {
          const path = node.kind === "risk" ? node.risk?.path : node.detail;
          const group = node.kind === "pull" ? "Pull requests" : node.kind === "commit" ? "Commits"
            : node.kind === "risk" ? "Risk areas" : (path?.split("/").filter(Boolean)[0] || "Repository");
          const members = clusters.get(group) ?? [];
          members.push(node);
          clusters.set(group, members);
        }
        const clusterEntries = Array.from(clusters.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const clusterCenters = new Map<string, import("three").Vector3>();
        clusterEntries.forEach(([group], clusterIndex) => {
          if (clusterEntries.length === 1) { clusterCenters.set(group, new THREE.Vector3()); return; }
          const y = 1 - 2 * ((clusterIndex + 0.5) / clusterEntries.length);
          const radius = Math.sqrt(Math.max(0, 1 - y * y));
          const angle = golden * clusterIndex;
          clusterCenters.set(group, new THREE.Vector3(Math.cos(angle) * radius * 7, y * 7, Math.sin(angle) * radius * 7));
        });
        const geometry = new THREE.SphereGeometry(1, 22, 16);
        const materials = new Map<number, import("three").MeshStandardMaterial>();
        pool.forEach((node, index) => {
          const path = node.kind === "risk" ? node.risk?.path : node.detail;
          const group = node.kind === "pull" ? "Pull requests" : node.kind === "commit" ? "Commits"
            : node.kind === "risk" ? "Risk areas" : (path?.split("/").filter(Boolean)[0] || "Repository");
          const members = clusters.get(group)!;
          const memberIndex = members.indexOf(node);
          const localY = 1 - 2 * ((memberIndex + 0.5) / members.length);
          const localRadial = Math.sqrt(Math.max(0, 1 - localY * localY));
          const localAngle = golden * memberIndex;
          const spread = Math.min(3.4, 0.85 + Math.sqrt(members.length) * 0.42);
          const offset = new THREE.Vector3(Math.cos(localAngle) * localRadial, localY, Math.sin(localAngle) * localRadial).multiplyScalar(spread);
          const point = clusterCenters.get(group)!.clone().add(offset);
          if (node.id === "folder:" && selectedId === node.id) point.set(0, 0, 0);
          positions.set(node.id, point);
          const color = palette(node.kind, node.risk?.riskScore);
          let material = materials.get(color);
          if (!material) {
            material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, metalness: 0.25, roughness: 0.34 });
            materials.set(color, material);
          }
          const degree = degreeById.get(node.id) ?? 0;
          const scale = node.kind === "risk" ? 0.18 + (node.risk?.riskScore ?? 0) * 0.12
            : node.kind === "folder" ? 0.08 + Math.min(0.15, degree * 0.008) : 0.045 + Math.min(0.04, degree * 0.004);
          const sphere = new THREE.Mesh(geometry, material);
          sphere.position.copy(point);
          sphere.scale.setScalar(scale);
          sphere.userData.nodeId = node.id;
          graphScene.add(sphere);
          objects.set(node.id, sphere);

          if (node.id === selectedId) {
            const halo = new THREE.Mesh(new THREE.TorusGeometry(scale * 1.55, 0.025, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffd1a7, transparent: true, opacity: 0.9 }));
            halo.position.copy(point);
            halo.rotation.x = Math.PI / 2.65;
            graphScene.add(halo);
          }
          if (labelIds.has(node.id)) {
            const label = document.createElement("span");
            label.className = "graph3d-label" + (node.id === selectedId ? " is-selected" : "") + (node.kind === "risk" ? " is-risk" : "");
            label.textContent = node.label;
            label.title = node.detail;
            const textObject = new CSS2DObject(label);
            textObject.position.set(0, scale + 0.1, 0);
            sphere.add(textObject);
          }
        });

        const linePositions: number[] = [];
        const lineColors: number[] = [];
        for (const edge of edges) {
          if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) continue;
          const from = positions.get(edge.from)!;
          const to = positions.get(edge.to)!;
          linePositions.push(from.x, from.y, from.z, to.x, to.y, to.z);
          const color = new THREE.Color(edgeColors[edge.kind]);
          lineColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }
        if (linePositions.length) {
          const lineGeometry = new THREE.BufferGeometry();
          lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
          lineGeometry.setAttribute("color", new THREE.Float32BufferAttribute(lineColors, 3));
          graphScene.add(new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.66 })));
        }

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let down: { x: number; y: number } | undefined;
        const onPointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
        const onPointerUp = (event: PointerEvent) => {
          if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
          const rect = renderer!.domElement.getBoundingClientRect();
          pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(Array.from(objects.values()), false)[0]?.object;
          if (hit?.userData.nodeId) selectHandler.current(String(hit.userData.nodeId));
        };
        const rotate = (event: Event) => controls?.rotateLeft(Number((event as CustomEvent<number>).detail));
        const zoom = (event: Event) => {
          const amount = Number((event as CustomEvent<number>).detail) || 1.2;
          if (amount > 1) controls?.dollyOut(amount);
          else controls?.dollyIn(1 / amount);
          controls?.update();
        };
        const reset = () => {
          camera.position.set(0, 0, 23);
          controls?.target.set(0, 0, 0);
          controls?.update();
        };
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointerup", onPointerUp);
        element.addEventListener("graph3d-rotate", rotate);
        element.addEventListener("graph3d-zoom", zoom);
        element.addEventListener("graph3d-reset", reset);
        removeInteractions = () => {
          renderer?.domElement.removeEventListener("pointerdown", onPointerDown);
          renderer?.domElement.removeEventListener("pointerup", onPointerUp);
          element.removeEventListener("graph3d-rotate", rotate);
          element.removeEventListener("graph3d-zoom", zoom);
          element.removeEventListener("graph3d-reset", reset);
        };
        const resize = () => {
          if (!host.current || !renderer || !labels) return;
          const width = Math.max(1, host.current.clientWidth);
          const height = Math.max(300, host.current.clientHeight);
          renderer.setSize(width, height, false);
          labels.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.render(graphScene, camera);
          labels.render(graphScene, camera);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(element);
        resize();
        const draw = () => {
          if (disposed || !renderer || !labels) return;
          controls?.update();
          renderer.render(graphScene, camera);
          labels.render(graphScene, camera);
          frame = requestAnimationFrame(draw);
        };
        draw();
      } catch {
        if (!disposed) setFallback(true);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      removeInteractions?.();
      controls?.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
      labels?.domElement.remove();
      const geometries = new Set<import("three").BufferGeometry>();
      const ownedMaterials = new Set<import("three").Material>();
      scene?.traverse(object => {
        const drawable = object as import("three").Mesh;
        if (drawable.geometry) geometries.add(drawable.geometry);
        if (Array.isArray(drawable.material)) drawable.material.forEach(material => ownedMaterials.add(material));
        else if (drawable.material) ownedMaterials.add(drawable.material);
      });
      geometries.forEach(geometry => geometry.dispose());
      ownedMaterials.forEach(material => material.dispose());
    };
  }, [nodes, edges, selectedId]);

  return <div className="graph3d-shell">
    <div ref={host} className="graph3d-surface" role="img" aria-label={`Interactive 3D repository graph showing up to ${visibleNodeLimit} of ${nodes.length} nodes and ${edges.length} relationships`} tabIndex={0}
      onKeyDown={event => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          host.current?.dispatchEvent(new CustomEvent("graph3d-rotate", { detail: event.key === "ArrowLeft" ? 0.22 : -0.22 }));
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          host.current?.dispatchEvent(new CustomEvent("graph3d-zoom", { detail: event.key === "ArrowUp" ? 1.2 : 0.8 }));
        }
      }} />
    {fallback && <div className="graph3d-fallback" role="status">3D graphics are unavailable in this browser. Select a node from the list to inspect its relationships.</div>}
    <div className="graph3d-controls" aria-label="3D graph controls">
      <button type="button" aria-label="Rotate graph left" title="Rotate left" onClick={() => host.current?.dispatchEvent(new CustomEvent("graph3d-rotate", { detail: -0.32 }))}>↶</button>
      <button type="button" aria-label="Reset graph view" title="Reset view" onClick={() => host.current?.dispatchEvent(new CustomEvent("graph3d-reset"))}>⌂</button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => host.current?.dispatchEvent(new CustomEvent("graph3d-zoom", { detail: 1.2 }))}>−</button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => host.current?.dispatchEvent(new CustomEvent("graph3d-zoom", { detail: 0.8 }))}>+</button>
      <button type="button" aria-label="Rotate graph right" title="Rotate right" onClick={() => host.current?.dispatchEvent(new CustomEvent("graph3d-rotate", { detail: 0.32 }))}>↷</button>
    </div>
    <p className="graph3d-help">Showing up to {visibleNodeLimit} of {nodes.length} nodes · Drag to orbit · Scroll to zoom · Select in list</p>
  </div>;
}
