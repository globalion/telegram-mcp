// Thin wrapper over the Telegram Bot API. Each user brings their own bot,
// so functions take an explicit botToken rather than reading from env.

const API = "https://api.telegram.org/bot";

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function call<T>(botToken: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as TelegramResponse<T>;
  if (!json.ok) {
    throw new Error(`Telegram ${method} failed: ${json.description ?? res.statusText}`);
  }
  return json.result as T;
}

export async function sendMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  opts: { replyToMessageId?: number; parseMode?: "Markdown" | "MarkdownV2" | "HTML" } = {},
): Promise<void> {
  await call(botToken, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4096),
    parse_mode: opts.parseMode ?? "Markdown",
    reply_to_message_id: opts.replyToMessageId,
  });
}

export interface BotInfo {
  id: number;
  username: string;
  first_name: string;
}

export async function getBotInfo(botToken: string): Promise<BotInfo> {
  return call<BotInfo>(botToken, "getMe", {});
}

export async function setWebhook(botToken: string, url: string): Promise<void> {
  await call(botToken, "setWebhook", {
    url,
    allowed_updates: ["message"],
  });
}

export async function deleteWebhook(botToken: string): Promise<void> {
  await call(botToken, "deleteWebhook", { drop_pending_updates: true });
}

// Subset of the Telegram Update payload we care about.
export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; is_bot: boolean; username?: string };
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}
