import type { CodeSnippet } from "@/lib/code-types";
import styles from "./CodeEvidence.module.css";

export function CodeEvidence({ snippet, open }: { snippet: CodeSnippet; open?: boolean }) {
  const numbered = snippet.lines.filter(line => line.line !== undefined);
  const first = numbered[0]?.line;
  const last = numbered.at(-1)?.line;
  return <details className={styles.snippet} open={open}>
    <summary><code>{snippet.path}</code><span>{snippet.basis === "pull request diff" ? "PR diff" :
      snippet.basis === "file opening" ? "File opening" : first === last ? `Line ${first}` : `Lines ${first}–${last}`}</span></summary>
    <pre tabIndex={0} aria-label={`Source excerpt from ${snippet.path}`}><code>{snippet.lines.map((line, i) => <span key={i} className={styles.line} data-change={line.change}>
      <span className={styles.number} aria-label={line.old !== undefined && line.line === undefined ? "Removed line " + line.old : "Line " + line.line}>{line.line ?? line.old}</span>
      <span aria-hidden="true">{line.change === "added" ? "+" : line.change === "removed" ? "−" : " "}</span>
      <span>{line.text}</span>
    </span>)}</code></pre>
    <div className={styles.actions}>
      <a href={snippet.url} target="_blank" rel="noreferrer">{snippet.url === snippet.diffUrl ? "View line in PR diff" : "View exact lines on GitHub"} ↗</a>
      {snippet.diffUrl && snippet.diffUrl !== snippet.url && <a href={snippet.diffUrl} target="_blank" rel="noreferrer">View PR diff ↗</a>}
      {snippet.editUrl && <a href={snippet.editUrl} target="_blank" rel="noreferrer">Edit on GitHub ↗</a>}
    </div>
  </details>;
}
