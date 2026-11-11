"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { MAX_NAME_LENGTH } from "@/convex/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function AddTeam({ onLog }: { onLog: (tag: "ok" | "err", text: string) => void }) {
  const add = useMutation(api.teams.add);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError("the model requires a team name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await add({ name: clean });
      onLog("ok", `"${clean}" submitted for impartial evaluation`);
      setName("");
    } catch (err) {
      const msg = err instanceof ConvexError ? String(err.data) : "submission failed. the model blames the network.";
      setError(msg.toLowerCase());
      onLog("err", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="team-name" className="text-sm text-denim-400 md:text-base">
        enter your team. it will be evaluated fairly.
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div
          className={cn(
            "relative flex min-w-0 flex-1 items-center gap-3 border-2 bg-ink px-3 transition-colors",
            focused ? "border-amber" : "border-denim-600",
          )}
        >
          <span className="text-lg text-amber md:text-xl" aria-hidden>
            &gt;
          </span>
          <div className="relative min-w-0 flex-1">
            <Input
              id="team-name"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              spellCheck={false}
              placeholder={focused ? "" : "team name"}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="h-12 border-0 bg-transparent px-0 text-lg text-thread caret-transparent shadow-none placeholder:text-denim-600 focus-visible:ring-0 md:h-14 md:text-xl dark:bg-transparent"
            />
            {/* Block cursor that follows the text (monospace, so 1ch per character). */}
            {focused && name.length < MAX_NAME_LENGTH && (
              <span
                aria-hidden
                className="cursor-blink pointer-events-none absolute top-1/2 h-[1.2em] w-[0.6em] -translate-y-1/2 bg-amber text-lg md:text-xl"
                style={{ left: `${name.length}ch` }}
              />
            )}
          </div>
          <span className="shrink-0 text-xs text-denim-600 tabular-nums">
            {name.length}/{MAX_NAME_LENGTH}
          </span>
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={busy}
          className="h-12 border-2 border-denim-500 bg-transparent px-5 text-base text-thread hover:border-amber hover:bg-amber/10 hover:text-amber md:h-[3.75rem] md:text-lg"
        >
          {busy ? "[ … ]" : "[ submit ]"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red">
          [err] {error}
        </p>
      )}
    </form>
  );
}
