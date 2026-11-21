import { driver } from "@/lib/neo4j";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await driver.verifyConnectivity({ database: process.env.NEO4J_DATABASE || "neo4j" });
    return Response.json({ status: "ready" });
  } catch { return Response.json({ status: "unavailable" }, { status: 503 }); }
}
