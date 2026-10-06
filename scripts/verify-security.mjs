/**
 * PropFlow — offline security verification.
 *
 * Executes the real migration files against a real PostgreSQL engine (PGlite,
 * Postgres compiled to WebAssembly) with a stand-in for the Supabase-managed
 * `auth`/`storage` schemas and roles, then asserts the tenant-isolation and RLS
 * behaviour the acceptance checklist depends on.
 *
 *   npm run db:verify
 *
 * No network, no Docker, no Supabase project required.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const migrationsDir = join(root, "supabase", "migrations");
const testsDir = join(root, "supabase", "tests");

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  bold: "\x1b[1m",
};

class AssertionError extends Error {}

function assert(condition, message) {
  if (!condition) throw new AssertionError(message);
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new AssertionError(`${message}\n      expected: ${e}\n      actual:   ${a}`);
}

const db = new PGlite();

async function one(sql, params) {
  const res = await db.query(sql, params);
  return res.rows[0];
}

async function many(sql, params) {
  const res = await db.query(sql, params);
  return res.rows;
}

async function asUser(role, uid, fn) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
    uid ?? "",
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

const DENIAL = /permission denied|not granted|insufficient privilege|row-level security|violates/i;

async function expectDenied(label, fn) {
  try {
    await fn();
  } catch (error) {
    const text = String(error?.message ?? error);
    assert(DENIAL.test(text), `${label}: expected a denial, got: ${text}`);
    return;
  }
  throw new AssertionError(`${label}: expected a denial, but the call succeeded`);
}

async function expectRaise(label, fn, pattern) {
  try {
    await fn();
  } catch (error) {
    const text = String(error?.message ?? error);
    assert(
      pattern.test(text),
      `${label}: expected error matching ${pattern}, got: ${text}`,
    );
    return;
  }
  throw new AssertionError(`${label}: expected an error, but the call succeeded`);
}

async function loadMigrations() {
  const stub = await readFile(join(testsDir, "0000_supabase_stub.sql"), "utf8");
  await db.exec(stub);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    process.stdout.write(`${C.dim}  applying ${file}${C.reset}\n`);
    await db.exec(await readFile(join(migrationsDir, file), "utf8"));
  }
  return files;
}

const ids = {};

async function seed() {
  const t = async (sql, params) => one(sql, params);

  ids.tenantA = (
    await t(
      `insert into public.tenants (slug, name, tagline, phone, whatsapp, email,
         service_areas, public_site_enabled)
       values ('northstar-demo', 'Northstar Realty Demo', 'Fictional demo brokerage',
               '+91-00000-00000', '910000000000', 'demo@northstar.invalid',
               array['Koregaon Park','Indiranagar'], true)
       returning id`,
    )
  ).id;

  ids.tenantB = (
    await t(
      `insert into public.tenants (slug, name, public_site_enabled)
       values ('second-demo', 'Second Fictional Brokerage', false) returning id`,
    )
  ).id;

  const mkUser = async (email) =>
    (await t(`insert into auth.users (email) values ($1) returning id`, [email])).id;

  ids.adminA = await mkUser("admin@northstar.invalid");
  ids.agentA1 = await mkUser("agent1@northstar.invalid");
  ids.agentA2 = await mkUser("agent2@northstar.invalid");
  ids.inactiveA = await mkUser("former@northstar.invalid");
  ids.adminB = await mkUser("admin@second.invalid");

  const mkProfile = (id, tenant, name, role, active = true) =>
    t(
      `insert into public.profiles (id, tenant_id, full_name, role, is_active)
       values ($1, $2, $3, $4, $5)`,
      [id, tenant, name, role, active],
    );

  await mkProfile(ids.adminA, ids.tenantA, "Aarti Sharma", "admin");
  await mkProfile(ids.agentA1, ids.tenantA, "Rohan Mehta", "agent");
  await mkProfile(ids.agentA2, ids.tenantA, "Farah Khan", "agent");
  await mkProfile(ids.inactiveA, ids.tenantA, "Departed Colleague", "agent", false);
  await mkProfile(ids.adminB, ids.tenantB, "Other Broker Admin", "admin");

  const mkProperty = (tenant, code, over = {}) => {
    const row = {
      tenant_id: tenant,
      reference_code: code,
      title: `Listing ${code}`,
      headline: "A fictional headline",
      description: "A fictional description.",
      listing_type: "rent",
      property_type: "apartment",
      status: "published",
      is_available: true,
      price: 45000,
      currency: "INR",
      price_period: "month",
      city: "Pune",
      locality: "Koregaon Park",
      private_address: "Flat 404, Fictional Residency, Koregaon Park, Pune 411001",
      internal_notes: "Owner is relocating, flexible on timing.",
      owner_name: "Fictional Owner",
      bedrooms: 2,
      bathrooms: 2,
      area_value: 950,
      area_unit: "sqft",
      furnishing: "semi_furnished",
      amenities: ["Lift", "Power backup"],
      published_at: new Date().toISOString(),
      ...over,
    };
    const keys = Object.keys(row);
    return t(
      `insert into public.properties (${keys.join(", ")})
       values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
      keys.map((k) => row[k]),
    );
  };

  ids.p1 = (await mkProperty(ids.tenantA, "NSR-R-1001")).id;
  ids.p2 = (
    await mkProperty(ids.tenantA, "NSR-S-2001", {
      listing_type: "resale",
      price_period: "one_time",
      locality: "Indiranagar",
    })
  ).id;
  ids.p3 = (
    await mkProperty(ids.tenantA, "NSR-D-3001", {
      status: "draft",
      published_at: null,
      internal_notes: "Draft listing",
    })
  ).id;
  ids.p4 = (await mkProperty(ids.tenantA, "NSR-R-1002", { is_available: false })).id;
  ids.p5 = (
    await mkProperty(ids.tenantA, "NSR-A-4001", {
      status: "archived",
      internal_notes: "Sold",
    })
  ).id;
  ids.pB = (
    await mkProperty(ids.tenantB, "OTH-R-0001", { internal_notes: "Other brokerage" })
  ).id;

  await t(
    `insert into public.property_images (tenant_id, property_id, storage_path, alt_text, sort_order)
     values ($1, $2, $3, $4, 0)`,
    [ids.tenantA, ids.p1, `${ids.tenantA}/${ids.p1}/demo-1.jpg`, "Fictional living room"],
  );

  const mkLead = async (tenant, over) =>
    (
      await t(
        `insert into public.leads (tenant_id, property_id, assigned_to, full_name, phone,
           source, status, message)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [
          tenant,
          over.propertyId ?? null,
          over.assignedTo ?? null,
          over.name ?? "Fictional Visitor",
          over.phone ?? "+91-00000-11111",
          over.source ?? "property_form",
          over.status ?? "new",
          over.message ?? "Fictional message",
        ],
      )
    ).id;

  ids.l1 = await mkLead(ids.tenantA, {
    propertyId: ids.p1,
    assignedTo: ids.agentA1,
    name: "Priya Raman",
  });
  ids.l2 = await mkLead(ids.tenantA, {
    propertyId: ids.p2,
    assignedTo: ids.agentA2,
    name: "Vikram Sethi",
  });
  ids.l3 = await mkLead(ids.tenantA, { name: "Unassigned Visitor", source: "contact_form" });
  ids.lB = await mkLead(ids.tenantB, { name: "Other Brokerage Visitor" });

  ids.v1 = (
    await t(
      `insert into public.visits (tenant_id, lead_id, property_id, agent_id,
         scheduled_start, scheduled_end, status, created_by)
       values ($1,$2,$3,$4,$5,$6,'scheduled',$7) returning *`,
      [
        ids.tenantA,
        ids.l1,
        ids.p1,
        ids.agentA1,
        new Date(Date.now() + 86400000).toISOString(),
        new Date(Date.now() + 90000000).toISOString(),
        ids.adminA,
      ],
    )
  ).id;
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------------------------------------------------------------------------
// Anonymous surface
// ---------------------------------------------------------------------------

test("anon cannot read any CRM table directly", async () => {
  await asUser("anon", null, async () => {
    for (const table of [
      "properties",
      "property_images",
      "leads",
      "lead_notes",
      "visits",
      "lead_status_events",
      "profiles",
      "tenants",
      "enquiry_throttles",
    ]) {
      await expectDenied(`anon select ${table}`, () => many(`select * from public.${table}`));
    }
  });
});

test("anon cannot insert directly into leads", async () => {
  await asUser("anon", null, async () => {
    await expectDenied("anon insert leads", () =>
      many(
        `insert into public.leads (tenant_id, full_name, phone, source, status, assigned_to)
         values ($1,'Anon','+91-00000-22222','property_form','closed_won',$2)`,
        [ids.tenantA, ids.adminA],
      ),
    );
  });
});

test("anon cannot execute submit_public_enquiry directly", async () => {
  await asUser("anon", null, async () => {
    await expectDenied("anon submit_public_enquiry", () =>
      many(`select public.submit_public_enquiry(
              'northstar-demo', null, 'Anon', '+91-00000-22222', null, null,
              'phone', null, 'property_form', $1, now())`, [
        "a".repeat(64),
      ]),
    );
  });
});

test("public RPC returns only published + available listings of the public site", async () => {
  await asUser("anon", null, async () => {
    const rows = await many(`select * from public.api_public_properties()`);
    assertEqual(
      rows.map((r) => r.reference_code).sort(),
      ["NSR-R-1001", "NSR-S-2001"],
      "only the two published+available listings of the public brokerage",
    );
  });
});

test("public RPC never exposes private or internal columns", async () => {
  await asUser("anon", null, async () => {
    const res = await db.query(`select * from public.api_public_properties() limit 0`);
    const names = res.fields.map((f) => f.name);
    for (const forbidden of [
      "private_address",
      "internal_notes",
      "owner_name",
      "tenant_id",
      "id_internal",
      "assigned_to",
    ]) {
      assert(!names.includes(forbidden), `api_public_properties must not expose ${forbidden}`);
    }
    assert(names.includes("id"), "public listings still need a stable row id");
    assert(names.includes("images"), "public listings expose an image array");

    const row = (
      await many(`select * from public.api_public_properties($1)`, ["NSR-R-1001"])
    )[0];
    assert(
      JSON.stringify(row).indexOf("Flat 404") === -1,
      "the private address must not appear in any public payload",
    );
    assert(
      JSON.stringify(row).indexOf("relocating") === -1,
      "internal notes must not appear in any public payload",
    );
    assert(
      JSON.stringify(row).indexOf("Fictional Owner") === -1,
      "owner name must not appear in any public payload",
    );
    assertEqual(row.images.length, 1, "the approved image is aggregated into the payload");
    assertEqual(
      row.is_available,
      true,
      "availability is published so a card can state it without guessing",
    );
  });
});

test("the listing_type enum accepts rent, sale and resale", async () => {
  const labels = await many(
    `select e.enumlabel from pg_type t
       join pg_enum e on e.enumtypid = t.oid
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'listing_type'
      order by e.enumsortorder`,
  );
  assertEqual(
    labels.map((r) => r.enumlabel),
    ["rent", "sale", "resale"],
    "the enum carries all three listing types, in display order",
  );

  // The upgrade migration must be a no-op once the value exists.
  await asUser("authenticated", ids.adminA, async () => {
    const inserted = await many(
      `insert into public.properties (tenant_id, reference_code, title, listing_type,
         property_type, price, price_period, status, is_available, published_at,
         city, locality)
       values ($1,'NSR-SALE-1','New build apartment','sale','apartment',7500000,'one_time',
               'published',true, now(),'Pune','Kharadi')
       returning listing_type`,
      [ids.tenantA],
    );
    assertEqual(inserted[0].listing_type, "sale", "an admin can store a 'sale' listing");
  });

  await asUser("anon", null, async () => {
    const buy = await many(
      `select * from public.api_public_properties(p_listing_types => array['sale','resale']::public.listing_type[])`,
    );
    assertEqual(
      buy.map((r) => r.reference_code).sort(),
      ["NSR-S-2001", "NSR-SALE-1"],
      "the Buy facet returns both purchase subtypes, not just 'sale'",
    );

    const rent = await many(
      `select * from public.api_public_properties(p_listing_types => array['rent']::public.listing_type[])`,
    );
    assertEqual(
      rent.map((r) => r.reference_code),
      ["NSR-R-1001"],
      "the Rent facet excludes every purchase listing",
    );

    const unfiltered = await many(
      `select * from public.api_public_properties(p_listing_types => null)`,
    );
    assertEqual(
      unfiltered.map((r) => r.reference_code).sort(),
      ["NSR-R-1001", "NSR-S-2001", "NSR-SALE-1"],
      "a null facet applies no listing-type filter",
    );

    const empty = await many(
      `select * from public.api_public_properties(p_listing_types => array[]::public.listing_type[])`,
    );
    assertEqual(
      empty.length,
      unfiltered.length,
      "an empty facet array behaves like no filter",
    );
  });

  // Archive it again so the remaining assertions keep their expected totals.
  await asUser("authenticated", ids.adminA, async () => {
    await many(
      `update public.properties set status = 'archived' where reference_code = 'NSR-SALE-1'`,
    );
  });
  await asUser("anon", null, async () => {
    const buy = await many(
      `select * from public.api_public_properties(p_listing_types => array['sale','resale']::public.listing_type[])`,
    );
    assertEqual(
      buy.map((r) => r.reference_code),
      ["NSR-S-2001"],
      "an archived Buy listing leaves the public feed",
    );
  });
});

test("the old single-subtype RPC signature is gone", async () => {
  await expectRaise(
    "calling api_public_properties with the pre-0007 signature",
    () => many(`select * from public.api_public_properties(p_listing_type => 'sale')`),
    /api_public_properties\(p_listing_type => unknown\) does not exist/,
  );
});

test("public RPC filters, sorts and clamps without SQL injection", async () => {
  await asUser("anon", null, async () => {
    const rent = await many(
      `select * from public.api_public_properties(p_listing_types => array['rent']::public.listing_type[])`,
    );
    assertEqual(rent.length, 1, "listing_type filter");
    assertEqual(rent[0].reference_code, "NSR-R-1001", "rent listing");

    const beds = await many(
      `select * from public.api_public_properties(p_bedrooms_min => 3)`,
    );
    assertEqual(beds.length, 0, "bedroom filter excludes 2-bed listings");

    const sorted = await many(`select * from public.api_public_properties(p_sort => 'price_desc')`);
    assertEqual(
      sorted.map((r) => r.reference_code),
      ["NSR-S-2001", "NSR-R-1001"],
      "price_desc ordering",
    );

    const clamped = await many(`select * from public.api_public_properties(p_limit => 9999)`);
    assert(clamped.length <= 60, "limit is clamped to 60");

    // Hostile input is bound as a value, never interpolated.
    const hostile = await many(
      `select * from public.api_public_properties(p_search => $1)`,
      ["'; drop table public.leads; --"],
    );
    assertEqual(hostile.length, 0, "hostile search input returns nothing");
  });
  const still = await many(`select count(*)::int as n from public.leads`);
  assertEqual(still[0].n, 4, "the leads table survived the hostile search");
});

test("unpublishing or archiving removes a listing from the public feed", async () => {
  await asUser("authenticated", ids.adminA, async () => {
    await many(`update public.properties set status = 'archived' where id = $1`, [ids.p2]);
  });
  await asUser("anon", null, async () => {
    const rows = await many(`select * from public.api_public_properties()`);
    assertEqual(
      rows.map((r) => r.reference_code),
      ["NSR-R-1001"],
      "the archived listing is gone from the public feed",
    );
  });
  await asUser("authenticated", ids.adminA, async () => {
    await many(`update public.properties set status = 'published' where id = $1`, [ids.p2]);
  });
});

test("another brokerage's published listing is invisible to the public site", async () => {
  await asUser("anon", null, async () => {
    const rows = await many(`select * from public.api_public_properties()`);
    assert(
      !rows.some((r) => r.reference_code === "OTH-R-0001"),
      "listings from a brokerage without public_site_enabled must not appear",
    );
  });
});

test("api_public_agency exposes branding only", async () => {
  await asUser("anon", null, async () => {
    const res = await db.query(`select * from public.api_public_agency() limit 0`);
    const names = res.fields.map((f) => f.name);
    assert(!names.includes("id"), "the public branding payload has no tenant id");
    assert(!names.includes("public_site_enabled"), "no internal flags");
    const rows = await many(`select * from public.api_public_agency()`);
    assertEqual(rows.length, 1, "exactly one brokerage serves the public site");
    assertEqual(rows[0].name, "Northstar Realty Demo", "demo agency name");
  });
});

// ---------------------------------------------------------------------------
// Agent scoping
// ---------------------------------------------------------------------------

test("an agent sees only leads assigned to them", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    const rows = await many(`select id, full_name from public.leads`);
    assertEqual(rows.map((r) => r.full_name), ["Priya Raman"], "only the assigned lead");
  });
  await asUser("authenticated", ids.agentA2, async () => {
    const rows = await many(`select full_name from public.leads`);
    assertEqual(rows.map((r) => r.full_name), ["Vikram Sethi"], "the other agent's own lead");
  });
});

test("an admin sees every lead in their own brokerage only", async () => {
  await asUser("authenticated", ids.adminA, async () => {
    const rows = await many(`select full_name from public.leads order by full_name`);
    assertEqual(
      rows.map((r) => r.full_name),
      ["Priya Raman", "Unassigned Visitor", "Vikram Sethi"],
      "three tenant A leads, no tenant B lead",
    );
  });
});

test("tenant B's admin cannot see tenant A's data", async () => {
  await asUser("authenticated", ids.adminB, async () => {
    assertEqual((await many(`select * from public.leads`)).length, 1, "only their own lead");
    assertEqual((await many(`select * from public.properties`)).length, 1, "own property only");
    assertEqual((await many(`select * from public.profiles`)).length, 1, "own profile only");
  });
});

test("an agent cannot read, update or delete another agent's lead", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    assertEqual(
      (await many(`select * from public.leads where id = $1`, [ids.l2])).length,
      0,
      "select is filtered by RLS",
    );
    assertEqual(
      (
        await many(`update public.leads set message = 'hijack' where id = $1 returning id`, [
          ids.l2,
        ])
      ).length,
      0,
      "update matches no rows",
    );
    assertEqual(
      (await many(`delete from public.leads where id = $1 returning id`, [ids.l2])).length,
      0,
      "delete matches no rows",
    );
  });
});

test("an agent cannot reassign a lead or change its source", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    await expectRaise(
      "agent reassigns own lead",
      () => many(`update public.leads set assigned_to = $1 where id = $2 returning id`, [
        ids.agentA2,
        ids.l1,
      ]),
      /only admins can change lead assignment/,
    );
    await expectRaise(
      "agent changes lead source",
      () => many(`update public.leads set source = 'phone' where id = $1 returning id`, [ids.l1]),
      /only admins can change lead source/,
    );
  });
  await asUser("authenticated", ids.adminA, async () => {
    const updated = await many(
      `update public.leads set assigned_to = $1 where id = $2 returning assigned_to`,
      [ids.agentA2, ids.l1],
    );
    assertEqual(updated[0].assigned_to, ids.agentA2, "an admin may reassign");
    await many(`update public.leads set assigned_to = $1 where id = $2`, [ids.agentA1, ids.l1]);
  });
});

test("an agent cannot write properties, profiles or tenant settings", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    await expectDenied("agent inserts property", () =>
      many(
        `insert into public.properties (tenant_id, reference_code, title, listing_type,
           property_type, price, city, locality)
         values ($1,'NSR-AGENT','Agent listing','rent','apartment',1,'Pune','Kothrud')`,
        [ids.tenantA],
      ),
    );
    const promotion = await many(
      `update public.profiles set role = 'admin' where id = $1 returning role`,
      [ids.agentA1],
    );
    assertEqual(promotion.length, 0, "an agent's own profile update matches no rows");
    await expectDenied("agent inserts profile", () =>
      many(
        `insert into public.profiles (id, tenant_id, full_name, role) values ($1,$2,'Ghost','admin')`,
        [ids.adminB, ids.tenantA],
      ),
    );
    // Filters to zero rows rather than raising; see the dedicated test below.
    const hijack = await many(
      `update public.tenants set name = 'Hijacked' where id = $1 returning name`,
      [ids.tenantA],
    );
    assertEqual(hijack.length, 0, "an agent's tenant update matches no rows");
  });
});

test("an agent cannot escalate by changing their own profile", async () => {
  await asUser("authenticated", ids.agentA2, async () => {
    const rows = await many(
      `update public.profiles set role = 'admin', is_active = true
       where id = $1 returning role, is_active`,
      [ids.agentA2],
    );
    assertEqual(rows.length, 0, "the self-promotion update matches no rows");
  });
  const profile = (
    await many(`select role, is_active from public.profiles where id = $1`, [ids.agentA2])
  )[0];
  assertEqual([profile.role, profile.is_active], ["agent", true], "role is unchanged");
});

test("a deactivated profile loses all access", async () => {
  await asUser("authenticated", ids.inactiveA, async () => {
    assertEqual((await many(`select * from public.leads`)).length, 0, "no leads");
    assertEqual((await many(`select * from public.visits`)).length, 0, "no visits");
    assertEqual((await many(`select * from public.properties`)).length, 0, "no properties");
  });
});

test("an anonymous uid has no access at all", async () => {
  await asUser("authenticated", null, async () => {
    assertEqual((await many(`select * from public.leads`)).length, 0, "no leads without a profile");
    assertEqual((await many(`select * from public.profiles`)).length, 0, "no profiles");
  });
});

// ---------------------------------------------------------------------------
// Notes, status history, visits
// ---------------------------------------------------------------------------

test("notes are scoped to the lead owner and the author cannot be forged", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    const ok = await many(
      `insert into public.lead_notes (tenant_id, lead_id, author_id, body)
       values ($1,$2,$3,'Called, left a voicemail') returning id`,
      [ids.tenantA, ids.l1, ids.agentA1],
    );
    assertEqual(ok.length, 1, "the assigned agent may add a note");

    await expectRaise(
      "forged author",
      () =>
        many(
          `insert into public.lead_notes (tenant_id, lead_id, author_id, body)
           values ($1,$2,$3,'forged') returning id`,
          [ids.tenantA, ids.l1, ids.adminA],
        ),
      /note author must be the authenticated user/,
    );

    await expectDenied("note on someone else's lead", () =>
      many(
        `insert into public.lead_notes (tenant_id, lead_id, author_id, body)
         values ($1,$2,$3,'not mine') returning id`,
        [ids.tenantA, ids.l2, ids.agentA1],
      ),
    );
  });
});

test("notes are append-only", async () => {
  await asUser("authenticated", ids.adminA, async () => {
    const target = (
      await many(
        `select id from public.lead_notes where lead_id = $1 order by created_at desc limit 1`,
        [ids.l1],
      )
    )[0].id;
    await expectDenied("edit a note", () =>
      many(`update public.lead_notes set body = 'tampered' where id = $1 returning id`, [target]),
    );
    await expectDenied("delete a note", () =>
      many(`delete from public.lead_notes where id = $1 returning id`, [target]),
    );
    const still = await many(`select body from public.lead_notes where id = $1`, [target]);
    assertEqual(
      still[0].body,
      "Called, left a voicemail",
      "the note body is untouched on the server",
    );
  });
});

test("status changes are written to lead_status_events with the real actor", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    await many(`update public.leads set status = 'contacted' where id = $1`, [ids.l1]);
  });
  await asUser("authenticated", ids.adminA, async () => {
    const events = await many(
      `select from_status, to_status, actor_id from public.lead_status_events
       where lead_id = $1 order by created_at`,
      [ids.l1],
    );
    assertEqual(events.length, 1, "one event recorded");
    assertEqual(events[0].from_status, "new", "from status");
    assertEqual(events[0].to_status, "contacted", "to status");
    assertEqual(events[0].actor_id, ids.agentA1, "actor is the authenticated agent");

    // A no-op update must not create an event.
    await many(`update public.leads set message = 'no status change' where id = $1`, [ids.l1]);
    assertEqual(
      (
        await many(`select * from public.lead_status_events where lead_id = $1`, [ids.l1])
      ).length,
      1,
      "still one event",
    );
  });
});

test("an agent cannot see another agent's status history", async () => {
  await asUser("authenticated", ids.agentA2, async () => {
    const rows = await many(`select * from public.lead_status_events where lead_id = $1`, [ids.l1]);
    assertEqual(rows.length, 0, "the event is not visible");
  });
});

test("visits are scoped to their agent and cannot be reassigned by one", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    assertEqual((await many(`select * from public.visits`)).length, 1, "sees their own visit");
    const updated = await many(
      `update public.visits set internal_notes = 'Met at the gate' where id = $1 returning id`,
      [ids.v1],
    );
    assertEqual(updated.length, 1, "an agent may record an outcome note on their own visit");

    await expectRaise(
      "agent reassigns their own visit",
      () => many(`update public.visits set agent_id = $1 where id = $2 returning id`, [
        ids.agentA2,
        ids.v1,
      ]),
      /only admins can reassign a visit/,
    );
  });
  await asUser("authenticated", ids.agentA2, async () => {
    assertEqual((await many(`select * from public.visits`)).length, 0, "not their visit");
    await expectDenied("agent books a visit for someone else's lead", () =>
      many(
        `insert into public.visits (tenant_id, lead_id, agent_id, scheduled_start,
           scheduled_end, created_by)
         values ($1,$2,$3,$4,$5,$3)`,
        [
          ids.tenantA,
          ids.l1,
          ids.agentA2,
          new Date().toISOString(),
          new Date(Date.now() + 3600000).toISOString(),
        ],
      ),
    );
  });
});

test("a completed visit must carry a valid outcome", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    await expectRaise(
      "completed with no outcome",
      () =>
        many(`update public.visits set status = 'completed' where id = $1 returning id`, [ids.v1]),
      /violates check constraint/,
    );
    const ok = await many(
      `update public.visits set status = 'completed', outcome = 'interested'
       where id = $1 returning status, outcome`,
      [ids.v1],
    );
    assertEqual([ok[0].status, ok[0].outcome], ["completed", "interested"], "valid completion");
    await many(
      `update public.visits set status = 'scheduled', outcome = null where id = $1`,
      [ids.v1],
    );
  });
});

// ---------------------------------------------------------------------------
// Public enquiry intake (service role, as the server does it)
// ---------------------------------------------------------------------------

test("public enquiry binds the tenant server-side and forces status new", async () => {
  const before = (
    await many(`select count(*)::int as n from public.leads where source = 'property_form'`)
  )[0].n;

  await asUser("service_role", null, async () => {
    await many(
      `select public.submit_public_enquiry(
         $1, $2, $3, $4, $5, $6, 'whatsapp', $7, 'property_form', $8, now())`,
      [
        "northstar-demo",
        "NSR-R-1001",
        "Deepak Rao",
        "+91-00000-33333",
        "deepak@example.invalid",
        "Is the balcony covered?",
        new Date(Date.now() + 172800000).toISOString(),
        "b".repeat(64),
      ],
    );
  });

  const row = (
    await many(`select * from public.leads where full_name = 'Deepak Rao'`)
  )[0];
  assert(row, "the enquiry created a lead");
  assertEqual(row.status, "new", "status is forced to new");
  assertEqual(row.assigned_to, null, "assignment is never accepted from the public form");
  assertEqual(row.tenant_id, ids.tenantA, "tenant is resolved server-side");
  assertEqual(row.property_id, ids.p1, "linked to the published listing");
  assertEqual(row.source, "property_form", "source recorded");
  assert(row.consent_at, "consent timestamp captured");
  assert(
    row.preferred_contact === "whatsapp",
    "preferred contact recorded",
  );
  const after = (
    await many(`select count(*)::int as n from public.leads where source = 'property_form'`)
  )[0].n;
  assertEqual(after, before + 1, "exactly one lead created");
});

test("public enquiry rejects an unpublished listing and a foreign tenant", async () => {
  await asUser("service_role", null, async () => {
    await expectRaise(
      "draft listing",
      () =>
        many(
          `select public.submit_public_enquiry(
             'northstar-demo', 'NSR-D-3001', 'A B', '+91-00000-44444', null, null,
             'phone', null, 'property_form', $1, now())`,
          ["c".repeat(64)],
        ),
      /listing unavailable/,
    );
    await expectRaise(
      "unavailable listing",
      () =>
        many(
          `select public.submit_public_enquiry(
             'northstar-demo', 'NSR-R-1002', 'A B', '+91-00000-44444', null, null,
             'phone', null, 'property_form', $1, now())`,
          ["c".repeat(64)],
        ),
      /listing unavailable/,
    );
    await expectRaise(
      "listing from a brokerage without a public site",
      () =>
        many(
          `select public.submit_public_enquiry(
             'second-demo', 'OTH-R-0001', 'A B', '+91-00000-44444', null, null,
             'phone', null, 'property_form', $1, now())`,
          ["c".repeat(64)],
        ),
      /agency unavailable/,
    );
  });
});

test("public enquiry rejects privileged sources and stale submissions", async () => {
  await asUser("service_role", null, async () => {
    await expectRaise(
      "referral source from the public form",
      () =>
        many(
          `select public.submit_public_enquiry(
             'northstar-demo', null, 'A B', '+91-00000-55555', null, null,
             'phone', null, 'referral', $1, now())`,
          ["d".repeat(64)],
        ),
      /unsupported enquiry source/,
    );
    await expectRaise(
      "replayed submission",
      () =>
        many(
          `select public.submit_public_enquiry(
             'northstar-demo', null, 'A B', '+91-00000-55555', null, null,
             'phone', null, 'contact_form', $1, now() - interval '3 hours')`,
          ["d".repeat(64)],
        ),
      /stale form submission/,
    );
    await expectRaise(
      "short fingerprint",
      () =>
        many(
          `select public.submit_public_enquiry(
             'northstar-demo', null, 'A B', '+91-00000-55555', null, null,
             'phone', null, 'contact_form', 'abc', now())`,
        ),
      /invalid rate-limit fingerprint/,
    );
  });
});

test("public enquiry is rate limited per fingerprint", async () => {
  const fp = "e".repeat(64);
  await asUser("service_role", null, async () => {
    for (let i = 0; i < 5; i += 1) {
      await many(
        `select public.submit_public_enquiry(
           'northstar-demo', null, $1, '+91-00000-66666', null, 'hello',
           'phone', null, 'contact_form', $2, now())`,
        [`Visitor ${i}`, fp],
      );
    }
    await expectRaise(
      "sixth submission",
      () =>
        many(
          `select public.submit_public_enquiry(
             'northstar-demo', null, 'Visitor 6', '+91-00000-66666', null, 'hello',
             'phone', null, 'contact_form', $1, now())`,
          [fp],
        ),
      /too many submissions/,
    );
  });
});

test("the enquiry RPC cannot be used to write privileged fields", async () => {
  const cols = (
    await many(
      `select p.proname, pg_get_function_arguments(p.oid) as args
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'submit_public_enquiry'`,
    )
  )[0];
  for (const forbidden of [
    "assigned_to",
    "status",
    "tenant_id",
    "consent_at",
    "internal_notes",
  ]) {
    assert(
      !cols.args.includes(forbidden),
      `submit_public_enquiry must not accept ${forbidden} (got: ${cols.args})`,
    );
  }
  assert(
    cols.args.includes("p_tenant_slug"),
    "the tenant is resolved from a slug, not a tenant id",
  );
});

// ---------------------------------------------------------------------------
// Storage policies
// ---------------------------------------------------------------------------

test("only an admin of the owning tenant may write listing images", async () => {
  const path = `${ids.tenantA}/${ids.p1}/x.jpg`;
  await asUser("authenticated", ids.agentA1, async () => {
    await expectDenied("agent uploads an image", () =>
      many(
        `insert into storage.objects (bucket_id, name, owner) values ('property-images', $1, $2)`,
        [path, ids.agentA1],
      ),
    );
  });
  await asUser("authenticated", ids.adminA, async () => {
    const ok = await many(
      `insert into storage.objects (bucket_id, name, owner)
       values ('property-images', $1, $2) returning id`,
      [path, ids.adminA],
    );
    assertEqual(ok.length, 1, "an admin may upload into their own tenant folder");
    await expectRaise(
      "admin writes into another tenant's folder",
      () =>
        many(
          `insert into storage.objects (bucket_id, name, owner)
           values ('property-images', $1, $2) returning id`,
          [`${ids.tenantB}/${ids.pB}/x.jpg`, ids.adminA],
        ),
      /row-level security/i,
    );
    await many(`delete from storage.objects where name = $1`, [path]);
  });
});

test("storage bucket is private, size limited and restricted to image mime types", async () => {
  const bucket = (await many(`select * from storage.buckets where id = 'property-images'`))[0];
  assert(bucket, "the bucket exists");
  // A public bucket would keep serving a draft or sold listing's photographs at
  // a stable URL after the listing itself stops being published. Images are
  // released only by the server-authorized /listing-image route.
  assertEqual(bucket.public, false, "the bucket itself serves nothing to anon");
  assertEqual(Number(bucket.file_size_limit), 10 * 1024 * 1024, "10 MB limit");
  assert(
    !bucket.allowed_mime_types.includes("image/svg+xml"),
    "SVG is excluded (script-capable format)",
  );
  assert(bucket.allowed_mime_types.includes("image/jpeg"), "JPEG allowed");
  assert(bucket.allowed_mime_types.includes("image/webp"), "WebP allowed");
});

test("no anonymous storage read policy can re-expose private images", async () => {
  const anonReads = await many(
    `select pol.polname as name
       from pg_policy pol
       join pg_class c on c.oid = pol.polrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_roles r on r.oid = any (pol.polroles)
      where n.nspname = 'storage'
        and c.relname = 'objects'
        and pol.polcmd = 'r'
        and r.rolname = 'anon'`,
  );
  assertEqual(anonReads.length, 0, `anon must not read storage.objects: ${JSON.stringify(anonReads)}`);
});

// ---------------------------------------------------------------------------
// Tenant settings are column-scoped (migration 0008)
// ---------------------------------------------------------------------------

/**
 * The agency settings form writes exactly these columns. Kept as a list so a
 * grant added or removed in 0008 shows up here as a test failure rather than as a
 * production error only after someone edits their brokerage name.
 */
