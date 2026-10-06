import type {
  Agency,
  Lead,
  LeadNote,
  LeadStatusEvent,
  Profile,
  PublicProperty,
  StaffProperty,
  Visit,
} from "@/lib/data/types";

/**
 * Demo mode fixtures — entirely fictional.
 *
 * Used when PROPFLOW_DEMO_MODE=1 so the whole lead-to-visit journey can be
 * demonstrated without a Supabase project. Names are invented, phone numbers
 * use the `+91 00000 …` form — Indian subscriber numbers begin 6–9, so a `0`
 * after the country code is not an assignable range and cannot be dialled.
 *
 * Email addresses mix two different guarantees, and the difference matters:
 * `.invalid` and `.example` are reserved by RFC 2606 and can never be
 * registered, but `.demo` is a real, registrable sponsored TLD — it is NOT
 * reserved, and `@northstar.demo` is only as undeliverable as its domain
 * happens to be unclaimed. These accounts are synthetic demo identities, kept
 * as-is so the published demo login keeps working; the application refuses to
 * send password-reset mail to any of them.
 *
 * Listing images are original SVG placeholders served from /demo.
 */

export const DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_ADMIN_ID = "22222222-2222-4222-8222-222222222201";
export const DEMO_AGENT_ROHAN = "22222222-2222-4222-8222-222222222202";
export const DEMO_AGENT_FARAH = "22222222-2222-4222-8222-222222222203";

const prop = (n: number) => `33333333-3333-4333-8333-33333333330${n}`;
const lead = (n: number) => `44444444-4444-4444-8444-44444444440${n}`;
const visit = (n: number) => `55555555-5555-4555-8555-55555555550${n}`;
const note = (n: number) => `66666666-6666-4666-8666-66666666660${n}`;
const event = (n: number) => `77777777-7777-4777-8777-77777777770${n}`;

/**
 * Demo sign-in accounts.
 *
 * Synthetic identities, not real people, and not real mailboxes. `.demo` is a
 * registrable TLD rather than an RFC 2606 reserved one, so nothing here depends
 * on those addresses being undeliverable — see the file header and
 * requestPasswordReset, which refuses to send mail to any of them.
 */
export const DEMO_PASSWORD = "PropFlowDemo!2026";

export const DEMO_ACCOUNTS = [
  {
    label: "Admin — Aarti Sharma",
    email: "admin@northstar.demo",
    password: DEMO_PASSWORD,
    profileId: DEMO_ADMIN_ID,
  },
  {
    label: "Agent — Rohan Mehta",
    email: "rohan@northstar.demo",
    password: DEMO_PASSWORD,
    profileId: DEMO_AGENT_ROHAN,
  },
  {
    label: "Agent — Farah Khan",
    email: "farah@northstar.demo",
    password: DEMO_PASSWORD,
    profileId: DEMO_AGENT_FARAH,
  },
] as const;

export const DEMO_AGENCY: Agency = {
  slug: "northstar-demo",
  name: "Northstar Realty",
  tagline: "Rental, resale and new-build homes, handled personally.",
  about:
    "Northstar Realty is a small brokerage that works a short list of homes in Pune, Bengaluru and Hyderabad. We publish only what we can stand behind: every listing is inspected, priced with the owner in the room, and handed over with a written record of what was agreed. This installation is a demonstration — the agency, the agents and every listing on this site are fictional.",
  phone: "+91 00000 00000",
  whatsapp: "+91 00000 00000",
  email: "hello@northstar.invalid",
  office_address:
    "Unit 4, Fictional House, 12 Example Road, Shivajinagar, Pune 411005 (demonstration address)",
  service_areas: ["Pune", "Bengaluru", "Hyderabad"],
  map_link: null,
  privacy_contact_email: "privacy@northstar.invalid",
  privacy_notes:
    "This is demonstration content. No real person’s data is collected by this installation. Replace this paragraph with the agency’s own plain-language data-use statement before going live.",
};

