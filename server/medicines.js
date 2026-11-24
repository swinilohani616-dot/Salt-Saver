/**
 * Builds the payload the frontend has always read from data/sample-data.json,
 * now from the database. Phase 2 keeps the shape identical so the app behaves
 * exactly as before; later phases replace this with the search API.
 */
import { createHash } from 'node:crypto';
import { SCHEMA_VERSION } from '../js/config.js';

const LEGACY_MEDICINES_SQL = `
  select b.source_key                as "id",
         b.name                      as "brandName",
         b.composition_text          as "activeSalt",
         bp.amount_inr::float8       as "brandPrice",
         g.name                      as "genericName",
         gp.amount_inr::float8       as "genericPrice",
         coalesce(b.manufacturer, '')      as "manufacturer",
         coalesce(b.therapeutic_group, '') as "category",
         coalesce(ps.label, '')            as "packSize",
         b.source_id                 as "source",
         b.verification_status       as "verificationStatus",
         m.status                    as "matchStatus",
         bp.price_type               as "priceType",
         to_char(greatest(b.updated_at, g.updated_at, bp.updated_at, gp.updated_at) at time zone 'UTC',
                 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "updatedAt"
    from match_results m
    join products b  on b.id = m.product_id and b.is_active
    join products g  on g.id = m.candidate_product_id and g.is_active
    join prices bp   on bp.product_id = b.id and bp.is_current and bp.source_id = 'legacy_json' and bp.price_type = 'illustrative'
    join prices gp   on gp.product_id = g.id and gp.is_current and gp.source_id = 'legacy_json' and gp.price_type = 'illustrative'
    left join pack_sizes ps on ps.id = bp.pack_size_id
   where m.method = 'legacy_json_pairing'
   order by b.id`;

const SOURCES_SQL = `
  select id, name, kind, notes,
         to_char(last_success_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "lastSuccessAt"
    from data_sources
   where id = 'legacy_json'`;

/**
 * @returns {Promise<{schemaVersion:number, dataVersion:string, note:string, sources:object[], medicines:object[]}>}
 */
export async function loadLegacyMedicines(db) {
  const [medicines, sources] = await Promise.all([db.query(LEGACY_MEDICINES_SQL), db.query(SOURCES_SQL)]);
  const dataVersion = createHash('sha256').update(JSON.stringify(medicines)).digest('hex').slice(0, 16);
  return {
    schemaVersion: SCHEMA_VERSION,
    dataVersion,
    note: sources[0]?.notes ?? '',
    sources,
    medicines,
  };
}