const SETTINGS_COLUMNS = [
  "name",
  "tagline",
  "about",
  "phone",
  "whatsapp",
  "email",
  "office_address",
  "privacy_contact_email",
  "privacy_notes",
  "map_link",
  "service_areas",
];

test("an admin can write every agency settings column", async () => {
  await asUser("authenticated", ids.adminA, async () => {
    for (const column of SETTINGS_COLUMNS) {
      const value = column === "service_areas" ? ["Kothrud", "Baner"] : "Fictional value";
      const rows = await many(
        `update public.tenants set ${column} = $2 where id = $1 returning ${column}`,
        [ids.tenantA, value],
      );
      assertEqual(rows.length, 1, `the settings form must be able to write ${column}`);
    }
  });
});

test("tenant columns outside the settings form are not writable by a client", async () => {
  // public_site_enabled is the important one: flipping it takes the whole public
  // site offline, and no settings field maps to it.
  for (const [column, value] of [
    ["public_site_enabled", "false"],
    ["slug", "'renamed-demo'"],
    ["created_at", "now()"],
  ]) {
    await asUser("authenticated", ids.adminA, async () => {
      await expectDenied(
        `admin writes tenants.${column}`,
        () => many(`update public.tenants set ${column} = ${value} where id = $1 returning id`, [ids.tenantA]),
      );
    });
  }
});

