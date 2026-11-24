/**
 * Express app: the JSON API, plus the static site when running locally.
 * On Vercel the static files are served by Vercel and only /api reaches this app.
 *
 * Every endpoint reads the local database only. Prices are labelled with their
 * source and date; nothing is presented as live.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { loadLegacyMedicines } from './medicines.js';
import { rateLimit } from './rateLimit.js';
import { searchProducts, suggest, sourceStatus, dataCounts, ceilingsFor, ceilingsForGroups, compositionLabel } from './catalog.js';
import { findAlternatives, loadProducts, CANDIDATE_SOURCE, BRAND_PRICE_SOURCE } from '../db/matching.js';
import { groupProducts } from '../lib/pharma/groups.js';
import { DISCLAIMER, RELEASE_CODES } from '../lib/pharma/match.js';
import { formulationKey } from '../lib/pharma/formulation.js';
import { formatStrength } from '../lib/pharma/strength.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Only these parts of the repository are served as the website. */
const PUBLIC_FILES = ['index.html', 'search.html', 'cart.html', 'favicon.svg'];
const PUBLIC_DIRS = ['css', 'js', 'lib', 'tests', 'data', 'docs/screenshots'];

const QUERY_RE = /^[\p{L}\p{N}\s+\-.,/%()'&]+$/u;
const ID_RE = /^\d{1,18}$/;
const STATUS_TTL_MS = 60_000;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function apiError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

function readQuery(req) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().replace(/\s+/g, ' ') : '';
  if (q.length < 2) throw new HttpError(400, 'QUERY_TOO_SHORT', 'Type at least 2 letters to search.');
  if (q.length > 60) throw new HttpError(400, 'QUERY_TOO_LONG', 'Search with at most 60 characters.');
  if (!QUERY_RE.test(q)) throw new HttpError(400, 'BAD_QUERY', 'Use letters, numbers, spaces and + only.');
  return q;
}

function readId(value) {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw new HttpError(400, 'BAD_ID', 'That medicine id is not valid.');
  return value;
}

/** Optional ?release= code: the release type a user read from their own strip. */
function readRelease(value) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !RELEASE_CODES.includes(value)) throw new HttpError(400, 'BAD_RELEASE', 'That release type is not valid.');
  return value;
}

/** Prices that someone other than the user vouches for: the two official lists, and packs checked by a person. */
const VERIFIED_PRICE_SOURCES = new Set([CANDIDATE_SOURCE, BRAND_PRICE_SOURCE, 'brand_review']);
/** The demo dataset fills unknown makers with this; it is not a manufacturer. */
const PLACEHOLDER_MANUFACTURERS = new Set(['sample pharma']);

const verifiedPrice = (price) => (price && price.type === 'mrp' && price.amount > 0 && VERIFIED_PRICE_SOURCES.has(price.sourceId) ? price : null);
const manufacturerOf = (p) => (p.manufacturer && !PLACEHOLDER_MANUFACTURERS.has(p.manufacturer.trim().toLowerCase()) ? p.manufacturer : null);

/** What a price comparison needs: each salt with its strength, the formulation key and the verified MRP. */
function comparisonFields(p) {
  const price = verifiedPrice(p.price);
  return {
    salts: (p.ingredients ?? []).map((i) => ({ name: i.name, strength: i.strength ? formatStrength(i.strength) : null, saltForm: i.saltForm ?? null })),
    formulationKey: formulationKey(p),
    price,
    priceStatus: price ? 'verified' : 'none',
    pack: p.pack ?? null, // known even when there is no price
    otherPacks: (p.otherPacks ?? []).map((x) => ({ label: x.packLabel, amount: x.amount, unitPrice: x.unitPrice })),
  };
}

/** Public shape of a product. Legacy demo prices are never included. */
export function productSummary(p) {
  return {
    id: String(p.id),
    name: p.name,
    productType: p.productType,
    isJanAushadhi: p.isJanAushadhi,
    jaDrugCode: p.jaDrugCode ?? null,
    manufacturer: manufacturerOf(p),
    sourceId: p.sourceId,
    verificationStatus: p.verificationStatus,
    composition: compositionLabel(
      (p.ingredients ?? []).map((i) => ({ name: i.name, value: i.strength?.value ?? null, unit: i.strength?.unit, perValue: i.strength?.perValue ?? null, perUnit: i.strength?.perUnit ?? null })),
    ) ?? p.compositionText ?? null,
    compositionText: p.compositionText ?? null,
    dosageForm: p.dosageForm ?? null,
    route: p.route ?? null,
    releaseType: p.releaseType ?? null,
    therapeuticGroup: p.therapeuticGroup ?? null,
    updatedAt: p.updatedAt ?? null,
    ...comparisonFields(p),
  };
}

/**
 * @param {{db:{query:Function}, serveStatic?:boolean, logger?:Pick<Console,'error'>, trustProxy?:boolean|number|string,
 *          rateLimitMax?:number}} options
 */
