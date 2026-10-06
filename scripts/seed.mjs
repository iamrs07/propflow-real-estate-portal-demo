/**
 * PropFlow demo seed for a real Supabase project.
 *
 *   npm run db:seed
 *
 * Creates the fictional brokerage "Northstar Realty Demo", three fictional
 * staff accounts (one admin, two agents), six published rental/resale listings
 * plus one unpublished draft, three leads in different statuses, three internal
 * notes, the status history, and two upcoming site visits. Photographs are
 * painted locally by scripts/lib/png.mjs and uploaded to the Storage bucket —
 * nothing is downloaded, scraped or licensed.
 *
 * Every contact value is fictional: `.invalid`/`.example` email addresses (TLDs
 * reserved by RFC 2606 that cannot be registered) and `+91 00000 …` phone
 * numbers. Indian subscriber numbers begin 6–9, so a `0` after the country code
 * is not an assignable range and the number cannot be dialled. No real person
 * appears anywhere in this seed.
 *
 * Caveat: the staff accounts below use the `@northstar.demo` TLD. `.demo` is a
 * real, registrable sponsored TLD — NOT one of the RFC 2606 reserved names — so
 * these addresses are synthetic rather than provably undeliverable. They are
 * kept as-is so the documented demo login keeps working, and the app refuses to
 * send password-reset mail to them.
 *
 * The script is idempotent: run it twice and it updates rather than duplicating.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { PALETTES, paintPlaceholder } from "./lib/png.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/* ------------------------------------------------------------------ env ---- */

for (const file of [".env.local", ".env"]) {
  try {
    const text = await readFile(join(root, file), "utf8");
    for (const line of text.split("\n")) {
      if (line.trim().startsWith("#")) continue;
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
    break;
  } catch {
    /* fall through to the next candidate */
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "1. Create a free project at https://supabase.com\n" +
      "2. Copy .env.example to .env.local and fill in the two values plus NEXT_PUBLIC_SUPABASE_ANON_KEY\n" +
      "3. Apply supabase/migrations in the SQL editor\n" +
      "4. Re-run: npm run db:seed\n",
  );
  process.exit(1);
}

/* The demo fixtures are the single source of truth for both demo mode and the
 * seed. Node strips the TypeScript types at runtime, so no data is duplicated.
 * The specifier is a file URL because a bare Windows path like `C:\…` is not a
 * valid ESM specifier. */
const fixtures = await import(
  pathToFileURL(join(root, "src", "lib", "data", "demo", "fixtures.ts")).href
);

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "property-images";
const TENANT_SLUG = process.env.PROPFLOW_TENANT_SLUG ?? "northstar-demo";

const step = (message) => console.log(`  ${message}`);

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) {
    console.error(`\nSeed failed at "${what}": ${error.message} (${error.code ?? "no code"})\n`);
    process.exit(1);
  }
  return data;
}

console.log("\nPropFlow demo seed\n");

/* ------------------------------------------------------------- brokerage ---- */

const found = await must(
  db.from("tenants").select("*").eq("slug", TENANT_SLUG).maybeSingle(),
  "look up tenant",
);

let tenantId;
if (found) {
  tenantId = found.id;
  step(`Brokerage ${TENANT_SLUG} already exists — reusing it.`);
} else {
  const agency = fixtures.DEMO_AGENCY;
  const created = await must(
    db
      .from("tenants")
      .insert({
        slug: TENANT_SLUG,
        name: agency.name,
        tagline: agency.tagline,
        about: agency.about,
        phone: agency.phone,
        whatsapp: agency.whatsapp,
        email: agency.email,
        office_address: agency.office_address,
        service_areas: agency.service_areas,
        public_site_enabled: true,
        privacy_contact_email: agency.privacy_contact_email,
        privacy_notes: agency.privacy_notes,
      })
      .select("id")
      .single(),
    "create tenant",
  );
  tenantId = created.id;
  step(`Created brokerage ${agency.name} (${TENANT_SLUG}).`);
}

/* ------------------------------------------------------------- staff ------- */

const PASSWORD = fixtures.DEMO_PASSWORD;
const accountsByProfile = new Map(
  fixtures.DEMO_ACCOUNTS.map((account) => [account.profileId, account]),
);
const realProfileId = new Map();

