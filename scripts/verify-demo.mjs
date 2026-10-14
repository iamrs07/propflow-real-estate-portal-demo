/**
 * PropFlow — offline demo-mode verification.
 *
 * The other two suites cannot see the half of the app that never reaches a
 * database: the demo fixtures are built in process, and `isDemoMode()` decides
 * whether they are served at all. Both are asserted here directly, with no
 * network, no Docker, no Supabase project and no test framework — the same
 * dependency-free style as verify-security.mjs.
 *
 *   npm run verify:demo
 *
 * Run it through that script rather than calling node directly: it passes
 * node's `react-server` condition, which is what lets the `server-only` import
 * inside demo-session.ts resolve to its no-op entry instead of throwing.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** A bare Windows path like `C:\…` is not a valid ESM specifier; a file URL is. */
const fromRoot = (...segments) => pathToFileURL(join(root, ...segments)).href;

const env = await import(fromRoot("src", "lib", "env.ts"));
const fixtures = await import(fromRoot("src", "lib", "data", "demo", "fixtures.ts"));

/** demo-session.ts is `import "server-only"`, so it needs the react-server condition. */
async function importDemoSession() {
  try {
    return await import(fromRoot("src", "lib", "demo-session.ts"));
  } catch (error) {
    throw new Error(
      "Could not import src/lib/demo-session.ts because of its `server-only` import. " +
        "Run `npm run verify:demo`, which passes --conditions=react-server. " +
        `Original error: ${error?.message ?? error}`,
    );
  }
}

const demoSession = await importDemoSession();

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  bold: "\x1b[1m",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;

class AssertionError extends Error {}

function assert(condition, message) {
  if (!condition) throw new AssertionError(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new AssertionError(`${message}\n      expected: ${e}\n      actual:   ${a}`);
}

const ENV_KEYS = [
  "NODE_ENV",
  "PROPFLOW_DEMO_MODE",
  "PROPFLOW_DEMO_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

/**
 * Call `fn` with an exact environment, then put back whatever was there.
 * A value of `undefined` means "leave this variable unset", which is the state
 * a fresh clone is actually in and the one demo mode has to handle.
 */
function withEnv(values, fn) {
  const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const key of ENV_KEYS) delete process.env[key];
    for (const [key, value] of saved) {
      if (value !== undefined) process.env[key] = value;
    }
  }
}

/** Build the fixtures as if the wall clock were `iso`. */
function fixturesAt(iso, fn) {
  const real = Date.now;
  const instant = Date.parse(iso);
  assert(Number.isFinite(instant), `bad reference date ${iso}`);
  Date.now = () => instant;
  try {
    return fn();
  } finally {
    Date.now = real;
  }
}

/**
 * The invariant the visits board depends on: a visit is booked before it is due,
 * and it is not yet due. The board renders `Booked {created_at}` next to the
 * scheduled time, so a fixture that pins `created_at` to a fixed calendar date
 * drifts against a relative `scheduled_start` and eventually books a visit after
 * the visit itself — which is what shipped as "Booked 11 Nov" on a 7 Oct visit.
 */
function assertTimeline(visit, now) {
  const created = Date.parse(visit.created_at);
  const updated = Date.parse(visit.updated_at);
  const start = Date.parse(visit.scheduled_start);
  const end = Date.parse(visit.scheduled_end);
  const label = `visit ${visit.id}`;

  assert(
    [created, updated, start, end].every(Number.isFinite),
    `${label}: unparseable timestamp in ${JSON.stringify({ created_at: visit.created_at, updated_at: visit.updated_at, scheduled_start: visit.scheduled_start, scheduled_end: visit.scheduled_end })}`,
  );
  assert(created <= updated, `${label}: created_at runs ahead of updated_at`);
  assert(
    created < start,
    `${label}: booked ${visit.created_at} at or after its scheduled start ${visit.scheduled_start}`,
  );
  assert(start < end, `${label}: scheduled_end is not after scheduled_start`);
  assert(created <= now, `${label}: booked in the future (${visit.created_at})`);
  assert(now < start, `${label}: scheduled in the past (${visit.scheduled_start})`);
}

