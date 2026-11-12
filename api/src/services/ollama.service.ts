const QUALIFICATION_MODEL = 'qwen2.5:1.5b-instruct-q4_K_M';
const EMBEDDING_MODEL = 'nomic-embed-text';
const EMBEDDING_DIMENSIONS = 768;

export class OllamaUnavailableError extends Error {
  readonly status = 503;

  constructor(message: string) {
    super(message);
    this.name = 'OllamaUnavailableError';
  }
}

export interface IntentQualification {
  category: 'Flavor' | 'Fragrance';
  application: string;
  profile_tags: string[];
  is_complete: boolean;
  followup_question: string | null;
}

const qualificationFormat = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: ['Flavor', 'Fragrance'] },
    application: { type: 'string' },
    profile_tags: { type: 'array', items: { type: 'string' } },
    is_complete: { type: 'boolean' },
    followup_question: { type: ['string', 'null'] },
  },
  required: [
    'category',
    'application',
    'profile_tags',
    'is_complete',
    'followup_question',
  ],
  additionalProperties: false,
};

export async function qualifyIntent(
  prompt: string,
  category?: string,
): Promise<IntentQualification> {
  const context = category ? `Catégorie souhaitée : ${category}.\n` : '';
  const promptCategory = detectFlavorCategory(prompt)
    ? 'Flavor'
    : category === 'flavors'
      ? 'Flavor'
      : category === 'fragrances'
        ? 'Fragrance'
        : null;
  const payload = await postOllama('/api/chat', {
    model: QUALIFICATION_MODEL,
    stream: false,
    format: qualificationFormat,
    messages: [
      {
        role: 'system',
        content:
          'Tu es un interlocuteur-aromaticien Givaudan, chaleureux et naturel, qui échange avec le client pour comprendre son besoin; tu ne conduis pas un questionnaire. Tu qualifies exclusivement des demandes de recherche d’arômes ou de fragrances. ' +
          'Définis category à Flavor si le texte mentionne un arôme, le goût, une boisson, une saveur ou une protéine; ne demande jamais à l’utilisateur de choisir entre arôme et fragrance lorsque ces indices sont présents. ' +
          'Reste strictement dans le domaine d’application explicitement indiqué par l’utilisateur : ne propose jamais une application sans rapport et ne bascule jamais vers les boissons, le vin ou le champagne si la demande concerne un autre produit. ' +
          'Extrais l’application et les descripteurs sensoriels déjà exprimés, puis indique si une piste pertinente peut être proposée avec les informations disponibles. N’invente aucune contrainte absente du brief. Les champs volume, prix, allergènes et contraintes sont facultatifs et ne sont pas un formulaire à compléter. ' +
          'Le brief peut contenir l’historique de l’échange : prends en compte les informations déjà données, ne répète pas les questions et ne redemande rien qui a déjà été précisé. ' +
          'Par défaut, is_complete vaut true dès que tu peux proposer une première piste, même si certains détails manquent. Ne pose au maximum qu’une seule question, seulement si une ambiguïté bloque réellement une recommandation utile; ne demande pas les informations une par une. Sinon, définis followup_question à null et laisse la conversation avancer. ' +
          'Si une précision est vraiment bloquante, pose une question courte, contextualisée et naturelle; ne transforme pas le volume, le prix, les allergènes ou les préférences techniques en checklist. ' +
          'Ne pose jamais de méta-question générique telle que « Voulez-vous des options ? » ou « Voulez-vous que je vous aide ? ». N’ajoute pas de question marketing, commerciale, sportive ou destinée au grand public. ' +
          'Réponds uniquement avec un objet JSON conforme au schéma demandé.',
      },
      { role: 'user', content: `${context}${prompt}` },
    ],
    options: { temperature: 0 },
  });

  const message = getRecord(payload, 'message');
  if (typeof message.content !== 'string') {
    throw new Error(
      'Ollama n’a pas renvoyé le contenu de qualification attendu.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(message.content);
  } catch (error) {
    throw new Error(
      'Ollama a renvoyé une qualification qui n’est pas du JSON.',
      {
        cause: error,
      },
    );
  }

  const extractedData = validateQualification(parsed);
  const qualification: IntentQualification = {
    ...extractedData,
    category: promptCategory ?? extractedData.category,
  };

  return qualification;
}

export async function suggestCatalogRefinement(
  prompt: string,
  qualification: IntentQualification,
): Promise<string> {
  const previousQuestions = prompt.match(/^Question de suivi posée : (.+)$/gmu);
  const payload = await postOllama('/api/chat', {
    model: QUALIFICATION_MODEL,
    stream: false,
    messages: [
      {
        role: 'system',
        content:
          'Tu es un interlocuteur-aromaticien chaleureux. Aucun résultat exact n’a été trouvé dans le catalogue limité. Réponds comme dans une conversation, sans transformer cet échec en questionnaire : reconnais le besoin, propose une piste voisine ou une façon simple d’ajuster le profil, puis invite le client à réagir avec ses propres mots. ' +
          'Ne demande pas le volume, le prix ou les allergènes pour débloquer la recherche. Ne répète pas les informations déjà données et ne pose au maximum qu’une seule question si une précision est réellement indispensable. Une suggestion ou invitation peut être formulée sans point d’interrogation.',
      },
      {
        role: 'user',
        content: [
          `Brief et réponses du client :\n${prompt}`,
          `Catégorie : ${qualification.category}`,
          `Application : ${qualification.application || 'non précisée'}`,
          `Profil : ${qualification.profile_tags.join(', ') || 'non précisé'}`,
          previousQuestions?.length
            ? `Questions déjà posées :\n${previousQuestions.join('\n')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    options: { temperature: 0.4 },
  });

  const message = getRecord(payload, 'message');
  if (typeof message.content !== 'string' || !message.content.trim()) {
    throw new Error(
      'Ollama n’a pas renvoyé la question de précision attendue.',
    );
  }
  const question = message.content.trim();
  const normalizedQuestion = normalizeIntentText(question).replace(
    /[?!.,]/gu,
    '',
  );
  if (
    previousQuestions?.some(
      (previous) =>
        normalizeIntentText(
          previous.replace(/^Question de suivi posée : /u, ''),
        ).replace(/[?!.,]/gu, '') === normalizedQuestion,
    )
  ) {
    console.warn(
      'Ollama a répété une question de suivi : question alternative utilisée.',
    );
    return getFallbackRefinementQuestion(prompt, qualification);
  }
  return question;
}

function getFallbackRefinementQuestion(
  prompt: string,
  qualification: IntentQualification,
): string {
  const context = normalizeIntentText(prompt);
  if (
    qualification.category === 'Flavor' &&
    /\b(?:boisson|drink|beverage)\b/u.test(context) &&
    !/\b(?:prete? a boire|poudre|diluer|ready to drink|rtd)\b/u.test(context)
  ) {
    return 'Je peux déjà chercher une piste pour votre boisson; le format prêt à boire ou en poudre permettra ensuite d’affiner la sélection.';
  }
  if (qualification.category === 'Fragrance') {
    if (!/\b(?:rince|rincage|leave on|rinse off)\b/u.test(context)) {
      return 'Je vais partir de votre application et de votre profil; le mode rincé ou non rincé pourra affiner la sélection ensuite.';
    }
    return 'Je peux aussi orienter la recherche vers une facette plus fraîche, florale ou boisée selon votre préférence.';
  }
  if (
    !/\b(?:traitement thermique|chaleur|pasteuris|uht|cuisson)\b/u.test(context)
  ) {
    return 'Le traitement thermique pourra affiner la sélection si c’est un enjeu pour votre produit.';
  }
  if (!/\b(?:amertume|amer|masquage|masquer)\b/u.test(context)) {
    return 'Si l’amertume est un point sensible, je peux aussi rechercher une note qui aide à l’équilibrer.';
  }
  if (!/\b(?:solubilite|soluble|dissolution|dissoudre)\b/u.test(context)) {
    return 'La solubilité peut également servir à affiner la piste si elle est importante pour votre produit.';
  }
  return 'Je peux ajuster la note, la douceur ou l’intensité selon la direction qui vous convient le mieux.';
}

function detectFlavorCategory(prompt: string): boolean {
  const normalizedPrompt = normalizeIntentText(prompt);
  return /\b(?:arome|gout|boisson|saveur|proteine)\b/u.test(normalizedPrompt);
}

function normalizeIntentText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const payload = await postOllama('/api/embeddings', {
    model: EMBEDDING_MODEL,
    prompt: text,
  });

  if (!isRecord(payload) || !Array.isArray(payload.embedding)) {
    throw new Error('Ollama n’a pas renvoyé un tableau embedding.');
  }
  const embedding = payload.embedding;
  if (
    !Array.isArray(embedding) ||
    embedding.length !== EMBEDDING_DIMENSIONS ||
    !embedding.every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    )
  ) {
    throw new Error(
      `Ollama doit renvoyer un embedding numérique de ${EMBEDDING_DIMENSIONS} dimensions.`,
    );
  }

  return embedding;
}

async function postOllama(
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  let response: Response;
  try {
    response = await fetch(`${ollamaBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new OllamaUnavailableError(
        'Ollama ne répond pas après 30 secondes. Vérifiez que le service est démarré.',
      );
    }
    if (error instanceof TypeError) {
      throw new OllamaUnavailableError(
        'Impossible de joindre Ollama depuis l’API. Vérifiez que le service est démarré et que OLLAMA_BASE_URL est correct.',
      );
    }
    throw error;
  }

  if (!response.ok) {
    if (response.status === 404 && typeof body.model === 'string') {
      throw new OllamaUnavailableError(
        `Le modèle Ollama « ${body.model} » est introuvable. Téléchargez-le avec « ollama pull ${body.model} ».`,
      );
    }
    throw new Error(
      `Ollama ${path} : ${response.status} ${await response.text()}`,
    );
  }

  return response.json();
}

function validateQualification(value: unknown): IntentQualification {
  if (!isRecord(value)) {
    throw new Error('La qualification Ollama doit être un objet JSON.');
  }

  const expectedKeys = [
    'category',
    'application',
    'profile_tags',
    'is_complete',
    'followup_question',
  ];
  if (
    Object.keys(value).length !== expectedKeys.length ||
    expectedKeys.some((key) => !(key in value))
  ) {
    throw new Error(
      'La qualification Ollama ne respecte pas le schéma strict.',
    );
  }

  const {
    category,
    application,
    profile_tags,
    is_complete,
    followup_question,
  } = value;
  if (
    (category !== 'Flavor' && category !== 'Fragrance') ||
    typeof application !== 'string' ||
    !Array.isArray(profile_tags) ||
    !profile_tags.every((tag) => typeof tag === 'string') ||
    typeof is_complete !== 'boolean' ||
    (typeof followup_question !== 'string' && followup_question !== null)
  ) {
    throw new Error('La qualification Ollama contient des champs invalides.');
  }

  return {
    category,
    application,
    profile_tags,
    is_complete,
    followup_question,
  };
}

function getRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value) || !(label in value) || !isRecord(value[label])) {
    throw new Error(`La réponse Ollama ne contient pas l’objet ${label}.`);
  }
  return value[label];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
