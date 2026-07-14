# Deploying telegram-mcp to Hetzner + regiq.in

Deploy pattern for future Claude Code sessions working on this repo.

## Server (shared with the rest of the Globalion MCP fleet)
- SSH: `root@89.167.56.16`
- Service directory: `/opt/telegram-mcp/`
- Domain: `telegram.regiq.in` (Cloudflare-tunnelled to `telegram-mcp-web:3000`)
- Container names: `telegram-mcp-web`, `telegram-mcp-db`
- **NEVER touch** other people's folders under `/opt/` — see `shreyas-onboarding.md` §7.

## Deploy a new version

From this repo on your dev machine:

```bash
tar --exclude=node_modules --exclude=.next --exclude=.git -cf - . \
  | ssh root@89.167.56.16 "mkdir -p /opt/telegram-mcp && tar -xf - -C /opt/telegram-mcp/"
ssh root@89.167.56.16 "cd /opt/telegram-mcp && docker compose up -d --build"
```

## First-time subdomain wiring (`telegram.regiq.in`)

1. Add an ingress rule to `/opt/platform/cloudflared/config.yml` on the server, BEFORE the final catch-all rule:
   ```yaml
   - hostname: telegram.regiq.in
     service: http://telegram-mcp-web:3000
   ```
2. Restart the tunnel: `ssh root@89.167.56.16 "docker restart platform-cloudflared-1"`
3. Create the DNS CNAME (needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID` from `shreyas-onboarding.md`):
   ```bash
   curl -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"type":"CNAME","name":"telegram","content":"0caf1caf-59f6-4f36-9ea5-4aa9a9f41d0b.cfargotunnel.com","proxied":true}'
   ```

## Env vars

Populated on the server via `/opt/telegram-mcp/.env` (NOT committed to git). Values live in `shreyas-onboarding.md` for shared secrets, per-app secrets are generated fresh:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — created per-MCP in Google Cloud Console
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `PUBLIC_BASE_URL=https://telegram.regiq.in`
- `NEXTAUTH_URL=https://telegram.regiq.in`

## Health & debugging

```bash
curl https://telegram.regiq.in/api/admin/health
ssh root@89.167.56.16 "docker ps --filter name=telegram-mcp --format 'table {{.Names}}\t{{.Status}}'"
ssh root@89.167.56.16 "docker logs telegram-mcp-web --tail 60"
```

## Rules (from shreyas-onboarding.md §7)

- ✅ **No LLM in this stack.** telegram-mcp is a pure transport bridge — the user's agent supplies the model. If a future feature needs inference, route via OpenRouter with the shared Globalion key, never vendor APIs direct.
- ✅ Expose `/api/admin/health` (already wired at `src/app/api/admin/health/route.ts`).
- ✅ Container names prefixed with `telegram-mcp-` and unique across the fleet.
- ✅ Container-internal port is any port (3000 here); Cloudflare tunnel handles external HTTPS.