const DEMO_AGENT_IDS = [fixtures.DEMO_AGENT_ROHAN, fixtures.DEMO_AGENT_FARAH];
const DOCUMENTED_ACCOUNTS = [
  { email: "admin@northstar.demo", role: "admin", profileId: fixtures.DEMO_ADMIN_ID },
  { email: "rohan@northstar.demo", role: "agent", profileId: fixtures.DEMO_AGENT_ROHAN },
  { email: "farah@northstar.demo", role: "agent", profileId: fixtures.DEMO_AGENT_FARAH },
];

const profileFor = (id) => fixtures.DEMO_PROFILES.find((profile) => profile.id === id);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------------------------------------------------------------------------
// Fixture timeline
// ---------------------------------------------------------------------------

test("demo visits are booked in the past and scheduled in the future", () => {
  const now = Date.now();
  const visits = fixtures.buildDemoVisits();
  assert(visits.length > 0, "no demo visits were built");
  for (const visit of visits) assertTimeline(visit, now);
});

test("the visit timeline holds whatever the current date is", () => {
  // A hardcoded created_at passes on exactly one day of the calendar. Pin the
  // clock across the old value and either side of it, because the reported bug
  // was a fixed 2026-11-11 booking against a now-relative schedule.
  for (const reference of [
    "2026-06-01T00:00:00.000Z",
    "2026-10-05T00:00:00.000Z",
    "2026-11-11T12:00:00.000Z",
    "2027-02-14T00:00:00.000Z",
  ]) {
    fixturesAt(reference, () => {
      const now = Date.parse(reference);
      for (const visit of fixtures.buildDemoVisits()) {
        assertTimeline(visit, now);
      }
    });
  }
});

test("demo visit timestamps track the clock instead of a fixed calendar date", () => {
  const now = Date.now();
  for (const visit of fixtures.buildDemoVisits()) {
    const booked = Date.parse(visit.created_at);
    const start = Date.parse(visit.scheduled_start);
    assert(
      booked > now - 8 * DAY,
      `visit ${visit.id}: booked ${visit.created_at} is more than a week before now — a fixed date, not a relative one`,
    );
    assert(
      start < now + 8 * DAY,
      `visit ${visit.id}: scheduled ${visit.scheduled_start} is more than a week out — a fixed date, not a relative one`,
    );
  }
});

/**
 * The fixtures ask for a wall-clock time in Asia/Kolkata and the board renders
 * every timestamp in Asia/Kolkata, so the two have to agree to the minute. An
 * offset of a flat five hours instead of 5h30m put a visit asked for at 10:30 on
 * screen as 11:00, contradicting the note that tells the agent to meet at 10:30,
 * and nothing caught it: no assertion compared the requested time to the
 * rendered one.
 */
const KOLKATA = "Asia/Kolkata";
const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: KOLKATA,
  year: "numeric",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `YYYY-MM-DD HH:MM` in Asia/Kolkata, built from parts so it cannot drift with ICU. */
