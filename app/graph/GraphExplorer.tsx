"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { GraphEdge, GraphNode, RepositoryGraph } from "../../lib/graph-types";
import type { AIReview, ReviewFinding } from "../../lib/pr-review";
import { importSpecifiers, sourceFileLimit, sourceFilePattern, treeEntryLimit } from "../../lib/graph-model";
import { SpatialGraph } from "./SpatialGraph";
import { RepositoryGraph3D } from "./RepositoryGraph3D";

type View = "files" | "imports" | "history" | "conflicts" | "risk" | "review";
const views: { id: View; label: string; empty: string }[] = [
  { id: "files", label: "File structure", empty: "No files or folders available." },
  { id: "imports", label: "Module imports", empty: "No static JavaScript or TypeScript imports were found in the scanned files." },
  { id: "history", label: "Decision history", empty: "No pull requests or commits were found in the indexed history." },
  { id: "conflicts", label: "Decision conflicts", empty: "No linked decision updates were found in the indexed pull request history." },
  { id: "risk", label: "Knowledge risk map", empty: "No source modules were available to map." },
  { id: "review", label: "PR reviewer", empty: "Review a pull request against recorded decisions." },
];
const labels: Record<GraphEdge["kind"], string> = {
  CONTAINS: "Contains", IMPORTS: "Imports", PARENT: "Parent commit", INCLUDES: "Includes commit",
  COVERS: "Covers", REFERENCES: "References", SUPERSEDES: "Supersedes",
};
const perLane = 7;
const ignoredFolders = new Set([".git", "node_modules", ".next", "dist", "build", "coverage"]);