test("the tenants UPDATE grant is column-scoped, not table-wide", async () => {
  /*
   * has_column_privilege is the authoritative check. information_schema's
   * role_table_grants reports only table-level privileges, so it reports nothing
   * at all once the grant is column-scoped — which is exactly the signal that the
   * table-wide grant is gone.
   */
  const tableWide = await one(
    `select has_table_privilege('authenticated', 'public.tenants', 'UPDATE') as wide`,
  );
  assertEqual(tableWide.wide, false, "there must be no table-wide UPDATE privilege");

  const columns = await many(
    `select a.attname as name
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'tenants'
        and a.attnum > 0
        and not a.attisdropped
        and has_column_privilege('authenticated', 'public.tenants', a.attname, 'UPDATE')
      order by a.attname`,
  );
  assertEqual(
    columns.map((r) => r.name),
    [...SETTINGS_COLUMNS].sort(),
    "exactly the settings-form columns are updatable",
  );
});

test("the settings policy from 0005 is still in place", async () => {
  const rows = await many(
    `select pol.polname as name, pol.polcmd as cmd
       from pg_policy pol
       join pg_class c on c.oid = pol.polrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'tenants'`,
  );
  const updatePolicies = rows.filter((r) => r.cmd === "w").map((r) => r.name);
  assertEqual(updatePolicies, ["tenants_admin_update"], "one admin-only UPDATE policy");
});

