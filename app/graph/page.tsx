import { Mast } from "../Mast";
import { GraphExplorer } from "./GraphExplorer";

export const metadata = { title: "Repository graph", robots: { index: false, follow: true } };

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ repo?: string; path?: string }> }) {
  const { repo, path } = await searchParams;
  return <><Mast current="graph" /><main className="sf-shell" id="main-content">
    <header className="section-title">
      <h1>Repository graph</h1>
      <p>Explore code structure, module imports, and decisions in an interactive 3D graph. The Knowledge Risk Map highlights areas that may be hard to maintain or hand over.</p>
    </header>
    <GraphExplorer initialRepo={repo?.slice(0, 170) || ""} initialPrivate={path === "private"} />
  </main></>;
}