for (const profile of fixtures.DEMO_PROFILES) {
  const account = accountsByProfile.get(profile.id);
  if (!account) continue;

  const { data: page } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingUser = (page?.users ?? []).find((user) => user.email === account.email);

  let userId;
  if (existingUser) {
    userId = existingUser.id;
    await must(
      db.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true }),
      `reset password for ${account.email}`,
    );
    step(`Account ${account.email} already exists — password reset.`);
  } else {
    const created = await must(
      db.auth.admin.createUser({
        email: account.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: profile.full_name },
      }),
      `create auth user ${account.email}`,
    );
    userId = created.user.id;
    step(`Created ${profile.full_name} (${profile.role}) — ${account.email}`);
  }

  const payload = {
    tenant_id: tenantId,
    full_name: profile.full_name,
    role: profile.role,
    is_active: profile.is_active,
    phone: profile.phone,
    title: profile.title,
  };

  const existingProfile = await must(
    db.from("profiles").select("id").eq("id", userId).maybeSingle(),
    `look up profile ${profile.full_name}`,
  );

  if (existingProfile) {
    await must(db.from("profiles").update(payload).eq("id", userId), `update ${profile.full_name}`);
  } else {
    await must(db.from("profiles").insert({ id: userId, ...payload }), `insert ${profile.full_name}`);
  }

  realProfileId.set(profile.id, userId);
}

/* ------------------------------------------------------------ listings ----- */

const properties = fixtures.buildDemoProperties();
const realPropertyId = new Map();
const newProperties = [];

for (const listing of properties) {
  const payload = {
    tenant_id: tenantId,
    reference_code: listing.reference_code,
    title: listing.title,
    headline: listing.headline,
    description: listing.description,
    listing_type: listing.listing_type,
    property_type: listing.property_type,
    status: listing.status,
    is_available: listing.is_available,
    price: listing.price,
    currency: listing.currency,
    price_period: listing.price_period,
    negotiable: listing.negotiable,
    city: listing.city,
    locality: listing.locality,
    private_address: listing.private_address,
    internal_notes: listing.internal_notes,
    owner_name: listing.owner_name,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    area_value: listing.area_value,
    area_unit: listing.area_unit,
    furnishing: listing.furnishing,
    amenities: listing.amenities,
    map_link: listing.map_link,
    year_built: listing.year_built,
    published_at: listing.status === "published" ? new Date().toISOString() : null,
  };

  const existing = await must(
    db
      .from("properties")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("reference_code", listing.reference_code)
      .maybeSingle(),
    `look up ${listing.reference_code}`,
  );

  let propertyId;
  if (existing) {
    propertyId = existing.id;
    await must(db.from("properties").update(payload).eq("id", propertyId), `update ${listing.reference_code}`);
    step(`Listing ${listing.reference_code} already exists — updated.`);
  } else {
    const created = await must(
      db.from("properties").insert(payload).select("id").single(),
      `insert ${listing.reference_code}`,
    );
    propertyId = created.id;
    newProperties.push(listing);
    step(`Created listing ${listing.reference_code} — ${listing.title} (${listing.status})`);
  }

  realPropertyId.set(listing.id, propertyId);
}

/* --------------------------------------------------------- photographs ----- */

const bucket = await must(db.storage.getBucket(BUCKET), "read storage bucket");
if (!bucket) {
  console.error(
    `\nThe "${BUCKET}" bucket does not exist. Apply supabase/migrations/0002_public_api_and_storage.sql first.\n`,
  );
  process.exit(1);
}

for (const listing of newProperties) {
  if (listing.images.length === 0) {
    step(`Listing ${listing.reference_code} has no photographs — skipping upload.`);
    continue;
  }

  const propertyId = realPropertyId.get(listing.id);
  const paletteKey =
    listing.property_type === "row_house"
      ? "rowhouse"
      : (listing.property_type in PALETTES ? listing.property_type : "apartment");

  for (const [index, image] of listing.images.entries()) {
    const buffer = paintPlaceholder({
      palette: PALETTES[paletteKey],
      seed: 11 + index * 7 + listing.images.length,
    });

    const path = `${tenantId}/${propertyId}/photo-${index + 1}.png`;
    await must(
      db.storage.from(BUCKET).upload(path, buffer, { contentType: "image/png", upsert: true }),
      `upload ${path}`,
    );

    await must(
      db.from("property_images").insert({
        tenant_id: tenantId,
        property_id: propertyId,
        storage_path: path,
        alt_text: image.alt,
        sort_order: index + 1,
        byte_size: buffer.length,
      }),
      `attach ${path}`,
    );
  }

  step(`Uploaded ${listing.images.length} photographs for ${listing.reference_code}.`);
}

/* --------------------------------------------------- leads and history ----- */