// ---------------------------------------------------------------------------
// Visit assignment targets (migration 0009)
// ---------------------------------------------------------------------------

test("can_assign_visit_agent accepts only active same-tenant agents", async () => {
  await asUser("authenticated", ids.adminA, async () => {
    const checks = await one(
      `select
         public.can_assign_visit_agent($1) as active_agent,
         public.can_assign_visit_agent($2) as inactive_agent,
         public.can_assign_visit_agent($3) as admin_profile,
         public.can_assign_visit_agent($4) as foreign_tenant_user,
         public.can_assign_visit_agent(gen_random_uuid()) as random_uuid`,
      [ids.agentA1, ids.inactiveA, ids.adminA, ids.adminB],
    );
    assertEqual(checks.active_agent, true, "an active agent is a valid assignee");
    assertEqual(checks.inactive_agent, false, "a departed colleague is not");
    assertEqual(checks.admin_profile, false, "another admin is not");
    assertEqual(checks.foreign_tenant_user, false, "a user in another brokerage is not");
    assertEqual(checks.random_uuid, false, "an unknown id is not");
  });
});

test("an admin may assign a visit to an active agent", async () => {
  await asUser("authenticated", ids.adminA, async () => {
    const rows = await many(
      `insert into public.visits (tenant_id, lead_id, agent_id, scheduled_start, scheduled_end, created_by)
       values ($1, $2, $3, now() + interval '5 days', now() + interval '5 days 1 hour', $4)
       returning agent_id, created_by`,
      [ids.tenantA, ids.l3, ids.agentA1, ids.adminA],
    );
    assertEqual(rows.length, 1, "the insert and its RETURNING both succeed");
    assertEqual(rows[0].agent_id, ids.agentA1, "assigned to the chosen active agent");
    assertEqual(rows[0].created_by, ids.adminA, "created_by stays the admin who booked it");
  });
});

