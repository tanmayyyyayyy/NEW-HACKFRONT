import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { POST } from "../app/api/ask/route";
import { POST as transcribe } from "../app/api/transcribe/route";
import { matchesAppOrigin } from "../lib/app-origin";
import { configuredAppUrl, siteOrigin } from "../lib/site-url";
import { explainEvidence } from "../lib/answer-explanation";
import { driver } from "../lib/neo4j";

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
