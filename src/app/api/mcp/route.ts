// MCP-over-HTTP endpoint. JSON-RPC 2.0. Auth: Bearer <apiKey>.
//
// This is the agent's side of the bridge: get_new_messages pulls inbound,
// send_telegram_message pushes outbound, list_recent_messages reads history
// for context, clear_history wipes the log.

import { NextResponse } from "next/server";
import { findLiveKey } from "@/lib/keys";
import {
  pushAssistantMessage,
  getNewMessages,
  listRecentMessages,
  clearHistory,
} from "@/lib/messaging";
import {
  TOOL_DEFINITIONS,
  findTool,
  jsonSchemaFor,
  type ToolName,
} from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const maxDuration = 30;

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "telegram-mcp", version: "0.2.0" };

export async function POST(req: Request) {
  const rpc = await req.json().catch(() => null);
  if (!isValidRpc(rpc)) return jsonRpcError(null, -32700, "Parse error");

  if (rpc.method === "initialize") {
    return jsonRpcOk(rpc.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }

  const auth = req.headers.get("authorization") || "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const key = raw ? await findLiveKey(raw) : null;
  if (!key) {
    return jsonRpcError(rpc.id, -32001, "Unauthorized — set Authorization: Bearer <key>");
  }
  const userId = key.userId;

  switch (rpc.method) {
    case "tools/list":
      return jsonRpcOk(rpc.id, {
        tools: TOOL_DEFINITIONS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: jsonSchemaFor(t.name),
        })),
      });

    case "tools/call": {
      const { name, arguments: args } = (rpc.params ?? {}) as {
        name?: string;
        arguments?: unknown;
      };
      if (!name) return jsonRpcError(rpc.id, -32602, "Missing tool name");
      const tool = findTool(name);
      if (!tool) return jsonRpcError(rpc.id, -32601, `Unknown tool: ${name}`);

      const parsed = tool.inputSchema.safeParse(args ?? {});
      if (!parsed.success) {
        return jsonRpcError(
          rpc.id,
          -32602,
          "Invalid arguments: " + JSON.stringify(parsed.error.flatten()),
        );
      }

      try {
        const result = await runTool(name as ToolName, parsed.data, userId);
        return jsonRpcOk(rpc.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      } catch (err) {
        return jsonRpcOk(rpc.id, {
          isError: true,
          content: [{ type: "text", text: (err as Error).message || String(err) }],
        });
      }
    }

    case "ping":
      return jsonRpcOk(rpc.id, {});

    default:
      return jsonRpcError(rpc.id, -32601, `Method not found: ${rpc.method}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runTool(name: ToolName, args: any, userId: string) {
  switch (name) {
    case "get_new_messages": {
      const messages = await getNewMessages(userId);
      return { messages, count: messages.length };
    }
    case "send_telegram_message":
      await pushAssistantMessage(userId, args.text);
      return { ok: true };
    case "list_recent_messages":
      return listRecentMessages(userId, args.max);
    case "clear_history":
      return clearHistory(userId);
  }
}

interface RpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

function isValidRpc(x: unknown): x is RpcRequest {
  if (!x || typeof x !== "object") return false;
  const r = x as RpcRequest;
  return r.jsonrpc === "2.0" && typeof r.method === "string";
}

function jsonRpcOk(id: RpcRequest["id"] | undefined, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function jsonRpcError(
  id: RpcRequest["id"] | undefined | null,
  code: number,
  message: string,
) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status: code === -32001 ? 401 : 200 },
  );
}