test("a visit cannot be assigned to an invalid target even from a forged request", async () => {
  const cases = [
    ["an inactive colleague", ids.inactiveA],
    ["another admin", ids.adminA],
    ["a user in another brokerage", ids.adminB],
  ];

  for (const [label, target] of cases) {
    await asUser("authenticated", ids.adminA, async () => {
      await expectDenied(
        `admin assigns a visit to ${label}`,
        () =>
          many(
            `insert into public.visits (tenant_id, lead_id, agent_id, scheduled_start, scheduled_end, created_by)
             values ($1, $2, $3, now() + interval '6 days', now() + interval '6 days 1 hour', $4)
             returning id`,
            // tenant_id follows the assignee so a cross-tenant target trips the
            // composite foreign key too, independently of the policy.
            [ids.tenantA, ids.l3, target, ids.adminA],
          ),
      );
    });
  }
});

test("an admin cannot assign a visit to themselves", async () => {
  await asUser("authenticated", ids.adminA, async () => {
    await expectDenied("admin self-assigns", () =>
      many(
        `insert into public.visits (tenant_id, lead_id, agent_id, scheduled_start, scheduled_end, created_by)
         values ($1, $2, $3, now() + interval '7 days', now() + interval '7 days 1 hour', $3)
         returning id`,
        [ids.tenantA, ids.l3, ids.adminA],
      ),
    );
  });
});

