"use client";

import { createAuthClient } from "better-auth/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { EvidenceTrail, downloadTrail, formatMarkdownTrail, type TrailRow } from "./EvidenceTrail";
import { BrandMark } from "./Mast";
import { VoiceControls } from "./VoiceControls";
import { takePrivateAccess } from "./private-transfer";
import { CodeEvidence } from "./CodeEvidence";
import { chatSource, pullTarget, sourceFromMessage, type CodeSnippet } from "@/lib/code-types";
import type { RepositoryGraph } from "@/lib/graph-types";
import styles from "./workspace/chat.module.css";
import { OpenPulls } from "./workspace/OpenPulls";

const WorkspaceGraph = dynamic(() => import("./graph/GraphExplorer").then(module => module.GraphExplorer), {
  loading: () => <p role="status">Opening the knowledge graph…</p>,
});

type Mode = "private" | "public";
type Starter = { repo: string; question: string };
type IndexedFile = { path: string; url?: string };
type Result = {
  evidence: TrailRow[];
  throughDate: string | null;
  recordCount: number;
  matchBasis: string;
  query: string | null;
  snippets?: CodeSnippet[];
  reviewNote?: string;
  review?: {
    title: string; number: number; state: string; files: number; matched: number; url: string; possibleConflict: boolean;
    recommendation?: string;
    findings?: { path: string; explanation: string; sources: { id: string; title: string; url: string }[] }[];
  };
  overview?: { repo: string; files: number; pulls: number; commits: number; partial: boolean };
  openPulls?: { repo: string; hasNext: boolean; pulls: { number: number; title: string; draft: boolean; author: string }[] };
  summary: string | null;
  error?: string;
  explanationProvider: "Sarvam" | "OpenRouter" | "Gemini" | null;
  explanationStatus: "ready" | "no-evidence" | "not-configured" | "unavailable" | null;
};
type Turn = { id: number; source: string; prompt: string; attachments: IndexedFile[]; language: string };
const demoPull = "https://github.com/AppFuton/Futon/pull/146";
const examples = [
  ["Trace a migration fix", "Why preserve reading statistics during source migration? Trace issue #127 and PR #138."],
  ["Compare two decisions", "Why did PR #146 replace the chapter update behavior from PR #112?"],
  ["Try an unanswered question", "Why does Futon use Kubernetes for billing?"],
];

const client = createAuthClient();
export function RepositoryChat({ initialMode, starter }: { initialMode: Mode; starter?: Starter }) {
  return initialMode === "private" ? <PrivateChat starter={starter} /> : <Desk mode="public" isPending={false} starter={starter} />;
}

function PrivateChat({ starter }: { starter?: Starter }) {
  const { data: session, isPending } = client.useSession();
  const userId = session?.user.id;
  return <Desk key={userId ?? "guest"} mode="private" userId={userId} isPending={isPending} starter={starter} />;
}

