"use client";

import { EvidenceTrail, downloadTrail, formatMarkdownTrail } from "./EvidenceTrail";
import { createAuthClient } from "better-auth/react";
import { takePrivateAccess } from "./private-transfer";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Evidence } from "@/lib/repository-chat";

type Mode = "private" | "public";
type Result = {
  evidence: { record: Evidence; links: { kind: string; basis: string; record: Evidence }[] }[];
  throughDate: string | null; recordCount: number; matchBasis: string; query: string; bundled: boolean; summary: string | null; sarvamUnavailable: boolean; error?: string;
};
const examples = [
  ["Trace the migration fix", "Why preserve reading statistics during source migration? Trace issue #127 and PR #138."],
  ["Compare two decisions", "Why did PR #146 replace the chapter update behavior from PR #112?"],
  ["Try an unanswered question", "Why does Futon use Kubernetes for billing?"],
];

const client = createAuthClient();
export function RepositoryChat({ initialMode, starter }: { initialMode: Mode; starter?: string }) {
  const { data: session, isPending } = client.useSession();
  return <Desk key={session?.user.id || "guest"} userId={session?.user.id} signedIn={Boolean(session)} isPending={isPending} initialMode={initialMode} starter={starter} />;
}
function Desk({ initialMode, signedIn, isPending, starter, userId }: { userId?: string; initialMode: Mode; starter?: string; signedIn: boolean; isPending: boolean }) {
  const mode = initialMode;
  const [repo, setRepo] = useState(starter ? "AppFuton/Futon" : "");
  const [token, setToken] = useState("");
  useEffect(() => {
    if (!userId || mode !== "private") return;
    const access = takePrivateAccess(userId);
    if (access) { setRepo(access.repository); setToken(access.token); }
  }, [mode, userId]);
  const [language, setLanguage] = useState("Hinglish");
  const [sarvam, setSarvam] = useState(false);
  const [question, setQuestion] = useState(starter || "");
  const [selected, setSelected] = useState(0);
  const [turns, setTurns] = useState<{ question: string; answer: Result }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const [followUp, setFollowUp] = useState("");
  const [throughDate, setThroughDate] = useState("");
  const active = turns[turns.length - 1 - selected];
  const contextIds = active?.answer.evidence.map(row => row.record.id).filter(id => /^(?:#\d+|[a-f0-9]{40})$/.test(id)).slice(0, 5) || [];

  async function send(prompt: string, follow = false) {
    if (busy || prompt.trim().length < 3) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(mode === "private" && { Authorization: "Bearer " + token }) },
        body: JSON.stringify({ mode, repo, question: prompt, language, sarvam, contextIds: follow ? contextIds : [], throughDate: (follow ? active?.answer.throughDate : throughDate) || undefined }),
      });
      const result = await response.json() as Result;
      if (!response.ok) {
        if (mode === "private" && [401,403].includes(response.status)) {
          setTurns([]); setSelected(0); setFollowUp(""); setToken(""); setSarvam(false);
        }
        throw new Error(result.error || "The question could not be answered.");
      }
      setTurns(previous => [...previous.slice(-5), { question: prompt, answer: result }]);
      setSelected(0); setQuestion(""); setFollowUp("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The question could not be answered.");
    } finally { setBusy(false); }
  }

  return <>
    <div className="sf-workspace">
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); void send(question); }} className="sf-form">
        <h2>Repository chatbot</h2>
        <p>{mode === "private"
          ? "Use your own GitHub token for a repository your team has granted you permission to read."
          : "Study a company’s public codebase before you join or contribute. Trace commits and PRs to see how teams work."}</p>
        {mode === "private" && !signedIn ? <p>{isPending ? "Checking sign-in…" : <a href="/account?path=private">Sign in for private handover →</a>}</p> : <>
        <label>GitHub repository<input required value={repo} disabled={busy} placeholder="https://github.com/owner/repo" maxLength={170}
          onChange={event => { setRepo(event.target.value); setFollowUp(""); setSarvam(false); setTurns([]); setSelected(0); setError(""); }} /></label>
        {mode === "private" && <label>Repository-scoped read token
          <input type="password" autoComplete="off" required disabled={busy} value={token}
            onChange={event => { setToken(event.target.value); setFollowUp(""); setTurns([]); setSelected(0); }} />
          <small>Use a personal fine-grained token with read permissions for metadata, contents, issues and pull requests. It stays in this tab and is sent only to the SkillForge server for GitHub access.</small>
        </label>}
        {mode === "public" && <div className="sf-examples">{examples.map(([label, prompt]) =>
          <button key={label} type="button" disabled={busy} onClick={() => {
            if (repo !== "AppFuton/Futon") { setTurns([]); setSarvam(false); }
            setFollowUp(""); setSelected(0);
            setRepo("AppFuton/Futon"); setQuestion(prompt);
          }}>{label}</button>)}</div>}
        <label>Question<textarea required minLength={3} maxLength={500} rows={3} value={question} disabled={busy}
          placeholder="Why was this behavior introduced? Include a PR number if you know it."
          onChange={event => setQuestion(event.target.value)} /></label>
        <details className="history-window"><summary>Limit sources by date</summary><label>Include records through<input type="date" value={throughDate} disabled={busy} onChange={e => setThroughDate(e.target.value)} /></label><small>Filters the dates of sampled records. Text reflects the retrieved version.</small></details>
        <label className="sf-check"><input type="checkbox" checked={sarvam} disabled={busy} onChange={event => setSarvam(event.target.checked)} />
          Let Sarvam explain the answer</label>
        {sarvam && <>
          <small>Your question, selected excerpts, author names, dates and changed file paths will be sent to Sarvam. Your GitHub token stays with the SkillForge and GitHub request.</small>
          <label>Reply language<select value={language} onChange={event => setLanguage(event.target.value)} disabled={busy}>
            <option>Hinglish</option><option>Hindi</option><option>English</option>
          </select></label>
        </>}
        <button className="sf-submit" disabled={busy}>{busy ? "Finding evidence…" : "Ask about this repo"}</button>
        </>}
        {error && <p className="sf-error" role="alert">{error}</p>}
      </form>
      <section className="sf-results" aria-label="Repository chat" aria-live="polite">
        <h2>Decision trail</h2>
        {!turns.length && <div className="trail-empty"><h3>Follow the paper trail</h3><ol><li>Find the original decision</li><li>Read the discussion behind it</li><li>Check what changed later</li></ol><p>Ask a question to open the linked records here.</p></div>}
        {turns.length > 1 && <label className="history-pick">Recent questions<select disabled={busy} value={selected} onChange={e => { setSelected(Number(e.target.value)); setFollowUp(""); }}>{[...turns].reverse().map((t,i) => <option value={i} key={i}>{t.question}</option>)}</select></label>}
        {[...turns].reverse().slice(selected, selected+1).map(({ question: prompt, answer }, i) => <article key={turns.length - i} className="sf-turn">
          <h3>{prompt}</h3>
          {!answer.evidence.length && <p>The indexed history could not establish an answer.</p>}
          {answer.summary && <p className="sf-summary"><strong>Sarvam explanation</strong><br />{answer.summary}</p>}
          {answer.sarvamUnavailable && <p>Sarvam is unavailable. The Neo4j evidence is below.</p>}
          {answer.evidence.length > 0 && <p>{answer.matchBasis} · Neo4j{answer.bundled ? " · Bundled public Futon snapshot" : " · Bounded GitHub history"}</p>}
          <small>{answer.recordCount} sampled records{answer.throughDate ? " through " + answer.throughDate : ""}</small>
          {answer.evidence.length > 0 && /\b(who|when|author|date|kisne|kab)\b/i.test(prompt) && <ul className="source-facts">{answer.evidence.map(({record}) => <li key={record.id}><a href={record.url} target="_blank" rel="noreferrer">{record.id}</a> · {record.author || "Author unrecorded"} · {record.date.slice(0,10)} ({record.kind})</li>)}</ul>}
          <EvidenceTrail rows={answer.evidence} />
          {contextIds.length > 0 && <form className="thread-reply" onSubmit={e => { e.preventDefault(); void send(followUp, true); }}>
            <label>Ask a follow-up<textarea value={followUp} rows={2} placeholder="Who recorded this change, and when?" required minLength={3} maxLength={500} disabled={busy} onChange={e => setFollowUp(e.target.value)} /></label>
            <small>Continuing from {contextIds.join(", ")}. The graph checks these sources again.</small>
            <div className="sf-examples"><button type="button" disabled={busy} onClick={() => setFollowUp("Who recorded these changes and when?")}>Authors and dates</button>
              <button type="button" disabled={busy} onClick={() => setFollowUp("Was the earlier decision replaced?")}>Check for overrides</button></div>
            <button disabled={busy || followUp.trim().length < 3}>{busy ? "Checking sources…" : "Send follow-up"}</button>
          </form>}
          {answer.evidence.length > 0 && <div className="trail-actions">
            <button type="button" onClick={() => downloadTrail(prompt, answer.evidence)}>Download cited trail</button>
            <button type="button" onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                void navigator.clipboard.writeText(formatMarkdownTrail(prompt, answer.evidence));
                setCopyStatus("Handover note copied!");
                setTimeout(() => setCopyStatus(""), 2500);
              }
            }}>Copy handover note</button>
            {copyStatus && <span className="copy-notice" role="status">{copyStatus}</span>}
          </div>}
          {answer.evidence.map(({ record, links }) => <div className="sf-record" key={record.id}>
            <div className="sf-record-head">
              <span className={"sf-kind-badge sf-kind-" + record.kind.toLowerCase().replace(/[^a-z0-9]/g, "-")}>{record.kind}</span>
              <a href={record.url} target="_blank" rel="noreferrer">{record.title}</a>
            </div>
            <small>{record.kind} · {record.author ? "@" + record.author : "Unknown author"} · {record.date.slice(0, 10)}</small>
            {Boolean(record.files?.length) && <details><summary>Changed files ({record.files!.length} shown)</summary><ul>{record.files!.map(path => <li key={path}><code>{path}</code></li>)}</ul><a href={record.url + "/files"} target="_blank" rel="noreferrer">Inspect the GitHub diff ↗</a></details>}
            {record.text && <p>{record.text.slice(0, 550)}{record.text.length > 550 ? "…" : ""}</p>}
            {links.length > 0 && <ul>{links.map(({ kind, basis, record: linked }, index) =>
              <li key={index}>{kind === "SUPERSEDES" ? "Override" : kind === "DISCUSSION" ? "Discussion" : "Reference"} ·{" "}
                <a href={linked.url} target="_blank" rel="noreferrer">{linked.title}</a><small>{basis}</small></li>)}</ul>}
          </div>)}
          <details className="cypher-details"><summary>View executed Cypher</summary>
            <div className="cypher-box">
              <button type="button" className="copy-cypher-btn" onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  void navigator.clipboard.writeText(answer.query);
                  setCopyStatus("Cypher query copied!");
                  setTimeout(() => setCopyStatus(""), 2500);
                }
              }}>Copy query</button>
              <pre>{answer.query}</pre>
            </div>
          </details>
        </article>)}
        {turns.length > 0 && <button type="button" disabled={busy} onClick={() => { setTurns([]); setSelected(0); setFollowUp(""); setQuestion(""); setError(""); }}>Clear conversation</button>}
      </section>
    </div>
  </>;
}
