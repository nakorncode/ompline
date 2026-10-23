import { createSignal, For, Show } from "solid-js";
import { Channel, invoke } from "@tauri-apps/api/core";
import { frameType, type RpcEvent } from "./rpc";

const MAX_LOG_LINES = 500;
const PREVIEW_CHARS = 300;

function App() {
  const [ompPath, setOmpPath] = createSignal("omp");
  const [workspace, setWorkspace] = createSignal("");
  const [sessionId, setSessionId] = createSignal<number | null>(null);
  const [command, setCommand] = createSignal('{"id":"req_1","type":"get_state"}');
  const [log, setLog] = createSignal<string[]>([]);
  const [error, setError] = createSignal<string | null>(null);

  function append(entry: string) {
    setLog((lines) => [...lines.slice(-(MAX_LOG_LINES - 1)), entry]);
  }

  function handleEvent(event: RpcEvent) {
    if (event.kind === "frame") {
      append(`${frameType(event.line)}: ${event.line.slice(0, PREVIEW_CHARS)}`);
    } else {
      append(`omp exited (code ${event.code ?? "by signal"})`);
      setSessionId(null);
    }
  }

  async function start() {
    setError(null);
    const events = new Channel<RpcEvent>();
    events.onmessage = handleEvent;
    try {
      const id = await invoke<number>("start_session", {
        ompPath: ompPath(),
        cwd: workspace(),
        events,
      });
      setSessionId(id);
    } catch (e) {
      setError(String(e));
    }
  }

  async function send() {
    const id = sessionId();
    if (id === null) return;
    setError(null);
    try {
      await invoke("send_frame", { sessionId: id, line: command() });
    } catch (e) {
      setError(String(e));
    }
  }

  async function stop() {
    const id = sessionId();
    if (id === null) return;
    setError(null);
    try {
      await invoke("stop_session", { sessionId: id });
      setSessionId(null);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <main>
      <h1>ompline</h1>
      <p>Protocol probe: start omp in RPC mode and send raw frames. This is not the final UI.</p>

      <label>
        omp binary{" "}
        <input value={ompPath()} onInput={(e) => setOmpPath(e.currentTarget.value)} />
      </label>
      <label>
        workspace folder{" "}
        <input value={workspace()} onInput={(e) => setWorkspace(e.currentTarget.value)} />
      </label>

      <div>
        <button type="button" onClick={start} disabled={sessionId() !== null}>
          Start session
        </button>{" "}
        <button type="button" onClick={stop} disabled={sessionId() === null}>
          Stop session
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          rows={3}
          value={command()}
          onInput={(e) => setCommand(e.currentTarget.value)}
        />
        <div>
          <button type="submit" disabled={sessionId() === null}>
            Send frame
          </button>
        </div>
      </form>

      <Show when={error()}>{(message) => <p role="alert">{message()}</p>}</Show>

      <pre>
        <For each={log()}>{(entry) => <div>{entry}</div>}</For>
      </pre>
    </main>
  );
}

export default App;
