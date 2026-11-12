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
  price: string | null;
  minimumVolume: string | null;
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
  category?: 'flavors' | 'fragrances';
  action?: 'skip';
  qualification?: Qualification;
}

export async function submitBriefAndMatch(
  message: string,
  brief: LiveBrief,
  scenarioId: string | null,
): Promise<BriefMatchResponse> {
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
    return mockBriefAndMatch(message, brief, scenarioId);
  }

  const updatedBrief = { ...brief };
  updateExplicitBriefFields(message, updatedBrief);
  const query = [
    message,
    ...briefFields
      .filter((field) => updatedBrief[field] !== null)
      .map((field) => `${field}: ${updatedBrief[field]}`),
  ].join('\n');
  const category =
    /\b(?:parfum|fragrance|savon|shampoing|cosmetique|cr[eè]me|lotion)\b/iu.test(
      query,
    )
      ? 'fragrances'
      : 'flavors';
  const result = await searchCatalog(query, { category });
  updatedBrief.application =
    result.qualification.application || updatedBrief.application;
  updatedBrief.profil_olfactif =
    result.qualification.profile_tags.join(', ') ||
    updatedBrief.profil_olfactif;
  const candidates = [result.bestMatch, result.alternative].filter(
    (match): match is NonNullable<typeof match> => match !== null,
  );
  const recommendations = candidates.map((match) => ({
    id: match.ref_code,
    name: match.name,
    justification: match.sensory_notes,
    price: null,
    minimumVolume: null,
  }));
  const assistantMessage = result.qualification.followup_question
    ? `Je comprends votre demande. Pour vous orienter vers une piste vraiment adaptée, ${result.qualification.followup_question.charAt(0).toLocaleLowerCase('fr')}${result.qualification.followup_question.slice(1)}`
    : recommendations.length
      ? `D’accord, je comprends : vous cherchez ${updatedBrief.profil_olfactif ?? 'un profil sensoriel à définir'} pour ${updatedBrief.application ?? 'votre application'}. J’ai trouvé ${recommendations.length === 1 ? 'une première piste' : 'quelques pistes'} à explorer. Le prix et le volume minimum seront à confirmer par Givaudan.`
      : 'Je comprends votre besoin. Je ne trouve pas encore de piste suffisamment proche dans le catalogue disponible; vous pouvez me décrire le profil recherché avec vos propres mots.';

  return {
    brief: updatedBrief,
    assistantMessage,
    recommendations,
    scenarioId: scenarioId ?? 'api',
    requestedField: null,
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
  updateExplicitBriefFields(message, brief);
  const notedDetails = explicitBriefSummary(message, brief);
  return {
    brief,
    assistantMessage: isNewBrief
      ? `D’accord, je comprends : vous cherchez ${scenario.profil_olfactif.toLocaleLowerCase('fr')} pour ${scenario.application.toLocaleLowerCase('fr')}. Je vais partir de ce profil et regarder les pistes disponibles.${notedDetails ? ` J’ai aussi noté ${notedDetails}.` : ''} Voici déjà quelques propositions à explorer.`
      : notedDetails
        ? `Merci, je le prends en compte : ${notedDetails}. Ça affine bien la recherche. Voici les pistes qui correspondent le mieux à votre demande.`
        : 'Je garde votre besoin en tête et je vous propose les pistes les plus proches. Vous pouvez me donner d’autres détails naturellement, si vous le souhaitez.',
    recommendations: scenario.recommendations,
    scenarioId: scenario.id,
    requestedField: null,
  };
}

function findScenario(message: string): MockScenario {
  const normalizedMessage = message.toLocaleLowerCase('fr');
  const mentionsCitrus =
    /citron|citrus|agrumes?|zeste|bergamote|yuzu|pamplemousse|orange/u.test(
      normalizedMessage,
    );
  const mentionsProteinDrink = /boisson|protéin|poudre|sport/u.test(
    normalizedMessage,
  );

  if (mentionsCitrus && mentionsProteinDrink) {
    const citrusScenario = scenarioList.find(
      (scenario) => scenario.id === 'citrus-protein-drink',
    );
    if (citrusScenario) return citrusScenario;
  }

  return (
    scenarioList.find((scenario) =>
      scenario.keywords.some((keyword) =>
        normalizedMessage.includes(keyword.toLocaleLowerCase('fr')),
      ),
    ) ?? scenarioList[0]!
  );
}

function explicitBriefSummary(message: string, brief: LiveBrief): string {
  const normalizedMessage = message.toLocaleLowerCase('fr');
  const details: string[] = [];

  if (/\d[\d\s.,]*\s?(?:kg|tonnes?|litres?)\b/i.test(normalizedMessage)) {
    if (brief.volume) details.push(`un volume de ${brief.volume}`);
  }
  if (/€|euros?|prix|budget/i.test(normalizedMessage) && brief.prix_cible) {
    details.push(`un prix cible de ${brief.prix_cible}`);
  }
  if (
    /allerg|sans\s+(?:gluten|lactose|arachide|soja|oeufs?)/i.test(
      normalizedMessage,
    ) &&
    brief.allergenes
  ) {
    details.push(brief.allergenes);
  }
  if (
    /naturel|bio|végét|veget|sans sucre|contraint|certifi/i.test(
      normalizedMessage,
    ) &&
    brief.contraintes
  ) {
    details.push(`la contrainte « ${brief.contraintes} »`);
  }

  return details.join(', ');
}

function updateExplicitBriefFields(message: string, brief: LiveBrief): void {
  const normalizedMessage = message.toLocaleLowerCase('fr');
  const fields: Array<'volume' | 'prix_cible' | 'allergenes' | 'contraintes'> =
    ['volume', 'prix_cible', 'allergenes', 'contraintes'];
  const fieldMatches: Record<
    'volume' | 'prix_cible' | 'allergenes' | 'contraintes',
    RegExp
  > = {
    volume: /\d[\d\s.,]*\s?(?:kg|tonnes?|litres?)\b/i,
    prix_cible: /€|euros?|prix|budget/i,
    allergenes: /allerg|sans\s+(?:gluten|lactose|arachide|soja|oeufs?)/i,
    contraintes:
      /naturel|bio(?:logique)?|végét|veget|sans sucre|contraint|certifi/i,
  };

  fields.forEach((field) => {
    if (fieldMatches[field].test(normalizedMessage)) {
      brief[field] = inferValue(message, field);
    }
  });
}

function inferValue(message: string, field: keyof LiveBrief): string {
  const trimmedMessage = message.trim();
  switch (field) {
    case 'volume':
      return (
        trimmedMessage.match(/\d[\d\s.,]*\s?(?:kg|tonnes?|litres?)\b/i)?.[0] ??
        trimmedMessage
      );
    case 'prix_cible':
      return (
        trimmedMessage.match(
          /(?:prix|budget)(?:\s+cible)?\s*(?:de|à|:)?\s*\d[\d\s.,]*(?:\s*(?:€|euros?)(?:\s*\/\s*kg)?)?/i,
        )?.[0] ??
        trimmedMessage.match(
          /\d[\d\s.,]*\s*(?:€|euros?)(?:\s*\/\s*kg)?/i,
        )?.[0] ??
        trimmedMessage
      );
    case 'allergenes': {
      if (/aucun(?:e)? allergène|sans allergènes?/i.test(trimmedMessage)) {
        return 'Aucun allergène déclaré';
      }
      const excludedAllergen = trimmedMessage.match(/sans\s+([^,.;!?]+)/i)?.[1];
      return excludedAllergen
        ? `Sans ${excludedAllergen.trim()}`
        : trimmedMessage;
    }
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
