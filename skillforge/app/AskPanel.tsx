"use client";

import { useState, type FormEvent } from "react";
import type { AskResult, DecisionView } from "@/lib/ask";

const DEMO_QUESTIONS = [
  "Why are reading statistics kept when migrating to another source?",
  "Why does smart resume wait for chapter updates?",
  "Why does Futon use Kubernetes for billing?",
];

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function DecisionCard({ decision, timeline, isCited }: { decision: DecisionView; timeline: DecisionView[]; isCited: boolean }) {
  const newer = timeline.find((item) => item.id === decision.supersededBy);
  const basis = newer?.supersedes.find((link) => link.id === decision.id)?.basis;
  return (
    <li className={`decision ${decision.status}${isCited ? " cited" : ""}`}>
      <div className="decision-head">
        <time>{formatDate(decision.date)}</time>
        <a href={decision.pr.url} target="_blank" rel="noreferrer">
          PR #{decision.pr.number}
        </a>
        <span>by @{decision.person}</span>
        {isCited && <span className="tag">cited</span>}
      </div>
      <h3>{decision.title}</h3>
      {newer && (
        <p className="override">
          Overridden by PR #{newer.pr.number} on {formatDate(newer.date)}. {basis}
        </p>
      )}
      <p>{decision.why}</p>
      <blockquote>{decision.quote}</blockquote>
      <p className="meta">
        {decision.issues.map((issue) => (
          <a key={issue.number} href={issue.url} target="_blank" rel="noreferrer">
            Issue #{issue.number}: {issue.title}
          </a>
        ))}
        <span>{decision.comments} discussion comments</span>
        {decision.affects.length > 0 && <span>Affects: {decision.affects.join(", ")}</span>}
      </p>
    </li>
  );
}

export function AskPanel() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  async function ask(event: FormEvent) {
    event.preventDefault();
    setIsAsking(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error);
      }
      setResult(body);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Something went wrong.");
    } finally {
      setIsAsking(false);
    }
  }

  const primary = result?.status === "answered" ? result.timeline.find((item) => item.id === result.citedIds[0]) : undefined;

  return (
    <section>
      <form onSubmit={ask} className="ask">
        <label htmlFor="question">Your question</label>
        <div className="ask-row">
          <input
            id="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Why does the reader wait for chapter updates?"
            maxLength={500}
          />
          <button disabled={isAsking || question.trim().length < 3}>{isAsking ? "Walking the graph…" : "Ask"}</button>
        </div>
        <div className="examples">
          {DEMO_QUESTIONS.map((example) => (
            <button type="button" key={example} onClick={() => setQuestion(example)}>
              {example}
            </button>
          ))}
        </div>
      </form>

      {error && <p className="warning" role="alert">{error}</p>}

      {result?.status === "refused" && (
        <div className="refusal" role="status">
          <h2>Not in the history</h2>
          <p>{result.reason}</p>
        </div>
      )}

      {result?.status === "answered" && primary && (
        <div className="result">
          <div className="answer">
            <p>{result.answer}</p>
            <p className="byline">
              {result.writtenBy === "agent"
                ? "Written by the Gemini agent from the graph evidence below. It can only cite decisions its queries returned."
                : "Decision text from the graph. The AI was unavailable, so fixed queries answered."}
            </p>
          </div>
          <div className="facts">
            <div>
              <span className="label">Confidence</span>
              <div className={`meter ${result.confidence.label}`} aria-label={`${result.confidence.score} out of 100`}>
                <div style={{ width: `${result.confidence.score}%` }} />
              </div>
              <strong>
                {result.confidence.score}/100 · {result.confidence.label}
              </strong>
              <ul>
                {result.confidence.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            <div>
              <span className="label">Person to ask</span>
              <a href={`https://github.com/${primary.person}`} target="_blank" rel="noreferrer">
                @{primary.person}
              </a>
              <span className="label">Decided on</span>
              <strong>{formatDate(primary.date)}</strong>
            </div>
          </div>
          <h2>Decision timeline</h2>
          <ol className="timeline">
            {result.timeline.map((decision) => (
              <DecisionCard key={decision.id} decision={decision} timeline={result.timeline} isCited={result.citedIds.includes(decision.id)} />
            ))}
          </ol>
        </div>
      )}

      {result && (
        <details className="cypher">
          <summary>
            Show how the agent searched the graph ({result.steps.length} tool calls, {result.queries.length} queries)
          </summary>
          {result.steps.length > 0 && (
            <ol className="steps">
              {result.steps.map((step, index) => (
                <li key={index}>
                  <code>{step.tool}</code> {step.input}
                </li>
              ))}
            </ol>
          )}
          {result.queries.map((query) => (
            <div key={query.label}>
              <p>
                {query.label} · {query.rows} rows
              </p>
              <pre>{query.cypher}</pre>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
