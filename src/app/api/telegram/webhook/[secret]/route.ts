// Telegram bot webhook.
//
// URL shape: /api/telegram/webhook/<secret> where <secret> maps 1:1 to a
// user via TelegramLink.webhookSecret. On first message we bind chatId to
// the user; every subsequent message goes through the LLM and gets a reply.
//
// Telegram retries webhooks that take >20s, so we ack immediately and
// process the message asynchronously.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMessage, type TelegramUpdate } from "@/lib/telegram";
import { respondToUserMessage } from "@/lib/chat";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  const link = await prisma.telegramLink.findUnique({ where: { webhookSecret: secret } });
  if (!link) {
    // Return 200 so Telegram doesn't back off and eventually disable the
    // webhook — silently ignore unknown secrets.
    return NextResponse.json({ ok: true });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const msg = update?.message;
  if (!msg?.text) return NextResponse.json({ ok: true });

  const chatId = String(msg.chat.id);
  if (!link.chatId || link.chatId !== chatId) {
    await prisma.telegramLink.update({
      where: { id: link.id },
      data: { chatId },
    });
  }

  if (msg.text.trim() === "/start") {
    await sendMessage(
      link.botToken,
      chatId,
      [
        "Connected. I'm your AI assistant running through this bot.",
        "",
        "Just message me in plain English — I remember our conversation, so you don't need to repeat context.",
        "",
        "Use `/reset` to clear our conversation history.",
      ].join("\n"),
    ).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  if (msg.text.trim() === "/reset") {
    await prisma.message.deleteMany({ where: { userId: link.userId } });
    await sendMessage(link.botToken, chatId, "Conversation history cleared.").catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  // Fire-and-forget: ack Telegram fast, do the LLM call after.
  respondToUserMessage(link.userId, msg.text)
    .then((reply) => sendMessage(link.botToken, chatId, reply))
    .catch(async (err) => {
      await sendMessage(
        link.botToken,
        chatId,
        `Something broke: ${(err as Error).message}`,
      ).catch(() => undefined);
    });

  return NextResponse.json({ ok: true });
}
