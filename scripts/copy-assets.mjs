import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/react", { recursive: true });
await copyFile("src/react/styles.css", "dist/react/styles.css");
