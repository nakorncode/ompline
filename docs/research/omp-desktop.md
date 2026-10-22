# oh-my-pi desktop: research notes

Prepared 2026-10-22. Scope: a lightweight Tauri desktop UI for oh-my-pi (omp) that exposes the TUI's functions, tracks upstream releases, and copies display patterns from other coding-agent harnesses.

Method: primary sources only. The omp repository was cloned (blobless) into the session scratch directory, outside the project, and read at commit `0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0`. GitHub, npm, and crates.io metadata was read through their public APIs. Nothing was installed or executed. Bracketed codes such as [S4] refer to the Sources list at the end. Claims that could not be confirmed from a primary source are marked **UNVERIFIED**.

## Summary

- **Official project.** oh-my-pi is `can1357/oh-my-pi` (MIT, not a fork on GitHub, homepage omp.sh). The npm package `@oh-my-pi/pi-coding-agent` points back to it. Latest release is 18.12.6 (2026-10-21). About 669 GitHub releases exist since 2026-01-02, so the project ships almost daily [S1][S2][S4][S5].
- **Use the RPC mode, not screen scraping.** `omp --mode rpc` is a newline-delimited JSON protocol over stdio with commands, typed events, prompt-completion frames, extension UI requests, and host-tool callbacks. It is explicitly not JSON-RPC 2.0. A committed JSON Schema describes the wire contract [S8][S28].
- **Approval default is a trap.** `tools.approvalMode` defaults to `yolo` and has no protocol default. A desktop host must pass `--approval-mode always-ask` (or `write`) to receive approval prompts. Over RPC, an approval arrives as an `extension_ui_request` with method `select`; cancel or timeout denies [S9][S10][S17][S18][S19].
- **Do not use the crates.io crate `omp-rpc`.** It is owned by the same author, but its metadata points to a different repository (`can1357/omp`) and describes gRPC transport. The official Rust client, `sdk/rust/omp-rpc`, is `publish = false` [S26][S27]. The relationship between the two is UNVERIFIED.
- **Native rendering already exists elsewhere.** omp's TUI can render natively in the Tern terminal over the Tern Surface Protocol (TSP). Tern is a terminal host from Stencil [S15][S24][S25]. Tern availability and licensing are UNVERIFIED.
- **Reference harnesses.** Codex exposes an app-server with stdio and WebSocket transports, approval requests, and turn/item notifications. It is marked Experimental [C4][C6][C7][C8][C9]. DeepSeek Harness is MIT and in developer preview, and its desktop shell is Electron, not Tauri [D2][D4]. Recurring patterns worth copying are summarized in section 2.3.
- **Tauri.** Current line is 2.12.x. A child process can be spawned as a sidecar through `tauri-plugin-shell`, or directly with Rust `std::process`. Output streams to the UI through `Channel`, which the docs describe as ordered and fast [T1][T2][T7][T8][T10]. On Windows, WebView2 is preinstalled on Windows 10 1803+ and Windows 11. An offline WebView2 installer adds about 127 MB [T4][T5].

---

## 1. oh-my-pi facts

### 1.1 Identity and official project (verified)

- Official repository: `https://github.com/can1357/oh-my-pi`. MIT license. Not a fork on GitHub. Default branch `main`. Homepage `https://omp.sh` [S1][S2].
- The README says it is "Built by Stencil Labs" and a fork of Pi by Mario Zechner (`badlogic/pi-mono`) [S3].
- Packages: npm `@oh-my-pi/pi-coding-agent` (repository `git+https://github.com/can1357/oh-my-pi.git`, directory `packages/coding-agent`, binary `omp`) [S5][S29].
- A search returned a GitCode copy (`gitcode.com/tonyliux/oh-my-pi`) and `xfhg/ompi`. They were not verified as mirrors and were not used [S32].
- Popularity signals from the GitHub API: 36,234 stars and 4,092 open issues. Both are maintenance-risk signals [S2].

### 1.2 License, version, release cadence

- License: MIT [S1][S3][S6]. Vendored third-party code keeps its own license (`crates/vendor/brush-core` and others) [S3].
- Latest version: 18.12.6, published 2026-10-21T21:02:53Z [S4]. npm `latest` dist-tag is 18.12.6 [S5].
- Cadence: 669 GitHub releases between 2026-01-02 and 2026-10-21 (about 2.3 per day, counted from the releases API) [S4]. The 30 most recent releases span 2026-10-06 to 2026-10-21 [S4]. npm lists 691 published versions [S5].
- Changelog format: per-version `Added`, `Changed`, `Fixed` sections in `packages/coding-agent/CHANGELOG.md` [S7].

### 1.3 Entry points and install

- Entry points: `omp` (interactive TUI), `omp -p` (print mode), `omp --mode json` (JSONL events), `omp --mode rpc` and `rpc-ui`, `omp acp` (Agent Client Protocol), and the Node SDK [S3][S9].
- Install methods: curl script (macOS/Linux), `irm https://omp.sh/install.ps1 | iex` (Windows), Homebrew (`can1357/tap/omp`), `bun install -g @oh-my-pi/pi-coding-agent`, Nix, mise [S3][S5]. The npm package declares `engines.bun` `>=1.3.14` [S29].
- Standalone binaries come from the build service `https://build.stencil.so`. The script checks SHA-256 and can pin a release (`--binary --ref v<version>`) [S3][S20].
- Build target format: `{macos|linux|linux-musl|windows}-{arm64|x86_64}` [S20]. The Windows x86_64 target is implied by this format; it was not verified by a download (UNVERIFIED).
- README claims: 31 built-in tools, 60+ model providers [S3].

### 1.4 TUI features

#### 1.4.1 Panels, dialogs, and menus (overlays)

The TUI overlay directory lists these components [S23]:

