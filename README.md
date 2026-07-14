# telegram-mcp

> Built by [**Shreyas**](https://github.com/Shreyas-Profile) · Shipped by [**Globalion**](https://github.com/globalion)

**Bidirectional Telegram ⇆ agent bridge. No LLM in our stack.**

Your agent (Claude Desktop, Cursor, a custom script) is the brain. Our
platform is the pipe: we take messages you send on Telegram, store them,
and hand them to your agent when it polls. When your agent has something
to say back, it pushes through us to your Telegram.

- **Bring your own agent.** Any MCP client works.
- **No inference in the middle.** We don't call an LLM. No vendor lock-in.
- **Bidirectional.** `get_new_messages` pulls inbound, `send_telegram_message` pushes outbound.
- **Platform slash-commands.** `/help`, `/clear`, `/recent`, `/window`, `/usage` all work even if your agent is offline.

Hosted at **[telegram.regiq.in](https://telegram.regiq.in)** or self-host with the Docker Compose below.

## Use it (hosted)

1. Visit https://telegram.regiq.in, sign in with Google.
2. DM [@BotFather](https://t.me/BotFather) → `/newbot`. Paste the token in your dashboard.
3. On the dashboard: **Generate MCP API key**, copy it.
4. Add to Claude Desktop's `claude_desktop_config.json` (or Cursor / any MCP client):

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

5. Send `/start` to your bot on Telegram.

Now your agent can call `get_new_messages` to see what you sent it, and `send_telegram_message` to reply.

## Tools

| Tool | Direction | Notes |
|------|-----------|-------|
| `get_new_messages()` | user → agent | Returns inbound messages since the last pull. Read-once. |
| `send_telegram_message(text)` | agent → user | Delivers text to the user's Telegram bot. |
| `list_recent_messages(max=20)` | read | Last N stored messages, both directions. No cursor advance. |
| `clear_history()` | action | Wipes stored history for the user. |

## Slash commands (platform-handled)

Handled by the platform directly — your agent isn't involved. So `/help` works even when nothing is polling.

| Command | Effect |
|---------|--------|
| `/start` | Registers this Telegram chat with your account. |
| `/help` | Lists commands. |
| `/recent [N]` | Shows the last N stored messages. |
| `/clear` | Wipes history. |
| `/window N` | Sets the history window (default 20). |
| `/usage` | Stored message count. |

## Self-host

You'll need:
- Docker + Compose
- A Google OAuth client — [Cloud Console](https://console.cloud.google.com/apis/credentials). Scopes: `openid`, `email`, `profile`. Redirect: `<PUBLIC_BASE_URL>/api/auth/callback/google`
- A public HTTPS domain for Telegram webhooks (Cloudflare Tunnel or `ngrok http 3012` locally)

**No LLM key required.** Your agent brings its own model.

```bash
git clone https://github.com/globalion/telegram-mcp
cd telegram-mcp
cp .env.example .env
# fill NEXTAUTH_SECRET, GOOGLE_*, PUBLIC_BASE_URL
docker compose up -d
# open http://localhost:3012
```

## Architecture

```
  Telegram app                                Your MCP agent
     ▲   │                                      ▲   │
     │   │ text                          poll   │   │ push
     │   ▼                                      │   ▼
   ┌──────────────────────────────────────────────────┐
   │  Our platform (Hetzner)                          │
   │  - /api/telegram/webhook/<per-user-secret>       │
   │    · slash-commands answered here                │
   │    · plain text stored, no reply                 │
   │  - /api/mcp   Bearer-auth JSON-RPC               │
   │    · get_new_messages, send_telegram_message     │
   │    · list_recent_messages, clear_history         │
   │  - Postgres: User, ApiKey, TelegramLink, Message │
   └──────────────────────────────────────────────────┘
```

Per-user webhook URL segment is a random secret so a leaked bot token can't
be pointed at someone else's account. Google sign-in is identity + ban
anchor only — per-message identity comes from the MCP API key + chatId.

## License

MIT. See `LICENSE`.
