// agent-runner: an "agent" that polls telegram-mcp and answers with Claude.
//
// This is what a user would build themselves per Pawan's spec §2 — a loop
// that polls get_new_messages, thinks, and calls send_telegram_message.
// We ship one as a sidecar so Shreyas's own Telegram bot has a brain
// without him needing to keep Claude Desktop running.
//
// Zero npm deps — plain Node 20 with built-in fetch + AbortController.
//
// Env (see docker-compose):
//   MCP_URL              e.g. https://telegram.regiq.in/api/mcp
//   MCP_API_KEY          tg_live_… (Bearer token for MCP calls)
//   OPENROUTER_API_KEY   sk-or-v1-… (shared Globalion key)
//   OPENROUTER_MODEL     any OpenRouter model id (default anthropic/claude-sonnet-5)
//   POLL_INTERVAL_MS     default 5000
//   HISTORY_WINDOW       how many past messages to include as LLM context (default 20)

const MCP_URL = need("MCP_URL");
const MCP_API_KEY = need("MCP_API_KEY");
const OPENROUTER_API_KEY = need("OPENROUTER_API_KEY");
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-5";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
const HISTORY_WINDOW = Number(process.env.HISTORY_WINDOW || 20);

const SYSTEM_PROMPT = `You are Shreyas's personal AI assistant, running inside his Telegram bot.
- Be helpful, direct, and concise. Telegram messages have a 4096-character cap — write for it.
- Use markdown when it makes things clearer: **bold** for emphasis, bulleted lists for enumerations, fenced code blocks for code.
- The user is chatting from his phone or desktop; keep replies scannable.
- If asked to do something outside chat (send email, browse the web, take a real-world action), say so plainly rather than pretending.
- If ambiguity is real, ask ONE short clarifying question rather than guessing.`;

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`agent-runner: missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

async function mcpCall(method, params) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MCP_API_KEY}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`MCP ${method} error: ${json.error.message}`);
  return json.result;
}

async function pullNew() {
  const r = await mcpCall("tools/call", {
    name: "get_new_messages",
    arguments: {},
  });
  return r.structuredContent?.messages ?? [];
}

async function pullRecentContext() {
  const r = await mcpCall("tools/call", {
    name: "list_recent_messages",
    arguments: { max: HISTORY_WINDOW },
  });
  return r.structuredContent ?? [];
}

async function reply(text) {
  await mcpCall("tools/call", {
    name: "send_telegram_message",
    arguments: { text },
  });
}

async function askClaude(historyMessages) {
  const messages = historyMessages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://github.com/globalion/telegram-mcp",
      "X-Title": "telegram-mcp agent-runner",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 1024,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `OpenRouter ${res.status}: ${json?.error?.message ?? JSON.stringify(json).slice(0, 200)}`,
    );
  }
  return json.choices?.[0]?.message?.content?.trim() ?? "(no reply)";
}

async function tick() {
  const fresh = await pullNew();
  if (fresh.length === 0) return;
  console.log(`[${new Date().toISOString()}] ${fresh.length} new message(s)`);
  // Use the full recent-history window as LLM context so the assistant sees
  // its own prior replies too, not just the new inbound. get_new_messages
  // has already advanced the read cursor, so this is purely for context.
  const history = await pullRecentContext();
  const text = await askClaude(history);
  await reply(text);
}

async function main() {
  console.log(
    `[${new Date().toISOString()}] agent-runner started · MCP=${MCP_URL} · model=${OPENROUTER_MODEL} · every ${POLL_INTERVAL_MS}ms`,
  );
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error(`[${new Date().toISOString()}] tick error:`, err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