- Approval dialog, ask dialog (structured questions), hook editor and selector, login dialog, OAuth selector, MCP add wizard, plugin selector and settings.
- Agent Hub (`Alt+A`), jobs panel, job tree, running-subagent badge, agent activity, agent transcript viewer.
- Side-question (`/btw`) panel and history panel.
- Model selector, model hub, model browser, model picker, thinking selector, queue-mode selector, theme selector, settings selector.
- Session selector, session info overlay, tree selector, history search, rewind selector.
- Plan review and plan save overlays, plan table of contents.
- Usage dashboard, usage display, copy selector, annotation overlay (for `/annotate`), move overlay, pause screen, cleanse and OMFG panels, report panel, stats notice, error banner.

#### 1.4.2 Keybindings

Source: `docs/keybindings.md` [S13]. User remaps live in `~/.omp/agent/keybindings.yml` as action-to-chord pairs [S13]. `/hotkeys` prints the live table [S13].

Selected defaults:

| Action | Default chord |
| --- | --- |
| Cycle role models forward or back | `Ctrl+P`, `Shift+Ctrl+P` |
| Model selector / temporary model | `Alt+M` / `Alt+P` |
| Toggle plan mode | `Alt+Shift+P` |
| Prompt history search | `Ctrl+R` |
| Expand tool output / show-hide tool activity | `Ctrl+O` / `Ctrl+Shift+O` |
| Toggle thinking blocks / cycle thinking level | `Ctrl+T` / `Shift+Tab` |
| Approve pending tool call / deny | `Ctrl+Enter` or `Ctrl+Q` / `Esc` |
| Queue follow-up / dequeue into editor | `Ctrl+Q` or `Ctrl+Enter` / `Alt+Up` or `Shift+Up` |
| Retry failed turn | `F5` or `Alt+R` |
| Live voice toggle | `Ctrl+L` |
| Agent Hub | `Alt+A` |
| Edit draft in `$EDITOR` | `Ctrl+G` |

Source for all rows: [S13]. A Vim editing mode is available, off by default [S13].

#### 1.4.3 Slash commands

Source: builtin registry files `packages/coding-agent/src/slash-commands/builtin-*.ts` [S22]. The lists below are top-level names. Nested subcommands (for example `/mcp add`, `/todo append`) are omitted.

- **Models and reasoning:** `/model`, `/switch`, `/fast`, `/slow`, `/effort`, `/modelpreset`, `/extended-context`, `/queue`.
- **Modes:** `/plan`, `/plan-review`, `/vibe`, `/goal`, `/guided-goal`, `/loop`, `/prewalk`, `/ratchet`, `/skillful`, `/computer`, `/security`, `/settings`, `/setup`.
- **Session lifecycle:** `/new`, `/fresh`, `/clear`, `/resume`, `/fork`, `/branch`, `/tree`, `/rename`, `/move`, `/session`, `/delete`, `/compact`, `/shake`, `/handoff`, `/retry`, `/pin`, `/btw`, `/todo`, `/jobs`, `/exit`, `/restart`, `/quit`.
- **Workspace:** `/add-dir`, `/remove-dir`, `/dirs`, `/wt`, `/ssh`, `/memory`, `/skills`, `/marketplace`, `/plugins`, `/reload-plugins`.
- **Status and info:** `/usage`, `/stats`, `/changelog`, `/hotkeys`, `/tools`, `/context`, `/extensions`, `/agents`, `/git`, `/hub`, `/debug`.
- **Auth and integrations:** `/login`, `/logout`, `/mcp`, `/advisor`.
- **Collaboration and output:** `/export`, `/trace`, `/dump`, `/share`, `/collab`, `/join`, `/leave`, `/browser`, `/copy`, `/open`.
- **Control:** `/force`, `/live`, `/record`, `/pause`, `/forget-approvals`, `/omfg`, `/cleanse`, `/tan`.

**Typed-only candidates.** [S13] lists chords only for the actions above. Commands with an overlay but no listed chord, such as `/settings`, `/tree`, `/jobs`, `/login`, `/fork`, `/resume`, `/hotkeys`, `/mcp`, `/memory`, `/skills`, `/marketplace`, `/export`, `/share`, `/collab`, `/handoff`, and `/copy` (only prompt-copy and line-copy chords are listed), are reachable mainly by typing. This list is not exhaustive, so verify with `/hotkeys` (UNVERIFIED as a complete list).

CLI-only (not in the TUI): `omp update`, `omp config`, `omp models`, `omp setup`, `omp completions`, `omp stats`, `omp usage`, and others [S9].

### 1.5 Integration surfaces

| Surface | How | Notes |
| --- | --- | --- |
| **RPC** | `omp --mode rpc [flags]`, NDJSON over stdio | Primary surface for a desktop host. Not JSON-RPC 2.0 [S8]. |
| RPC with UI | `--mode rpc-ui` | Adds tool UI (for example `ask`) [S8][S9]. |
| Headless RPC | `--mode rpc --no-ui` | Extensions run headless; tool calls that need approval fail closed [S8][S19]. |
| One-shot JSON | `omp -p --mode json` | JSONL event stream for scripts [S9]. It has no approval-reply channel; how a prompt-needing call behaves here is UNVERIFIED. |
| ACP | `omp acp` | JSON-RPC over stdio (Agent Client Protocol). Approvals use `session/request_permission` [S10]. |
| Node SDK | `@oh-my-pi/pi-coding-agent` (`createAgentSession`, `SessionManager`) | Requires Node or Bun in-process [S3][S5]. |
| Client libraries | TypeScript `RpcClient`, Python `omp-rpc`, Rust and Go clients in `sdk/` | Generated from the wire schema [S8]. |
| Tern TSP | Native surface in the Tern terminal | Not a desktop app; see 1.9 [S24][S25]. |

### 1.6 RPC protocol (precise)

Source for this section: `docs/rpc.md` [S8] and `packages/coding-agent/src/modes/rpc/rpc-mode.ts` [S19].

**Framing.** Commands arrive on stdin, one JSON object per line. Each command may carry `id`, and `response` echoes it. Output is one JSON object per line on stdout. In protocol v1 each physical frame is capped at 1 MiB [S8].

**Startup.** The first output line is a `ready` frame: `{"type":"ready","protocolVersion":1,"supportedProtocolVersions":[1,2],"maxFrameBytes":1048576,"maxReassembledFrameBytes":67108864}` [S8].

