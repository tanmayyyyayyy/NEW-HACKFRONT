import { withQueryBudget } from "@/lib/query-budget";
import { accounts } from "@/lib/auth";
import { z } from "zod";
import { RepositoryError, repositoryEvidence, repositoryName, type Evidence } from "@/lib/repository-chat";
import { matchesAppOrigin } from "@/lib/app-origin";
import { configuredAppUrl } from "@/lib/site-url";
import { explainEvidence } from "@/lib/answer-explanation";
import { pathAllowed, repositorySnippets } from "@/lib/code-evidence";
import { pullTarget } from "@/lib/code-types";
import { reviewPullRequest } from "@/lib/pr-review";
import { listOpenPulls } from "@/lib/open-pulls";

const requestSchema = z.object({
  question: z.string().trim().min(3).max(500),
  repo: z.string().trim().min(3).max(400),
  mode: z.enum(["public", "private"]),
  language: z.enum(["English", "Hindi", "Hinglish"]),
  contextIds: z.array(z.string().regex(/^(?:#[1-9]\d{0,9}|[a-f0-9]{40})$/)).max(5).default([]),
  files: z.array(z.string().refine(pathAllowed)).max(3).default([]),
  includeCode: z.boolean().default(false),
  throughDate: z.iso.date().optional(),
  sarvam: z.boolean().default(false),
});

function pullTrail(review: Awaited<ReturnType<typeof reviewPullRequest>>, repo: string, files: string[]) {
  const { pull, snippets, findings } = review;
  const activePaths = new Set(files.length ? files : snippets.map(snippet => snippet.path));
  const relevant = activePaths.size ? findings.filter(finding => activePaths.has(finding.path)) : findings;
  const records = new Map<string, Evidence>();
  for (const finding of relevant) {
    for (const source of [finding.older, finding.reversal]) {
      const id = "#" + source.number;
      records.set(id, { id, kind: "Merged PR", title: source.title, author: source.author, date: source.date,
        text: source.evidence, url: `https://github.com/${repo}/pull/${source.number}` });
    }
  }
  for (const source of review.history ?? []) {
    if (records.size >= 4 || records.has(source.id) || (activePaths.size && !source.files.some(path => activePaths.has(path)))) continue;
    records.set(source.id, { ...source, kind: "Merged PR" });
  }
  const proposed: Evidence = { id: "#" + pull.number, kind: pull.mergedAt ? "Merged PR" : "PR", title: pull.title, date: pull.date,
    author: pull.author, url: `https://github.com/${repo}/pull/${pull.number}`,
    text: review.description ?? "", files: [...activePaths] };
  const evidence: Awaited<ReturnType<typeof repositoryEvidence>>["evidence"] = [proposed, ...[...records.values()].slice(0, 4)]
    .map(record => ({ record, links: [] }));
  for (const { older, reversal, rationale } of relevant) {
    const from = "#" + reversal.number;
    const to = "#" + older.number;
    const row = evidence.find(item => item.record.id === from);
    const previous = records.get(to);
    if (row && previous && !row.links.some(link => link.to === to)) {
      row.links.push({ from, to, kind: "SUPERSEDES", basis: rationale, record: previous });
    }
  }
  return {
    evidence, snippets, recordCount: evidence.length, throughDate: null, query: null,
    matchBasis: `PR #${pull.number} · ${review.coverage.historyWindow}`,
    review: {
      title: pull.title, number: pull.number, state: pull.state, files: review.coverage.changedFiles,
      matched: records.size, url: proposed.url, possibleConflict: relevant.some(finding => finding.confidence === "changed-lines"),
      recommendation: review.aiReview.recommendation,
      findings: review.aiReview.findings.filter(finding => !activePaths.size || activePaths.has(finding.path)).slice(0, 3).map(finding => ({
        path: finding.path, explanation: finding.explanation,
        sources: review.aiReview.evidence.filter(source => finding.sources.includes(source.id))
          .map(({ id, title, url }) => ({ id, title, url })),
      })),
    },
    reviewNote: relevant.some(finding => finding.confidence === "changed-lines")
      ? "Possible reintroduction of previously changed behavior. Verify the cited decision and resolve the conflict before merge."
      : relevant.length ? "Earlier decisions touch these files. Compare the cited rationale with the proposed change."
      : records.size ? "These earlier pull requests touched the same files. Check their rationale against the proposed change."
      : "No matching earlier decision was found for these changes in the sampled history.",
  };
}

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const origin = request.headers.get("origin");
  const appOrigin = configuredAppUrl() || new URL(request.url).origin;
  if (!matchesAppOrigin(origin, appOrigin)) {
    return reply({ error: "Request origin could not be verified. Open SkillForge at its configured address and try again." }, 403);
  }
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8192) {
          await reader.cancel();
          return reply({ error: "Request is too large." }, 413);
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } catch {
      return reply({ error: "The request could not be read." }, 400);
    } finally {
      reader.releaseLock();
    }
  }
  let input: unknown;
  try { input = JSON.parse(body); } catch { return reply({ error: "Invalid JSON request." }, 400); }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return reply({ error: parsed.error.issues.some(issue => issue.path[0] === "files")
    ? "Attach up to three valid repository file paths."
    : "Enter a valid repository and a question between 3 and 500 characters." }, 400);
  try {
    const { mode, question, language, sarvam } = parsed.data;
    if (mode === "private") {
      if (!request.headers.get("cookie") || !(await (await accounts()).api.getSession({ headers: request.headers }))) return reply({ error: "Sign in before opening a private repository." }, 401);
    }
    const target = pullTarget(parsed.data.repo);
    const repo = repositoryName(target?.repo ?? parsed.data.repo);
    const authorization = request.headers.get("authorization");
    const token = mode === "private" ? /^Bearer ([A-Za-z0-9_]{10,250})$/.exec(authorization ?? "")?.[1] : undefined;
    if (mode === "private" && !token) return reply({ error: "Provide a repository-scoped GitHub read token." }, 401);
    if (target && parsed.data.throughDate) return reply({ error: "Pull request history is limited to decisions made before that PR opened." }, 400);
    return await withQueryBudget(async () => {
      const credential = mode === "public" ? process.env.GITHUB_PUBLIC_READ_TOKEN : token;
      const { files, throughDate, contextIds, includeCode } = parsed.data;
      if (!target && !throughDate && !files.length &&
        /\b(?:(?:open|ongoing|active|in[- ]progress)\s+(?:prs?|pull requests?)|(?:prs?|pull requests?)\s+(?:are\s+)?(?:open|ongoing|active|in[- ]progress))\b/i.test(question) &&
        !/#\d/.test(question)) {
        const { pulls, hasNext } = await listOpenPulls(repo, mode, credential);
        return reply({ evidence: [], snippets: [], throughDate: null, query: null, recordCount: pulls.length, matchBasis: "",
          openPulls: { repo, pulls, hasNext }, summary: null, explanationStatus: null, explanationProvider: null });
      }
      const review = target
        ? await reviewPullRequest(repo, target.number, mode, credential, sarvam, { question, paths: files }) : null;
      const trail = review
        ? pullTrail(review, repo, files)
        : await repositoryEvidence(repo, mode, question, token, contextIds, throughDate, files);
      const snippets = "snippets" in trail ? trail.snippets : includeCode
        ? await repositorySnippets(repo, mode, question, files,
          trail.evidence.flatMap(({ record, links }) => [...(record.files ?? []), ...links.flatMap(link => link.record?.files ?? [])]),
          throughDate, credential).catch(() => [])
        : [];
      const explanation = sarvam && review?.aiReview.status === "ready"
        ? { status: "ready", provider: "Gemini", summary: review.aiReview.summary }
        : sarvam ? await explainEvidence(language, question, trail.evidence, snippets) : null;
      return reply({ ...trail, snippets, summary: explanation?.summary ?? null,
        sarvamUnavailable: explanation?.status === "unavailable" || explanation?.status === "not-configured",
        explanationStatus: explanation?.status ?? null,
        explanationProvider: explanation?.provider ?? null });
    });
  } catch (err) {
    if (err instanceof RepositoryError) return reply({ error: err.message }, err.status);
    return reply({ error: pullTarget(parsed.data.repo)
      ? "The pull request review could not finish. Check that the PR is accessible on GitHub, then retry."
      : "Repository evidence is temporarily unavailable. Check GitHub access and Neo4j connectivity." }, 503);
  }
}
