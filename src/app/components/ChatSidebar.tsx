"use client";

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useTrader } from "@/lib/useTrader";
import { cn } from "@/lib/utils";

export default function ChatSidebar() {
  const [open, setOpen] = useState(false);
  const me = useTrader();
  const messages = useQuery(api.chat.list);
  const send = useMutation(api.chat.send);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed top-[calc(0.75rem+env(safe-area-inset-top))] right-3 z-50 border-2 border-denim-500 bg-panel px-3 py-1.5 font-mono text-[16px] text-thread hover:border-amber hover:text-amber lg:hidden",
          open && "hidden",
        )}
      >
        [ chat ]
      </button>

      <aside
        aria-label="trading floor"
        className={cn(
          "fixed inset-0 z-[60] flex-col bg-ink p-3 lg:inset-y-0 lg:right-0 lg:left-auto lg:z-30 lg:flex lg:w-[22rem] lg:bg-transparent lg:py-5 lg:pr-4 lg:pl-0",
          open ? "flex" : "hidden",
        )}
      >
        <section className="relative flex min-h-0 flex-1 flex-col border-2 border-denim-600 bg-panel/95 shadow-[inset_0_1px_0_rgb(169_188_208/0.08),0_24px_60px_-28px_rgb(0_0_0/0.75)] backdrop-blur-[2px]">
          <h2 className="absolute -top-[0.62em] left-4 bg-[linear-gradient(to_bottom,var(--ink)_50%,var(--panel)_50%)] px-2 font-mono text-sm leading-none text-denim-300 md:text-base">
            trading floor
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="close chat"
            className="absolute -top-[0.7em] right-3 bg-ink px-2 font-mono text-[16px] leading-none text-denim-300 hover:text-amber lg:hidden"
          >
            [ x ]
          </button>

          <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pt-5 pb-3 font-mono text-[0.9rem] leading-snug">
            {messages === undefined && <p className="text-denim-500">connecting to the floor…</p>}
            {messages?.length === 0 && <p className="text-denim-500">the floor is quiet. say something bullish.</p>}
            {messages?.map((m) => {
              const hat = m.kind === "hat";
              const mine = m.traderId === me.id;
              return (
                <p key={m._id} className="break-words">
                  <span className={cn("mr-2", hat ? "text-thread" : mine ? "text-amber" : "text-denim-400")}>
                    {hat ? "★ the hat" : m.handle}
                  </span>
                  <span className={cn(hat ? "text-thread" : mine ? "text-amber" : "text-denim-200")}>{m.text}</span>
                </p>
              );
            })}
          </div>

          <form onSubmit={submit} className="border-t-2 border-denim-700 px-3 pt-3 pb-2">
            <div className="flex items-center gap-2 border-2 border-denim-600 bg-ink px-3 focus-within:border-amber">
              <span className="text-[16px] text-amber" aria-hidden>
                &gt;
              </span>
              <label htmlFor="chat-input" className="sr-only">
                message
              </label>
              <input
                id="chat-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
                autoComplete="off"
                spellCheck={false}
                placeholder="talk to the market"
                className="h-11 min-w-0 flex-1 bg-transparent font-mono text-[16px] text-thread outline-none placeholder:text-denim-600"
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono text-xs text-denim-400">
              <span>
                you are <b className="font-medium text-amber">{me.handle}</b>
              </span>
              {error && <span role="alert" className="ml-2 truncate text-red">{error}</span>}
            </div>
          </form>
        </section>
      </aside>
    </>
  );
}
