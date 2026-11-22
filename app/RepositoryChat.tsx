"use client";

import { createAuthClient } from "better-auth/react";
import { useEffect, useRef, useState } from "react";
import { EvidenceTrail, downloadTrail, formatMarkdownTrail, type TrailRow } from "./EvidenceTrail";
import { BrandMark } from "./Mast";
import { VoiceControls } from "./VoiceControls";
import { takePrivateAccess } from "./private-transfer";
import type { RepositoryGraph } from "@/lib/graph-types";
import styles from "./workspace/chat.module.css";

type Mode = "private" | "public";
type Starter = { repo: string; question: string };
type IndexedFile = { path: string; url?: string };
type Result = {
  evidence: TrailRow[];
  throughDate: string | null;
  recordCount: number;
  matchBasis: string;
  query: string;
  summary: string | null;
  error?: string;
  explanationProvider: "Sarvam" | "OpenRouter" | null;
  explanationStatus: "ready" | "no-evidence" | "not-configured" | "unavailable" | null;
};
type Turn = { id: number; prompt: string; attachments: IndexedFile[]; language: string };
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fileFilter, setFileFilter] = useState("");
  const [fileError, setFileError] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const fileRequest = useRef<AbortController>(null);
  const thread = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const options = useRef<HTMLDetailsElement>(null);
  const sequence = useRef(0);
  const contextIds = (turns.at(-1)?.answer.evidence ?? []).map(({ record }) => record.id)
    .filter(id => /^(?:#[1-9]\d{0,9}|[a-f0-9]{40})$/.test(id)).slice(0, 5);
  const switchingRepository = repoDraft !== repo;

  useEffect(() => {
    if (!userId || mode !== "private") return;
    const access = takePrivateAccess(userId);
    if (access) { setRepo(access.repository); setRepoDraft(access.repository); setToken(access.token); }
  }, [userId, mode]);
  useEffect(() => () => fileRequest.current?.abort(), []);
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

  function changeRepository(value: string) {
    closePicker();
    setRepo(value);
    setRepoDraft(value);
    setIndexed(undefined);
    setAttachments([]);
    setTurns([]);
    setExplain(false);
    setError("");
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
      const params = new URLSearchParams({ repo: repo.trim(), mode });
      const response = await fetch("/api/graph?" + params, {
        method: "POST", signal: controller.signal,
        headers: mode === "private" ? { Authorization: "Bearer " + token } : {},
      });
      const result = await response.json() as RepositoryGraph & { error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (mode === "private" && [401, 403].includes(response.status)) {
          changeRepository(repo);
          setToken("");
          setError(result.error || "Check your GitHub read token.");
          return;
        }
        throw new Error(result.error || "The repository index is unavailable.");
      }
      const files = result.nodes.filter(node => node.kind === "file" && !/[\\\u0000-\u001f]/.test(node.detail))
        .map(node => ({ path: node.detail, url: node.url })).sort((a, b) => a.path.localeCompare(b.path));
      setIndexed({ files, partial: result.coverage.treePartial });
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

  async function send() {
    const prompt = question.trim();
    if (pending || switchingRepository || prompt.length < 3 || !repo.trim() || (mode === "private" && !token.trim())) return;
    const turn = { id: ++sequence.current, prompt, attachments, language };
    setPending(turn);
    setError("");
    closePicker();
    if (options.current) options.current.open = false;
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(mode === "private" && { Authorization: "Bearer " + token }) },
        body: JSON.stringify({
          mode, repo, question: prompt, language, sarvam: explain,
          files: attachments.map(file => file.path), contextIds: reuseSources ? contextIds : [],
          throughDate: throughDate || undefined,
        }),
      });
      const answer = await response.json() as Result;
      if (!response.ok) {
        if (mode === "private" && [401, 403].includes(response.status)) {
          changeRepository(repo);
          setToken("");
        }
        throw new Error(answer.error || "The question could not be answered.");
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
      <label>GitHub repository
        <input value={repoDraft} required form="chat-composer" disabled={Boolean(pending)} placeholder="owner/repository" maxLength={170}
          onChange={event => {
            if (turns.length || attachments.length || pickerOpen) setRepoDraft(event.target.value);
            else changeRepository(event.target.value);
          }}
          onKeyDown={event => {
            if (event.key === "Enter" && switchingRepository && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (repoDraft.trim()) changeRepository(repoDraft.trim());
            }
          }} />
      </label>
      {mode === "private" && <label>Repository-scoped read token
        <input form="chat-composer" type="password" autoComplete="off" required disabled={Boolean(pending)} value={token}
          onChange={event => { changeRepository(repo); setToken(event.target.value); }}
          placeholder="Fine-grained GitHub token" />
      </label>}
      {switchingRepository ? <div className={styles.repoActions}>
        <button type="button" disabled={!repoDraft.trim()} onClick={() => changeRepository(repoDraft.trim())}>Switch repository</button>
        <button type="button" onClick={() => setRepoDraft(repo)}>Cancel</button>
      </div> : repo.trim() && <a className={styles.graphLink} href={"/graph?" + new URLSearchParams({ repo: repo.trim(), path: mode })}>Open graph <span className="arrow" aria-hidden="true" /></a>}
      {turns.length > 0 && !switchingRepository && <button className={styles.newChat} type="button" disabled={Boolean(pending)}
        onClick={() => { setTurns([]); setQuestion(""); setAttachments([]); setError(""); setReuseSources(true); closePicker(); }}>New chat</button>}
    </div>

    <div ref={thread} className={styles.thread} data-active={hasConversation} role="log" aria-label="Conversation" tabIndex={hasConversation ? 0 : undefined}>
      {!turns.length && !pending && <div className={styles.empty}>
        <BrandMark />
        <h2>What changed, and why?</h2>
        <p>Ask about a decision, cite a PR, or attach a repository file to trace its history.</p>
      </div>}
      {turns.map(turn => <article className={styles.turn} key={turn.id}>
        <Prompt turn={turn} />
        <Answer turn={turn} />
      </article>)}
      {pending && <article className={styles.turn} aria-busy="true">
        <Prompt turn={pending} />
        <div className={styles.answerHead} role="status"><BrandMark /><strong>Looking for evidence…</strong></div>
      </article>}
    </div>
    <div className={styles.dock}>
      <form className={styles.composer} id="chat-composer" method="post" onSubmit={event => { event.preventDefault(); void send(); }}>
        {mode === "public" && !turns.length && !pending && <div className={styles.examples} aria-label="Example prompts">
          {examples.map(([label, prompt]) => <button type="button" key={label} onClick={() => {
            if (repo !== "AppFuton/Futon") changeRepository("AppFuton/Futon");
            draft(prompt);
          }}>{label}</button>)}
        </div>}
        {turns.length > 0 && !pending && contextIds.length > 0 && <div className={styles.examples} aria-label="Suggested follow-ups">
          <button type="button" onClick={() => draft("Who recorded these changes and when?")}>Authors and dates</button>
          <button type="button" onClick={() => draft("Was the earlier decision replaced?")}>Check for overrides</button>
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
          <textarea ref={editor} aria-label="Question" required minLength={3} maxLength={500} rows={2} value={question}
            readOnly={Boolean(pending)} placeholder={turns.length ? "Ask a follow-up…" : "Ask about a repository…"}
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
                <label>Include records through<input type="date" value={throughDate} disabled={Boolean(pending)} onChange={event => setThroughDate(event.target.value)} /></label>
                <label className="sf-check"><input type="checkbox" checked={explain} disabled={Boolean(pending)}
                  onChange={event => setExplain(event.target.checked)} />Let AI explain the evidence</label>
                {explain && <small>Your question, selected excerpts, author names, dates and changed file paths may be shared with Sarvam or OpenRouter.</small>}
                {contextIds.length > 0 && <label className="sf-check"><input type="checkbox" checked={reuseSources} disabled={Boolean(pending)}
                  onChange={event => setReuseSources(event.target.checked)} />Use sources from the last reply</label>}
              </div>
            </details>
            <div className={styles.voice}>
              <VoiceControls text={question} label="question" language={language} disabled={Boolean(pending)} iconOnly
                onDictation={text => setQuestion(current => [current.trim(), text].filter(Boolean).join(" ").slice(0, 500))} />
            </div>
            <button type="submit" className={styles.send} aria-label={turns.length ? "Send follow-up" : "Ask about this repo"} title="Send question"
              disabled={Boolean(pending) || question.trim().length < 3 || !canAttach}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5m-6 6 6-6 6 6" />
              </svg>
            </button>
          </div>
        </div>
        {error && <p className="sf-error" role="alert">{error}</p>}
        <small className={styles.composerHint}>{switchingRepository ? "Switching repositories starts a new conversation." :
          mode === "private" ? "Your GitHub token stays in this tab and is sent to SkillForge for GitHub access." :
          !repo.trim() ? "Choose a GitHub repository to ask a question or attach files." : "Enter to send · Shift + Enter for a new line"}</small>
      </form>
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

function Answer({ turn }: { turn: Turn & { answer: Result } }) {
  const { answer, prompt, language } = turn;
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
    {answer.summary && <>
      <p className={styles.summary}>{answer.summary}</p>
      <VoiceControls text={answer.summary} label="answer" language={language} />
      <small>{answer.explanationProvider} explanation</small>
    </>}
    {!answer.evidence.length && <p>{turn.attachments.length ? "No matching evidence was found for the attached files." : "The indexed history could not establish an answer."}</p>}
    {answer.explanationStatus === "not-configured" && <p>No AI explanation provider is configured.</p>}
    {answer.explanationStatus === "unavailable" && <p>AI explanations are temporarily unavailable.</p>}
    {answer.evidence.length > 0 && <>
      <EvidenceTrail rows={answer.evidence} />
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
    <details className={styles.query}><summary>View executed Cypher</summary>
      <button type="button" onClick={() => void copy("query", answer.query, "Cypher query copied!")}>Copy query</button>
      <span role="status">{copied?.target === "query" && copied.message}</span>
      <pre>{answer.query}</pre>
    </details>
  </div>;
}