function wallClock(iso) {
  const found = Object.fromEntries(parts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${found.year}-${found.month}-${found.day} ${found.hour}:${found.minute}`;
}

/** The date the fixtures were built for, so the expectations below are not hard-coded. */
const builtOn = wallClock(new Date().toISOString()).slice(0, 10);

/** Asia/Kolkata has no DST, so one calendar day is exactly 86_400_000 ms. */
function plusDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("a visit asked for 10:30 in Asia/Kolkata reads back as 10:30", () => {
  const [first, second] = fixtures.buildDemoVisits();
  assertEqual(wallClock(first.scheduled_start), `${plusDays(builtOn, 2)} 10:30`, "first visit start");
  assertEqual(wallClock(first.scheduled_end), `${plusDays(builtOn, 2)} 11:15`, "first visit end");
  assertEqual(wallClock(second.scheduled_start), `${plusDays(builtOn, 5)} 15:00`, "second visit start");
  assertEqual(wallClock(second.scheduled_end), `${plusDays(builtOn, 5)} 15:45`, "second visit end");
});

test("the booking time a visit note describes matches the scheduled time", () => {
  // "meet at the gate at 10:30" is only credible if the board says 10:30.
  const [first] = fixtures.buildDemoVisits();
  assert(
    first.internal_notes.includes("10:30"),
    "the fixture no longer names the meeting time, so the note cannot be cross-checked",
  );
  assert(
    wallClock(first.scheduled_start).endsWith("10:30"),
    `the note says 10:30 but the board shows ${wallClock(first.scheduled_start)} IST`,
  );
});

/*
 * Leads, notes and status changes are the rest of the same story, and they rotted
 * for the same reason the visit dates did: literal November 2026 stamps that the
 * clock ran away from. The leads list renders created_at through formatRelative,
 * which clamps anything in the future to "just now", so a lead dated five weeks
 * out read as if it had just arrived.
 */
function demoStory() {
  const properties = fixtures.buildDemoProperties();
  return {
    leads: fixtures.buildDemoLeads(properties),
    notes: fixtures.buildDemoNotes(),
    events: fixtures.buildDemoStatusEvents(),
  };
}

test("no demo lead, note or status change is dated in the future", () => {
  const now = Date.now();
  const { leads, notes, events } = demoStory();
  for (const lead of leads) {
    assert(
      Date.parse(lead.created_at) <= now,
      `lead ${lead.full_name} was created at ${lead.created_at}, which has not happened yet`,
    );
    assert(
      Date.parse(lead.updated_at) >= Date.parse(lead.created_at),
      `lead ${lead.full_name} was updated before it was created`,
    );
    assert(
      lead.consent_at === null || Date.parse(lead.consent_at) <= now,
      `lead ${lead.full_name} consented at ${lead.consent_at}, which has not happened yet`,
    );
  }
  for (const note of notes) {
    assert(
      Date.parse(note.created_at) <= now,
      `note ${note.id} is dated ${note.created_at}, which has not happened yet`,
    );
  }
  for (const event of events) {
    assert(
      Date.parse(event.created_at) <= now,
      `status event ${event.id} is dated ${event.created_at}, which has not happened yet`,
    );
  }
});

test("a lead's history runs forwards from the moment it arrived", () => {
  const { leads, notes, events } = demoStory();
  for (const lead of leads) {
    const created = Date.parse(lead.created_at);
    for (const note of notes.filter((n) => n.lead_id === lead.id)) {
      assert(
        Date.parse(note.created_at) >= created,
        `note ${note.id} on ${lead.full_name} predates the lead`,
      );
    }
    const own = events
      .filter((event) => event.lead_id === lead.id)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    for (const event of own) {
      assert(
        Date.parse(event.created_at) >= created,
        `status event ${event.id} on ${lead.full_name} predates the lead`,
      );
    }
    // The last recorded transition has to be the status the lead is shown at, or
    // the history contradicts the board.
    if (own.length > 0) {
      assertEqual(
        own[own.length - 1].to_status,
        lead.status,
        `${lead.full_name} is shown as ${lead.status} but its history ends at ${own[own.length - 1].to_status}`,
      );
    }
  }
});

test("a requested visit slot is in the future and nothing else is", () => {
  const now = Date.now();
  const { leads } = demoStory();
  const requested = leads.filter((lead) => lead.preferred_visit_at);
  assert(requested.length > 0, "no lead has a requested visit slot to check");
  for (const lead of requested) {
    assert(
      Date.parse(lead.preferred_visit_at) > now,
      `${lead.full_name} asked for a slot at ${lead.preferred_visit_at}, which is already past`,
    );
  }
});

test("the activity timeline holds whatever the current date is", () => {
  for (const reference of ["2026-06-01T00:00:00.000Z", "2026-10-05T00:00:00.000Z", "2027-02-14T00:00:00.000Z"]) {
    fixturesAt(reference, () => {
      const now = Date.parse(reference);
      const { leads, notes, events } = demoStory();
      for (const lead of leads) {
        assert(
          Date.parse(lead.created_at) <= now,
          `lead ${lead.full_name}: created ${lead.created_at} is in the future at ${reference}`,
        );
      }
      for (const visit of fixtures.buildDemoVisits()) assertTimeline(visit, now);
      for (const note of notes) {
        assert(Date.parse(note.created_at) <= now, `note ${note.id} is in the future at ${reference}`);
      }
      for (const event of events) {
        assert(
          Date.parse(event.created_at) <= now,
          `status event ${event.id} is in the future at ${reference}`,
        );
      }
    });
  }
});

test("each demo visit stays assigned to its intended agent", () => {
  const visits = fixtures.buildDemoVisits();
  assertEqual(
    visits.map((visit) => visit.agent_id),
    [fixtures.DEMO_AGENT_ROHAN, fixtures.DEMO_AGENT_FARAH],
    "visit-to-agent assignment changed",
  );
  for (const visit of visits) {
    assert(
      DEMO_AGENT_IDS.includes(visit.agent_id),
      `visit ${visit.id} is assigned to ${visit.agent_id}, which is not a demo agent`,
    );
    const agent = profileFor(visit.agent_id);
    assert(agent, `visit ${visit.id} is assigned to a profile that is not in the fixtures`);
    assert(agent.is_active, `visit ${visit.id} is assigned to inactive profile ${agent.id}`);
    assert(
      agent.tenant_id === fixtures.DEMO_TENANT_ID,
      `visit ${visit.id} crosses tenancy: agent ${agent.id} is in ${agent.tenant_id}`,
    );
  }
  for (const agentId of DEMO_AGENT_IDS) {
    assertEqual(
      visits.filter((visit) => visit.agent_id === agentId).length,
      1,
      `agent ${agentId} does not have exactly one demo visit`,
    );
  }
});

/*
 * A locality is a neighbourhood *of its city*. The card prints "locality, city",
 * so a Mumbai neighbourhood filed under Pune renders "Bandra West, Pune" and
 * looks like a bug to any reader, while the agency copy and service areas stay
 * correct and nobody notices the fixture is the thing that is wrong. This pins
 * the pairing, and with it the address and map link, which repeat the same pair.
 */
const LOCALITIES_BY_CITY = {
  Mumbai: [
    "Bandra West", "Juhu", "Andheri East", "Goregaon East",
    "Khar West", "Malad West", "Borivali West"
  ],
};

test("every demo listing's locality belongs to its city", () => {
  for (const listing of fixtures.buildDemoProperties()) {
    const allowed = LOCALITIES_BY_CITY[listing.city];
    assert(allowed, `listing ${listing.reference_code} is in unlisted city ${listing.city}`);
    assert(
      allowed.includes(listing.locality),
      `listing ${listing.reference_code} pairs ${listing.locality} with ${listing.city}; ${listing.locality} is not in ${listing.city}`,
    );
  }
});

test("every demo listing's city is one the agency claims to serve", () => {
  for (const listing of fixtures.buildDemoProperties()) {
    assert(
      fixtures.DEMO_AGENCY.service_areas.includes(listing.city),
      `listing ${listing.reference_code} is in ${listing.city}, which the agency does not list as a service area`,
    );
  }
});

test("a listing's address and map link repeat its own locality and city", () => {
  for (const listing of fixtures.buildDemoProperties()) {
    assert(
      listing.private_address.includes(listing.locality),
      `listing ${listing.reference_code} has an address that does not name ${listing.locality}`,
    );
    assert(
      listing.private_address.includes(listing.city),
      `listing ${listing.reference_code} has an address that does not name ${listing.city}`,
    );
    // A listing may deliberately carry no map link, so only the ones that do
    // have to agree with their own locality and city.
    if (listing.map_link) {
      const query = decodeURIComponent(listing.map_link.split("query=")[1] ?? "");
      assert(
        query.includes(listing.locality) && query.includes(listing.city),
        `listing ${listing.reference_code} has a map link for "${query}", which is not ${listing.locality}, ${listing.city}`,
      );
    }
  }
});

test("demo visits reference the seeded lead and property", () => {
  const properties = fixtures.buildDemoProperties();
  const leads = fixtures.buildDemoLeads(properties);
  const propertyIds = new Set(properties.map((property) => property.id));
  const leadIds = new Set(leads.map((lead) => lead.id));
  for (const visit of fixtures.buildDemoVisits()) {
    assert(visit.tenant_id === fixtures.DEMO_TENANT_ID, `visit ${visit.id} has the wrong tenant`);
    assert(propertyIds.has(visit.property_id), `visit ${visit.id} points at a missing property`);
    assert(leadIds.has(visit.lead_id), `visit ${visit.id} points at a missing lead`);
    const creator = profileFor(visit.created_by);
    assert(creator, `visit ${visit.id} was booked by a profile that is not in the fixtures`);
  }
});

// ---------------------------------------------------------------------------
// Demo credentials
// ---------------------------------------------------------------------------

test("demo accounts keep the documented addresses, password and roles", () => {
  assertEqual(
    fixtures.DEMO_ACCOUNTS.map((account) => account.email),
    DOCUMENTED_ACCOUNTS.map((account) => account.email),
    "the demo account list no longer matches the documented one",
  );
  assertEqual(
    new Set(fixtures.DEMO_ACCOUNTS.map((account) => account.email)).size,
    fixtures.DEMO_ACCOUNTS.length,
    "duplicate demo account email",
  );
  assertEqual(fixtures.DEMO_PASSWORD, "PropFlowDemo!2026", "the documented demo password changed");
  for (const account of fixtures.DEMO_ACCOUNTS) {
    assertEqual(account.password, fixtures.DEMO_PASSWORD, `${account.email} has a different password`);
    assert(
      account.email.endsWith("@northstar.demo"),
      `${account.email} is not an @northstar.demo address`,
    );
    assert(UUID.test(account.profileId), `${account.email} has a non-uuid profileId`);
  }
});

test("one admin and two agents, all active, all in the demo tenancy", () => {
  const roles = fixtures.DEMO_ACCOUNTS.map((account) => profileFor(account.profileId)?.role);
  assertEqual(roles, ["admin", "agent", "agent"], "demo roles changed");
  for (const account of fixtures.DEMO_ACCOUNTS) {
    const profile = profileFor(account.profileId);
    assert(profile, `${account.email} has no profile in the fixtures`);
    assert(profile.is_active, `${account.email} is not an active profile`);
    assertEqual(
      profile.tenant_id,
      fixtures.DEMO_TENANT_ID,
      `${account.email} is not in the demo tenancy`,
    );
  }
});

test("the sign-in page and the README quote the fixtures rather than a second copy", async () => {
  const [login, readme] = await Promise.all([
    readFile(join(root, "src", "app", "auth", "login", "page.tsx"), "utf8"),
    readFile(join(root, "README.md"), "utf8"),
  ]);
  for (const account of DOCUMENTED_ACCOUNTS) {
    assert(
      readme.includes(`\`${account.email}\``),
      `README.md no longer documents ${account.email}`,
    );
    assert(
      !login.includes(account.email),
      `the sign-in page hardcodes ${account.email} instead of reading DEMO_ACCOUNTS`,
    );
  }
  assert(
    !login.includes("PropFlowDemo!2026"),
    "the sign-in page hardcodes the demo password instead of reading DEMO_PASSWORD",
  );
  for (const symbol of ["DEMO_ACCOUNTS", "DEMO_PASSWORD"]) {
    assert(
      login.includes(`from "@/lib/data/demo/fixtures"`),
      "the sign-in page no longer imports the demo fixtures",
    );
    assert(login.includes(symbol), `the sign-in page no longer reads ${symbol} from the fixtures`);
  }
  assert(readme.includes("PropFlowDemo!2026"), "README.md no longer documents the demo password");
});

