# Mini Codex Workspace Instructions

Mini Codex is an independent open source project.

Do not treat any sibling repository as product or architecture authority for this
workspace unless the user explicitly asks for that comparison. In particular,
do not import Voxel Game Studio product direction, feature documents, local
runtime code, Electron bridge code, Supabase assumptions, or Mini Codex V2
implementation details as foundation context.

The user explicitly approved two sibling workspaces as implementation reference
material for this package:

- `/Users/tahooki/Documents/git/codex-engine-workspace`: UI POC for the left
  Mini Codex panel, center work panel, and right info panel layout, plus useful
  event/protocol/approval patterns.
- `/Users/tahooki/Documents/git/make-game-playground/voxel-game-studio`: mature
  Mini Codex product integration patterns, especially transcript, host-entry,
  host-apply, tool registry, and event flow ideas.

Use those folders as source material, not as hard product authority. Extract and
generalize UI and logic into app-agnostic Mini Codex contracts. Do not copy over
Voxel-specific domains, Supabase assumptions, game/editor product direction, or
Electron-only behavior into the core package.

The following were POCs/reference snapshots and should not drive this package:

- `/Users/tahooki/Documents/git/make-game-playground/codex-agent-v2-foundation`
- `/Users/tahooki/Documents/git/make-game-playground/codex-agent-v2-reference/openai-codex`

Use this workspace's own docs and source as the primary context. When Codex SDK
behavior matters, verify the exact current SDK API against official OpenAI
documentation before implementation.

## Product Position

Mini Codex is an npm-installable library for embedding a Codex-powered agent
workbench into other applications.

The core product promise is:

```text
npm install mini-codex
```

Then app developers can add an agent panel, host-app context, app capabilities,
tool execution, approval flows, and event timelines to their own product.

## Architecture Bias

- Keep the core app-agnostic.
- Treat host applications as owners of their own state and mutations.
- Expose app integration through adapters, context providers, capabilities, and
  approval middleware.
- Keep Electron support optional.
- Keep tldraw support as an adapter and example, not a core dependency.
- Prefer small public contracts over hidden coupling.
