import { RepositoryError, requestGithub } from "./repository-chat";

export async function listOpenPulls(repo: string, mode: "public" | "private", credential?: string, page = 1) {
  const prefix = "/repos/" + repo;
  const metadata = JSON.parse(await requestGithub(prefix, credential));
  if (metadata.full_name?.toLowerCase() !== repo || metadata.private !== (mode === "private")) {
    throw new RepositoryError("Open this repository using its matching public or private access mode.", 403);
  }
  const pulls = JSON.parse(await requestGithub(prefix + `/pulls?state=open&sort=updated&per_page=20&page=${page}`, credential)) as
    { number: number; title: string; draft?: boolean; user?: { login?: string }; updated_at: string }[];
  return { pulls: pulls.map(pull => ({ number: pull.number, title: pull.title, draft: Boolean(pull.draft),
    author: pull.user?.login ?? "", updated: pull.updated_at })), hasNext: pulls.length === 20 && page < 500 };
}
