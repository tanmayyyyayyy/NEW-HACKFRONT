import { Mast } from "../Mast";
import { GraphExplorer } from "./GraphExplorer";

export const metadata = { title: "Repository graph", robots: { index: false, follow: true } };

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ repo?: string | string[]; path?: string }> }) {
  const { repo, path } = await searchParams;
  const initialRepo = (Array.isArray(repo) ? repo[0] : repo)?.slice(0, 170) ?? "";
  return <><Mast current="graph" /><main className="sf-shell" id="main-content">
    <header className="section-title">
      <h1>Repository graph</h1>
      <p>Explore code structure, module imports, and decisions in a focused 2D or immersive 3D graph. Review a pull request against its repository’s decision history and spot changes that may revive a reversed behavior.</p>
    </header>
    <GraphExplorer initialRepo={initialRepo} initialPrivate={path === "private"} />
  </main></>;
}
