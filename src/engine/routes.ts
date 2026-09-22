import type { RouteData } from "./types";
import kamshetData from "./data/kamshet-route.json";

/**
 * Routes available to the demo replay.
 *
 * KAMSHET_ROUTE is generated from real OpenStreetMap geometry (see
 * scripts/gen-osm-route.mjs): the drive follows the Mumbai-Pune Expressway
 * through the mapped Kamshet-1 Tunnel (OSM way 130710860). OSM data
 * (c) OpenStreetMap contributors, ODbL. The bundled JSON makes the demo work
 * fully offline.
 *
 * The other two corridors are hand-authored illustrative geometries INSPIRED
 * by real Indian corridors. They are not surveyed alignments and are labeled
 * as illustrative in the UI.
 */

/** Real OpenStreetMap route through Kamshet-1 Tunnel. */
export const KAMSHET_ROUTE: RouteData = {
  ...kamshetData,
  points: kamshetData.points.map(([lat, lng]) => ({ lat, lng })),
} as RouteData;

/** Illustrative ghat corridor (hand-authored, not surveyed). */
export const KASARA_GHAT_ROUTE: RouteData = {
  id: "kasara-ghat",
  kind: "highway",
  name: "Ghat highway corridor (illustrative)",
  region: "Western Ghats highway (inspired by Kasara Ghat, Maharashtra)",
  description:
    "A ghat-section drive with a short twin-tube tunnel under the ridge. GNSS is strong on the open approach, fades at the portal and returns after the exit. Geometry is illustrative, not a surveyed alignment.",
  points: [
    { lat: 19.624, lng: 73.4012 },
    { lat: 19.6246, lng: 73.4042 },
    { lat: 19.6251, lng: 73.4073 },
    { lat: 19.6255, lng: 73.4104 },
    { lat: 19.6258, lng: 73.4134 },
    { lat: 19.626, lng: 73.416 },
    { lat: 19.6261, lng: 73.4184 },
    { lat: 19.6261, lng: 73.4206 },
    { lat: 19.626, lng: 73.4229 },
    { lat: 19.6258, lng: 73.4254 },
    { lat: 19.6255, lng: 73.428 },
    { lat: 19.6252, lng: 73.4306 },
  ],
  tunnelEntryIndex: 5,
  tunnelExitIndex: 8,
  tunnelName: "Ridge tunnel (illustrative)",
};

/** Illustrative urban corridor (hand-authored, not surveyed). */
export const PRAGATI_ROUTE: RouteData = {
  id: "pragati-maidan-tunnel",
  kind: "urban",
  name: "Urban tunnel approach (illustrative)",
  region: "Central Delhi (inspired by Pragati Maidan tunnels)",
  description:
    "An urban approach with dense high-rise obstruction before a city tunnel. The urban canyon weakens GNSS early and the covered section tests heading discipline during the outage. Geometry is illustrative, not a surveyed alignment.",
  points: [
    { lat: 28.6222, lng: 77.241 },
    { lat: 28.6228, lng: 77.243 },
    { lat: 28.6233, lng: 77.2451 },
    { lat: 28.6237, lng: 77.2472 },
    { lat: 28.624, lng: 77.2494 },
    { lat: 28.6242, lng: 77.2517 },
    { lat: 28.6242, lng: 77.254 },
    { lat: 28.624, lng: 77.2563 },
    { lat: 28.6237, lng: 77.2586 },
    { lat: 28.6232, lng: 77.2608 },
    { lat: 28.6226, lng: 77.2629 },
    { lat: 28.6219, lng: 77.2649 },
  ],
  tunnelEntryIndex: 5,
  tunnelExitIndex: 9,
  tunnelName: "City tunnel (illustrative)",
};

/** Kamshet first: the real-map route is the headline demo. */
export const ROUTES: RouteData[] = [KAMSHET_ROUTE, KASARA_GHAT_ROUTE, PRAGATI_ROUTE];

export function getRoute(id: string | null | undefined): RouteData {
  return ROUTES.find((r) => r.id === id) ?? KAMSHET_ROUTE;
}
