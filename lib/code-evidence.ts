import { createHash } from "node:crypto";
import { requestGithub } from "./repository-chat";
import type { CodeLine, CodeSnippet } from "./code-types";

const shaPattern = /^[a-f0-9]{40}$/i;
const maxFileBytes = 64 * 1024;
const sourceExtension = /\.(?:[cm]?[jt]sx?|css|scss|html?|vue|svelte|xml|json|ya?ml|toml|ini|py|rb|php|go|rs|java|kts?|swift|cs|cpp|c|h|sql|sh|md|mdx)$/i;
const ignored = /(?:^|\/)(?:\.git|node_modules|dist|vendor|build|coverage|\.next)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|(?:\.min\.[^.]+|(?:^|\/)[^/]*lock\.(?:json|ya?ml))$/i;
const stopWords = new Set("the and for how where what why can could should would add implement change changed changes feature new code file repository repo from this that with which does did into need want tell show about section specific please support being make works line actual use using now then".split(" "));

export function pathAllowed(path: string) {
  return path.length > 0 && path.length <= 600 && !/[\\\u0000-\u001f]/.test(path) &&
    path.split("/").every(part => part && part !== "." && part !== "..");
}

const encodedPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
const api = async <T>(path: string, token?: string) => JSON.parse(await requestGithub(path, token)) as T;
const words = (text: string) => text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [];
const termsOf = (question: string) => [...new Set(words(question).filter(word => !stopWords.has(word)))].slice(0, 15);
const score = (text: string, terms: string[]) => {
  const present = new Set(words(text));
  return terms.filter(term => present.has(term)).length;
};

type Branch = { repo: string; ref: string; sha: string };
const webRoot = (repo: string) => "https://github.com/" + repo;
const lineAnchor = (first: number, last: number) => "#L" + first + (last === first ? "" : "-L" + last);
function editLink(branch: Branch, path: string) {
  return pathAllowed(branch.ref) ? webRoot(branch.repo) + "/edit/" + encodedPath(branch.ref) + "/" + encodedPath(path) : undefined;
}

export async function repositorySnippets(repo: string, mode: "public" | "private", question: string,
  attached: string[], historicalPaths: string[], throughDate?: string, token?: string): Promise<CodeSnippet[]> {
  if (mode === "private" && !token) return [];
  const prefix = "/repos/" + repo;
  const metadata = await api<{ full_name: string; private: boolean; default_branch: string }>(prefix, token);
  if (metadata.full_name.toLowerCase() !== repo || metadata.private !== (mode === "private")) return [];
  const ref = metadata.default_branch;
  const revision = throughDate
    ? (await api<{ sha: string }[]>(prefix + "/commits?" + new URLSearchParams({ sha: ref, until: throughDate + "T23:59:59Z", per_page: "1" }), token))[0]
    : await api<{ sha: string }>(prefix + "/commits/" + encodeURIComponent(ref), token);
  if (!revision || !shaPattern.test(revision.sha)) return [];
  const branch = { repo, ref, sha: revision.sha };
  type Entry = { path: string; mode: string; type: string; size?: number; sha: string };
  const { tree } = await api<{ tree: Entry[] }>(prefix + "/git/trees/" + branch.sha + "?recursive=1", token);
  const terms = termsOf(question);
  const questionText = question.toLowerCase();
  const candidates = tree.filter(entry => entry.type === "blob" && ["100644", "100755"].includes(entry.mode) &&
    (entry.size ?? Infinity) <= maxFileBytes && shaPattern.test(entry.sha) && pathAllowed(entry.path) && !ignored.test(entry.path))
    .map(entry => {
      const basename = entry.path.split("/").at(-1)!;
      const explicit = attached.includes(entry.path) || questionText.includes(entry.path.toLowerCase()) ||
        (basename.includes(".") && questionText.includes(basename.toLowerCase()));
      const historical = historicalPaths.includes(entry.path);
      const entryPoint = /(?:^|\/)(?:globals|styles|theme|index|layout|app|main)\.[^.]+$/i.test(entry.path);
      const weight = explicit ? 30 : score(entry.path, terms) * 4 + (historical ? 8 : 0) + Number(entryPoint && terms.length > 0);
      return { entry, explicit, historical, weight };
    }).filter(({ entry, explicit, weight }) => explicit || (weight > 0 && sourceExtension.test(entry.path)))
    .sort((a, b) => b.weight - a.weight).slice(0, 8);

  const snippets = await Promise.all(candidates.map(async ({ entry, explicit, historical, weight }) => {
    try {
      const blob = await api<{ encoding: string; content: string }>(prefix + "/git/blobs/" + entry.sha, token);
      if (blob.encoding !== "base64" || blob.content.length > maxFileBytes * 1.5) return null;
      const bytes = Buffer.from(blob.content, "base64");
      if (bytes.length > maxFileBytes || bytes.includes(0)) return null;
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const all = content.split(/\r?\n/);
      if (all.at(-1) === "") all.pop();
      let anchor = 0, highest = 0;
      for (const [index, line] of all.entries()) {
        if (line.length > 500) continue;
        const match = score(line, terms);
        if (match > highest) { anchor = index; highest = match; }
      }
      if (!highest && !(explicit || historical)) return null;
      if (!highest) anchor = Math.max(0, all.findIndex(line => line.trim()));
      const start = Math.max(0, anchor - 3);
      const lines = all.slice(start, anchor + 5).map((text, i) => ({ text: text.slice(0, 500), line: start + i + 1 }));
      if (!lines.some(line => line.text.trim())) return null;
      const path = entry.path;
      return { weight: weight + highest * 5, snippet: {
        path, lines, basis: highest ? "matching lines" : "file opening",
        url: webRoot(repo) + "/blob/" + branch.sha + "/" + encodedPath(path) + lineAnchor(lines[0].line, lines.at(-1)!.line),
        editUrl: throughDate ? undefined : editLink(branch, path),
      } satisfies CodeSnippet };
    } catch { return null; }
  }));
  return snippets.flatMap(item => item ? [item] : []).sort((a, b) => b.weight - a.weight).slice(0, 3).map(item => item.snippet);
}