// ---------------------------------------------------------------------------
// Demo mode resolution
// ---------------------------------------------------------------------------

test(".env.example does not switch demo mode off behind the user's back", async () => {
  const example = await readFile(join(root, ".env.example"), "utf8");
  const active = example
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0]);

  assert(
    !active.includes("PROPFLOW_DEMO_MODE"),
    "PROPFLOW_DEMO_MODE is assigned in .env.example, which forces demo mode off on a fresh clone",
  );
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PROPFLOW_TENANT_SLUG",
  ]) {
    assert(active.includes(key), `.env.example no longer sets ${key}`);
  }
});

test("development without a Supabase project enters demo mode on its own", () => {
  assertEqual(
    withEnv({ NODE_ENV: "development" }, () => env.isDemoMode()),
    true,
    "a fresh clone in development did not enter demo mode",
  );
  assertEqual(
    withEnv({ NODE_ENV: "development" }, () => env.hasSupabaseConfig()),
    false,
    "hasSupabaseConfig() was true with no project configured",
  );
});

test("a half-configured project still falls back to demo mode in development", () => {
  assertEqual(
    withEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }, () =>
      env.isDemoMode(),
    ),
    true,
    "a URL with no anon key was treated as a configured project",
  );
  assertEqual(
    withEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" }, () =>
      env.isDemoMode(),
    ),
    true,
    "an anon key with no URL was treated as a configured project",
  );
});

