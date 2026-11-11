"use client";

import { Dialog } from "@base-ui/react/dialog";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import Mascot from "./Mascot";

/** Set to "1" once the visitor has confirmed. One prompt per browser. */
export const INTRO_STORAGE_KEY = "hat-trick:intro-accepted";

function hasAccepted(): boolean {
  try {
    return window.localStorage.getItem(INTRO_STORAGE_KEY) === "1";
  } catch {
    // Storage blocked (private mode, embedded webview): ask again each visit.
    return false;
  }
}

function rememberAccepted() {
  try {
    window.localStorage.setItem(INTRO_STORAGE_KEY, "1");
  } catch {
    // Nothing to do: the modal still closes for this page load.
  }
}

const STEPS = [
  "add your team, and a project link if you have one.",
  "the model reads the link and prices your odds.",
  "odds update live, for everyone.",
];

/**
 * First-visit notice. The page is client-only (see ClientApp), so the initial
 * state can read localStorage and returning visitors never see a flash.
 * The only way out is the confirm button: Esc and outside clicks do nothing.
 */
export default function IntroModal() {
  const [open, setOpen] = useState(() => !hasAccepted());
  const confirmRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  function accept() {
    rememberAccepted();
    setOpen(false);
  }

  return (
    <Dialog.Root
      open={open}
      // Controlled, and deliberately deaf: only accept() closes it.
      onOpenChange={() => {}}
      disablePointerDismissal
      modal
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] min-h-dvh bg-ink/75 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none supports-backdrop-filter:backdrop-blur-[3px]" />
        <Dialog.Viewport className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
          <Dialog.Popup
            initialFocus={confirmRef}
            className="w-full max-w-[34rem] outline-none transition-opacity duration-150 data-ending-style:opacity-0 motion-reduce:transition-none"
          >
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex max-h-[calc(100dvh-3rem)] flex-col border-2 border-denim-500 bg-panel shadow-[0_0_0_1px_rgb(255_196_107/0.08),0_24px_70px_-20px_rgb(0_0_0/0.8)]"
            >
              {/* Title set into the top border, like Panel. */}
              <p
                aria-hidden="true"
                className="absolute -top-[0.62em] left-4 bg-panel px-2 font-mono text-sm leading-none text-denim-300 md:text-base"
              >
                notice <span className="text-denim-500">·</span> read before trading
              </p>

              <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pt-7 pb-5 sm:px-6 sm:pt-8">
                <div className="flex items-center gap-4 sm:gap-5">
                  <Mascot mood="smug" scale={3} className="size-[72px] shrink-0" />
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-denim-400 sm:text-sm">
                      <span className="text-amber">$</span> hat-trick --about
                    </p>
                    <Dialog.Title className="font-pixel text-[2rem] leading-[1.05] text-thread sm:text-[2.6rem]">
                      prediction market
                    </Dialog.Title>
                  </div>
                </div>

                <Dialog.Description className="mt-5 font-mono text-sm leading-relaxed text-denim-200 sm:text-base">
                  this is a prediction market for tonight&apos;s claude builders club contest. it shows the
                  live odds of each team winning the <span className="text-amber">&quot;thinking&quot; hat</span>.
                </Dialog.Description>

                <ol className="mt-4 space-y-1.5 border-l-2 border-denim-700 pl-3 font-mono text-sm leading-relaxed text-denim-300 sm:text-base">
                  {STEPS.map((step, i) => (
                    <li key={step} className="flex gap-3">
                      <span aria-hidden="true" className="shrink-0 text-denim-500">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>

                <p className="mt-4 font-mono text-sm leading-relaxed text-denim-200 sm:text-base">
                  this market is <em className="italic text-thread">completely not biased</em>.
                </p>
              </div>

              <div className="flex flex-col gap-3 border-t-2 border-denim-700 bg-denim-950/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="font-mono text-xs leading-relaxed text-denim-400 sm:max-w-[22ch] sm:text-[0.8rem]">
                  odds are final and not up for discussion.
                </p>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={accept}
                  className="h-11 shrink-0 cursor-pointer border-2 border-amber bg-amber px-4 font-mono text-sm font-semibold whitespace-nowrap text-ink outline-none transition-colors hover:border-thread hover:bg-thread focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thread active:translate-y-px sm:text-base"
                >
                  [ i accept the odds ]
                </button>
              </div>
            </motion.div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