function belongs(edge: GraphEdge, view: View) {
  if (view === "files") return edge.kind === "CONTAINS";
  if (view === "imports") return edge.kind === "IMPORTS";
  if (view === "conflicts") return edge.kind === "SUPERSEDES";
  if (view === "risk") return edge.kind === "COVERS";
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
  const [dimension, setDimension] = useState<"2D" | "3D" | "Full map">("2D");
  const [page, setPage] = useState(0);
  const [nodeLimit, setNodeLimit] = useState(36);
  const [overridesOnly, setOverridesOnly] = useState(false);
  const [reviewUrl, setReviewUrl] = useState("");
  const [useAiReview, setUseAiReview] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewResult, setReviewResult] = useState<{ pull: { number: number; title: string; author: string; createdAt: string; mergedAt: string | null; date: string; url: string; state: string }; findings: ReviewFinding[]; coverage: { changedFiles: number; historicalReversals: number; historyWindow: string }; aiReview: AIReview }>();

  const { nodes, edges, byId } = useMemo(() => {
    if (view === "risk") {
      const areas = graph?.riskAreas ?? [];
      const folders = new Map(graph?.nodes.filter(node => node.kind === "folder").map(node => [node.detail.replace(/\/$/, ""), node]) ?? []);
      const riskNodes: GraphNode[] = areas.map(area => ({ id: "risk:" + area.id, label: area.name,
        detail: area.path + " · " + area.signals.length + " risk signals", kind: "risk", risk: area }));
      const riskEdges: GraphEdge[] = areas.flatMap(area => folders.has(area.path)
        ? [{ from: "risk:" + area.id, to: folders.get(area.path)!.id, kind: "COVERS" as const }] : []);
      const linkedFolders = new Set(riskEdges.map(edge => edge.to));
      const visibleNodes = [...riskNodes, ...(graph?.nodes.filter(node => linkedFolders.has(node.id)) ?? [])];
      return { nodes: visibleNodes, edges: riskEdges, byId: new Map(visibleNodes.map(node => [node.id, node])) };
    }
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
  const riskAreas = graph?.riskAreas ?? [];

  const headings = view === "files" ? ["Parent folder", "Contents"] : view === "imports" ? ["Imported by", "Imports"] : view === "conflicts" ? ["Newer decision", "Earlier decision"] : ["Incoming links", "Outgoing links"];

  function inspect(id: string) {
    setFocus(id); setPage(0);
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

  async function reviewPull(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewing) return;
    setReviewing(true); setReviewError(""); setReviewResult(undefined);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(privateRepo && { Authorization: "Bearer " + token }) },
        body: JSON.stringify({ pullUrl: reviewUrl, mode: privateRepo ? "private" : "public", aiReview: useAiReview }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The pull request could not be reviewed.");
      setReviewResult(result);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "The pull request could not be reviewed.");
    } finally { setReviewing(false); }
  }

  async function copyReviewComment(comment: string) {
    try {
      await navigator.clipboard.writeText(comment);
      setReviewError("Draft comment copied. Paste it into your GitHub review when ready.");
    } catch { setReviewError("Clipboard access is unavailable; select the draft text to copy it."); }
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
        onChange={event => { setPrivateRepo(event.target.checked); setUseAiReview(false); setReviewResult(undefined); setToken(""); setGraph(undefined); setStatus(""); }} />Private repository</label>
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
    {busy && <p role="status" className="graph-notice graph-progress">{source === "github" ? "Reading GitHub structure and a sample of history, then mapping documentation and ownership signals." : "Reading the folder and mapping documentation signals."}</p>}
    {graph && <section className="graph-workbench" aria-label="Indexed repository">
      <header className="graph-bar">
        <div><strong>{graph.repository}</strong> <code>{graph.revision.slice(0, 8)}</code></div>
        {graph.source !== "folder" && <a href={"/workspace?" + new URLSearchParams({ repo: graph.repository, path: privateRepo ? "private" : "public" })}>Open in chat</a>}
        <nav className="workspace-modes" aria-label="Graph view">
          {views.map(item => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => changeView(item.id)}>{item.label}{item.id === "conflicts" && conflictEdges.length > 0 ? ` · ${conflictEdges.length}` : item.id === "risk" && riskAreas.length > 0 ? ` · ${riskAreas.length}` : ""}</button>)}
        </nav>
      </header>
      <div className="graph-layout">
        <aside className="graph-index" aria-label="Graph nodes">
          <label>Find a node<input type="search" value={search} onChange={event => { setSearch(event.target.value); setNodeLimit(36); }}
            placeholder="Path, module, commit or PR" /></label>
          {view === "history" && <label className="sf-check"><input type="checkbox" checked={overridesOnly}
            onChange={event => { setOverridesOnly(event.target.checked); inspect(""); }} />Superseded decisions only</label>}
          {view === "conflicts" && <p className="conflict-hint">Later merged PRs that explicitly replace an earlier PR or describe a changed default, behavior, approach, or architecture while referencing it.</p>}
          {view === "risk" && <p className="conflict-hint">Color and size reflect the number and severity of evidence based risk signals.</p>}
          {view === "review" && <p className="conflict-hint">Compare a pull request with earlier decisions and known reversals. Suggested comments are drafts; nothing is posted to GitHub.</p>}
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
          {view === "review" && <section className="review-overview" aria-label="AI pull request reviewer with historical memory">
            <div className="review-heading"><span className="review-spark" aria-hidden="true">✳</span><div><small>HISTORICAL MEMORY REVIEW</small><h3>Catch a decision conflict before merge</h3>
              <p>Paste a pull request link to compare its changed files with earlier decisions, reversals, and review criteria.</p></div></div>
            <form className="review-form" onSubmit={event => void reviewPull(event)}>
              <label>GitHub pull request link<input type="url" value={reviewUrl} onChange={event => { setReviewUrl(event.target.value); setUseAiReview(false); setReviewResult(undefined); }} placeholder="https://github.com/owner/repository/pull/123" required /></label>
              <button type="submit" className="sf-submit" disabled={reviewing || !reviewUrl}>{reviewing ? "Comparing changes with repository history…" : "Review pull request"}</button>
            </form>
            <label className="review-ai-choice"><input type="checkbox" checked={useAiReview} onChange={event => setUseAiReview(event.target.checked)} />Use AI to assess decision fit, regression risk, and test rationale</label>
            <p className="review-scope">AI analysis is optional and uses the configured Gemini service. When enabled, the PR diff and matching history excerpts are sent to that service. Deterministic file and reversal checks run either way. Comments are drafts; nothing is posted to GitHub.</p>
            {reviewError && <p role="status" className="review-status">{reviewError}</p>}
            {reviewResult && <>
              <div className="review-result-heading"><div><small>REVIEWED PR #{reviewResult.pull.number}</small><h4><a href={reviewResult.pull.url} target="_blank" rel="noreferrer">{reviewResult.pull.title} ↗</a></h4>
                <p>@{reviewResult.pull.author} · Created {dateLabel(reviewResult.pull.createdAt)}{reviewResult.pull.mergedAt ? ` · Merged ${dateLabel(reviewResult.pull.mergedAt)}` : ""} · {reviewResult.pull.state}</p></div>
                <span>{reviewResult.findings.length + reviewResult.aiReview.findings.length} findings</span></div>
              <p className="review-coverage">Compared {reviewResult.coverage.changedFiles} changed files against {reviewResult.coverage.historicalReversals} explicitly linked reversals and {reviewResult.coverage.historyWindow.toLowerCase()}.</p>
              {reviewResult.aiReview.status === "ready" && <section className="review-ai-results" aria-label="AI review criteria">
                <div className={`review-verdict verdict-${reviewResult.aiReview.recommendation}`}>
                  {reviewResult.aiReview.recommendation === "resolve-before-merge" ? "Direct decision conflict · resolve before merge" : reviewResult.aiReview.recommendation === "review" ? "Historical signal · reviewer follow-up recommended" : "No direct conflict found in the matched history"}
                </div>
                <div><small>AI REVIEW</small><p>{reviewResult.aiReview.summary}</p></div>
                <div className="review-criteria">{reviewResult.aiReview.criteria.map(item => <article key={item.name}>
                  <span className={`review-criterion-status criterion-${item.status}`}>{item.status === "conflict" ? "Conflict" : item.status === "check" ? "Check" : item.status === "clear" ? "Clear" : "Unknown"}</span>
                  <strong>{item.name}</strong><p>{item.detail}</p>
                  {item.sources.map(id => <span className="review-source-ref" key={id}>{id}</span>)}
                </article>)}</div>
                {reviewResult.aiReview.findings.map((finding, index) => {
                  const cited = reviewResult.aiReview.evidence.filter(source => finding.sources.includes(source.id));
                  return <article className="review-ai-finding" key={`${finding.path}:${index}`}>
                    <div className="review-finding-top"><span>{finding.severity === "conflict" ? "DECISION CONFLICT" : finding.severity === "possible-conflict" ? "POSSIBLE CONFLICT" : "REVIEW NOTE"}</span><code>{finding.path}</code></div>
                    <p>{finding.explanation}</p><blockquote>{finding.evidence}</blockquote>
                    <div className="review-comment"><small>SUGGESTED REVIEW COMMENT</small><p>{finding.comment}</p><button type="button" onClick={() => void copyReviewComment(finding.comment)}>Copy comment draft</button></div>
                    <p className="review-source-links">Evidence: {cited.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.id} · @{source.author} · Created {dateLabel(source.createdAt)}{source.mergedAt ? ` · Merged ${dateLabel(source.mergedAt)}` : ""} ↗</a>)}</p>
                  </article>;
                })}
              </section>}
              {reviewResult.aiReview.status === "not-configured" && <p className="review-coverage">AI review was selected, but no Gemini service is configured. Historical file checks are still shown below.</p>}
              {reviewResult.aiReview.status === "unavailable" && <p className="review-coverage">AI review could not complete. Historical file checks are still shown below.</p>}
              {reviewResult.aiReview.status !== "ready" && reviewResult.findings.some(finding => finding.confidence === "changed-lines") && <div className="review-verdict verdict-review">Possible reintroduction found in changed lines · resolve the history check before merge.</div>}
              {reviewResult.findings.length ? <div className="review-findings">{reviewResult.findings.map((finding, index) => <article className={`review-finding ${finding.confidence === "changed-lines" ? "review-strong" : "review-context"}`} key={`${finding.path}:${finding.older.number}:${finding.reversal.number}:${index}`}>
                <div className="review-finding-top"><span>{finding.confidence === "changed-lines" ? "POSSIBLE REINTRODUCTION" : "HISTORICAL CONTEXT"}</span><code>{finding.path}</code></div>
                <p>{finding.rationale}</p>
                <div className="review-history-pair"><div><small>EARLIER DECISION · @{finding.older.author} · Created {dateLabel(finding.older.createdAt)}{finding.older.mergedAt ? ` · Merged ${dateLabel(finding.older.mergedAt)}` : ""}</small><a href={finding.older.url} target="_blank" rel="noreferrer">PR #{finding.older.number}: {finding.older.title}</a><blockquote>{finding.older.evidence}</blockquote></div>
                  <div><small>LATER REVERSAL · @{finding.reversal.author} · Created {dateLabel(finding.reversal.createdAt)}{finding.reversal.mergedAt ? ` · Merged ${dateLabel(finding.reversal.mergedAt)}` : ""}</small><a href={finding.reversal.url} target="_blank" rel="noreferrer">PR #{finding.reversal.number}: {finding.reversal.title}</a><blockquote>{finding.reversal.evidence}</blockquote></div></div>
                <details><summary>Proposed change evidence</summary><pre>{finding.proposedEvidence}</pre></details>
                <div className="review-comment"><small>SUGGESTED REVIEW COMMENT</small><p>{finding.comment}</p><button type="button" onClick={() => void copyReviewComment(finding.comment)}>Copy comment draft</button></div>
                <a className="review-diff-link" href={reviewResult.pull.url + "/files"} target="_blank" rel="noreferrer">Open changed files on GitHub ↗</a>
              </article>)}</div> : reviewResult.aiReview.findings.length === 0 && <p className="review-empty">No file-level historical reversal matched this proposal. Check the AI criteria above, if enabled; this bounded review is not an approval guarantee.</p>}
            </>}
          </section>}
          {view === "risk" && <section className="risk-overview" aria-label="Institutional knowledge risk summary">
            <div className="risk-overview-heading"><span className="risk-radar" aria-hidden="true">◎</span><div><small>INSTITUTIONAL KNOWLEDGE SCAN</small>
              <h3>{riskAreas.length ? `${riskAreas.length} areas to review` : "No risk signals found"}</h3>
              <p>{riskAreas.filter(area => area.signals.length > 1).length} areas have multiple risk signals in the indexed evidence.</p></div></div>
            {graph?.source === "folder" && <p className="risk-coverage-note">This folder scan can assess documentation structure. Contributor and decision history need a GitHub index.</p>}
            {graph?.source !== "folder" && <p className="risk-coverage-note">Contributor and decision signals use up to 12 recent pull requests. Older activity may not appear in this sample.</p>}
            <div className="risk-cards">
              {riskAreas.slice(0, 6).map(area => <article className="risk-card" key={area.id}>
                <div className="risk-card-top"><strong>{area.path}</strong><span className={area.riskScore >= 0.7 ? "risk-high" : area.riskScore >= 0.35 ? "risk-medium" : "risk-watch"}>{area.riskScore >= 0.7 ? "Elevated" : area.riskScore >= 0.35 ? "Review" : "Watch"}</span></div>
                <p>{area.sourceFiles} source files · {area.documentationFiles} docs · {area.sampledPullRequests} sampled PRs</p>
                {area.topContributor ? <><p>{area.contributors} observed contributors · {area.decisionConnections} PRs with linked decisions</p>
                  <p>Top contributor <b>@{area.topContributor}</b> · {Math.round(area.topContributorShare * 100)}% of sampled PRs</p></>
                  : <p>Contributor history unavailable · {area.decisionConnections} linked decisions</p>}
                <ul>{area.signals.map(signal => <li key={signal}>{signal}</li>)}</ul>
                <button type="button" onClick={() => inspect("risk:" + area.id)}>Locate in graph <span aria-hidden="true">↗</span></button>
              </article>)}
            </div>
            {riskAreas.length === 0 && <p className="graph-notice">The scan found no modules matching the current risk signals.</p>}
          </section>}
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
            <div className="workspace-modes" role="group" aria-label="Graph layout">
              {(["2D", "3D", "Full map"] as const).map(layout => <button key={layout} type="button" aria-pressed={dimension === layout}
                onClick={() => setDimension(layout)}>{layout}</button>)}
            </div>
            {dimension === "2D" && <div className="graph-zoom" aria-label="Diagram zoom">
              <button type="button" aria-label="Zoom out" disabled={zoom <= 65} onClick={() => setZoom(value => Math.max(65, value - 15))}>−</button>
              <button type="button" aria-label="Reset zoom" onClick={() => setZoom(100)}>{zoom}%</button>
              <button type="button" aria-label="Zoom in" disabled={zoom >= 160} onClick={() => setZoom(value => Math.min(160, value + 15))}>+</button>
            </div>}
          </div>
          {selected ? <>
            {dimension === "Full map" ? <RepositoryGraph3D nodes={nodes} edges={edges} selectedId={selected.id} onSelect={inspect} /> : dimension === "3D" ? <SpatialGraph selected={selected} incoming={left} outgoing={right} byId={byId} inspect={inspect} /> : <>
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
            </>}
            <div className="graph-inspector">
              <div><strong>{selected.detail}</strong><small>{incoming.length} incoming · {outgoing.length} outgoing</small></div>
              {selected.url && <a href={selected.url} target="_blank" rel="noreferrer">View on GitHub <span className="arrow" aria-hidden="true" /></a>}
              {dimension !== "Full map" && Math.max(incoming.length, outgoing.length) > perLane && <div className="graph-zoom">
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
