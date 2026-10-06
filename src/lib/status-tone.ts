import type { LeadStatus, VisitStatus } from "@/lib/domain";
import type { Tone } from "@/components/ui";
import { OPEN_LEAD_STATUSES } from "@/lib/domain";

/** Status colour is functional, not decorative: it is the same everywhere. */
export function leadTone(status: LeadStatus): Tone {
  if (status === "new") return "gold";
  if (status === "closed_won") return "positive";
  if (status === "closed_lost") return "critical";
  if (OPEN_LEAD_STATUSES.includes(status)) return "info";
  return "neutral";
}

export function visitTone(status: VisitStatus): Tone {
  switch (status) {
    case "scheduled":
      return "info";
    case "completed":
      return "positive";
    case "cancelled":
      return "neutral";
    case "no_show":
      return "caution";
    default:
      return "neutral";
  }
}

export function propertyStatusTone(status: "draft" | "published" | "archived"): Tone {
  switch (status) {
    case "published":
      return "positive";
    case "draft":
      return "gold";
    default:
      return "neutral";
  }
}