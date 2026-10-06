"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { Agency } from "@/lib/data/types";
import { SIGN_IN_PATH } from "@/lib/auth-paths";
import { telHref, whatsappHref } from "@/lib/format";
import { cx } from "@/components/ui";

const NAV = [
  { href: "/properties", label: "Homes" },
  { href: "/about", label: "About & contact" },
  { href: "/privacy", label: "Privacy" },
];

/**
 * `contactInert` is decided on the server, which is the only place that can read
 * the demo-mode flag (it is not a NEXT_PUBLIC_ variable). When set, the phone and
 * WhatsApp values are still shown as text but never become `tel:` or `wa.me`
 * links, so a demo placeholder can never start a call.
 */
export function SiteHeader({ agency, contactInert = false }: { agency: Agency; contactInert?: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const phone = telHref(agency.phone, { inert: contactInert });
  const whatsapp = whatsappHref(agency.whatsapp, { inert: contactInert });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-navy-700/60 bg-navy-900 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-3" onClick={() => setOpen(false)}>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-gold-500/70 font-display text-base text-gold-400"
          >
            N
          </span>
          <span className="leading-tight">
            <span className="block font-display text-lg tracking-tight">
              {agency.name}
            </span>
            <span className="block text-[11px] tracking-[0.16em] text-navy-200 uppercase">
              Rent, buy &amp; resale
            </span>
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-navy-100 transition-colors hover:text-gold-400"
            >
              {item.label}
            </Link>
          ))}
          {phone ? (
            <a
              href={phone}
              className="text-sm text-navy-100 transition-colors hover:text-gold-400 tabular-nums"
            >
              {agency.phone}
            </a>
          ) : (
            <span className="text-sm text-navy-100 tabular-nums">{agency.phone}</span>
          )}
          <Link
            href={SIGN_IN_PATH}
            className="rounded-md border border-navy-600 px-3 py-1.5 text-sm text-navy-100 transition-colors hover:border-gold-500 hover:text-gold-400"
          >
            Staff sign-in
          </Link>
        </nav>

        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-navy-600 text-navy-100 transition-colors hover:border-gold-500 hover:text-gold-400 md:hidden"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      <div
        id={panelId}
        hidden={!open}
        className="border-t border-navy-700/60 bg-navy-950 md:hidden"
      >
        <nav aria-label="Primary, mobile" className="mx-auto flex max-w-6xl flex-col px-4 py-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="border-b border-navy-800 py-3.5 text-[15px] text-navy-100 last:border-0"
            >
              {item.label}
            </Link>
          ))}
          {phone ? (
            <a
              href={phone}
              className="border-b border-navy-800 py-3.5 text-[15px] text-gold-400 tabular-nums"
            >
              Call {agency.phone}
            </a>
          ) : (
            <span className="border-b border-navy-800 py-3.5 text-[15px] text-navy-100 tabular-nums">
              {agency.phone}
            </span>
          )}
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="border-b border-navy-800 py-3.5 text-[15px] text-gold-400"
            >
              WhatsApp us
            </a>
          ) : null}
          <Link
            href={SIGN_IN_PATH}
            onClick={() => setOpen(false)}
            className={cx("py-3.5 text-[15px] text-navy-100", open ? "" : "border-t")}
          >
            Staff sign-in
          </Link>
        </nav>
      </div>
    </header>
  );
}