// POST /api/telegram/link { botToken } — user posts their BotFather token
// from the dashboard. We validate it, save the row, register the webhook,
// AND install the slash-command menu (setMyCommands) so the "/" popup on
// Telegram lists everything our webhook handles.
// DELETE /api/telegram/link — remove the link (deletes webhook on Telegram).

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBotInfo, setWebhook, deleteWebhook, setBotCommands } from "@/lib/telegram";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { botToken?: string } | null;
  const botToken = body?.botToken?.trim();
  if (!botToken || !/^\d+:[\w-]+$/.test(botToken)) {
    return NextResponse.json({ error: "invalid bot token" }, { status: 400 });
  }

  let info: Awaited<ReturnType<typeof getBotInfo>>;
  try {
    info = await getBotInfo(botToken);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  // If the user is swapping bots, kill the old webhook first.
  const existing = await prisma.telegramLink.findUnique({ where: { userId: session.user.id } });
  if (existing) {
    await deleteWebhook(existing.botToken).catch(() => undefined);
  }
  const webhookSecret = randomBytes(24).toString("hex");
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) {
    return NextResponse.json(
      { error: "PUBLIC_BASE_URL env var not set on the server" },
      { status: 500 },
    );
  }
  const webhookUrl = `${base}/api/telegram/webhook/${webhookSecret}`;

  try {
    await setWebhook(botToken, webhookUrl);
    // Register the command menu — fire-and-forget so a failure here doesn't
    // block the user from linking. The bot still works without a menu.
    setBotCommands(botToken).catch(() => undefined);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  await prisma.telegramLink.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      botToken,
      botUsername: info.username,
      webhookSecret,
    },
    update: {
      botToken,
      botUsername: info.username,
      webhookSecret,
      chatId: null,
    },
  });

  return NextResponse.json({
    ok: true,
    botUsername: info.username,
    tMeUrl: `https://t.me/${info.username}`,
  });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const link = await prisma.telegramLink.findUnique({ where: { userId: session.user.id } });
  if (link) {
    await deleteWebhook(link.botToken).catch(() => undefined);
    await prisma.telegramLink.delete({ where: { userId: session.user.id } });
  }
  return NextResponse.json({ ok: true });
}
