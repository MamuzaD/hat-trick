"use client";

import type { RankedTeam } from "@/convex/teams";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { formatOdds } from "./Leaderboard";
import Mascot from "./Mascot";
import Spinner from "./Spinner";
import Typewriter from "./Typewriter";

export type WhyRequest = {
  team: RankedTeam;
  /** whyCount when asked: >= 1 means the model has been questioned before. */
  priorCount: number;
  answer: string | null;
};

export default function WhyDrawer({
  request,
  onOpenChange,
}: {
  request: WhyRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = request !== null;
  const defensive = (request?.priorCount ?? 0) >= 1;
  const mood = !request?.answer ? "thinking" : defensive ? "defensive" : "smug";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="border-t-2 border-denim-500 bg-panel">
        {request && (
          <div className="mx-auto w-full max-w-4xl">
            <DrawerHeader className="flex-row items-center gap-4 md:gap-5 border-b-2 border-denim-700 px-4 py-4 text-left md:px-6">
              <Mascot mood={mood} scale={3} className="size-[72px] shrink-0" />
              <div className="min-w-0 flex-1 text-left">
                <DrawerTitle className="truncate font-mono text-base text-denim-300 md:text-lg">
                  why: <span className="text-thread">{request.team.name}</span>
                </DrawerTitle>
                <DrawerDescription className="font-mono text-xs text-denim-500 md:text-sm">
                  rank {String(request.team.rank).padStart(2, "0")} · odds {formatOdds(request.team.odds)}% ·
                  vibes {request.team.vibes}/10 · fit {request.team.hatHeadFit}% · {request.team.pizzaSlices} sl.
                </DrawerDescription>
              </div>
            </DrawerHeader>

            <div className="flex min-h-48 flex-col gap-2 px-4 py-5 font-mono text-sm leading-relaxed md:px-6 md:text-base">
              <p className="text-denim-500">
                <span className="text-amber">$</span> hat-trick --explain &quot;{request.team.name}&quot;
                {defensive && " --again"}
              </p>
              {!request.answer ? (
                <p className="text-amber">
                  [<Spinner />] consulting the model{defensive ? " (it sighs)" : ""}…
                </p>
              ) : (
                <>
                  <p className={cn(defensive ? "text-red" : "text-denim-400")}>
                    {defensive ? "[!!] ranking questioned again. model is offended." : "[ok] justification computed"}
                  </p>
                  <p className="text-base text-thread md:text-lg">
                    <Typewriter key={request.answer} text={request.answer} />
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end border-t-2 border-denim-700 px-4 py-3 md:px-6">
              <DrawerClose
                render={
                  <Button
                    variant="outline"
                    className="h-10 border-2 border-denim-500 bg-transparent px-4 text-sm text-denim-200 hover:border-thread hover:text-thread md:text-base"
                  />
                }
              >
                [ esc ] close
              </DrawerClose>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
