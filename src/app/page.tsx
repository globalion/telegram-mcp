import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignInButton } from "./signin-button";

const CONFIG_SNIPPET = `{
  "mcpServers": {
    "telegram": {
      "url": "https://telegram.regiq.in/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_KEY>"
      }
    }
  }
}`;

export default async function LandingPage() {
  const session = await auth().catch(() => null);
  const signedIn = !!session?.user;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-14">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
          Telegram · MCP · streamable-http
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          telegram-mcp
        </h1>
        <p className="mt-4 max-w-xl text-lg text-neutral-400">
          Turn any Telegram bot into a chat-first AI assistant. Sign in with
          Google, paste your BotFather token, message your bot. Also plugs
          into Claude Desktop, Cursor, and any MCP client so external agents
          can push notifications to your bot.
        </p>
        <div className="mt-8 flex gap-3">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-teal-400"
            >
              Open dashboard →
            </Link>
          ) : (
            <SignInButton />
          )}
          <Link
            href="https://github.com/globalion/telegram-mcp"
            target="_blank"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2.5 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            GitHub ↗
          </Link>
        </div>
      </div>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          How it works
        </h2>
        <ol className="space-y-2 text-neutral-300">
          <li>1. Sign in with Google (that&apos;s your identity).</li>
          <li>2. In Telegram, DM <a href="https://t.me/BotFather" target="_blank" className="text-teal-300 underline">@BotFather</a> → <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">/newbot</code> → copy the token.</li>
          <li>3. Paste the token in your dashboard here.</li>
          <li>4. Open your bot on Telegram, send <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">/start</code>, then chat with it.</li>
        </ol>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          MCP tools (optional)
        </h2>
        <p className="mb-3 text-sm text-neutral-400">
          Add this to Claude Desktop&apos;s{" "}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">claude_desktop_config.json</code>
          {" "}to let your agent push messages into your Telegram bot:
        </p>
        <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-200">
          {CONFIG_SNIPPET}
        </pre>
        <ul className="mt-4 space-y-1 text-sm text-neutral-400">
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">send_telegram_message(text)</code> — the agent DMs you on Telegram.</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">list_recent_messages(max)</code> — reads recent conversation history.</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Free
        </h2>
        <p className="text-neutral-300">
          One bot per Google account. LLM inference is free while we&apos;re in
          beta. Self-host from the GitHub repo if you don&apos;t want us in the
          loop.
        </p>
      </section>

      <footer className="mt-16 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
        Built by{" "}
        <Link href="https://github.com/Shreyas-Profile" target="_blank" className="underline">
          Shreyas
        </Link>{" "}
        · Shipped by{" "}
        <Link href="https://github.com/globalion" target="_blank" className="underline">
          Globalion
        </Link>{" "}
        · MIT
      </footer>
    </main>
  );
}
