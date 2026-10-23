import { Channel, invoke } from "@tauri-apps/api/core";
import type { RpcEvent } from "../rpc";
import type { Command } from "./commands";

/** Starts one omp process for `workspace`. Resolves to the bridge's session id. */
export function startProcess(
  ompPath: string,
  workspace: string,
  onEvent: (event: RpcEvent) => void,
): Promise<number> {
  const events = new Channel<RpcEvent>();
  events.onmessage = onEvent;
  return invoke<number>("start_session", { ompPath, cwd: workspace, events });
}

export function sendCommand(bridgeId: number, command: Command): Promise<void> {
  return invoke("send_frame", { sessionId: bridgeId, line: JSON.stringify(command) });
}

export function stopProcess(bridgeId: number): Promise<void> {
  return invoke("stop_session", { sessionId: bridgeId });
}
