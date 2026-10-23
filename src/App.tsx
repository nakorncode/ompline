import { createMemo, createSignal, Show } from "solid-js";
import { SessionView } from "./components/SessionView";
import { Sidebar, type WorkspaceGroup } from "./components/Sidebar";
import * as commands from "./omp/commands";
import type { SessionRecord } from "./omp/record";
import { applyFrame, initialSessionState, type SessionState } from "./omp/session-state";
import { sendCommand, startProcess, stopProcess } from "./omp/session";
import { parseFrame } from "./omp/wire";
import type { RpcEvent } from "./rpc";
import "./App.css";

let commandCounter = 0;
const nextId = () => `ui-${++commandCounter}`;
let sessionCounter = 0;
const nextSessionKey = () => `session-${++sessionCounter}`;

function groupByWorkspace(records: SessionRecord[]): WorkspaceGroup[] {
  const groups = new Map<string, SessionRecord[]>();
  for (const record of records) {
    groups.set(record.workspace, [...(groups.get(record.workspace) ?? []), record]);
  }
  return [...groups].map(([workspace, items]) => ({ workspace, records: items }));
}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (reason: Error) => void } {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function App() {
  const [ompPath, setOmpPath] = createSignal("omp");
  const [newWorkspace, setNewWorkspace] = createSignal("");
  const [startError, setStartError] = createSignal<string | null>(null);
  const [records, setRecords] = createSignal<SessionRecord[]>([]);
  const [activeKey, setActiveKey] = createSignal<string | null>(null);

  const groups = createMemo(() => groupByWorkspace(records()));
  const active = createMemo(() => records().find((record) => record.key === activeKey()));

  function patch(key: string, change: (record: SessionRecord) => SessionRecord) {
    setRecords((list) => list.map((record) => (record.key === key ? change(record) : record)));
  }

  function patchState(key: string, change: (state: SessionState) => SessionState) {
    patch(key, (record) => ({ ...record, state: change(record.state) }));
  }

  function bridgeIdOf(key: string): number | undefined {
    return records().find((record) => record.key === key)?.bridgeId;
  }

  /** Runs a command against a session's process and reports failures in the session's state. */
  async function send(key: string, command: commands.Command) {
    const bridgeId = bridgeIdOf(key);
    if (bridgeId === undefined) return;
    try {
      await sendCommand(bridgeId, command);
    } catch (error) {
      patchState(key, (state) => ({ ...state, error: String(error) }));
    }
  }

  async function openSession() {
    const workspace = newWorkspace().trim();
    if (!workspace) {
      setStartError("Enter a workspace folder first.");
      return;
    }
    setStartError(null);

    const key = nextSessionKey();
    const readiness = deferred();
    // The rejection is handled below; this only stops a early exit from being reported as unhandled.
    readiness.promise.catch(() => undefined);

    const onEvent = (event: RpcEvent) => {
      if (event.kind === "exited") {
        const suffix = event.code === null ? "" : ` with code ${event.code}`;
        patch(key, (record) => ({
          ...record,
          status: "stopped",
          bridgeId: undefined,
          state: {
            ...record.state,
            isStreaming: false,
            notices: [...record.state.notices, { level: "warning", message: `omp exited${suffix}` }],
          },
        }));
        readiness.reject(new Error("omp exited before it was ready"));
        return;
      }

      const frame = parseFrame(event.line);
      if (!frame) {
        patchState(key, (state) => ({
          ...state,
          notices: [...state.notices, { level: "error", message: "omp wrote a line that is not JSON" }],
        }));
        return;
      }
      if (frame.type === "ready") readiness.resolve();
      patchState(key, (state) => applyFrame(state, frame));
    };

    setRecords((list) => [...list, { key, workspace, status: "starting", state: initialSessionState() }]);
    setActiveKey(key);

    let bridgeId: number;
    try {
      bridgeId = await startProcess(ompPath().trim() || "omp", workspace, onEvent);
    } catch (error) {
      setRecords((list) => list.filter((record) => record.key !== key));
      setActiveKey(null);
      setStartError(String(error));
      return;
    }

    patch(key, (record) => ({ ...record, bridgeId }));
    try {
      await readiness.promise;
      patch(key, (record) => ({ ...record, status: "running" }));
      // Each session gets a fresh conversation in its workspace, so start one explicitly.
      await sendCommand(bridgeId, commands.newSession(nextId()));
      await sendCommand(bridgeId, commands.getState(nextId()));
    } catch (error) {
      patchState(key, (state) => ({ ...state, error: String(error) }));
    }
  }

  function sendMessage(key: string, text: string) {
    // While omp is working, a new message queues as a follow-up. Otherwise it starts a turn.
    const streaming = records().find((record) => record.key === key)?.state.isStreaming ?? false;
    const command = streaming ? commands.followUp(nextId(), text) : commands.prompt(nextId(), text);
    void send(key, command);
  }

  function steerMessage(key: string, text: string) {
    void send(key, commands.steer(nextId(), text));
  }

  function abortRun(key: string) {
    void send(key, commands.abort(nextId()));
  }

  async function respond(key: string, requestId: string, value: string) {
    const bridgeId = bridgeIdOf(key);
    if (bridgeId === undefined) return;
    try {
      await sendCommand(bridgeId, commands.approvalResponse(requestId, value));
      patchState(key, (state) => ({ ...state, approval: undefined }));
    } catch (error) {
      patchState(key, (state) => ({ ...state, error: String(error) }));
    }
  }

  async function stopSession(key: string) {
    const bridgeId = bridgeIdOf(key);
    if (bridgeId === undefined) return;
    try {
      await stopProcess(bridgeId);
      patch(key, (record) => ({ ...record, status: "stopped", bridgeId: undefined }));
    } catch (error) {
      patchState(key, (state) => ({ ...state, error: String(error) }));
    }
  }

  return (
    <div class="app">
      <Sidebar
        groups={groups()}
        activeKey={activeKey()}
        ompPath={ompPath()}
        onOmpPathInput={setOmpPath}
        newWorkspace={newWorkspace()}
        onNewWorkspaceInput={setNewWorkspace}
        startError={startError()}
        onOpen={() => void openSession()}
        onSelect={setActiveKey}
      />

      <Show
        when={active()}
        fallback={
          <main class="session">
            <p class="muted">Enter a workspace folder in the sidebar and start a session.</p>
          </main>
        }
      >
        {(record) => (
          <SessionView
            record={record()}
            onSend={(text) => sendMessage(record().key, text)}
            onSteer={(text) => steerMessage(record().key, text)}
            onAbort={() => abortRun(record().key)}
            onRespond={(requestId, value) => void respond(record().key, requestId, value)}
            onStopSession={() => void stopSession(record().key)}
          />
        )}
      </Show>
    </div>
  );
}

export default App;
