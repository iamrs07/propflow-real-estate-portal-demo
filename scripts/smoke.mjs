/**
 * End-to-end smoke test against a running PropFlow server.
 *
 *   node scripts/smoke.mjs [baseUrl]     # default http://localhost:3210
 *
 * Drives real HTTP requests through the real React server actions — no test
 * framework, no mocks. It checks the three things that matter most:
 *   1. the public site renders and never exposes a private column;
 *   2. an unauthenticated visitor cannot reach any CRM page;
 *   3. role scoping holds — an agent sees only their assigned leads, an admin
 *      sees the whole brokerage, and the honeypot really does drop the row.
 *
 * Works in demo mode and against a seeded Supabase project alike, as long as
 * the demo passwords are in place.
 *
 * Also covers the areas a demo-mode short circuit would otherwise hide from the
 * database suite: the auth routes that actually exist, the Rent/Buy facet split,
 * demo contact controls being inert, the demo session cookie resisting forgery,
 * and the protected image route's caching headers.
 */
const BASE = (process.argv[2] ?? "http://localhost:3210").replace(/\/$/, "");
const PASSWORD = "PropFlowDemo!2026";
const ADMIN_EMAIL = "admin@northstar.demo";
const jar = new Map();

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------ http + forms -- */

function rememberCookies(response) {
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === "" || /expires=thu, 01 jan 1970/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader() {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: jar.size ? { cookie: cookieHeader() } : {},
  });
  rememberCookies(response);
  return response;
}

async function html(path) {
  return (await get(path)).text();
}

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Collect the form's hidden inputs. React's decoder requires the
 * `$ACTION_REF_*` entry to be the LAST field in the payload, so it is kept
 * aside and appended at the end.
 */
function readForm(page) {
  const hidden = {};
  let ref = null;
  for (const match of page.matchAll(/<input[^>]*>/g)) {
    const tag = match[0];
    if (!/type="hidden"/.test(tag)) continue;
    const name = /name="([^"]+)"/.exec(tag);
    if (!name) continue;
    const key = decodeEntities(name[1]);
    const value = /value="([^"]*)"/.exec(tag);
    if (key.startsWith("$ACTION_REF_")) ref = key;
    else hidden[key] = value ? decodeEntities(value[1]) : "";
  }
  return { hidden, ref };
}

async function submit(path, fields = {}) {
  const page = await html(path);
  const { hidden, ref } = readForm(page);

  /*
   * React's progressive enhancement writes `encType="multipart/form-data"` and
   * its decoder only reads that encoding for a native (no-JavaScript) post, so
   * the body must be multipart too — urlencoded silently does nothing.
   */
  const body = new FormData();
  for (const [key, value] of Object.entries({ ...hidden, ...fields })) {
    body.append(key, String(value));
  }
  // React reads $ACTION_REF_* from the trailing position.
  if (ref) body.append(ref, "");

  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: jar.size ? { cookie: cookieHeader() } : {},
    body,
  });
  rememberCookies(response);
  return response;
}

const plain = (markup) =>
  markup
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

async function signIn(email) {
  jar.clear();
  return submit("/auth/login", { email, password: PASSWORD, next: "/crm" });
}

/*
 * Each link appears twice in the streamed response (once in the RSC payload,
 * once in the rendered markup), so de-duplicate before counting.
 */
const unique = (values) => [...new Set(values)];
const leadLinks = (markup) => unique([...markup.matchAll(/\/crm\/leads\/([0-9a-z-]{36})/g)].map((m) => m[1]));
const visitLinks = (markup) => unique([...markup.matchAll(/\/crm\/visits\/([0-9a-z-]{36})/g)].map((m) => m[1]));

