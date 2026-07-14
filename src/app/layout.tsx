import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "telegram-mcp — Telegram bridge for your MCP agent",
  description:
    "Bidirectional Telegram ⇆ agent bridge with no LLM in our stack. Your agent (Claude Desktop, Cursor, custom script) does the thinking; we move messages and store history.",
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