test("a fully configured project leaves demo mode off in development", () => {
  assertEqual(
    withEnv(
      {
        NODE_ENV: "development",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      },
      () => env.isDemoMode(),
    ),
    false,
    "demo mode was on with a real project configured",
  );
});

test("PROPFLOW_DEMO_MODE=0 and =1 override the automatic decision", () => {
  assertEqual(
    withEnv({ NODE_ENV: "development", PROPFLOW_DEMO_MODE: "0" }, () => env.isDemoMode()),
    false,
    "PROPFLOW_DEMO_MODE=0 did not turn demo mode off",
  );
  assertEqual(
    withEnv(
      {
        NODE_ENV: "development",
        PROPFLOW_DEMO_MODE: "1",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      },
      () => env.isDemoMode(),
    ),
    true,
    "PROPFLOW_DEMO_MODE=1 did not force demo mode on",
  );
});

test("a production build never falls back to fixtures on its own", () => {
  assertEqual(
    withEnv({ NODE_ENV: "production" }, () => env.isDemoMode()),
    false,
    "a production build with no project served demo data instead of failing",
  );
  assertEqual(
    withEnv(
      {
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
      },
      () => env.isDemoMode(),
    ),
    false,
    "a production build with a real project turned demo mode on",
  );
  assertEqual(
    withEnv({ NODE_ENV: "production", PROPFLOW_DEMO_MODE: "0" }, () => env.isDemoMode()),
    false,
    "PROPFLOW_DEMO_MODE=0 was not respected in production",
  );
  assertEqual(
    withEnv({ NODE_ENV: "production", PROPFLOW_DEMO_MODE: "1" }, () => env.isDemoMode()),
    true,
    "an explicit PROPFLOW_DEMO_MODE=1 opt-in was ignored in production",
  );
});

