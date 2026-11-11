// Chat admin from the laptop, via the Convex CLI (authenticated by your Convex login).
//   pnpm chat:clear
import { spawnSync } from "node:child_process";

const [cmd] = process.argv.slice(2);
if (cmd === "clear") {
  const r = spawnSync("pnpm", ["exec", "convex", "run", "chat:clear", "{}"], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
console.error("usage: pnpm chat:clear");
process.exit(1);