test("created_by cannot be forged when booking", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    await expectDenied("agent books with someone else's created_by", () =>
      many(
        `insert into public.visits (tenant_id, lead_id, agent_id, scheduled_start, scheduled_end, created_by)
         values ($1, $2, $3, now() + interval '8 days', now() + interval '8 days 1 hour', $4)
         returning id`,
        [ids.tenantA, ids.l1, ids.agentA1, ids.adminA],
      ),
    );
  });
});

test("reassigning a visit to an inactive agent is blocked, but editing one is not", async () => {
  // Editing an existing visit whose assignee has since been deactivated must keep
  // working, or a departed agent's visits could never be closed out.
  await asUser("authenticated", ids.adminA, async () => {
    const edit = await many(
      `update public.visits set status = 'completed', outcome = 'no_response'
        where id = $1 returning id`,
      [ids.v1],
    );
    assertEqual(edit.length, 1, "an admin can still close out an existing visit");

    await expectRaise(
      "admin reassigns a visit to an inactive agent",
      () =>
        many(
          `update public.visits set agent_id = $1 where id = $2 returning id`,
          [ids.inactiveA, ids.v1],
        ),
      /only be assigned to an active agent/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Admin write paths (migrations 0004/0005 regressions)
// ---------------------------------------------------------------------------

test("an admin can update their own brokerage settings", async () => {
  await asUser("authenticated", ids.adminA, async () => {
    const rows = await many(
      `update public.tenants set tagline = 'Updated fictional tagline'
        where id = $1 returning id`,
      [ids.tenantA],
    );
    assertEqual(rows.length, 1, "the admin's own tenant row is updatable");
  });
});

test("an agent cannot update brokerage settings", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    // RLS filters the row out of the UPDATE rather than raising, so the
    // observable effect is zero rows affected — not an error.
    const rows = await many(
      `update public.tenants set tagline = 'nope' where id = $1 returning id`,
      [ids.tenantA],
    );
    assertEqual(rows.length, 0, "no tenant row is reachable by an agent");
  });
});

test("an admin cannot update another brokerage's settings", async () => {
  await asUser("authenticated", ids.adminA, async () => {
    const rows = await many(
      `update public.tenants set tagline = 'nope' where id = $1 returning id`,
      [ids.tenantB],
    );
    assertEqual(rows.length, 0, "another brokerage's row is not reachable");
  });
});

test("tenant identity fields are immutable even for a privileged writer", async () => {
  /*
   * Since 0008 the column grant stops a client reaching id, slug or created_at at
   * all, so the trigger from 0005 is defence in depth rather than the first line.
   * It is exercised here as the table owner, who bypasses both column grants and
   * RLS, to prove it is still installed and still fires.
   */
  await expectRaise(
    "a privileged writer rewrites the tenant slug",
    () => many(`update public.tenants set slug = 'renamed' where id = $1 returning id`, [ids.tenantA]),
    /slug is immutable/i,
  );
  await expectRaise(
    "a privileged writer moves the tenant row to a new id",
    () =>
      many(`update public.tenants set id = gen_random_uuid() where id = $1 returning id`, [ids.tenantA]),
    /tenant id is immutable/i,
  );
});

test("an admin can book a site visit for a colleague", async () => {
  await asUser("authenticated", ids.adminA, async () => {
    const rows = await many(
      `insert into public.visits (tenant_id, lead_id, agent_id, scheduled_start, scheduled_end, created_by)
       values ($1, $2, $3, now() + interval '2 days', now() + interval '2 days 1 hour', $4)
       returning agent_id, created_by`,
      [ids.tenantA, ids.l2, ids.agentA2, ids.adminA],
    );
    assertEqual(rows.length, 1, "the admin may book on another agent's behalf");
    assertEqual(rows[0].agent_id, ids.agentA2, "the visit belongs to the chosen agent");
    assertEqual(rows[0].created_by, ids.adminA, "created_by stays the admin who booked it");
  });
});

test("an agent still books only for themselves", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    await expectDenied("agent books for a colleague", () =>
      many(
        `insert into public.visits (tenant_id, lead_id, agent_id, scheduled_start, scheduled_end, created_by)
         values ($1, $2, $3, now() + interval '3 days', now() + interval '3 days 1 hour', $3)
         returning id`,
        [ids.tenantA, ids.l1, ids.agentA2],
      ),
    );
  });
});

