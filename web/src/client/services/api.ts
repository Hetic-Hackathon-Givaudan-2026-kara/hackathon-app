import type {
  CatalogSearchResponse,
  CreateSampleRequest,
  HealthResponse,
  Qualification,
  SampleRequest,
} from '../types';

interface SearchOptions {
  action?: 'skip';
  qualification?: Qualification;
}

export async function checkApiHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health');
}

export async function searchCatalog(
  query: string,
  options?: SearchOptions,
): Promise<CatalogSearchResponse> {
  return request<CatalogSearchResponse>('/api/catalog/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, ...options }),
  });
}

export async function createSample(
  sample: CreateSampleRequest,
): Promise<SampleRequest> {
  return request<SampleRequest>('/api/samples', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sample),
  });
}

export async function getSample(id: number): Promise<SampleRequest> {
  return request<SampleRequest>(`/api/samples/${id}`);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`L’API a répondu avec le statut ${response.status}.`);
    }
    const message =
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `La requête a échoué (${response.status}).`;
    throw new Error(message);
  }

  const payload: unknown = await response.json();
  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
