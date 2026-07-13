// The chat engine.
//
// For each inbound Telegram message we:
//   1. Load the last N messages of the user's conversation from Postgres,
//   2. Prepend a small system prompt,
//   3. Stream a reply from OpenRouter (any Anthropic/OpenAI/Google model — the
//      user picks via OPENROUTER_MODEL),
//   4. Persist both the user's message and the assistant's reply.
//
// Every LLM call in every Globalion MCP goes through OpenRouter — never
// call vendor APIs directly. Costs are pooled on the shared account.

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type ModelMessage } from "ai";
import { prisma } from "./db";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
  headers: {
    "HTTP-Referer": "https://github.com/globalion/telegram-mcp",
    "X-Title": "telegram-mcp",
  },
});

const MODEL_ID = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-5";
const HISTORY_LIMIT = 40;

const SYSTEM_PROMPT = `You are the user's AI assistant, running inside their own Telegram bot.
- Be helpful, direct, and concise. Telegram messages have a 4096-character cap — write for it.
- Use markdown when it makes things clearer: **bold** for emphasis, bulleted lists for enumerations, fenced code blocks for code.
- The user is chatting from their phone or desktop; keep replies scannable.
- If the user asks you to do something you can't (send email, browse the web, take an action outside chat), say so plainly.
- If there's ambiguity, ask a short clarifying question rather than guessing.`;

export async function respondToUserMessage(userId: string, incoming: string): Promise<string> {
  // Save incoming turn first so history retrieval catches it if a retry hits.
  await prisma.message.create({
    data: { userId, role: "user", content: incoming },
  });

  const rows = await prisma.message.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { role: true, content: true },
  });
  const messages: ModelMessage[] = rows
    .reverse()
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const result = await generateText({
    model: openrouter.chat(MODEL_ID),
    system: SYSTEM_PROMPT,
    messages,
  });
  const reply = result.text.trim() || "(no reply)";

  await prisma.message.create({
    data: { userId, role: "assistant", content: reply },
  });

  return reply;
}

export async function listRecentMessages(userId: string, max = 20) {
  return prisma.message.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, max)),
    select: { id: true, role: true, content: true, createdAt: true },
  });
}

// Direct push from an external agent (via MCP) — insert the message into the
// conversation log AND deliver it to the user on Telegram. Does NOT run the
// LLM; the caller decided what to say.
export async function pushAssistantMessage(userId: string, text: string): Promise<void> {
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  if (!link) throw new Error("This user hasn't connected a Telegram bot yet.");
  if (!link.chatId) {
    throw new Error(
      "The user's bot exists but they haven't sent /start yet, so we don't know their chat id.",
    );
  }
  // Lazy import to avoid a cycle (telegram.ts is trivial but keeps chat.ts pure).
  const { sendMessage } = await import("./telegram");
  await sendMessage(link.botToken, link.chatId, text);
  await prisma.message.create({
    data: { userId, role: "assistant", content: text },
  });
}