test("can_access_visit agrees with the visit policies", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    const own = await one(`select public.can_access_visit($1) as ok`, [ids.v1]);
    assertEqual(own.ok, true, "the assigned agent can access their own visit");
  });
  await asUser("authenticated", ids.agentA2, async () => {
    const other = await one(`select public.can_access_visit($1) as ok`, [ids.v1]);
    assertEqual(other.ok, false, "a colleague's visit is not accessible");
    const visible = await many(`select id from public.visits where id = $1`, [ids.v1]);
    assertEqual(visible.length, 0, "and it is filtered out of the query too");
  });
  await asUser("authenticated", ids.adminA, async () => {
    const adminView = await one(`select public.can_access_visit($1) as ok`, [ids.v1]);
    assertEqual(adminView.ok, true, "an admin can access any visit in the brokerage");
  });
});

/*
 * Regression: the visit scoping rule must be evaluable against a candidate
 * tuple, not looked up by id. A policy that reads `select ... from visits where
 * id = <new id>` is false while the row is still being written, so the
 * INSERT ... RETURNING that PostgREST issues for .insert().select("id") would
 * fail with a misleading "violates row-level security policy" error.
 */
test("an agent can book a visit for themselves, with RETURNING", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    const rows = await many(
      `insert into public.visits (tenant_id, lead_id, agent_id, scheduled_start, scheduled_end, created_by)
       values ($1, $2, $3, now() + interval '4 days', now() + interval '4 days 1 hour', $3)
       returning agent_id, created_by`,
      [ids.tenantA, ids.l1, ids.agentA1],
    );
    assertEqual(rows.length, 1, "the insert and its RETURNING both succeed");
    assertEqual(rows[0].agent_id, ids.agentA1, "the visit is the agent's own");
  });
});

test("an agent still cannot delete a visit", async () => {
  await asUser("authenticated", ids.agentA1, async () => {
    const rows = await many(`delete from public.visits where id = $1 returning id`, [ids.v1]);
    assertEqual(rows.length, 0, "delete is admin-only and filters the row out");
  });
});

test("at most one brokerage may serve the public site", async () => {
  await expectRaise(
    "second public brokerage",
    () =>
      many(
        `insert into public.tenants (slug, name, public_site_enabled)
         values ('third-demo', 'Third', true) returning id`,
      ),
    /violates unique constraint/,
  );
});

// ---------------------------------------------------------------------------

async function main() {
  process.stdout.write(`\n${C.bold}PropFlow security verification${C.reset}\n\n`);
  const files = await loadMigrations();
  process.stdout.write(`${C.dim}  ${files.length} migration files applied${C.reset}\n\n`);
  await seed();

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
    process.stdout.write(`${C.red}${name}${C.reset}\n      ${String(error.message).split("\n").join("\n      ")}\n\n`);
  }
  await db.close();
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (error) => {
  process.stdout.write(`${C.red}harness error${C.reset}\n${error?.stack ?? error}\n`);
  await db.close();
  process.exit(1);
});