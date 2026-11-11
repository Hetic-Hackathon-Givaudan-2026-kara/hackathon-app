const QUALIFICATION_MODEL = 'qwen2.5:1.5b-instruct-q4_K_M';
const EMBEDDING_MODEL = 'nomic-embed-text';
const EMBEDDING_DIMENSIONS = 768;

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

const fallbackQualification: IntentQualification = {
  category: 'Fragrance',
  application: '',
  profile_tags: [],
  is_complete: false,
  followup_question:
    'Pouvez-vous préciser l’application et le profil sensoriel souhaités ?',
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
          'Tu es un expert-aromaticien Givaudan. Tu qualifies exclusivement des demandes de recherche d’arômes ou de fragrances. ' +
          'Définis category à Flavor si le texte mentionne un arôme, le goût, une boisson, une saveur ou une protéine; ne demande jamais à l’utilisateur de choisir entre arôme et fragrance lorsque ces indices sont présents. ' +
          'Reste strictement dans le domaine d’application explicitement indiqué par l’utilisateur : ne propose jamais une application sans rapport et ne bascule jamais vers les boissons, le vin ou le champagne si la demande concerne un autre produit. ' +
          'Extrais l’application et les descripteurs sensoriels, puis indique si la demande est complète. N’invente aucune contrainte absente du brief. ' +
          'Un profil gustatif ou olfactif, une application et une fonction de masquage constituent trois critères clés. Dès qu’au moins deux de ces critères sont présents dans le brief, définis obligatoirement is_complete à true et followup_question à null. ' +
          'Si une précision est nécessaire, pose une seule question de suivi strictement technique, portant uniquement sur le mode de transformation, le masquage de l’amertume, la tolérance thermique, le pH ou la solubilité. ' +
          'Ne pose jamais de méta-question générique telle que « Voulez-vous des options ? », « Voulez-vous que je vous aide ? » ou une formulation équivalente. Ne pose aucune question marketing, commerciale, sportive ou destinée au grand public. Si aucune précision technique n’est nécessaire, définis followup_question à null. ' +
          'Réponds uniquement avec un objet JSON conforme au schéma demandé.',
      },
      { role: 'user', content: `${context}${prompt}` },
    ],
    options: { temperature: 0 },
  });

  if (payload === null) {
    console.warn('Ollama indisponible : qualification de secours utilisée.');
    return {
      ...fallbackQualification,
      category: promptCategory ?? fallbackQualification.category,
    };
  }

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
  const promptText = prompt.toLowerCase();
  const hasProfile =
    extractedData.profile_tags && extractedData.profile_tags.length > 0;
  const hasApplication =
    Boolean(extractedData.application) || promptText.includes('masquer');
  const qualification: IntentQualification = {
    ...extractedData,
    category: promptCategory ?? extractedData.category,
  };

  if (hasProfile && hasApplication) {
    qualification.is_complete = true;
    qualification.followup_question = null;
  }

  return qualification;
}

function detectFlavorCategory(prompt: string): boolean {
  const normalizedPrompt = prompt
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  return /\b(?:arome|gout|boisson|saveur|proteine)\b/u.test(normalizedPrompt);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const payload = await postOllama('/api/embeddings', {
    model: EMBEDDING_MODEL,
    prompt: text,
  });

  if (payload === null) {
    console.warn('Ollama indisponible : embedding nul utilisé.');
    return Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  }

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
): Promise<unknown | null> {
  let response: Response;
  try {
    const ollamaBaseUrl =
      process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    response = await fetch(`${ollamaBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (isOfflineFailure(error)) return null;
    throw error;
  }

  if (!response.ok) {
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

function isOfflineFailure(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === 'TimeoutError')
  );
}
