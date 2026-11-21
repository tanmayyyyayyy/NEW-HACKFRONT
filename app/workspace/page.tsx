import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { accounts } from "@/lib/auth";
import { RepositoryChat } from "../RepositoryChat";
import { Mast } from "../Mast";
import { collections } from "../collections";
export const metadata = { title: "Repository explorer", robots: { index: false, follow: true } };
export default async function Workspace({ searchParams }: { searchParams: Promise<{ path?: string; example?: string }> }) {
  const params = await searchParams;
  const mode = params.path === "private" ? "private" : "public";
  if (mode === "private") {
    const incoming = await headers();
    const session = incoming.has("cookie") && await (await accounts()).api.getSession({headers: incoming}).catch(() => null);
    if (!session) redirect("/account?path=private");
  }
  const example = mode === "public" ? collections.find(item => item.slug === params.example) : undefined;
  const starter = example?.workspaceQuestion ? { repo: example.repo, question: example.workspaceQuestion } : undefined;
  return <><Mast current="workspace"/><main className="sf-shell" id="main-content"><header className="section-title workspace-title"><div><h1>{mode === "private" ? "Team handover" : "Repository explorer"}</h1>
    <p>{mode === "private" ? "Trace the decisions behind a service you're taking over." : "Investigate a change, follow the discussion and keep the sources."}</p></div>
    <nav className="workspace-modes" aria-label="Workspace mode">
      <a href="/workspace" aria-current={mode === "public" ? "page" : undefined}>Public repository</a>
      <a href="/workspace?path=private" aria-current={mode === "private" ? "page" : undefined}>Private handover</a>
    </nav></header>
    <RepositoryChat initialMode={mode} starter={starter}/></main></>;
}
