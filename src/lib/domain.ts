/**
 * Domain vocabulary. These unions mirror the PostgreSQL enums in
 * supabase/migrations/0001_schema.sql exactly — changing one without the other
 * will surface as a type error or a failed cast.
 */

export const APP_ROLES = ["admin", "agent"] as const;
export type AppRole = (typeof APP_ROLES)[number];

/**
 * `rent` is tenanted; `sale` is buying from a developer or the current owner;
 * `resale` is buying from the previous owner. These are the stored subtypes staff
 * pick on a listing. Kept in step with the PostgreSQL enum in
 * supabase/migrations/0001_schema.sql.
 *
 * Visitors do not choose a subtype — see LISTING_FACETS below.
 */
export const LISTING_TYPES = ["rent", "sale", "resale"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

/**
 * The two-way Rent / Buy choice shown to the public.
 *
 * "Buy" deliberately covers both purchase subtypes. A visitor looking to buy a
 * home does not know or care whether the seller is the original developer or the
 * previous owner, and offering them a "Resale" button next to "Buy" reads as
 * though resale were a different market. The stored type is preserved for staff
 * reporting; it is simply not a thing a visitor has to choose.
 */
export const LISTING_FACETS = ["rent", "buy"] as const;
export type ListingFacet = (typeof LISTING_FACETS)[number];

/** Which stored listing types each public facet matches. Empty facet = no filter. */
export const LISTING_FACET_TYPES: Record<ListingFacet, readonly ListingType[]> = {
  rent: ["rent"],
  buy: ["sale", "resale"],
};

/**
 * Query-string values accepted for the public listing-type filter.
 *
 * `sale` and `resale` are legacy aliases kept so older links and bookmarks keep
 * working: each now widens to the whole Buy facet rather than pinning a subtype,
 * because that is what a visitor following such a link was looking for. Only the
 * canonical facet names are written back into generated URLs.
 */
export const LISTING_FACET_ALIASES: Record<string, ListingFacet> = {
  rent: "rent",
  buy: "buy",
  sale: "buy",
  resale: "buy",
};

/** True when a listing type belongs to the Buy facet. */
export function isPurchaseType(type: ListingType): boolean {
  return type !== "rent";
}

export const PROPERTY_TYPES = [
  "apartment",
  "villa",
  "row_house",
  "plot",
  "office",
  "shop",
  "farmhouse",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_STATUSES = ["draft", "published", "archived"] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "visit_scheduled",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "property_form",
  "contact_form",
  "phone",
  "walk_in",
  "referral",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const CONTACT_PREFERENCES = ["phone", "whatsapp", "email"] as const;
export type ContactPreference = (typeof CONTACT_PREFERENCES)[number];

export const VISIT_STATUSES = ["scheduled", "completed", "cancelled", "no_show"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const VISIT_OUTCOMES = [
  "interested",
  "offer_made",
  "not_interested",
  "follow_up_needed",
  "no_response",
] as const;
export type VisitOutcome = (typeof VISIT_OUTCOMES)[number];

export const FURNISHING = ["unfurnished", "semi_furnished", "furnished"] as const;
export type Furnishing = (typeof FURNISHING)[number];

export const AREA_UNITS = ["sqft", "sqm", "acre"] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

export const PRICE_PERIODS = ["month", "year", "one_time"] as const;
export type PricePeriod = (typeof PRICE_PERIODS)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  visit_scheduled: "Visit scheduled",
  negotiation: "Negotiation",
  closed_won: "Closed — won",
  closed_lost: "Closed — lost",
};

/** Leads still in play; what "open" means on the dashboard. */
export const OPEN_LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "visit_scheduled",
  "negotiation",
];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  property_form: "Property enquiry form",
  contact_form: "Contact form",
  phone: "Phone",
  walk_in: "Walk-in",
  referral: "Referral",
};

export const CONTACT_PREFERENCE_LABELS: Record<ContactPreference, string> = {
  phone: "Phone call",
  whatsapp: "WhatsApp",
  email: "Email",
};

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/** Staff-facing labels for the stored listing subtypes. */
export const LISTING_TYPE_LABELS: Record<ListingType, string> = {
  rent: "Rent",
  sale: "Buy — new",
  resale: "Buy — resale",
};

/** Visitor-facing labels for the Rent / Buy choice. */
export const LISTING_FACET_LABELS: Record<ListingFacet, string> = {
  rent: "Rent",
  buy: "Buy",
};

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: "Apartment",
  villa: "Villa",
  row_house: "Row house",
  plot: "Plot",
  office: "Office",
  shop: "Shop",
  farmhouse: "Farmhouse",
};

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

export const VISIT_OUTCOME_LABELS: Record<VisitOutcome, string> = {
  interested: "Interested",
  offer_made: "Offer made",
  not_interested: "Not interested",
  follow_up_needed: "Needs follow-up",
  no_response: "No response",
};

export const FURNISHING_LABELS: Record<Furnishing, string> = {
  unfurnished: "Unfurnished",
  semi_furnished: "Semi furnished",
  furnished: "Furnished",
};

export const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  sqft: "sq ft",
  sqm: "sq m",
  acre: "acre",
};

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "locality", label: "Locality A–Z" },
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export const AMENITY_CHOICES = [
  "Lift",
  "Power backup",
  "Parking",
  "Security",
  "Gym",
  "Swimming pool",
  "Clubhouse",
  "Children's play area",
  "CCTV",
  "Intercom",
  "Balcony",
  "Furnished kitchen",
  "Modular kitchen",
  "Wardrobe",
  "Air conditioning",
  "Piped gas",
  "Rain water harvesting",
  "Vaastu compliant",
] as const;

export const BEDROOM_CHOICES = [1, 2, 3, 4, 5] as const;