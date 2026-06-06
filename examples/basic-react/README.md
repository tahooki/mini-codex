# Basic React Example

This example consumes `mini-codex` through package exports and renders a
task-board workbench:

- left Mini Codex agent panel
- center host-owned todo dashboard
- right card detail, board health, proposed changes, and activity inspector

```bash
npm install --prefix examples/basic-react
npm run demo:basic:dev
```

The demo agent can propose creating, updating, moving, deleting, and planning
workspace cards. Each mutation is implemented as a host capability and requires
approval before it changes host state.

The example also registers a host-configured orchestration layer. The runtime
classifies board prompts into answer, inspect, create, move, sprint-plan, or
repair actions before the agent starts requesting capabilities, then shows the
decision as a compact card in the Mini Codex panel.