// ---------------------------------------------------------------------------
// Demo session safeguards
// ---------------------------------------------------------------------------

test("a production build signs no demo session without a 32-character secret", () => {
  for (const secret of [undefined, "", "   ", "too-short"]) {
    withEnv({ NODE_ENV: "production", PROPFLOW_DEMO_SECRET: secret }, () => {
      assertEqual(
        demoSession.demoSecret(),
        null,
        `a ${JSON.stringify(secret)} secret was accepted in production`,
      );
      assertEqual(
        demoSession.demoSessionIsSafe(),
        false,
        `a ${JSON.stringify(secret)} secret reported demo mode as safe in production`,
      );
      assertEqual(
        demoSession.signDemoProfile(fixtures.DEMO_ADMIN_ID),
        null,
        `a ${JSON.stringify(secret)} secret still produced a cookie in production`,
      );
      assertEqual(
        demoSession.verifyDemoProfile(`${fixtures.DEMO_ADMIN_ID}.forged`),
        null,
        `a ${JSON.stringify(secret)} secret accepted a forged cookie in production`,
      );
    });
  }
});

test("demo mode in production is on but unusable until a real secret is set", () => {
  // The dangerous pairing: demo data served to a network-reachable deployment
  // whose only staff protection would be a key committed to this repository.
  withEnv({ NODE_ENV: "production", PROPFLOW_DEMO_MODE: "1" }, () => {
    assertEqual(env.isDemoMode(), true, "the explicit opt-in did not take effect");
    assertEqual(
      demoSession.signDemoProfile(fixtures.DEMO_ADMIN_ID),
      null,
      "a production demo deployment issued a session with no secret",
    );
  });
});

