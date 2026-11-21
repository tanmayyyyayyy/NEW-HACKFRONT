import { accounts } from "@/lib/auth";

async function handle(request: Request) {
  try { return await (await accounts()).handler(request); }
  catch { return Response.json({ message: "Account service unavailable." }, { status: 503 }); }
}
export { handle as GET, handle as POST };
