import { Mast } from "../Mast";
import { collections, traceDate } from "../collections";
export const metadata = { title: "Trace library", alternates: { canonical: "/library" } };
export default function Library() {
  return <><Mast current="library"/><main className="outer" id="main-content"><div className="section-title"><h1>Trace library</h1><p>Explore real changes from Futon and Hackfront. Each trace explains what the record establishes and links to the original evidence.</p></div>
    <div className="library-grid">{collections.map(item => <article key={item.slug} id={item.slug} className="folio"><small>{item.repo} · {item.type}</small><h2>{item.name}</h2>
      <ol>{item.steps.map(step => <li key={step.record}><small><time dateTime={step.date}>{traceDate(step.date)}</time></small><a href={"https://github.com/"+item.repo+"/"+step.path} target="_blank" rel="noreferrer">{step.record} ↗</a><p>{step.note}</p></li>)}</ol>
      <a className="ink-button" href={"/demo/"+item.slug}>Investigate this trace →</a></article>)}</div></main></>;
}
