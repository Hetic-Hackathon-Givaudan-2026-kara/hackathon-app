import pg from 'pg';
import { createEmbeddingClient, loadApiEnvironment } from './catalog-utils.js';

loadApiEnvironment();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL est requis (configurez-le dans api/.env).');
}

const queryText =
  process.argv.slice(2).join(' ').trim() ||
  'Fresh citrus and floral fragrance with a soft vanilla base';
const embed = createEmbeddingClient();
const queryVector = await embed(queryText);
if (queryVector === null) {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  throw new Error(
    `Ollama est indisponible à ${ollamaBaseUrl} : impossible de vectoriser la recherche.`,
  );
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const { rows } = await pool.query<{
    ref_code: string;
    name: string;
    category: string;
    application_type: string;
    similarity: number;
  }>(
    `SELECT ref_code, name, category, application_type,
            1 - (embedding <=> $1::vector) AS similarity
       FROM catalog_items
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 3`,
    [`[${queryVector.join(',')}]`],
  );

  if (rows.length < 3) {
    throw new Error(
      `Seulement ${rows.length} résultat(s) indexable(s) : lancez l’ingestion avec Ollama disponible.`,
    );
  }
  if (rows.some((item) => !Number.isFinite(item.similarity))) {
    throw new Error(
      'Les embeddings stockés ne permettent pas de calculer une similarité cosinus finie. Réingérez avec Ollama disponible.',
    );
  }

  console.log(`3 références les plus proches de « ${queryText} » :`);
  rows.forEach((item, index) => {
    console.log(
      `${index + 1}. ${item.ref_code} — ${item.name} (${item.category}, ${item.application_type}; similarité cosinus ${item.similarity.toFixed(4)})`,
    );
  });
} finally {
  await pool.end();
}
