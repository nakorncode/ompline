import { expect, test } from "vitest";
import { frameType } from "./rpc";

test("returns the frame type of an omp line", () => {
  expect(frameType('{"type":"ready","protocolVersion":1}')).toBe("ready");
});

test("reports lines that are not JSON as invalid", () => {
  expect(frameType("not json")).toBe("invalid");
});

test("reports JSON without a type field as unknown", () => {
  expect(frameType('{"id":"req_1"}')).toBe("unknown");
});
