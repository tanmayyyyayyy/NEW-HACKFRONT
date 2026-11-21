import { readFile } from "node:fs/promises";
import { driver } from "../lib/neo4j";
import { findMentions, readGithubData } from "../lib/github";
import type { ExtractedDecision } from "./extract";

/** Above this many files a PR is a bulk change, so only files the decision names count as affected. */
const BULK_PR_FILES = 25;
const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
const REPLACING = /\b(?:supersede[sd]?|replace[sd]?|revert(?:s|ed)?)\s+#(\d+)/gi;
const REVERTED_COMMIT = /this reverts commit ([a-f0-9]{40})/i;

const github = await readGithubData();
/** GitHub reports deleted accounts as "ghost". */
const withAuthor = <T extends { author: string }>(rows: T[]) => rows.map((row) => ({ ...row, author: row.author || "ghost" }));
const data = {
  ...github,
  pulls: withAuthor(github.pulls),
  issues: withAuthor(github.issues),
  comments: withAuthor(github.comments),
  commits: withAuthor(github.commits),
};
const decisions: Record<string, ExtractedDecision> = JSON.parse(await readFile("data/decisions.json", "utf8"));
const pulls = data.pulls;
const merged = pulls.filter((pull) => pull.mergedAt).sort((a, b) => a.mergedAt!.localeCompare(b.mergedAt!));
const decided = merged.filter((pull) => decisions[pull.number]?.isDecision && decisions[pull.number].isQuoteVerified);
const decidedNumbers = new Set(decided.map((pull) => pull.number));
const issueNumbers = new Set(data.issues.map((issue) => issue.number));

type Supersession = { newer: number; older: number; basis: string };

/** Later decisions override earlier ones: explicit text, AI-read replacements, or a setting one PR adds and a later PR removes. */
function findSupersessions(): Supersession[] {
  const found = new Map<string, Supersession>();
  const add = (newer: number, older: number, basis: string) => {
    const key = `${newer}->${older}`;
    if (newer !== older && decidedNumbers.has(newer) && decidedNumbers.has(older) && !found.has(key)) {
      found.set(key, { newer, older, basis });
    }
  };
  const settingAddedBy = new Map<string, number>();
  for (const pull of decided) {
    for (const match of `${pull.title}\n${pull.body}`.matchAll(REPLACING)) {
      add(pull.number, Number(match[1]), `PR #${pull.number} says it ${match[0]}`);
    }
    for (const older of decisions[pull.number].replaces) {
      add(pull.number, older, `PR #${pull.number} discussion replaces #${older}`);
    }
    for (const file of pull.files) {
      for (const key of file.settings.removed) {
        const older = settingAddedBy.get(key);
        if (older) {
          add(pull.number, older, `Setting ${key} added in PR #${older}, removed in PR #${pull.number}`);
        }
      }
      file.settings.added.forEach((key) => settingAddedBy.set(key, pull.number));
    }
  }
  const order = new Map(merged.map((pull, index) => [pull.number, index]));
  return [...found.values()].filter((link) => order.get(link.newer)! > order.get(link.older)!);
}

function listAffected(pullNumber: number) {
  const pull = pulls.find((item) => item.number === pullNumber)!;
  const named = decisions[pullNumber].affects.map((name) => name.toLowerCase());
  const files = pull.files
    .map((file) => file.path)
    .filter((path) => pull.files.length <= BULK_PR_FILES || named.some((name) => path.toLowerCase().endsWith(name)));
  const settings = pull.files.flatMap((file) => [...file.settings.added, ...file.settings.removed]);
  return { files, settings };
}

const supersessions = findSupersessions();
const supersededNumbers = new Set(supersessions.map((link) => link.older));

