"use client";

import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { useReplay } from "@/lib/replay-context";

export function EndJourneyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { endJourney } = useReplay();
  const router = useRouter();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[10px] bg-white p-5 shadow-xl">
          <Dialog.Title className="text-base font-bold text-ink-900">
            End this journey?
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-ink-600">
            Playback will stop and the run will be marked ended. You can restart or view results from here.
          </Dialog.Description>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Continue watching
            </Button>
            <Button
              onClick={() => {
                endJourney();
                onOpenChange(false);
                router.push("/journey/results");
              }}
            >
              End and view results
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
