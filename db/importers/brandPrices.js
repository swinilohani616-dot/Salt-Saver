/**
 * Brand price importer: official MRPs of branded medicines from NPPA's "Pharma Sahi Daam" page
 * (https://nppaipdms.gov.in/NPPA/PharmaSahiDaam/searchMedicine, "Medicine Price", search by formulation).
 *
 * Columns, as the results table shows them, plus the formulation that was searched and the dosage
 * forms the page offers for it:
 *   Medicine Name  "TELMA H 40/12.5 MG TABLET 15"
 *   Formulation    "TELMISARTAN + HYDROCHLOROTHIAZIDE"
 *   Dosage forms   "TABLET" or "TABLET; TABLET ER; TABLET SR"; blank if they were not looked up
 *   Status         Scheduled / Non-Scheduled
 *   Ceiling Price  per unit, excluding GST, or "Not Applicable"
 *   M.R.P / Unit   "356.72/15 TABLET"
 * Optional, filled in by the person preparing the file:
 *   Release type   IR, SR, ER, ... when the manufacturer or the pack states it; needs Evidence
 *   Evidence       where the release type was read (a manufacturer's page, or "pack seen by ...")
 *   Notes          anything the reviewer should know, e.g. how the formulation was established
 *
 * An MRP above the legal ceiling plus GST is out of date or wrong: the medicine is kept, its price is not.
 * Only tablets and capsules are imported. A listing gives a liquid's strength without its volume
 * ("120 MG SUSPENSION"), so two liquids cannot be compared safely.
 */
import { compositionKey } from '../../lib/pharma/composition.js';
import { prepText } from '../../lib/pharma/text.js';
import { detectDosageForm, detectReleaseType, routeForForm } from '../../lib/pharma/forms.js';
import { RELEASE_CODES } from '../../lib/pharma/match.js';
import { UNIT_BASIS, unitPrice } from '../../lib/pharma/pack.js';
import { normalizeText } from '../../js/core/normalize.js';
import { GST_RATE_FOR_CEILING_CHECK } from '../../js/core/unitSavings.js';
import { upsertProducts, setProductIngredients, upsertPacks, setCurrentPrices, deactivateProducts, linkRecords } from '../catalog.js';
import { BRAND_PRICE_SOURCE } from '../matching.js';
import { parseRupees } from './pmbi.js';

export const SOURCE_ID = BRAND_PRICE_SOURCE;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const LISTING = /^(.*?[A-Z].*?)\s+((?:\d+(?:\.\d+)?\s*\/\s*)*\d+(?:\.\d+)?)\s*(MG|MCG|GM|G|IU)\s+([A-Z][A-Z ]*?)\s+(\d+)(?:\s*(ML|GM|G))?$/i;
const MRP = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*([A-Z][A-Z ]*)?$/i;
/** Solid oral forms only, with the release types NPPA names. SL (under the tongue) and VT (vaginal) are not swallowed. */
const SOLID_FORM = /^(?:(?:gelatin coated |film coated )?tablet|(?:softgel )?capsule)(?: (?:sr|er|xr|xl|pr|cr|mr|dr|ir|dt|md))?$/;
const LARGEST_RETAIL_PACK = 150;
const MODIFIED = /\b(sr|er|xr|xl|pr|cr|mr|dr|tr|modified release)\b/;

/** Salts whose ordinary tablets are usually enteric coated, so "TABLET" does not say how they release. */
const OFTEN_ENTERIC = ['aspirin', 'pantoprazole', 'omeprazole', 'esomeprazole', 'rabeprazole', 'lansoprazole', 'dexlansoprazole', 'ilaprazole',
  'diclofenac', 'naproxen', 'ketoprofen', 'indomethacin', 'mesalazine', 'mesalamine', 'sulfasalazine', 'sodium valproate', 'valproate', 'divalproex',
  'divalproex sodium', 'erythromycin', 'bisacodyl', 'pancreatin', 'mycophenolate', 'mycophenolate sodium', 'duloxetine', 'serratiopeptidase',
  'trypsin', 'chymotrypsin', 'bromelain', 'methenamine', 'potassium chloride'];
/** Letters after a brand name that can mean a modified release, without saying which. */
const UNCLEAR_SUFFIX = /\b(od|la|tr|xt|retard|dsr|oros|chrono|depot|long)\b/;

