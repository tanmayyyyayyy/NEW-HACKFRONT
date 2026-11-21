import { githubTokenSignIn } from "./github-token-signin";
import { trustedAppOrigins } from "./app-origin";
import { betterAuth } from "better-auth";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getMigrations } from "better-auth/db/migration";

export function loginMethods() {
  return {
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  };
}

async function sendMail(email: string, subject: string, url: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject, text: subject + "\n\n" + url }),
  });
  if (!response.ok) throw new Error("Account email could not be delivered.");
}

async function initialize() {
  const baseURL = process.env.APP_ORIGIN;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!baseURL || !secret || secret.length < 32) throw new Error("Configure the account origin and secret.");
  const file = process.env.ACCOUNT_DATABASE || ".local/accounts.sqlite";
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(file);
  database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
  const methods = loginMethods();
  const options = {
    appName: "SkillForge", baseURL, secret, database,
    trustedOrigins: trustedAppOrigins(baseURL),
    plugins: [githubTokenSignIn],
    account: { encryptOAuthTokens: true },
    rateLimit: { enabled: true, storage: "database" as const },
    socialProviders: {
      ...(methods.github && { github: { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! } }),
      ...(methods.google && { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } }),
    },
    emailAndPassword: { enabled: methods.email, minPasswordLength: 12, requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }: { user: { email: string }; url: string }) => sendMail(user.email, "Reset your SkillForge password", url) },
    emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }: { user: { email: string }; url: string }) => sendMail(user.email, "Verify your SkillForge email", url) },
  };
  try {
    const migrations = await getMigrations(options);
    await migrations.runMigrations();
    return betterAuth(options);
  } catch (error) { database.close(); throw error; }
}
let ready: ReturnType<typeof initialize> | undefined;
export function accounts() {
  return ready ??= initialize().catch(error => { ready = undefined; throw error; });
}
