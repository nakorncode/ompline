import { describe, expect, test } from "vitest";
import { applyFrame, initialSessionState, type SessionState } from "./session-state";
import { parseFrame } from "./wire";

/** Feeds raw omp lines through the same parser and reducer the page uses. */
function replay(lines: string[], start: SessionState = initialSessionState()): SessionState {
  return lines.reduce((state, line) => {
    const frame = parseFrame(line);
    if (!frame) throw new Error(`fixture is not valid frame JSON: ${line}`);
    return applyFrame(state, frame);
  }, start);
}

const userPrompt = '{"type":"message_start","message":{"role":"user","content":"Summarize the repo"}}';
const agentStart = '{"type":"agent_start"}';
const agentEnd = '{"type":"agent_end","messages":[]}';

describe("transcript", () => {
  test("streams assistant text into one message and marks it done", () => {
    const state = replay([
      userPrompt,
      agentStart,
      '{"type":"message_start","messageId":"m1","message":{"role":"assistant","content":[]}}',
      '{"type":"message_update","messageId":"m1","message":{"role":"assistant","content":[]},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"Hel","partial":{"role":"assistant","content":[]}}}',
      '{"type":"message_update","messageId":"m1","message":{"role":"assistant","content":[]},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"lo","partial":{"role":"assistant","content":[]}}}',
      '{"type":"message_end","messageId":"m1","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]}}',
      agentEnd,
    ]);

    expect(state.transcript).toEqual([
      { kind: "user", id: "user-0", text: "Summarize the repo" },
      { kind: "assistant", id: "m1", text: "Hello", thinking: "", done: true },
    ]);
    expect(state.isStreaming).toBe(false);
  });

  test("is streaming between agent_start and agent_end", () => {
    expect(replay([agentStart]).isStreaming).toBe(true);
    expect(replay([agentStart, agentEnd]).isStreaming).toBe(false);
  });

  test("tracks a tool call from start to a successful end", () => {
    const state = replay([
      '{"type":"tool_execution_start","toolCallId":"t1","toolName":"write","args":{"path":"probe.txt"}}',
      '{"type":"tool_execution_end","toolCallId":"t1","toolName":"write","result":"ok","isError":false}',
    ]);

    expect(state.transcript).toEqual([
      { kind: "tool", id: "t1", toolName: "write", args: { path: "probe.txt" }, status: "done", result: "ok" },
    ]);
  });

  test("marks a failed tool call as an error", () => {
    const state = replay([
      '{"type":"tool_execution_start","toolCallId":"t2","toolName":"bash","args":{}}',
      '{"type":"tool_execution_end","toolCallId":"t2","toolName":"bash","result":"denied","isError":true}',
    ]);

    expect(state.transcript[0]).toMatchObject({ kind: "tool", status: "error" });
  });
});

describe("approval", () => {
  const select =
    '{"type":"extension_ui_request","id":"ui-1","method":"select","title":"Allow write?","options":["Approve","Deny"],"optionDetails":[{"description":"Writes probe.txt"},{}]}';

  test("shows a select request with its labels and descriptions", () => {
    const state = replay([select]);

    expect(state.approval).toEqual({
      id: "ui-1",
      title: "Allow write?",
      options: ["Approve", "Deny"],
      descriptions: ["Writes probe.txt", undefined],
    });
  });

  test("keeps the card when a cancel targets a different request", () => {
    const state = replay([select, '{"type":"extension_ui_request","id":"ui-9","method":"cancel","targetId":"ui-8"}']);

    expect(state.approval?.id).toBe("ui-1");
  });

  test("closes the card when omp cancels the matching request", () => {
    const state = replay([select, '{"type":"extension_ui_request","id":"ui-2","method":"cancel","targetId":"ui-1"}']);

    expect(state.approval).toBeUndefined();
  });
});

describe("other frames", () => {
  test("keeps the queue snapshot from queue_update", () => {
    const state = replay(['{"type":"queue_update","steering":["stop here"],"followUp":["then summarize"]}']);

    expect(state.queue).toEqual({ steering: ["stop here"], followUp: ["then summarize"] });
  });

  test("reads the model, context usage, and session id from get_state", () => {
    const state = replay([
      '{"id":"ui-3","type":"response","command":"get_state","success":true,"data":{"sessionId":"abc12345-0000","sessionFile":"/tmp/x.jsonl","isStreaming":false,"model":{"name":"Claude Haiku 5.5"},"contextUsage":{"tokens":100,"contextWindow":1000,"percent":10}}}',
    ]);

    expect(state).toMatchObject({
      sessionId: "abc12345-0000",
      sessionFile: "/tmp/x.jsonl",
      model: "Claude Haiku 5.5",
      contextPercent: 10,
      isStreaming: false,
    });
  });

  test("surfaces a failed prompt as an error", () => {
    const state = replay([
      '{"type":"prompt_result","id":"p1","agentInvoked":false,"status":"error","sessionSettled":true,"error":{"message":"No API key found for anthropic","retryable":false}}',
    ]);

    expect(state.error).toBe("No API key found for anthropic");
  });

  test("ignores frames the page does not use", () => {
    const before = initialSessionState();

    expect(replay(['{"type":"advisor_cost_changed"}'], before)).toBe(before);
  });
});

describe("parseFrame", () => {
  test("returns undefined for lines that are not JSON objects with a type", () => {
    expect(parseFrame("not json")).toBeUndefined();
    expect(parseFrame('{"id":"req_1"}')).toBeUndefined();
  });
});
