import type { SessionState } from "./session-state";

/** One omp session as the page sees it: its workspace, its bridge process, and its state. */
export interface SessionRecord {
  /** Page-side key. Stable for the life of the page. */
  key: string;
  workspace: string;
  status: "starting" | "running" | "stopped";
  /** The bridge's id for the omp process. Undefined until the process has started. */
  bridgeId?: number;
  state: SessionState;
}
