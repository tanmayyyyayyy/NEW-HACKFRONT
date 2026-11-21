"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { GraphEdge, GraphNode, RepositoryGraph } from "../../lib/graph-types";
import { importSpecifiers, sourceFileLimit, sourceFilePattern, treeEntryLimit } from "../../lib/graph-model";

type View = "files" | "imports" | "history" | "conflicts";
const views: { id: View; label: string; empty: string }[] = [
  { id: "files", label: "File structure", empty: "No files or folders available." },
  { id: "imports", label: "Module imports", empty: "No static JavaScript or TypeScript imports were found in the scanned files." },
  { id: "history", label: "Decision history", empty: "No pull requests or commits were found in the indexed history." },
  { id: "conflicts", label: "Decision conflicts", empty: "No linked decision updates were found in the indexed pull request history." },
];
const labels: Record<GraphEdge["kind"], string> = {
  CONTAINS: "Contains", IMPORTS: "Imports", PARENT: "Parent commit", INCLUDES: "Includes commit",
  REFERENCES: "References", SUPERSEDES: "Supersedes",
};
const perLane = 7;
const ignoredFolders = new Set([".git", "node_modules", ".next", "dist", "build", "coverage"]);

function belongs(edge: GraphEdge, view: View) {
  if (view === "files") return edge.kind === "CONTAINS";
  if (view === "imports") return edge.kind === "IMPORTS";
  if (view === "conflicts") return edge.kind === "SUPERSEDES";
  return edge.kind !== "CONTAINS" && edge.kind !== "IMPORTS";
}

