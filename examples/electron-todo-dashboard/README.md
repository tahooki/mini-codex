# Electron Todo Dashboard Example

This example wraps the Mini Codex todo dashboard in an optional Electron shell.
The renderer reuses the shared board UI, while the main process owns local file
access through a narrow preload bridge.

```bash
npm install --prefix examples/electron-todo-dashboard
npm run demo:electron:dev
npm run demo:electron:build
```

Run the desktop shell:

```bash
npm run start --prefix examples/electron-todo-dashboard
```

The demo registers `electron.project` context and local file capabilities from
`mini-codex/electron`. `electron.writeTextFile` requires visible approval before
the main process writes `board.json`.
