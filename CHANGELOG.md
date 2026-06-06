# Changelog

All notable changes to Mini Codex will be documented in this file.

## 0.1.0 - 2026-06-06

### Added

- App-agnostic Mini Codex runtime with threads, runs, messages, events,
  context providers, capability registration, approval lifecycle, and in-memory
  storage.
- Optional orchestration decision graph at `mini-codex/orchestration` for
  selecting safe execution routes, compiling approval/evidence policy, recording
  observations, and projecting display-safe decision cards.
- React provider, panel, thread, composer, run timeline, approval card,
  orchestration card, inspector, and three-panel workbench layout.
- Mock agent adapter for local demos and deterministic runtime tests.
- Optional Codex SDK adapter at `mini-codex/codex-sdk`.
- Optional tldraw adapter and example at `mini-codex/tldraw`.
- Optional Electron preload bridge adapter at `mini-codex/electron`.
- Basic React, tldraw, and Electron task-board demo apps.
- Install guide, API reference, release checklist, and contribution docs.
