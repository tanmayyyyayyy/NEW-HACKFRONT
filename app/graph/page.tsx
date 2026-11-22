import { Mast } from "../Mast";
import { GraphExplorer } from "./GraphExplorer";

export const metadata = { title: "Repository graph", robots: { index: false, follow: true } };

export default async function GraphPage({ searchParams }: { searchParams: Promise<{ repo?: string | string[]; path?: string }> }) {
  const { repo, path } = await searchParams;
  const initialRepo = (Array.isArray(repo) ? repo[0] : repo)?.slice(0, 170) ?? "";
  return <><Mast current="graph" /><main className="sf-shell" id="main-content">
    <header className="section-title">
      <h1>Repository graph</h1>
      <p>Index a GitHub repository or local folder. Explore its file tree and module imports, then follow decisions in the connected GitHub history.</p>
    </header>
    <GraphExplorer initialRepo={initialRepo} initialPrivate={path === "private"} />
  </main></>;
}
