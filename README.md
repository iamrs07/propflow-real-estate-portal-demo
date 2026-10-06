# PropFlow

A public property site and a private lead-to-site-visit workspace for **one small
brokerage**, on Next.js + Supabase. No paid services, no third-party APIs, no
portal feeds, no scraping.

The whole product story is one loop:

```
visitor reads a listing → submits an enquiry → the brokerage assigns an agent →
the agent books a site visit → records the outcome
```

Everything below is fictional demonstration content. There is no real person,
property or brokerage in this repository.

---

## 1. Run it in 60 seconds, with no accounts

```bash
npm install
npm run dev
```

That is the whole setup. With no Supabase project configured the app runs in
**demo mode**: it serves in-memory fixtures, and every write is simulated
in-process and lost when the server restarts.

Open <http://localhost:3000> for the public site and
<http://localhost:3000/auth/login> for the workspace.

### Demo accounts

| Role  | Email                  | Password            |
| ----- | ---------------------- | ------------------- |
| Admin | `admin@northstar.demo` | `PropFlowDemo!2026` |
| Agent | `rohan@northstar.demo` | `PropFlowDemo!2026` |
| Agent | `farah@northstar.demo` | `PropFlowDemo!2026` |

Sign in as the agent first to see role scoping — that account reaches only its
own one lead and one visit, and is refused `/crm/team` outright.

These are **synthetic demo accounts**, not real staff. `.invalid` and `.example`
are TLDs reserved by RFC 2606 that can never be registered, so addresses using
them cannot reach a mailbox. **`.demo` is not one of them** — it is a real,
registrable sponsored TLD, so an `@northstar.demo` address is only as
undeliverable as its domain happens to be unclaimed. The addresses are kept
exactly as written so existing demo login instructions keep working, and the
application never sends mail to them: `requestPasswordReset` refuses any address
that appears in the demo fixtures. Change them before using this for real.

Phone numbers use the `+91 00000 …` form: Indian subscriber numbers begin 6–9, so
a `0` after the country code is not an assignable range and the number cannot be
dialled. In demo mode the phone and WhatsApp values are rendered as plain text
with no `tel:` or `wa.me` link at all.

---

## 2. Run it against a real Supabase project

