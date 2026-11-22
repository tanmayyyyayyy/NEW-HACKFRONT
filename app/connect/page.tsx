import { Mast } from "../Mast";
import { SetupPrompt } from "./SetupPrompt";
import styles from "./setup.module.css";
import { siteOrigin } from "@/lib/site-url";
import { isLoopback } from "@/lib/mcp-origin";

export const metadata = { title: "Connect a coding agent" };
export const dynamic = "force-dynamic";

export default function ConnectPage() {
  const origin = siteOrigin();
  const hosted = origin && !isLoopback(new URL(origin).hostname);
  return <><Mast /><main id="main-content" className={styles.page}>
    <a href="/workspace">← Workspace</a>
    <header>
      <h1>Connect a coding agent</h1>
      <p>Copy the setup prompt into your coding agent. It will register the SkillForge MCP bridge and run a test review.</p>
    </header>
    <ol className={styles.steps}>
      <li>Open SkillForge in your coding agent, or supply the checkout path below.</li>
      <li>Copy and paste the prompt to start setup. Approve the MCP server if your client asks.</li>
      <li>{hosted ? "The bridge uses this hosted deployment. No local web server is needed." : "Keep the local web app running, or enter your deployment URL below."}</li>
    </ol>
    <SetupPrompt defaultOrigin={origin} />
    <p className={styles.note}>Works with local MCP clients that support stdio, including Codex, Claude Code, Cursor, and VS Code. SkillForge’s MCP tools use public GitHub data.</p>
  </main></>;
}