export const DEMO_PROFILES: Profile[] = [
  {
    id: DEMO_ADMIN_ID,
    tenant_id: DEMO_TENANT_ID,
    full_name: "Aarti Sharma",
    role: "admin",
    is_active: true,
    phone: "+91 00000 00010",
    title: "Principal",
    created_at: "2026-01-12T09:00:00.000Z",
  },
  {
    id: DEMO_AGENT_ROHAN,
    tenant_id: DEMO_TENANT_ID,
    full_name: "Rohan Mehta",
    role: "agent",
    is_active: true,
    phone: "+91 00000 00011",
    title: "Senior Agent — Pune",
    created_at: "2026-01-14T09:00:00.000Z",
  },
  {
    id: DEMO_AGENT_FARAH,
    tenant_id: DEMO_TENANT_ID,
    full_name: "Farah Khan",
    role: "agent",
    is_active: true,
    phone: "+91 00000 00012",
    title: "Agent — Bengaluru and Hyderabad",
    created_at: "2026-02-02T09:00:00.000Z",
  },
];

const iso = (value: string) => new Date(value).toISOString();

/**
 * The demo activity timeline, anchored to the clock instead of the calendar.
 *
 * Leads, notes, status changes and visits are the story of one brokerage over
 * the last week and the week ahead, so every one of them is expressed as an
 * offset from now with the wall-clock time given in Asia/Kolkata. Fixing them to
 * literal dates looks tidier in the source but rots: the build drifts away from
 * them, the leads list renders a date that has not happened yet as "just now",
 * and a visit ends up booked after the visit it belongs to.
 *
 * Asia/Kolkata is UTC+5:30 all year with no DST, so one calendar day is exactly
 * 86_400_000 ms and the requested time is 5h30m behind UTC. Minutes are set as
 * an offset from the hour so the value rolls over correctly, and seconds are
 * dropped so repeated builds in the same second are identical.
 */
function activityAt(daysFromNow: number, hour: number, minutes = 0): string {
  const date = new Date(Date.now() + daysFromNow * 86_400_000);
  date.setUTCHours(0, (hour - 5) * 60 - 30 + minutes, 0, 0);
  return date.toISOString();
}

interface ListingSeed {
  reference_code: string;
  title: string;
  headline: string;
  description: string;
  listing_type: "rent" | "sale" | "resale";
  property_type: StaffProperty["property_type"];
  status: StaffProperty["status"];
  is_available: boolean;
  price: number;
  price_period: "month" | "year" | "one_time";
  negotiable: boolean;
  city: string;
  locality: string;
  private_address: string;
  internal_notes: string | null;
  owner_name: string;
  bedrooms: number | null;
  bathrooms: number | null;
  area_value: number | null;
  area_unit: "sqft" | "sqm" | "acre" | null;
  furnishing: "unfurnished" | "semi_furnished" | "furnished" | null;
  amenities: string[];
  map_link: string | null;
  year_built: number | null;
  images: { path: string; alt: string }[];
  published_at: string | null;
  created_at: string;
}

