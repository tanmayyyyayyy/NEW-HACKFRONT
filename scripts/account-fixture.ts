import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { accounts } from "../lib/auth";

export async function verifiedTestSession() {
  const origin = "http://localhost:3000";
  Object.assign(process.env, { APP_ORIGIN: origin, BETTER_AUTH_SECRET: randomBytes(40).toString("hex"),
    ACCOUNT_DATABASE: join(await mkdtemp(join(tmpdir(), "sf-account-")), "fixture.sqlite"),
    RESEND_API_KEY: "fixture", EMAIL_FROM: "test@example.org" });
  const service = await accounts();
  const call = async (path: string, data: object, cookie = "") => service.handler(new Request(origin + "/api/auth/" + path, {
    method: "POST", headers: { origin, "content-type":"application/json", cookie }, body: JSON.stringify(data),
  }));
  const email = "tester@example.org", password = "correct-fixture-password";
  let link = "";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url) !== "https://api.resend.com/emails") return realFetch(url, options);
    link = JSON.parse(String(options?.body)).text.split("\n").at(-1);
    return Response.json({ id:"fixture" });
  };
  try {
    assert.equal((await call("sign-up/email", { name:"Tester", email, password })).status, 200);
    assert.notEqual((await call("sign-in/email", {email,password})).status, 200);
    assert(link.startsWith(origin + "/api/auth/verify-email"));
    await service.handler(new Request(link));
    const signed = await call("sign-in/email", {email,password});
    assert.equal(signed.status, 200);
    const cookie = signed.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
    assert((await service.api.getSession({ headers: new Headers({cookie}) }))?.user.email === email);
    await call("request-password-reset", {email,redirectTo:"/account"});
    const resetLink = await service.handler(new Request(link));
    const resetToken = new URL(resetLink.headers.get("location")!,origin).searchParams.get("token");
    assert(resetToken);
    const newPassword = "second-fixture-password";
    assert.equal((await call("reset-password",{token:resetToken, newPassword})).status,200);
    assert.equal(await service.api.getSession({headers:new Headers({cookie})}),null);
    const fresh = await call("sign-in/email",{email,password:newPassword});
    assert.equal(fresh.status,200);
    const freshCookie = fresh.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
    return { cookie: freshCookie, revoke: async () => {
      assert.equal((await call("sign-out", {}, freshCookie)).status, 200);
      assert.equal(await service.api.getSession({headers: new Headers({cookie:freshCookie})}), null);
    }};
  } finally { globalThis.fetch = realFetch; }
}