test("a 32-character production secret is accepted and signs a verifiable cookie", () => {
  const secret = "a".repeat(32);
  withEnv({ NODE_ENV: "production", PROPFLOW_DEMO_SECRET: secret }, () => {
    const key = demoSession.demoSecret();
    assertEqual(key?.secret, secret, "the production secret was not used");
    assertEqual(key?.developmentFallback, false, "production fell back to the committed key");
    assertEqual(demoSession.demoSessionIsSafe(), true, "demo mode was reported unsafe in production");

    const signed = demoSession.signDemoProfile(fixtures.DEMO_ADMIN_ID);
    assert(signed, "no cookie was signed with a valid production secret");
    assertEqual(
      demoSession.verifyDemoProfile(signed),
      fixtures.DEMO_ADMIN_ID,
      "a correctly signed cookie did not verify",
    );
  });
});

test("a development build uses the committed fallback key", () => {
  withEnv({ NODE_ENV: "development" }, () => {
    const key = demoSession.demoSecret();
    assertEqual(key?.developmentFallback, true, "development did not use the fallback key");
    assertEqual(demoSession.demoSessionIsSafe(), true, "demo mode was reported unsafe in development");
  });
});

test("a tampered demo cookie resolves to nobody", () => {
  withEnv({ NODE_ENV: "development", PROPFLOW_DEMO_SECRET: "b".repeat(32) }, () => {
    const signed = demoSession.signDemoProfile(fixtures.DEMO_AGENT_ROHAN);
    assert(signed, "no cookie was signed");

    // The classic escalation: an agent's own cookie with the admin's id swapped in.
    const [id, tag] = signed.split(".");
    const forged = `${fixtures.DEMO_ADMIN_ID}.${tag}`;
    assertEqual(
      demoSession.verifyDemoProfile(forged),
      null,
      "a cookie with a swapped profile id verified — that is role escalation",
    );
    assertEqual(demoSession.verifyDemoProfile(id), null, "a profile id with no tag verified");
    assertEqual(demoSession.verifyDemoProfile(`${id}.`), null, "an empty tag verified");
    assertEqual(
      demoSession.verifyDemoProfile("not-a-uuid.signature"),
      null,
      "a non-uuid profile id reached the profile lookup",
    );
    assertEqual(demoSession.verifyDemoProfile(null), null, "a missing cookie verified");
  });
});

test("the demo cookie is not signed with a secret shorter than 32 characters", () => {
  const short = "c".repeat(31);
  withEnv({ NODE_ENV: "development", PROPFLOW_DEMO_SECRET: short }, () => {
    const key = demoSession.demoSecret();
    assertEqual(key?.developmentFallback, true, "a 31-character secret was used as a real key");
  });
});

// ---------------------------------------------------------------------------

async function main() {
  process.stdout.write(`\n${C.bold}PropFlow demo verification${C.reset}\n\n`);
  process.stdout.write(`${C.dim}  no database, no network, no server${C.reset}\n\n`);

  let passed = 0;
  const failures = [];
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      process.stdout.write(`  ${C.green}PASS${C.reset}  ${name}\n`);
    } catch (error) {
      failures.push([name, error]);
      process.stdout.write(`  ${C.red}FAIL${C.reset}  ${name}\n`);
    }
  }

  process.stdout.write(
    `\n  ${passed}/${tests.length} passed` +
      (failures.length ? `, ${C.red}${failures.length} failed${C.reset}` : `${C.green}${C.reset}`) +
      "\n\n",
  );
  for (const [name, error] of failures) {
    process.stdout.write(
      `${C.red}${name}${C.reset}\n      ${String(error.message).split("\n").join("\n      ")}\n\n`,
    );
  }
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  process.stdout.write(`${C.red}harness error${C.reset}\n${error?.stack ?? error}\n`);
  process.exit(1);
});
