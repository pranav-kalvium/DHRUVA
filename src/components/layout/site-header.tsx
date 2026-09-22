"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Radar } from "lucide-react";
import { DhruvaLogo } from "@/components/brand/dhruva-logo";
import { cn } from "@/lib/utils";
import { LIMITATION_STATEMENT } from "@/lib/constants";

const NAV = [
  { href: "/live", label: "Live navigation" },
  { href: "/journey", label: "Recorded drive" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/feasibility", label: "Feasibility" },
  { href: "/faq", label: "FAQ" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-navy-900 text-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-[6px]"
          onClick={() => setOpen(false)}
        >
          <DhruvaLogo className="h-7 w-7" />
          <span className="text-base font-bold tracking-[0.18em]">DHRUVA</span>
          <span className="hidden text-[10px] font-medium uppercase tracking-wider text-steel-300 lg:inline">
            Prototype
          </span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-[6px] px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-navy-800 text-white"
                        : "text-steel-200 hover:bg-navy-800 hover:text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                href="/setup?mode=demo"
                className="ml-2 inline-flex items-center gap-1.5 rounded-[6px] bg-[#FF6B35] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#e55a28]"
              >
                <Radar className="h-4 w-4" aria-hidden />
                Launch demo
              </Link>
            </li>
          </ul>
        </nav>

        {/* Mobile menu button */}
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] text-white hover:bg-navy-800 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      {/* Mobile nav */}
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Primary mobile"
          className="border-t border-navy-800 md:hidden"
        >
          <ul className="space-y-1 px-4 py-3">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-[6px] px-3 py-3 text-base font-medium text-steel-100 hover:bg-navy-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/setup?mode=demo"
                onClick={() => setOpen(false)}
                className="mt-2 flex items-center justify-center gap-2 rounded-[6px] bg-[#FF6B35] px-3 py-3 text-base font-semibold text-white"
              >
                <Radar className="h-5 w-5" aria-hidden />
                Launch demo
              </Link>
            </li>
          </ul>
        </nav>
      )}
      <p className="sr-only">{LIMITATION_STATEMENT}</p>
    </header>
  );
}
