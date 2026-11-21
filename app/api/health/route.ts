import { driver } from "@/lib/neo4j";

export const dynamic = "force-dynamic";

export async function GET() {
  let neo4jReady = false;
  try {
    await driver.verifyConnectivity({ database: process.env.NEO4J_DATABASE || "neo4j" });
    neo4jReady = true;
  } catch {
    neo4jReady = false;
  }

  return Response.json(
    {
      status: "ready",
      service: "skillforge",
      neo4j: neo4jReady ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
