// Telegram bot webhook.
//
// The platform is a pure pipe now — no LLM, no auto-reply. Two paths:
//
//   1. Slash-commands (/help, /clear, /recent, /usage, /window, /start)
//      are handled HERE, in-process. So the bot is useful even before
//      the user's agent is online.
//
//   2. Plain text messages are STORED. The user's agent pulls them via
//      the MCP get_new_messages tool.
//
// Storage cap (10 MB) is enforced at storeInboundMessage — over quota
// bounces back a Telegram notice instead of storing.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMessage, type TelegramUpdate } from "@/lib/telegram";
import {
  storeInboundMessage,
  storePlatformReply,
  clearHistory,
  listRecentMessages,
  getStorageStats,
  STORAGE_LIMIT_BYTES,
  STORAGE_WARN_BYTES,
} from "@/lib/messaging";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  const link = await prisma.telegramLink.findUnique({ where: { webhookSecret: secret } });
  if (!link) return NextResponse.json({ ok: true });

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

  const text = msg.text.trim();

  if (text.startsWith("/")) {
    const [cmd, ...args] = text.split(/\s+/);
    handleCommand(link.userId, link.botToken, chatId, cmd, args).catch((err) =>
      sendMessage(link.botToken, chatId, `Command failed: ${(err as Error).message}`).catch(
        () => undefined,
      ),
    );
    return NextResponse.json({ ok: true });
  }

  // Plain message: try to store; if quota exceeded, tell the user.
  storeInboundMessage(link.userId, text)
    .then(async (result) => {
      if (!result.ok) {
        await sendMessage(link.botToken, chatId, `⛔ ${result.reason}`).catch(() => undefined);
        return;
      }
      if (result.warn) {
        await sendMessage(
          link.botToken,
          chatId,
          `⚠ You're using over ${(STORAGE_WARN_BYTES / 1024 / 1024).toFixed(0)} MB of storage. New content is blocked at ${(STORAGE_LIMIT_BYTES / 1024 / 1024).toFixed(0)} MB. Run /clear to free space.`,
        ).catch(() => undefined);
      }
    })
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}

const HELP_TEXT = [
  "*telegram-mcp — Telegram bridge for your agent*",
  "",
  "I don't reply on my own — I forward what you send to your MCP-connected agent (Claude Desktop, Cursor, or your own script). It pulls, thinks, and pushes replies back through me.",
  "",
  "*Commands (handled by this bot directly):*",
  "`/help` — this message",
  "`/recent [N]` — show the last N messages (default = your window size)",
  "`/clear` — wipe stored conversation history",
  "`/usage` — show storage + message counts",
  "`/window N` — set the history window size (default 20)",
  "",
  "Anything not starting with `/` is queued for your agent. If nothing replies, your agent probably isn't running.",
].join("\n");

async function handleCommand(
  userId: string,
  botToken: string,
  chatId: string,
  cmd: string,
  args: string[],
): Promise<void> {
  switch (cmd.toLowerCase().split("@")[0]) {
    case "/start": {
      const reply = [
        "Connected. This chat is now bridged to your MCP agent.",
        "",
        "Message me in plain English and your agent will see it when it polls. Type `/help` for what I can do on my own.",
      ].join("\n");
      await sendMessage(botToken, chatId, reply);
      await storePlatformReply(userId, reply);
      return;
    }
    case "/help": {
      await sendMessage(botToken, chatId, HELP_TEXT);
      await storePlatformReply(userId, HELP_TEXT);
      return;
    }
    case "/clear": {
      const { deleted } = await clearHistory(userId);
      const reply = `Cleared ${deleted} messages from history. Storage reset.`;
      await sendMessage(botToken, chatId, reply);
      return;
    }
    case "/recent": {
      const n = args[0] ? Math.min(50, Math.max(1, parseInt(args[0], 10) || 20)) : undefined;
      const rows = await listRecentMessages(userId, n);
      if (rows.length === 0) {
        await sendMessage(botToken, chatId, "No messages stored yet.");
        return;
      }
      const rendered = rows
        .map((m) => {
          const who = m.role === "user" ? "you" : m.role === "assistant" ? "agent" : m.role;
          return `_${who}_: ${m.content.slice(0, 240)}`;
        })
        .join("\n\n");
      await sendMessage(botToken, chatId, rendered);
      return;
    }
    case "/window": {
      const n = parseInt(args[0] ?? "", 10);
      if (!Number.isFinite(n) || n < 1 || n > 200) {
        await sendMessage(botToken, chatId, "Usage: `/window N` where N is between 1 and 200.");
        return;
      }
      await prisma.telegramLink.update({
        where: { userId },
        data: { windowSize: n },
      });
      await sendMessage(botToken, chatId, `History window set to ${n} messages.`);
      return;
    }
    case "/usage": {
      const s = await getStorageStats(userId);
      const usedMb = (s.usedBytes / 1024 / 1024).toFixed(2);
      const limitMb = (s.limitBytes / 1024 / 1024).toFixed(0);
      await sendMessage(
        botToken,
        chatId,
        `*Storage:* ${usedMb} / ${limitMb} MB\n*Messages stored:* ${s.messageCount}\n\nRun /clear to free everything.`,
      );
      return;
    }
    default:
      await sendMessage(
        botToken,
        chatId,
        `Unknown command \`${cmd}\`. Type /help for the list.`,
      );
  }
}
