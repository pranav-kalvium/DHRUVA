"use client";

import { Play, Pause, RotateCcw, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReplay } from "@/lib/replay-context";
import { SPEEDS } from "@/lib/constants";
import { formatSeconds } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function JourneyControls() {
  const { phase, play, pause, restart, speed, setSpeed, time, duration, seekTo, endJourney } =
    useReplay();

  return (
    <section aria-label="Journey playback controls" className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {phase !== "running" ? (
          <Button size="sm" onClick={play} className="min-w-24">
            <Play className="h-4 w-4" aria-hidden />
            {phase === "paused" ? "Resume" : "Play"}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={pause} className="min-w-24">
            <Pause className="h-4 w-4" aria-hidden />
            Pause
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={restart}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Restart
        </Button>
        <Button size="sm" variant="outline" onClick={endJourney}>
          <Flag className="h-4 w-4" aria-hidden />
          End journey
        </Button>

        <div
          role="group"
          aria-label="Playback speed"
          className="ml-auto flex overflow-hidden rounded-[6px] border border-line"
        >
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={cn(
                "min-h-9 px-2.5 text-xs font-semibold transition-colors",
                speed === s
                  ? "bg-navy-900 text-white"
                  : "bg-white text-ink-600 hover:bg-surface-raised",
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="tabular w-12 shrink-0 text-xs font-semibold text-ink-600">
          {formatSeconds(time)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.floor(duration)}
          step={0.5}
          value={Math.min(time, duration)}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="h-6 w-full accent-[#0A2540]"
          aria-label="Scrub journey timeline"
        />
        <span className="tabular w-12 shrink-0 text-right text-xs font-semibold text-ink-600">
          {formatSeconds(duration)}
        </span>
      </div>
    </section>
  );
}