The free tier is enough. Nothing in this project needs a paid add-on.

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor** and run these files in order, or run `supabase db push`:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_public_api_and_storage.sql`
   - `supabase/migrations/0003_rls_and_grants.sql`
   - `supabase/migrations/0004_listing_type_sale.sql` — adds the third listing
     type (`sale`). Already part of `0001`, so on a brand-new project it is a
     harmless no-op; run it if you applied 0001 before this type existed.
   - `supabase/migrations/0005_admin_write_paths.sql` — **required.** Without it
     the agency settings form and admin-scheduled visits are both rejected: the
     settings form needs a `tenants` UPDATE grant and policy, and an admin needs
     to be able to book a visit for a colleague.
   - `supabase/migrations/0006_private_image_storage.sql` — **required.** Without
     it draft and sold listing photographs stay readable at their bucket URL even
     after the listing is unpublished.
   - `supabase/migrations/0007_public_listing_facet.sql` — **required.** Replaces
     the public listing RPC's single `p_listing_type` with `p_listing_types`, so
     the Buy filter can cover both `sale` and `resale`. An installation already on
     0001–0006 must run this before deploying the matching application code; the
     old signature is dropped, so an un-updated deployment will fail loudly.
   - `supabase/migrations/0008_tenant_settings_column_grants.sql` — **required.**
     Narrows the table-wide `tenants` UPDATE grant from 0005 to the eleven columns
     the settings form edits, so `public_site_enabled` and the tenant identity
     columns are not client-writable at all.
   - `supabase/migrations/0009_visit_assignee_active_agent.sql` — **required.**
     Enforces in the database that a visit is assigned only to an active agent in
     the same brokerage, including on reassignment.

   All files are additive: none of them rewrite the history of an earlier one, so
   an existing project can apply 0005–0009 on their own and in that order.
3. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the *publishable* key)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only — never prefix with `NEXT_PUBLIC_`)
   - `PROPFLOW_TENANT_SLUG=northstar-demo`

   Leave `PROPFLOW_DEMO_MODE` unset, exactly as `.env.example` ships it. With a
   real project configured, demo mode stays off on its own; set the variable to
   `1` only to run on the fictional fixtures anyway.
4. Seed the demonstration data:

   ```bash
   npm run db:seed
   ```

   The seed is idempotent — run it twice and it updates rather than duplicating.
   It creates the brokerage, three staff accounts, seven listings (six published,
   one draft), three leads, the status history, two site visits, and paints
   placeholder photographs locally before uploading them to Storage. Nothing is
   downloaded or licensed.

5. `npm run dev`, and sign in with the addresses above.

### Deploying

Any Node host that runs `next build` and `next start` works — Vercel, Render,
Railway, Fly, or a VPS. Set those four environment variables in the host's
dashboard and leave `PROPFLOW_DEMO_MODE` unset, so a deployment that is missing
its project fails visibly instead of falling back to fixtures. Two deployment
notes:

- A production build with **neither** a Supabase project nor `PROPFLOW_DEMO_MODE`
  refuses to run rather than quietly serving fictional listings to real visitors.
- `next.config.ts` sets `images.unoptimized`, because the Storage hostname is
  only known at deploy time. This keeps the build independent of it. Images are
  served same-origin by `/listing-image`, so there is no remote host to allow.
- Listing photographs live in a **private** bucket and are released only by the
  `/listing-image/<path>` route, which re-checks that the listing is published,
  available, and publicly enabled on every request — so unlisting a listing
  removes its images at once. Staff of the brokerage still see drafts. Anonymous
  responses are sent with `Cache-Control: no-cache`, so a shared cache must
  revalidate with the origin rather than serve a withdrawn photograph from its own
  store; staff responses are `private, no-store`. The trade-off is that image
  bytes traverse the Next.js server, so allow for one Storage fetch per image.
- **Never enable demo mode on a deployment reachable from a network.** Demo mode
  has no password store, so the session is a cookie signed with a server-only
  secret. Set `PROPFLOW_DEMO_SECRET` to at least 32 characters if you must; if
  demo mode is on in a production build with no such secret configured, the app
  refuses to serve a session at all rather than falling back to a key committed to
  this repository. The sign-in screen states that reason up front instead of
  offering the demo accounts, since naming them there would be a dead end.

**Change every demo password before this installation handles a real lead.**
Then delete the demo brokerage from the Team page if you would rather start
clean.

---

## 3. What the code guarantees

### The public site cannot read anything private

Anonymous visitors have no read access to any table. They reach data through two
`SECURITY DEFINER` functions, and because those functions bypass RLS, each one
names its approved columns explicitly:

| Function                   | Returns                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `api_public_agency()`      | brokerage branding and contact details only                     |
| `api_public_properties()`  | published **and** available listings, approved columns only     |

`private_address`, `internal_notes`, `owner_name`, `tenant_id` and `assigned_to`
have no column in that return list, so no amount of client-side cleverness can
read them. `scripts/verify-security.mjs` asserts this.

### Every brokerage-owned row carries a tenant

`tenant_id` is `NOT NULL` on every table. Foreign keys are **composite**
(`(tenant_id, property_id) → properties(tenant_id, id)`), so a lead cannot point
at another brokerage's listing even if someone bypasses the application.

### Roles

| Actor  | Can                                                                        |
| ------ | -------------------------------------------------------------------------- |
| Visitor | read published listings, submit an enquiry                                   |
| Agent  | read/write **only** leads and visits assigned to them                        |
| Admin  | everything inside their own brokerage                                         |

There is no public sign-up: accounts are created by an admin from `/crm/team`.
Tenant and role always come from the authenticated user's `profiles` row — never
from a cookie, query parameter or form field. An agent cannot change their own
role, reassign a lead, change a lead's source, or see another agent's status
history. Deactivating a profile revokes access on the next request.

### The service-role key is quarantined

`SUPABASE_SERVICE_ROLE_KEY` appears in exactly three places: `auth.admin.*`
account management, the public enquiry RPC, and the seed script. Every CRM read
and write goes through the **session** client so RLS is enforced.

### Enquiry handling

The public form is the only anonymous write. It is hardened in six ways, in this
order: a honeypot field answered as success (so a bot learns nothing), server-side
validation, the tenant taken from `PROPFLOW_TENANT_SLUG` on the server rather
than the request, no parameter for assignment/status/source at all (the RPC takes
none and forces `status = 'new'`), a signed timestamp that rejects a stale form,
and a per-fingerprint hourly limit enforced inside the database.

### Rate limiting and abuse

One brokerage, one enquiry channel, no captcha. The hourly per-fingerprint cap
plus the honeypot is proportionate; add more only if you actually see abuse.

---

## 4. Verification

Four suites, all runnable offline.

```bash
npm run db:verify     # 54 assertions against real PostgreSQL semantics (PGlite)
npm run verify:demo   # demo fixture timeline + demo-mode configuration
npm run typecheck     # tsc --noEmit
npm run lint          # eslint, zero warnings tolerated
```

`npm run check` runs typecheck, lint, `db:verify` and `verify:demo` together.

`npm run db:verify` is the important one. It boots the real migrations inside an
in-process PostgreSQL (PGlite, via WASM — no Docker, no `psql`), fabricates two
brokerages, and then impersonates each actor through `SET LOCAL ROLE` /
`set_config` to assert on what they can actually read and write:

```
54/54 passed
```

Covered: cross-tenant isolation in both directions, agent scoping, role
escalation attempts, deactivated profiles, an anonymous uid, note authorship and
append-only history, status-change audit rows with a real actor, visit ownership,
completed-visit outcome requirements, the public RPC's column allow-list, SQL
injection attempts through search input, the `SECURITY DEFINER` search path, the
enquiry RPC's rate limit and forced status, and Storage bucket policy.

It also pins the regressions that this project's own demo mode would otherwise
hide, because demo mode short-circuits before the database:

- agency settings are writable by an admin of that brokerage and by nobody else,
  and **only** through a column-scoped grant — `public_site_enabled`, `slug`,
  `id` and `created_at` are not client-writable at all, while the 0005 trigger
  still rejects them for a privileged writer;
- tenant identity fields remain immutable;
- an admin can book a visit for an active colleague, while an agent books only for
  themselves, and no visit can be assigned to a departed colleague, to another
  admin, or to a user in another brokerage — even from a forged request that never
  touches the UI;
- creating a visit survives the `INSERT ... RETURNING` that PostgREST issues,
  which a policy that looked the row up by id could not;
- the Buy facet returns both `sale` and `resale`, Rent returns neither, and the
  old single-subtype RPC signature is gone.

`npm run verify:demo` covers the parts of the app that never reach a database, so
they have no other safety net:

- every demo visit is **booked in the past and scheduled in the future**, in that
  order, and its `created_at`/`updated_at` never runs ahead of the start time. The
  visits board renders `Booked {created_at}` next to the scheduled time, so a
  fixture pinned to a fixed calendar date drifts against the relative schedule and
  eventually shows a visit booked after it was due;
- each demo visit stays assigned to the intended agent, and both agents keep their
  single visit;
- the wall-clock time a visit asks for is the one the board shows. The fixtures are
  written in Asia/Kolkata and so is every rendered timestamp, and a flat five-hour
  offset instead of 5h30m put a visit asked for at 10:30 on screen as 11:00 —
  contradicting the note that tells the agent to meet at the gate at 10:30;
- the three demo accounts keep the documented addresses, the shared password, and
  one admin plus two agents, and the sign-in screen and the README both read them
  from the fixtures rather than keeping a second copy;
- demo mode resolves as documented: unset in development with no project is **on**,
  set to `0` is off, set to `1` is on even with a project, and a production build is
  off unless the flag is `1` — so `.env.example` cannot quietly ship a `0` that
  contradicts its own comments;
- a production build refuses to sign a demo session without a
  `PROPFLOW_DEMO_SECRET` of at least 32 characters, and never falls back to the
  committed development key;
- a tampered demo cookie, a swapped profile id and a non-uuid profile id all
  resolve to nobody.

There is also an end-to-end suite that drives real HTTP requests through the real
React server actions — no mocks, no test framework:

```bash
npm run dev
npm run smoke         # 95 assertions (needs a running server)
```

It checks that public pages render and never leak a private column, that an
unpublished listing returns a real 404, that an anonymous visitor is redirected to
a sign-in page that actually exists (and that the retired `/login` path does not),
that a wrong password sets no cookie, that an agent sees exactly one lead and one
visit while an admin sees all three and both visits, that an agent is refused team
management, and that the honeypot silently drops its submission while a real
enquiry becomes a lead. It also covers the Rent/Buy facet split, demo contact
controls being inert, the demo session cookie resisting forgery, and the protected
image route's caching headers. Two assertions read the visits board as rendered and
pin the defect this repository shipped with: every visit must show a booked
timestamp in the past, and the sign-in screen must never both offer the demo
accounts and refuse them.

Run it against a **development** server. A production build in demo mode needs
`PROPFLOW_DEMO_SECRET` set before staff sign-in works; without one the app
deliberately refuses to issue a session, so the authenticated half of this suite
cannot pass. That refusal is itself the intended behaviour, not a failure.

---

## 5. Layout

```
supabase/
  migrations/            0001 schema · 0002 public API + storage · 0003 RLS + grants
                         0004 the third listing type (`sale`) · 0005 admin write
                         paths · 0006 private image bucket · 0007 public listing
                         facet · 0008 tenant settings column grants ·
                         0009 visit assignee must be an active agent
  tests/                 offline PostgREST/Storage stubs for the verification harness