/**
 * The release type a listing supports, or null when it does not say.
 *   "TABLET SR"                                                     -> sr
 *   "TABLET", and NPPA lists no other release for the formulation   -> ir
 *   "TABLET", one salt, and the same brand also lists its own "TABLET SR" -> ir (the company tells them apart)
 *   anything else                                                   -> null
 * Why so careful: Glycomet GP is listed as TABLET although its metformin is sustained release, Metolar XT
 * (extended release) is listed as TABLET with the same ceiling price as Metolar, and Ecosprin (enteric
 * coated) is listed as TABLET.
 */
export function releaseFromListing({ brand, dosage, formsListed, ingredientKeys, brandListsModified, entericKeys }) {
  const text = prepText(`${brand} ${dosage}`);
  const found = detectReleaseType(text, 'tablet');
  if (found.conflict || found.unread) return null;
  if (found.markers.length) return found.code;
  if (/\bir\b/.test(prepText(dosage))) return 'ir';
  if (UNCLEAR_SUFFIX.test(text) || ingredientKeys.some((k) => entericKeys.has(k))) return null;
  if (!formsListed.length) return null; // the other forms were not looked up
  if (!formsListed.some((f) => MODIFIED.test(prepText(f)))) return 'ir';
  return ingredientKeys.length === 1 && brandListsModified ? 'ir' : null;
}

const brandKey = (formulation, brand) => `${clean(formulation).toUpperCase()}|${clean(brand).toUpperCase()}`;

