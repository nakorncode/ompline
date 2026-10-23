//! Bridge between the UI and one `omp --mode rpc` child process per session.
//!
//! omp speaks newline-delimited JSON on stdio. The bridge forwards each stdout line
//! unchanged and writes each command as one line on stdin. It does not interpret frames,
//! so frame types it does not know about pass through untouched.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

/// How long omp gets to exit after its stdin closes before the bridge kills it.
const EXIT_GRACE: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RpcEvent {
    /// One stdout line from omp, exactly as written.
    Frame { line: String },
    /// omp has exited. `code` is `None` when it was stopped by a signal.
    Exited { code: Option<i32> },
}

struct Session {
    stdin: ChildStdin,
    child: Arc<Mutex<Child>>,
}

#[derive(Default)]
pub struct Sessions {
    next_id: AtomicU32,
    running: Mutex<HashMap<u32, Session>>,
}

impl Sessions {
    /// Starts `omp --mode rpc` in `cwd` and calls `on_event` for every stdout line.
    pub fn start(
        &self,
        omp_path: &str,
        cwd: &str,
        on_event: impl Fn(RpcEvent) + Send + 'static,
    ) -> Result<u32, String> {
        if cwd.trim().is_empty() {
            return Err("a workspace folder is required".into());
        }

        let mut command = Command::new(omp_path);
        command
            .args(["--mode", "rpc"])
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command
            .spawn()
            .map_err(|e| format!("failed to start omp at {omp_path}: {e}"))?;
        let stdin = child.stdin.take().ok_or("omp stdin is not available")?;
        let stdout = child.stdout.take().ok_or("omp stdout is not available")?;
        let stderr = child.stderr.take().ok_or("omp stderr is not available")?;
        let child = Arc::new(Mutex::new(child));

        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                eprintln!("[omp {id}] {line}");
            }
        });
        let exit_watch = Arc::clone(&child);
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                on_event(RpcEvent::Frame { line });
            }
            on_event(RpcEvent::Exited {
                code: wait_for_exit(&exit_watch),
            });
        });

        lock(&self.running)?.insert(id, Session { stdin, child });
        Ok(id)
    }

    /// Writes one command line to a running session.
    pub fn send_line(&self, id: u32, line: &str) -> Result<(), String> {
        validate_line(line)?;
        let mut running = lock(&self.running)?;
        let session = running
            .get_mut(&id)
            .ok_or_else(|| format!("no running session {id}"))?;
        writeln!(session.stdin, "{line}")
            .and_then(|()| session.stdin.flush())
            .map_err(|e| format!("failed to write to omp: {e}"))
    }

    /// Closes a session's stdin so omp can finish, then kills it if it has not exited.
    pub fn stop(&self, id: u32) -> Result<(), String> {
        let session = lock(&self.running)?
            .remove(&id)
            .ok_or_else(|| format!("no running session {id}"))?;
        drop(session.stdin);

        let child = session.child;
        thread::spawn(move || {
            thread::sleep(EXIT_GRACE);
            if let Ok(mut child) = child.lock() {
                let _ = child.kill();
            }
        });
        Ok(())
    }
}

fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, String> {
    mutex
        .lock()
        .map_err(|_| "session state is unavailable".to_string())
}

/// Polls until omp exits. The lock is released between polls so `stop` can kill the child.
fn wait_for_exit(child: &Mutex<Child>) -> Option<i32> {
    loop {
        let status = child.lock().ok()?.try_wait().ok()?;
        match status {
            Some(status) => return status.code(),
            None => thread::sleep(POLL_INTERVAL),
        }
    }
}

/// A command must be exactly one JSON line; an embedded line break would split it in two.
pub fn validate_line(line: &str) -> Result<(), String> {
    if line.contains(['\n', '\r']) {
        return Err("a frame must not contain line breaks".into());
    }
    if line.trim().is_empty() {
        return Err("a frame must not be empty".into());
    }
    Ok(())
}

#[tauri::command]
pub fn start_session(
    sessions: State<'_, Sessions>,
    omp_path: String,
    cwd: String,
    events: Channel<RpcEvent>,
) -> Result<u32, String> {
    sessions.start(&omp_path, &cwd, move |event| {
        // A closed channel means the window is gone, so the frame is dropped.
        let _ = events.send(event);
    })
}

#[tauri::command]
pub fn send_frame(sessions: State<'_, Sessions>, session_id: u32, line: String) -> Result<(), String> {
    sessions.send_line(session_id, &line)
}

#[tauri::command]
pub fn stop_session(sessions: State<'_, Sessions>, session_id: u32) -> Result<(), String> {
    sessions.stop(session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Instant;

    #[test]
    fn accepts_one_json_line() {
        assert!(validate_line(r#"{"id":"req_1","type":"get_state"}"#).is_ok());
    }

    #[test]
    fn rejects_embedded_line_breaks() {
        assert!(validate_line("{\"type\":\"get_state\"}\n{}").is_err());
        assert!(validate_line("{}\r").is_err());
    }

    #[test]
    fn rejects_empty_frames() {
        assert!(validate_line("   ").is_err());
    }

    fn next_frame(
        rx: &mpsc::Receiver<RpcEvent>,
        mut matches: impl FnMut(&serde_json::Value) -> bool,
    ) -> serde_json::Value {
        let deadline = Instant::now() + Duration::from_secs(60);
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            match rx.recv_timeout(remaining).expect("timed out waiting for omp") {
                RpcEvent::Frame { line } => {
                    let frame: serde_json::Value =
                        serde_json::from_str(&line).expect("omp wrote a line that is not JSON");
                    if matches(&frame) {
                        return frame;
                    }
                }
                RpcEvent::Exited { code } => panic!("omp exited early with code {code:?}"),
            }
        }
    }

    /// Needs a real omp. Run with `OMPLINE_OMP_BIN=<path> cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn round_trips_get_state_through_real_omp() {
        let omp = std::env::var("OMPLINE_OMP_BIN").expect("set OMPLINE_OMP_BIN to an omp binary");
        let workspace = std::env::temp_dir().join("ompline-rpc-test");
        std::fs::create_dir_all(&workspace).unwrap();

        let (tx, rx) = mpsc::channel::<RpcEvent>();
        let sessions = Sessions::default();
        let id = sessions
            .start(&omp, workspace.to_str().unwrap(), move |event| {
                let _ = tx.send(event);
            })
            .unwrap();

        let ready = next_frame(&rx, |f| f["type"] == "ready");
        assert_eq!(ready["protocolVersion"], 1);

        sessions
            .send_line(id, r#"{"id":"t1","type":"get_state"}"#)
            .unwrap();
        let response = next_frame(&rx, |f| f["type"] == "response" && f["id"] == "t1");
        assert_eq!(response["success"], true);

        // Closing stdin is the clean shutdown path; omp is documented to exit 0.
        sessions.stop(id).unwrap();
        loop {
            match rx.recv_timeout(Duration::from_secs(30)).expect("omp did not exit") {
                RpcEvent::Exited { code } => {
                    assert_eq!(code, Some(0));
                    break;
                }
                RpcEvent::Frame { .. } => continue,
            }
        }
    }
}