**Protocol v2 (opt-in).** The client sends `{"id":"protocol-1","type":"negotiate_protocol","protocolVersion":2}`. After that, oversized objects arrive as `rpc_chunk` frames (`chunkId`, `index`, `count`, `byteLength`, base64 `data`) that must be reassembled and validated [S8].

**Command families** (all shown in `docs/rpc.md` [S8]):

- Prompting: `prompt` (with `streamingBehavior: steer|followUp`), `steer`, `follow_up`, `abort`, `abort_and_prompt`, `abort_and_restore_queue`, `remove_queued_message`, `promote_queued_message`.
- Session: `new_session`, `open_session` (binds to a session directory), `switch_session`, `branch`, `fork`, `get_entries`, `get_tree`, `get_messages`, `get_messages_page` (cursor-paged), `get_last_assistant_text`, `set_session_name`, `handoff`, `export_html`, `get_session_stats`.
- State and config: `get_state`, `set_model`, `cycle_model`, `get_available_models`, `set_thinking_level`, `get_available_thinking_levels`, `set_steering_mode`, `set_follow_up_mode`, `set_interrupt_mode`, `set_fast_mode`, `set_slow_mode`, `set_auto_compaction`, `set_auto_retry`, `compact`, `set_todos`, `goal`, `set_event_filter`.
- Discovery: `get_available_commands` (returns the command list used for a slash palette).
- Host extensions: `set_host_tools`, `set_host_uri_schemes`, `set_ask_dialog`.
- Subagents and side questions: `set_subagent_subscription`, `get_subagents`, `get_subagent_messages`, `cancel_subagent`, `steer_subagent`, `btw`, `btw_cancel`, `get_btw_history`.
- Shell and auth: `bash`, `abort_bash`, `get_login_providers`, `login`, `get_logout_accounts`, `logout`, `predict_word`.
- Live voice: `live_start`, `live_stop`, `live_mute` [S8].

**Event and frame types** (from `docs/rpc.md` [S8]):

- Session events: `agent_start`, `agent_end` (fields `isTerminal`, `yielded`, `awaitingAsyncWork`), `turn_start`, `turn_end`, `message_start`, `message_update` (with `messageId` and `assistantMessageEvent` deltas for text, thinking, and tool-call arguments), `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_stream_update`, `tool_execution_end`, `auto_compaction_*`, `auto_retry_*`, `model_changed`, `thinking_level_changed`, `todo_reminder`, `irc_message`, `notice`, `goal_updated`, `queue_update` (`steering` and `followUp` chip text).
- Frames: `response`, `prompt_result` (`status`: `completed`, `aborted`, or `error`; `sessionSettled`), `session_settled`, `extension_ui_request`, `host_tool_call`, `host_tool_cancel`, `host_uri_request`, `host_uri_cancel`, `extension_error`, `available_commands_update`, `subagent_lifecycle` / `subagent_progress` / `subagent_event`, `btw_delta` / `btw_record`, `command_output`, `session_info_update`, `config_update`, `rpc_frame_error`, `live_phase` / `live_levels` / `live_transcript` / `live_end` [S8].

**Lifecycle of a prompt** (from `docs/rpc.md` [S8]):

1. Client sends `{"id":"req_1","type":"prompt","message":"..."}`.
2. Response `success:true` arrives once the message is admitted. A builtin slash command may instead return `data.agentInvoked:false`, which completes the prompt with no further frame.
3. Events stream: `agent_start`, `message_update` deltas, tool execution events, `message_end`, and finally `agent_end`.
4. `prompt_result` with the same `id` reports how the work ended. `session_settled` follows when no background work can wake the agent.

A failed provider turn is a normal `agent_end` with `stopReason:"error"`, not a failed command [S8].

**Approval flow (tool calls).**

1. Each tool declares a tier: `read`, `write`, or `exec`. The mode decides whether a call prompts [S10][S17].
2. Modes: `always-ask` (prompts for write and exec), `always-ask-cached` (also prompts for file reads, with remembered grants), `write` (prompts for exec only), `yolo` (never prompts; default) [S10][S18].
3. When no approval dialog exists (RPC, ACP), omp calls `select(full_prompt, labels)`. Labels are: grant labels (for example `Approve File`, `Approve Directory: <folder>`, and `Always ...` forms), then `Approve` or `Approve Once`, then `Approve <tool> for this session` when offered, then `Deny` [S17].
4. Over RPC this is an `extension_ui_request` with `method:"select"`, `options` set to the labels, and `optionDetails` when descriptions exist [S8][S19].
5. The host answers `{"type":"extension_ui_response","id":"<id>","value":"<label>"}`. Any other value, or `cancelled:true`, or a timeout, resolves to Deny [S17][S8].
6. Approvals reach the host unless `--no-ui` is set. In `rpc-mode.ts`, `uiContext` is `undefined` only when headless [S19].

**Other host interactions.**

- Host tools: `set_host_tools` registers tools. omp sends `host_tool_call`, the host returns `host_tool_result`, and `host_tool_cancel` covers aborts [S8].
- Ask dialog: `set_ask_dialog` opts in to structured `ask` questions. Answers go back in `extension_ui_response.answers` [S8].
- Queue: `queue_update` snapshots feed UI chips; `remove_queued_message`, `promote_queued_message`, and `abort_and_restore_queue` manage them [S8].

**Stdin close** rejects pending requests, drains accepted commands, disposes the session, and exits 0 [S8].

### 1.7 Config, auth, and session storage

