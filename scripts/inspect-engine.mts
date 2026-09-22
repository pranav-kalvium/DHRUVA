import { cumulativeDistances, tunnelDistances } from "../src/engine/route-geometry.ts";
import { KASARA_GHAT_ROUTE } from "../src/engine/routes.ts";
import { computeResults, replayDurationS, routeContext } from "../src/engine/engine.ts";

const r = KASARA_GHAT_ROUTE;
const cum = cumulativeDistances(r.points);
const { entry, exit } = tunnelDistances(r);
console.log("total", cum.at(-1).toFixed(0), "entry", entry.toFixed(0), "exit", exit.toFixed(0), "tl", (exit - entry).toFixed(0));
console.log("duration_s", replayDurationS(r));
const ctx = routeContext(r);
console.log("drStartIndex step t:", ctx.steps[ctx.drStartIndex]?.t, "at dist", ctx.steps[ctx.drStartIndex]?.dist.toFixed(0));
const results = computeResults(r);
console.log("outageS", results.outageDurationS, "drM", results.drDistanceM, "maxUnc", results.maxUncertaintyM, "jumpM", results.reacquisitionJumpM);
for (const e of results.timeline) console.log(" t=" + e.t.toFixed(1), e.kind, e.label);
const b = computeResults(r).baselines;
console.log("baselines", JSON.stringify(b));