const demoLeads = fixtures.buildDemoLeads(properties);
const demoNotes = fixtures.buildDemoNotes();
const realLeadId = new Map();
const newLeads = [];

for (const lead of demoLeads) {
  const existing = await must(
    db
      .from("leads")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("full_name", lead.full_name)
      .maybeSingle(),
    `look up lead ${lead.full_name}`,
  );

  if (existing) {
    realLeadId.set(lead.id, existing.id);
    step(`Lead ${lead.full_name} already exists — reusing.`);
    continue;
  }

  // Insert as 'new' and then move it through the real status path, so the
  // database trigger writes the same audit trail it would in daily use.
  const created = await must(
    db
      .from("leads")
      .insert({
        tenant_id: tenantId,
        property_id: lead.property_id ? realPropertyId.get(lead.property_id) : null,
        assigned_to: lead.assigned_to ? realProfileId.get(lead.assigned_to) : null,
        full_name: lead.full_name,
        phone: lead.phone,
        email: lead.email,
        message: lead.message,
        source: lead.source,
        status: "new",
        preferred_contact: lead.preferred_contact,
        preferred_visit_at: lead.preferred_visit_at,
        consent_at: lead.consent_at,
      })
      .select("id")
      .single(),
    `insert lead ${lead.full_name}`,
  );

  realLeadId.set(lead.id, created.id);
  newLeads.push(lead);

  const ordered = [
    "new",
    "contacted",
    "qualified",
    "visit_scheduled",
    "negotiation",
    "closed_won",
    "closed_lost",
  ];
  const target = ordered.indexOf(lead.status);
  for (let index = 1; index <= target; index += 1) {
    await must(
      db.from("leads").update({ status: ordered[index] }).eq("id", created.id),
      `move ${lead.full_name} to ${ordered[index]}`,
    );
  }

  step(`Created lead ${lead.full_name} — ${lead.source}, status ${lead.status}`);
}

/* --------------------------------------------------------------- visits ---- */

const demoVisits = fixtures.buildDemoVisits();

for (const visit of demoVisits) {
  const leadId = realLeadId.get(visit.lead_id);
  if (!leadId) continue;

  const existing = await must(
    db
      .from("visits")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("lead_id", leadId)
      .eq("scheduled_start", visit.scheduled_start)
      .maybeSingle(),
    `look up visit for ${visit.id}`,
  );

  if (existing) {
    step(`A visit for this lead already exists — reusing.`);
    continue;
  }

  await must(
    db.from("visits").insert({
      tenant_id: tenantId,
      lead_id: leadId,
      property_id: visit.property_id ? realPropertyId.get(visit.property_id) : null,
      agent_id: realProfileId.get(visit.agent_id),
      scheduled_start: visit.scheduled_start,
      scheduled_end: visit.scheduled_end,
      status: "scheduled",
      internal_notes: visit.internal_notes,
      created_by: realProfileId.get(visit.created_by),
    }),
    "insert visit",
  );
  step(`Scheduled a site visit for lead ${visit.lead_id}.`);
}

const { count: noteCount } = await must(
  db.from("lead_notes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  "count notes",
);

if (!noteCount) {
  const rows = demoNotes
    .filter((note) => realLeadId.has(note.lead_id))
    .map((note) => ({
      tenant_id: tenantId,
      lead_id: realLeadId.get(note.lead_id),
      author_id: realProfileId.get(note.author_id),
      body: note.body,
      created_at: note.created_at,
    }));
  if (rows.length) await must(db.from("lead_notes").insert(rows), "insert notes");
  step(`Added ${rows.length} internal notes.`);
}

/* ---------------------------------------------------------------- report --- */

const { count: publishedCount } = await must(
  db
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .eq("is_available", true),
  "count published listings",
);

console.log(`
Seed complete.

  ${publishedCount ?? 0} published listings are visible on the public site.
  ${newLeads.length} new leads, ${noteCount ? "notes" : "0 notes"}, ${demoVisits.length} visits.

  Staff sign-in — every account uses the password below:

    Aarti Sharma   admin@northstar.demo    admin
    Rohan Mehta    rohan@northstar.demo    agent
    Farah Khan     farah@northstar.demo    agent

    Password: ${PASSWORD}

  These are synthetic demo accounts, kept unchanged so the documented demo login
  keeps working. `.demo` is a registrable TLD, not an RFC 2606 reserved one, so
  do not rely on these addresses being undeliverable; the application refuses to
  send password-reset mail to them. Phone numbers use +91 00000 (not an assignable
  Indian range). Change every password before this installation is used for
  anything real, and delete the demo brokerage if you would rather start clean.
`);