const LISTINGS: ListingSeed[] = [
  {
    reference_code: "NSR-R-1001",
    title: "Two-bedroom apartment in Koregaon Park",
    headline: "Sunlit 2 BHK with a covered balcony, two minutes from the station.",
    description:
      "A quiet two-bedroom on the fourth floor of a small, well-kept building. The living room faces west, so it stays bright until late afternoon, and the balcony is covered, which makes it usable almost year round. The kitchen has been replaced in the last two years and comes with the appliances shown in the photographs.\n\nThe building has one flat per floor, a resident caretaker, and a functioning lift. Water is from a borewell with municipal backup, so supply has been reliable through two summers.",
    listing_type: "rent",
    property_type: "apartment",
    status: "published",
    is_available: true,
    price: 45000,
    price_period: "month",
    negotiable: true,
    city: "Pune",
    locality: "Koregaon Park",
    private_address:
      "Flat 402, Fictional Residency, 7 Example Road, Koregaon Park, Pune 411001",
    internal_notes:
      "Owner relocating to Bengaluru in April. Flexible on notice period. Do not quote the carpet area below 940 sq ft in writing — the builder brochure rounds up.",
    owner_name: "Fictional Owner — Koregaon Park 2BHK",
    bedrooms: 2,
    bathrooms: 2,
    area_value: 950,
    area_unit: "sqft",
    furnishing: "semi_furnished",
    amenities: ["Lift", "Power backup", "Parking", "Security", "CCTV", "Balcony"],
    map_link: "https://www.openstreetmap.org/search?query=Koregaon%20Park%20Pune",
    year_built: 2016,
    images: [
      { path: "/demo/apartment-1.svg", alt: "Living room with west-facing windows" },
      { path: "/demo/apartment-2.svg", alt: "Covered balcony overlooking the street" },
      { path: "/demo/apartment-3.svg", alt: "Kitchen with replaced cabinets" },
    ],
    published_at: iso("2026-07-02T10:00:00Z"),
    created_at: iso("2026-06-28T12:00:00Z"),
  },
  {
    reference_code: "NSR-R-1002",
    title: "Four-bedroom villa in Kothrud",
    headline: "Independent villa with a garden, on a lane of four similar homes.",
    description:
      "A detached four-bedroom villa set back from the road behind a gate, with a planted front garden and a service passage to the back. Two bedrooms upstairs, two downstairs, and a separate utility block that currently holds the washing machine and the inverter.\n\nThe lane is narrow but paved, and the two neighbouring households are both long-term owners. Parking for two cars is inside the gate.",
    listing_type: "rent",
    property_type: "villa",
    status: "published",
    is_available: true,
    price: 125000,
    price_period: "month",
    negotiable: false,
    city: "Pune",
    locality: "Kothrud",
    private_address:
      "Villa 9, Fictional Enclave, 3 Example Lane, Kothrud, Pune 411038",
    internal_notes: "Landlord wants a 12-month lease with a 2-month deposit.",
    owner_name: "Fictional Owner — Kothrud villa",
    bedrooms: 4,
    bathrooms: 4,
    area_value: 2400,
    area_unit: "sqft",
    furnishing: "unfurnished",
    amenities: ["Parking", "Power backup", "Gym", "Children's play area", "Piped gas"],
    map_link: "https://www.openstreetmap.org/search?query=Kothrud%20Pune",
    year_built: 2011,
    images: [
      { path: "/demo/villa-1.svg", alt: "Villa frontage behind a gate" },
      { path: "/demo/villa-2.svg", alt: "Planted front garden" },
    ],
    published_at: iso("2026-07-08T10:00:00Z"),
    created_at: iso("2026-07-04T12:00:00Z"),
  },
  {
    reference_code: "NSR-R-1003",
    title: "Two-bedroom office floor in HSR Layout",
    headline: "Small, finished office floor suitable for four to six people.",
    description:
      "A self-contained floor in a low-rise office building, currently set up for six: a reception, one large room that divides into two, and a separate cabin. There is a small pantry at the back with a water purifier.\n\nThe building has a lift, generator backup for the common areas, and covered parking for two cars at street level. Registration is set up for a registered company address.",
    listing_type: "rent",
    property_type: "office",
    status: "published",
    is_available: true,
    price: 38000,
    price_period: "month",
    negotiable: true,
    city: "Bengaluru",
    locality: "HSR Layout",
    private_address:
      "Second floor, Fictional Business Centre, 22 Example Road, HSR Layout, Bengaluru 560102",
    internal_notes:
      "Owner will consider a 9-month term at a 5% discount. Stacking only after the fit-out is confirmed.",
    owner_name: "Fictional Owner — HSR office",
    bedrooms: 2,
    bathrooms: 2,
    area_value: 1100,
    area_unit: "sqft",
    furnishing: "semi_furnished",
    amenities: ["Lift", "Power backup", "Parking", "CCTV", "Intercom", "Air conditioning"],
    map_link: "https://www.openstreetmap.org/search?query=HSR%20Layout%20Bengaluru",
    year_built: 2019,
    images: [
      { path: "/demo/office-1.svg", alt: "Open-plan office floor" },
      { path: "/demo/office-2.svg", alt: "Reception and pantry" },
    ],
    published_at: iso("2026-07-15T10:00:00Z"),
    created_at: iso("2026-07-11T12:00:00Z"),
  },
  {
    reference_code: "NSR-R-1004",
    title: "East-facing residential plot in Sarjapur Road",
    headline: "2,800 sq ft plot, clear title, boundary wall already in place.",
    description:
      "A rectangular east-facing plot in a laid-out residential layout with an internal road, a drainage line and street lighting already installed. The boundary wall is up on three sides.\n\nClear title and a completed conversion certificate from the layout authority. This is a plot: there is no building on it yet, and the photographs show the plot as it stands, not a finished home.",
    listing_type: "rent",
    property_type: "plot",
    status: "published",
    is_available: true,
    price: 32000,
    price_period: "month",
    negotiable: true,
    city: "Bengaluru",
    locality: "Sarjapur Road",
    private_address: "Plot 41, Fictional Layout, Sarjapur Road, Bengaluru 560103",
    internal_notes:
      "Land lease, not freehold. Make sure the tenant understands this before the visit.",
    owner_name: "Fictional Owner — Sarjapur plot",
    bedrooms: 0,
    bathrooms: 0,
    area_value: 2800,
    area_unit: "sqft",
    furnishing: "unfurnished",
    amenities: ["Power backup", "Rain water harvesting"],
    map_link: "https://www.openstreetmap.org/search?query=Sarjapur%20Road%20Bengaluru",
    year_built: null,
    images: [{ path: "/demo/plot-1.svg", alt: "Plotted land with boundary wall" }],
    published_at: iso("2026-07-20T10:00:00Z"),
    created_at: iso("2026-07-18T12:00:00Z"),
  },
  {
    reference_code: "NSR-S-2001",
    title: "Three-bedroom resale apartment in Indiranagar",
    headline: "Owner-occupied 3 BHK, single family since 2015.",
    description:
      "A three-bedroom apartment on the third floor, held by one family since it was built and used as their own home throughout. The kitchen and both bathrooms were redone in 2022, and the flooring was replaced at the same time.\n\nSold with the two covered parking bays and the society share. Society charges are current and there is no pending construction work in the wing.",
    listing_type: "resale",
    property_type: "apartment",
    status: "published",
    is_available: true,
    price: 14500000,
    price_period: "one_time",
    negotiable: true,
    city: "Bengaluru",
    locality: "Indiranagar",
    private_address:
      "Flat 303, Fictional Palm Court, 9 Example Road, Indiranagar, Bengaluru 560038",
    internal_notes:
      "Original purchase agreement available. Seller prefers a close by the end of the quarter.",
    owner_name: "Fictional Seller — Indiranagar 3BHK",
    bedrooms: 3,
    bathrooms: 3,
    area_value: 1450,
    area_unit: "sqft",
    furnishing: "semi_furnished",
    amenities: ["Lift", "Power backup", "Parking", "Security", "Gym", "Clubhouse", "Swimming pool"],
    map_link: "https://www.openstreetmap.org/search?query=Indiranagar%20Bengaluru",
    year_built: 2015,
    images: [
      { path: "/demo/resale-1.svg", alt: "Living area with original mouldings" },
      { path: "/demo/resale-2.svg", alt: "Redone kitchen" },
    ],
    published_at: iso("2026-07-24T10:00:00Z"),
    created_at: iso("2026-07-21T12:00:00Z"),
  },
  {
    reference_code: "NSR-S-2002",
    title: "Four-bedroom row house in Kokapet",
    headline: "Independent row house, private terrace, ground plus first.",
    description:
      "A ground-plus-first row house in a gated cluster of nineteen houses built by the same developer in one phase. There is a covered porch, a small private terrace at the rear, and a covered car park for two.\n\nThe house has been lightly used and is being sold because the family is moving abroad. The registration was done in 2018 and there is no loan outstanding.",
    listing_type: "sale",
    property_type: "row_house",
    status: "published",
    is_available: true,
    price: 21000000,
    price_period: "one_time",
    negotiable: false,
    city: "Hyderabad",
    locality: "Kokapet",
    private_address:
      "House 14, Fictional Grove, 5 Example Road, Kokapet, Hyderabad 500033",
    internal_notes: "NRI seller. Registry handled by the family’s own advocate in Hyderabad.",
    owner_name: "Fictional Seller — Kokapet row house",
    bedrooms: 4,
    bathrooms: 5,
    area_value: 3200,
    area_unit: "sqft",
    furnishing: "unfurnished",
    amenities: ["Parking", "Power backup", "Security", "Gym", "Children's play area", "Vaastu compliant"],
    map_link: "https://www.openstreetmap.org/search?query=Kokapet%20Hyderabad",
    year_built: 2018,
    images: [
      { path: "/demo/rowhouse-1.svg", alt: "Row house facade and porch" },
      { path: "/demo/rowhouse-2.svg", alt: "Rear terrace" },
    ],
    published_at: iso("2026-08-01T10:00:00Z"),
    created_at: iso("2026-07-29T12:00:00Z"),
  },
  {
    reference_code: "NSR-D-3001",
    title: "One-bedroom apartment in Baner",
    headline: "Newly listed — photography booked, not yet published.",
    description:
      "A one-bedroom apartment on the seventh floor, handed over last month and not yet occupied. The photographs have been booked but not taken, so this listing is still a draft and is not visible on the public site.",
    listing_type: "rent",
    property_type: "apartment",
    status: "draft",
    is_available: true,
    price: 28000,
    price_period: "month",
    negotiable: false,
    city: "Pune",
    locality: "Baner",
    private_address:
      "Flat 702, Fictional Heights, 18 Example Road, Baner, Pune 411045",
    internal_notes:
      "Do not publish until the photographs are uploaded and the society NOC is on file.",
    owner_name: "Fictional Owner — Baner 1BHK",
    bedrooms: 1,
    bathrooms: 1,
    area_value: 620,
    area_unit: "sqft",
    furnishing: "unfurnished",
    amenities: ["Lift", "Power backup", "Parking", "Security"],
    map_link: null,
    year_built: 2025,
    images: [],
    published_at: null,
    created_at: iso("2026-08-18T12:00:00Z"),
  },
];

