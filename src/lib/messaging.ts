// Message transport for the Telegram ⇆ agent bridge.
//
// Design: our platform is a pipe + storage. It never generates replies.
// - Inbound: webhook stores; agent calls get_new_messages to pull.
// - Outbound: agent calls send_telegram_message; we deliver + log.
//
// Storage quota (Pawan spec §5.5): 10 MB hard cap per user, 8 MB warning.
// Both directions count against the cap. Enforced at insert time — see
// `checkAndReserveStorage()`. /clear (webhook) resets `storageBytes` and
// `warnSentAt` so a fresh session gets a fresh warning if it refills.

import { prisma } from "./db";
import { sendMessage } from "./telegram";
import { isAdminUser } from "./admin";

export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}

export const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024;
export const STORAGE_WARN_BYTES = 8 * 1024 * 1024;

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf-8");
}

/**
 * Bumps storageBytes by `bytes` if it fits under the 10 MB cap. Returns:
 *   { ok: true, warn: boolean }  — reserved; caller should proceed and warn
 *                                    on Telegram if `warn` is true.
 *   { ok: false }                — over cap; caller must reject with a
 *                                    Telegram notice, not store the message.
 */
async function reserveStorage(
  userId: string,
  bytes: number,
): Promise<{ ok: true; warn: boolean } | { ok: false; used: number }> {
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  if (!link) return { ok: false, used: 0 };
  // Admins get unlimited storage — still track usage for observability, but
  // never reject and never warn.
  if (await isAdminUser(userId)) {
    await prisma.telegramLink.update({
      where: { id: link.id },
      data: { storageBytes: link.storageBytes + bytes },
    });
    return { ok: true, warn: false };
  }
  const newTotal = link.storageBytes + bytes;
  if (newTotal > STORAGE_LIMIT_BYTES) {
    return { ok: false, used: link.storageBytes };
  }
  const crossedWarn = newTotal >= STORAGE_WARN_BYTES && !link.warnSentAt;
  await prisma.telegramLink.update({
    where: { id: link.id },
    data: {
      storageBytes: newTotal,
      warnSentAt: crossedWarn ? new Date() : link.warnSentAt,
    },
  });
  return { ok: true, warn: crossedWarn };
}

async function releaseAllStorage(userId: string): Promise<void> {
  await prisma.telegramLink.updateMany({
    where: { userId },
    data: { storageBytes: 0, warnSentAt: null },
  });
}

/**
 * Store inbound Telegram message from the user. Returns null on success,
 * an error string if the message was rejected (quota exceeded). Caller
 * (webhook) should surface the error back on Telegram.
 */
export async function storeInboundMessage(
  userId: string,
  text: string,
): Promise<{ ok: true; warn: boolean } | { ok: false; reason: string; used: number }> {
  const bytes = byteLength(text);
  const reserved = await reserveStorage(userId, bytes);
  if (!reserved.ok) {
    return {
      ok: false,
      reason: `Storage limit reached (${(STORAGE_LIMIT_BYTES / 1024 / 1024).toFixed(0)} MB). Run /clear to wipe history and free space.`,
      used: reserved.used,
    };
  }
  await prisma.message.create({
    data: { userId, role: "user", content: text },
  });
  return { ok: true, warn: reserved.warn };
}

/** Store a platform-generated reply (e.g. /help response). Does NOT count
 *  against quota — these are our own, tiny, and users can't spam them. */
export async function storePlatformReply(userId: string, text: string): Promise<void> {
  await prisma.message.create({
    data: { userId, role: "assistant", content: text },
  });
}

/**
 * agent → user. Delivers a message via Telegram and logs it. Counts against
 * the user's quota (the agent could stream large replies otherwise).
 */
export async function pushAssistantMessage(userId: string, text: string): Promise<void> {
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  if (!link) throw new Error("This user hasn't connected a Telegram bot yet.");
  if (!link.chatId) {
    throw new Error(
      "The user's bot exists but they haven't sent /start yet, so we don't know their chat id.",
    );
  }
  const bytes = byteLength(text);
  const reserved = await reserveStorage(userId, bytes);
  if (!reserved.ok) {
    throw new Error(
      `User is at storage limit (${(STORAGE_LIMIT_BYTES / 1024 / 1024).toFixed(0)} MB). Ask them to run /clear.`,
    );
  }
  await sendMessage(link.botToken, link.chatId, text);
  await prisma.message.create({
    data: { userId, role: "assistant", content: text },
  });
  if (reserved.warn) {
    await sendMessage(
      link.botToken,
      link.chatId,
      `⚠ You're using over ${(STORAGE_WARN_BYTES / 1024 / 1024).toFixed(0)} MB of storage. New content is blocked at ${(STORAGE_LIMIT_BYTES / 1024 / 1024).toFixed(0)} MB. Run /clear to free space.`,
    ).catch(() => undefined);
  }
}

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
  await releaseAllStorage(userId);
  return { deleted: res.count };
}

export async function getStorageStats(userId: string): Promise<{
  usedBytes: number;
  limitBytes: number;
  messageCount: number;
}> {
  const [link, count] = await Promise.all([
    prisma.telegramLink.findUnique({ where: { userId }, select: { storageBytes: true } }),
    prisma.message.count({ where: { userId } }),
  ]);
  return {
    usedBytes: link?.storageBytes ?? 0,
    limitBytes: STORAGE_LIMIT_BYTES,
    messageCount: count,
  };
}
