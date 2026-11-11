import { readFile } from 'node:fs/promises';
import pg from 'pg';
import {
  createEmbeddingClient,
  loadApiEnvironment,
  loadCatalog,
  zeroEmbedding,
} from './catalog-utils.js';

loadApiEnvironment();

const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const { items, source } = loadCatalog();
if (items.length === 0) throw new Error(`Le catalogue ${source} est vide.`);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL est requis (configurez-le dans api/.env).');
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const embed = createEmbeddingClient();
let warnedOffline = false;
let inserted = 0;

try {
  await pool.query(schema);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let offset = 0; offset < items.length; offset += 4) {
      const batch = items.slice(offset, offset + 4);
      const prepared = await Promise.all(
        batch.map(async (item) => {
          const vector = await embed(item.sensoryNotes);
          if (vector === null && !warnedOffline) {
            console.warn(
              'Ollama est indisponible : les références sans embedding utiliseront un vecteur nul.',
            );
            warnedOffline = true;
          }
          return { item, vector: vector ?? zeroEmbedding() };
        }),
      );

      const parameters: unknown[] = [];
      const tuples = prepared.map(({ item, vector }) => {
        const start = parameters.length + 1;
        parameters.push(
          item.refCode,
          item.name,
          item.category,
          item.applicationType,
          item.sensoryNotes,
          item.isNatural,
          `[${vector.join(',')}]`,
        );
        return `($${start}, $${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6}::vector)`;
      });
      const result = await client.query(
        `INSERT INTO catalog_items
          (ref_code, name, category, application_type, sensory_notes, is_natural, embedding)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (ref_code) DO NOTHING`,
        parameters,
      );
      inserted += result.rowCount ?? 0;
      if (
        (offset + batch.length) % 100 === 0 ||
        offset + batch.length === items.length
      ) {
        console.log(
          `Ingestion : ${offset + batch.length}/${items.length} références traitées.`,
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  console.log(`${inserted} référence(s) ajoutée(s) depuis ${source}.`);
} finally {
  await pool.end();
}