export function buildDemoProperties(): StaffProperty[] {
  return LISTINGS.map((listing, index) => ({
    id: prop(index + 1),
    tenant_id: DEMO_TENANT_ID,
    reference_code: listing.reference_code,
    title: listing.title,
    headline: listing.headline,
    description: listing.description,
    listing_type: listing.listing_type,
    property_type: listing.property_type,
    status: listing.status,
    is_available: listing.is_available,
    price: listing.price,
    currency: "INR",
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
    published_at: listing.published_at,
    images: listing.images,
    created_at: listing.created_at,
    updated_at: listing.created_at,
  }));
}

export function buildDemoLeads(properties: StaffProperty[]): Lead[] {
  const p1 = properties.find((p) => p.reference_code === "NSR-R-1001");
  const p2 = properties.find((p) => p.reference_code === "NSR-S-2001");

  return [
    {
      id: lead(1),
      tenant_id: DEMO_TENANT_ID,
      property_id: p1?.id ?? null,
      assigned_to: DEMO_AGENT_ROHAN,
      full_name: "Priya Raman",
      phone: "+91 00000 00031",
      email: "priya.raman@example.invalid",
      message:
        "We are a couple looking to move to Koregaon Park before the end of the month. Is the society RWA manageable, and what does the owner say about the deposit?",
      source: "property_form",
      status: "visit_scheduled",
      preferred_contact: "whatsapp",
      preferred_visit_at: activityAt(3, 16, 0),
      consent_at: activityAt(-9, 19, 52),
      created_at: activityAt(-9, 19, 52),
      updated_at: activityAt(-7, 14, 40),
    },
    {
      id: lead(2),
      tenant_id: DEMO_TENANT_ID,
      property_id: p2?.id ?? null,
      assigned_to: DEMO_AGENT_FARAH,
      full_name: "Vikram Sethi",
      phone: "+91 00000 00032",
      email: null,
      message:
        "Saw the Indiranagar listing while looking at options in Bengaluru. The family is relocating in March. Please share the floor plan.",
      source: "property_form",
      status: "contacted",
      preferred_contact: "phone",
      preferred_visit_at: null,
      consent_at: activityAt(-8, 13, 35),
      created_at: activityAt(-8, 13, 35),
      updated_at: activityAt(-8, 17, 10),
    },
    {
      id: lead(3),
      tenant_id: DEMO_TENANT_ID,
      property_id: null,
      assigned_to: null,
      full_name: "Meera Iyer",
      phone: "+91 00000 00033",
      email: "meera.iyer@example.invalid",
      message:
        "Do you handle long-term rentals in Kokapet as well? Not urgent yet — I am still comparing agencies.",
      source: "contact_form",
      status: "new",
      preferred_contact: "email",
      preferred_visit_at: null,
      consent_at: activityAt(-6, 22, 18),
      created_at: activityAt(-6, 22, 18),
      updated_at: activityAt(-6, 22, 18),
    },
  ];
}

