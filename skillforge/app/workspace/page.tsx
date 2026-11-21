import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { accounts } from "@/lib/auth";
import { RepositoryChat } from "../RepositoryChat";
import { Mast } from "../Mast";
import { collections } from "../collections";
export default async function Workspace({ searchParams }: { searchParams: Promise<{ path?: string; example?: string }> }) {
  const params = await searchParams;
  const mode = params.path === "private" ? "private" : "public";
  if (mode === "private") {
    const incoming = await headers();
    const session = incoming.has("cookie") && await (await accounts()).api.getSession({headers: incoming}).catch(() => null);
    if (!session) redirect("/account?path=private");
  }
  const example = mode === "public" ? collections.find(item => item.slug === params.example) : undefined;
  return <><Mast/><main className="sf-shell"><div className="section-title"><h1>{mode === "private" ? "Team handover" : "Repository explorer"}</h1>
    <p>{mode === "private" ? "Trace the decisions behind a service you’re taking over." : "Investigate a change, follow the discussion and keep the sources."}</p></div>
    <RepositoryChat initialMode={mode} starter={example?.question}/></main></>;
}
