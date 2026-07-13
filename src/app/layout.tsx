import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "telegram-mcp — Turn any Telegram bot into an AI assistant",
  description:
    "Sign in with Google, paste your BotFather token, and message your own Telegram bot to chat with an AI assistant. MCP tools let other agents push notifications to your bot.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
