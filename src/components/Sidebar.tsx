import { For, Show } from "solid-js";
import type { SessionRecord } from "../omp/record";

export interface WorkspaceGroup {
  workspace: string;
  records: SessionRecord[];
}

interface SidebarProps {
  groups: WorkspaceGroup[];
  activeKey: string | null;
  ompPath: string;
  onOmpPathInput: (value: string) => void;
  newWorkspace: string;
  onNewWorkspaceInput: (value: string) => void;
  startError: string | null;
  onOpen: () => void;
  onSelect: (key: string) => void;
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside class="sidebar">
      <h1>ompline</h1>

      <form
        class="new-session"
        onSubmit={(event) => {
          event.preventDefault();
          props.onOpen();
        }}
      >
        <label>
          omp binary
          <input value={props.ompPath} onInput={(event) => props.onOmpPathInput(event.currentTarget.value)} />
        </label>
        <label>
          workspace folder
          <input
            value={props.newWorkspace}
            placeholder="C:\path\to\project"
            onInput={(event) => props.onNewWorkspaceInput(event.currentTarget.value)}
          />
        </label>
        <button type="submit">New session</button>
        <Show when={props.startError}>{(message) => <p class="error" role="alert">{message()}</p>}</Show>
      </form>

      <For each={props.groups} fallback={<p class="muted">No sessions yet.</p>}>
        {(group) => (
          <section class="group">
            <h2 title={group.workspace}>{group.workspace}</h2>
            <For each={group.records}>
              {(record) => (
                <button
                  type="button"
                  class="session-item"
                  classList={{ active: record.key === props.activeKey }}
                  onClick={() => props.onSelect(record.key)}
                >
                  <span>{record.state.sessionId ? record.state.sessionId.slice(0, 8) : "starting…"}</span>
                  <span class="badge">{record.status}</span>
                </button>
              )}
            </For>
          </section>
        )}
      </For>
    </aside>
  );
}
