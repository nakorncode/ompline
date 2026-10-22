# ompline

A lightweight desktop interface for [oh-my-pi](https://github.com/can1357/oh-my-pi) (omp), the terminal coding agent.

ompline does not reimplement omp. It runs omp as a child process over its RPC protocol and shows the same sessions, approvals and commands in a desktop window. Only the TUI layout is replaced.

## Status

Pre-release, version 0.1.0. The project is not complete, and interfaces may change until 1.0.0.

## Requirements for building from source

- Windows 10 or 11 for now. macOS and Linux builds are planned through GitHub Actions.
- [bun](https://bun.sh) 1.3.14 or newer
- The Rust toolchain and the Tauri prerequisites for Windows

## Installation

No installer is published yet. Build instructions will be added when the scaffold lands.

## Design

- Architecture decisions: [docs/adr](docs/adr)
- Domain vocabulary: [GLOSSARY.md](GLOSSARY.md)
- Research notes: [docs/research](docs/research)

## Skills for agents

[.agents/skills](.agents/skills) contains 38 skills from [mattpocock/skills](https://github.com/mattpocock/skills), used under the MIT license (see [.agents/skills/LICENSE](.agents/skills/LICENSE)). [.claude/skills](.claude/skills) links to the same folder so Claude Code can load them.

## License

MIT. See [LICENSE](LICENSE).