| Item | Location or format | Source |
| --- | --- | --- |
| Agent directory | `~/.omp/agent/` by default; named profiles use `~/.omp/profiles/<name>/agent/` (`--profile` or `OMP_PROFILE`) | [S11] |
| Global settings | `~/.omp/agent/config.yml` (or `config.yaml`) | [S11] |
| Project settings | `<cwd>/.omp/config.yml` and `settings.json`, plus project `AGENTS.md`, skills, hooks, tools, `mcp.json` | [S11][S3] |
| Overlays | `--config <file>` and `PI_CONFIG_FILES` | [S11] |
| Precedence | env var > runtime override > overlays > project > global > default | [S11] |
| Custom providers | `~/.omp/agent/models.yml` | [S3] |
| Keybindings | `~/.omp/agent/keybindings.yml` | [S13] |
| Credentials (API keys, OAuth) | SQLite `agent.db` in the agent directory | [S14][S11] |
| Remembered approvals | `approval-cache.db` in the agent directory (only with "remember across sessions") | [S10] |
| Session index and idle recap | `history.db` | [S12] |
| Sessions | `~/.omp/agent/sessions/<encoded-cwd>/<timestamp>_<sessionId>.jsonl` | [S12] |
| Blobs | `~/.omp/agent/blobs/<sha256>` | [S12] |
| Terminal breadcrumbs | `~/.omp/agent/terminal-sessions/<terminal-id>` | [S12] |
| Broker token (broker mode only) | `<config-dir>/auth-broker.token` | [S14] |

Environment overrides: `PI_CODING_AGENT_DIR` (default profile only) and `PI_CONFIG_DIR` [S11].

**Credential encryption at rest: UNVERIFIED.** The docs show that API keys and OAuth rows are stored in `agent.db`. They do not state whether the values are encrypted [S14].

**Session file format** (`docs/session.md` [S12]):

- JSONL. The first physical line is a fixed 256-byte `type:"title"` slot. The logical first entry is the session header.
- Header: `{"type":"session","version":3,"id":"<UUIDv7>","timestamp","cwd","title","titleSource":"auto|user","additionalDirectories","previousSessionFiles","parentSession"}`.
- Entries: `{"type","id" (8-char),"parentId","timestamp", ...}`. Entry types include `message`, `model_usage`, `thinking_level_change`, `model_change`, `compaction`, `branch_summary`, `reset_boundary`, `custom`, `custom_message`, `label`, `title_change`, and `ttsr_injection`.
- The tree is `id`/`parentId` plus a leaf pointer. Branching moves the pointer. Readers over RPC use `get_entries`, `get_tree`, and `get_messages_page` [S12][S8].

### 1.8 Updating omp

- Commands: `omp update` with `--check`, `--canary`, and `--stable` [S9][S21].
- Install method is detected as `brew`, `mise`, `nix`, `bun`, `npm`, or `binary` [S21].
- Package-manager installs read the version from npm registry dist-tags, following the configured registry and any `omp.rename` pointers [S21].
- Standalone binaries call `GET {origin}/api/products/omp/latest/{target}?channel=stable|canary`. The origin defaults to `https://build.stencil.so` and is overridable with `PI_BUILD_URL`. Requests send `User-Agent: omp/<version>`. An optional `from_version` returns an HDiffPatch patch [S20].
- Compiled binaries also run a startup update check [S20].

### 1.9 Tern Surface Protocol (native rendering)

- Tern is described as "a terminal host" [S25]. The source comment says a TSP program "describes its UI as a tree of semantic components and the terminal lays it out, draws and animates it natively" [S24].
- Transport: in-band APC sequences `ESC _ tsp ; <verb> ; <body> ESC \` on the pty. The body is UTF-8 JSON. Program-to-terminal verbs are `q` (query), `o` (open), `f` (frame), `b` (blob), `t` (palette), `x` (close). Terminal-to-program verbs are `r` (reply) and `e` (event) [S24].
- Handshake: a `hello` query followed by a DA1 request. A TSP-aware terminal answers before DA1. A terminal that does not speak TSP never answers, so the program keeps its ANSI renderer [S25].
- omp: `PI_TUI_NATIVE=0` disables the probe; `PI_TUI_NATIVE=1` forces it [S16][S15]. A supported reply switches the TUI to `native/backend.ts` [S15].
- The normative spec is cited in the source as `docs/sdk/src/protocol` in the Stencil repository, with the public overview at `https://docs.stencil.so/tern/protocol/` [S24]. The overview fetched here does not include the verb list, chunking, or framing (those are on linked pages that were not fetched) [S25]. Tern availability, licensing, and whether a third-party app can act as a TSP client are UNVERIFIED.

### 1.10 Detecting a new omp version and new TUI features

- Installed version: `omp --version` [S9]. The output format is UNVERIFIED.
- Wire compatibility: the `ready` frame lists `supportedProtocolVersions` [S8]. Clients should negotiate v2 when available [S8].
- Commands: `get_available_commands` returns `{commands}` with `name`, `source`, `aliases`, `description`, `input.hint`, and `subcommands`. `available_commands_update` is pushed at startup and whenever command metadata changes [S8]. This is the runtime source for a slash palette.
- Events: `set_event_filter` restricts which session events are forwarded. Unknown non-empty names are accepted, which lets a host pin the events it understands and fail closed on new ones [S8].
- Schema: `packages/coding-agent/src/modes/rpc/wire/rpc-wire.schema.json` is a JSON Schema 2020-12 bundle with an `x-rpc` section (command table, frame union, host-to-server union). Decoder rules: `x-open` records keep unknown keys; string enums are closed, so an unknown value fails the frame; defaults apply to older servers [S28][S8]. A test (`test/rpc-wire`) fails when the committed output is stale [S8].
- The schema ships inside the npm package: `package.json` `files` includes `src` [S29]. Whether the published tarball contains the schema was not checked (UNVERIFIED).
- Feature history: `CHANGELOG.md` per version [S7]. Its prose is not machine-readable.

---

## 2. Harness UI patterns

### 2.1 OpenAI Codex (CLI and desktop)

Facts:

