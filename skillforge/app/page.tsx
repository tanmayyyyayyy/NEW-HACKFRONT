import { redirect } from "next/navigation";
import { Mast } from "./Mast";
import { TracePreview } from "./TracePreview";
import { collections } from "./collections";
export default async function Home({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path } = await searchParams;
  if (path === "public" || path === "private") redirect("/account?path=" + path);
  return <><Mast/><main className="outer">
    <section className="hero"><div><h1>The story behind<br/>a <em>code change.</em></h1>
      <p>Pick up where another engineer left off. Follow a question through GitHub history to the discussion, the decision and what happened next.</p>
      <div className="hero-actions"><a className="ink-button" href="/account">Open your workspace →</a><a href="/library">Browse example traces</a></div>
    </div><TracePreview/></section>
    <section className="shelf"><header><h2>Inside the trace library</h2><a href="/library">View library →</a></header>
      {collections.map(item => <a className="shelf-row" key={item.slug} href={"/library#"+item.slug}><span>{item.type}</span><strong>{item.name}</strong><small>{item.records.join(" → ")} ↗</small></a>)}
    </section></main></>;
}
