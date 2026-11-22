import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { POST } from "../app/api/ask/route";
import { POST as transcribe } from "../app/api/transcribe/route";
import { matchesAppOrigin } from "../lib/app-origin";
import { configuredAppUrl, siteOrigin } from "../lib/site-url";
import { explainEvidence } from "../lib/answer-explanation";
import { driver } from "../lib/neo4j";
import { pullSnippet, repositorySnippets } from "../lib/code-evidence";
import { requestGithub } from "../lib/repository-chat";
import { sourceFromMessage } from "../lib/code-types";
import { mcpOrigin } from "../lib/mcp-origin";

test("MCP accepts hosted HTTPS and local HTTP origins", () => {
  assert.equal(mcpOrigin("https://skillforge-repository-desk.onrender.com/"), "https://skillforge-repository-desk.onrender.com");
  assert.equal(mcpOrigin("http://localhost:3000"), "http://localhost:3000");
  assert.equal(mcpOrigin("http://[::1]:3000"), "http://[::1]:3000");
  for (const url of ["http://skillforge.example", "https://skillforge.example/api", "https://user@skillforge.example",
    "https://skillforge.example/?token=x", "https://skillforge.example/#fragment", "file:///server"]) {
    assert.equal(mcpOrigin(url), undefined);
  }
});
import { POST as graph } from "../app/api/graph/route";

test("open pull requests use GitHub's open filter and validate access before listing", async t => {
  config(t, { APP_ORIGIN: "http://localhost:3000", GITHUB_PUBLIC_READ_TOKEN: undefined });
  const pages: string[] = [];
  const fetch = t.mock.method(globalThis, "fetch", async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/repos/example/ui") return Response.json({ full_name: "example/ui", private: false });
    assert.equal(url.pathname, "/repos/example/ui/pulls");
    assert.equal(url.searchParams.get("state"), "open");
    pages.push(url.searchParams.get("page")!);
    return Response.json([{ number: 42, title: "Update button", draft: true, user: { login: "author" }, updated_at: "2026-11-22" }]);
  });
  const list = (mode: string) => graph(new Request(`http://localhost:3000/api/graph?repo=example%2Fui&view=open-pulls&page=2&mode=${mode}`,
    { method: "POST", headers: { origin: "http://localhost:3000" } }));
  assert.equal((await list("private")).status, 401);
  assert.equal(fetch.mock.callCount(), 0);
  const response = await list("public");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { pulls: [{ number: 42, title: "Update button", draft: true, author: "author", updated: "2026-11-22" }], hasNext: false });
  const inChat = await POST(new Request("http://localhost:3000/api/ask", {
    method: "POST", headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ repo: "example/ui", question: "What pull requests are open?", mode: "public", language: "English" }),
  }));
  assert.equal(inChat.status, 200);
  assert.equal((await inChat.json()).openPulls.pulls[0].number, 42);
  assert.deepEqual(pages, ["2", "1"]);
});

test("chat recognizes bare GitHub links and preserves a question alongside a PR link", () => {
  assert.deepEqual(sourceFromMessage("https://github.com/example/ui"), { source: "example/ui", question: "" });
  assert.deepEqual(sourceFromMessage("Why did the color change? https://github.com/example/ui/pull/9/files"),
    { source: "https://github.com/example/ui/pull/9", question: "Why did the color change?" });
  assert.equal(sourceFromMessage("https://other.example/example/ui/pull/9"), null);
});

test("GitHub rate limits give a retry time and suggest a token for anonymous requests", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 403, headers: {
    "x-ratelimit-remaining": "0", "retry-after": "120",
  } }));
  await assert.rejects(requestGithub("/rate_limit"), { status: 429, message: /about 2 minutes.*GITHUB_PUBLIC_READ_TOKEN/ });
  await assert.rejects(requestGithub("/rate_limit", "fixture"), { status: 429, message: /about 2 minutes\.$/ });
});

const record = {
  id: "#146", kind: "Merged PR", title: "Wait for chapter refresh", text: "a".repeat(2000),
  author: "fixture", date: "2026-11-19", url: "https://github.com/example/repo/pull/146",
  files: ["pref_reader.xml"],
};
const links = [{ from: "#146", to: "#112", kind: "SUPERSEDES", basis: "Setting removed",
  record: { ...record, id: "#112" } }];
const evidence = [{ record, links }];