scripts/
 verify-security.mjs    54 RLS / privilege assertions
 verify-demo.mjs        demo fixture timeline + demo-mode configuration
 smoke.mjs              95 end-to-end assertions over real HTTP
  seed.mjs               idempotent demo seed
  lib/png.mjs            dependency-free PNG encoder for seed photographs
src/
  app/
    (site)/              public: home, listings, listing detail, about, privacy
    auth/                sign in, forgot password, reset password
    crm/                 dashboard, leads, visits, listings, team, agency settings
  components/            design system + forms
  lib/
    auth.ts              session resolution — the only place role/tenant is decided
    clock.ts             wall-clock reads, kept out of render bodies
    data/                public + crm read paths, and the demo fixtures
    supabase/            server, admin and proxy clients
  server/actions/        every mutation, one file per resource
```

### Two design decisions worth knowing about

**No `loading.tsx` above the CRM or the public segment.** A loading file installs
a Suspense boundary, which lets Next flush the shell before a page resolves — and
once the shell is flushed, `notFound()` can no longer set a status code. Without
that boundary an unavailable listing would be served as a cacheable HTTP 200, and
an agent requesting `/crm/team` would get a 200 with a shell that hangs forever
without JavaScript. The skeletons are mounted per page instead
(`components/listing-skeleton.tsx`, `components/crm-loading.tsx`), which keeps the
streaming benefit and the correct status codes.

**The public RPC returns `is_available`.** It is always `true` on that path, since
the function filters on it. It is returned so a card can state availability rather
than assume it, and the harness asserts it is present.

---

## 6. Deliberate omissions

Each of these would cost money, require an external contract, or add a dependency
the brief rules out. Each is named here rather than left as a mystery.

- **No maps.** `map_link` is a stored URL the agency supplies; no map SDK, no key.
- **No WhatsApp Business API or SMS.** `wa.me` links are plain anchors.
- **No calendar sync.** Visits are start/end timestamps; `.ics` export is a natural
  next step and needs no third party.
- **No portal feeds.** Nothing is scraped or imported from other listings sites.
- **No payments or e-signature.** A written record of what was agreed is the claim;
  the software does not try to be the contract.
- **No email service.** Password reset uses Supabase's built-in email with the
  project's own SMTP defaults; on the free tier this is rate-limited, which is why
  reset also works through the `notice` link in demo mode.
- **Multi-tenancy is schema-complete but the UI is single-tenant.** `tenant_id` is
  enforced everywhere and the harness proves isolation between two brokerages, but
  `PROPFLOW_TENANT_SLUG` resolves one brokerage for the public site and a unique
  partial index enforces at most one public site. Serving several brokerages from
  one deployment is a deliberate non-goal.

---

## 7. Cost

| Item                | Cost                          |
| ------------------- | ----------------------------- |
| Supabase (free tier) | £0 — the project fits          |
| Vercel/Render (free) | £0 — a small brokerage's traffic |
| Domain               | the only real line item        |

Well under the ₹3,000 pre-customer budget. There is no per-enquiry, per-lead or
per-seat charge anywhere in the design.
