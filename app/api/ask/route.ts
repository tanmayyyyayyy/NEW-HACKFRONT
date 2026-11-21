import { withQueryBudget } from "@/lib/query-budget";
import { accounts } from "@/lib/auth";
import { z } from "zod";
import { RepositoryError, repositoryEvidence, repositoryName } from "@/lib/repository-chat";
import { matchesAppOrigin } from "@/lib/app-origin";
import { explainEvidence } from "@/lib/answer-explanation";

const requestSchema = z.object({
  question: z.string().trim().min(3).max(500),
  repo: z.string().trim().min(3).max(170),
  mode: z.enum(["public", "private"]),
  language: z.enum(["English", "Hindi", "Hinglish"]),
  contextIds: z.array(z.string().regex(/^(?:#[1-9]\d{0,9}|[a-f0-9]{40})$/)).max(5).default([]),
  throughDate: z.iso.date().optional(),
  sarvam: z.boolean().default(false),
});

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const origin = request.headers.get("origin");
  const appOrigin = process.env.APP_ORIGIN || new URL(request.url).origin;
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
  if (!parsed.success) return reply({ error: "Enter a valid repository and a question between 3 and 500 characters." }, 400);
  try {
    const { mode, question, language, sarvam } = parsed.data;
    if (mode === "private") {
      if (!request.headers.get("cookie") || !(await (await accounts()).api.getSession({ headers: request.headers }))) return reply({ error: "Sign in before opening a private repository." }, 401);
    }
    const repo = repositoryName(parsed.data.repo);
    const authorization = request.headers.get("authorization");
    const token = mode === "private" ? /^Bearer ([A-Za-z0-9_]{10,250})$/.exec(authorization ?? "")?.[1] : undefined;
    return await withQueryBudget(async () => {
      const trail = await repositoryEvidence(repo, mode, question, token, parsed.data.contextIds, parsed.data.throughDate);
      const explanation = sarvam ? await explainEvidence(language, question, trail.evidence) : null;
      return reply({ ...trail, summary: explanation?.summary ?? null,
        sarvamUnavailable: explanation?.status === "unavailable" || explanation?.status === "not-configured",
        explanationStatus: explanation?.status ?? null,
        explanationProvider: explanation?.provider ?? null });
    });
  } catch (err) {
    if (err instanceof RepositoryError) return reply({ error: err.message }, err.status);
    return reply({ error: "Repository evidence is temporarily unavailable. Check GitHub access and Neo4j connectivity." }, 503);
  }
}
