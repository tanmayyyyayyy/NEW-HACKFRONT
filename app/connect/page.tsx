import { Mast } from "../Mast";
import { SetupPrompt } from "./SetupPrompt";
import styles from "./setup.module.css";
import { siteOrigin } from "@/lib/site-url";

export const metadata = { title: "Connect a coding agent" };

export default function ConnectPage() {
  return <><Mast /><main id="main-content" className={styles.page}>
    <a href="/workspace">← Workspace</a>
    <header>
      <h1>Connect a coding agent</h1>
      <p>Copy the setup prompt into your coding agent. It will register SkillForge’s MCP server and run a test review on your machine.</p>
    </header>
    <ol className={styles.steps}>
      <li>Open SkillForge in your coding agent, or supply the checkout path below.</li>
      <li>Copy and paste the prompt to start setup. Approve the MCP server if your client asks.</li>
      <li>Keep SkillForge running while you use the tools.</li>
    </ol>
    <SetupPrompt defaultOrigin={siteOrigin()} />
    <p className={styles.note}>Works with local MCP clients that support stdio, including Codex, Claude Code, Cursor, and VS Code. SkillForge’s MCP tools use public GitHub data.</p>
  </main></>;
}