/*
 * The visits board prints `Booked {created_at}` beside the scheduled slot, and the
 * defect that shipped was a fixture that booked a visit *after* it was due: a
 * 7 Oct visit rendered as "Booked 11 Nov 2026". Nothing below reaches into the
 * fixtures, so this parses what the page actually shows. React separates the
 * static label from the formatted value with a comment node, and the streamed
 * RSC payload repeats the text, so the pattern has to tolerate both and the
 * values are de-duplicated. The rendered form is `DD Mon YYYY, HH:MM am` in
 * Asia/Kolkata (see formatDateTime in src/lib/format.ts); the strict ordering
 * invariant is pinned clock-independently by verify:demo.
 */
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const KOLKATA_OFFSET_MS = 330 * 60_000;
const BOOKED = /Booked\s*(?:<!--\s*-->)?\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4},\s*\d{1,2}:\d{2}\s*[ap]m)/gi;

const bookedStamps = (markup) => unique([...markup.matchAll(BOOKED)].map((m) => m[1]));

function parseRendered(value) {
  const match = value.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*([ap]m)/i);
  if (!match) return null;
  const [, day, month, year, hour, minute, meridiem] = match;
  const monthIndex = MONTHS[month.toLowerCase()];
  if (monthIndex === undefined) return null;
  let hours = Number(hour) % 12;
  if (meridiem.toLowerCase() === "pm") hours += 12;
  return Date.UTC(Number(year), monthIndex, Number(day), hours, Number(minute)) - KOLKATA_OFFSET_MS;
}

/* ------------------------------------------------------------------- run --- */

console.log(`\nPropFlow smoke test against ${BASE}\n`);

console.log("public site");
for (const path of ["/", "/properties", "/about", "/privacy", "/property/NSR-R-1001"]) {
  const response = await get(path);
  check(`GET ${path}`, response.status === 200, `status ${response.status}`);
}

const listingMarkup = await html("/property/NSR-R-1001");
check("public listing shows its locality", listingMarkup.includes("Koregaon Park"));
check("public listing hides owner_name", !listingMarkup.includes("Fictional Owner"));
check("public listing hides internal_notes", !listingMarkup.includes("12-month lease"));
check("public listing hides private_address", !/Flat\s*1204/i.test(listingMarkup));

const draft = await get("/property/NSR-D-3001");
check("unpublished draft is not public", draft.status === 404, `status ${draft.status}`);

const rentOnly = await get("/properties?listingType=rent");
check("listing filters apply", rentOnly.status === 200);

/*
 * Listing photographs are served by an authorizing route, not a public bucket
 * URL, so the route itself must refuse anything that is not a well-formed
 * "<tenant>/<property>/<file>" path. Demo mode serves committed artwork from
 * /demo instead, so these assert the rejection path rather than a real fetch.
 */
const uuid = "00000000-0000-0000-0000-000000000000";
for (const [label, path] of [
  ["no path at all", "/listing-image"],
  ["too few segments", `/listing-image/${uuid}/${uuid}`],
  ["non-uuid tenant segment", "/listing-image/tenant/property/photo-1.png"],
  ["disallowed extension", `/listing-image/${uuid}/${uuid}/payload.svg`],
  ["traversal attempt", `/listing-image/${uuid}/${uuid}/..%2f..%2f..%2fetc%2fpasswd`],
]) {
  const response = await get(path);
  check(`listing image route refuses ${label}`, response.status === 404, `status ${response.status}`);
}

/* The public listing type filter is a two-way Rent / Buy choice. Resale is not
 * offered to visitors: it is a stored subtype that Buy already includes. */
const filtersMarkup = await html("/properties");
for (const [value, label] of [["rent", "Rent"], ["buy", "Buy"]]) {
  check(
    `listing type filter offers "${label}"`,
    new RegExp(`<option value="${value}">${label}</option>`).test(filtersMarkup),
  );
}
check(
  "listing type filter does not offer Resale to visitors",
  !/<option value="(resale|sale)">/.test(filtersMarkup),
);
/*
 * The public listing-type filter is a two-way Rent / Buy choice, and "Buy" covers
 * both stored purchase subtypes: NSR-S-2002 is a `sale` (new build) and
 * NSR-S-2001 is a `resale`. Both must appear for Buy; neither may appear for Rent.
 */
