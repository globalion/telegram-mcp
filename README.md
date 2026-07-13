# telegram-mcp

> Built by [**Shreyas**](https://github.com/Shreyas-Profile) · Shipped by [**Globalion**](https://github.com/globalion)

Turn any Telegram bot into a chat-first AI assistant. Sign in with Google,
paste your BotFather token, message your bot. Bonus: MCP tools let external
agents (Claude Desktop, Cursor, custom scripts) push notifications to your
bot and read your recent conversation history.

- **Chat via your own Telegram bot** — you own the token, you own the data.
- **MCP over streamable-HTTP** — plug into Claude Desktop, Cursor, etc.
- **OpenRouter under the hood** — swap models freely (Claude 5, GPT, Gemini).
- **Self-host in one Docker Compose command** if you don't want us in the loop.

Hosted for free at **[telegram.regiq.in](https://telegram.regiq.in)**.

## Use it (hosted)

### As a chat assistant (main use case)

1. Visit https://telegram.regiq.in and sign in with Google.
2. In Telegram, DM [@BotFather](https://t.me/BotFather) → `/newbot`, follow prompts, copy the token.
3. Paste the token in the **Telegram bot** panel on your dashboard.
4. Open your bot on Telegram, send `/start`, then chat with it in plain English.

Commands your bot understands:
- Any plain-English message → assistant replies with memory of the conversation
- `/reset` → clears conversation history
- `/start` → welcome message

### As an MCP tool (optional)

If you want your Claude Desktop / Cursor agent to push messages into your Telegram bot:

1. On the dashboard, generate an MCP API key.
2. Add to `claude_desktop_config.json`:

    ```json
    {
      "mcpServers": {
        "telegram": {
          "url": "https://telegram.regiq.in/api/mcp",
          "headers": {
            "Authorization": "Bearer YOUR_KEY_HERE"
          }
        }
      }
    }
    ```

3. Restart Claude Desktop. Now your agent has:
   - `send_telegram_message(text)` — notify you on Telegram
   - `list_recent_messages(max)` — read recent bot history

Great for: long-running job notifications, scheduled reminders, agent-to-human handoff.

## Tools

| Tool | Purpose |
|------|---------|
| `send_telegram_message` | Push a message from your agent into the user's bot. |
| `list_recent_messages` | Return recent bot conversation for context. |

## Self-host

You'll need:
- Docker + Compose
- A Google OAuth client — [Cloud Console](https://console.cloud.google.com/apis/credentials). Scopes: `openid`, `email`, `profile`. Redirect: `<PUBLIC_BASE_URL>/api/auth/callback/google`
- An OpenRouter API key — [openrouter.ai/keys](https://openrouter.ai/keys)
- A public HTTPS domain for Telegram webhooks to reach (Cloudflare Tunnel or `ngrok http 3012` locally)

```bash
git clone https://github.com/globalion/telegram-mcp
cd telegram-mcp
cp .env.example .env
# fill in NEXTAUTH_SECRET, GOOGLE_*, OPENROUTER_API_KEY, PUBLIC_BASE_URL
docker compose up -d
# open http://localhost:3012
```

## How it works

```
                       Telegram
                          ▼
        /api/telegram/webhook/<per-user-secret>
                          │
                          ▼
                  ┌─────────────┐
                  │  chat.ts    │  loads recent history from Postgres
                  │             │  → sends to OpenRouter
                  │             │  → persists reply + sends via bot API
                  └─────────────┘

  External MCP clients (Claude Desktop, Cursor, custom agents)
                          ▼
              /api/mcp (Bearer <apiKey>)
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
     send_telegram_message    list_recent_messages
```

Per-user webhook URL segment is a random secret so a leaked bot token can't
be pointed at someone else's account. Google refresh tokens aren't touched —
Google sign-in is identity only.

## License

MIT. See `LICENSE`.
