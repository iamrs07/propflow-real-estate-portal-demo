import "server-only";
import type {
  Lead,
  LeadNote,
  LeadStatusEvent,
  Profile,
  StaffProperty,
  Visit,
} from "@/lib/data/types";
import {
  DEMO_AGENCY,
  DEMO_PROFILES,
  buildDemoLeads,
  buildDemoNotes,
  buildDemoProperties,
  buildDemoStatusEvents,
  buildDemoVisits,
} from "@/lib/data/demo/fixtures";

/**
 * In-memory demo state.
 *
 * Deliberately process-local: demo mode is a development and sales
 * demonstration aid, not a datastore. Everything resets when the server
 * restarts, which is exactly what you want when showing the journey.
 */
export interface DemoState {
  agency: typeof DEMO_AGENCY;
  profiles: Profile[];
  properties: StaffProperty[];
  leads: Lead[];
  notes: LeadNote[];
  events: LeadStatusEvent[];
  visits: Visit[];
  /** Public enquiries submitted during this demo session. */
  publicEnquiries: number;
}

let state: DemoState | null = null;

export function demoState(): DemoState {
  state ??= (() => {
    const properties = buildDemoProperties();
    return {
      agency: { ...DEMO_AGENCY },
      profiles: structuredClone(DEMO_PROFILES),
      properties,
      leads: buildDemoLeads(properties),
      notes: buildDemoNotes(),
      events: buildDemoStatusEvents(),
      visits: buildDemoVisits(),
      publicEnquiries: 0,
    };
  })();
  return state;
}

export function resetDemoState(): void {
  state = null;
}

/** New demo rows need id-shaped values so the UI and FKs behave normally. */
export function newDemoId(prefix: string): string {
  const segment = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `${prefix}${segment.slice(0, 8)}-${segment.slice(0, 4)}-4${segment.slice(4, 7)}-8${segment.slice(7, 10)}-${segment}`;
}