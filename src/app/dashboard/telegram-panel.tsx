"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function TelegramPanel({
  botUsername,
  hasToken,
}: {
  botUsername: string | null;
  hasToken: boolean;
}) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Failed to save token.");
        return;
      }
      setToken("");
      router.refresh();
    });
  };

  const disconnect = () => {
    startTransition(async () => {
      await fetch("/api/telegram/link", { method: "DELETE" });
      router.refresh();
    });
  };

  if (hasToken && botUsername) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Connected · <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            className="underline"
          >
            @{botUsername}
          </a>
        </div>
        <p className="mb-4 text-sm text-neutral-400">
          Open your bot on Telegram, send{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5">/start</code>. Messages you send are queued for your agent to pull via{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5">get_new_messages</code>. Type{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5">/help</code> in the bot for the full slash-command list.
        </p>
        <button
          onClick={disconnect}
          disabled={pending}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? "Disconnecting…" : "Disconnect bot"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <ol className="mb-4 space-y-1 text-sm text-neutral-300">
        <li>
          1. In Telegram, message{" "}
          <a href="https://t.me/BotFather" target="_blank" className="text-teal-300 underline">
            @BotFather
          </a>{" "}
          and send <code className="rounded bg-black/40 px-1.5 py-0.5">/newbot</code>.
        </li>
        <li>2. Give it a name and a username ending in <code className="rounded bg-black/40 px-1.5 py-0.5">_bot</code>.</li>
        <li>3. Paste the token BotFather gives you here:</li>
      </ol>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz-0123456789"
          className="flex-1 rounded bg-black/60 px-3 py-2 font-mono text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <button
          type="submit"
          disabled={pending || !token.trim()}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-black hover:bg-teal-400 disabled:opacity-60"
        >
          {pending ? "Linking…" : "Connect"}
        </button>
      </form>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