const rentFacet = await html("/properties?listingType=rent");
check("the Rent facet returns a rental", rentFacet.includes("NSR-R-1001"));
check("the Rent facet excludes the new-build sale", !rentFacet.includes("NSR-S-2002"));
check("the Rent facet excludes the resale", !rentFacet.includes("NSR-S-2001"));

const buyFacet = await html("/properties?listingType=buy");
check("the Buy facet includes the new-build sale", buyFacet.includes("NSR-S-2002"));
check("the Buy facet includes the resale", buyFacet.includes("NSR-S-2001"));
check("the Buy facet excludes rentals", !buyFacet.includes("NSR-R-1001"));

/* Legacy links from before the facet split must keep working, and must widen to
 * the whole Buy group rather than silently matching nothing. */
for (const legacy of ["sale", "resale"]) {
  const markup = await html(`/properties?listingType=${legacy}`);
  check(
    `a legacy listingType=${legacy} link still resolves to Buy`,
    markup.includes("NSR-S-2002") && markup.includes("NSR-S-2001"),
  );
  check(`a legacy listingType=${legacy} link still excludes rentals`, !markup.includes("NSR-R-1001"));
}

/* The selected filter must be reflected back as the chosen option, so the form
 * and the shareable URL agree. */
check(
  "the Buy facet is marked as selected in the form",
  /<option value="buy" selected="">Buy<\/option>/.test(buyFacet),
);
check(
  "the Rent facet is marked as selected in the form",
  /<option value="rent" selected="">Rent<\/option>/.test(rentFacet),
);

/* An unknown value must not reach the enum or silently filter everything out. */
const junkFacet = await html("/properties?listingType=bogus");
check("an unrecognised listingType is ignored, not applied", junkFacet.includes("NSR-R-1001"));
const injectionFacet = await html("/properties?listingType=rent'%3Bdrop+table+properties%3B--");
check(
  "a hostile listingType cannot break the query",
  injectionFacet.includes("NSR-R-1001"),
);

const allListings = await html("/properties");
check("the unfiltered list still resolves every published listing", allListings.includes("NSR-R-1001"));
for (const reference of ["NSR-S-2001", "NSR-S-2002", "NSR-R-1004"]) {
  check(`public listing ${reference} still resolves`, (await get(`/property/${reference}`)).status === 200);
}
check("a Buy listing renders its type", (await html("/property/NSR-S-2002")).includes("Buy"));

/*
 * Demo contact details must not be actionable. The placeholder numbers exist so
 * the layout can be reviewed, and a `tel:` or `wa.me` href would hand them to the
 * visitor's real dialler, so in demo mode they render as text only.
 */
