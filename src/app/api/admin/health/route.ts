// Health check for future central monitoring across the Globalion MCP fleet.
// Required per shreyas-onboarding.md §7. Returns 200 with basic status when
// the DB is reachable, 503 when it isn't.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: "telegram-mcp",
      version: "0.1.0",
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 503 },
    );
  }
}
