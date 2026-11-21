// Single-instance pilot. Bound the work before contacting GitHub, Neo4j or Sarvam.
let inFlight = 0;
let starts: number[] = [];
export async function withQueryBudget(work: () => Promise<Response>) {
  const now = Date.now();
  starts = starts.filter(time => now - time < 60000);
  if (starts.length >= 90 || inFlight >= 6) return Response.json({ error: "The desk is busy. Try again shortly." },
    { status: 429, headers: { "Retry-After": "15", "Cache-Control": "no-store" } });
  starts.push(now);
  inFlight++;
  try { return await work(); } finally { inFlight--; }
}
