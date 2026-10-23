import { textOf, type AgentMessage, type AssistantMessageEvent, type ExtensionUiRequest, type Frame } from "./wire";

export type TranscriptItem =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "assistant";
      id: string;
      text: string;
      thinking: string;
      done: boolean;
      error?: string;
    }
  | {
      kind: "tool";
      id: string;
      toolName: string;
      args: unknown;
      status: "running" | "done" | "error";
      result?: unknown;
    };

type AssistantItem = Extract<TranscriptItem, { kind: "assistant" }>;
type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;

export interface PendingApproval {
  id: string;
  title: string;
  options: string[];
  descriptions: (string | undefined)[];
}

export interface Notice {
  level: "info" | "warning" | "error";
  message: string;
}

export interface SessionState {
  sessionId?: string;
  sessionFile?: string;
  model?: string;
  contextPercent?: number;
  isStreaming: boolean;
  transcript: TranscriptItem[];
  queue: { steering: string[]; followUp: string[] };
  approval?: PendingApproval;
  notices: Notice[];
  error?: string;
  activeAssistantId?: string;
}

const MAX_NOTICES = 20;

export function initialSessionState(): SessionState {
  return { isStreaming: false, transcript: [], queue: { steering: [], followUp: [] }, notices: [] };
}

/** Applies one omp frame to a session's state. Frames the page does not use leave the state unchanged. */
export function applyFrame(state: SessionState, frame: Frame): SessionState {
  switch (frame.type) {
    case "agent_start":
      return { ...state, isStreaming: true, error: undefined };
    case "agent_end":
    case "session_settled":
      return { ...state, isStreaming: false, activeAssistantId: undefined };
    case "message_start":
      return startMessage(state, frame.message, frame.messageId);
    case "message_update":
      return updateAssistant(state, frame.messageId, (item) =>
        applyAssistantEvent(item, frame.assistantMessageEvent),
      );
    case "message_end":
      return endMessage(state, frame.message, frame.messageId);
    case "tool_execution_start":
      return {
        ...state,
        transcript: [
          ...state.transcript,
          { kind: "tool", id: frame.toolCallId, toolName: frame.toolName, args: frame.args, status: "running" },
        ],
      };
    case "tool_execution_update":
      return updateTool(state, frame.toolCallId, (item) => ({ ...item, result: frame.partialResult }));
    case "tool_execution_end":
      return updateTool(state, frame.toolCallId, (item) => ({
        ...item,
        status: frame.isError ? "error" : "done",
        result: frame.result,
      }));
    case "queue_update":
      return { ...state, queue: { steering: frame.steering, followUp: frame.followUp } };
    case "notice":
      return {
        ...state,
        notices: [...state.notices, { level: frame.level, message: frame.message }].slice(-MAX_NOTICES),
      };
    case "prompt_result":
      return frame.status === "error" ? { ...state, error: frame.error?.message ?? "The prompt failed." } : state;
    case "response":
      return applyResponse(state, frame);
    case "extension_ui_request":
      return applyUiRequest(state, frame);
    default:
      return state;
  }
}

function startMessage(state: SessionState, message: AgentMessage, messageId?: string): SessionState {
  const id = messageId ?? `${message.role}-${state.transcript.length}`;
  if (message.role === "user") {
    return { ...state, transcript: [...state.transcript, { kind: "user", id, text: textOf(message.content) }] };
  }
  if (message.role === "assistant") {
    const item: AssistantItem = { kind: "assistant", id, text: "", thinking: "", done: false };
    return { ...state, activeAssistantId: id, transcript: [...state.transcript, item] };
  }
  return state;
}

function endMessage(state: SessionState, message: AgentMessage, messageId?: string): SessionState {
  if (message.role !== "assistant") return state;
  return updateAssistant(state, messageId, (item) => ({
    ...item,
    text: textOf(message.content) || item.text,
    done: true,
    error: message.errorMessage ?? item.error,
  }));
}

function applyAssistantEvent(item: AssistantItem, event: AssistantMessageEvent): AssistantItem {
  switch (event.type) {
    case "text_delta":
      return { ...item, text: item.text + event.delta };
    case "thinking_delta":
      return { ...item, thinking: item.thinking + event.delta };
    case "done":
      return { ...item, done: true };
    case "error":
      return { ...item, done: true, error: event.reason };
    default:
      return item;
  }
}

function updateAssistant(
  state: SessionState,
  messageId: string | undefined,
  change: (item: AssistantItem) => AssistantItem,
): SessionState {
  const id = messageId ?? state.activeAssistantId;
  if (id === undefined) return state;
  return {
    ...state,
    transcript: state.transcript.map((item) =>
      item.kind === "assistant" && item.id === id ? change(item) : item,
    ),
  };
}

function updateTool(state: SessionState, toolCallId: string, change: (item: ToolItem) => ToolItem): SessionState {
  return {
    ...state,
    transcript: state.transcript.map((item) =>
      item.kind === "tool" && item.id === toolCallId ? change(item) : item,
    ),
  };
}

function applyResponse(state: SessionState, frame: Extract<Frame, { type: "response" }>): SessionState {
  if (!frame.success) {
    return { ...state, error: frame.error ?? `${frame.command} failed` };
  }
  return frame.command === "get_state" ? applyStateSnapshot(state, frame.data) : state;
}

interface StateSnapshot {
  sessionId?: unknown;
  sessionFile?: unknown;
  isStreaming?: unknown;
  model?: { name?: unknown } | null;
  contextUsage?: { percent?: unknown } | null;
}

function applyStateSnapshot(state: SessionState, data: unknown): SessionState {
  if (typeof data !== "object" || data === null) return state;
  const snapshot = data as StateSnapshot;
  return {
    ...state,
    sessionId: typeof snapshot.sessionId === "string" ? snapshot.sessionId : state.sessionId,
    sessionFile: typeof snapshot.sessionFile === "string" ? snapshot.sessionFile : state.sessionFile,
    model: typeof snapshot.model?.name === "string" ? snapshot.model.name : state.model,
    contextPercent:
      typeof snapshot.contextUsage?.percent === "number" ? snapshot.contextUsage.percent : state.contextPercent,
    isStreaming: typeof snapshot.isStreaming === "boolean" ? snapshot.isStreaming : state.isStreaming,
  };
}

function applyUiRequest(state: SessionState, frame: ExtensionUiRequest): SessionState {
  if (frame.method === "select") {
    return {
      ...state,
      approval: {
        id: frame.id,
        title: frame.title,
        options: frame.options,
        descriptions: frame.optionDetails?.map((detail) => detail.description) ?? [],
      },
    };
  }
  // omp closes a dialog with `cancel` when it times out or the run is aborted.
  return state.approval?.id === frame.targetId ? { ...state, approval: undefined } : state;
}
