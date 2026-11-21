import { Mast } from "../Mast";
import { collections } from "../collections";
export default function Library() {
  return <><Mast current="library"/><main className="outer"><div className="section-title"><h1>Trace library</h1><p>Two real decisions from Futon. Inspect the source, then run the question against the repository graph.</p></div>
    <div className="library-grid">{collections.map(item => <article key={item.slug} id={item.slug} className="folio"><small>{item.repo} · {item.type}</small><h2>{item.name}</h2>
      <ol>{item.records.map((r,i) => <li key={r}><small>{item.dates[i]}</small><a href={"https://github.com/"+item.repo+"/"+item.links[i]} target="_blank" rel="noreferrer">{r} ↗</a><p>{item.notes[i]}</p></li>)}</ol>
      <a className="ink-button" href={"/workspace?example="+item.slug}>Investigate this trace →</a></article>)}</div></main></>;
}