test("recorded dictation posts bounded audio to Sarvam and verifies the request origin", async t => {
  config(t, { APP_ORIGIN: "http://localhost:3000", SARVAM_API_KEY: "sarvam-fixture" });
  const fetch = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.sarvam.ai/speech-to-text");
    assert.equal(new Headers(init.headers).get("api-subscription-key"), "sarvam-fixture");
    const form = init.body as FormData;
    assert.equal(form.get("model"), "saaras:v4");
    assert.equal(form.get("mode"), "codemix");
    assert.equal(form.get("language_code"), "unknown");
    const file = form.get("file") as File;
    assert.equal(file.type, "audio/webm");
    assert.equal(file.size, 3);
    return Response.json({ transcript: " How does smart resume work? " });
  });
  const send = (origin: string, body: Uint8Array<ArrayBuffer>, mime = "audio/webm") => transcribe(new Request(
    "http://localhost:3000/api/transcribe?language=Hinglish", { method: "POST", headers: { origin, "Content-Type": mime }, body },
  ));
  assert.equal((await send("https://untrusted.example", new Uint8Array(3))).status, 403);
  assert.equal((await send("http://localhost:3000", new Uint8Array(3), "text/plain")).status, 415);
  assert.equal((await send("http://localhost:3000", new Uint8Array(769 * 1024))).status, 413);
  assert.equal(fetch.mock.callCount(), 0);
  const response = await send("http://localhost:3000", new Uint8Array(3));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { transcript: "How does smart resume work?" });
  assert.equal(fetch.mock.callCount(), 1);
});

function completion(content: string, reason = "stop") {
  return Response.json({ choices: [{ finish_reason: reason, message: { content } }] });
}

function config(t: TestContext, settings: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(settings)) {
    const original = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    t.after(() => {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    });
  }
}

test("loopback aliases match the configured scheme and port, hosted origins match exactly", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert(matchesAppOrigin("http://" + host + ":3000", "http://localhost:3000/"));
  }
  for (const origin of [null, "null", "https://localhost:3000", "http://localhost:3001", "http://localhost.evil.test:3000"]) {
    assert(!matchesAppOrigin(origin, "http://localhost:3000"));
  }
  assert(matchesAppOrigin("https://skillforge.example", "https://skillforge.example/"));
  assert(!matchesAppOrigin("http://localhost:3000", "https://skillforge.example"));
});

test("Sarvam receives bounded cited evidence and OpenRouter is skipped on success", async t => {
  config(t, { SARVAM_API_KEY: "sarvam-fixture", OPEN_ROUTER_API_KEY: "router-fixture" });
  const fetch = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.sarvam.ai/v1/chat/completions");
    assert.equal(new Headers(init.headers).get("api-subscription-key"), "sarvam-fixture");
    assert.equal(new Headers(init.headers).has("authorization"), false);
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, "sarvam-105b");
    assert.match(body.messages[0].content, /Hinglish/);
    const context = JSON.parse(body.messages[1].content);
    assert.equal(context.evidence[0].excerpt.length, 1200);
    assert.equal(context.evidence[0].links[0].source.id, "#112");
    assert.equal(context.evidence[0].links[0].source.excerpt.length, 400);
    return completion("  #146 updated the default.  ");
  });
  assert.deepEqual(await explainEvidence("Hinglish", "Why did this change?", evidence),
    { status: "ready", summary: "#146 updated the default.", provider: "Sarvam" });
  assert.equal(fetch.mock.callCount(), 1);
});

test("OpenRouter handles Sarvam HTTP, network, malformed, empty, and truncated responses", async t => {
  config(t, { SARVAM_API_KEY: "sarvam-fixture", OPEN_ROUTER_API_KEY: "router-fixture" });
  for (const fail of [
    () => new Response(null, { status: 401 }),
    () => new Response(null, { status: 429 }),
    () => { throw new DOMException("timed out", "TimeoutError"); },
    () => new Response("malformed"),
    () => completion("   "),
    () => completion("Partial output", "length"),
  ]) {
    const calls: string[] = [];
    const fetch = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      calls.push(new URL(url).hostname);
      if (url.startsWith("https://api.sarvam.ai/")) return fail();
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer router-fixture");
      assert.equal(new Headers(init.headers).has("api-subscription-key"), false);
      const body = JSON.parse(String(init.body));
      assert.equal(body.model, "openai/gpt-4.1-mini");
      assert.match(body.messages[0].content, /Hindi/);
      return completion("Fallback answer.");
    });
    try {
      assert.deepEqual(await explainEvidence("Hindi", "Why?", evidence),
        { status: "ready", summary: "Fallback answer.", provider: "OpenRouter" });
      assert.deepEqual(calls, ["api.sarvam.ai", "openrouter.ai"]);
    } finally { fetch.mock.restore(); }
  }
});

