"use client";

import { useEffect, useState } from "react";
import styles from "./chat.module.css";

type OpenPull = { number: number; title: string; draft: boolean; author: string; updated: string };

export function OpenPulls({ repo, mode, token, onReview }: {
  repo: string; mode: "public" | "private"; token: string; onReview: (url: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ pulls: OpenPull[]; hasNext: boolean }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError("");
    const params = new URLSearchParams({ repo, mode, view: "open-pulls", page: String(page) });
    void (async () => {
      try {
        const response = await fetch("/api/graph?" + params, { method: "POST", signal: controller.signal,
          headers: mode === "private" ? { Authorization: "Bearer " + token } : {} });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Open pull requests could not be loaded.");
        if (!controller.signal.aborted) setResult(data);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Open pull requests could not be loaded.");
      }
    })();
    return () => controller.abort();
  }, [repo, mode, token, page, attempt]);

  return <section className={styles.pullQueue} aria-labelledby="open-pull-requests">
    <h2 id="open-pull-requests">Open pull requests</h2>
    <p>Select a PR to review its changes in chat.</p>
    {error ? <div><p role="alert">{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div>
      : !result ? <p role="status">Loading open pull requests…</p>
      : result.pulls.length === 0 ? <p>{page === 1 ? "This repository has no open pull requests." : "There are no more open pull requests."}</p>
      : <ul>{result.pulls.map(pull => <li key={pull.number}>
        <div><strong>{pull.title}</strong><small>#{pull.number}{pull.draft ? " · Draft" : ""}{pull.author ? " · @" + pull.author : ""} · Updated {pull.updated.slice(0, 10)}</small></div>
        <button type="button" aria-label={`Review PR #${pull.number}`} onClick={() => onReview(`https://github.com/${repo}/pull/${pull.number}`)}>Review in chat</button>
      </li>)}</ul>}
    {(page > 1 || result?.hasNext) && <div className={styles.repoActions}>
      <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button>
      <button type="button" disabled={!result?.hasNext} onClick={() => setPage(value => value + 1)}>Next</button>
    </div>}
  </section>;
}
