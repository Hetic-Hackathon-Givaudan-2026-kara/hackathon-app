import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const FLAVORDB_ENTITY_URL =
  'https://cosylab.iiitd.edu.in/flavordb2/entities_json?id=';
const FLAVORDB_DETAIL_URL =
  'https://cosylab.iiitd.edu.in/flavordb2/entity_details?id=';
const FLAVORDB_LICENSE = 'CC BY-NC-SA 3.0';

const selectedEntities = [
  { id: 46, label: 'coffee' },
  { id: 162, label: 'apple' },
  { id: 167, label: 'banana' },
  { id: 190, label: 'mango' },
  { id: 194, label: 'orange' },
  { id: 201, label: 'peach' },
  { id: 233, label: 'raspberry' },
  { id: 234, label: 'strawberry' },
  { id: 240, label: 'lemon' },
  { id: 245, label: 'vanilla' },
  { id: 281, label: 'almond' },
  { id: 283, label: 'cocoa' },
  { id: 330, label: 'cinnamon' },
  { id: 333, label: 'ginger' },
  { id: 350, label: 'peppermint' },
  { id: 364, label: 'tomato' },
];

const frenchEntityNames: Record<number, string> = {
  46: 'Café',
  162: 'Pomme',
  167: 'Banane',
  190: 'Mangue',
  194: 'Orange',
  201: 'Pêche',
  233: 'Framboise',
  234: 'Fraise',
  240: 'Citron',
  245: 'Vanille',
  281: 'Amande',
  283: 'Cacao',
  330: 'Cannelle',
  333: 'Gingembre',
  350: 'Menthe poivrée',
  364: 'Tomate',
};

const frenchCategories: Record<string, string> = {
  'Beverage Caffeinated': 'Boisson caféinée',
  Fruit: 'Fruit',
  Berry: 'Fruit rouge',
  'Fruit Citrus': 'Agrume',
  'Fruit Essence': 'Extrait de fruit',
  Nut: 'Fruit à coque',
  Seed: 'Graine',
  Spice: 'Épice',
  Herb: 'Herbe aromatique',
  'Vegetable Fruit': 'Légume-fruit',
};

interface FlavorDbMolecule {
  common_name?: unknown;
  flavor_profile?: unknown;
  fema_flavor_profile?: unknown;
  fooddb_flavor_profile?: unknown;
}

interface FlavorDbEntity {
  entity_id?: unknown;
  category_readable?: unknown;
  entity_alias_readable?: unknown;
  molecules?: unknown;
}

interface CatalogRecord {
  ref_code: string;
  name: string;
  category: string;
  application_type: string;
  sensory_notes: string;
  is_natural: boolean;
  catalog_domain: 'Flavor';
  source_name: string;
  source_url: string;
  source_license: string;
  source_attribution: string;
}

const records: CatalogRecord[] = [];
for (let offset = 0; offset < selectedEntities.length; offset += 4) {
  const batch = selectedEntities.slice(offset, offset + 4);
  const imported = await Promise.all(batch.map(importEntity));
  records.push(...imported);
}

const output = resolve(PROJECT_ROOT, 'data/flavordb2_catalog.json');
await writeFile(output, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
console.log(`Généré ${records.length} références FlavorDB2 dans ${output}.`);

async function importEntity(
  selection: (typeof selectedEntities)[number],
): Promise<CatalogRecord> {
  const response = await fetch(`${FLAVORDB_ENTITY_URL}${selection.id}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `FlavorDB2 (${selection.label}, ID ${selection.id}) : ${response.status} ${await response.text()}`,
    );
  }

  const entity = asEntity(await response.json(), selection);
  if (!Array.isArray(entity.molecules)) {
    throw new Error(
      `FlavorDB2 (${selection.label}, ID ${selection.id}) ne fournit pas de molécules.`,
    );
  }
  const molecules = entity.molecules.map((value) =>
    asMolecule(value, selection),
  );
  const descriptors = uniqueTerms(
    molecules.flatMap((molecule) => [
      ...splitTerms(molecule.flavor_profile),
      ...splitTerms(molecule.fooddb_flavor_profile),
      ...splitTerms(molecule.fema_flavor_profile),
    ]),
  );
  const moleculeNames = [
    ...new Set(
      molecules
        .map((molecule) => text(molecule.common_name))
        .filter((name) => name.length > 0),
    ),
  ];
  if (descriptors.length === 0 || moleculeNames.length === 0) {
    throw new Error(
      `FlavorDB2 (${selection.label}, ID ${selection.id}) ne fournit pas assez de données sensorielles.`,
    );
  }

  const sourceName = requireText(
    entity.entity_alias_readable,
    'nom',
    selection,
  );
  const sourceCategory = requireText(
    entity.category_readable,
    'catégorie',
    selection,
  );
  const name = frenchEntityNames[selection.id] ?? sourceName;
  const category = frenchCategories[sourceCategory] ?? sourceCategory;
  const sourceUrl = `${FLAVORDB_DETAIL_URL}${selection.id}`;

  return {
    ref_code: `flavordb2-${selection.id}`,
    name,
    category,
    application_type: 'Ingrédient alimentaire',
    sensory_notes: [
      `Nom dans FlavorDB2 : ${sourceName}.`,
      `Descripteurs FlavorDB2 : ${descriptors.slice(0, 20).join(', ')}.`,
      `Molécules associées : ${moleculeNames.slice(0, 8).join(', ')}.`,
    ].join(' '),
    is_natural: true,
    catalog_domain: 'Flavor',
    source_name: 'FlavorDB2',
    source_url: sourceUrl,
    source_license: FLAVORDB_LICENSE,
    source_attribution: `FlavorDB2, IIIT-Delhi, entrée ${selection.id}. Adaptation SmartOrder sous ${FLAVORDB_LICENSE}.`,
  };
}

function asEntity(
  value: unknown,
  selection: (typeof selectedEntities)[number],
): FlavorDbEntity {
  if (!isRecord(value) || value.entity_id !== selection.id) {
    throw new Error(
      `Réponse FlavorDB2 invalide pour ${selection.label} (ID ${selection.id}).`,
    );
  }
  return value;
}

function asMolecule(
  value: unknown,
  selection: (typeof selectedEntities)[number],
): FlavorDbMolecule {
  if (!isRecord(value)) {
    throw new Error(
      `Molécule FlavorDB2 invalide pour ${selection.label} (ID ${selection.id}).`,
    );
  }
  return value;
}

function requireText(
  value: unknown,
  field: string,
  selection: (typeof selectedEntities)[number],
): string {
  const result = text(value);
  if (!result) {
    throw new Error(
      `FlavorDB2 ne fournit pas le champ ${field} pour ${selection.label} (ID ${selection.id}).`,
    );
  }
  return result;
}

function splitTerms(value: unknown): string[] {
  return typeof value === 'string'
    ? value
        .split('@')
        .map((term) => term.trim())
        .filter(Boolean)
    : [];
}

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
