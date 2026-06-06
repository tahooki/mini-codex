# Contributing

Mini Codex is an independent open source project for embedding a Codex-powered
agent workbench into host applications.

## Setup

```bash
npm install
npm run typecheck
npm test
npm run build
```

Run the examples:

```bash
npm install --prefix examples/basic-react
npm run demo:basic:dev

npm install --prefix examples/tldraw-react
npm run demo:tldraw:dev
```

## Architecture Boundaries

- Keep core runtime code app-agnostic.
- Treat host applications as owners of their own state and mutations.
- Expose integrations through context providers, capabilities, approval
  policies, and adapters.
- Keep Codex SDK, tldraw, and Electron support behind optional subpath exports.
- Do not add product-specific workspace logic to `src/core` or `src/react`.

## Validation

Before opening a pull request or preparing a release, run:

```bash
npm run verify
```

For UI changes, also run the affected demo and verify the actual workbench
screen in a browser.

## Commit Scope

Keep commits focused around one stage or behavior. When a change includes a bug
fix discovered during adapter work, add a regression test in the smallest
package layer that owns the behavior.
