import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "mini-codex/styles.css";
import "../../../shared/todo-dashboard/styles.css";
import "./styles.css";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