function dateLabel(value?: string) {
  if (!value) return "Date not available";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Date not available" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function GraphExplorer({ initialRepo, initialPrivate }: { initialRepo: string; initialPrivate: boolean }) {
  const [repo, setRepo] = useState(initialRepo);
  const [privateRepo, setPrivateRepo] = useState(initialPrivate);
  const [source, setSource] = useState<"github" | "folder">("github");
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [savedFolders, setSavedFolders] = useState<string[]>();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [graph, setGraph] = useState<RepositoryGraph>();
  const [view, setView] = useState<View>("files");
  const [focus, setFocus] = useState("");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(0);
  const [nodeLimit, setNodeLimit] = useState(36);
  const [overridesOnly, setOverridesOnly] = useState(false);

  const { nodes, edges, byId } = useMemo(() => {
    const edges = graph?.edges.filter(edge => belongs(edge, view) && (!overridesOnly || view !== "history" || edge.kind === "SUPERSEDES")) ?? [];
    const ids = new Set(edges.flatMap(({ from, to }) => [from, to]));
    const nodes = graph?.nodes.filter(node => {
      if (view === "files") return node.kind === "file" || node.kind === "folder";
      if (view === "imports") return ids.has(node.id);
      return overridesOnly || view === "conflicts" ? ids.has(node.id) : node.kind === "pull" || node.kind === "commit";
    }) ?? [];
    return { nodes, edges, byId: new Map(nodes.map(node => [node.id, node])) };
  }, [graph, view, overridesOnly]);
  const lookup = search.trim().toLowerCase();
  const matches = lookup ? nodes.filter(node => (node.label + " " + node.detail).toLowerCase().includes(lookup)) : nodes;
  const imported = useMemo(() => {
    const counts = new Map<string, number>();
    if (view !== "imports") return [];
    for (const edge of edges) counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
    return Array.from(counts, ([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)).slice(0, 3);
  }, [view, edges]);
  const conflictEdges = graph?.edges.filter(edge => edge.kind === "SUPERSEDES") ?? [];
  const selected = byId.get(focus) ?? (view === "files" ? nodes[0] : byId.get(edges[0]?.from) ?? nodes[0]);
  const incoming = selected ? edges.filter(edge => edge.to === selected.id) : [];
  const outgoing = selected ? edges.filter(edge => edge.from === selected.id) : [];
  const left = incoming.slice(page * perLane, (page + 1) * perLane);
  const right = outgoing.slice(page * perLane, (page + 1) * perLane);
  const rows = Math.max(left.length, right.length, 1);
  const height = Math.max(296, rows * 72 + 100);
  const middle = height / 2;
  const rowY = (index: number, count: number) => middle + (index - (count - 1) / 2) * 72;
  const selectedView = views.find(item => item.id === view)!;
  const headings = view === "files" ? ["Parent folder", "Contents"] : view === "imports" ? ["Imported by", "Imports"] : view === "conflicts" ? ["Newer decision", "Earlier decision"] : ["Incoming links", "Outgoing links"];

  function inspect(id: string) {
    setFocus(id);
    setPage(0);
  }

  function changeView(id: View) {
    setView(id);
    inspect("");
    setSearch("");
    setNodeLimit(36);
  }

  async function index(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !repo.trim()) return;
    const refresh = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "refresh";
    setStatus("");
    setBusy(true);
    setGraph(undefined);
    try {
      const params = new URLSearchParams({ repo: repo.trim(), mode: privateRepo ? "private" : "public", refresh: refresh ? "1" : "0" });
      const response = await fetch("/api/graph?" + params, {
        method: "POST", headers: privateRepo ? { Authorization: "Bearer " + token } : {},
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The repository could not be indexed.");
      setGraph(result);
      changeView("files");
      setZoom(100);
      setOverridesOnly(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The repository could not be indexed.");
    } finally { setBusy(false); }
  }

  async function indexFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderFiles.length || busy) return;
    setBusy(true);
    setStatus("");
    setGraph(undefined);
    try {
      const files = folderFiles.map(file => ({ file, path: file.webkitRelativePath.split("/").slice(1).join("/") }))
        .filter(({ path }) => path && !path.split("/").some(part => ignoredFolders.has(part) || /^\.env(?:\.|$)/.test(part)))
        .sort((a, b) => a.path.localeCompare(b.path));
      const included = files.slice(0, treeEntryLimit);
      const modules = included.filter(({ file, path }) => sourceFilePattern.test(path) && file.size <= 64 * 1024).slice(0, sourceFileLimit);
      const imports = await Promise.all(modules.map(async ({ file, path }) => ({
        path, specs: importSpecifiers(await file.text()).filter(specifier => specifier.length <= 200),
      })));
      const payload = JSON.stringify({
        name: folderFiles[0].webkitRelativePath.split("/")[0],
        paths: included.map(({ path }) => path),
        imports,
        partial: files.length > included.length,
      });
      const response = await fetch("/api/graph/folder", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The folder could not be indexed.");
      setGraph(result);
      changeView("files");
      setZoom(100);
      setOverridesOnly(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The folder could not be indexed.");
    } finally { setBusy(false); }
  }

  function changeSource(next: "github" | "folder") {
    setSource(next);
    setGraph(undefined);
    setStatus("");
    if (next === "folder") setToken("");
  }

  async function openSavedFolder(name?: string) {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/graph/folder" + (name ? "?" + new URLSearchParams({ name }) : ""));
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (name) {
        setGraph(result);
        changeView("files");
        setZoom(100);
        setOverridesOnly(false);
      } else {
        setSavedFolders(result.folders);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Saved folders are unavailable.");
    } finally { setBusy(false); }
  }

  function nodeButton(node: GraphNode, x?: number, y?: number, edge?: GraphEdge) {
    return <button type="button" key={edge ? edge.kind + node.id : node.id} className={"graph-node graph-" + node.kind}
      style={x === undefined ? undefined : { left: x + "%", top: y }} aria-pressed={node.id === selected?.id} onClick={() => inspect(node.id)}>
      <small>{edge ? labels[edge.kind] : node.kind}</small>
      <strong title={node.detail}>{node.label}</strong>
      {node.kind === "pull" || node.kind === "commit" ? <span title={node.detail}>{node.detail}</span> : null}
    </button>;
  }

  return <>
    <div className="workspace-modes graph-source" aria-label="Repository source">
      <button type="button" aria-pressed={source === "github"} onClick={() => changeSource("github")} disabled={busy}>GitHub repository</button>
      <button type="button" aria-pressed={source === "folder"} onClick={() => changeSource("folder")} disabled={busy}>Local folder</button>
    </div>
    {source === "github" ? <form className="graph-import" onSubmit={index}>
      <div className="graph-import-row">
        <label>GitHub repository<input value={repo} required maxLength={170} disabled={busy} placeholder="owner/repository or GitHub URL"
          onChange={event => { setRepo(event.target.value); setGraph(undefined); setStatus(""); }} /></label>
        <button type="submit" className="sf-submit" disabled={busy}>{busy ? "Indexing repository…" : "Index repository"}</button>
        {graph && <button type="submit" value="refresh" disabled={busy}>Refresh index</button>}
      </div>
      <label className="sf-check"><input type="checkbox" checked={privateRepo} disabled={busy}
        onChange={event => { setPrivateRepo(event.target.checked); setToken(""); setGraph(undefined); setStatus(""); }} />Private repository</label>
      {privateRepo && <label>Repository-scoped GitHub token
        <input type="password" value={token} autoComplete="off" required disabled={busy}
          onChange={event => { setToken(event.target.value); setGraph(undefined); }} />
        <small><a href="/account?path=private">Sign in to your workspace</a> before indexing. Use a token with read access to metadata, contents, and pull requests.</small>
      </label>}
      {!privateRepo && !graph && !busy && <button type="button" className="graph-example" onClick={() => setRepo("ahmedkhaleel2004/gitdiagram")}>Use an example repository</button>}
    </form> : <form className="graph-import" onSubmit={indexFolder}>
      <div className="graph-import-row">
        <label>Repository folder<input type="file" multiple ref={input => { input?.setAttribute("webkitdirectory", ""); }}
          disabled={busy} onChange={event => { setFolderFiles(Array.from(event.target.files || [])); setGraph(undefined); }} /></label>
        <button type="submit" className="sf-submit" disabled={busy || !folderFiles.length}>{busy ? "Indexing folder…" : "Index folder"}</button>
      </div>
      <small><a href="/account">Sign in</a> to save a local index. SkillForge sends file paths and detected imports to its server. Git history is available through the GitHub importer.</small>
      <div className="graph-zoom">
        <button type="button" disabled={busy} onClick={() => void openSavedFolder()}>List saved folders</button>
        {savedFolders?.map(name => <button key={name} type="button" disabled={busy} onClick={() => void openSavedFolder(name)}>{name}</button>)}
        {savedFolders?.length === 0 && <small>No saved folders.</small>}
      </div>
    </form>}
    {status && <p role="alert" className="graph-notice sf-error">{status}</p>}
    {busy && <p role="status" className="graph-notice graph-progress">{source === "github" ? "Reading GitHub structure and history, then storing the index in Neo4j." : "Reading the folder and storing its graph in Neo4j."}</p>}
    {graph && <section className="graph-workbench" aria-label="Indexed repository">
      <header className="graph-bar">
        <div><strong>{graph.repository}</strong> <code>{graph.revision.slice(0, 8)}</code></div>
        <nav className="workspace-modes" aria-label="Graph view">
          {views.map(item => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => changeView(item.id)}>{item.label}{item.id === "conflicts" && conflictEdges.length > 0 ? ` · ${conflictEdges.length}` : ""}</button>)}
        </nav>
      </header>
      <div className="graph-layout">
        <aside className="graph-index" aria-label="Graph nodes">
          <label>Find a node<input type="search" value={search} onChange={event => { setSearch(event.target.value); setNodeLimit(36); }}
            placeholder="Path, module, commit or PR" /></label>
          {view === "history" && <label className="sf-check"><input type="checkbox" checked={overridesOnly}
            onChange={event => { setOverridesOnly(event.target.checked); inspect(""); }} />Superseded decisions only</label>}
          {view === "conflicts" && <p className="conflict-hint">Later merged PRs that explicitly replace an earlier PR or describe a changed default, behavior, approach, or architecture while referencing it.</p>}
          {!lookup && imported.length > 0 && <div className="graph-highlights">
            <small>Most imported in this scan</small>
            {imported.map(item => <button key={item.id} type="button" onClick={() => inspect(item.id)}>
              <span>{byId.get(item.id)?.label}</span><small>{item.count}</small>
            </button>)}
          </div>}
          <small>{matches.length.toLocaleString()} {matches.length === 1 ? "node" : "nodes"}</small>
          <ul>
            {matches.slice(0, nodeLimit).map(node => <li key={node.id}><button type="button" aria-pressed={selected?.id === node.id}
              onClick={() => inspect(node.id)}><strong>{node.label}</strong><small>{node.detail}</small></button></li>)}
          </ul>
          {matches.length > nodeLimit && <button type="button" onClick={() => setNodeLimit(limit => limit + 36)}>Show more nodes</button>}
        </aside>
        <div className="graph-stage">
          {view === "conflicts" && conflictEdges.length > 0 && <section className="conflict-list" aria-label="Detected decision conflicts">
            <div className="conflict-list-heading"><span className="conflict-spark" aria-hidden="true">✳</span><div><h3>Decisions that changed</h3><p>Each pair is linked by an explicit reference in the newer pull request.</p></div></div>
            {conflictEdges.map(edge => {
              const newer = graph?.nodes.find(node => node.id === edge.from);
              const older = graph?.nodes.find(node => node.id === edge.to);
              if (!newer || !older) return null;
              return <article className="conflict-pair" key={edge.from + edge.to}>
                <div className="conflict-pair-top"><span>DECISION UPDATE</span><span>NEWER <b aria-hidden="true">→</b> EARLIER</span></div>
                <div className="conflict-decisions">
                  {[{ node: newer, label: "Newer decision", direction: "new" }, { node: older, label: "Earlier decision", direction: "old" }].map(({ node, label, direction }) => <div className={`conflict-decision conflict-${direction}`} key={node.id}>
                    <small>{label}</small><h4>{node.label}: {node.detail}</h4>
                    <p><span>{node.author ? `@${node.author}` : "Author unavailable"}</span><span>{dateLabel(node.mergedAt || node.createdAt)}</span></p>
                    {node.evidence && <blockquote>{node.evidence}</blockquote>}
                    {node.url && <a href={node.url} target="_blank" rel="noreferrer">Open original pull request <span aria-hidden="true">↗</span></a>}
                  </div>)}
                </div>
                <button className="conflict-explore" type="button" onClick={() => inspect(newer.id)}>Explore this relationship <span aria-hidden="true">→</span></button>
              </article>;
            })}
          </section>}
          <div className="graph-tools">
            <h2>{selectedView.label}</h2>
            <div className="graph-zoom" aria-label="Diagram zoom">
              <button type="button" aria-label="Zoom out" disabled={zoom <= 65} onClick={() => setZoom(value => Math.max(65, value - 15))}>−</button>
              <button type="button" aria-label="Reset zoom" onClick={() => setZoom(100)}>{zoom}%</button>
              <button type="button" aria-label="Zoom in" disabled={zoom >= 160} onClick={() => setZoom(value => Math.min(160, value + 15))}>+</button>
            </div>
          </div>
          {selected ? <>
            <div className="graph-viewport" tabIndex={0} aria-label="Scrollable repository diagram">
              <div className="graph-canvas" style={{ height, minWidth: 620, width: Math.max(100, zoom) + "%", zoom: zoom < 100 ? zoom / 100 : undefined }}>
                <div className="graph-lanes"><span>{headings[0]}</span><span>Selected node</span><span>{headings[1]}</span></div>
                <svg className="graph-wires" viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" aria-hidden="true">
                  <defs><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="m2 1 4 3-4 3" />
                  </marker></defs>
                  {left.map((edge, i) => <path key={edge.kind + edge.from} className={edge.kind === "SUPERSEDES" ? "wire-override" : ""}
                    markerEnd="url(#graph-arrow)" d={`M 180 ${rowY(i, left.length)} C 290 ${rowY(i, left.length)} 305 ${middle} 365 ${middle}`} />)}
                  {right.map((edge, i) => <path key={edge.kind + edge.to} className={edge.kind === "SUPERSEDES" ? "wire-override" : ""}
                    markerEnd="url(#graph-arrow)" d={`M 500 ${middle} C 610 ${middle} 618 ${rowY(i, right.length)} 684 ${rowY(i, right.length)}`} />)}
                </svg>
                {left.map((edge, i) => nodeButton(byId.get(edge.from)!, 18, rowY(i, left.length), edge))}
                {nodeButton(selected, 50, middle)}
                {right.map((edge, i) => nodeButton(byId.get(edge.to)!, 82, rowY(i, right.length), edge))}
              </div>
            </div>
            <div className="graph-compact" aria-label="Repository diagram">
              {left.length > 0 && <div className="graph-compact-lane"><small>{headings[0]}</small>
                {left.map(edge => nodeButton(byId.get(edge.from)!, undefined, undefined, edge))}</div>}
              <div className="graph-compact-lane"><small>Selected node</small>{nodeButton(selected)}</div>
              {right.length > 0 && <div className="graph-compact-lane"><small>{headings[1]}</small>
                {right.map(edge => nodeButton(byId.get(edge.to)!, undefined, undefined, edge))}</div>}
            </div>
            <div className="graph-inspector">
              <div><strong>{selected.detail}</strong><small>{incoming.length} incoming · {outgoing.length} outgoing</small></div>
              {selected.url && <a href={selected.url} target="_blank" rel="noreferrer">View on GitHub <span className="arrow" aria-hidden="true" /></a>}
              {Math.max(incoming.length, outgoing.length) > perLane && <div className="graph-zoom">
                <button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous links</button>
                <button type="button" disabled={(page + 1) * perLane >= Math.max(incoming.length, outgoing.length)} onClick={() => setPage(value => value + 1)}>More links</button>
              </div>}
            </div>
          </> : <p className="graph-notice">{graph.source === "folder" && view === "history" ? "Connect the GitHub repository to see pull requests and commit history." : overridesOnly && view === "history" ? "No explicit supersession was found in the indexed pull requests." : selectedView.empty}</p>}
        </div>
      </div>
      <p className="graph-coverage">
        {graph.coverage.files.toLocaleString()} indexed files · {graph.coverage.importFiles} JavaScript/TypeScript files scanned for static imports.
        {graph.coverage.treePartial && " The file tree is partial."} {graph.source !== "folder" && "The history view uses a recent sample of pull requests and commits."}
      </p>
    </section>}
  </>;
}
