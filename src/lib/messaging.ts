// Message transport for the Telegram ⇆ agent bridge.
//
// Design: our platform is a pipe + storage. It never generates replies.
// - Inbound (Telegram → agent): the webhook stores the message; the user's
//   agent calls get_new_messages via MCP to pull unread items.
// - Outbound (agent → Telegram): the agent calls send_telegram_message; we
//   deliver via the Bot API and log the message so future list_recent_messages
//   sees it.
//
// See CLAUDE.md / redesign spec §2 for the mental model.

import { prisma } from "./db";
import { sendMessage } from "./telegram";

export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}

export async function storeInboundMessage(userId: string, text: string): Promise<void> {
  await prisma.message.create({
    data: { userId, role: "user", content: text },
  });
}

export async function storePlatformReply(userId: string, text: string): Promise<void> {
  await prisma.message.create({
    data: { userId, role: "assistant", content: text },
  });
}

/**
 * agent → user. Pushes text into the user's Telegram bot and logs it.
 * Called via MCP tool send_telegram_message.
 */
export async function pushAssistantMessage(userId: string, text: string): Promise<void> {
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  if (!link) throw new Error("This user hasn't connected a Telegram bot yet.");
  if (!link.chatId) {
    throw new Error(
      "The user's bot exists but they haven't sent /start yet, so we don't know their chat id.",
    );
  }
  await sendMessage(link.botToken, link.chatId, text);
  await prisma.message.create({
    data: { userId, role: "assistant", content: text },
  });
}

/**
 * The receive half. Returns messages with role=user that arrived AFTER the
 * caller's last pull cursor, then advances the cursor to now so those same
 * messages won't come back next call. Read-once semantics.
 */
export async function getNewMessages(userId: string): Promise<StoredMessage[]> {
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  if (!link) throw new Error("This user hasn't connected a Telegram bot yet.");

  const now = new Date();
  const rows = await prisma.message.findMany({
    where: {
      userId,
      role: "user",
      createdAt: { gt: link.lastPulledAt },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  // Only advance the cursor if we actually returned something — a caller
  // that polls constantly with nothing new shouldn't cause a churn of
  // updates to the DB.
  if (rows.length > 0) {
    await prisma.telegramLink.update({
      where: { userId },
      data: { lastPulledAt: now },
    });
  }

  return rows;
}

export async function listRecentMessages(userId: string, max?: number): Promise<StoredMessage[]> {
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  const limit = max ?? link?.windowSize ?? 20;
  const rows = await prisma.message.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return rows.reverse();
}

export async function clearHistory(userId: string): Promise<{ deleted: number }> {
  const res = await prisma.message.deleteMany({ where: { userId } });
  return { deleted: res.count };
}
