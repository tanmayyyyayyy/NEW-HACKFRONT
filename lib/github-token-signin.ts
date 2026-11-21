import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { repositoryName } from "./repository-chat";
import { matchesAppOrigin } from "./app-origin";
import { configuredAppUrl } from "./site-url";

export const githubTokenSignIn = {
  id: "private-github-access",
  endpoints: {
    signInWithRepository: createAuthEndpoint("/private-repository", {
      method: "POST", body: z.object({ repository: z.string().max(170) }),
    }, async ctx => {
      if (!matchesAppOrigin(ctx.headers?.get("origin"), configuredAppUrl())) throw new APIError("FORBIDDEN");
      const authorization = ctx.headers?.get("authorization") || "";
      if (!/^Bearer github_pat_[a-zA-Z0-9_]{20,240}$/.test(authorization)) {
        throw new APIError("UNAUTHORIZED", { message: "Enter a fine-grained GitHub personal access token." });
      }
      let repo: string;
      try { repo = repositoryName(ctx.body.repository); }
      catch { throw new APIError("BAD_REQUEST", {message: "Enter a GitHub repository as owner/name."}); }
      const get = async (path: string) => {
        const response = await fetch("https://api.github.com" + path, {
          headers: { authorization, Accept:"application/vnd.github+json" }, cache:"no-store", redirect:"error",
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new APIError("FORBIDDEN", { message: "GitHub could not confirm access. Check your token, repository and organization approval." });
        return response.json();
      };
      const [profile, repository] = await Promise.all([get("/user"), get("/repos/" + repo)]);
      if (!Number.isSafeInteger(profile.id) || profile.id < 1 || typeof profile.login !== "string" ||
          repository.private !== true || repository.full_name?.toLowerCase() !== repo) throw new APIError("FORBIDDEN");
      const adapter = ctx.context.internalAdapter;
      const key = { providerId:"github", accountId:String(profile.id) };
      const account = await adapter.findAccountByKey(key);
      const user = account ? await adapter.findUserById(account.userId) : (await adapter.createOAuthUser({
        name:profile.login, email:"gh-" + profile.id + "@github.skillforge.invalid", emailVerified:false,
      }, key)).user;
      if (!user) throw new APIError("UNAUTHORIZED");
      const session = await adapter.createSession(user.id);
      await setSessionCookie(ctx,{session,user},true);
      return ctx.json({repository:repo,userId:user.id});
    }),
  },
};