export function buildDemoNotes(): LeadNote[] {
  return [
    {
      id: note(1),
      lead_id: lead(1),
      author_id: DEMO_AGENT_ROHAN,
      body: "Called on WhatsApp, spoke for ten minutes. Family is pre-approved and wants a 24-month lease. Sending the society RWA figures and the carpet-area note from the builder.",
      created_at: activityAt(-9, 20, 35),
      author: null,
    },
    {
      id: note(2),
      lead_id: lead(1),
      author_id: DEMO_AGENT_ROHAN,
      body: "Owner confirmed: 24-month lease, deposit six months, one month notice. Owner will be present for the visit.",
      created_at: activityAt(-7, 14, 40),
      author: null,
    },
    {
      id: note(3),
      lead_id: lead(2),
      author_id: DEMO_AGENT_FARAH,
      body: "Left a voicemail. Seller's advocate has the floor plan; collecting it tomorrow. Buyer is in Bengaluru until Friday.",
      created_at: activityAt(-8, 17, 10),
      author: null,
    },
  ];
}

export function buildDemoStatusEvents(): LeadStatusEvent[] {
  return [
    {
      id: event(1),
      lead_id: lead(1),
      actor_id: DEMO_ADMIN_ID,
      from_status: "new",
      to_status: "contacted",
      created_at: activityAt(-9, 20, 1),
      actor: null,
    },
    {
      id: event(2),
      lead_id: lead(1),
      actor_id: DEMO_AGENT_ROHAN,
      from_status: "contacted",
      to_status: "qualified",
      created_at: activityAt(-8, 15, 30),
      actor: null,
    },
    {
      id: event(3),
      lead_id: lead(1),
      actor_id: DEMO_AGENT_ROHAN,
      from_status: "qualified",
      to_status: "visit_scheduled",
      created_at: activityAt(-1, 9, 12),
      actor: null,
    },
    {
      id: event(4),
      lead_id: lead(2),
      actor_id: DEMO_AGENT_FARAH,
      from_status: "new",
      to_status: "contacted",
      created_at: activityAt(-8, 17, 10),
      actor: null,
    },
  ];
}

