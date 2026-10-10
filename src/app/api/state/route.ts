import { getDashboardState } from "@/lib/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await getDashboardState(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("dashboard state failed", error);
    return Response.json({ error: "Could not load live data from Stellar RPC." }, { status: 502 });
  }
}
