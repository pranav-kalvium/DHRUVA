import type { Metadata } from "next";
import Link from "next/link";
import { Radar, MonitorSmartphone, ArrowRight, Map as MapIcon, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Callout } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";
import { DhruvaLogo } from "@/components/brand/dhruva-logo";
import { SplitText, FadeContent, AnimatedContent, ShinyText } from "@/components/reactbits";
import {
  PRODUCT_FULL_FORM,
  POSITIONING_STATEMENT,
  LIMITATION_STATEMENT,
} from "@/lib/constants";

export const metadata: Metadata = {
  title: "Smartphone-native vehicle positioning for short GNSS outages",
  description:
    "DHRUVA demonstrates navigation continuity through tunnels using on-device estimation: a working journey dashboard with honest uncertainty, plus a live device mode.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Intro */}
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-3">
            <DhruvaLogo className="h-12 w-12" />
            <div>
              <p className="text-2xl font-bold tracking-[0.2em] text-navy-900">DHRUVA</p>
              <p className="text-xs font-medium">
                <ShinyText text={PRODUCT_FULL_FORM} speed={4} color="#8a94a6" shineColor="#0a2540" spread={100} />
              </p>
            </div>
          </div>
          <h1 className="mt-5 text-2xl font-bold leading-tight text-ink-900 sm:text-3xl">
            <SplitText
              text="Navigation that keeps estimating when satellites disappear"
              tag="span"
              splitType="words"
              delay={60}
              duration={0.9}
              from={{ opacity: 0, y: 24 }}
              textAlign="left"
            />
          </h1>
          <p className="mt-3 text-base leading-7 text-ink-600">
            {POSITIONING_STATEMENT} In a tunnel, ordinary navigation freezes the blue dot or
            teleports it to the wrong road. DHRUVA demonstrates a constrained on-device estimate
            that keeps moving along the road, shows honestly growing uncertainty, and blends
            satellite fixes back only after they pass a quality gate.
          </p>
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <Link href="/live">
              <Button size="lg" className="w-full sm:w-auto">
                <Navigation className="h-5 w-5" aria-hidden />
                Start live navigation
              </Button>
            </Link>
            <Link href="/journey">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                <Radar className="h-5 w-5" aria-hidden />
                Verify with a recorded drive
              </Button>
            </Link>
            <Link href="/how-it-works">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                <MonitorSmartphone className="h-5 w-5" aria-hidden />
                How it works
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs font-medium text-amber-strong">{LIMITATION_STATEMENT}</p>
          <p className="mt-1 text-xs text-ink-600">
            Read the <Link className="text-navy-700 underline underline-offset-2" href="/how-it-works">methodology</Link>{" "}
            and the <Link className="text-navy-700 underline underline-offset-2" href="/privacy">privacy policy</Link>.
          </p>
        </div>

        {/* Product interface preview: the actual map surface, not stock art */}
        <AnimatedContent distance={40} duration={0.9} threshold={0.15}>
        <Card className="overflow-hidden">
          <CardHeader
            title="What an outage looks like"
            subtitle="The journey dashboard during a recorded GNSS blackout"
            action={<StatusPill tone="amber">DHRUVA Active</StatusPill>}
          />
          <div className="map-surface bg-map-bg p-3">
            <svg viewBox="0 0 400 240" className="h-auto w-full" role="img" aria-label="Illustration of a route entering a tunnel with a widening uncertainty corridor around the vehicle marker">
              <rect width="400" height="240" fill="var(--color-map-bg)" />
              {[60, 120, 180, 240, 300, 360].map((x) => (
                <line key={x} x1={x} y1={0} x2={x} y2={240} stroke="var(--color-map-tile-line)" strokeWidth="1" />
              ))}
              {[50, 110, 170].map((y) => (
                <line key={y} x1={0} y1={y} x2={400} y2={y} stroke="var(--color-map-tile-line)" strokeWidth="1" />
              ))}
              {/* tunnel band */}
              <rect x="170" y="88" width="90" height="64" fill="var(--color-map-tunnel)" opacity="0.85" rx="4" />
              <text x="176" y="82" fontSize="11" fill="#0A2540" fontWeight="600">Tunnel</text>
              {/* route */}
              <path d="M20 120 C 90 120, 130 118, 170 120 L 260 120 C 320 120, 360 116, 386 108" fill="none" stroke="#B9C7D8" strokeWidth="7" strokeLinecap="round" />
              <path d="M20 120 C 90 120, 130 118, 196 120" fill="none" stroke="var(--color-map-route)" strokeWidth="7" strokeLinecap="round" />
              {/* uncertainty corridor widening inside tunnel */}
              <ellipse cx="196" cy="120" rx="10" ry="10" fill="#94A3B8" opacity="0.25" />
              <ellipse cx="222" cy="120" rx="20" ry="16" fill="#94A3B8" opacity="0.25" />
              <ellipse cx="248" cy="119" rx="28" ry="22" fill="#94A3B8" opacity="0.28" />
              {/* dashed DR segment */}
              <path d="M196 120 L 260 120" fill="none" stroke="var(--color-map-route-dr)" strokeWidth="5" strokeDasharray="9 7" strokeLinecap="round" />
              {/* vehicle */}
              <circle cx="248" cy="119" r="9" fill="#0A2540" stroke="#fff" strokeWidth="2.5" />
              <path d="M248 111 L251.5 116 L244.5 116 Z" fill="#FF6B35" />
              {/* labels */}
              <text x="30" y="150" fontSize="11" fill="#4A5568">GNSS restored after this point</text>
              <text x="268" y="150" fontSize="11" fill="#4A5568">Confidence rebuilding</text>
            </svg>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line border-t border-line text-center text-xs">
            <div className="p-2.5"><p className="font-bold text-ink-900">GNSS quality</p><p className="text-ink-600">Good to none to restored</p></div>
            <div className="p-2.5"><p className="font-bold text-ink-900">Uncertainty</p><p className="text-ink-600">Widens, then narrows</p></div>
            <div className="p-2.5"><p className="font-bold text-ink-900">Positioning mode</p><p className="text-ink-600">Seven honest states</p></div>
          </div>
        </Card>
        </AnimatedContent>
      </section>

      {/* Problem */}
      <section className="mt-12" aria-labelledby="problem-heading">
        <h2 id="problem-heading" className="text-lg font-bold text-ink-900">The tunnel problem</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <FadeContent duration={700} threshold={0.2}>
          <Card className="p-4 h-full">
            <MapIcon className="h-5 w-5 text-navy-700" aria-hidden />
            <h3 className="mt-2 text-sm font-bold text-ink-900">Inside the tunnel</h3>
            <p className="mt-1 text-sm text-ink-600">
              Satellite signals are blocked. Consumer navigation apps freeze the position or show
              a searching state, leaving the driver to guess.
            </p>
          </Card>
          </FadeContent>
          <FadeContent duration={700} delay={120} threshold={0.2}>
          <Card className="p-4 h-full">
            <Radar className="h-5 w-5 text-navy-700" aria-hidden />
            <h3 className="mt-2 text-sm font-bold text-ink-900">What DHRUVA does</h3>
            <p className="mt-1 text-sm text-ink-600">
              Continues an on-device estimate from motion sensing, constrained to the road
              corridor, with uncertainty that visibly grows the longer the outage lasts.
            </p>
          </Card>
          </FadeContent>
          <FadeContent duration={700} delay={240} threshold={0.2}>
          <Card className="p-4 h-full">
            <ArrowRight className="h-5 w-5 text-navy-700" aria-hidden />
            <h3 className="mt-2 text-sm font-bold text-ink-900">What happens at exit</h3>
            <p className="mt-1 text-sm text-ink-600">
              Returning fixes are quality-checked before acceptance, then blended over a couple
              of seconds so the marker never teleports.
            </p>
          </Card>
          </FadeContent>
        </div>
      </section>

      {/* Honesty */}
      <section className="mt-10">
        <Callout tone="amber" title="What this is and is not">
          <ul className="list-disc space-y-1 pl-4">
            <li>Live mode runs on your phone's real sensors: GNSS position, speed and accuracy plus the accelerometer and gyroscope, fused on-device. Nothing is simulated.</li>
            <li>Recorded-drive mode replays IO-VNBD sensor logs (collected on UK test tracks, the only public dataset with logged GNSS outages) through the same estimation pipeline, so estimator behaviour is verifiable against logged ground truth without a vehicle. Indian corridors (Kamshet-1 Tunnel, Mumbai-Pune Expressway) are available as map routes; live mode runs fully on Indian roads.</li>
            <li>Not yet: measured in-vehicle accuracy on Indian roads and NavIC-constellation reporting. See the feasibility page for the validation roadmap.</li>
          </ul>
        </Callout>
      </section>

      {/* Quick links */}
      <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/live" className="group rounded-[10px] border border-line bg-white p-4 transition-colors hover:bg-surface-raised">
          <p className="text-sm font-bold text-navy-700">Live navigation <ArrowRight className="inline h-4 w-4" aria-hidden /></p>
          <p className="mt-1 text-xs text-ink-600">Real position, speed and drift from your phone's sensors.</p>
        </Link>
        <Link href="/journey" className="group rounded-[10px] border border-line bg-white p-4 transition-colors hover:bg-surface-raised">
          <p className="text-sm font-bold text-navy-700">Recorded-drive verification <ArrowRight className="inline h-4 w-4" aria-hidden /></p>
          <p className="mt-1 text-xs text-ink-600">Estimator behaviour against logged ground truth.</p>
        </Link>
        <Link href="/how-it-works" className="group rounded-[10px] border border-line bg-white p-4 transition-colors hover:bg-surface-raised">
          <p className="text-sm font-bold text-navy-700">How DHRUVA works <ArrowRight className="inline h-4 w-4" aria-hidden /></p>
          <p className="mt-1 text-xs text-ink-600">Pipeline from sensors to displayed position.</p>
        </Link>
        <Link href="/feasibility" className="group rounded-[10px] border border-line bg-white p-4 transition-colors hover:bg-surface-raised">
          <p className="text-sm font-bold text-navy-700">Feasibility and validation <ArrowRight className="inline h-4 w-4" aria-hidden /></p>
          <p className="mt-1 text-xs text-ink-600">Demonstrated, literature-supported and unmeasured.</p>
        </Link>
        <Link href="/faq" className="group rounded-[10px] border border-line bg-white p-4 transition-colors hover:bg-surface-raised">
          <p className="text-sm font-bold text-navy-700">FAQ <ArrowRight className="inline h-4 w-4" aria-hidden /></p>
          <p className="mt-1 text-xs text-ink-600">Tunnels, permissions, privacy and limits.</p>
        </Link>
      </section>
    </div>
  );
}