test("missing keys and empty evidence skip outbound calls", async t => {
  config(t, { SARVAM_API_KEY: undefined, OPEN_ROUTER_API_KEY: undefined });
  const fetch = t.mock.method(globalThis, "fetch");
  assert.equal((await explainEvidence("English", "Why?", [])).status, "no-evidence");
  assert.equal((await explainEvidence("English", "Why?", evidence)).status, "not-configured");
  assert.equal(fetch.mock.callCount(), 0);
});

test("ask route preserves evidence on provider failures and requires consent for outbound calls", async t => {
  config(t, { APP_ORIGIN: "http://localhost:3000", SARVAM_API_KEY: "sarvam-fixture", OPEN_ROUTER_API_KEY: "router-fixture" });
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  let hasEvidence = true;
  const tx = {
    run: async (query: string) => ({ records: query.startsWith("CREATE")
      ? [{ get: () => "fixture-scope" }]
      : query.includes("RETURN properties(r)") && hasEvidence
        ? [{ get: (key: string) => key === "record" ? record : links }]
        : [] }),
    rollback: async () => {},
  };
  t.mock.method(driver, "session", () => ({ beginTransaction: () => tx, close: async () => {} }));
  const ask = (sarvam: boolean, origin = "http://127.0.0.1:3000") => POST(new Request("http://localhost:3000/api/ask", {
    method: "POST", headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Why did PR #146 change?", repo: "AppFuton/Futon", mode: "public", language: "English", sarvam }),
  }));
  assert.equal((await ask(true, "http://localhost:3001")).status, 403);
  const evidenceOnly = await ask(false);
  assert.equal(evidenceOnly.status, 200);
  assert.equal((await evidenceOnly.json()).explanationStatus, null);
  assert.equal(fetch.mock.callCount(), 0);
  hasEvidence = false;
  assert.equal((await (await ask(true)).json()).explanationStatus, "no-evidence");
  assert.equal(fetch.mock.callCount(), 0);
  hasEvidence = true;
  const unavailable = await ask(true);
  assert.equal(unavailable.status, 200);
  const payload = await unavailable.json();
  assert.equal(payload.explanationStatus, "unavailable");
  assert.equal(payload.summary, null);
  assert.equal(payload.evidence[0].record.id, "#146");
  assert.equal(fetch.mock.callCount(), 2);
});


test("Render falls back to its public origin while preserving explicit configuration and strict origin checks", t => {
  config(t, { APP_ORIGIN: undefined, RENDER_EXTERNAL_URL: "https://skillforge.onrender.com/", RENDER_EXTERNAL_HOSTNAME: "fallback.onrender.com" });
  assert.equal(siteOrigin(), "https://skillforge.onrender.com");
  assert(matchesAppOrigin("https://skillforge.onrender.com", configuredAppUrl()));
  assert(!matchesAppOrigin(null, configuredAppUrl()));
  assert(!matchesAppOrigin("https://unexpected.example", configuredAppUrl()));
  delete process.env.RENDER_EXTERNAL_URL;
  assert.equal(siteOrigin(), "https://fallback.onrender.com");
  process.env.APP_ORIGIN = "https://custom.example";
  assert.equal(siteOrigin(), "https://custom.example");
  assert(!matchesAppOrigin("https://fallback.onrender.com", configuredAppUrl()));
});