export function buildDemoVisits(): Visit[] {
  // A visit is booked in the past and happens in the future, and both have to
  // stay that way whenever the fixtures are built: a fixed `created_at` would
  // drift against the relative `scheduled_start` and the visits board would
  // eventually show a visit booked after it was due.
  return [
    {
      id: visit(1),
      tenant_id: DEMO_TENANT_ID,
      lead_id: lead(1),
      property_id: prop(1),
      agent_id: DEMO_AGENT_ROHAN,
      scheduled_start: activityAt(2, 10, 30),
      scheduled_end: activityAt(2, 11, 15),
      status: "scheduled",
      outcome: null,
      internal_notes: "Owner has the keys; meet at the gate at 10:30.",
      created_by: DEMO_ADMIN_ID,
      created_at: activityAt(-1, 9, 12),
      updated_at: activityAt(-1, 9, 12),
    },
    {
      id: visit(2),
      tenant_id: DEMO_TENANT_ID,
      lead_id: lead(2),
      property_id: prop(5),
      agent_id: DEMO_AGENT_FARAH,
      scheduled_start: activityAt(5, 15, 0),
      scheduled_end: activityAt(5, 15, 45),
      status: "scheduled",
      outcome: null,
      internal_notes: "Buyer flying in from Pune. Seller's advocate joins at the flat.",
      created_by: DEMO_AGENT_FARAH,
      created_at: activityAt(-2, 10, 0),
      updated_at: activityAt(-2, 10, 0),
    },
  ];
}

/** Narrows a staff listing to the exact shape the public site may see. */
export function toPublicProperty(listing: StaffProperty): PublicProperty {
  return {
    id: listing.id,
    reference_code: listing.reference_code,
    title: listing.title,
    headline: listing.headline,
    description: listing.description,
    listing_type: listing.listing_type,
    property_type: listing.property_type,
    price: listing.price,
    currency: listing.currency,
    price_period: listing.price_period,
    negotiable: listing.negotiable,
    city: listing.city,
    locality: listing.locality,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    area_value: listing.area_value,
    area_unit: listing.area_unit,
    furnishing: listing.furnishing,
    amenities: listing.amenities,
    map_link: listing.map_link,
    year_built: listing.year_built,
    is_available: listing.is_available,
    published_at: listing.published_at,
    images: listing.images,
  };
}