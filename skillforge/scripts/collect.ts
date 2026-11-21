import { writeFile } from "node:fs/promises";

const REPO = "AppFuton/Futon";
const ANDROID_KEY = /^([+-])\s*android:key="([^"]+)"/;

type Json = Record<string, any>;

async function getJson(path: string): Promise<any> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub ${response.status} for ${path}`);
  }
  return response.json();
}

async function getAllPages(path: string): Promise<Json[]> {
  const rows: Json[] = [];
  for (let page = 1; ; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const batch: Json[] = await getJson(`${path}${separator}per_page=100&page=${page}`);
    rows.push(...batch);
    if (batch.length < 100) {
      return rows;
    }
  }
}

/** Settings a PR adds or removes, read from Android preference XML diffs. */
function readSettingChanges(patch = "") {
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of patch.split("\n")) {
    const match = ANDROID_KEY.exec(line);
    if (match) {
      (match[1] === "+" ? added : removed).push(match[2]);
    }
  }
  return { added: added.filter((key) => !removed.includes(key)), removed: removed.filter((key) => !added.includes(key)) };
}

const base = `/repos/${REPO}`;
const [pulls, issues, issueComments, reviewComments, commits] = await Promise.all([
  getAllPages(`${base}/pulls?state=all`),
  getAllPages(`${base}/issues?state=all`),
  getAllPages(`${base}/issues/comments`),
  getAllPages(`${base}/pulls/comments`),
  getAllPages(`${base}/commits`),
]);

const merged = pulls.filter((pull) => pull.merged_at);
const filesByPull = new Map<number, Json[]>();
for (const pull of merged) {
  filesByPull.set(pull.number, await getAllPages(`${base}/pulls/${pull.number}/files`));
}

const parentNumber = (url: string) => Number(url.split("/").pop());

const data = {
  repo: REPO,
  collectedAt: new Date().toISOString(),
  pulls: pulls.map((pull) => ({
    number: pull.number,
    title: pull.title,
    body: pull.body ?? "",
    author: pull.user?.login ?? "",
    createdAt: pull.created_at,
    mergedAt: pull.merged_at,
    state: pull.merged_at ? "merged" : pull.draft ? "draft" : pull.state,
    url: pull.html_url,
    mergeSha: pull.merged_at ? pull.merge_commit_sha : null,
    files: (filesByPull.get(pull.number) ?? []).map((file) => ({
      path: file.filename,
      settings: readSettingChanges(file.patch),
    })),
  })),
  issues: issues
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      author: issue.user?.login ?? "",
      createdAt: issue.created_at,
      state: issue.state,
      url: issue.html_url,
    })),
  comments: [
    ...issueComments.map((comment) => ({ parent: parentNumber(comment.issue_url), comment })),
    ...reviewComments.map((comment) => ({ parent: parentNumber(comment.pull_request_url), comment })),
  ].map(({ parent, comment }) => ({
    parent,
    author: comment.user?.login ?? "",
    body: comment.body ?? "",
    createdAt: comment.created_at,
    url: comment.html_url,
  })),
  commits: commits.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.author?.login ?? commit.commit.author?.name ?? "",
    date: commit.commit.committer?.date,
    url: commit.html_url,
  })),
};

await writeFile("data/github.json", JSON.stringify(data, null, 1));
console.log(
  `Saved ${data.pulls.length} PRs, ${data.issues.length} issues, ${data.comments.length} comments, ${data.commits.length} commits`,
);
