/** A message from the Rust bridge: one raw omp stdout line, or the exit of the omp process. */
export type RpcEvent =
  | { kind: "frame"; line: string }
  | { kind: "exited"; code: number | null };

/** Returns the `type` of an omp frame. Returns "invalid" for non-JSON lines and "unknown" when `type` is missing. */
export function frameType(line: string): string {
  try {
    const frame = JSON.parse(line) as { type?: unknown };
    return typeof frame.type === "string" ? frame.type : "unknown";
  } catch {
    return "invalid";
  }
}
