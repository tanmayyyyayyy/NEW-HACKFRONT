import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "skillforge-setup-check", version: "1.0.0" });
const script = new URL("./mcp.ts", import.meta.url);
const loader = new URL("../node_modules/tsx/dist/loader.mjs", script);
const origin = process.env.SKILLFORGE_URL || "http://localhost:3000";

try {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: ["--import", loader.href, fileURLToPath(script)],
    env: { SKILLFORGE_URL: origin },
    stderr: "inherit",
  }));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(),
    ["ask_repository", "list_open_pull_requests", "repository_graph", "review_pull_request"]);
  const result = await client.callTool({ name: "review_pull_request",
    arguments: { pullUrl: "https://github.com/AppFuton/Futon/pull/146" } });
  const reply = Array.isArray(result.content) ? result.content[0] : undefined;
  assert(reply?.type === "text" && typeof reply.text === "string", "SkillForge returned an unexpected MCP response.");
  assert(!result.isError, reply.text);
  const review = JSON.parse(reply.text);
  assert.equal(review.review.number, 146);
  assert(Array.isArray(review.evidence) && review.evidence.length > 0);
  console.log(`SkillForge MCP discovered four tools and reviewed Futon PR #146 with ${review.evidence.length} evidence records.`);
} finally {
  await client.close();
}
