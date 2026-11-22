"use client";

import { useRef, useState } from "react";
import styles from "./setup.module.css";
import { isLoopback, mcpOrigin } from "@/lib/mcp-origin";

function setupPrompt(checkout: string, origin: string) {
  const local = isLoopback(new URL(origin).hostname);
  const startup = local
    ? "If the app is stopped, use npm start from the checkout and keep it running. If a different app owns the port, leave it running and ask for the SkillForge origin."
    : "If the host is waking up, wait and retry the health check. Use the hosted backend for every call. Do not start a local web server or copy any server credentials.";
  return `Set up the SkillForge MCP server in this coding agent and verify it. I authorize adding or updating the single "skillforge" MCP entry${local ? " and starting my local SkillForge app" : ""}. Perform the steps yourself and report the result.

${checkout ? "Checkout path (literal value): " + JSON.stringify(checkout) + "\n" : ""}SkillForge app origin (literal value): ${JSON.stringify(origin)}

1. Check this agent's settings for an existing skillforge MCP entry. Try the supplied checkout path, the checkout containing that entry's scripts/mcp.ts, or the current repository root. Confirm that the selected directory has the SkillForge package.json and scripts/mcp.ts. For HTTPS, also confirm that the bridge supports hosted origins. If the checkout is missing or still uses the loopback-only bridge, ask for the path to an updated checkout. Run npm ci there only if dependencies are missing. Use the project's documented Node.js version or a compatible newer version.
2. Verify that GET /api/health at the supplied app origin responds with service "skillforge". ${startup} The bundled test PR works even when Neo4j is disconnected.
3. Register a stdio server named skillforge that runs in the agent's environment. Use the absolute Node.js executable as the command. Set its arguments to three separate values: --import, the file URL for <checkout>/node_modules/tsx/dist/loader.mjs, and the absolute path to <checkout>/scripts/mcp.ts. Generate the loader URL with Node's pathToFileURL so spaces and Windows paths work. Set SKILLFORGE_URL to the verified app origin. If an existing entry runs this same SkillForge bridge, update its origin as needed. If the entry runs a different program, ask before replacing it. Preserve other MCP settings and keep tokens out of the configuration.
4. Configure the current agent only. For Codex, use codex mcp get skillforge and register with codex mcp add skillforge --env SKILLFORGE_URL=<origin> -- <node> --import <loader-file-url> <script>. For Claude Code, use claude mcp get skillforge and claude mcp add --env SKILLFORGE_URL=<origin> --transport stdio --scope local skillforge -- <node> --import <loader-file-url> <script>. For Cursor, merge the entry into ~/.cursor/mcp.json under mcpServers. For VS Code, use code --add-mcp with a JSON stdio entry (name, type, command, args, env). For another client, use its documented stdio setup. The app origin is the bridge's backend, not a remote MCP endpoint. If the agent cannot launch a stdio server, report that limitation.
5. In the checkout, run npm run check:mcp against the same SKILLFORGE_URL to check discovery and the bundled Futon PR #146. Then use the client's MCP tool list to confirm skillforge exposes ask_repository, review_pull_request, list_open_pull_requests, and repository_graph. If it can invoke tools now, call review_pull_request for https://github.com/AppFuton/Futon/pull/146. If a reload, trust prompt, or new chat is genuinely required, explain exactly what I need to do and what you already verified. Only say the agent is connected after it can discover the server.`;
}

export function SetupPrompt({ defaultOrigin }: { defaultOrigin?: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [notice, setNotice] = useState("");
  const [checkout, setCheckout] = useState("");
  const [address, setAddress] = useState(mcpOrigin(defaultOrigin ?? "") ?? "http://localhost:3000");
  const origin = mcpOrigin(address.trim());
  const prompt = origin ? setupPrompt(checkout.trim(), origin) : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice("Setup prompt copied.");
    } catch {
      field.current?.focus();
      field.current?.select();
      setNotice("Prompt selected. Press Ctrl+C or Command+C to copy it.");
    }
  }
  return <section className={styles.prompt}>
    <details className={styles.settings}>
      <summary>Using a different checkout or SkillForge URL?</summary>
      <label>SkillForge checkout path
        <input value={checkout} maxLength={500} placeholder="Optional absolute path"
          onChange={event => { setCheckout(event.target.value); setNotice(""); }} />
      </label>
      <label>SkillForge URL
        <input type="url" value={address} aria-invalid={!origin} maxLength={150}
          onChange={event => { setAddress(event.target.value); setNotice(""); }} />
      </label>
      {!origin && <p role="alert">Enter an HTTPS deployment URL or a localhost address.</p>}
    </details>
    <div className={styles.toolbar}>
      <label htmlFor="mcp-setup-prompt">Setup prompt</label>
      <button className="action" type="button" disabled={!origin} onClick={() => void copy()}>Copy setup prompt</button>
    </div>
    <textarea id="mcp-setup-prompt" ref={field} value={prompt} readOnly spellCheck={false} rows={12} />
    <p className={styles.status} role="status">{notice}</p>
  </section>;
}
