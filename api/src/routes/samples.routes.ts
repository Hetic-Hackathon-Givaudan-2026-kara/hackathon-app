import { Router } from 'express';
import type { Pool } from 'pg';

const allowedStatuses = ['Demandé', 'Préparé', 'Expédié'];

export function createSamplesRouter(db: Pool) {
  const router = Router();

  router.post('/', async (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    if (
      hasUnexpectedFields(body, [
        'reference_id',
        'client_name',
        'shipping_address',
        'quantity',
      ])
    ) {
      response
        .status(400)
        .json({ error: 'La requête contient des champs inconnus.' });
      return;
    }

    const referenceId = body.reference_id;
    const clientName = body.client_name;
    const shippingAddress =
      typeof body.shipping_address === 'string'
        ? body.shipping_address.trim()
        : '';
    const quantity = body.quantity === undefined ? 1 : body.quantity;

    if (
      typeof referenceId !== 'number' ||
      !Number.isInteger(referenceId) ||
      referenceId < 1
    ) {
      response.status(400).json({
        error: 'reference_id doit être un entier positif.',
      });
      return;
    }
    if (
      clientName !== undefined &&
      clientName !== null &&
      (typeof clientName !== 'string' || clientName.trim().length > 100)
    ) {
      response.status(400).json({
        error: 'client_name doit être une chaîne de 100 caractères maximum.',
      });
      return;
    }
    if (!shippingAddress) {
      response.status(400).json({ error: 'shipping_address est requis.' });
      return;
    }
    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      response.status(400).json({
        error: 'quantity doit être un entier positif.',
      });
      return;
    }

    const { rows: references } = await db.query(
      'SELECT id FROM catalog_items WHERE id = $1',
      [referenceId],
    );
    if (references.length === 0) {
      response.status(404).json({ error: 'Référence catalogue introuvable.' });
      return;
    }

    const { rows } = await db.query(
      `INSERT INTO sample_requests
        (reference_id, client_name, shipping_address, quantity)
       VALUES ($1, $2, $3, $4)
       RETURNING id, reference_id, client_name, shipping_address, quantity, status, created_at`,
      [
        referenceId,
        typeof clientName === 'string' ? clientName.trim() || null : null,
        shippingAddress,
        quantity,
      ],
    );
    response.status(201).json(rows[0]);
  });

  router.get('/:id', async (request, response) => {
    const id = parseId(request.params.id);
    if (id === null) {
      response.status(400).json({ error: 'id doit être un entier positif.' });
      return;
    }

    const { rows } = await db.query(
      `SELECT id, reference_id, client_name, shipping_address, quantity, status, created_at
         FROM sample_requests
        WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      response
        .status(404)
        .json({ error: 'Commande d’échantillon introuvable.' });
      return;
    }
    response.json(rows[0]);
  });

  router.patch('/:id/status', async (request, response) => {
    const id = parseId(request.params.id);
    if (id === null) {
      response.status(400).json({ error: 'id doit être un entier positif.' });
      return;
    }

    const body = isRecord(request.body) ? request.body : {};
    if (hasUnexpectedFields(body, ['status'])) {
      response
        .status(400)
        .json({ error: 'La requête contient des champs inconnus.' });
      return;
    }
    const status = body.status;
    if (typeof status !== 'string' || !allowedStatuses.includes(status)) {
      response.status(400).json({
        error: 'status doit valoir Demandé, Préparé ou Expédié.',
      });
      return;
    }

    const { rows } = await db.query(
      `UPDATE sample_requests
          SET status = $1
        WHERE id = $2
        RETURNING id, reference_id, client_name, shipping_address, quantity, status, created_at`,
      [status, id],
    );
    if (rows.length === 0) {
      response
        .status(404)
        .json({ error: 'Commande d’échantillon introuvable.' });
      return;
    }
    response.json(rows[0]);
  });

  return router;
}

function parseId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasUnexpectedFields(
  body: Record<string, unknown>,
  allowed: string[],
): boolean {
  return Object.keys(body).some((field) => !allowed.includes(field));
}
