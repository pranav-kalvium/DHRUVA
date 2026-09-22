import { KAMSHET_ROUTE } from "../src/engine/routes";
import { computeResults, replayDurationS, routeContext } from "../src/engine/engine";
const r = computeResults(KAMSHET_ROUTE);
const ctx = routeContext(KAMSHET_ROUTE);
console.log("duration:", replayDurationS(KAMSHET_ROUTE).toFixed(0) + "s", "| outage:", r.outageDurationS.toFixed(0) + "s", "| drDist:", r.drDistanceM.toFixed(0) + "m", "| peakUnc:", r.maxUncertaintyM.toFixed(0) + "m", "| jump:", r.reacquisitionJumpM.toFixed(1) + "m");
console.log("entryD:", ctx.entry.toFixed(0), "exitD:", ctx.exit.toFixed(0));
console.log("timeline:", r.timeline.map((e) => e.t.toFixed(0) + "s " + e.label).join(" | "));