test("repository code uses actual lines and pins the GitHub citation to the selected revision", async t => {
  const sha = "b".repeat(40);
  const blob = "c".repeat(40);
  const path = "src/theme & tokens.css";
  const fetch = t.mock.method(globalThis, "fetch", async (input: string) => {
    const { pathname, searchParams } = new URL(input);
    if (pathname === "/repos/example/ui") return Response.json({ full_name: "example/ui", private: false, default_branch: "main" });
    if (pathname.endsWith("/commits/main")) return Response.json({ sha });
    if (pathname.endsWith("/commits")) {
      assert.equal(searchParams.get("until"), "2026-11-01T23:59:59Z");
      return Response.json([{ sha }]);
    }
    if (pathname.endsWith("/git/trees/" + sha)) return Response.json({ tree: [
      { path, mode: "100644", type: "blob", sha: blob, size: 65 },
      { path: ".env.local", mode: "100644", type: "blob", sha: blob, size: 65 },
      { path: "shortcut.css", mode: "120000", type: "blob", sha: blob, size: 65 },
    ] });
    assert(pathname.endsWith("/git/blobs/" + blob));
    return Response.json({ encoding: "base64", content: Buffer.from(":root {\n  --button-color: red;\n}").toString("base64") });
  });
  const [snippet, extra] = await repositorySnippets("example/ui", "public", "Where is the button color?", [path, ".env.local", "shortcut.css"], []);
  assert.equal(extra, undefined);
  assert.deepEqual(snippet.lines[1], { line: 2, text: "  --button-color: red;" });
  assert.equal(snippet.url, `https://github.com/example/ui/blob/${sha}/src/theme%20%26%20tokens.css#L1-L3`);
  assert.equal(snippet.editUrl, "https://github.com/example/ui/edit/main/src/theme%20%26%20tokens.css");
  assert.equal(fetch.mock.callCount(), 4);
  const [historical] = await repositorySnippets("example/ui", "public", "Where is the button color?", [path], [], "2026-11-01");
  assert.equal(historical.editUrl, undefined);
});

test("PR chat pairs the numbered diff with earlier decisions and edits the PR head fork", async t => {
  config(t, { APP_ORIGIN: "http://localhost:3000", GITHUB_PUBLIC_READ_TOKEN: undefined });
  const sha = "a".repeat(40);
  const path = "src/button.css";
  const patch = "@@ -15,3 +15,3 @@\n .button {\n-  background: red;\n+  background: green;\n }";
  const old = { number: 7, title: "Record the button colors", body: "Use the blue draft.", created_at: "2026-10-01", merged_at: "2026-10-02" };
  const reversal = { number: 8, title: "Replaces #7", body: "Keep the primary button background red.", created_at: "2026-10-03", merged_at: "2026-10-04" };
  const target = { number: 9, title: "Update the primary button", body: "Switch it to green.", created_at: "2026-10-05", state: "open",
    base: { repo: { full_name: "example/ui", private: false } }, head: { sha, ref: "fix/button", repo: { full_name: "contributor/ui" } } };
  const fetch = t.mock.method(globalThis, "fetch", async (input: string) => {
    const { pathname } = new URL(input);
    if (pathname === "/repos/example/ui/pulls/9") return Response.json(target);
    if (pathname === "/repos/example/ui/pulls") return Response.json([reversal, old]);
    if (pathname.endsWith("/files")) return Response.json([{ filename: path, patch, status: "modified" }]);
    throw new Error("Unexpected fixture request");
  });
  const ask = (repo: string, mode = "public") => POST(new Request("http://localhost:3000/api/ask", {
    method: "POST", headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ repo, question: "Why was the button background changed to green?", mode, language: "English" }),
  }));
  assert.equal((await ask("https://github.com/example/ui/pull/9", "private")).status, 401);
  assert.equal((await ask("https://example.test/example/ui/pull/9")).status, 400);
  assert.equal(fetch.mock.callCount(), 0);
  const result = await ask("https://github.com/example/ui/pull/9/files#diff-reference");
  assert.equal(result.status, 200);
  const answer = await result.json();
  assert.match(answer.evidence.find((row: typeof evidence[number]) => row.record.id === "#8").record.text, /background red/);
  assert.deepEqual(answer.snippets[0].lines.slice(1, 3), [
    { old: 16, text: "  background: red;", change: "removed" },
    { line: 16, text: "  background: green;", change: "added" },
  ]);
  assert.equal(answer.snippets[0].url, `https://github.com/contributor/ui/blob/${sha}/src/button.css#L15-L17`);
  assert.equal(answer.snippets[0].editUrl, "https://github.com/contributor/ui/edit/fix/button/src/button.css");
  const removed = pullSnippet("example/ui", 9, path, "@@ -5 +0,0 @@\n-red", undefined, false);
  assert.match(removed?.url ?? "", /\/files#diff-[a-f0-9]{64}L5$/);
  assert.equal(removed?.editUrl, undefined);
});
