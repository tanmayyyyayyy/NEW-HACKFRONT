import type { GraphEdge, GraphNode, RepositoryGraph } from "./graph-types";

export const sourceFilePattern = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
export const sourceFileLimit = 18;
export const treeEntryLimit = 2200;
export const fileId = (path: string) => "file:" + path;
const folderId = (path: string) => "folder:" + path;
const name = (path: string) => path.split("/").at(-1) ?? path;
const parent = (path: string) => path.split("/").slice(0, -1).join("/");
const urlPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export function importSpecifiers(text: string) {
  const clauses = /\b(?:import|export)\s+(?:(?:[^;'"\n]+|\{[^}]*\})\s+from\s*)?['"]([^'"\n]+)['"]|\b(?:require|import)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  const uncommented = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "");
  return Array.from(new Set(Array.from(uncommented.matchAll(clauses), match => match[1] ?? match[2]))).slice(0, 50);
}

function normalize(path: string) {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return "";
      parts.pop();
    } else { parts.push(part); }
  }
  return parts.join("/");
}

function localImport(file: string, specifier: string, files: Set<string>) {
  const locations = specifier.startsWith(".")
    ? [normalize([parent(file), specifier].filter(Boolean).join("/"))]
    : specifier.startsWith("@/") ? [specifier.slice(2), "src/" + specifier.slice(2)] : [];
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"];
  for (const location of locations) {
    if (!location) continue;
    if (files.has(location)) return location;
    const stem = location.replace(/\.[cm]?jsx?$/, "");
    for (const extension of extensions) {
      if (files.has(stem + extension)) return stem + extension;
      if (files.has(location + "/index" + extension)) return location + "/index" + extension;
    }
  }
}

export function graphModel(graph: RepositoryGraph, web?: string) {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const available = new Set<string>();
  const add = (node: GraphNode) => { nodes.set(node.id, node); };
  const link = (from: string, to: string, kind: GraphEdge["kind"]) => {
    if (from !== to && nodes.has(from) && nodes.has(to)) edges.set(JSON.stringify([from, to, kind]), { from, to, kind });
  };
  add({ id: folderId(""), label: graph.repository, detail: "/", kind: "folder", url: web && web + "/tree/" + graph.revision });
  function folder(path: string): string {
    if (!path) return folderId("");
    const id = folderId(path);
    if (!nodes.has(id)) {
      const container = folder(parent(path));
      add({ id, label: name(path), detail: path + "/", kind: "folder", url: web && web + "/tree/" + graph.revision + "/" + urlPath(path) });
      link(container, id, "CONTAINS");
    }
    return id;
  }
  function file(path: string) {
    if (available.has(path)) return;
    available.add(path);
    graph.coverage.files++;
    const id = fileId(path);
    add({ id, label: name(path), detail: path, kind: "file", url: web && web + "/blob/" + graph.revision + "/" + urlPath(path) });
    link(folder(parent(path)), id, "CONTAINS");
  }
  function imports(path: string, specifiers: string[]) {
    if (!available.has(path)) return;
    graph.coverage.importFiles++;
    for (const specifier of specifiers) {
      const target = localImport(path, specifier, available);
      if (target) { link(fileId(path), fileId(target), "IMPORTS"); continue; }
      if (!/^(?:node:|@[-\w]+\/)?[-\w][\w.-]*(?:\/|$)/.test(specifier)) continue;
      const name = specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");
      const id = "package:" + name;
      add({ id, label: name, detail: "External import", kind: "package" });
      link(fileId(path), id, "IMPORTS");
    }
  }
  return { add, link, folder, file, imports, finish: () => ({ ...graph, nodes: [...nodes.values()], edges: [...edges.values()] }) };
}
