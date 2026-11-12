import { Router } from 'express';
import type { Pool } from 'pg';
import {
  generateEmbedding,
  qualifyIntent,
  suggestCatalogRefinement,
} from '../services/ollama.service.js';
import type { IntentQualification } from '../services/ollama.service.js';

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
const MINIMUM_ALTERNATIVE_SIMILARITY = 0.62;

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

    let qualification: IntentQualification;
    if (body.action === 'skip' || body.skipRefinement === true) {
      const previousQualification = parseQualification(body.qualification);
      if (!previousQualification) {
        response.status(400).json({
          error: 'La qualification à conserver est invalide.',
        });
        return;
      }
      qualification = {
        ...previousQualification,
        is_complete: true,
        followup_question: null,
      };
    } else {
      qualification = await qualifyIntent(query, category);
      if (qualification.is_complete) {
        qualification = { ...qualification, followup_question: null };
      }
    }

    if (!qualification.is_complete) {
      if (
        qualification.followup_question &&
        wasQuestionAlreadyAsked(query, qualification.followup_question)
      ) {
        qualification.followup_question = await suggestCatalogRefinement(
          query,
          qualification,
        );
      }
      response.json({ qualification, bestMatch: null, alternative: null });
      return;
    }

    const userContext = query
      .split(/\r?\n/u)
      .filter((line) => !line.startsWith('Question de suivi posée : '))
      .map((line) => line.replace(/^Réponse de l’utilisateur : /u, ''))
      .join('\n');
    const searchText = [
      qualification.category,
      userContext,
      qualification.application,
      ...qualification.profile_tags,
    ]
      .filter(Boolean)
      .join('\n');
    const embedding = await generateEmbedding(searchText);
    if (embedding.every((value) => value === 0)) {
      throw new Error(
        'Ollama est indisponible : impossible de rechercher dans le catalogue.',
      );
    }

    const applicationKeywords =
      qualification.application.match(/[\p{L}\p{N}]{4,}/gu) ?? [];
    const { rows } = await db.query<CatalogRow>(
      `WITH catalog_candidates AS (
         SELECT id, ref_code, name, category, application_type, sensory_notes,
                is_natural, 1 - (embedding <=> $1::vector) AS similarity,
                NULLIF($2, '') IS NOT NULL AND (
                  application_type ILIKE '%' || $2 || '%'
                  OR application_type ILIKE ANY($3::text[])
                ) AS application_match
           FROM catalog_items
          WHERE embedding IS NOT NULL
            AND (
              (
                $4 = 'flavors'
                AND application_type IN ('Prête à boire', 'Poudre à mélanger')
                AND ref_code NOT LIKE 'fragrance-%'
              )
              OR (
                $4 = 'fragrances'
                AND (
                  application_type NOT IN ('Prête à boire', 'Poudre à mélanger')
                  OR ref_code LIKE 'fragrance-%'
                )
              )
            )
       )
       SELECT id, ref_code, name, category, application_type, sensory_notes,
              is_natural,
              similarity * CASE WHEN application_match THEN 1 ELSE 0.85 END AS similarity
         FROM catalog_candidates
        WHERE NULLIF($2, '') IS NULL
           OR application_match
           OR (
             $4 = 'flavors'
             AND NOT EXISTS (
               SELECT 1 FROM catalog_candidates WHERE application_match
             )
           )
        ORDER BY application_match DESC, similarity DESC
        LIMIT 2`,
      [
        `[${embedding.join(',')}]`,
        qualification.application,
        applicationKeywords.map((keyword) => `%${keyword}%`),
        qualification.category === 'Flavor' ? 'flavors' : 'fragrances',
      ],
    );

    const matches: CatalogMatch[] = rows.map(({ similarity, ...item }) => ({
      ...item,
      similarity: Number.isFinite(similarity) ? similarity : null,
    }));
    const alternativeCandidate = matches[1];
    const alternative =
      alternativeCandidate?.similarity !== null &&
      alternativeCandidate?.similarity !== undefined &&
      alternativeCandidate.similarity >= MINIMUM_ALTERNATIVE_SIMILARITY
        ? alternativeCandidate
        : null;

    if (matches.length === 0) {
      qualification = {
        ...qualification,
        is_complete: false,
        followup_question: await suggestCatalogRefinement(query, qualification),
      };
    }

    response.json({
      qualification,
      bestMatch: matches[0] ?? null,
      alternative,
    });
  });

  return router;
}

function wasQuestionAlreadyAsked(prompt: string, question: string): boolean {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[?!.,]/gu, '')
      .trim();
  const previousQuestions =
    prompt.match(/^Question de suivi posée : (.+)$/gmu) ?? [];
  const normalizedQuestion = normalize(question);
  return previousQuestions.some(
    (previous) =>
      normalize(previous.replace(/^Question de suivi posée : /u, '')) ===
      normalizedQuestion,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseQualification(value: unknown): IntentQualification | null {
  if (!isRecord(value)) return null;
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
    return null;
  }
  return {
    category,
    application,
    profile_tags,
    is_complete,
    followup_question,
  };
}
