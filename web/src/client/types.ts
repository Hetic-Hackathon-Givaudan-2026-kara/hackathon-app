export interface Qualification {
  category: 'Flavor' | 'Fragrance';
  application: string;
  profile_tags: string[];
  is_complete: boolean;
  followup_question: string | null;
}

export interface CatalogMatch {
  id: number;
  ref_code: string;
  name: string;
  category: string;
  application_type: string;
  sensory_notes: string;
  is_natural: boolean | null;
  similarity: number | null;
}

export interface CatalogSearchResponse {
  qualification: Qualification;
  bestMatch: CatalogMatch | null;
  alternative: CatalogMatch | null;
}

export type SampleStatus = 'Demandé' | 'Préparé' | 'Expédié';

export interface SampleRequest {
  id: number;
  reference_id: number;
  client_name: string | null;
  shipping_address: string;
  quantity: number | null;
  status: SampleStatus | null;
  created_at: string | null;
}

export interface CreateSampleRequest {
  reference_id: number;
  client_name: string | null;
  shipping_address: string;
  quantity: number;
}

export interface HealthResponse {
  status: string;
  db?: string;
}
