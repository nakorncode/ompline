# omp owns behavior and approval policy; the app only presents them

The app shows omp's commands, sessions, approval prompts and settings, and never defines its own. It does not pass an `--approval-mode` flag, so the approval mode comes from the user's omp configuration. The only settings the app stores itself are UI-only preferences such as theme and layout. A fixed default mode inside the app was considered and rejected, because it would diverge from the TUI for users who configured omp. This means that if omp is configured as `yolo`, the app runs in `yolo` too.
