"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { cx } from "@/components/ui";

export interface CrmNavItem {
  href: string;
  label: string;
  /** Also treat nested paths as active. */
  nested?: boolean;
}

export function CrmNav({
  items,
  role,
  fullName,
  isDemo,
  signOutAction,
}: {
  items: CrmNavItem[];
  role: "admin" | "agent";
  fullName: string;
  isDemo: boolean;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const isActive = (item: CrmNavItem) =>
    item.nested ? pathname.startsWith(item.href) : pathname === item.href;

  return (
    <div className="bg-navy-900 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/crm" className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-sm border border-gold-500/70 font-display text-sm text-gold-400"
            >
              P
            </span>
            <span className="font-display text-base">PropFlow CRM</span>
          </Link>
          <span className="hidden rounded-full border border-navy-600 px-2 py-0.5 text-[11px] tracking-[0.14em] text-navy-200 uppercase sm:inline">
            {role === "admin" ? "Admin" : "Agent"}
          </span>
          {isDemo ? (
            <span className="hidden rounded-full border border-gold-500/50 px-2 py-0.5 text-[11px] tracking-[0.14em] text-gold-400 uppercase md:inline">
              Demo
            </span>
          ) : null}
        </div>

        <nav aria-label="Workspace" className="hidden items-center gap-1 lg:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item) ? "page" : undefined}
              className={cx(
                "rounded-md px-3 py-2 text-sm transition-colors",
                isActive(item)
                  ? "bg-navy-700 text-white"
                  : "text-navy-200 hover:bg-navy-800 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden max-w-40 truncate text-sm text-navy-200 md:inline">
            {fullName}
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md border border-navy-600 px-3 py-1.5 text-sm text-navy-100 transition-colors hover:border-gold-500 hover:text-gold-400"
            >
              Sign out
            </button>
          </form>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-navy-600 text-navy-100 lg:hidden"
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
      </div>

      <div id={panelId} hidden={!open} className="border-t border-navy-700 lg:hidden">
        <nav aria-label="Workspace, mobile" className="mx-auto max-w-7xl px-4 py-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(item) ? "page" : undefined}
              className={cx(
                "block border-b border-navy-800 py-3 text-sm last:border-0",
                isActive(item) ? "text-gold-400" : "text-navy-100",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}