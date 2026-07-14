// Telegram bot webhook.
//
// The platform is a pure pipe now — no LLM, no auto-reply. Two paths:
//
//   1. Slash-commands (/help, /clear, /recent, /usage, /window, /start)
//      are handled HERE, in-process. We answer them ourselves so the user
//      gets a useful bot even before they've connected an agent.
//
//   2. Plain text messages are just STORED. The user's agent pulls them
//      via the MCP tool get_new_messages and decides what to do.
//
// Telegram retries webhooks that take >20s, so we ack immediately.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMessage, type TelegramUpdate } from "@/lib/telegram";
import {
  storeInboundMessage,
  storePlatformReply,
  clearHistory,
  listRecentMessages,
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

  // Slash-commands: platform-handled, never surfaced to the agent.
  if (text.startsWith("/")) {
    const [cmd, ...args] = text.split(/\s+/);
    handleCommand(link.userId, link.botToken, chatId, cmd, args).catch((err) =>
      sendMessage(link.botToken, chatId, `Command failed: ${(err as Error).message}`).catch(
        () => undefined,
      ),
    );
    return NextResponse.json({ ok: true });
  }

  // Plain message: store for the agent to pull. No reply from us.
  storeInboundMessage(link.userId, text).catch(() => undefined);
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
  "`/usage` — show your request + storage usage (coming soon)",
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
      const reply = `Cleared ${deleted} messages from history.`;
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
      const count = await prisma.message.count({ where: { userId } });
      // Storage metering + rate-limit numbers land in a later phase — for
      // now just report the message count so /usage does something.
      await sendMessage(
        botToken,
        chatId,
        `You have *${count}* stored messages. Storage & request metering coming soon.`,
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
