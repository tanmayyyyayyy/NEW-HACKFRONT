import neo4j from "neo4j-driver";
import { driver } from "./neo4j";
import { findMentions, readGithubData, type Pull } from "./github";

export type Evidence = {
  id: string; kind: string; title: string; text: string; author: string; date: string; url: string; files?: string[];
};
type Link = { from: string; to: string; kind: string; basis: string };

export class RepositoryError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function repositoryName(input: string) {
  const match = /^(?:https:\/\/github\.com\/)?([a-z\d-]{1,39}\/[a-z\d_.-]{1,100})(?:\/)?$/i.exec(input.trim());
  const repo = match?.[1].replace(/\.git$/i, "").toLowerCase();
  if (!repo || [".", "..", ""].includes(repo.split("/")[1])) throw new RepositoryError("Enter a GitHub owner/repo or repository URL.", 400);
  return repo;
}

async function github<T>(path: string, token?: string): Promise<T> {
  const response = await fetch("https://api.github.com" + path, {
    headers: { Accept: "application/vnd.github+json", ...(token && { Authorization: "Bearer " + token }) },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") {
      throw new RepositoryError("GitHub is rate-limiting requests. Try again after the quota resets.", 429);
    }
    if ([401, 403, 404].includes(response.status)) {
      throw new RepositoryError("GitHub could not confirm access to this repository or its history.", 403);
    }
    throw new RepositoryError("GitHub history is temporarily unavailable.", 502);
  }
  return response.json() as Promise<T>;
}

type Thread = {
  number: number; title: string; body: string | null; user: { login: string } | null;
  created_at: string; merged_at?: string | null;
  pull_request?: { merged_at?: string | null };
};
type Comment = { id: number; body: string; user: { login: string } | null; created_at: string };
type Commit = { sha: string; author: { login: string } | null; commit: { message: string; author: { date: string } } };