const session = driver.session();
try {
  await session.run("MATCH (n:WhyGraph) DETACH DELETE n");
  for (const label of ["PR", "Issue", "Person", "Commit", "File", "ConfigKey", "Comment", "Decision"]) {
    await session.run(`CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.id IS UNIQUE`);
  }
  await session.run(
    `CREATE FULLTEXT INDEX decision_text IF NOT EXISTS FOR (d:Decision) ON EACH [d.title, d.why, d.quote, d.prTitle]
     OPTIONS {indexConfig: {\`fulltext.analyzer\`: 'english'}}`,
  );

  await session.run(
    `UNWIND $rows AS row
     MERGE (p:WhyGraph:Person {id: row.author})
     CREATE (r:WhyGraph:PR {id: 'pr-' + row.number, number: row.number, title: row.title, body: row.body,
       state: row.state, url: row.url, createdAt: row.createdAt, mergedAt: row.mergedAt})
     CREATE (p)-[:AUTHORED]->(r)`,
    { rows: pulls },
  );
  await session.run(
    `UNWIND $rows AS row
     MERGE (p:WhyGraph:Person {id: row.author})
     CREATE (i:WhyGraph:Issue {id: 'issue-' + row.number, number: row.number, title: row.title, body: row.body,
       state: row.state, url: row.url, createdAt: row.createdAt})
     CREATE (p)-[:AUTHORED]->(i)`,
    { rows: data.issues },
  );
  await session.run(
    `UNWIND $rows AS row
     MATCH (parent:WhyGraph {number: row.parent})
     MERGE (p:WhyGraph:Person {id: row.author})
     CREATE (c:WhyGraph:Comment {id: row.url, body: row.body, url: row.url, createdAt: row.createdAt})
     CREATE (p)-[:AUTHORED]->(c), (c)-[:ON]->(parent)`,
    { rows: data.comments },
  );
  await session.run(
    `UNWIND $rows AS row
     MERGE (p:WhyGraph:Person {id: row.author})
     CREATE (c:WhyGraph:Commit {id: row.sha, title: split(row.message, '\n')[0], url: row.url, date: row.date})
     CREATE (p)-[:AUTHORED]->(c)`,
    { rows: data.commits },
  );
  await session.run(
    `UNWIND $rows AS row
     MATCH (pr:PR {id: 'pr-' + row.number})
     OPTIONAL MATCH (c:Commit {id: row.mergeSha})
     FOREACH (_ IN CASE WHEN c IS NULL THEN [] ELSE [1] END | CREATE (pr)-[:MERGED_AS]->(c))
     WITH pr, row
     UNWIND row.files AS file
     MERGE (f:WhyGraph:File {id: file.path}) ON CREATE SET f.name = file.path
     CREATE (pr)-[:TOUCHES]->(f)
     WITH pr, file
     UNWIND file.settings.added + file.settings.removed AS key
     MERGE (k:WhyGraph:ConfigKey {id: key}) ON CREATE SET k.name = key
     CREATE (pr)-[:CHANGES_SETTING {change: CASE WHEN key IN file.settings.added THEN 'added' ELSE 'removed' END}]->(k)`,
    { rows: pulls },
  );

  const links = pulls.flatMap((pull) => {
    const text = `${pull.title}\n${pull.body}`;
    const fixes = new Set([...text.matchAll(CLOSING)].map((match) => Number(match[1])));
    return findMentions(text).map((number) => ({ from: pull.number, to: number, type: fixes.has(number) ? "FIXES" : "REFERENCES" }));
  });
  await session.run(
    `UNWIND $links AS link
     MATCH (pr:PR {number: link.from}), (target:WhyGraph {number: link.to})
     WHERE target:PR OR target:Issue
     FOREACH (_ IN CASE WHEN link.type = 'FIXES' THEN [1] ELSE [] END | MERGE (pr)-[:FIXES]->(target))
     FOREACH (_ IN CASE WHEN link.type = 'REFERENCES' THEN [1] ELSE [] END | MERGE (pr)-[:REFERENCES]->(target))`,
    { links },
  );
  const reverts = data.commits.flatMap((commit) => {
    const match = REVERTED_COMMIT.exec(commit.message);
    return match ? [{ from: commit.sha, to: match[1] }] : [];
  });
  await session.run(
    `UNWIND $reverts AS link
     MATCH (a:Commit {id: link.from}), (b:Commit {id: link.to})
     MERGE (a)-[:REVERTS]->(b)`,
    { reverts },
  );

  const decisionRows = decided.map((pull) => {
    const decision = decisions[pull.number];
    const motivatedBy = findMentions(`${pull.title}\n${pull.body}`).filter((number) => issueNumbers.has(number));
    return {
      number: pull.number,
      title: decision.title,
      why: decision.why,
      quote: decision.quote,
      prTitle: pull.title,
      author: pull.author,
      date: pull.mergedAt,
      url: pull.url,
      status: supersededNumbers.has(pull.number) ? "superseded" : "active",
      motivatedBy,
      ...listAffected(pull.number),
    };
  });
  await session.run(
    `UNWIND $rows AS row
     MATCH (pr:PR {number: row.number}), (p:Person {id: row.author})
     CREATE (d:WhyGraph:Decision {id: 'decision-' + row.number, title: row.title, why: row.why, quote: row.quote,
       prTitle: row.prTitle, date: row.date, url: row.url, status: row.status})
     CREATE (d)-[:DECIDED_IN]->(pr), (d)-[:DECIDED_BY]->(p)
     WITH d, row
     CALL (d, row) {
       UNWIND row.files AS path MATCH (f:File {id: path}) CREATE (d)-[:AFFECTS]->(f)
     }
     CALL (d, row) {
       UNWIND row.settings AS key MATCH (k:ConfigKey {id: key}) MERGE (d)-[:AFFECTS]->(k)
     }
     CALL (d, row) {
       UNWIND row.motivatedBy AS number MATCH (i:Issue {number: number}) CREATE (d)-[:MOTIVATED_BY]->(i)
     }`,
    { rows: decisionRows },
  );
  await session.run(
    `UNWIND $links AS link
     MATCH (newer:Decision {id: 'decision-' + link.newer}), (older:Decision {id: 'decision-' + link.older})
     CREATE (newer)-[:SUPERSEDES {basis: link.basis}]->(older)`,
    { links: supersessions },
  );

  console.log(
    `Loaded ${pulls.length} PRs, ${data.issues.length} issues, ${data.comments.length} comments, ${data.commits.length} commits, ` +
      `${decisionRows.length} decisions, ${supersessions.length} supersessions, ${reverts.length} reverts`,
  );
  supersessions.forEach((link) => console.log(`  #${link.newer} supersedes #${link.older}: ${link.basis}`));
} finally {
  await session.close();
  await driver.close();
}