- Repository `openai/codex`, Apache-2.0, 130,429 stars, pushed 2026-10-22 [C1].
- Latest stable tag `rust-v0.163.0` (2026-10-15). Several prereleases per week [C2].
- Surfaces: `codex` (TUI), `codex exec`, `codex app` (launches the ChatGPT desktop app on macOS or Windows), `codex app-server` (Experimental: "may change without notice"), and `codex remote-control` (Experimental) [C4].
- The official slash-commands page redirects to the developer-commands reference [C3][C4]. The TUI's own command list is in source [C5].
- TUI slash commands (from `slash_command.rs`, with descriptions) [C5]: `/config` (configure preferences), `/model` (model and reasoning effort), `/permissions` (what Codex may do), `/review` (review changes), `/diff` (git diff including untracked files), `/plan` (switch to Plan mode), `/compact`, `/recap`, `/new`, `/clear`, `/resume`, `/fork`, `/rename`, `/archive`, `/delete`, `/worktree`, `/copy` (last response), `/export` (as markdown), `/statusline`, `/title`, `/theme`, `/keymap`, `/vim`, `/status` (session config and token usage), `/usage`, `/mcp`, `/plugins`, `/skills`, `/hooks`, `/agents`, `/multi-agents`, `/goal`, `/btw`, `/voice`, `/ps` and `/stop` (background terminals), `/warnings`, `/daemon`, `/memories`, `/init` (create AGENTS.md), `/feedback`, `/logout`, `/quit`.
- Approval decisions for a command execution: `accept`, `acceptForSession`, `acceptWithExecpolicyAmendment`, `applyNetworkPolicyAmendment`, `decline`, `cancel` [C11].
- Sandbox and approval policy flags: `-a on-request|never`, `--sandbox read-only|workspace-write|danger-full-access` [C4].
- App-server transports: `stdio://`, `ws://IP:PORT`, `unix://`, and `off` [C4][C7]. The Python SDK spawns `codex app-server --listen stdio://` [C12].
- Client requests: `initialize`, `thread/start`, `thread/resume`, `thread/fork`, `thread/list`, `turn/start`, `turn/steer`, `turn/interrupt`, `model/list`, `command/exec`, `config/read`, `fs/readFile` [C10].
- Server requests needing a reply: `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, `item/tool/requestUserInput`, `mcpServer/elicitation/request`, `item/tool/call`, `applyPatchApproval` and `execCommandApproval` are also present [C8].
- Notifications: `turn/started`, `turn/completed`, `turn/diff/updated`, `turn/plan/updated`, `item/started`, `item/completed`, `item/agentMessage/delta`, `item/plan/delta`, `item/reasoning/*`, `item/commandExecution/outputDelta`, `item/fileChange/outputDelta`, `thread/started`, `thread/status/changed`, `thread/tokenUsage/updated`, `thread/goal/updated`, `serverRequest/resolved` [C9].
- Error codes follow JSON-RPC conventions (for example `-32602`, `-32603`, `-32600`) [C6].
- TUI source modules relevant to display: `diff_render.rs`, `diff_model.rs`, `approval_events.rs`, `bottom_pane/`, `chatwidget/`, `exec_cell/`, `config_panel/`, `file_search.rs` [C13].

Not verified: the ChatGPT desktop app's own UI. The docs say only that it launches [C4].

### 2.2 DeepSeek Harness (`dsh`)

Facts:

- Repository `deepseek-ai/deepseek-harness`, MIT, TypeScript, 257,861 stars, created 2026-08-13, pushed 2026-10-17 [D1].
- README: "an open-source agent harness developed by DeepSeek AI", built on an "everything-is-a-plugin" architecture. It is in **developer preview** and warns of compatibility-breaking changes [D2].
- Run: `npx @deepseek-ai/dsh web` starts a Web UI at `http://127.0.0.1:3080` [D2].
- Desktop shell: Electron (`electron` `^44.7.0`, `electron-builder`, `electron-updater`) [D4]. Makefile targets `desktop` and `dev-desktop` [D13].
- Latest tag is a prerelease, `dsh-v0.2.1-rc.2` (2026-10-17) [D3].
- Agent behavior (user guide): it reads and edits workspace files, runs commands, delegates work, and maintains a plan. It asks before operations that need approval under the active permission policy. The user chooses a workspace and configures a model under Settings → Models [D5].
- The repo also has `apps/cli` (CLI modes) [D12]. Its UI was not read (UNVERIFIED).
- Display modules (names and READMEs read where noted) [D11]:
  - **Approval** (`ui-approval`): takes over the conversation composer; Enter approves and Escape rejects; pointer and keyboard share one pending-request lock [D6].
  - **Plan** (`ui-plan`): `/plan` enters plan mode; a chip in the composer leaves it. Submitted plans open in the right sidebar and remain in the turn's final artifact area [D7].
  - **Permission presets** (`ui-permission-presets`): Read Only, Workspace Write, Full access. Full access and Auto need a risk acknowledgement. General settings change the future default; `/permission` changes the current session [D8].
  - **Deliverables** (`ui-deliverables`): a changed-files card closes each finished turn, with line counts. Each file opens a review tab. Only file-tool edits are listed outside git [D9].
  - **Docking** (`ui-dockkit`): a split tree of tabbed panes with invertible operations. Internal and not a stable API [D10].
  - Others: `ui-chat`, `ui-conversation`, `ui-commands`, `ui-jobs`, `ui-model-selection`, `ui-goal`, `ui-attachment`, `ui-directory-picker-native`, `ui-open-in-app`, `ui-message-feedback`, `ui-plugin-market` [D11].

### 2.3 Comparison table

"Worth copying" is my recommendation for a simple desktop UI, based on the evidence in the table.

| # | Pattern | Codex | DeepSeek Harness | omp | Worth copying? |
| --- | --- | --- | --- | --- | --- |
| 1 | Turn transcript with streaming text | `turn/started`, `item/agentMessage/delta`, `item/completed`, `turn/completed` [C9] | Chat and conversation modules [D11] | `message_start` / `message_update` (keyed by `messageId`) / `message_end`, `agent_end` [S8] | **Yes.** One card per turn; append deltas; key by message id. |
| 2 | Tool-call cards with collapsible output | `item/commandExecution/outputDelta` [C9] | Not verified | `tool_execution_*`, `tool_stream_update` [S8] | **Yes.** Collapsed by default; expand on demand. |
| 3 | Inline approval card above the composer | Approval requests and decisions [C8][C11] | Composer takeover, Enter and Escape [D6] | `select` with labels; cancel denies [S17][S8] | **Yes (highest value).** Show full command or diff; Approve once, Approve for session, Deny. |
| 4 | Permission preset selector | `-a` and `--sandbox` flags, `/permissions` [C4][C5] | Read Only / Workspace Write / Full access with risk acknowledgement [D8] | `always-ask`, `always-ask-cached`, `write`, `yolo` [S10] | **Yes.** Map to omp's `--approval-mode`. Require confirmation for the least-restricted level. |
| 5 | End-of-turn changed-files and diff review | `turn/diff/updated`, `/diff`, `diff_render.rs` [C9][C5][C13] | Changed-files card with line counts and a review tab [D9] | Edit tool results; diff details UNVERIFIED | **Yes.** Build from `tool_execution_end` and show a per-file view. |
| 6 | Plan / todo panel | `turn/plan/updated`, `/plan` [C9][C5] | Plan chip and sidebar review [D7] | `todo` tool, `set_todos`, `get_state.todoPhases` [S8] | **Yes, read-only first.** Editing via `set_todos` is optional. |
| 7 | Slash palette and command discovery | Slash popup, `slash_command.rs` [C5][C13] | `ui-commands` [D11] | `get_available_commands` plus `available_commands_update` [S8] | **Yes.** Feed from omp, not a hard-coded list, to stay in sync. |
| 8 | Session sidebar: resume, fork, rename, archive | `thread/list`, `thread/resume`, `thread/fork`, `/resume`, `/fork`, `/rename`, `/archive` [C10][C5] | Session history restored on reload [D7] | `get_entries`, `get_tree`, `switch_session`, `fork`, `open_session` [S8][S12] | **Yes.** Group by project directory. |
| 9 | Model and reasoning picker | `/model`, `model/list` [C5][C10] | Model selection module [D11] | `get_available_models`, `set_model`, `set_thinking_level`, `cycle_model` [S8] | **Yes.** |
| 10 | Context and usage meter | `/status`, `thread/tokenUsage/updated` [C5][C9] | Not verified | `get_state.contextUsage`, `get_session_stats`, `usageLimit` [S8] | **Yes.** A small meter in the header. |
| 11 | Follow-up queue and steering | `turn/steer`, `codex queue` [C10][C4] | Not verified | `queue_update`, `steer`, `follow_up`, `remove_queued_message`, `abort_and_restore_queue` [S8] | **Yes.** Render chips from snapshots, as omp recommends [S8]. |
| 12 | Stop or interrupt | `turn/interrupt` [C10] | Not verified | `abort` [S8] | **Yes.** Stop button. |
| 13 | Image and file attachments | `--image` [C4] | Attachment module [D11] | Images in `prompt`; `@file` [S8][S9] | **Yes.** Drag and drop. |
| 14 | Subagent and background-job panel | `/agents`, `/multi-agents`, `/ps`, `/stop` [C5] | Jobs module [D11] | Subagent frames, `cancel_subagent`, `steer_subagent`, `/jobs` [S8][S23] | **Later.** Show running jobs with status first. |
| 15 | Settings screens | `/config`, `/statusline`, `/title`, `/theme`, `/keymap` [C5] | General settings, Models [D5][D8] | `/settings`, `config.yml` [S11][S22] | **Partly.** Model, approval mode, and a few toggles only. |
| 16 | Multi-pane docking layout | Not verified | `ui-dockkit` [D10] | Not applicable | **No for v1.** High complexity. |
| 17 | Keymap remapping and Vim mode | `/keymap`, `/vim` [C5] | Shortcuts module [D11] | `keybindings.yml`, Vim mode [S13] | **No for v1.** |
| 18 | Worktree session | `/worktree`, `--worktree` [C5][C4] | Not verified | `/wt` [S22] | **Maybe.** |
| 19 | Theme picker | `/theme` [C5] | Not verified | Theme selector overlay [S23] | **No for v1.** Follow the OS theme. |
| 20 | Warnings and errors | `/warnings` [C5] | Not verified | `notice` and `extension_error` frames [S8] | **Yes.** Error banner with details. |

### 2.4 Recurring patterns to copy

Across both references, the same set recurs:

1. A turn-centric transcript that streams deltas (rows 1 and 2).
2. Approval as a blocking inline card with Approve and Deny, keyboard-driven (row 3).
3. Permission level as a preset with confirmation for the riskiest level (row 4).
4. A changed-files and diff review at the end of a turn (row 5).
5. A plan or todo panel (row 6).
6. A slash palette and a session sidebar (rows 7 and 8).

These are display patterns only. Neither reference's internal code was copied.

---

## 3. Tauri notes

### 3.1 Current version

- `tauri` crate: max stable 2.12.5 [T8]. npm `@tauri-apps/api` and `@tauri-apps/cli`: 2.12.4 [T9]. GitHub tag `tauri-cli-v2.12.4` published 2026-10-21 [T7].
- `tauri-plugin-shell`: max stable 2.5.0. Newest is `3.0.0-alpha.3`, an alpha [T8].

### 3.2 Spawning a child process and streaming stdio

**Option 1: sidecar through `tauri-plugin-shell`** [T1]

- Declare the binary in `tauri.conf.json` under `bundle.externalBin`. Each file must have the target-triple suffix (`rustc --print host-tuple`, Rust 1.84+) [T1].
- Rust: `app.shell().sidecar("<name>")` takes the file name only. `spawn()` returns `(rx, child)`. Read `CommandEvent::Stdout` (bytes). Write stdin with `child.write(...)` [T1].
- JavaScript: `Command.sidecar('binaries/<name>', args).execute()` [T1].
- Permissions: `shell:allow-execute` covers `execute()` and `shell:allow-spawn` covers `spawn()`. Scope entries use `"name": "binaries/<name>"` and `"sidecar": true`, plus static or validated `args` [T1].
- Caveat: the page's `args` example grants only `shell:allow-execute` but calls `spawn()`. The page itself says spawning needs `shell:allow-spawn` [T1].
- Stderr handling is not shown in the sidecar guide (UNVERIFIED).

**Option 2: Rust `std::process` inside a Tauri command (no shell plugin)** [T10][T3]

- Rust's `Command` inherits stdio by default. Use `Stdio::piped()` for stdin and stdout [T10].
- Tauri custom commands are callable by all windows by default unless restricted in `build.rs` [T3]. A Rust command that owns the child should therefore not need a shell permission. This is an inference from the capabilities page and is UNVERIFIED in a running app.
- Locating a bundled binary without the shell plugin is not covered by the pages read (UNVERIFIED).

**Event transport: Channels** [T2]

- Rust: a command takes `tauri::ipc::Channel<T>` and calls `send`. JavaScript: `new Channel()` from `@tauri-apps/api/core`, with `onmessage` set [T2].
- The docs say channels are "fast and deliver ordered data" and are used internally for child-process output. They say the event system is "not designed for low latency or high throughput situations" [T2].
- Implication: use one channel per session, carry omp's raw JSON frames or parsed events, and do framing and validation in Rust.

**Capabilities** [T3]

- Capability files are JSON or TOML in `src-tauri/capabilities`. Keys: `identifier`, `windows`, `permissions`, and optionally `description`, `platforms`, `remote`. All capabilities in that directory are enabled by default. The page does not describe a deny mechanism (UNVERIFIED).

### 3.3 Windows specifics

**WebView2.** Tauri uses Microsoft Edge WebView2 to render content on Windows. It is preinstalled on Windows 10 from version 1803 and on later Windows versions. Otherwise, install the Evergreen Bootstrapper [T5].

**Developer prerequisites.** WebView2 and the Microsoft C++ build tools (the "Desktop development with C++" option) are required for development. MSI builds need the VBSCRIPT optional feature. The page gives "Windows 7 and later" as the supported range [T5].

**Installer WebView2 modes** (`bundle.windows.webviewInstallMode.type`) [T4]:

| Mode | Installer size impact | Internet at install |
| --- | --- | --- |
| `downloadBootstrapper` (default) | 0 MB | Yes |
| `embedBootstrapper` | about 1.8 MB | Yes |
| `offlineInstaller` | about 127 MB | No |
| `fixedRuntime` (supply `path`) | about 180 MB | No |
| `skip` | 0 MB | No. Not recommended; the app will not work without the runtime. |

The fetched summary of this page shows two names for the fixed-runtime mode (`fixedVersion` and `fixedRuntime`). The config example uses `fixedRuntime`; confirm against the page before use [T4].

**App size.** The Tauri home page claims a Tauri app "can be little as 600KB" by using the OS web renderer [T6]. This is a vendor claim and was not measured here. No figure for the omp binary is available. The omp npm package ships native addons (`dist/*.node`) [S29], so the standalone binary's size and addon handling are UNVERIFIED.

**Electron comparison point.** DeepSeek Harness ships an Electron desktop app [D4]. No size figure was found in its sources (UNVERIFIED).

---

## 4. Sync strategy options for tracking upstream omp

| Option | How it works | Pros | Trade-offs and risks | Fit |
| --- | --- | --- | --- | --- |
| **A. Pin one omp release per app build** | Bundle a pinned standalone binary per target as a sidecar. Pinning is supported via `--binary --ref v<version>` [S3][S20]. | Deterministic. Testable. No surprise behavior changes. | Requires a bump process for releases that land almost daily [S4]. Larger installer. Per-OS builds. | Default for v1. |
| **B. Use the user's installed `omp`** | Run `omp` from PATH. Check `omp --version`, the `ready.protocolVersion`, and `get_available_commands`. Refuse unknown major versions [S8][S9]. | Always current. Small app. | User must install omp. Daily releases can change behavior. Needs clear errors. | Fallback or power-user mode. |
| **C. Schema-first codegen and CI drift check** | Generate TypeScript and Rust types from the committed `rpc-wire.schema.json` [S28]. In CI, fail when the schema changes against the pinned version. Use `set_event_filter` to pin the events the app understands [S8]. | Catches protocol drift at build time. Open-record decoding tolerates additive fields [S8]. | Must regenerate per bump. Closed enums fail frames, so unknown enum values need handling [S8]. | Recommended with A or B. |
| **D. Release watcher** | Poll GitHub Releases or npm dist-tags. Diff `CHANGELOG.md` `Added` entries and show "new in this version" [S4][S5][S7]. | Cheap. Good for notifications. | Changelog is prose. No compatibility guarantee. | Notifications only. |
| **E. Embed the omp SDK** | Ship Node or Bun and call `createAgentSession` in-process [S3][S5]. | Typed API. No framing code. | Large runtime (Bun `>=1.3.14`). Coupled to internals. | Not for a lightweight app. |
| **F. Vendor the Rust client source** | Copy `sdk/rust/omp-rpc` (`publish = false`) into the repo and pin it [S26]. | Rust-native types and transport [S8]. | Manual sync. Do not use the crates.io crate of the same name [S27]. | Option if you want the reference Rust client. |
| **G. Build on Tern TSP** | Render through Tern's native surface instead of a custom UI [S24][S25]. | Native rendering exists already. | Tern availability and licensing UNVERIFIED. Depends on a terminal product. | Investigate before committing. |

**Suggested combination (for discussion, not decided):** A for releases, C for protocol safety in CI, D for release notices, and B as a development fallback. This works with omp's existing version fields (`protocolVersion`, `supportedProtocolVersions`), its open-record decode rules, and its stale-output test [S8].

---

## 5. Open questions

1. **Approval wire sequence (UNVERIFIED in a live run).** Confirm the exact frames for a tool that needs approval in `--mode rpc`: the order relative to `tool_execution_start`, and whether the `select` has a timeout. `requestApproval` passes no timeout [S17][S19].
2. **Default approval mode.** Should the desktop app always pass `--approval-mode` explicitly, given omp's default is `yolo` [S18]? Recommended: yes.
3. **Standalone binary contents.** Does the standalone binary include the native `.node` addon that the npm package ships [S29]? What is its size? Not measured (UNVERIFIED).
4. **Credentials at rest.** Whether `agent.db` encrypts API keys and OAuth tokens (UNVERIFIED) [S14].
5. **Tern.** Is it downloadable and licensed for third parties? Could a Tauri app act as a TSP client? The full verb and framing reference was not fetched (UNVERIFIED) [S24][S25].
6. **crates.io `omp-rpc`.** Who maintains it, and does it track the official protocol? The metadata points to `can1357/omp`, which is not the official repository [S27]. Not used.
7. **Pre-stable references.** Codex app-server is Experimental [C4], and DeepSeek Harness is in developer preview [D2]. Use them as UI references, not as protocol dependencies.
8. **Documentation domains.** The OpenAI docs URL redirects to `learn.chatgpt.com` [C4]. The DeepSeek Harness docs site is linked from its README but is hosted under `deepseek-harness.github.io`, which was not fetched [D2]. Confirm canonical URLs before citing externally.
9. **Version output.** The exact output format of `omp --version` and whether any RPC state exposes the version (UNVERIFIED) [S9].
10. **Windows standalone download.** Whether `windows-x86_64` is published. Implied by the target format [S20]; not verified by download. Downloading binaries needs your permission.

---

## 6. Sources

Each source was read through its public page, API, or raw file. Commit-pinned oh-my-pi URLs use commit `0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0`. Other sources were read on 2026-10-22.

**oh-my-pi (S)**

- [S1] https://github.com/can1357/oh-my-pi
- [S2] https://api.github.com/repos/can1357/oh-my-pi
- [S3] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/README.md
- [S4] https://github.com/can1357/oh-my-pi/releases and https://github.com/can1357/oh-my-pi/releases/tag/v18.12.6
- [S5] https://registry.npmjs.org/@oh-my-pi/pi-coding-agent and https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent
- [S6] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/LICENSE
- [S7] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/coding-agent/CHANGELOG.md
- [S8] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/docs/rpc.md
- [S9] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/docs/cli-reference.md
- [S10] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/docs/approval-mode.md
- [S11] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/docs/config-usage.md
- [S12] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/docs/session.md
- [S13] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/docs/keybindings.md
- [S14] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/docs/auth-broker-gateway.md
- [S15] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/docs/tui-core-renderer.md
- [S16] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/docs/environment-variables.md
- [S17] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/coding-agent/src/tools/approval.ts
- [S18] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/coding-agent/src/tools/settings.ts
- [S19] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/coding-agent/src/modes/rpc/rpc-mode.ts
- [S20] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/coding-agent/src/cli/build-service.ts
- [S21] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/coding-agent/src/cli/update-cli.ts
- [S22] https://github.com/can1357/oh-my-pi/tree/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/coding-agent/src/slash-commands
- [S23] https://github.com/can1357/oh-my-pi/tree/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/tui/src/overlays
- [S24] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/wire/src/tsp.ts
- [S25] https://docs.stencil.so/tern/protocol/
- [S26] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/sdk/rust/omp-rpc/Cargo.toml
- [S27] https://crates.io/crates/omp-rpc and https://crates.io/api/v1/crates/omp-rpc
- [S28] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/coding-agent/src/modes/rpc/wire/rpc-wire.schema.json
- [S29] https://github.com/can1357/oh-my-pi/blob/0b5c27ab24719c86a5986b95ee55f4e75bc1aaa0/packages/coding-agent/package.json
- [S30] https://omp.sh (project homepage)
- [S32] https://gitcode.com/tonyliux/oh-my-pi/blob/main/README.md (search result only; not used)

**OpenAI Codex (C)**

- [C1] https://github.com/openai/codex and https://api.github.com/repos/openai/codex
- [C2] https://github.com/openai/codex/releases/tag/rust-v0.163.0
- [C3] https://github.com/openai/codex/blob/main/docs/slash_commands.md (pointer to the docs)
- [C4] https://learn.chatgpt.com/docs/developer-commands?surface=cli (reached by redirect from https://developers.openai.com/codex/cli/slash-commands)
- [C5] https://github.com/openai/codex/blob/main/codex-rs/tui/src/slash_command.rs
- [C6] https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
- [C7] https://github.com/openai/codex/blob/main/codex-rs/app-server/src/transport.rs
- [C8] https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/ServerRequest.ts
- [C9] https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/ServerNotification.ts
- [C10] https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/ClientRequest.ts
- [C11] https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/v2/CommandExecutionApprovalDecision.ts
- [C12] https://github.com/openai/codex/blob/main/sdk/python/src/openai_codex/client.py
- [C13] https://github.com/openai/codex/tree/main/codex-rs/tui/src

**DeepSeek Harness (D)**

- [D1] https://github.com/deepseek-ai/deepseek-harness and https://api.github.com/repos/deepseek-ai/deepseek-harness
- [D2] https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md
- [D3] https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2
- [D4] https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/package.json
- [D5] https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md
- [D6] https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-approval/README.md
- [D7] https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plan/README.md
- [D8] https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-permission-presets/README.md
- [D9] https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-deliverables/README.md
- [D10] https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-dockkit/README.md
- [D11] https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client
- [D12] https://github.com/deepseek-ai/deepseek-harness/tree/master/apps
- [D13] https://github.com/deepseek-ai/deepseek-harness/blob/master/Makefile

**Tauri (T) and Rust (R)**

- [T1] https://v2.tauri.app/develop/sidecar/
- [T2] https://v2.tauri.app/develop/calling-frontend/
- [T3] https://v2.tauri.app/security/capabilities/
- [T4] https://v2.tauri.app/distribute/windows-installer/
- [T5] https://v2.tauri.app/start/prerequisites/
- [T6] https://v2.tauri.app/
- [T7] https://github.com/tauri-apps/tauri/releases/tag/tauri-cli-v2.12.4
- [T8] https://crates.io/crates/tauri and https://crates.io/crates/tauri-plugin-shell (API: https://crates.io/api/v1/crates/tauri and https://crates.io/api/v1/crates/tauri-plugin-shell)
- [T9] https://registry.npmjs.org/@tauri-apps/api and https://registry.npmjs.org/@tauri-apps/cli
- [T10] https://doc.rust-lang.org/std/process/struct.Command.html
