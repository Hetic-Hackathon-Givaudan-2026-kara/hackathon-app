import mockData from '../../data/mock.json';
import type {
  CatalogSearchResponse,
  CreateSampleRequest,
  HealthResponse,
  Qualification,
  SampleRequest,
} from '../types';

export interface LiveBrief {
  application: string | null;
  profil_olfactif: string | null;
  volume: string | null;
  prix_cible: string | null;
  allergenes: string | null;
  contraintes: string | null;
}

export interface Recommendation {
  id: string;
  name: string;
  justification: string;
  price: string;
  minimumVolume: string;
}

export interface BriefMatchResponse {
  brief: LiveBrief;
  assistantMessage: string;
  recommendations: Recommendation[];
  scenarioId: string;
  requestedField: keyof LiveBrief | null;
}

interface MockScenario {
  id: string;
  title: string;
  keywords: string[];
  application: string;
  profil_olfactif: string;
  followup: string;
  recommendations: Recommendation[];
}

const briefFields: Array<keyof LiveBrief> = [
  'application',
  'profil_olfactif',
  'volume',
  'prix_cible',
  'allergenes',
  'contraintes',
];
const scenarioList = mockData.scenarios as MockScenario[];

interface SearchOptions {
  action?: 'skip';
  qualification?: Qualification;
}

export async function submitBriefAndMatch(
  message: string,
  brief: LiveBrief,
  scenarioId: string | null,
  requestedField: keyof LiveBrief | null,
): Promise<BriefMatchResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
    return mockBriefAndMatch(message, brief, scenarioId, requestedField);
  }

  const updatedBrief = await request<LiveBrief>('/api/brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, brief }),
  });
  const match = await request<{
    recommendations: Recommendation[];
    assistantMessage: string;
  }>('/api/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief: updatedBrief }),
  });

  return {
    brief: updatedBrief,
    assistantMessage: match.assistantMessage,
    recommendations: match.recommendations,
    scenarioId: scenarioId ?? 'api',
    requestedField: nextBriefField(updatedBrief),
  };
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

function mockBriefAndMatch(
  message: string,
  currentBrief: LiveBrief,
  currentScenarioId: string | null,
  requestedField: keyof LiveBrief | null,
): BriefMatchResponse {
  const scenario =
    (currentScenarioId &&
      scenarioList.find((item) => item.id === currentScenarioId)) ||
    findScenario(message);
  const isNewBrief = !currentScenarioId;
  const brief: LiveBrief = isNewBrief
    ? {
        application: scenario.application,
        profil_olfactif: scenario.profil_olfactif,
        volume: null,
        prix_cible: null,
        allergenes: null,
        contraintes: null,
      }
    : { ...currentBrief };
  const fieldToUpdate = isNewBrief
    ? inferField(message)
    : (requestedField ?? nextBriefField(brief));

  if (fieldToUpdate && brief[fieldToUpdate] === null) {
    brief[fieldToUpdate] = inferValue(message, fieldToUpdate);
  }

  const nextField = nextBriefField(brief);
  return {
    brief,
    assistantMessage: nextField
      ? followupFor(nextField, scenario)
      : 'Merci, votre brief est complet. Voici trois références à explorer.',
    recommendations: scenario.recommendations,
    scenarioId: scenario.id,
    requestedField: nextField,
  };
}

function findScenario(message: string): MockScenario {
  const normalizedMessage = message.toLocaleLowerCase('fr');
  return (
    scenarioList.find((scenario) =>
      scenario.keywords.some((keyword) =>
        normalizedMessage.includes(keyword.toLocaleLowerCase('fr')),
      ),
    ) ?? scenarioList[0]!
  );
}

function nextBriefField(brief: LiveBrief): keyof LiveBrief | null {
  return briefFields.find((field) => brief[field] === null) ?? null;
}

function inferField(message: string): keyof LiveBrief | null {
  const normalizedMessage = message.toLocaleLowerCase('fr');
  if (
    /\d/.test(normalizedMessage) &&
    /\b(kg|tonne|tonnes|litre|litres)\b/.test(normalizedMessage)
  ) {
    return 'volume';
  }
  if (/€|euros?|prix|budget/.test(normalizedMessage)) return 'prix_cible';
  if (
    /allerg|sans (?:gluten|lactose|arachide)|aucun allerg/.test(
      normalizedMessage,
    )
  ) {
    return 'allergenes';
  }
  if (/naturel|bio|végét|veget|sans sucre|contraint/.test(normalizedMessage)) {
    return 'contraintes';
  }
  return null;
}

function inferValue(message: string, field: keyof LiveBrief): string {
  const trimmedMessage = message.trim();
  const amount = trimmedMessage.match(
    /\d[\d\s.,]*(?:\s?(?:kg|tonnes?|litres?|€|euros?))?/i,
  );
  switch (field) {
    case 'volume':
      return amount?.[0] ?? trimmedMessage;
    case 'prix_cible':
      return amount?.[0] ?? trimmedMessage;
    case 'allergenes':
      return /(?:sans (?:allergènes?|allergenes?)|aucun allergène|aucune allergène)/i.test(
        trimmedMessage,
      )
        ? 'Aucun allergène déclaré'
        : trimmedMessage;
    case 'contraintes': {
      const tags = [
        /naturel(?:le)?/i,
        /bio(?:logique)?/i,
        /végétal(?:e)?/i,
        /sans sucre/i,
        /certifi(?:é|e|cation)/i,
      ]
        .map((pattern) => trimmedMessage.match(pattern)?.[0])
        .filter((tag): tag is string => Boolean(tag));
      return tags.length ? tags.join(', ') : trimmedMessage;
    }
    case 'application':
    case 'profil_olfactif':
      return trimmedMessage;
  }
}

function followupFor(field: keyof LiveBrief, scenario: MockScenario): string {
  switch (field) {
    case 'volume':
      return scenario.followup;
    case 'prix_cible':
      return 'Avez-vous un prix cible indicatif par kilogramme ?';
    case 'allergenes':
      return 'Y a-t-il des allergènes à exclure de la formule ?';
    case 'contraintes':
      return 'Avez-vous d’autres contraintes (naturel, certification ou procédé) ?';
    case 'application':
      return 'Dans quelle application ce profil sera-t-il utilisé ?';
    case 'profil_olfactif':
      return 'Quelles notes souhaitez-vous retrouver dans ce profil ?';
  }
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
