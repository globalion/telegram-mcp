// MCP tools exposed by /api/mcp. Purpose: let OTHER agents (Claude Desktop,
// Cursor, custom agents) push notifications into the user's own Telegram
// bot, and read the user's conversation history from it.
//
// The main "chat with an AI over Telegram" feature does not need any MCP
// call from the user's side — messaging the bot from Telegram just works.

import { z } from "zod";

export const TOOL_DEFINITIONS = [
  {
    name: "send_telegram_message",
    description:
      "Send a message from your agent to the user via their Telegram bot. The user must have connected their bot and sent /start at least once. Use this to notify the user about something asynchronous — a job finishing, a scheduled reminder, a monitoring alert.",
    inputSchema: z.object({
      text: z.string().min(1).max(4000).describe("Message body. Markdown is supported."),
    }),
  },
  {
    name: "list_recent_messages",
    description:
      "Return the N most recent messages in the user's Telegram conversation (both directions). Useful when an agent wants to catch up on prior context before replying.",
    inputSchema: z.object({
      max: z.number().int().min(1).max(200).default(20),
    }),
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export function findTool(name: string) {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

export function jsonSchemaFor(name: ToolName) {
  const t = findTool(name);
  if (!t) throw new Error(`unknown tool: ${name}`);
  return zodToJsonSchema(t.inputSchema);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodToJsonSchema(schema: z.ZodTypeAny): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as unknown as { _def: any })._def;
  switch (def.typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(def.type) };
    case "ZodOptional":
      return zodToJsonSchema(def.innerType);
    case "ZodDefault": {
      const inner = zodToJsonSchema(def.innerType);
      inner.default = def.defaultValue();
      return inner;
    }
    case "ZodObject": {
      const shape = def.shape();
      const props: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape) as [string, z.ZodTypeAny][]) {
        props[k] = zodToJsonSchema(v);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vDef = (v as unknown as { _def: any })._def;
        if (vDef.typeName !== "ZodOptional" && vDef.typeName !== "ZodDefault") {
          required.push(k);
        }
      }
      return { type: "object", properties: props, required };
    }
    default:
      return {};
  }
}