/** "TELMA H" -> "Telma H", "CROCIN PAIN RELIEF" -> "Crocin Pain Relief", "GLYCOMET GP" -> "Glycomet GP" */
const titleCase = (s) => s.split(' ').map((w, i) => (i > 0 && w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');

export const brandPriceAdapter = {
  sourceId: SOURCE_ID,
  label: 'Branded medicine MRPs (NPPA Pharma Sahi Daam)',
  keyLabel: 'listing',
  largeRemovalShare: 0.2,
  fields: {
    listing: { required: true, synonyms: ['Medicine Name', 'Medicine', 'Listing'] },
    formulation: { required: true, synonyms: ['Formulation', 'Formulation searched'] },
    forms: { required: true, synonyms: ['Dosage forms', 'Dosage forms listed', 'Dosage'] },
    status: { required: true, synonyms: ['Status'] },
    ceiling: { required: false, synonyms: ['Ceiling Price'] },
    mrp: { required: true, synonyms: ['M.R.P / Unit', 'MRP / Unit', 'MRP'] },
    release: { required: false, synonyms: ['Release type', 'Release'] },
    evidence: { required: false, synonyms: ['Evidence', 'Release evidence'] },
    notes: { required: false, synonyms: ['Notes', 'Note'] },
  },
  anchors: ['mrp'],
  reportColumns: [
    { field: 'name', label: 'Brand' },
    { field: 'packSize', label: 'Pack' },
    { field: 'mrp', label: 'MRP (₹)' },
    { field: 'compositionKey', label: 'Composition read as' },
    { field: 'dosageForm', label: 'Form' },
    { field: 'releaseType', label: 'Release' },
  ],

  /** Reads the whole file first: which brands list a modified-release form of a formulation under their own name. */
  prepare(rows) {
    const modified = new Set();
    for (const cell of rows) {
      const m = LISTING.exec(clean(cell('listing')).toUpperCase());
      if (m && MODIFIED.test(prepText(m[4]))) modified.add(brandKey(cell('formulation'), m[1]));
    }
    return { modified };
  },

  parseRow(cell, { resolver, file }) {
    const listing = clean(cell('listing')).toUpperCase();
    const formulation = clean(cell('formulation')).toUpperCase();
    const key = normalizeText(listing);
    const errors = [];
    const m = LISTING.exec(listing);
    if (!listing) errors.push('medicine name is empty');
    else if (!m) errors.push('brand, strength, dosage form and pack size could not all be read from the name');
    const price = MRP.exec(clean(cell('mrp')));
    if (!price) errors.push(`MRP "${clean(cell('mrp'))}" is not in the form "108.36/15 TABLET"`);
    if (errors.length) return { key, status: 'failed', errors };

    const [, brand, strengthText, unitText, dosage, packCount, volume] = m;
    if (Number(packCount) > LARGEST_RETAIL_PACK) return { key, status: 'failed', errors: [`a pack of ${packCount} is for dispensing, not sold to patients as it is`] };
    const dosageText = prepText(dosage);
    if (volume || !SOLID_FORM.test(dosageText)) return { key, status: 'failed', errors: [`"${dosage}" is not a tablet or capsule to swallow; its strength per ml or route is not stated`] };
    const dosageForm = detectDosageForm(dosageText).code;
    const listedMrp = Number(price[1]);
    const count = Number(price[2]);
    if (!(listedMrp > 0)) errors.push('the MRP is 0');
    if (count !== Number(packCount)) errors.push(`the name says a pack of ${packCount} but the MRP is for ${count}`);

    const ingredients = [];
    const salts = formulation.split('+').map(clean).filter(Boolean);
    const strengths = strengthText.split('/').map((s) => Number(s));
    const unit = unitText.toLowerCase() === 'gm' ? 'g' : unitText.toLowerCase();
    if (salts.length !== strengths.length) errors.push(`${salts.length} salt(s) in "${formulation}" but ${strengths.length} strength(s) in the name`);
    else {
      salts.forEach((salt, i) => {
        const r = resolver.resolve(salt);
        if (!r?.known) errors.push(`salt "${salt}" is not recognised`);
        else ingredients.push({ key: r.key, name: r.name, saltForm: r.saltForm, strength: { value: strengths[i], unit, perValue: null, perUnit: null }, sourceText: salt });
      });
      if (new Set(ingredients.map((i) => i.key)).size !== ingredients.length) errors.push('the same salt is listed twice');
    }
    const scheduled = /^scheduled$/i.test(clean(cell('status')));
    const ceiling = parseRupees(clean(cell('ceiling')));
    const statedRelease = prepText(cell('release'));
    const evidence = clean(cell('evidence'));
    if (statedRelease && !RELEASE_CODES.includes(statedRelease)) errors.push(`release type "${clean(cell('release'))}" must be one of ${RELEASE_CODES.join(', ').toUpperCase()}`);
    if (statedRelease && !evidence) errors.push('a stated release type needs evidence: where was it read?');
    if (errors.length) return { key, status: 'failed', errors };

    const warnings = [];
    const tooHigh = scheduled && ceiling > 0 && listedMrp / count > ceiling * (1 + GST_RATE_FOR_CEILING_CHECK) * 1.01;
    const mrp = tooHigh ? null : listedMrp;
    if (tooHigh) warnings.push(`₹${(listedMrp / count).toFixed(2)} per unit is above the ceiling price ₹${ceiling} plus GST, so the listed MRP is out of date or wrong; no price is imported`);
    if (clean(cell('notes'))) warnings.push(clean(cell('notes')));
    const releaseType = statedRelease || releaseFromListing({
      brand,
      dosage,
      formsListed: cell('forms').split(/[;,]/).map(clean).filter(Boolean),
      ingredientKeys: ingredients.map((i) => i.key),
      brandListsModified: file?.modified.has(brandKey(formulation, brand)) ?? false,
      entericKeys: new Set(OFTEN_ENTERIC.map((n) => resolver.resolve(n)?.key).filter(Boolean)),
    });
    if (statedRelease) warnings.push(`release type ${statedRelease.toUpperCase()} from: ${evidence}`);
    if (!releaseType) warnings.push('the listing does not settle the release type; it is treated as unknown');
    if (ingredients.length > 1) warnings.push(`strengths are read in the order of the formulation: ${ingredients.map((i) => `${i.name} ${i.strength.value} ${unit}`).join(' + ')}`);

    const basis = UNIT_BASIS[dosageForm];
    const marker = releaseType && releaseType !== 'ir' && !new RegExp(`\\b${releaseType}\\b`, 'i').test(brand) ? ` ${releaseType.toUpperCase()}` : '';
    const form = dosageForm === 'capsule' ? 'Capsule' : dosageForm === 'dispersible_tablet' ? 'Dispersible Tablet' : dosageForm === 'mouth_dissolving_tablet' ? 'Mouth Dissolving Tablet' : 'Tablet';
    return {
      key,
      status: 'parsed',
      warnings,
      parsed: {
        listing,
        name: `${titleCase(brand)} ${strengthText.replace(/\s/g, '')} ${unit === 'iu' ? 'IU' : unit} ${form}${marker}`,
        compositionText: `${formulation} ${strengthText} ${unitText} ${dosage} (listed by NPPA as "${listing}")`,
        composition: { ok: true, ingredients, compositionKey: compositionKey(ingredients) },
        dosageForm,
        route: routeForForm(dosageForm),
        releaseType,
        packSize: `${count} ${basis}${count === 1 ? '' : 's'}`,
        pack: { count, unit: basis },
        mrp,
      },
    };
  },

  snapshot(p) {
    return {
      name: p.name,
      mrp: p.mrp,
      packSize: p.packSize,
      compositionKey: p.composition.compositionKey,
      dosageForm: p.dosageForm,
      releaseType: p.releaseType ?? null,
    };
  },

  async loadCurrent(tx) {
    const rows = await tx.query(
      `select p.source_key, p.name, p.composition_key, df.code as form, rt.code as release, ps.label as pack, pr.amount_inr::float8 as mrp
         from products p
         left join dosage_forms df on df.id = p.dosage_form_id
         left join release_types rt on rt.id = p.release_type_id
         left join prices pr on pr.product_id = p.id and pr.is_current and pr.source_id = $1 and pr.price_type = 'mrp'
         left join lateral (
           select label from pack_sizes s where s.product_id = p.id order by (s.id = pr.pack_size_id) desc nulls last, s.id desc limit 1
         ) ps on true
        where p.source_id = $1 and p.is_active`,
      [SOURCE_ID],
    );
    return new Map(rows.map((r) => [r.source_key, {
      name: r.name, mrp: r.mrp ?? null, packSize: r.pack, compositionKey: r.composition_key, dosageForm: r.form, releaseType: r.release ?? null,
    }]));
  },

  async commit(tx, { changes, records, sourceFileId, effectiveFrom }) {
    const upserts = changes.filter((c) => c.kind !== 'removed').map((c) => records.get(c.key)).filter(Boolean);
    const ids = await upsertProducts(tx, SOURCE_ID, upserts.map((r) => ({
      sourceKey: r.key,
      productType: 'brand',
      name: r.parsed.name,
      manufacturer: null, // not in the listing
      isJanAushadhi: false,
      compositionText: r.parsed.compositionText,
      compositionKey: r.parsed.composition.compositionKey,
      dosageForm: r.parsed.dosageForm,
      route: r.parsed.route,
      releaseType: r.parsed.releaseType,
      parseNotes: r.warnings,
      verificationStatus: r.parsed.releaseType ? 'verified' : 'needs_review',
    })));
    const withIds = upserts.map((r) => ({ r, productId: ids.get(r.key) }));
    await setProductIngredients(tx, SOURCE_ID, withIds.map(({ r, productId }) => ({ productId, ingredients: r.parsed.composition.ingredients })));
    const packIds = await upsertPacks(tx, SOURCE_ID, withIds.map(({ r, productId }) => ({
      productId, label: r.parsed.packSize, count: r.parsed.pack.count, unit: r.parsed.pack.unit, verificationStatus: 'verified',
    })));
    const prices = await setCurrentPrices(tx, {
      sourceId: SOURCE_ID,
      sourceFileId,
      priceType: 'mrp',
      includesGst: true, // an MRP includes all taxes
      effectiveFrom,
      verificationStatus: 'verified',
      items: withIds.filter(({ r }) => r.parsed.mrp > 0).map(({ r, productId }) => ({
        productId,
        packSizeId: packIds.get(String(productId)) ?? null,
        amount: r.parsed.mrp,
        unitPrice: unitPrice(r.parsed.mrp, r.parsed.pack.count),
        unit: r.parsed.pack.unit,
      })),
      clearProductIds: withIds.filter(({ r }) => !(r.parsed.mrp > 0)).map(({ productId }) => productId),
    });
    const deactivated = await deactivateProducts(tx, SOURCE_ID, changes.filter((c) => c.kind === 'removed').map((c) => c.key));
    await linkRecords(tx, withIds.map(({ r, productId }) => ({ recordId: r.id, productId })));
    return { brands: withIds.length, pricesAdded: prices.added, pricesChanged: prices.changed, pricesCleared: prices.cleared, deactivated };
  },
};
