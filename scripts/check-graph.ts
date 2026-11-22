import assert from "node:assert/strict";
import { test } from "node:test";
import { graphModel, importSpecifiers } from "../lib/graph-model";
import { driver } from "../lib/neo4j";
import { readRepositoryGraph } from "../lib/repository-graph";
import type { RepositoryGraph } from "../lib/graph-types";

test("maps folders and common module imports to distinct graph relationships", () => {
  const model = graphModel({
    repository: "fixture", revision: "fixture-revision", indexedAt: "2026-11-22", nodes: [], edges: [],
    coverage: { files: 0, importFiles: 0, treePartial: false, historyPartial: false },
  });
  model.file("src/main.ts");
  model.file("src/dev.ts");
  model.file("src/config/index.ts");
  model.imports("src/main.ts", importSpecifiers(`
    // import unknown from "comment-example"
    import { trace } from "./dev.js";
    import type { Config } from "@/config";
    export { helper } from "@scope/pkg/submodule";
    const fs = require("node:fs");
  `));
  const { edges, coverage } = model.finish();
  assert(edges.some(edge => edge.from === "folder:src" && edge.to === "file:src/main.ts" && edge.kind === "CONTAINS"));
  const imports = edges.filter(edge => edge.kind === "IMPORTS").map(edge => edge.to).sort();
  assert.deepEqual(imports, ["file:src/config/index.ts", "file:src/dev.ts", "package:@scope/pkg", "package:node:fs"]);
  assert.equal(coverage.files, 3);
  assert.equal(coverage.importFiles, 1);
});

test("indexes GitHub PR decisions and commits and reuses the stored Neo4j snapshot", async t => {
  const newest = "a".repeat(40);
  const earlier = "b".repeat(40);
  const blob = "c".repeat(40);
  const commit = { sha: newest, commit: { message: "Follow-up to #4" }, parents: [{ sha: earlier }] };
  const prefix = "/repos/example/repo";
  const calls: string[] = [];
  let saved: RepositoryGraph | undefined;
  const writes: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const url = new URL(input);
    const path = url.pathname + url.search;
    calls.push(path);
    assert.equal(url.origin, "https://api.github.com");
    if (path === prefix) return Response.json({ private: false, default_branch: "main", full_name: "example/repo" });
    if (path === prefix + "/commits/main") return Response.json({ sha: newest });
    if (url.pathname === prefix + "/git/trees/" + newest) return Response.json({ truncated: false, tree: [
      { type: "blob", path: "src/index.ts", sha: blob, size: 80 },
    ] });
    if (url.pathname === prefix + "/git/blobs/" + blob) {
      return Response.json({ encoding: "base64", content: Buffer.from('import "react";').toString("base64") });
    }
    if (url.pathname === prefix + "/commits") return Response.json([commit, { sha: earlier, commit: { message: "Original approach" } }]);
    if (url.pathname === prefix + "/pulls") return Response.json([
      { number: 8, title: "Replaces #4", body: null, merge_commit_sha: newest, merged_at: "2026-11-22" },
      { number: 4, title: "Original change", body: null, merge_commit_sha: earlier, merged_at: "2026-11-21" },
      { number: 9, title: "Changes the default", body: "See #4 for build instructions.", merge_commit_sha: null, merged_at: "2026-11-23" },
    ]);
    if (url.pathname === prefix + "/pulls/8/files") return Response.json([{ filename: "src/index.ts" }]);
    if (url.pathname === prefix + "/pulls/8/commits") return Response.json([commit]);
    if ([prefix + "/pulls/4/commits", prefix + "/pulls/9/commits"].includes(url.pathname)) return Response.json([]);
    return new Response(null, { status: 500 });
  });
  t.mock.method(driver, "executeQuery", async () => ({ records: saved ? [{ get: () => JSON.stringify(saved) }] : [] }));
  t.mock.method(driver, "session", () => ({
    close: async () => {},
    executeWrite: async (work: (tx: { run: (query: string, params: Record<string, unknown>) => Promise<void> }) => Promise<void>) => {
      await work({ run: async (query, params) => {
        writes.push(query);
        if (typeof params.snapshot === "string") saved = JSON.parse(params.snapshot);
      } });
    },
  }));
  const indexed = await readRepositoryGraph("example/repo", "public", "");
  assert(indexed.edges.some(edge => edge.from === "pull:8" && edge.to === "pull:4" && edge.kind === "SUPERSEDES"));
  assert(indexed.edges.some(edge => edge.from === "pull:9" && edge.to === "pull:4" && edge.kind === "REFERENCES"));
  assert(!indexed.edges.some(edge => edge.from === "pull:9" && edge.kind === "SUPERSEDES"));
  assert(indexed.edges.some(edge => edge.from === "pull:8" && edge.to === "commit:" + newest && edge.kind === "INCLUDES"));
  assert(indexed.edges.some(edge => edge.from === "commit:" + newest && edge.to === "commit:" + earlier && edge.kind === "PARENT"));
  assert(writes.some(query => query.includes("GRAPH_EDGE")));
  assert.equal(indexed.coverage.importFiles, 1);
  assert.equal(indexed.riskAreas?.find(area => area.path === "src/index.ts")?.decisionConnections, 1);
  const previousCalls = calls.length;
  assert.deepEqual(await readRepositoryGraph("example/repo", "public", ""), indexed);
  assert.equal(calls.length - previousCalls, 2);
  await assert.rejects(readRepositoryGraph("example/repo", "private", ""), { status: 401 });
});
