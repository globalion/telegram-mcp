// MCP tools exposed by /api/mcp.
//
// The platform is a bridge, not a brain. Every tool is transport/storage
// only — no inference happens on our side. Your agent (Claude Desktop,
// Cursor, a custom script) does the thinking and calls these to move
// messages back and forth.

import { z } from "zod";

export const TOOL_DEFINITIONS = [
  {
    name: "get_new_messages",
    description:
      "Return inbound Telegram messages from the user that have arrived since the last time this tool was called (read-once). Poll this from your agent's loop — messages that come in while your agent is offline queue up here.",
    inputSchema: z.object({}),
  },
  {
    name: "send_telegram_message",
    description:
      "Deliver a message from your agent to the user's Telegram bot. Use for replies, reminders, notifications, or async 'job done' pings. The user must have connected their bot and sent /start at least once.",
    inputSchema: z.object({
      text: z.string().min(1).max(4000).describe("Message body. Markdown is supported."),
    }),
  },
  {
    name: "list_recent_messages",
    description:
      "Return the last N stored messages in the user's conversation (both directions, without advancing the read cursor). Useful when your agent wants context before deciding how to reply.",
    inputSchema: z.object({
      max: z.number().int().min(1).max(200).default(20),
    }),
  },
  {
    name: "clear_history",
    description:
      "Wipe every stored message for the user. Use when the user explicitly asks to reset, or when starting a fresh session.",
    inputSchema: z.object({}),
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
