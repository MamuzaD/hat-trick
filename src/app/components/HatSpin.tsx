"use client";

import { Dialog } from "@base-ui/react/dialog";

/** The prize itself, rotating. Opened by clicking the mascot; closes on Esc, outside click or the button. */
export default function HatSpin({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] min-h-dvh bg-ink/80 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-[3px]" />
        <Dialog.Viewport className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
          <Dialog.Popup className="corners relative w-full max-w-[30rem] border-2 border-denim-500 bg-panel shadow-[0_0_80px_-20px_rgb(255_196_107/0.45),0_24px_70px_-20px_rgb(0_0_0/0.8)] outline-none transition-[opacity,transform] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <p
              aria-hidden
              className="absolute -top-[0.62em] left-4 bg-panel px-2 font-mono text-sm leading-none text-denim-300 md:text-base"
            >
              exhibit a <span className="text-denim-500">·</span> the hat
            </p>
            <div className="px-4 pt-6 pb-4 md:px-6">
              <Dialog.Title className="font-pixel text-3xl leading-none text-thread md:text-4xl">the prize</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-denim-300">
                one (1) &ldquo;thinking&rdquo; hat, shown from every angle for transparency.
              </Dialog.Description>
              {/* eslint-disable-next-line @next/next/no-img-element -- animated gif, must not be optimised */}
              <img
                src="/claude_hat_3d_spin.gif"
                alt="The thinking hat, spinning"
                className="mt-4 aspect-square w-full border-2 border-denim-700 bg-ink object-contain"
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t-2 border-denim-700 bg-denim-950/80 px-4 py-3 text-xs text-denim-400 md:px-6 md:text-sm">
              <span>
                current holder: <b className="font-medium text-amber">hat trick</b> (projected)
              </span>
              <Dialog.Close className="border-2 border-denim-500 px-3 py-1.5 text-sm text-denim-200 transition-colors hover:border-thread hover:text-thread">
                [ esc ] close
              </Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
