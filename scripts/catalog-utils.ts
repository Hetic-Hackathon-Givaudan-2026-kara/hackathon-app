import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EMBEDDING_DIMENSIONS = 768;

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OLLAMA_EMBEDDINGS_URL = 'http://localhost:11434/api/embeddings';
const EMBEDDING_MODEL = 'nomic-embed-text';

export interface CatalogItem {
  refCode: string;
  name: string;
  category: string;
  applicationType: string;
  sensoryNotes: string;
  isNatural: boolean;
}

type RawCatalogRecord = Record<string, unknown>;

export function loadCatalog(): {
  items: CatalogItem[];
  source: string;
} {
  const csvPath = resolve(PROJECT_ROOT, 'data/raw_catalog.csv');
  if (existsSync(csvPath)) {
    const records = parseCsv(readFileSync(csvPath, 'utf8'));
    return {
      items: records.map(normalizeRecord),
      source: 'data/raw_catalog.csv',
    };
  }

  const jsonPath = resolve(PROJECT_ROOT, 'data/raw_catalog.json');
  if (!existsSync(jsonPath)) {
    throw new Error(
      'Catalogue introuvable : ajoutez data/raw_catalog.csv ou data/raw_catalog.json.',
    );
  }

  const parsed: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error('data/raw_catalog.json doit contenir un tableau.');
  }

  return {
    items: parsed.map((record: unknown) =>
      normalizeRecord(asRecord(record, 'Entrée JSON')),
    ),
    source: 'data/raw_catalog.json',
  };
}

export function loadApiEnvironment(): void {
  const envFile = resolve(PROJECT_ROOT, 'api/.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

export function parseCsv(contents: string): RawCatalogRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];
    if (quoted) {
      if (character === '"' && contents[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && contents[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV invalide : guillemet non fermé.');
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...data] = rows;
  if (!header || header.length === 0) {
    throw new Error('CSV invalide : en-tête manquant.');
  }

  const normalizedHeader = header.map((column, index) =>
    (index === 0 ? column.replace(/^\uFEFF/, '') : column).trim(),
  );
  return data.map((values) =>
    Object.fromEntries(
      normalizedHeader.map((column, index) => [column, values[index] ?? '']),
    ),
  );
}

export function normalizeRecord(record: RawCatalogRecord): CatalogItem {
  const rawRefCode = getString(record, 'ref_code', 'id');
  const name = getString(record, 'name');
  if (!rawRefCode || !name) {
    throw new Error(
      'Chaque référence doit avoir un ref_code (ou id) et un nom.',
    );
  }
  const refCode = compactRefCode(rawRefCode);

  const category = getString(record, 'category', 'family') || 'Arôme';
  const applicationType =
    getString(record, 'application_type', 'concentration') || 'Fragrance';
  const sensoryNotes =
    getString(record, 'sensory_notes') ||
    [
      getString(record, 'notes'),
      getString(record, 'top_notes'),
      getString(record, 'heart_notes'),
      getString(record, 'base_notes'),
      getString(record, 'description'),
    ]
      .filter(Boolean)
      .join(' | ');

  if (!sensoryNotes) {
    throw new Error(
      `La référence ${refCode} ne contient aucune note sensorielle.`,
    );
  }
  if (name.length > 255) {
    throw new Error(
      `Le nom de la référence ${refCode} dépasse 255 caractères.`,
    );
  }
  if (category.length > 50 || applicationType.length > 100) {
    throw new Error(
      `La référence ${refCode} a une catégorie ou application trop longue.`,
    );
  }

  return {
    refCode,
    name,
    category,
    applicationType,
    sensoryNotes,
    isNatural: parseBoolean(record.is_natural ?? record.natural, true, refCode),
  };
}

function compactRefCode(refCode: string): string {
  if (refCode.length <= 50) return refCode;
  const suffix = createHash('sha256')
    .update(refCode)
    .digest('hex')
    .slice(0, 12);
  return `${refCode.slice(0, 37)}-${suffix}`;
}

export function createEmbeddingClient(): (
  text: string,
) => Promise<number[] | null> {
  let unavailable = false;

  return async (text) => {
    if (unavailable) return null;

    let response: Response;
    try {
      response = await fetch(OLLAMA_EMBEDDINGS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (isNetworkFailure(error)) {
        unavailable = true;
        return null;
      }
      throw error;
    }

    if (!response.ok) {
      throw new Error(
        `Ollama embeddings : ${response.status} ${await response.text()}`,
      );
    }

    const payload: unknown = await response.json();
    const embedding = asRecord(payload, 'Réponse Ollama').embedding;
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
  };
}

export function zeroEmbedding(): number[] {
  return Array<number>(EMBEDDING_DIMENSIONS).fill(0);
}

function getString(record: RawCatalogRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function parseBoolean(
  value: unknown,
  fallback: boolean,
  refCode: string,
): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (['true', '1', 'yes', 'oui'].includes(value.toLowerCase())) return true;
    if (['false', '0', 'no', 'non'].includes(value.toLowerCase())) return false;
  }
  throw new Error(`Valeur is_natural invalide pour la référence ${refCode}.`);
}

function asRecord(value: unknown, label: string): RawCatalogRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} doit être un objet.`);
  }
  return value as RawCatalogRecord;
}

function isNetworkFailure(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === 'TimeoutError')
  );
}
