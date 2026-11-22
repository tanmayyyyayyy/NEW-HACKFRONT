"use client";
import { useEffect, useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/react";
import { useRouter } from "next/navigation";
import { transferPrivateAccess } from "../private-transfer";
const client = createAuthClient();
type Mode = "signin" | "signup" | "forgot" | "reset";

export function AccountForm({ methods, initialPath }: { initialPath: "public" | "private"; methods: { github: boolean; google: boolean; email: boolean } }) {
  const router = useRouter();
  const { data: session, isPending } = client.useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [path, setPath] = useState(initialPath);
  const destination = "/workspace?path=" + path;
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("token")) { setToken(params.get("token")!); setMode("reset"); history.replaceState(null, "", "/account"); }
    if (params.has("error")) setNotice("This link has expired or sign-in was interrupted. Please try again.");
  }, []);
  async function run(action: () => Promise<{ error?: { message?: string } | null }>, success = "") {
    setBusy(true); setNotice("");
    try { const result = await action(); setNotice(result.error ? result.error.message || "Please try again." : success); }
    catch { setNotice("Connection interrupted. Please try again."); } finally { setBusy(false); }
  }
  async function connectPrivate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = new FormData(form);
    const access = String(fields.get("access") || "").trim();
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/auth/private-repository", { method:"POST", headers:{
        "Content-Type":"application/json", Authorization:"Bearer " + access,
      }, body:JSON.stringify({repository:fields.get("repository")}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Check repository access and try again.");
      transferPrivateAccess({userId:data.userId, repository:data.repository, token:access});
      form.reset();
      router.push("/workspace?path=private");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not connect.");
    } finally { setBusy(false); }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    const email = String(fields.get("email") || "");
    const password = String(fields.get("password") || "");
    if (mode === "forgot") return run(() => client.requestPasswordReset({ email, redirectTo: "/account" }), "If your account exists, check your inbox for a reset link.");
    if (mode === "reset") return run(async () => {
      const result = await client.resetPassword({ token, newPassword: password });
      if (!result.error) setMode("signin");
      return result;
    }, "Password updated. You can sign in.");
    if (mode === "signup") return run(() => client.signUp.email({ name: String(fields.get("name")), email, password, callbackURL: destination }), "Check your inbox to verify your address.");
    return run(() => client.signIn.email({ email, password, callbackURL: destination }));
  }
  if (isPending) return <p role="status">Checking your session…</p>;
  return <section><fieldset className="access-picks"><legend>Workspace access</legend>
    {(["private","public"] as const).map(value => <label key={value}><input type="radio" name="path" checked={value === path} disabled={busy} onChange={() => setPath(value)} />
      <span><strong>{value === "private" ? "Private team handover" : "Public repo learning"}</strong><small>{value === "private" ? "For engineers with access to a team repository." : "For exploring GitHub projects at your own pace."}</small></span></label>)}</fieldset>
    {path === "private" && !session && mode === "signin" && <form method="post" onSubmit={connectPrivate}>
      <h2>Connect a private repository</h2>
      <p>Sign in with your GitHub repository token. Ask your manager to grant you read access in GitHub first.</p>
      <label>Private repository<input name="repository" required placeholder="organization/repository" maxLength={170} /></label>
      <label>Fine-grained read token<input name="access" type="password" required autoComplete="off" /></label>
      <small>Select this repository and allow read access to contents, issues and pull requests. The token stays in tab memory and is sent to SkillForge for GitHub requests.</small>
      <button className="action" disabled={busy}>Connect private repository</button>
    </form>}
    {session && mode !== "reset" ? <><p>Signed in as {session.user.name || session.user.email}</p><a className="ink-button" href={destination}>Enter workspace →</a>
    <button disabled={busy} onClick={() => run(() => client.signOut())}>Sign out</button></> : <>
    {path === "public" && mode !== "reset" && <a className="ink-button" href={destination}>Continue as guest →</a>}
    {(["github", "google"] as const).map(provider => methods[provider] && <button key={provider} disabled={busy}
      onClick={() => run(() => client.signIn.social({ provider, callbackURL: destination }))}>Continue with {provider === "github" ? "GitHub" : "Google"}</button>)}
    {methods.email && <form key={mode} method="post" onSubmit={submit}>
      <h2>{{ signin: "Sign in with email", signup: "Create an account", forgot: "Recover your account", reset: "Choose a new password" }[mode]}</h2>
      {mode === "signup" && <label>Name<input name="name" required autoComplete="name" /></label>}
      {mode !== "reset" && <label>Email<input name="email" type="email" required autoComplete="email" /></label>}
      {mode !== "forgot" && <label>Password<input name="password" type="password" required minLength={mode === "signin" ? 1 : 12} autoComplete={mode === "signin" ? "current-password" : "new-password"} /></label>}
      <button className="action" disabled={busy}>{ { signin: "Sign in", signup: "Create account", forgot: "Send reset link", reset: "Save new password" }[mode]}</button>
      {(["signin", "signup", "forgot"] as const).filter(x => x !== mode).map(x => <button type="button" key={x} onClick={() => { setMode(x); setNotice(""); }}>{ {signin:"Sign in", signup:"Create account", forgot:"Forgot password?"}[x]}</button>)}
    </form>}
    {path === "public" && !Object.values(methods).some(Boolean) && <p>Sign-in providers haven’t been connected on this installation. The public repository desk is open.</p>}
    </>}<p role="status">{busy ? "Connecting…" : notice}</p></section>;
}
