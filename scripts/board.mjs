// Board admin from the laptop, via the Convex CLI (authenticated by your Convex login).
//   pnpm board:list
//   pnpm board:remove "<team name>"
//   pnpm board:reset
import { spawnSync } from "node:child_process";

const [cmd, ...rest] = process.argv.slice(2);
const run = (fn, args) => {
  const r = spawnSync("pnpm", ["exec", "convex", "run", fn, JSON.stringify(args)], { stdio: "inherit" });
  process.exit(r.status ?? 1);
};

if (cmd === "list") run("teams:list", {});
else if (cmd === "reset") run("teams:reset", {});
else if (cmd === "remove" && rest.join(" ").trim()) run("teams:removeTeam", { name: rest.join(" ").trim() });
else {
  console.error('usage: pnpm board:list | pnpm board:remove "<team name>" | pnpm board:reset');
  process.exit(1);
}