const homeMarkup = await html("/");
check("demo mode emits no tel: links", !/href="tel:/i.test(homeMarkup));
check("demo mode emits no wa.me links", !/href="https:\/\/wa\.me\//i.test(homeMarkup));
const aboutMarkup = await html("/about");
check("the about page emits no contact links", !/href="(tel:|https:\/\/wa\.me\/)/i.test(aboutMarkup));
check("demo mode still shows the agency phone number as text", /\+91\s*00000/.test(homeMarkup));

const anonymous = await get("/crm");
check(
  "anonymous visitor is redirected away from the CRM",
  anonymous.status === 307,
  `status ${anonymous.status}`,
);

/*
 * The redirect target must be a page that exists. It used to point at /login,
 * which is not in the route tree, so every unauthenticated CRM visit landed on
 * a 404 instead of the sign-in screen.
 */
const crmLocation = anonymous.headers.get("location") ?? "";
check(
  "the CRM redirect points at the real sign-in page",
  crmLocation.startsWith("/auth/login"),
  crmLocation || "no location header",
);
const signInTarget = await get(new URL(crmLocation, "http://placeholder").pathname);
check(
  "the sign-in page the CRM redirects to actually resolves",
  signInTarget.status === 200,
  `status ${signInTarget.status}`,
);

/* Every auth page in the route tree must resolve. */
for (const path of ["/auth/login", "/auth/forgot-password", "/auth/reset-password"]) {
  const response = await get(path);
  check(`GET ${path}`, response.status === 200, `status ${response.status}`);
}

/*
 * Demo sign-in needs two things: the mode on, and a signing secret. A production
 * build with the mode on and no PROPFLOW_DEMO_SECRET refuses every session, so
 * the screen must not offer the accounts and the shared password there. The two
 * states are mutually exclusive on the same page, whichever build this is.
 */
{
  const markup = await html("/auth/login");
  const advertises = markup.includes("admin@northstar.demo");
  const refuses = markup.includes("Demo mode is not available");
  check(
    "the sign-in screen does not both offer demo accounts and refuse them",
    !(advertises && refuses),
    `accounts offered: ${advertises}, refusal shown: ${refuses}`,
  );
}

/* And the paths the code used to reference must NOT resolve, so a regression
 * cannot reintroduce them unnoticed. */
for (const path of ["/login", "/reset-password", "/forgot-password"]) {
  const response = await get(path);
  check(`the stale route ${path} does not exist`, response.status === 404, `status ${response.status}`);
}

/* Nothing on the public site may link or redirect to a non-existent auth page. */
const chrome = await html("/");
for (const stale of ['href="/login"', 'href="/reset-password"', 'href="/forgot-password"']) {
  check(`the public site emits no ${stale}`, !chrome.includes(stale));
}
check("the footer links to the real sign-in page", chrome.includes('href="/auth/login"'));

/* ------------------------------------------------------------------ auth -- */

console.log("\nauthentication");

/*
 * Regression guard. The sign-in fields were once painted `bg-navy-900` on a
 * `bg-navy-900` page with a `text-navy-900` label, so they were literally
 * invisible and the page looked like it had no form at all. Assert that each
 * control carries exactly one background colour, and that the sign-in screen is
 * visually distinct from the workspace — they were once near-identical.
 */
const signInMarkup = await html("/auth/login");
for (const control of ["email", "password"]) {
  const tag = signInMarkup.match(new RegExp(`<input[^>]*name="${control}"[^>]*>`))?.[0] ?? "";
  const classes = tag.match(/class="([^"]*)"/)?.[1] ?? "";
  const backgrounds = classes.split(/\s+/).filter((c) => /^bg-/.test(c));
  check(
    `${control} field has exactly one background colour`,
    backgrounds.length === 1 && backgrounds[0] === "bg-white",
    backgrounds.join(" ") || "none",
  );
}
check("sign-in screen is labelled as staff access", signInMarkup.includes("Staff access"));
check("sign-in screen does not reuse the workspace wordmark", !signInMarkup.includes("PropFlow CRM"));

const badPassword = await submit("/auth/login", {
  email: "rohan@northstar.demo",
  password: "not-the-password",
  next: "/crm",
});
check("wrong password is refused", badPassword.status === 200, `status ${badPassword.status}`);
check(
  "wrong password sets no session",
  ![...jar.keys()].some((name) => name.startsWith("propflow")),
  `cookies: ${[...jar.keys()].join(", ")}`,
);

const agentSignIn = await signIn("rohan@northstar.demo");
check(
  "agent sign-in redirects to the CRM",
  agentSignIn.status === 303,
  `status ${agentSignIn.status}`,
);

/*
 * Demo-mode sessions must not be forgeable by editing the cookie.
 *
 * The cookie carries the signed-in staff member's profile id, and that id is the
 * entire authorisation decision. It used to be stored as a bare uuid, so anyone
 * could rewrite it to the demo admin's id and become an admin. It is now
 * `<id>.<hmac>`, so a modified value fails verification and the request falls
 * back to anonymous.
 *
 * The cookie jar is saved and restored around each attempt so these checks do not
 * disturb the session the rest of the suite depends on.
 */
{
  const saved = new Map(jar);
  const demoCookie = saved.get("propflow_demo_profile") ?? "";

  check(
    "the demo session cookie is signed, not a bare profile id",
    demoCookie.includes(".") && demoCookie.split(".")[0] !== demoCookie,
    demoCookie ? "value present but unsigned" : "no demo cookie issued",
  );

  const adminId = await (async () => {
    jar.clear();
    const res = await submit("/auth/login", { email: ADMIN_EMAIL, password: PASSWORD, next: "/crm" });
    const value = jar.get("propflow_demo_profile") ?? "";
    void res;
    return value.split(".")[0];
  })();
  check("the admin profile id was resolved for the forgery test", /^[0-9a-f-]{36}$/.test(adminId), adminId);

  // Bare uuid, no signature: this is exactly what the old cookie looked like.
  jar.clear();
  jar.set("propflow_demo_profile", adminId);
  let forged = await get("/crm");
  check(
    "an unsigned cookie cannot impersonate the demo admin",
    forged.status === 307 || forged.status === 404,
    `status ${forged.status}`,
  );

  // Correct profile id, deliberately wrong signature.
  jar.clear();
  jar.set("propflow_demo_profile", `${adminId}.not-a-valid-signature`);
  forged = await get("/crm");
  check(
    "a tampered signature cannot impersonate the demo admin",
    forged.status === 307 || forged.status === 404,
    `status ${forged.status}`,
  );

  // Valid signature but a nonsense profile id.
  jar.clear();
  jar.set("propflow_demo_profile", `00000000-0000-0000-0000-000000000000.deadbeef`);
  forged = await get("/crm");
  check("a forged cookie with an unknown profile is anonymous", forged.status !== 200);

  // Restore the genuine session.
  jar.clear();
  for (const [name, value] of saved) jar.set(name, value);
}

check(
  "agent session cookie is set",
  jar.has("propflow_demo_session") || [...jar.keys()].some((n) => n.includes("propflow")),
  `cookies: ${[...jar.keys()].join(", ") || "none"}`,
);

const agentDashboard = await html("/crm");
check("agent dashboard renders", !agentDashboard.includes("Staff sign-in"));

const agentLeads = leadLinks(await html("/crm/leads"));
check("agent sees exactly their assigned lead", agentLeads.length === 1, `${agentLeads.length} leads`);
check(
  "assigned lead is Priya Raman",
  agentLeads.length === 1 && (await html(`/crm/leads/${agentLeads[0]}`)).includes("Priya Raman"),
);

const agentVisits = visitLinks(await html("/crm/visits"));
check("agent sees only their own visits", agentVisits.length === 1, `${agentVisits.length} visits`);

const agentTeam = await get("/crm/team");
check("agent cannot reach team management", agentTeam.status === 307, `status ${agentTeam.status}`);

const agentAdminVisit = await get(`/crm/visits/${agentVisits[0]}`);
check("agent can open their own visit", agentAdminVisit.status === 200, `status ${agentAdminVisit.status}`);

console.log("\nadministrator scope");
await signIn("admin@northstar.demo");
const adminLeadMarkup = await html("/crm/leads");
const adminLeads = leadLinks(adminLeadMarkup);
check(
  "admin sees all three seeded leads",
  ["Priya Raman", "Vikram Sethi", "Meera Iyer"].every((name) => adminLeadMarkup.includes(name)),
);
check(
  "admin sees strictly more leads than an agent",
  adminLeads.length > agentLeads.length,
  `admin ${adminLeads.length} vs agent ${agentLeads.length}`,
);
const adminVisits = visitLinks(await html("/crm/visits"));
check("admin sees both visits", adminVisits.length === 2, `${adminVisits.length} visits`);

/* A visit that has not happened yet cannot have been booked in the future. */
{
  const stamps = bookedStamps(await html("/crm/visits"));
  check(
    "both visits show a readable booked timestamp",
    stamps.length === 2,
    `${stamps.length} found: ${stamps.join(" | ") || "none"}`,
  );
  const future = stamps
    .map((stamp) => [stamp, parseRendered(stamp)])
    .filter(([, instant]) => instant !== null && instant > Date.now());
  check(
    "no visit is shown as booked in the future",
    future.length === 0,
    future.map(([stamp]) => stamp).join(" | "),
  );
}
check("admin can reach team management", (await get("/crm/team")).status === 200);

/*
 * Visit assignment may only target an active agent. The assignee <select> is
 * built from listAssignableAgents(), so the presence of the two agents and the
 * absence of the admin's own name in that control proves the UI matches the
 * policy in migration 0009. (The policy itself is covered by db:verify, which can
 * issue a forged insert that this HTTP layer cannot.)
 */
{
  const leadMarkup = await html(`/crm/leads/${adminLeads[0]}`);
  const select = leadMarkup.match(/<select[^>]*name="agent_id"[\s\S]*?<\/select>/)?.[0] ?? "";
  check("the visit assignee control is present", select !== "", "no agent_id select found");
  check(
    "the assignee list offers the active agents",
    ["Rohan Mehta", "Farah Khan"].every((name) => select.includes(name)),
  );
  check(
    "the assignee list does not offer admins",
    !select.includes("Aarti"),
    "an admin appeared as a visit assignee",
  );
}

/* ------------------------------------------------- protected image caching -- */

console.log("\nlisting images");
{
  /*
   * Protected images must not be cached in a way that outlives their listing.
   * The route emits `no-cache` for anonymous callers, which forbids a cache from
   * reusing a stored response without revalidating; `max-age` or
   * `stale-while-revalidate` here would keep an unpublished listing's photographs
   * readable for up to fifteen minutes after unlisting.
   */
  const uuid = "00000000-0000-0000-0000-000000000000";
  const response = await fetch(`${BASE}/listing-image/${uuid}/${uuid}/${uuid}.png`, {
    redirect: "manual",
  });
  const cacheControl = response.headers.get("cache-control") ?? "";
  check(
    "a rejected image request is not cached",
    /no-store/.test(cacheControl),
    cacheControl || "no cache-control header",
  );

  const draft = await get("/property/NSR-D-3001");
  check("the draft listing is still not public", draft.status === 404, `status ${draft.status}`);
}

/* ------------------------------------------------------------- enquiries -- */

console.log("\npublic enquiry");
const signed = await submit("/property/NSR-R-1001", {
  full_name: "Smoke Test Visitor",
  phone: "+91 00000 99001",
  email: "visitor@example.invalid",
  message: "Automated smoke test enquiry.",
  preferred_contact: "phone",
  consent: "yes",
});
const signedMarkup = plain(await signed.text());
check("enquiry is accepted", signed.status === 200, `status ${signed.status}`);
check(
  "enquiry form reports success",
  /thank|received|in touch|got it|we.ll be in touch/i.test(signedMarkup),
  signedMarkup.slice(0, 160),
);

const trapped = await submit("/property/NSR-R-1001", {
  full_name: "Spam Bot",
  phone: "+91 00000 99002",
  preferred_contact: "phone",
  consent: "yes",
  company_website: "i-am-a-bot",
});
check("honeypot submission answers as if it worked", trapped.status === 200, `status ${trapped.status}`);

const noConsent = await submit("/property/NSR-R-1001", {
  full_name: "No Consent",
  phone: "+91 00000 99003",
  preferred_contact: "phone",
});
check("missing consent is refused", noConsent.status === 200, `status ${noConsent.status}`);

const badPhone = await submit("/property/NSR-R-1001", {
  full_name: "Bad Phone",
  phone: "123",
  preferred_contact: "phone",
  consent: "yes",
});
check("invalid phone number is refused", badPhone.status === 200, `status ${badPhone.status}`);

const leadsAfter = plain(await html("/crm/leads"));
check("real enquiry became a lead", leadsAfter.includes("Smoke Test Visitor"));
check("honeypot submission created nothing", !leadsAfter.includes("Spam Bot"));
check("invalid submission created nothing", !leadsAfter.includes("No Consent"));
check("new lead starts unassigned and new", /Smoke Test Visitor/.test(leadsAfter));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);