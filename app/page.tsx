import Image from "next/image";
import { redirect } from "next/navigation";
import { Mast } from "./Mast";
import { TracePreview } from "./TracePreview";
import { collections } from "./collections";

export const metadata = { alternates: { canonical: "/" } };

export default async function Home({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path } = await searchParams;
  if (path === "public" || path === "private") redirect("/account?path=" + path);

  return <>
    <Mast current="home" />
    <main id="main-content">
      <section className="outer hero">
        <div className="hero-copy">
          <h1>Find the <em>why</em><br />behind the code.</h1>
          <p>Ask a question about a GitHub repository. Follow the answer through commits, pull requests, and the decisions that changed them.</p>
          <div className="hero-actions">
            <a className="ink-button" href="/workspace">Open workspace <span className="arrow" aria-hidden="true" /></a>
            <a className="text-button" href="/graph">Map a repository <span className="arrow" aria-hidden="true" /></a>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <Image src="/images/decision-layers.webp" alt="" fill sizes="(max-width: 760px) 100vw, 65vw" preload unoptimized />
        </div>
      </section>

      <section className="outer walkthrough" aria-labelledby="walkthrough-title">
        <div className="walkthrough-copy">
          <h2 id="walkthrough-title">Follow a decision.</h2>
          <p>See when the decision was made, what changed later, and where to verify it in GitHub.</p>
          <a className="inline-link" href="/demo/chapter-updates">Try a real decision <span className="arrow" aria-hidden="true" /></a>
        </div>
        <TracePreview trace={collections[0]} />
      </section>

      <section className="outer shelf home-library">
        <header><h2>Explore the evidence</h2><a className="inline-link" href="/library">Browse example traces <span className="arrow" aria-hidden="true" /></a></header>
        {collections.map(item => (
          <a className="shelf-row" key={item.slug} href={"/demo/" + item.slug}>
            <span>{item.type}</span><strong>{item.name}</strong><small>{item.steps.map(step => step.record).join(" → ")}</small>
            <span className="arrow" aria-hidden="true" />
          </a>
        ))}
      </section>
    </main>
  </>;
}