async function history(repo: string, mode: "public" | "private", question: string, token?: string) {
  const root = "https://github.com/" + repo;
  const path = "/repos/" + repo;
  const records = new Map<string, Evidence>();
  function add(kind: string, id: string, title: string, text: string, author: string, date: string, url: string) {
    records.set(id, { id, kind, title: title.slice(0, 300), text: text.slice(0, 2800), author, date, url });
  }
  const links: Link[] = [];
  const link = (from: string, to: string, kind: string, basis: string) => links.push({ from, to, kind, basis });

  if (mode === "public" && repo === "appfuton/futon") {
    const fixture = await readGithubData();
    for (const pull of fixture.pulls) {
      add(pull.mergedAt ? "Merged PR" : "PR", "#" + pull.number, pull.title, pull.body, pull.author,
        pull.mergedAt ?? pull.createdAt, root + "/pull/" + pull.number);
    }
    for (const pr of fixture.pulls) {
      const record = records.get("#" + pr.number);
      if (record) record.files = pr.files.slice(0, 12).map(file => file.path);
    }
    for (const issue of fixture.issues) {
      add("Issue", "#" + issue.number, issue.title, issue.body, issue.author, issue.createdAt, root + "/issues/" + issue.number);
    }
    const relevant = new Set(findMentions(question));
    for (const [index, comment] of fixture.comments.entries()) {
      if (!relevant.has(comment.parent)) continue;
      const id = "discussion:" + index;
      const commentNumber = /#(?:issuecomment|discussion_r)-?(\d+)$/.exec(comment.url)?.[0] ?? "";
      const parent = records.get("#" + comment.parent);
      if (!parent) continue;
      add("Discussion", id, "Discussion on #" + comment.parent, comment.body, comment.author,
        comment.createdAt, parent.url + commentNumber);
      link(parent.id, id, "DISCUSSION", "Comment on this thread");
    }
    for (const commit of fixture.commits.slice(0, 20)) {
      if (/^[a-f\d]{40}$/.test(commit.sha)) add("Commit", commit.sha, commit.message.split("\n")[0], commit.message,
        commit.author, commit.date, root + "/commit/" + commit.sha);
    }
    const settings = new Map<string, Pull>();
    for (const pr of fixture.pulls.filter(pr => pr.mergedAt).sort((a, b) => a.mergedAt!.localeCompare(b.mergedAt!))) {
      for (const file of pr.files) {
        for (const key of file.settings.removed) {
          const prior = settings.get(file.path + ":" + key);
          if (prior && prior.number !== pr.number) link("#" + pr.number, "#" + prior.number, "SUPERSEDES",
            "Earlier PR added a preference that the later PR removed in " + file.path + ".");
          settings.delete(file.path + ":" + key);
        }
        for (const key of file.settings.added) settings.set(file.path + ":" + key, pr);
      }
    }
  } else {
    if (mode === "private" && !token) throw new RepositoryError("Provide your own read-only GitHub token for this repo.", 401);
    // Public mode uses no credential so a private repository cannot enter through that path.
    const metadata = await github<{ private: boolean; full_name: string }>(path, token);
    if (metadata.full_name.toLowerCase() !== repo || metadata.private !== (mode === "private")) {
      throw new RepositoryError("The repository is unavailable in the selected path.", 403);
    }
    const [pulls, issues, commits] = await Promise.all([
      github<Thread[]>(path + "/pulls?state=closed&sort=updated&per_page=20", token),
      github<Thread[]>(path + "/issues?state=all&sort=updated&per_page=20", token),
      github<Commit[]>(path + "/commits?per_page=12", token),
    ]);
    const saveThread = (row: Thread, isPull: boolean) => {
      const merged = row.merged_at ?? row.pull_request?.merged_at;
      add(isPull ? merged ? "Merged PR" : "PR" : "Issue", "#" + row.number, row.title, row.body ?? "",
        row.user?.login ?? "", merged ?? row.created_at, root + (isPull ? "/pull/" : "/issues/") + row.number);
    };
    pulls.forEach(row => saveThread(row, true));
    issues.filter(row => !row.pull_request).forEach(row => saveThread(row, false));
    for (const row of commits) {
      if (/^[a-f\d]{40}$/.test(row.sha)) add("Commit", row.sha, row.commit.message.split("\n")[0], row.commit.message,
        row.author?.login ?? "", row.commit.author.date, root + "/commit/" + row.sha);
    }
    await Promise.all([...new Set(findMentions(question))].slice(0, 3).map(async number => {
      if (!records.has("#" + number)) {
        try {
          const row = await github<Thread>(path + "/issues/" + number, token);
          saveThread(row, Boolean(row.pull_request));
        } catch (err) {
          if (!(err instanceof RepositoryError) || err.status !== 403) throw err;
        }
      }
      const parent = records.get("#" + number);
      if (!parent) return;
      if (parent.kind.endsWith("PR")) {
        const files = await github<{filename: string}[]>(path + "/pulls/" + number + "/files?per_page=12", token);
        parent.files = files.map(file => file.filename);
      }
      const comments = await github<Comment[]>(path + "/issues/" + number + "/comments?per_page=5", token);
      for (const comment of comments) {
        const id = "discussion:" + comment.id;
        add("Discussion", id, "Discussion on #" + number, comment.body, comment.user?.login ?? "",
          comment.created_at, parent.url + "#issuecomment-" + comment.id);
        link(parent.id, id, "DISCUSSION", "Comment on this thread");
      }
    }));
  }
  for (const row of records.values()) {
    for (const number of findMentions(row.text)) {
      const target = records.get("#" + number);
      if (target && target.id !== row.id) link(row.id, target.id, "REFERENCES", "Referenced in the source record");
    }
    if (row.kind !== "Merged PR" && row.kind !== "Commit") continue;
    for (const match of (row.title + "\n" + row.text).matchAll(/\b(?:supersed(?:es|ed)|replac(?:es|ed)|revert(?:s|ed))\s+(?:PR\s+)?#(\d+)\b/gi)) {
      const older = records.get("#" + match[1]);
      if (older && older.date < row.date) link(row.id, older.id, "SUPERSEDES", "Explicit replacement reference in source history");
    }
  }
  return { records: [...records.values()], links };
}

const MATCH_EVIDENCE = `
MATCH (scope:SkillForgeChatRun)
WHERE elementId(scope) = $scope
MATCH (scope)-[:HAS_RECORD]->(r)
WITH r, size([word IN $terms WHERE toLower(r.title + " " + r.text) CONTAINS word]) AS overlap,
  CASE WHEN r.id IN $refs THEN 100 ELSE 0 END +
  size([word IN $terms WHERE toLower(r.title) CONTAINS word]) * 4 +
  size([word IN $terms WHERE toLower(r.text) CONTAINS word]) AS score
WHERE (size($refs) = 0 AND overlap >= 2 AND score >= 5) OR r.id IN $refs
ORDER BY score DESC, r.date DESC LIMIT 5
OPTIONAL MATCH (r)-[rel:DISCUSSION|REFERENCES|SUPERSEDES]-(other)
RETURN properties(r) AS record, collect(DISTINCT {kind:type(rel), basis: rel.basis,
  from: startNode(rel).id, to: endNode(rel).id, record:properties(other)})[..8] AS links
`;

export async function repositoryEvidence(repo: string, mode: "public" | "private", question: string, token?: string, contextIds: string[] = [], throughDate?: string) {
  const explicit = findMentions(question).map(number => "#" + number);
  const refs = [...new Set(explicit.length ? explicit : contextIds)];
  const data = await history(repo, mode, [question, ...refs].join(" "), token);
  const records = throughDate ? data.records.filter(row => row.date && row.date.slice(0, 10) <= throughDate) : data.records;
  const stop = new Set("why what when how this that the and for does did was are were use from with into can you explain about kyun kyon hai hua iska kya kaise kaun batao mujhe".split(" "));
  const terms = [...new Set((question.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []).filter(word => !stop.has(word)))].slice(0, 15);
  const session = driver.session({ database: process.env.NEO4J_DATABASE || "neo4j", defaultAccessMode: neo4j.session.WRITE });
  try {
    const tx = session.beginTransaction({ timeout: 8000 });
    try {
      const scope = (await tx.run("CREATE (scope:SkillForgeChatRun) RETURN elementId(scope) AS scope")).records[0].get("scope");
      await tx.run(`MATCH (scope) WHERE elementId(scope) = $scope
        UNWIND $records AS data CREATE (scope)-[:HAS_RECORD]->(r:SkillForgeChatEvidence) SET r = data`,
      { scope, records });
      await tx.run(`MATCH (scope) WHERE elementId(scope) = $scope
        UNWIND $links AS link
        MATCH (scope)-[:HAS_RECORD]->(a {id: link.from}), (scope)-[:HAS_RECORD]->(b {id: link.to})
        FOREACH (_ IN CASE WHEN link.kind = 'SUPERSEDES' THEN [1] ELSE [] END | CREATE (a)-[:SUPERSEDES {basis:link.basis}]->(b))
        FOREACH (_ IN CASE WHEN link.kind = 'REFERENCES' THEN [1] ELSE [] END | CREATE (a)-[:REFERENCES {basis:link.basis}]->(b))
        FOREACH (_ IN CASE WHEN link.kind = 'DISCUSSION' THEN [1] ELSE [] END | CREATE (a)-[:DISCUSSION {basis:link.basis}]->(b))`,
      { scope, links: data.links });
      const matches = await tx.run(MATCH_EVIDENCE, { scope, terms, refs });
      return {
        evidence: matches.records.map(row => ({
          record: row.get("record") as Evidence,
          links: (row.get("links") as (Link & { record: Evidence | null })[]).filter(item => item.record !== null),
        })),
        throughDate: throughDate || null,
        recordCount: records.length,
        matchBasis: matches.records.length ? (explicit.length ? "Exact PR or issue number" : refs.length ? "Selected conversation sources" : "Keyword overlap in repository history") : "Insufficient evidence",
        query: MATCH_EVIDENCE.trim(),
        bundled: mode === "public" && repo === "appfuton/futon",
      };
    } finally {
      await tx.rollback();
    }
  } finally {
    await session.close();
  }
}
