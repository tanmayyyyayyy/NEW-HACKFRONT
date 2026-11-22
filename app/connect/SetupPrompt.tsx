"use client";

import { useRef, useState } from "react";
import styles from "./setup.module.css";

function setupPrompt(checkout: string, origin: string) {
  return `Set up the SkillForge MCP server in this coding agent and verify it. I authorize adding the single "skillforge" MCP entry and starting my local SkillForge app. Perform the steps yourself and report the result.

${checkout ? "Local checkout path (literal value): " + JSON.stringify(checkout) + "\n" : ""}Local app origin (literal value): ${JSON.stringify(origin)}

1. Check this agent's settings for an existing skillforge MCP entry. Try the supplied checkout path, the directory of that entry's scripts/mcp.ts, or the current repository root. Confirm that the selected directory has the SkillForge package.json and scripts/mcp.ts. Ask for the path only if those checks fail. Run npm ci there only if the required dependencies are missing. Use the project's documented Node.js version or a compatible newer version.
2. Verify that GET /api/health at the local app origin responds with service "skillforge". If the app is stopped, use npm start from the checkout and keep it running. If a different app owns the port, leave it running and ask for the SkillForge origin. The bundled test PR works even when Neo4j is disconnected.
3. Register a local stdio server named skillforge. Use the absolute Node.js executable as the command. Set its arguments to these three separate values: --import, the file URL for <checkout>/node_modules/tsx/dist/loader.mjs, and the absolute path to <checkout>/scripts/mcp.ts. Generate the loader URL with Node's pathToFileURL so spaces and Windows paths work. Set SKILLFORGE_URL to the verified loopback origin. Keep other MCP entries and settings intact. Reuse an existing working skillforge entry; if that name points somewhere else, show me the mismatch before replacing it. Never copy tokens or credentials into MCP settings.
4. Use the current agent's MCP configuration, not another agent's. For Codex, use codex mcp get skillforge and, if absent, codex mcp add skillforge --env SKILLFORGE_URL=<origin> -- <node> --import <loader-file-url> <script>. For Claude Code, use claude mcp get skillforge and claude mcp add --env SKILLFORGE_URL=<origin> --transport stdio --scope local skillforge -- <node> --import <loader-file-url> <script>. For Cursor, merge the entry into the local user's ~/.cursor/mcp.json under mcpServers. For VS Code, use code --add-mcp with a JSON stdio entry (name, type, command, args, env). For another client, find its documented local stdio setup. If the agent runs remotely or cannot start local MCP servers, explain that limitation and stop.
5. In the checkout, run npm run check:mcp against the same SKILLFORGE_URL to check discovery and the bundled Futon PR #146. Then use the client's MCP tool list to confirm skillforge exposes ask_repository, review_pull_request, list_open_pull_requests, and repository_graph. If it can invoke tools now, call review_pull_request for https://github.com/AppFuton/Futon/pull/146. If a reload, trust prompt, or new chat is genuinely required, explain exactly what I need to do and what you already verified. Only say the agent is connected after it can discover the server.`;
}

function loopbackOrigin(value: string) {
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash) return url.origin;
  } catch { /* A partially entered URL is expected while typing. */ }
  return undefined;
}

export function SetupPrompt({ defaultOrigin }: { defaultOrigin?: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [notice, setNotice] = useState("");
  const [checkout, setCheckout] = useState("");
  const [address, setAddress] = useState(loopbackOrigin(defaultOrigin ?? "") ?? "http://localhost:3000");
  const origin = loopbackOrigin(address.trim());
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
      <summary>Using a different project or local port?</summary>
      <label>SkillForge checkout path
        <input value={checkout} maxLength={500} placeholder="Optional absolute path"
          onChange={event => { setCheckout(event.target.value); setNotice(""); }} />
      </label>
      <label>Local SkillForge URL
        <input type="url" value={address} aria-invalid={!origin} maxLength={150}
          onChange={event => { setAddress(event.target.value); setNotice(""); }} />
      </label>
      {!origin && <p role="alert">Enter a local address such as http://localhost:3000.</p>}
    </details>
    <div className={styles.toolbar}>
      <label htmlFor="mcp-setup-prompt">Setup prompt</label>
      <button className="action" type="button" disabled={!origin} onClick={() => void copy()}>Copy setup prompt</button>
    </div>
    <textarea id="mcp-setup-prompt" ref={field} value={prompt} readOnly spellCheck={false} rows={12} />
    <p className={styles.status} role="status">{notice}</p>
  </section>;
}