function Desk({ mode, userId, isPending, starter }: { mode: Mode; userId?: string; isPending: boolean; starter?: Starter }) {
  const [repo, setRepo] = useState(starter?.repo ?? "");
  const [repoDraft, setRepoDraft] = useState(starter?.repo ?? "");
  const [token, setToken] = useState("");
  const [language, setLanguage] = useState("Hinglish");
  const [explain, setExplain] = useState(false);
  const [question, setQuestion] = useState(starter?.question ?? "");
  const [turns, setTurns] = useState<(Turn & { answer: Result })[]>([]);
  const [pending, setPending] = useState<Turn>();
  const [error, setError] = useState("");
  const [throughDate, setThroughDate] = useState("");
  const [reuseSources, setReuseSources] = useState(true);
  const [attachments, setAttachments] = useState<IndexedFile[]>([]);
  const [indexed, setIndexed] = useState<{ files: IndexedFile[]; partial: boolean }>();
  const [graph, setGraph] = useState<RepositoryGraph>();
  const [panel, setPanel] = useState<"chat" | "pulls" | "graph">("chat");
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fileFilter, setFileFilter] = useState("");
  const [fileError, setFileError] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const fileRequest = useRef<AbortController>(null);
  const graphRequest = useRef<AbortController>(null);
  const thread = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const options = useRef<HTMLDetailsElement>(null);
  const sequence = useRef(0);
  const currentSource = chatSource(repo);
  const currentTurn = turns.findLast(turn => turn.source.toLowerCase() === currentSource?.toLowerCase());
  const contextIds = (currentTurn?.answer.evidence ?? []).map(({ record }) => record.id)
    .filter(id => /^(?:#[1-9]\d{0,9}|[a-f0-9]{40})$/.test(id)).slice(0, 5);
  const switchingRepository = repoDraft !== repo;
  const pull = pullTarget(repo);
  const graphRepo = pull?.repo ?? repo.trim();
  const draftTarget = sourceFromMessage(question);
  const nextSource = draftTarget?.source ?? currentSource;
  const nextPull = nextSource ? pullTarget(nextSource) : null;
  const linkAction = Boolean(draftTarget || (!question.trim() && nextSource && !currentTurn));
  const canSubmit = Boolean(!pending && !switchingRepository && nextSource && (mode !== "private" || token.trim()) &&
    (linkAction || question.trim().length >= 3));
  const action = linkAction
    ? nextPull ? "Review pull request" : "Analyze repository"
    : turns.length ? "Send follow-up" : "Ask about this repo";

  useEffect(() => {
    if (!userId || mode !== "private") return;
    const access = takePrivateAccess(userId);
    if (access) { setRepo(access.repository); setRepoDraft(access.repository); setToken(access.token); }
  }, [userId, mode]);
  useEffect(() => () => { fileRequest.current?.abort(); graphRequest.current?.abort(); }, []);
  useEffect(() => {
    const log = thread.current;
    const latest = log?.lastElementChild;
    if (!log || !latest || (!pending && !turns.length)) return;
    log.scrollTop += latest.getBoundingClientRect().top - log.getBoundingClientRect().top;
  }, [pending, turns]);

  function closePicker() {
    fileRequest.current?.abort();
    setPickerOpen(false);
    setLoadingFiles(false);
    setFileError("");
    setFileFilter("");
  }

  function changeRepository(value: string, clearIndex = false) {
    closePicker();
    const next = pullTarget(value)?.repo ?? chatSource(value) ?? value;
    const previous = pullTarget(repo)?.repo ?? chatSource(repo) ?? repo;
    if (clearIndex || next.toLowerCase() !== previous.toLowerCase()) {
      graphRequest.current?.abort();
      setGraph(undefined);
      setIndexed(undefined);
      setGraphLoading(false);
      setGraphError("");
      setTurns([]);
    }
    setRepo(value);
    setRepoDraft(value);
    setAttachments([]);
    setExplain(false);
    setError("");
  }

  async function loadGraph(source: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ repo: source, mode });
    const response = await fetch("/api/graph?" + params, {
      method: "POST", signal, headers: mode === "private" ? { Authorization: "Bearer " + token } : {},
    });
    return { response, result: await response.json() as RepositoryGraph & { error?: string } };
  }

  function rememberIndex(result: RepositoryGraph) {
    const files = result.nodes.filter(node => node.kind === "file" && !/[\\\u0000-\u001f]/.test(node.detail))
      .map(node => ({ path: node.detail, url: node.url })).sort((a, b) => a.path.localeCompare(b.path));
    setIndexed({ files, partial: result.coverage.treePartial });
    setGraph(result);
  }

  async function openGraph() {
    setPanel("graph");
    if (graph || graphLoading || !currentSource) return;
    setGraphError("");
    setGraphLoading(true);
    const controller = new AbortController();
    graphRequest.current = controller;
    try {
      const { response, result } = await loadGraph(graphRepo, controller.signal);
      if (!response.ok) throw new Error(result.error || "The graph is unavailable.");
      if (!controller.signal.aborted) rememberIndex(result);
    } catch (failure) {
      if (!controller.signal.aborted) setGraphError(failure instanceof Error ? failure.message : "The graph is unavailable.");
    } finally { if (!controller.signal.aborted) setGraphLoading(false); }
  }

  async function openFiles() {
    if (pickerOpen) { closePicker(); return; }
    if (!repo.trim() || (mode === "private" && !token.trim())) return;
    if (options.current) options.current.open = false;
    setPickerOpen(true);
    if (indexed) return;
    const controller = new AbortController();
    fileRequest.current = controller;
    setLoadingFiles(true);
    try {
      const { response, result } = await loadGraph(graphRepo, controller.signal);
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (mode === "private" && [401, 403].includes(response.status)) {
          changeRepository(repo, true);
          setToken("");
          setError(result.error || "Check your GitHub read token.");
          return;
        }
        throw new Error(result.error || "The repository index is unavailable.");
      }
      rememberIndex(result);
    } catch (failure) {
      if (!controller.signal.aborted) setFileError(failure instanceof Error ? failure.message : "Could not load indexed files.");
    } finally {
      if (!controller.signal.aborted) setLoadingFiles(false);
    }
  }

  function draft(prompt: string) {
    setQuestion(prompt);
    editor.current?.focus();
  }

  async function send(value = question) {
    if (pending || switchingRepository || (mode === "private" && !token.trim())) return;
    if (!value.trim() && currentTurn) return;
    const detected = sourceFromMessage(value);
    const source = detected?.source ?? currentSource;
    if (!source) { setError("Paste a GitHub repository or pull request link to get started."); return; }
    const isPull = Boolean(pullTarget(source));
    const requested = detected ? detected.question : value.trim();
    const overview = !isPull && requested.length === 0;
    const prompt = requested.length >= 3 ? requested : isPull
      ? "Review this pull request against earlier decisions." : "Analyze this repository.";
    const sameSource = source.toLowerCase() === currentSource?.toLowerCase();
    const turn = { id: ++sequence.current, source, prompt, attachments: sameSource ? attachments : [], language };
    if (!sameSource) changeRepository(source);
    setPanel("chat");
    setPending(turn);
    setError("");
    closePicker();
    if (options.current) options.current.open = false;
    try {
      let answer: Result;
      if (overview) {
        const { response, result } = await loadGraph(source);
        if (!response.ok) throw new Error(result.error || "The repository could not be indexed.");
        rememberIndex(result);
        answer = { evidence: [], throughDate: null, recordCount: 0, query: null, matchBasis: "",
          summary: null, explanationProvider: null, explanationStatus: null,
          overview: { repo: result.repository, files: result.coverage.files,
            pulls: result.nodes.filter(node => node.kind === "pull").length,
            commits: result.nodes.filter(node => node.kind === "commit").length,
            partial: result.coverage.treePartial || result.coverage.historyPartial } };
      } else {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(mode === "private" && { Authorization: "Bearer " + token }) },
          body: JSON.stringify({
            mode, repo: source, question: prompt, language, sarvam: sameSource && explain,
            files: turn.attachments.map(file => file.path), contextIds: sameSource && reuseSources ? contextIds : [],
            throughDate: !isPull && sameSource ? throughDate || undefined : undefined, includeCode: true,
          }),
        });
        answer = await response.json() as Result;
        if (!response.ok) {
          if (mode === "private" && [401, 403].includes(response.status)) {
            changeRepository(source, true);
            setToken("");
          }
          throw new Error(answer.error || "The question could not be answered.");
        }
      }
      setTurns(previous => [...previous.slice(-5), { ...turn, answer }]);
      setQuestion("");
      setAttachments([]);
      setReuseSources(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The question could not be answered.");
    } finally { setPending(undefined); }
  }

  if (mode === "private" && !userId) {
    return <div className={styles.empty}>{isPending ? <p role="status">Checking sign-in…</p> : <a href="/account?path=private">Sign in for private handover</a>}</div>;
  }

  const filter = fileFilter.trim().toLowerCase();
  const matchingFiles = indexed?.files.filter(file => file.path.toLowerCase().includes(filter)) ?? [];
  const canAttach = Boolean(!switchingRepository && repo.trim() && (mode !== "private" || token.trim()));
  const hasConversation = Boolean(turns.length || pending);
  return <section className={styles.desk} aria-label="Repository chat">
    <div className={styles.context}>
      <label>GitHub repository or pull request
        <input value={repoDraft} disabled={Boolean(pending)} placeholder="owner/repo or GitHub PR link" maxLength={400}
          onChange={event => {
            if (turns.length || attachments.length || pickerOpen) setRepoDraft(event.target.value);
            else changeRepository(event.target.value);
          }}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (switchingRepository) { if (repoDraft.trim()) changeRepository(repoDraft.trim()); }
              else if (canSubmit) void send();
            }
          }} />
      </label>
      {currentSource && !switchingRepository && <span className={styles.sourceType}>{pull ? `PR #${pull.number}` : "Repository"}</span>}
      {pull && !switchingRepository && <button className={styles.newChat} type="button" disabled={Boolean(pending)}
        onClick={() => { changeRepository(pull.repo); setQuestion(""); setPanel("chat"); }}>Back to repository</button>}
      {mode === "private" && <label>Repository-scoped read token
        <input form="chat-composer" type="password" autoComplete="off" required disabled={Boolean(pending)} value={token}
          onChange={event => { changeRepository(repo, true); setToken(event.target.value); }}
          placeholder="Fine-grained GitHub token" />
      </label>}
      {switchingRepository ? <div className={styles.repoActions}>
        <button type="button" disabled={!repoDraft.trim()} onClick={() => changeRepository(repoDraft.trim())}>Switch repository</button>
        <button type="button" onClick={() => setRepoDraft(repo)}>Cancel</button>
      </div> : null}
      {turns.length > 0 && !switchingRepository && <button className={styles.newChat} type="button" disabled={Boolean(pending)}
        onClick={() => { setTurns([]); setQuestion(""); setAttachments([]); setError(""); setReuseSources(true); closePicker(); }}>New chat</button>}
    </div>

    <div className={styles.workbench}>
      <nav className={styles.sidebar} aria-label="Repository tools">
        <button type="button" aria-pressed={panel === "chat"} onClick={() => setPanel("chat")}>Chat</button>
        <button type="button" aria-pressed={panel === "pulls"} disabled={!canAttach || Boolean(pending)} onClick={() => setPanel("pulls")}>Open pull requests</button>
        <button type="button" aria-pressed={panel === "graph"} disabled={!canAttach || Boolean(pending)} onClick={() => void openGraph()}>Knowledge graph</button>
        <a href="/graph">Index a local folder ↗</a>
        <a href="/connect">Connect a coding agent ↗</a>
      </nav>
      <div className={styles.mainPanel}>
      <div hidden={panel !== "chat"}>
    <div ref={thread} className={styles.thread} data-active={hasConversation} role="log" aria-label="Conversation" tabIndex={hasConversation ? 0 : undefined}>
      {!turns.length && !pending && <div className={styles.empty}>
        <BrandMark />
        <h2>What changed, and why?</h2>
        <p>Paste a GitHub link into chat. Review a pull request against earlier decisions, or explore a repository and ask how it works.</p>
      </div>}
      {turns.map(turn => <article className={styles.turn} key={turn.id}>
        <Prompt turn={turn} />
        <Answer turn={turn} onReview={url => { setQuestion(url); void send(url); }} disabled={Boolean(pending) || switchingRepository} />
      </article>)}
      {pending && <article className={styles.turn} aria-busy="true">
        <Prompt turn={pending} />
        <div className={styles.answerHead} role="status"><BrandMark /><strong>{pull ? "Comparing the pull request with earlier decisions…" : "Reading repository history…"}</strong></div>
      </article>}
    </div>
    <div className={styles.dock}>
      <form className={styles.composer} id="chat-composer" method="post" onSubmit={event => { event.preventDefault(); void send(); }}>
        {mode === "public" && !turns.length && !pending && <div className={styles.examples} aria-label="Example prompts">
          {examples.map(([label, prompt]) => <button type="button" key={label} onClick={() => {
            if (repo !== "AppFuton/Futon") changeRepository("AppFuton/Futon");
            draft(prompt);
          }}>{label}</button>)}
          <button type="button" onClick={() => { setQuestion(demoPull); void send(demoPull); }}>Try an example PR review</button>
        </div>}
      {turns.length > 0 && !pending && pull && <div className={styles.examples} aria-label="Suggested review questions">
        <button type="button" onClick={() => draft("What changed in this pull request?")}>What changed?</button>
        <button type="button" onClick={() => draft("Which earlier decisions should I check before merging?")}>Check earlier decisions</button>
      </div>}
      {turns.length > 0 && !pending && !pull && contextIds.length > 0 && <div className={styles.examples} aria-label="Suggested follow-ups">
          <button type="button" onClick={() => draft("Who recorded these changes and when?")}>Authors and dates</button>
          <button type="button" onClick={() => draft("Was the earlier decision replaced?")}>Check for overrides</button>
        </div>}
      {turns.at(-1)?.answer.overview && !pending && <div className={styles.examples}>
        <button type="button" onClick={() => draft("What pull requests are open? Show open pull requests.")}>Ask about open PRs</button>
        <button type="button" onClick={() => setPanel("pulls")}>Browse open pull requests</button>
      </div>}
        {pickerOpen && <section className={styles.filePicker} aria-label="Indexed repository files" id="chat-files"
          onKeyDown={event => { if (event.key === "Escape") { closePicker(); editor.current?.focus(); } }}>
          <div className={styles.fileHeading}><strong>Attach repository files</strong>
            <button type="button" onClick={() => { closePicker(); editor.current?.focus(); }}>Done</button></div>
          <p>Choose up to three paths to find related pull requests and commits.</p>
          {loadingFiles ? <div role="status">Loading the repository index…</div> : fileError ? <p role="alert">{fileError}</p> : <>
            <input type="search" autoFocus aria-label="Search indexed files" placeholder="Search by file or folder" value={fileFilter}
              onChange={event => setFileFilter(event.target.value)} />
            {!matchingFiles.length && <p>{filter ? "No indexed files match your search." : "This index contains no attachable files."}</p>}
            <ul className={styles.fileList}>
              {matchingFiles.slice(0, 30).map(file => {
                const attached = attachments.some(item => item.path === file.path);
                return <li key={file.path}><button type="button" aria-pressed={attached}
                  disabled={!attached && attachments.length >= 3}
                  onClick={() => setAttachments(current => attached ? current.filter(item => item.path !== file.path) : [...current, file])}>
                  <code>{file.path}</code><span>{attached ? "Added" : "Add"}</span>
                </button></li>;
              })}
            </ul>
            {matchingFiles.length > 30 && <small>Showing 30 of {matchingFiles.length}. Narrow your search to see other files.</small>}
            {indexed?.partial && <small>The GitHub tree index is partial.</small>}
          </>}
        </section>}
        <div className={styles.inputBox}>
          {attachments.length > 0 && <ul className={styles.attachments} aria-label="Attached files">
            {attachments.map(file => <li key={file.path}><code title={file.path}>{file.path}</code>
              <button type="button" aria-label={"Remove " + file.path} disabled={Boolean(pending)}
                onClick={() => setAttachments(items => items.filter(item => item.path !== file.path))}>×</button></li>)}
          </ul>}
          <textarea ref={editor} aria-label="Question" maxLength={500} rows={2} value={question}
            readOnly={Boolean(pending)} placeholder={turns.length ? "Ask a follow-up or paste a new GitHub link…" : "Paste a GitHub link or ask a question…"}
            onChange={event => setQuestion(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }} />
          <div className={styles.composerTools}>
            <button type="button" className={styles.attachButton} disabled={!canAttach || Boolean(pending)} aria-expanded={pickerOpen}
              aria-controls={pickerOpen ? "chat-files" : undefined} onClick={() => void openFiles()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Attach files
            </button>
            <details className={styles.options} ref={options} onToggle={event => { if (event.currentTarget.open && pickerOpen) closePicker(); }}>
              <summary>Options</summary>
              <div className={styles.optionsPanel}>
                <label>Voice and reply language<select value={language} disabled={Boolean(pending)} onChange={event => setLanguage(event.target.value)}>
                  <option>Hinglish</option><option>Hindi</option><option>English</option>
                </select></label>
                {!pull && <label>Include records through<input type="date" value={throughDate} disabled={Boolean(pending)} onChange={event => setThroughDate(event.target.value)} /></label>}
                <label className="sf-check"><input type="checkbox" checked={explain} disabled={Boolean(pending)}
                  onChange={event => setExplain(event.target.checked)} />Let AI explain the evidence</label>
                {explain && <small>Your question and excerpts may be shared with Gemini for PR review, or with Sarvam or OpenRouter for explanations. Enable this after selecting the source you want to share.</small>}
                {!pull && contextIds.length > 0 && <label className="sf-check"><input type="checkbox" checked={reuseSources} disabled={Boolean(pending)}
                  onChange={event => setReuseSources(event.target.checked)} />Use sources from the last reply</label>}
              </div>
            </details>
            <div className={styles.voice}>
              <VoiceControls text={question} label="question" language={language} disabled={Boolean(pending)} iconOnly
                onDictation={text => setQuestion(current => [current.trim(), text].filter(Boolean).join(" ").slice(0, 500))} />
            </div>
            <button type="submit" className={styles.send} aria-label={action} title={action} disabled={!canSubmit}>
              {linkAction && <span>{action}</span>}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5m-6 6 6-6 6 6" />
              </svg>
            </button>
          </div>
        </div>
        {error && <p className="sf-error" role="alert">{error}</p>}
        <small className={styles.composerHint}>{switchingRepository ? "Confirm the new source before sending." :
          mode === "private" ? "Your GitHub token stays in this tab and is sent to SkillForge for GitHub access." :
          draftTarget ? `GitHub ${nextPull ? "pull request" : "repository"} detected. Press Enter to submit.` :
          !repo.trim() ? "A GitHub link is enough to start. You can ask follow-up questions after the first result." : "Enter to send · Shift + Enter for a new line"}</small>
      </form>
    </div>
      </div>
      {panel === "pulls" && currentSource && <OpenPulls key={pull?.repo ?? currentSource} repo={pull?.repo ?? currentSource} mode={mode} token={token}
        onReview={url => { setQuestion(url); void send(url); }} />}
      {panel === "graph" && <>
        {graphLoading && <p role="status">Indexing repository files and history…</p>}
        {graphError && <div><p role="alert">{graphError}</p><button type="button" onClick={() => void openGraph()}>Retry graph</button></div>}
        {graph && <WorkspaceGraph key={graph.repository + graph.revision} initialRepo={graph.repository} initialPrivate={mode === "private"} workspaceGraph={graph} />}
      </>}
      </div>
    </div>
  </section>;
}

