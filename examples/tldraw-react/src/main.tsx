import { createRoot } from "react-dom/client";
import "mini-codex/styles.css";
import "tldraw/tldraw.css";
import "./styles.css";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(<App />);
