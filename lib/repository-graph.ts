import { randomUUID } from "node:crypto";
import { driver } from "./neo4j";
import { findMentions } from "./github";
import { requestGithub, RepositoryError } from "./repository-chat";
import type { RepositoryGraph } from "./graph-types";
import { graphModel, importSpecifiers, sourceFilePattern, sourceFileLimit, treeEntryLimit } from "./graph-model";

type Entry = { path: string; sha: string; type: string; size?: number };
type Commit = { sha: string; commit: { message: string }; parents?: { sha: string }[] };
type Pull = { number: number; title: string; body: string | null; merge_commit_sha: string | null; merged_at: string | null };
const shaPattern = /^[a-f0-9]{40}$/i;

const data = async <T>(path: string, token?: string) => JSON.parse(await requestGithub(path, token)) as T;
const pullId = (number: number) => "pull:" + number;
const commitId = (sha: string) => "commit:" + sha;
export async function readRepositoryGraph(repository: string, mode: "public" | "private", owner: string, token?: string, refresh = false) {
  if (mode === "private" && (!owner || !token)) throw new RepositoryError("Sign in and provide a GitHub read token.", 401);
  const credential = mode === "private" ? token : process.env.GITHUB_PUBLIC_READ_TOKEN;
  const prefix = "/repos/" + repository;
  const remote = await data<{ private: boolean; default_branch: string; full_name: string }>(prefix, credential);
  if (remote.full_name.toLowerCase() !== repository || remote.private !== (mode === "private")) {
    throw new RepositoryError("Open the graph using the repository's public or private access mode.", 403);
  }
  const branch = encodeURIComponent(remote.default_branch);
  const { sha: revision } = await data<{ sha: string }>(prefix + "/commits/" + branch, credential);
  if (!shaPattern.test(revision)) throw new RepositoryError("GitHub returned an invalid repository revision.", 502);
  const database = process.env.NEO4J_DATABASE || "neo4j";
  const key = JSON.stringify([mode, owner, repository]);
  if (!refresh) {
    const cached = await driver.executeQuery(
      "MATCH (g:SkillForgeGraph {key: $key, revision: $revision}) RETURN g.snapshot AS snapshot ORDER BY g.indexedAt DESC LIMIT 1",
      { key, revision }, { database, routing: "READ" },
    );
    if (cached.records.length) return JSON.parse(cached.records[0].get("snapshot")) as RepositoryGraph;
  }
  const web = "https://github.com/" + repository;
  const [tree, commits, pulls] = await Promise.all([
    data<{ tree: Entry[]; truncated: boolean }>(prefix + "/git/trees/" + revision + "?recursive=1", credential),
    data<Commit[]>(prefix + "/commits?sha=" + revision + "&per_page=24", credential),
    data<Pull[]>(prefix + "/pulls?state=all&sort=updated&per_page=18", credential),
  ]);
  const graph: RepositoryGraph = {
    repository, revision, indexedAt: new Date().toISOString(), nodes: [], edges: [],
    coverage: { files: 0, importFiles: 0, treePartial: tree.truncated || tree.tree.length > treeEntryLimit, historyPartial: commits.length === 24 || pulls.length === 18 },
  };
  const model = graphModel(graph, web);
  const { add, link } = model;
  const entries = tree.tree.slice(0, treeEntryLimit).filter(entry => entry.path.length <= 600 && entry.path.split("/").length < 80);
  const files = entries.filter(entry => entry.type === "blob");
  for (const entry of entries) {
    if (entry.type === "tree") model.folder(entry.path);
    if (entry.type === "blob") model.file(entry.path);
  }
  const source = files.filter(entry => sourceFilePattern.test(entry.path) && (entry.size ?? Infinity) <= 64 * 1024 && shaPattern.test(entry.sha))
    .sort((a, b) => Number(!/^(app|src|lib)\//.test(a.path)) - Number(!/^(app|src|lib)\//.test(b.path)) || a.path.localeCompare(b.path))
    .slice(0, sourceFileLimit);
  for (let offset = 0; offset < source.length; offset += 4) {
    const batch = await Promise.all(source.slice(offset, offset + 4).map(async entry => {
      const blob = await data<{ encoding: string; content: string }>(prefix + "/git/blobs/" + entry.sha, credential);
      return { entry, blob };
    }));
    for (const { entry, blob } of batch) {
      if (blob.encoding !== "base64" || blob.content.length > 100_000) continue;
      model.imports(entry.path, importSpecifiers(Buffer.from(blob.content, "base64").toString("utf8")));
    }
  }
  function commitNode(commit: Commit) {
    if (!shaPattern.test(commit.sha)) return;
    add({ id: commitId(commit.sha), label: commit.sha.slice(0, 8), detail: commit.commit.message.split("\n")[0].slice(0, 200), kind: "commit", url: web + "/commit/" + commit.sha });
  }
  commits.forEach(commitNode);
  for (const pull of pulls) {
    add({ id: pullId(pull.number), label: "#" + pull.number, detail: pull.title.slice(0, 200), kind: "pull", url: web + "/pull/" + pull.number });
  }
  const pullCommits = await Promise.all(pulls.slice(0, 4).map(async pull => ({
    pull, commits: await data<Commit[]>(prefix + "/pulls/" + pull.number + "/commits?per_page=14", credential),
  })));
  for (const group of pullCommits) {
    if (group.commits.length === 14 || pulls.length > 4) graph.coverage.historyPartial = true;
    for (const commit of group.commits) {
      commitNode(commit);
      link(pullId(group.pull.number), commitId(commit.sha), "INCLUDES");
    }
  }
  for (const commit of [...commits, ...pullCommits.flatMap(group => group.commits)]) {
    for (const parent of commit.parents ?? []) link(commitId(commit.sha), commitId(parent.sha), "PARENT");
    for (const number of findMentions(commit.commit.message)) link(commitId(commit.sha), pullId(number), "REFERENCES");
  }
  for (const pull of pulls) {
    if (pull.merged_at && pull.merge_commit_sha) link(pullId(pull.number), commitId(pull.merge_commit_sha), "INCLUDES");
    const text = pull.title + "\n" + (pull.body || "");
    const overrides = new Set(Array.from(text.matchAll(/\b(?:reverts?|supersedes?|replaces?)\s+(?:PR\s+)?#(\d+)/gi), match => Number(match[1])));
    for (const reference of findMentions(text)) {
      link(pullId(pull.number), pullId(reference), pull.merged_at && overrides.has(reference) ? "SUPERSEDES" : "REFERENCES");
    }
  }
  return persistRepositoryGraph(key, model.finish());
}

export async function persistRepositoryGraph(key: string, graph: RepositoryGraph) {
  const database = process.env.NEO4J_DATABASE || "neo4j";
  const id = randomUUID();
  const session = driver.session({ database });
  try {
    await session.executeWrite(async tx => {
      await tx.run("CREATE (g:SkillForgeGraph {id: $id, key: $key, revision: $revision, indexedAt: $indexedAt, snapshot: $snapshot})",
        { id, key, revision: graph.revision, indexedAt: graph.indexedAt, snapshot: JSON.stringify(graph) });
      await tx.run("MATCH (g:SkillForgeGraph {id: $id}) UNWIND $nodes AS n CREATE (g)-[:HAS_NODE]->(:SkillForgeGraphNode {id: n.id, label: n.label, kind: n.kind, detail: n.detail})",
        { id, nodes: graph.nodes });
      await tx.run(`MATCH (g:SkillForgeGraph {id: $id})
        UNWIND $edges AS edge
        MATCH (g)-[:HAS_NODE]->(a:SkillForgeGraphNode {id: edge.from}), (g)-[:HAS_NODE]->(b:SkillForgeGraphNode {id: edge.to})
        CREATE (a)-[:GRAPH_EDGE {kind: edge.kind}]->(b)`, { id, edges: graph.edges });
      await tx.run(`MATCH (previous:SkillForgeGraph {key: $key})
        WHERE previous.id <> $id AND previous.indexedAt < $indexedAt
        OPTIONAL MATCH (previous)-[:HAS_NODE]->(node:SkillForgeGraphNode)
        WITH previous, collect(node) AS nodes
        FOREACH (node IN nodes | DETACH DELETE node)
        DETACH DELETE previous`, { id, key, indexedAt: graph.indexedAt });
    });
  } finally { await session.close(); }
  return graph;
}
