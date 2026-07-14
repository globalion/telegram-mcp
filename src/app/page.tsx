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
          Telegram ⇆ agent · MCP · streamable-http
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          telegram-mcp
        </h1>
        <p className="mt-4 max-w-xl text-lg text-neutral-400">
          Bidirectional bridge between Telegram and any MCP-compatible agent.
          Your agent brings the brain — we just move messages, store history,
          and expose slash-commands. No LLM in our stack, no vendor lock-in.
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
          Mental model
        </h2>
        <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-300">
{`You (Telegram)  ⇄  our platform  ⇄  Your agent (elsewhere)
   text/uploads       webhook + DB       polls for new msgs,
                      + MCP tools        sends replies back`}
        </pre>
        <ul className="mt-4 space-y-1 text-sm text-neutral-400">
          <li>• <b className="text-neutral-200">You → agent:</b> you text the bot → we store → your agent pulls <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">get_new_messages</code>.</li>
          <li>• <b className="text-neutral-200">Agent → you:</b> agent calls <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">send_telegram_message</code> → we deliver via Telegram.</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Setup
        </h2>
        <ol className="space-y-2 text-neutral-300">
          <li>1. Sign in with Google (identity + ban anchor).</li>
          <li>2. Create a bot via <a href="https://t.me/BotFather" target="_blank" className="text-teal-300 underline">@BotFather</a>, paste the token in your dashboard.</li>
          <li>3. Copy the MCP API key and paste this into your agent&apos;s config:</li>
        </ol>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-200">
          {CONFIG_SNIPPET}
        </pre>
        <p className="mt-3 text-sm text-neutral-400">
          Send <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">/start</code> to your bot and it&apos;s ready. Your agent pulls new messages whenever it&apos;s running.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          MCP tools
        </h2>
        <ul className="space-y-1 text-sm text-neutral-400">
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">get_new_messages()</code> — pull inbound messages since last poll.</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">send_telegram_message(text)</code> — reply, notify, ping.</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">list_recent_messages(max)</code> — read history for context.</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">clear_history()</code> — wipe stored messages.</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Built-in slash commands
        </h2>
        <p className="mb-3 text-sm text-neutral-400">
          These are handled by the platform, not your agent — so <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">/help</code> works even when your agent is offline.
        </p>
        <ul className="space-y-1 text-sm text-neutral-400">
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">/help</code> — list commands</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">/recent [N]</code> — show last N messages</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">/clear</code> — wipe history</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">/window N</code> — set history window size (default 20)</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">/usage</code> — stored message count</li>
        </ul>
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
