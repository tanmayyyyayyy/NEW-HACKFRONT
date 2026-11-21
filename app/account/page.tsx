import { loginMethods } from "@/lib/auth";
import { AccountForm } from "./AccountForm";
import { Mast } from "../Mast";
export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace access", robots: { index: false, follow: true } };
export default async function Account({ searchParams }: {searchParams: Promise<{path?:string}>}) {
  const path = (await searchParams).path;
  return <><Mast current="account"/><main className="access-layout" id="main-content"><div className="access-heading"><h1>Choose your<br/><em>workspace.</em></h1>
    <p>Pick up a team handover or learn from an open-source project. Each workspace opens with the tools for that job.</p></div>
    <div className="account"><AccountForm initialPath={path === "public" ? "public" : "private"} methods={loginMethods()} /></div></main></>;
}
