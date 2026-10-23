mod rpc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(rpc::Sessions::default())
        .invoke_handler(tauri::generate_handler![
            rpc::start_session,
            rpc::send_frame,
            rpc::stop_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