export function pullSnippet(repo: string, number: number, path: string, patch: string | undefined,
  head: Branch | undefined, editable: boolean, question = ""): CodeSnippet | undefined {
  if (!patch || !pathAllowed(path) || ignored.test(path)) return;
  const terms = termsOf(question);
  let old = 0, next = 0;
  const hunks: CodeLine[][] = [];
  for (const raw of patch.slice(0, 64 * 1024).split(/\r?\n/)) {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (header) {
      old = Number(header[1]);
      next = Number(header[2]);
      hunks.push([]);
      continue;
    }
    const hunk = hunks.at(-1);
    if (!hunk) continue;
    const text = raw.slice(1, 501);
    if (raw[0] === "+") hunk.push({ text, line: next++, change: "added" });
    else if (raw[0] === "-") hunk.push({ text, old: old++, change: "removed" });
    else if (raw[0] === " ") hunk.push({ text, old: old++, line: next++ });
  }
  let best: { hunk: CodeLine[]; index: number; weight: number } | undefined;
  for (const hunk of hunks) for (const [index, line] of hunk.entries()) {
    if (!line.change) continue;
    const weight = score(line.text, terms) * 3 + Number(line.change === "added");
    if (!best || weight > best.weight) best = { hunk, index, weight };
  }
  if (!best) return;
  const lines = best.hunk.slice(Math.max(0, best.index - 3), best.index + 6);
  const first = lines.find(line => line.line !== undefined)?.line;
  const last = lines.findLast(line => line.line !== undefined)?.line;
  const fileHash = createHash("sha256").update(path).digest("hex");
  const anchor = best.hunk[best.index];
  const diffUrl = webRoot(repo) + "/pull/" + number + "/files#diff-" + fileHash +
    (anchor.line !== undefined ? "R" + anchor.line : "L" + anchor.old);
  return {
    path, lines, diffUrl, basis: "pull request diff",
    url: head && first !== undefined && last !== undefined
      ? webRoot(head.repo) + "/blob/" + head.sha + "/" + encodedPath(path) + lineAnchor(first, last)
      : diffUrl,
    editUrl: head && editable && first !== undefined ? editLink(head, path) : undefined,
  };
}
