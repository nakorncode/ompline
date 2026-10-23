import { expect, test } from "vitest";
import { abort, approvalResponse, followUp, prompt, steer } from "./commands";

test("a prompt serializes to one JSON line with id, type, and message", () => {
  const line = JSON.stringify(prompt("ui-1", "hello"));

  expect(JSON.parse(line)).toEqual({ id: "ui-1", type: "prompt", message: "hello" });
  expect(line).not.toContain("\n");
});

test("follow-up and steer use their own command types", () => {
  expect(followUp("ui-2", "later")).toMatchObject({ type: "follow_up", message: "later" });
  expect(steer("ui-3", "now")).toMatchObject({ type: "steer", message: "now" });
});

test("abort carries only its id and type", () => {
  expect(abort("ui-4")).toEqual({ id: "ui-4", type: "abort" });
});

test("an approval answer names the request id and the exact option label", () => {
  expect(approvalResponse("ui-1", "Approve")).toEqual({
    type: "extension_ui_response",
    id: "ui-1",
    value: "Approve",
  });
});
