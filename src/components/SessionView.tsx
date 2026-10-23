import { createEffect, createSignal, For, on, Show, type JSX } from "solid-js";
import type { SessionRecord } from "../omp/record";
import type { PendingApproval, TranscriptItem } from "../omp/session-state";

const PREVIEW_CHARS = 4000;

interface SessionViewProps {
  record: SessionRecord;
  onSend: (text: string) => void;
  onSteer: (text: string) => void;
  onAbort: () => void;
  onRespond: (requestId: string, value: string) => void;
  onStopSession: () => void;
}

export function SessionView(props: SessionViewProps) {
  const [draft, setDraft] = createSignal("");
  let transcriptEl: HTMLDivElement | undefined;

  // A draft belongs to one session, so switching sessions clears it.
  createEffect(on(() => props.record.key, () => setDraft("")));
  // Keep the newest message in view as the transcript grows.
  createEffect(
    on(
      () => props.record.state.transcript,
      () => {
        if (transcriptEl) transcriptEl.scrollTop = transcriptEl.scrollHeight;
      },
    ),
  );

  const running = () => props.record.status === "running";
  const streaming = () => props.record.state.isStreaming;
  const queued = () => props.record.state.queue.steering.length + props.record.state.queue.followUp.length;

  function takeDraft(): string {
    const text = draft().trim();
    if (text) setDraft("");
    return text;
  }

  function submit() {
    const text = takeDraft();
    if (text) props.onSend(text);
  }

  function steer() {
    const text = takeDraft();
    if (text) props.onSteer(text);
  }

  return (
    <section class="session">
      <div class="transcript" ref={transcriptEl}>
        <For each={props.record.state.transcript} fallback={<p class="muted">No messages yet.</p>}>
          {(item) => renderItem(item)}
        </For>
      </div>

      <Show when={props.record.state.approval}>
        {(approval) => <ApprovalCard approval={approval()} onRespond={props.onRespond} />}
      </Show>

      <Show when={queued() > 0}>
        <div class="queue">
          <For each={props.record.state.queue.steering}>{(text) => <span class="chip steering">steer: {text}</span>}</For>
          <For each={props.record.state.queue.followUp}>{(text) => <span class="chip">queued: {text}</span>}</For>
        </div>
      </Show>

      <form
        class="composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          rows={3}
          value={draft()}
          placeholder={running() ? "Message omp. Enter queues it while omp is working." : "Message omp."}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Enter sends. Shift+Enter adds a line. Ignore Enter while an IME is composing (Thai input).
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div class="composer-actions">
          <button type="submit" disabled={!running() || draft().trim() === ""}>
            {streaming() ? "Queue" : "Send"}
          </button>
          <Show when={streaming()}>
            <button type="button" disabled={draft().trim() === ""} onClick={steer}>
              Steer
            </button>
            <button type="button" onClick={props.onAbort}>
              Abort run
            </button>
          </Show>
        </div>
      </form>

      <footer class="statusline">
        <span>{props.record.state.model ?? "model unknown"}</span>
        <span>{streaming() ? "working" : "idle"}</span>
        <Show when={props.record.state.contextPercent !== undefined}>
          <span>{Math.round(props.record.state.contextPercent ?? 0)}% context</span>
        </Show>
        <span>{props.record.status}</span>
        <Show when={props.record.state.error}>{(message) => <span class="error">{message()}</span>}</Show>
        <button type="button" disabled={props.record.status === "stopped"} onClick={props.onStopSession}>
          Stop session
        </button>
      </footer>
    </section>
  );
}

function ApprovalCard(props: { approval: PendingApproval; onRespond: (requestId: string, value: string) => void }) {
  return (
    <section class="approval" role="alertdialog" aria-label={props.approval.title}>
      <h2>{props.approval.title}</h2>
      <div class="approval-options">
        <For each={props.approval.options}>
          {(option, index) => (
            <button
              type="button"
              title={props.approval.descriptions[index()] ?? undefined}
              onClick={() => props.onRespond(props.approval.id, option)}
            >
              {option}
            </button>
          )}
        </For>
      </div>
    </section>
  );
}

function renderItem(item: TranscriptItem): JSX.Element {
  switch (item.kind) {
    case "user":
      return <div class="message user">{item.text}</div>;
    case "assistant":
      return (
        <div class="message assistant">
          <Show when={item.thinking}>
            <details class="thinking">
              <summary>Thinking</summary>
              <pre>{item.thinking}</pre>
            </details>
          </Show>
          <div class="text">
            {item.text}
            {item.done ? "" : " ▍"}
          </div>
          <Show when={item.error}>{(message) => <p class="error">{message()}</p>}</Show>
        </div>
      );
    case "tool":
      return (
        <details class={`tool ${item.status}`}>
          <summary>
            {item.toolName} · {item.status}
          </summary>
          <pre>{preview(item.args)}</pre>
          <Show when={item.result !== undefined}>
            <pre>{preview(item.result)}</pre>
          </Show>
        </details>
      );
  }
}

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
}
