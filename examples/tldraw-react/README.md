# tldraw React Example

This canvas-first example connects Mini Codex to a real tldraw canvas through
the `mini-codex/tldraw` adapter.

```bash
npm install --prefix examples/tldraw-react
npm run demo:tldraw:dev
```

The demo agent can summarize the canvas, propose new shapes, rename selected
shapes, organize the selection, or delete selected shapes. Canvas mutations are
approval-gated before they reach the tldraw editor.

The center canvas is the dominant surface. The side panels show compact run
steps, selected-shape summaries, proposed changes, and collapsed developer data.