export function createApp({ db, serveStatic = false, logger = console, trustProxy = false, rateLimitMax = 60 }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false); // ETags are set explicitly where they are useful
  app.set('trust proxy', trustProxy);

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  let statusCache = null;
  const cachedStatus = async () => {
    if (statusCache && statusCache.expires > Date.now()) return statusCache.value;
    const [sources, counts] = await Promise.all([sourceStatus(db), dataCounts(db)]);
    const value = { sources, counts };
    statusCache = { value, expires: Date.now() + STATUS_TTL_MS };
    return value;
  };
  const sourceBrief = (sources, id) => {
    const s = sources.find((x) => x.id === id);
    return s ? { id: s.id, name: s.name, lastSuccessAt: s.lastSuccessAt, asOf: s.asOf, stale: s.stale, imported: s.imported, homepageUrl: s.homepageUrl } : null;
  };

  const api = express.Router();
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const limited = rateLimit({ max: rateLimitMax, message: 'Too many searches. Please wait a minute and try again.' });

  // Wraps async handlers: HttpErrors become JSON errors; anything else is logged and becomes a 503.
  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        apiError(res, error.status, error.code, error.message);
        return;
      }
      logger.error(`[api] ${req.method} ${req.path} failed:`, error.message);
      apiError(res, 503, 'DB_UNAVAILABLE', 'Medicine data is temporarily unavailable. Please try again shortly.');
    }
  };

  api.get('/health', async (req, res) => {
    try {
      await db.query('select 1');
      res.json({ ok: true, database: 'up' });
    } catch (error) {
      logger.error('[api] health check failed:', error.message);
      apiError(res, 503, 'DB_UNAVAILABLE', 'The database is not reachable.');
    }
  });

  api.get('/status', handle(async (req, res) => {
    const { sources, counts } = await cachedStatus();
    res.json({
      sources,
      counts,
      officialDataImported: counts.janAushadhiProducts > 0,
      note: 'Data is imported from official files on a schedule; it is not live.',
    });
  }));

  // One answer for a brand name or a salt name: comparison groups, each with its brands and matching generics.
  api.get('/search', limited, handle(async (req, res) => {
    const q = readQuery(req);
    const [found, { sources, counts }] = await Promise.all([searchProducts(db, q), cachedStatus()]);
    const { groups, other, notEquivalent } = groupProducts(found.products);
    const ceilings = counts.ceilingPrices > 0 ? await ceilingsForGroups(db, groups) : new Map();
    res.json({
      query: q,
      matchedBy: found.matchedBy,
      groups: groups.map(({ compositionKey, ...g }) => ({
        ...g,
        brands: g.brands.map(productSummary),
        generics: g.generics.map((x) => ({ product: productSummary(x.product), matches: x.matches })),
        ceilings: ceilings.get(g.key) ?? [],
      })),
      other: other.map(productSummary),
      notEquivalent,
      truncated: found.truncated,
      disclaimer: DISCLAIMER,
      sources: { janAushadhi: sourceBrief(sources, CANDIDATE_SOURCE), brandPrices: sourceBrief(sources, BRAND_PRICE_SOURCE), nppa: sourceBrief(sources, 'nppa_ceiling_prices') },
    });
  }));

  api.get('/suggest', limited, handle(async (req, res) => {
    res.json({ suggestions: await suggest(db, readQuery(req)) });
  }));

  api.get('/products', limited, handle(async (req, res) => {
    const ids = String(req.query.ids ?? '').split(',').filter(Boolean);
    if (!ids.length || ids.length > 50) throw new HttpError(400, 'BAD_IDS', 'Give between 1 and 50 ids.');
    ids.forEach(readId);
    const products = await loadProducts(db, ids);
    res.json({ products: products.filter((p) => p.isActive).map(productSummary) });
  }));

  api.get('/products/:id/alternatives', limited, handle(async (req, res) => {
    const id = readId(req.params.id);
    const stripRelease = readRelease(req.query.release);
    const result = await findAlternatives(db, id, { stripRelease });
    if (!result.product || !result.product.isActive) throw new HttpError(404, 'NOT_FOUND', 'This medicine is not in the database.');
    const [ceilings, { sources }] = await Promise.all([ceilingsFor(db, result.product), cachedStatus()]);
    res.json({
      product: productSummary(result.product),
      alternatives: result.alternatives.map((a) => ({ product: productSummary(a.product), status: a.status, reasons: a.reasons })),
      notEquivalent: result.notEquivalent,
      confirmedRelease: result.confirmedRelease,
      ceilings,
      disclaimer: DISCLAIMER,
      sources: { janAushadhi: sourceBrief(sources, 'pmbi_product_list'), nppa: sourceBrief(sources, 'nppa_ceiling_prices') },
    });
  }));

  // Phase 2 compatibility: the demo dataset in its original JSON shape (illustrative prices, clearly labelled).
  api.get('/medicines', handle(async (req, res) => {
    const payload = await loadLegacyMedicines(db);
    const etag = `"${payload.dataVersion}"`;
    res.set({ 'Cache-Control': 'no-cache', ETag: etag });
    if (req.get('If-None-Match') === etag) {
      res.status(304).end();
      return;
    }
    res.json(payload);
  }));

  api.use((req, res) => apiError(res, 404, 'NOT_FOUND', 'Unknown API endpoint.'));
  app.use('/api', api);

  if (serveStatic) {
    for (const file of PUBLIC_FILES) {
      app.get(file === 'index.html' ? ['/', '/index.html'] : `/${file}`, (req, res) => res.sendFile(path.join(ROOT, file)));
    }
    for (const dir of PUBLIC_DIRS) {
      app.use(`/${dir}`, express.static(path.join(ROOT, dir), { dotfiles: 'ignore', fallthrough: true }));
    }
  }

  app.use((req, res) => res.status(404).type('text/plain').send('Not found'));

  // Errors thrown outside the handlers above (e.g. a malformed URL).
  app.use((error, req, res, next) => {
    logger.error('[app] unhandled error:', error.message);
    if (res.headersSent) return next(error);
    if (req.path.startsWith('/api')) apiError(res, 500, 'INTERNAL', 'Something went wrong.');
    else res.status(500).type('text/plain').send('Something went wrong.');
  });

  return app;
}
