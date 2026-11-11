import { Router } from 'express';
import type { Pool } from 'pg';
import {
  generateEmbedding,
  qualifyIntent,
} from '../services/ollama.service.js';

interface CatalogRow {
  id: number;
  ref_code: string;
  name: string;
  category: string;
  application_type: string;
  sensory_notes: string;
  is_natural: boolean | null;
  similarity: number;
}

interface CatalogMatch extends Omit<CatalogRow, 'similarity'> {
  similarity: number | null;
}

const categories = ['flavors', 'fragrances'];

export function createCatalogRouter(db: Pool) {
  const router = Router();

  router.post('/search', async (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const category = body.category;

    if (!query) {
      response.status(400).json({ error: 'Le champ query est requis.' });
      return;
    }
    if (
      category !== undefined &&
      (typeof category !== 'string' || !categories.includes(category))
    ) {
      response.status(400).json({
        error: 'category doit valoir flavors ou fragrances.',
      });
      return;
    }

    const qualification = await qualifyIntent(query, category);
    const searchText = [
      category,
      query,
      qualification.application,
      ...qualification.profile_tags,
    ]
      .filter(Boolean)
      .join('\n');
    const embedding = await generateEmbedding(searchText);
    const { rows } = await db.query<CatalogRow>(
      `SELECT id, ref_code, name, category, application_type, sensory_notes,
              is_natural, 1 - (embedding <=> $1::vector) AS similarity
         FROM catalog_items
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT 2`,
      [`[${embedding.join(',')}]`],
    );

    const matches: CatalogMatch[] = embedding.every((value) => value === 0)
      ? []
      : rows.map(({ similarity, ...item }) => ({
          ...item,
          similarity: Number.isFinite(similarity) ? similarity : null,
        }));

    response.json({
      qualification,
      bestMatch: matches[0] ?? null,
      alternative: matches[1] ?? null,
    });
  });

  return router;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
