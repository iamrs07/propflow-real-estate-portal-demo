import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingFacet } from "@/lib/domain";

/**
 * Row shapes as stored by Supabase. Kept deliberately narrow: anything the
 * public site may read is marked, everything else is staff-only.
 */

export interface Agency {
  slug: string;
  name: string;
  tagline: string | null;
  about: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  office_address: string | null;
  service_areas: string[];
  map_link: string | null;
  privacy_contact_email: string | null;
  privacy_notes: string | null;
}

export interface PublicImage {
  path: string;
  alt: string;
}

/** Exactly the columns api_public_properties() is allowed to return. */
export interface PublicProperty {
  id: string;
  reference_code: string;
  title: string;
  headline: string | null;
  description: string | null;
  listing_type: "rent" | "sale" | "resale";
  property_type:
    | "apartment"
    | "villa"
    | "row_house"
    | "plot"
    | "office"
    | "shop"
    | "farmhouse";
  price: number;
  currency: string;
  price_period: "month" | "year" | "one_time";
  negotiable: boolean;
  city: string;
  locality: string;
  bedrooms: number | null;
  bathrooms: number | null;
  area_value: number | null;
  area_unit: "sqft" | "sqm" | "acre" | null;
  furnishing: "unfurnished" | "semi_furnished" | "furnished" | null;
  amenities: string[];
  map_link: string | null;
  year_built: number | null;
  /**
   * Always true on the public path — the RPC filters on it — but returned so a
   * cached or already-loaded card can state availability without guessing.
   */
  is_available: boolean;
  published_at: string | null;
  images: PublicImage[];
}

export interface StaffProperty extends Omit<PublicProperty, "is_available"> {
  tenant_id: string;
  status: "draft" | "published" | "archived";
  is_available: boolean;
  private_address: string | null;
  internal_notes: string | null;
  owner_name: string | null;
  lead_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string;
  full_name: string;
  role: "admin" | "agent";
  is_active: boolean;
  phone: string | null;
  title: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  tenant_id: string;
  property_id: string | null;
  assigned_to: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  message: string | null;
  source:
    | "property_form"
    | "contact_form"
    | "phone"
    | "walk_in"
    | "referral";
  status:
    | "new"
    | "contacted"
    | "qualified"
    | "visit_scheduled"
    | "negotiation"
    | "closed_won"
    | "closed_lost";
  preferred_contact: "phone" | "whatsapp" | "email";
  preferred_visit_at: string | null;
  consent_at: string;
  created_at: string;
  updated_at: string;
}

export interface LeadWithContext extends Lead {
  property: Pick<
    PublicProperty,
    "id" | "reference_code" | "title" | "locality" | "city"
  > | null;
  assignee: Pick<Profile, "id" | "full_name"> | null;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: Pick<Profile, "id" | "full_name"> | null;
}

export interface LeadStatusEvent {
  id: string;
  lead_id: string;
  actor_id: string | null;
  from_status: Lead["status"];
  to_status: Lead["status"];
  created_at: string;
  actor: Pick<Profile, "id" | "full_name"> | null;
}

export interface Visit {
  id: string;
  tenant_id: string;
  lead_id: string;
  property_id: string | null;
  agent_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  outcome:
    | "interested"
    | "offer_made"
    | "not_interested"
    | "follow_up_needed"
    | "no_response"
    | null;
  internal_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VisitWithContext extends Visit {
  lead: Pick<Lead, "id" | "full_name" | "phone" | "status"> | null;
  property: Pick<PublicProperty, "id" | "reference_code" | "title"> | null;
  agent: Pick<Profile, "id" | "full_name"> | null;
}

export interface PropertyFilters {
  /** Absent means "no text filter"; an empty string is normalised to null. */
  search?: string | null;
  /**
   * The visitor-facing Rent/Buy choice, not a stored subtype. "buy" matches both
   * `sale` and `resale`; see LISTING_FACET_TYPES in @/lib/domain.
   */
  listingFacet?: ListingFacet | null;
  propertyType?: string | null;
  locality?: string | null;
  city?: string | null;
  bedroomsMin?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface PublicListingResult {
  properties: PublicProperty[];
  total: number;
}

export interface DashboardCounts {
  newLeads: number;
  openLeads: number;
  scheduledVisits: number;
  publishedListings: number;
}

export type SupabaseClientLike = SupabaseClient;