function Prompt({ turn }: { turn: Turn }) {
  return <div className={styles.userMessage}>
    <h3>{turn.prompt}</h3>
    {turn.attachments.length > 0 && <ul aria-label="Files in this question">{turn.attachments.map(file =>
      <li key={file.path}>{file.url ? <a href={file.url} target="_blank" rel="noreferrer"><code>{file.path}</code></a> : <code>{file.path}</code>}</li>)}</ul>}
  </div>;
}

function Answer({ turn, onReview, disabled }: {
  turn: Turn & { answer: Result }; onReview: (url: string) => void; disabled: boolean;
}) {
  const { answer, prompt, language } = turn;
  const query = answer.query;
  const review = answer.review;
  const overview = answer.overview;
  const openPulls = answer.openPulls;
  const [copied, setCopied] = useState<{ target: "handover" | "query"; message: string }>();
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);
  async function copy(target: "handover" | "query", value: string, message: string) {
    try { await navigator.clipboard.writeText(value); }
    catch { message = "Could not copy to the clipboard."; }
    setCopied({ target, message });
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopied(undefined), 2500);
  }

  return <div className={styles.answer}>
    <div className={styles.answerHead}><BrandMark /><strong>SkillForge</strong></div>
    {overview && <section className={styles.analysis} aria-label="Repository overview">
      <h4>{overview.repo}</h4>
      <dl><div><dt>Files indexed</dt><dd>{overview.files}</dd></div><div><dt>PRs sampled</dt><dd>{overview.pulls}</dd></div><div><dt>Commits sampled</dt><dd>{overview.commits}</dd></div></dl>
      <p>{overview.partial ? "This index covers part of the file tree or history. " : ""}Ask about a change or attach a file to narrow your question.</p>
    </section>}
    {review && <section className={styles.analysis} aria-label="Pull request review">
      <small><a href={review.url} target="_blank" rel="noreferrer">PR #{review.number} ↗</a> · {review.state}</small>
      <h4>{review.title}</h4>
      <strong>{review.recommendation === "resolve-before-merge" ? "Review before merging" :
        review.possibleConflict ? "Possible decision conflict" : review.matched ? "Earlier decisions worth checking" : "No related decision found in the sample"}</strong>
      <p>{review.files} changed {review.files === 1 ? "file" : "files"} sampled · {review.matched} earlier {review.matched === 1 ? "record" : "records"} matched</p>
    </section>}
    {openPulls && <section className={styles.pullQueue} aria-label="Open pull requests in this answer">
      <h2>Open pull requests</h2>
      {openPulls.pulls.length ? <ul>{openPulls.pulls.map(pull => <li key={pull.number}>
        <div><strong>{pull.title}</strong><small>#{pull.number}{pull.draft ? " · Draft" : ""}{pull.author ? " · @" + pull.author : ""}</small></div>
        <button type="button" disabled={disabled} onClick={() => onReview(`https://github.com/${openPulls.repo}/pull/${pull.number}`)}>Review in chat</button>
      </li>)}</ul> : <p>This repository has no open pull requests.</p>}
      {openPulls.hasNext && <small>See the sidebar for more pull requests.</small>}
    </section>}
    {answer.summary && <>
      <p className={styles.summary}>{answer.summary}</p>
      <VoiceControls text={answer.summary} label="answer" language={language} />
      <small>{answer.explanationProvider} explanation</small>
    </>}
    {!overview && !openPulls && !answer.evidence.length && <p>{turn.attachments.length ? "No matching evidence was found for the attached files." : "The indexed history could not establish an answer."}</p>}
    {answer.explanationStatus === "not-configured" && <p>No AI explanation provider is configured.</p>}
    {answer.explanationStatus === "unavailable" && <p>AI explanations are temporarily unavailable.</p>}
    {answer.reviewNote && <p>{answer.reviewNote}</p>}
    {review?.findings?.map((finding, index) => <p key={index}><code>{finding.path}</code> · {finding.explanation}{" "}
      {finding.sources.map(source => <a key={source.id} href={source.url} title={source.title} target="_blank" rel="noreferrer">{source.id} ↗ </a>)}</p>)}
    {answer.evidence.length > 0 && <EvidenceTrail rows={answer.evidence} />}
    {!!answer.snippets?.length && <section aria-label="Code evidence">
      <h4>Code evidence</h4>
      {answer.snippets.map((snippet, index) => <CodeEvidence key={snippet.path} snippet={snippet}
        open={index === 0 && (Boolean(review) || !answer.evidence.some(row => row.links.some(link => link.kind === "SUPERSEDES"))) ? true : undefined} />)}
    </section>}
    {answer.evidence.length > 0 && <>
      {/\b(who|when|author|date|kisne|kab)\b/i.test(prompt) && <ul className="source-facts">
        {answer.evidence.map(({ record }) => <li key={record.id}>
          <a href={record.url} target="_blank" rel="noreferrer">{record.id}</a> · {record.author || "Author unrecorded"} · {record.date.slice(0, 10)} ({record.kind})
        </li>)}
      </ul>}
      <p className={styles.evidenceLabel}>{answer.matchBasis} · {answer.recordCount} records sampled{answer.throughDate ? " through " + answer.throughDate : ""}</p>
      <div className={styles.sources}>
        {answer.evidence.map(({ record, links }) => <details key={record.id} className={styles.source}>
          <summary><small>{record.kind}</small><span>{record.title}</span></summary>
          <div>
            <small>{record.author ? "@" + record.author : "Unknown author"} · {record.date.slice(0, 10)}</small>
            {record.text && <p>{record.text.slice(0, 550)}{record.text.length > 550 ? "…" : ""}</p>}
            {!!record.files?.length && <ul>{record.files.map(path => <li key={path}><code>{path}</code></li>)}</ul>}
            <a href={record.url} target="_blank" rel="noreferrer">Open source on GitHub ↗</a>
            {!!record.files?.length && record.kind.endsWith("PR") && <> · <a href={record.url + "/files"} target="_blank" rel="noreferrer">View diff ↗</a></>}
            {links.length > 0 && <ul>{links.map(({ kind, basis, record: linked }, index) =>
              <li key={index}>{kind === "SUPERSEDES" ? "Override" : kind === "DISCUSSION" ? "Discussion" : "Reference"} ·{" "}
                <a href={linked.url} target="_blank" rel="noreferrer">{linked.title}</a><small> {basis}</small></li>)}</ul>}
          </div>
        </details>)}
      </div>
      <div className="trail-actions">
        <button type="button" onClick={() => downloadTrail(prompt, answer.evidence)}>Download cited trail</button>
        <button type="button" onClick={() => void copy("handover", formatMarkdownTrail(prompt, answer.evidence), "Handover note copied!")}>Copy handover note</button>
        <span role="status">{copied?.target === "handover" && copied.message}</span>
      </div>
    </>}
    {query && <details className={styles.query}><summary>View executed Cypher</summary>
      <button type="button" onClick={() => void copy("query", query, "Cypher query copied!")}>Copy query</button>
      <span role="status">{copied?.target === "query" && copied.message}</span>
      <pre>{query}</pre>
    </details>}
  </div>;
}
