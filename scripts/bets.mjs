// Bet admin from the laptop, via the Convex CLI (authenticated by your Convex login).
//   pnpm bets:reset
import { spawnSync } from "node:child_process";

const [cmd] = process.argv.slice(2);
if (cmd === "reset") {
  const r = spawnSync("pnpm", ["exec", "convex", "run", "bets:reset", "{}"], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
console.error("usage: pnpm bets:reset");
process.exit(1);
