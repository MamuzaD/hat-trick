import { cn } from "@/lib/utils";

/** A terminal window: square border, title set into the top edge, optional status line. */
export default function Panel({
  title,
  status,
  className,
  bodyClassName,
  glow,
  children,
}: {
  title: string;
  status?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  glow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "relative border-2 border-denim-600 bg-panel/95",
        glow && "shadow-[0_0_0_1px_rgb(255_196_107/0.08),0_20px_60px_-20px_rgb(0_0_0/0.6)]",
        className,
      )}
    >
      <h2 className="absolute -top-[0.62em] left-4 bg-[linear-gradient(to_bottom,var(--ink)_50%,var(--panel)_50%)] px-2 font-mono text-sm leading-none text-denim-300 md:text-base">
        {title}
      </h2>
      <div className={cn("px-3 pt-5 pb-4 sm:px-5 md:px-6 md:pt-7", bodyClassName)}>{children}</div>
      {status && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-denim-700 bg-denim-950/80 px-3 py-2 font-mono text-xs text-denim-400 sm:px-5 md:px-6 md:text-sm">
          {status}
        </div>
      )}
    </section>
  );
}
