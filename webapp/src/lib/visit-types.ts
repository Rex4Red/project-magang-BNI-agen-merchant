export interface Prospect {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  category: string;
  photoUrl: string | null;
  url: string;
  classification?: {
    label: "potensial" | "non_potensial" | "unavailable";
    confidence: number | null;
    reason?: "no_photo" | "image_error" | "business_unknown" | "low_confidence" | "request_failed" | null;
    source?: "image_model" | "business_type";
    businessReason?: string | null;
  };
}

export interface Visit extends Prospect {
  visitId: string;
  status: "planned" | "visited";
  notes: string;
  phone?: string;
  pic?: string;
  businessId?: string;
  product?: string;
  financialInstitutions?: string;
  potential?: string;
  followUpNotes?: string;
  agentStatus?: "unknown" | "yes" | "no";
  agentProvider?: string;
  qrisStatus?: "unknown" | "yes" | "no";
  qrisProvider?: string;
  qrisProviders?: string[];
  edcStatus?: "unknown" | "yes" | "no";
  edcProviders?: string[];
  followUp?: string;
  prospectResult?: string;
  visitArea?: string;
  visitedAt?: string;
  updatedAt?: string;
  visitPhotos?: string[];
  locationAccuracy?: number;
  locationCapturedAt?: string;
}

export interface VisitList {
  id: string;
  name: string;
  area: string;
  source: { mode: "area" | "map" | "road"; selection?: "manual"; bounds?: string; polygon?: [number, number][]; road?: string; lengthMeters?: number; corridorMeters?: number };
  createdAt: string;
  updatedAt: string;
  stores: Visit[];
}
