"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { MAX_NAME_LENGTH } from "@/convex/config";
import { MAX_URL_LENGTH } from "@/convex/lib/url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Spinner from "./Spinner";

/** One `>` prompt with a block cursor that follows the text (monospace: 1ch per char). */
function Prompt({
  id,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  type = "text",
  inputMode,
  sigil = ">",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  placeholder: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  sigil?: string;
}) {
  const [focused, setFocused] = useState(false);
  // Inputs stay at >= 16px so iOS doesn't zoom on focus.
  const text = "text-[16px] md:text-[1.15rem]";
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 items-center gap-2.5 border-2 bg-ink px-3 transition-colors",
        focused ? "border-amber" : "border-denim-600",
      )}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span className={cn("shrink-0 text-amber", text)} aria-hidden>
        {sigil}
      </span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <Input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          maxLength={maxLength}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={focused ? "" : placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            "h-11 border-0 bg-transparent px-0 text-thread caret-transparent shadow-none placeholder:text-denim-600 focus-visible:ring-0 md:h-12 dark:bg-transparent",
            text,
          )}
        />
        {focused && value.length < 40 && (
          <span
            aria-hidden
            className={cn(
              "cursor-blink pointer-events-none absolute top-1/2 h-[1.2em] w-[0.6em] -translate-y-1/2 bg-amber",
              text,
            )}
            style={{ left: `${value.length}ch` }}
          />
        )}
      </div>
    </div>
  );
}

export type ControlStatus = { teams: number | null; engine: string; state: string; busy: boolean };

export default function ControlBar({
  onLog,
  onRecalculate,
  recalculating,
  status,
  hidden,
  onHeight,
}: {
  onLog: (tag: "ok" | "err", text: string) => void;
  onRecalculate: () => void;
  recalculating: boolean;
  status: ControlStatus;
  hidden?: boolean;
  onHeight: (px: number) => void;
}) {
  const add = useMutation(api.teams.add);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

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
      await add({ name: clean, url: link.trim() || undefined });
      onLog("ok", `"${clean}" submitted for impartial evaluation`);
      setName("");
      setLink("");
    } catch (err) {
      const msg = err instanceof ConvexError ? String(err.data) : "submission failed. the model blames the network.";
      setError(msg.toLowerCase());
      onLog("err", msg);
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "h-11 border-2 bg-transparent px-4 text-[1rem] whitespace-nowrap disabled:opacity-100 md:h-[3.25rem] md:text-[1.1rem]";

  return (
    <div
      ref={ref}
      className={cn(
        "fixed left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-[68rem] -translate-x-1/2 lg:left-[calc(50%-11rem)] lg:w-[calc(100%-25rem)] transition-[opacity,transform] duration-300",
        "bottom-[calc(0.75rem+env(safe-area-inset-bottom))]",
        hidden && "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <section
        aria-label="control"
        className="relative border-2 border-denim-500 bg-panel/[0.97] shadow-[0_-0.5rem_2.5rem_-0.5rem_rgb(0_0_0/0.7),0_0_0_1px_rgb(15_22_34)] backdrop-blur-sm"
      >
        <h2 className="absolute -top-[0.62em] left-4 bg-[linear-gradient(to_bottom,var(--ink)_50%,var(--panel)_50%)] px-2 text-[0.85rem] leading-none text-denim-300 md:text-[0.95rem]">
          control
        </h2>
        <form onSubmit={submit} className="flex flex-col gap-2.5 px-3 pt-4 pb-3 md:flex-row md:items-stretch md:gap-3 md:px-4">
          <div className="flex min-w-0 flex-col gap-2.5 md:flex-[5] md:flex-row md:gap-3">
            <div className="md:flex-[2]">
              <Prompt
                id="team-name"
                label="team name"
                value={name}
                onChange={setName}
                maxLength={MAX_NAME_LENGTH}
                placeholder="team name"
              />
            </div>
            <div className="md:flex-[3]">
              <Prompt
                id="team-link"
                label="project link (optional)"
                value={link}
                onChange={setLink}
                maxLength={MAX_URL_LENGTH}
                placeholder="link (optional) https://…"
                type="url"
                inputMode="url"
                sigil="@"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:flex md:gap-3">
            <Button
              type="submit"
              variant="outline"
              disabled={busy}
              className={cn(btn, "border-denim-400 text-thread hover:border-amber hover:bg-amber/10 hover:text-amber")}
            >
              {busy ? (
                <>
                  [ <Spinner /> ]
                </>
              ) : (
                "[ submit ]"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onRecalculate}
              disabled={recalculating}
              className={cn(btn, "border-denim-600 text-denim-200 hover:border-thread hover:bg-denim-800 hover:text-thread")}
            >
              {recalculating ? (
                <>
                  [ <Spinner /> recalc ]
                </>
              ) : (
                "[ recalculate ]"
              )}
            </Button>
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t-2 border-denim-700 bg-denim-950/80 px-3 py-1.5 text-[0.8rem] text-denim-400 md:px-4 md:text-[0.85rem]">
          {error ? (
            <span role="alert" className="text-red">
              [err] {error}
            </span>
          ) : (
            <span className={cn("flex items-center gap-2", status.busy ? "text-amber" : "text-denim-300")}>
              <span className={cn("inline-block size-2", status.busy ? "pulse-soft bg-amber" : "bg-denim-400")} />
              {status.state}
            </span>
          )}
          <span className="ml-auto flex flex-wrap gap-x-3">
            <span>
              teams <b className="font-medium text-thread">{status.teams ?? "–"}</b>
            </span>
            <span className="text-denim-600">│</span>
            <span>
              engine <b className="font-medium text-thread">{status.engine}</b>
            </span>
          </span>
        </div>
      </section>
    </div>
  );
}
