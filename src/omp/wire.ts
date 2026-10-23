/**
 * The part of omp's RPC wire format that the session page reads.
 * The shapes come from rpc-wire.schema.json at omp commit 0b5c27a. Frames with other
 * types still parse, and the reducer ignores them, so new omp frames do not break the app.
 */

export interface AgentMessage {
  role: string;
  content?: unknown;
  errorMessage?: string;
}

export type AssistantMessageEvent =
  | { type: "text_delta"; contentIndex: number; delta: string }
  | { type: "thinking_delta"; contentIndex: number; delta: string }
  | { type: "done"; reason: string; message: AgentMessage }
  | { type: "error"; reason: string; error: AgentMessage }
  | {
      type:
        | "start"
        | "text_start"
        | "text_end"
        | "thinking_start"
        | "thinking_end"
        | "image_end"
        | "toolcall_start"
        | "toolcall_delta"
        | "toolcall_end";
    };

export interface SelectOptionDetail {
  description?: string;
}

export interface SelectRequest {
  type: "extension_ui_request";
  id: string;
  method: "select";
  title: string;
  options: string[];
  optionDetails?: SelectOptionDetail[];
}

export interface CancelRequest {
  type: "extension_ui_request";
  id: string;
  method: "cancel";
  /** The id of the request whose dialog should close. */
  targetId: string;
}

export type ExtensionUiRequest = SelectRequest | CancelRequest;

export type Frame =
  | { type: "ready"; protocolVersion: number }
  | { type: "response"; id?: string; command: string; success: boolean; data?: unknown; error?: string }
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "session_settled" }
  | { type: "message_start"; messageId?: string; message: AgentMessage }
  | {
      type: "message_update";
      messageId?: string;
      message: AgentMessage;
      assistantMessageEvent: AssistantMessageEvent;
    }
  | { type: "message_end"; messageId?: string; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args?: unknown }
  | { type: "tool_execution_update"; toolCallId: string; partialResult?: unknown }
  | { type: "tool_execution_end"; toolCallId: string; result?: unknown; isError?: boolean }
  | { type: "queue_update"; steering: string[]; followUp: string[] }
  | { type: "notice"; level: "info" | "warning" | "error"; message: string; source?: string }
  | { type: "prompt_result"; status: "completed" | "aborted" | "error"; error?: { message: string } }
  | ExtensionUiRequest;

/** Parses one stdout line. Returns undefined when the line is not a JSON object with a `type`. */
export function parseFrame(line: string): Frame | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || !("type" in value) || typeof value.type !== "string") {
    return undefined;
  }
  return value as Frame;
}

function isTextBlock(block: unknown): block is { type: "text"; text: string } {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as { type?: unknown }).type === "text" &&
    typeof (block as { text?: unknown }).text === "string"
  );
}

/** Message content is either a string or a list of blocks. This returns the text of the text blocks. */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter(isTextBlock).map((block) => block.text).join("");
}
