import assert from "node:assert/strict";
import { POST } from "../app/api/ask/route";
import { driver } from "../lib/neo4j";

import { accounts } from "../lib/auth";
import { verifiedTestSession } from "./account-fixture";
let cookie = "";
const actualFetch = globalThis.fetch;
const originalPublicToken = process.env.GITHUB_PUBLIC_READ_TOKEN;
const server = "http://localhost:3000";
const ask = (question: string, settings = {}, token?: string) => POST(new Request(server + "/api/ask", {
  method: "POST",
  headers: { cookie, origin: server, "Content-Type": "application/json", ...(token && { authorization: "Bearer " + token }) },
  body: JSON.stringify({ mode: "public", repo: "AppFuton/Futon", language: "Hinglish", question, ...settings }),
}));

try {
  const account = await verifiedTestSession();
  const migrated = await (await ask("Why preserve reading statistics during source migration? Trace issue #127 and PR #138.")).json();
  assert(migrated.evidence?.some(({ record }: { record: { id: string } }) => record.id === "#138"));
  const updated = await (await ask("Why did PR #146 replace the chapter update behavior from PR #112?")).json();
  assert(updated.evidence?.flatMap((row: { links: { kind: string; from: string; to: string }[] }) => row.links)
    .some((link: { kind: string; from: string; to: string }) =>
      link.kind === "SUPERSEDES" && link.from === "#146" && link.to === "#112"));
  const follow = await (await ask("Who recorded this?", { contextIds: ["#112","#146"], throughDate: "2026-10-01" })).json();
  assert.deepEqual(follow.evidence.map((row: {record:{id:string}}) => row.record.id), ["#112"]);
  assert(follow.evidence[0].record.files.length > 0);
  assert.equal(follow.matchBasis,"Selected conversation sources");
  assert(!JSON.stringify(follow.evidence).includes('"#146"'));
  const beforeMerge = await (await ask("Why did #146 replace #112?", { throughDate: "2026-11-18" })).json();
  const proposal = beforeMerge.evidence.find(({ record }: { record: { id: string } }) => record.id === "#146");
  assert.equal(proposal.record.kind, "PR");
  assert.equal(proposal.record.date.slice(0, 10), "2026-11-16");
  assert(!proposal.links.some(({ kind }: { kind: string }) => kind === "SUPERSEDES"));
  assert.equal((await ask("Who recorded this?",{ throughDate:"2026-02-30" })).status,400);
  const unknown = await (await ask("Why does Futon use Kubernetes for billing?")).json();
  assert.equal(unknown.evidence?.length, 0);

  process.env.SARVAM_API_KEY = "fixture";
  let sentToSarvam = 0;
  let authorized = true;
  let publicRepositoryVisible = true;
  const publicHistoryRequests = new Map<string, number>();
  const publicToken = "fixture_public_token";
  process.env.GITHUB_PUBLIC_READ_TOKEN = publicToken;
  const privateToken = "github_pat_" + "fixture".repeat(4);
  const fileCommit = "a".repeat(40);
  const indexedFile = "src/read & write.ts";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.sarvam.ai") {
      sentToSarvam++;
      assert(!JSON.stringify(init).includes("fixture_read_token"));
      return Response.json({ choices: [{ message: { content: "Fixture explanation" } }] });
    }
    assert.equal(url.hostname, "api.github.com");
    const credential = new Headers(init?.headers).get("authorization");
    if (credential === "Bearer " + publicToken) {
      assert(url.pathname.startsWith("/repos/example/public"));
      if (url.pathname === "/repos/example/public") {
        return Response.json({ private: !publicRepositoryVisible, full_name: "example/public" });
      }
      publicHistoryRequests.set(url.pathname, (publicHistoryRequests.get(url.pathname) ?? 0) + 1);
    } else {
      if (!authorized || !(["Bearer fixture_read_token", "Bearer " + privateToken].includes(credential || ""))) return Response.json({}, { status: 404 });
      if (url.pathname === "/user") return Response.json({ id:15420,login:"private-fixture" });
      if (url.pathname === "/repos/example/public") return Response.json({ private:false, full_name:"example/public" });
      if (url.pathname === "/repos/example/internal") return Response.json({ private: true, full_name: "example/internal" });
    }
    if (url.pathname.endsWith("/commits") && url.searchParams.has("path")) {
      assert.equal(url.searchParams.get("path"), indexedFile);
      if (url.searchParams.has("until")) return Response.json([]);
      return Response.json([{ sha: fileCommit, author: { login: "fixture" }, commit: {
        message: "Change sync behavior", author: { date: "2025-01-02" },
      } }]);
    }
    if (url.pathname.endsWith("/pulls")) return Response.json([{
      number: 12, title: "Guard sync retries", body: "Prevent duplicate writes during sync retries.",
      user: { login: "fixture" }, created_at: "2025-01-01", merged_at: "2025-01-02",
    }]);
    return Response.json([]);
  };
  const publicPath = { repo: "example/public" };
  const publicQuestions = await Promise.all([
    ask("Why sync retries? Trace #12.", { ...publicPath, throughDate: "2025-01-01" }),
    ask("Why avoid duplicate writes in #12?", publicPath),
  ]);
  assert.equal(publicQuestions[0].status, 200);
  assert.equal(publicQuestions[1].status, 200);
  const publicProposal = (await publicQuestions[0].json()).evidence[0].record;
  assert.equal(publicProposal.kind, "PR");
  assert.equal(publicProposal.date, "2025-01-01");
  assert.equal((await publicQuestions[1].json()).evidence[0].record.kind, "Merged PR");
  assert.equal((await ask("Why sync retries? Trace #12.", publicPath)).status, 200);
  assert.equal(publicHistoryRequests.size, 5);
  assert([...publicHistoryRequests.values()].every(count => count === 1));
  const attached = await ask("What changed in this file?", { ...publicPath, files: [indexedFile] });
  assert.equal(attached.status, 200);
  const fileTrail = await attached.json();
  assert.equal(fileTrail.matchBasis, "Attached file history");
  assert.deepEqual(new Set(fileTrail.evidence.map(({ record }: { record: { id: string } }) => record.id)), new Set(["#12", fileCommit]));
  assert(fileTrail.evidence.every(({ record }: { record: { files: string[] } }) => record.files.includes(indexedFile)));
  const fileCutoff = await ask("What changed in this file?", { ...publicPath, files: [indexedFile], throughDate: "2025-01-01" });
  assert.deepEqual((await fileCutoff.json()).evidence, []);
  assert.equal((await ask("What changed in this file?", { ...publicPath, files: ["../invalid"] })).status, 400);
  publicRepositoryVisible = false;
  assert.equal((await ask("Why sync retries?", publicPath)).status, 403);

  const privatePath = { mode: "private", repo: "example/internal" };
  assert.equal((await ask("Why sync retries?", privatePath)).status, 401);
  const auth = await accounts();
  const connect = (repo:string, origin = server) => auth.handler(new Request(server + "/api/auth/private-repository", {
    method:"POST", headers:{ origin, "content-type":"application/json", authorization:"Bearer " + privateToken }, body:JSON.stringify({repository:repo}),
  }));
  assert.equal((await connect("example/public")).status,403);
  assert.equal((await connect("example/internal","https://other.example")).status,403);
  const first = await connect("example/internal");
  assert.equal(first.status,200);
  const identity = await first.json();
  assert(identity.userId);
  const repeat = await connect("example/internal");
  assert.equal((await repeat.json()).userId,identity.userId);
  cookie = first.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.equal((await ask("Why sync retries?",privatePath,privateToken)).status,200);
  cookie = account.cookie;
  assert.equal((await ask("Why sync retries?", privatePath, "wrong_fixture_token")).status, 403);
  const evidence = await (await ask("Why sync retries?", privatePath, "fixture_read_token")).json();
  assert.equal(evidence.evidence?.[0]?.record?.id, "#12");
  assert.equal(sentToSarvam, 0);
  const assisted = await (await ask("Why sync retries?", { ...privatePath, sarvam: true }, "fixture_read_token")).json();
  assert.equal(assisted.summary, "Fixture explanation");
  assert.equal(sentToSarvam, 1);
  authorized = false;
  assert.equal((await ask("Why sync retries?", { ...privatePath, files: [indexedFile] }, "fixture_read_token")).status, 403);
  await account.revoke();
  assert.equal((await ask("Why sync retries?", privatePath, "fixture_read_token")).status, 401);
  const saved = await driver.executeQuery("MATCH (r:SkillForgeChatRun) RETURN count(r) AS count");
  assert.equal(saved.records[0].get("count").toNumber(), 0);
  console.log("Public citations, cutoff, overrides, caching, abstention, private authorization/revocation, Sarvam opt-in and rollback passed.");
} finally {
  globalThis.fetch = actualFetch;
  if (originalPublicToken === undefined) delete process.env.GITHUB_PUBLIC_READ_TOKEN;
  else process.env.GITHUB_PUBLIC_READ_TOKEN = originalPublicToken;
  await driver.close();
}
