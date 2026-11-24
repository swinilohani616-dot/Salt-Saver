/**
 * Ingredient reference data in the database.
 *
 * loadReferenceData(db): writes db/reference/ingredients.js into ingredients and
 *   ingredient_aliases (source saltsaver_curated). If an earlier import created an
 *   ingredient under a name that is really an alias (e.g. the legacy seed's
 *   "amoxicillin"), its products are moved to the canonical ingredient and the
 *   duplicate is removed, so one medicine never ends up under two names.
 *
 * loadResolver(db): builds the name resolver from what is in the database.
 */
import { nameKey } from '../lib/pharma/text.js';
import { createIngredientResolver } from '../lib/pharma/ingredients.js';
import { CURATED_INGREDIENTS } from './reference/ingredients.js';

const SOURCE = 'saltsaver_curated';

async function mergeInto(tx, fromId, toId) {
  // Products that already list the canonical ingredient keep that row.
  await tx.query(
    `delete from product_ingredients d using product_ingredients k
      where d.ingredient_id = $1 and k.ingredient_id = $2 and k.product_id = d.product_id`,
    [fromId, toId],
  );
  const moved = await tx.query('update product_ingredients set ingredient_id = $2 where ingredient_id = $1 returning id', [fromId, toId]);
  await tx.query('update product_ingredients set equivalent_ingredient_id = $2 where equivalent_ingredient_id = $1', [fromId, toId]);
  await tx.query('update ingredient_aliases set ingredient_id = $2 where ingredient_id = $1', [fromId, toId]);
  await tx.query('delete from ingredients where id = $1', [fromId]);
  return moved.length;
}

/** @returns {Promise<{ingredients:number, aliases:number, merged:string[]}>} */
export async function loadReferenceData(db, list = CURATED_INGREDIENTS) {
  return db.transaction(async (tx) => {
    const stats = { ingredients: 0, aliases: 0, merged: [] };
    for (const item of list) {
      const key = nameKey(item.name);
      const [row] = await tx.query(
        `insert into ingredients (name, normalized_name, source_id, verification_status)
         values ($1, $2, $3, 'needs_review')
         on conflict (normalized_name) do update set name = excluded.name, source_id = excluded.source_id
         returning id`,
        [item.name, key, SOURCE],
      );
      stats.ingredients += 1;

      for (const [alias, type, saltForm] of item.aliases) {
        const aliasKey = nameKey(alias);
        const [dup] = await tx.query('select id from ingredients where normalized_name = $1', [aliasKey]);
        if (dup && String(dup.id) !== String(row.id)) {
          await mergeInto(tx, dup.id, row.id);
          stats.merged.push(`${aliasKey} -> ${key}`);
        }
        await tx.query(
          `insert into ingredient_aliases (ingredient_id, alias, normalized_alias, alias_type, salt_form, source_id)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (normalized_alias) do update set
             ingredient_id = excluded.ingredient_id, alias = excluded.alias,
             alias_type = excluded.alias_type, salt_form = excluded.salt_form, source_id = excluded.source_id`,
          [row.id, alias, aliasKey, type, saltForm ?? null, SOURCE],
        );
        stats.aliases += 1;
      }
    }
    await tx.query('update data_sources set last_checked_at = now(), last_success_at = now() where id = $1', [SOURCE]);
    await tx.query(
      `insert into sync_logs (source_id, job, status, message, stats, finished_at)
       values ($1, 'seed', 'succeeded', 'Loaded ingredient reference list', $2::jsonb, now())`,
      [SOURCE, JSON.stringify(stats)],
    );
    return stats;
  });
}

/** Resolver over the ingredients and aliases currently in the database. */
export async function loadResolver(db) {
  const ingredients = await db.query('select normalized_name as key, name from ingredients');
  const aliases = await db.query(
    `select a.normalized_alias as alias, i.normalized_name as key, a.salt_form as "saltForm"
       from ingredient_aliases a join ingredients i on i.id = a.ingredient_id`,
  );
  return createIngredientResolver({ ingredients, aliases });
}
