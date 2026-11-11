"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useTrader } from "@/lib/useTrader";
import { cn } from "@/lib/utils";
import Mascot from "./Mascot";

const MAX_LEN = 200;
const COUNTER_FROM = 140;

/** Washed denims: every trader gets a thread colour from the cap. Amber stays reserved for you and the hat. */
const TRADER_INKS = ["#a9bcd0", "#7fb2e6", "#e4dccb", "#8fd0c8", "#b9aee0", "#87a0bb", "#a8c98f", "#e0a9b4"];

function inkFor(handle: string): string {
  let h = 2166136261;
  for (let i = 0; i < handle.length; i++) h = Math.imul(h ^ handle.charCodeAt(i), 16777619) >>> 0;
  h ^= h >>> 15;
  return TRADER_INKS[h % TRADER_INKS.length];
}

function clock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function ChatSidebar() {
  const [open, setOpen] = useState(false);
  const me = useTrader();
  const messages = useQuery(api.chat.list);
  const send = useMutation(api.chat.send);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const traders = useMemo(
    () => new Set(messages?.filter((m) => m.kind !== "hat").map((m) => m.traderId)).size,
    [messages],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError(null);
    try {
      await send({ traderId: me.id, text: body });
      setText("");
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : "the floor is unreachable. try again.");
    }
  }

  const left = MAX_LEN - text.length;
  const canSend = text.trim().length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed top-[calc(0.75rem+env(safe-area-inset-top))] right-3 z-50 flex items-center gap-2 border-2 border-denim-500 bg-panel px-3 py-1.5 font-mono text-[16px] text-thread shadow-[0_10px_24px_-12px_rgb(0_0_0/0.8)] hover:border-amber hover:text-amber lg:hidden",
          open && "hidden",
        )}
      >
        <span className="live-dot size-1.5 bg-amber" aria-hidden />[ chat ]
      </button>

      <aside
        aria-label="trading floor"
        className={cn(
          "fixed inset-0 z-[60] flex-col bg-ink p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:inset-y-0 lg:right-0 lg:left-auto lg:z-30 lg:flex lg:w-[22rem] lg:bg-transparent lg:py-5 lg:pr-4 lg:pl-0",
          open ? "flex" : "hidden",
        )}
      >
        <section className="corners relative flex min-h-0 flex-1 flex-col border-2 border-denim-600 bg-panel/95 shadow-[inset_0_1px_0_rgb(169_188_208/0.08),0_24px_60px_-28px_rgb(0_0_0/0.75)] backdrop-blur-[2px]">
          <header className="px-3 pt-3">
            <div className="flex items-center gap-2.5">
              <span className="live-dot size-2 shrink-0 bg-amber" aria-hidden />
              <h2 className="title-shadow font-pixel text-[1.35rem] leading-none text-thread">trading floor</h2>
              <span className="ml-auto font-mono text-xs whitespace-nowrap text-denim-400">
                {messages === undefined ? (
                  <span className="pulse-soft">dialing…</span>
                ) : (
                  <>
                    <b className="font-medium text-denim-200">{traders}</b> on floor
                    <span className="mx-1.5 text-denim-600">/</span>
                    <b className="font-medium text-denim-200">{messages.length}</b> msg
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="close chat"
                className="-my-1 ml-1 border-2 border-denim-600 px-2 py-1 font-mono text-[16px] leading-none text-denim-200 hover:border-amber hover:text-amber lg:hidden"
              >
                esc ×
              </button>
            </div>
            <div className="stitch mt-3 text-denim-700" aria-hidden />
          </header>

          <div
            ref={listRef}
            className="chat-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-4 pb-3 font-mono text-[0.95rem] leading-snug"
          >
            {messages === undefined && (
              <p className="m-auto text-denim-500">
                connecting to the floor<span className="cursor-blink">_</span>
              </p>
            )}

            {messages?.length === 0 && (
              <div className="m-auto flex flex-col items-center px-4 text-center">
                <div className="relative">
                  <Mascot mood="idle" scale={3} className="bob [--px:3px]" />
                  <span className="sparkle -top-1 -right-3" aria-hidden />
                  <span className="sparkle bottom-2 -left-4 [animation-delay:1.3s]" aria-hidden />
                </div>
                <p className="mt-5 font-pixel text-[1.25rem] leading-tight text-thread">the floor is quiet.</p>
                <p className="glow-amber font-pixel text-[1.25rem] leading-tight text-amber">the odds are not.</p>
                <p className="mt-3 text-xs text-denim-500">say something bullish. it will be priced in.</p>
              </div>
            )}

            {messages && messages.length > 0 && (
              <ol className="mt-auto flex flex-col">
                <AnimatePresence initial={false}>
                  {messages.map((m, i) => {
                    const hat = m.kind === "hat";
                    const mine = !hat && m.traderId === me.id;
                    const prev = messages[i - 1];
                    const follows = !hat && prev && prev.kind !== "hat" && prev.traderId === m.traderId;
                    return (
                      <motion.li
                        key={m._id}
                        initial={reduce ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                        className={cn("min-w-0", follows ? "mt-0.5" : i > 0 && "mt-3")}
                      >
                        {hat ? (
                          <div className="flex items-start gap-3 border-2 border-l-4 border-denim-700 border-l-amber bg-denim-950 px-3 py-2.5 shadow-[0_0_28px_-14px_rgb(255_196_107/0.6)]">
                            <Mascot mood="smug" scale={1} className="mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-2">
                                <span className="glow-amber font-pixel text-base leading-none text-amber">the hat</span>
                                <span className="text-[0.7rem] tracking-wider text-denim-500 uppercase">market maker</span>
                                <time className="ml-auto text-[0.7rem] text-denim-600">{clock(m._creationTime)}</time>
                              </div>
                              <p className="mt-1 break-words text-thread">{m.text}</p>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "border-denim-800 px-2.5",
                              mine ? "border-r-2 border-r-amber text-right" : "border-l-2",
                            )}
                          >
                            {!follows && (
                              <div className={cn("flex items-baseline gap-2", mine && "flex-row-reverse")}>
                                <span
                                  className="truncate font-medium"
                                  style={{ color: mine ? "var(--amber)" : inkFor(m.handle) }}
                                >
                                  {m.handle}
                                </span>
                                {mine && <span className="text-[0.7rem] text-amber/60">you</span>}
                                <time className="text-[0.7rem] text-denim-600">{clock(m._creationTime)}</time>
                              </div>
                            )}
                            <p className={cn("break-words", mine ? "text-thread" : "text-denim-200")}>{m.text}</p>
                          </div>
                        )}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            )}
          </div>

          <form onSubmit={submit} className="border-t-2 border-denim-700 px-3 pt-3 pb-3">
            <div className="flex items-stretch gap-2">
              <div
                className={cn(
                  "relative flex min-w-0 flex-1 items-center gap-2 border-2 bg-ink px-3 transition-colors",
                  focused ? "border-amber" : "border-denim-600",
                )}
              >
                <span className="shrink-0 text-[16px] text-amber" aria-hidden>
                  &gt;
                </span>
                <label htmlFor="chat-input" className="sr-only">
                  message
                </label>
                <div className="relative min-w-0 flex-1">
                  <input
                    id="chat-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    maxLength={MAX_LEN}
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="send"
                    placeholder={focused ? "" : "say something"}
                    className={cn(
                      "h-11 w-full bg-transparent font-mono text-[16px] text-thread caret-amber outline-none placeholder:text-denim-600",
                      !text && "caret-transparent",
                    )}
                  />
                  {focused && !text && (
                    <span
                      aria-hidden
                      className="cursor-blink pointer-events-none absolute top-1/2 left-0 h-[1.15em] w-[0.6em] -translate-y-1/2 bg-amber text-[16px]"
                    />
                  )}
                </div>
                {text.length >= COUNTER_FROM && (
                  <span
                    className={cn("shrink-0 text-xs tabular-nums", left <= 10 ? "text-red" : "text-denim-500")}
                    aria-label={`${left} characters left`}
                  >
                    {left}
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={!canSend}
                className={cn(
                  "shrink-0 border-2 px-2 font-mono text-[16px] transition-colors lg:text-[0.9rem]",
                  canSend
                    ? "border-amber bg-amber text-ink hover:bg-thread hover:border-thread"
                    : "border-denim-700 text-denim-600",
                )}
              >
                [ send ]
              </button>
            </div>
          </form>

          <div className="flex items-center gap-2 border-t-2 border-denim-700 bg-denim-950/80 px-3 py-2 font-mono text-xs text-denim-400">
            {error ? (
              <span role="alert" className="truncate text-red">
                ! {error}
              </span>
            ) : (
              <>
                <span className="size-1.5 shrink-0 bg-amber" aria-hidden />
                <span className="truncate">
                  you are <b className="font-medium text-amber">{me.handle}</b>
                </span>
                <span className="ml-auto shrink-0 text-denim-600">enter ↵</span>
              </>
            )}
          </div>
        </section>
      </aside>
    </>
  );
}
