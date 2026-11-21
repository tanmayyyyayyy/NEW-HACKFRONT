import { createHash } from "node:crypto";
import { z } from "zod";
import { accounts } from "@/lib/auth";
import { matchesAppOrigin } from "@/lib/app-origin";
import { configuredAppUrl } from "@/lib/site-url";
import { withQueryBudget } from "@/lib/query-budget";
import { graphModel, sourceFileLimit, treeEntryLimit } from "@/lib/graph-model";
import { persistRepositoryGraph } from "@/lib/repository-graph";
import { driver } from "@/lib/neo4j";

const maxBody = 1024 * 1024;
const path = z.string().min(1).max(400).refine(value =>
  !/[\\\u0000-\u001f]/.test(value) && value.split("/").length < 80 &&
  value.split("/").every(part => part && part !== "." && part !== ".." && part !== ".git"),
);
const upload = z.object({
  name: path.refine(value => !value.includes("/")),
  paths: z.array(path).min(1).max(treeEntryLimit),
  imports: z.array(z.object({ path, specs: z.array(z.string().min(1).max(200)).max(50) })).max(sourceFileLimit),
  partial: z.boolean(),
});
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  if (!request.headers.has("cookie")) return reply({ error: "Sign in to open saved folders." }, 401);
  try {
    const session = await (await accounts()).api.getSession({ headers: request.headers });
    if (!session) return reply({ error: "Sign in to open saved folders." }, 401);
    const folderName = new URL(request.url).searchParams.get("name");
    const database = process.env.NEO4J_DATABASE || "neo4j";
    if (folderName) {
      if (!path.safeParse(folderName).success || folderName.includes("/")) return reply({ error: "Invalid folder name." }, 400);
      const key = JSON.stringify(["folder", session.user.id, folderName]);
      const result = await driver.executeQuery(
        "MATCH (g:SkillForgeGraph {key: $key}) RETURN g.snapshot AS snapshot ORDER BY g.indexedAt DESC LIMIT 1",
        { key }, { database, routing: "READ" },
      );
      return result.records.length ? reply(JSON.parse(result.records[0].get("snapshot"))) : reply({ error: "Saved folder not found." }, 404);
    }
    const prefix = JSON.stringify(["folder", session.user.id]).slice(0, -1) + ",";
    const result = await driver.executeQuery(
      `MATCH (g:SkillForgeGraph) WHERE g.key STARTS WITH $prefix
      RETURN g.key AS key, max(g.indexedAt) AS indexedAt ORDER BY indexedAt DESC LIMIT 20`,
      { prefix }, { database, routing: "READ" },
    );
    return reply({ folders: result.records.map(record => JSON.parse(record.get("key"))[2]) });
  } catch { return reply({ error: "Saved folders are unavailable right now." }, 503); }
}

export async function POST(request: Request) {
  if (!matchesAppOrigin(request.headers.get("origin"), configuredAppUrl() || new URL(request.url).origin)) {
    return reply({ error: "Open SkillForge at its configured address before uploading." }, 403);
  }
  if (!request.headers.has("cookie")) return reply({ error: "Sign in before indexing a local folder." }, 401);
  if (Number(request.headers.get("content-length")) > maxBody) return reply({ error: "The folder index exceeds 1 MB." }, 413);
  return withQueryBudget(async () => {
    try {
      const session = await (await accounts()).api.getSession({ headers: request.headers });
      if (!session) return reply({ error: "Sign in before indexing a local folder." }, 401);
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: "Choose a folder with files to index." }, 400);
      const decoder = new TextDecoder();
      let size = 0;
      let body = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maxBody) {
            await reader.cancel();
            return reply({ error: "The folder index exceeds 1 MB." }, 413);
          }
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      } finally { reader.releaseLock(); }
      let json: unknown;
      try { json = JSON.parse(body); } catch { return reply({ error: "Invalid folder index." }, 400); }
      const parsed = upload.safeParse(json);
      if (!parsed.success) return reply({ error: "The folder contains unsupported paths or exceeds the index limit." }, 400);
      const { name, paths, imports, partial } = parsed.data;
      const revision = createHash("sha256").update(body).digest("hex");
      const model = graphModel({
        repository: name, source: "folder", revision, nodes: [], edges: [], indexedAt: new Date().toISOString(),
        coverage: { files: 0, importFiles: 0, treePartial: partial, historyPartial: true },
      });
      paths.forEach(model.file);
      for (const item of imports) model.imports(item.path, item.specs);
      return reply(await persistRepositoryGraph(JSON.stringify(["folder", session.user.id, name]), model.finish()));
    } catch {
      return reply({ error: "The folder could not be indexed. Check Neo4j and try again." }, 503);
    }
  });
}
