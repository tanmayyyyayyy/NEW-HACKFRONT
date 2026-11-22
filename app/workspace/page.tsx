import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { accounts } from "@/lib/auth";
import { RepositoryChat } from "../RepositoryChat";
import { Mast } from "../Mast";
import { collections } from "../collections";
import styles from "./chat.module.css";
export const metadata = { title: "Repository explorer", robots: { index: false, follow: true } };
export default async function Workspace({ searchParams }: { searchParams: Promise<{ path?: string; example?: string; repo?: string | string[] }> }) {
  const params = await searchParams;
  const mode = params.path === "private" ? "private" : "public";
  if (mode === "private") {
    const incoming = await headers();
    const session = incoming.has("cookie") && await accounts()
      .then(auth => auth.api.getSession({ headers: incoming }))
      .catch(() => null);
    if (!session) redirect("/account?path=private");
  }
  const example = mode === "public" ? collections.find(item => item.slug === params.example) : undefined;
  const repo = (Array.isArray(params.repo) ? params.repo[0] : params.repo)?.slice(0, 170) ?? "";
  const starter = example?.workspaceQuestion ? { repo: example.repo, question: example.workspaceQuestion } : { repo, question: "" };
  return <><Mast current="workspace"/><main className={styles.workspace} id="main-content"><header className={styles.header}>
    <h1>{mode === "private" ? "Team handover" : "Repository explorer"}</h1>
    <nav className="workspace-modes" aria-label="Workspace mode">
      <a href="/workspace" aria-current={mode === "public" ? "page" : undefined}>Public repository</a>
      <a href="/workspace?path=private" aria-current={mode === "private" ? "page" : undefined}>Private handover</a>
    </nav></header>
    <RepositoryChat initialMode={mode} starter={starter}/></main></>;
}
