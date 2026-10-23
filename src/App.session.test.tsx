import { render } from "solid-js/web";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

// A scripted stand-in for the Rust bridge and omp. It answers each command the way
// omp's RPC mode does for the frames the page uses, so the whole page path runs without a model.
const bridge = vi.hoisted(() => ({
  channel: undefined as { onmessage?: (message: unknown) => void } | undefined,
  sent: [] as string[],
}));

vi.mock("@tauri-apps/api/core", () => {
  class Channel<T> {
    onmessage?: (message: T) => void;
  }

  function emit(frame: Record<string, unknown>) {
    bridge.channel?.onmessage?.({ kind: "frame", line: JSON.stringify(frame) });
  }

  function runPrompt(command: { id: string; message: string }) {
    emit({ id: command.id, type: "response", command: "prompt", success: true });
    emit({ type: "agent_start" });
    emit({ type: "message_start", message: { role: "user", content: command.message } });
    emit({ type: "message_start", messageId: "a1", message: { role: "assistant", content: [] } });
    emit({
      type: "message_update",
      messageId: "a1",
      message: { role: "assistant", content: [] },
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Writing the file." },
    });
    emit({
      type: "extension_ui_request",
      id: "ui-100",
      method: "select",
      title: "Allow write?",
      options: ["Approve", "Deny"],
      optionDetails: [{ description: "Writes probe.txt" }, {}],
    });
  }

  function finishPrompt(value: string) {
    const answer = value === "Approve" ? "Written." : "Skipped.";
    emit({ type: "tool_execution_start", toolCallId: "t1", toolName: "write", args: { path: "probe.txt" } });
    emit({ type: "tool_execution_end", toolCallId: "t1", toolName: "write", result: "ok", isError: false });
    emit({ type: "message_end", messageId: "a1", message: { role: "assistant", content: [{ type: "text", text: answer }] } });
    emit({ type: "agent_end", messages: [] });
    emit({ type: "prompt_result", id: "p", agentInvoked: true, status: "completed", sessionSettled: true });
  }

  function respond(line: string) {
    const command = JSON.parse(line) as Record<string, unknown>;
    setTimeout(() => {
      switch (command.type) {
        case "new_session":
          emit({ id: command.id, type: "response", command: "new_session", success: true, data: { cancelled: false } });
          break;
        case "get_state":
          emit({
            id: command.id,
            type: "response",
            command: "get_state",
            success: true,
            data: {
              sessionId: "9f8e7d6c-1111",
              sessionFile: "/tmp/session.jsonl",
              isStreaming: false,
              model: { name: "Claude Haiku 5.5" },
              contextUsage: { tokens: 10, contextWindow: 100, percent: 10 },
            },
          });
          break;
        case "prompt":
          runPrompt(command as { id: string; message: string });
          break;
        case "extension_ui_response":
          finishPrompt(command.value as string);
          break;
      }
    }, 0);
  }

  function emitReady() {
    setTimeout(() => emit({ type: "ready", protocolVersion: 1 }), 0);
  }

  const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "start_session":
        bridge.channel = args?.events as { onmessage?: (message: unknown) => void };
        emitReady();
        return 1;
      case "send_frame":
        bridge.sent.push(args?.line as string);
        respond(args?.line as string);
        return undefined;
      case "stop_session":
        return undefined;
      default:
        throw new Error(`unexpected command ${command}`);
    }
  });

  return { Channel, invoke };
});

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
  bridge.channel = undefined;
  bridge.sent = [];
});

test("runs a prompt through an approval and renders the result", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  dispose = render(() => <App />, container);

  const [, workspaceInput] = Array.from(container.querySelectorAll("input"));
  workspaceInput.value = "G:/work/demo";
  workspaceInput.dispatchEvent(new Event("input", { bubbles: true }));
  container
    .querySelector("form.new-session")
    ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

  await vi.waitFor(() => expect(container.querySelector(".statusline")?.textContent).toContain("running"));

  const draft = container.querySelector("textarea")!;
  draft.value = "Create probe.txt";
  draft.dispatchEvent(new Event("input", { bubbles: true }));
  draft.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

  await vi.waitFor(() => expect(container.querySelector(".approval")?.textContent).toContain("Allow write?"));
  const approve = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Approve");
  approve?.click();

  await vi.waitFor(() => expect(container.textContent).toContain("Written."));
  expect(container.querySelector(".approval")).toBeNull();
  expect(container.textContent).toContain("Create probe.txt");

  const sent = bridge.sent.map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(sent.map((command) => command.type)).toEqual(["new_session", "get_state", "prompt", "extension_ui_response"]);
  expect(sent[2]).toMatchObject({ type: "prompt", message: "Create probe.txt" });
  expect(sent[3]).toEqual({ type: "extension_ui_response", id: "ui-100", value: "Approve" });
});
