# Drive omp through RPC mode, one process per session

The app runs `omp --mode rpc` as a child process for each session and talks to it over omp's newline-delimited JSON protocol on stdio. Closing a session stops its process; omp keeps the session saved, so it can be reopened later. RPC is omp's documented host protocol, with typed events, commands and an approval flow, so the app never has to read terminal output. Scraping the TUI was rejected because each omp release could break it. `omp acp` was not evaluated in depth and can be revisited if RPC proves limiting.
