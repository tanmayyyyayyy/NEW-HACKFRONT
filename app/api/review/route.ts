import { accounts } from "@/lib/auth";
import { matchesAppOrigin } from "@/lib/app-origin";
import { withQueryBudget } from "@/lib/query-budget";
import { RepositoryError, repositoryName } from "@/lib/repository-chat";
import { reviewPullRequest } from "@/lib/pr-review";
import { configuredAppUrl } from "@/lib/site-url";
import { z } from "zod";
import { pullTarget } from "@/lib/code-types";

const schema = z.object({
  pullUrl: z.string().trim().min(20).max(400),
  mode: z.enum(["public", "private"]),
  aiReview: z.boolean().default(false),
});

export async function POST(request: Request) {
  const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!matchesAppOrigin(request.headers.get("origin"), configuredAppUrl() || new URL(request.url).origin)) {
    return reply({ error: "Open SkillForge at its configured address and try again." }, 403);
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
        if (size > 4096) { await reader.cancel(); return reply({ error: "The review request is too large." }, 413); }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } catch { return reply({ error: "The review request could not be read." }, 400); }
    finally { reader.releaseLock(); }
  }
  let input: unknown;
  try { input = JSON.parse(body); } catch { return reply({ error: "Paste a GitHub pull request link." }, 400); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return reply({ error: "Paste a valid GitHub pull request link." }, 400);
  try {
    const target = pullTarget(parsed.data.pullUrl);
    if (!target) return reply({ error: "Use a link in the form https://github.com/owner/repository/pull/123." }, 400);
    const repo = repositoryName(target.repo);
    let token = process.env.GITHUB_PUBLIC_READ_TOKEN;
    if (parsed.data.mode === "private") {
      const session = request.headers.has("cookie") && await (await accounts()).api.getSession({ headers: request.headers });
      if (!session) return reply({ error: "Sign in before reviewing a private repository." }, 401);
      token = /^Bearer ([A-Za-z0-9_]{10,250})$/.exec(request.headers.get("authorization") || "")?.[1];
      if (!token) return reply({ error: "Provide a repository-scoped GitHub read token." }, 401);
    }
    return await withQueryBudget(async () => reply(await reviewPullRequest(repo, target.number, parsed.data.mode, token, parsed.data.aiReview)));
  } catch (error) {
    if (error instanceof RepositoryError) return reply({ error: error.message }, error.status);
    return reply({ error: "The historical review could not be completed. Check GitHub access and try again." }, 503);
  }
}
