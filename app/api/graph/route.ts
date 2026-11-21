import { matchesAppOrigin } from "@/lib/app-origin";
import { configuredAppUrl } from "@/lib/site-url";
import { accounts } from "@/lib/auth";
import { withQueryBudget } from "@/lib/query-budget";
import { repositoryName, RepositoryError } from "@/lib/repository-chat";
import { readRepositoryGraph } from "@/lib/repository-graph";

export async function POST(request: Request) {
  const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const url = new URL(request.url);
  if (!matchesAppOrigin(request.headers.get("origin"), configuredAppUrl() || url.origin)) {
    return reply({ error: "Open SkillForge at its configured address and try again." }, 403);
  }
  const input = url.searchParams.get("repo") || "";
  if (input.length > 170) return reply({ error: "Enter a GitHub repository or URL." }, 400);
  return withQueryBudget(async () => {
    try {
      const repo = repositoryName(input);
      const mode = url.searchParams.get("mode") === "private" ? "private" : "public";
      let owner = "";
      let token: string | undefined;
      if (mode === "private") {
        const session = request.headers.has("cookie") && await (await accounts()).api.getSession({ headers: request.headers });
        if (!session) return reply({ error: "Sign in before indexing a private repository." }, 401);
        token = /^Bearer ([A-Za-z0-9_]{10,250})$/.exec(request.headers.get("authorization") || "")?.[1];
        if (!token) return reply({ error: "Provide a GitHub read token scoped to this repository." }, 401);
        owner = session.user.id;
      }
      return reply(await readRepositoryGraph(repo, mode, owner, token, url.searchParams.get("refresh") === "1"));
    } catch (error) {
      if (error instanceof RepositoryError) return reply({ error: error.message }, error.status);
      return reply({ error: "The repository graph could not be indexed. Check GitHub and Neo4j availability and try again." }, 503);
    }
  });
}
