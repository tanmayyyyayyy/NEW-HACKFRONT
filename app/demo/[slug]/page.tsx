import { notFound } from "next/navigation";
import { collections, traceDate } from "../../collections";
import { Mast } from "../../Mast";
import { TracePreview } from "../../TracePreview";

export const dynamicParams = false;

export function generateStaticParams() {
  return collections.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trace = collections.find(item => item.slug === slug);
  if (!trace) notFound();
  return { title: trace.name, description: trace.steps.at(-1)?.note, alternates: { canonical: "/demo/" + trace.slug } };
}

export default async function Demo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trace = collections.find(item => item.slug === slug);
  if (!trace) notFound();

  const repoUrl = "https://github.com/" + trace.repo;
  const note = [
    `# ${trace.name}`, "", trace.repo, "",
    ...trace.steps.flatMap(step => [
      `## ${step.label}`, step.note,
      `[${step.record}](${repoUrl}/${step.path}) · ${traceDate(step.date)} · @${step.author}`, "",
    ]),
    `[Source changes](${repoUrl}/${trace.evidence.link})`, trace.limit, "",
  ].join("\n");

  return (
    <>
      <Mast />
      <main className="outer demo" id="main-content">
        <header className="section-title demo-heading">
          <a href="/library">← Trace library</a>
          <h1>{trace.name}</h1>
          <p>Guided example from {trace.repo}</p>
        </header>
        <div className="demo-grid">
          <TracePreview trace={trace} />
          <section className="demo-evidence" aria-labelledby="source-change">
            <h2 id="source-change">What the source shows</h2>
            <p>{trace.limit}</p>
            <div className="demo-diff">
              <code>{trace.evidence.file}</code>
              <ul>
                {trace.evidence.changes.map(change => (
                  <li className={"diff-" + change.kind} key={change.text}>
                    <span aria-hidden="true">{change.kind === "added" ? "+" : "−"}</span>
                    <span>{change.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <a href={repoUrl + "/" + trace.evidence.link} target="_blank" rel="noreferrer">Inspect the GitHub change ↗</a>
          </section>
        </div>
        <div className="demo-actions">
          <a className="ink-button" href="/account?path=private">Connect a repository</a>
          <a href={"data:text/plain;charset=utf-8," + encodeURIComponent(note)} download={trace.slug + "-handover.md"}>Download handover note</a>
          {trace.workspaceQuestion && <a href={"/workspace?example=" + trace.slug}>Run this question in the workspace</a>}
        </div>
        <section className="shelf demo-shelf" aria-labelledby="other-traces">
          <header><h2 id="other-traces">More decisions to explore</h2></header>
          {collections.filter(item => item.slug !== trace.slug).map(item => (
            <a className="shelf-row" key={item.slug} href={"/demo/" + item.slug}>
              <span>{item.type}</span><strong>{item.name}</strong><small>{item.repo}</small>
            </a>
          ))}
        </section>
      </main>
    </>
  );
}
