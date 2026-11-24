/**
 * Minimal parsers for the legacy JSON only ("Paracetamol 500mg",
 * "Strip of 15 tablets"). Anything they cannot read is reported, not guessed.
 * Phase 3 replaces these with the full strength / pack / suffix parsers.
 */
import { normalizeText } from '../js/core/normalize.js';

const PART = /^(.+?)\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g|iu)$/i;

/**
 * "Calcium Carbonate 1250mg + Vitamin D3 250 IU" ->
 *   [{name:'Calcium Carbonate', normalizedName:'calcium carbonate', strengthValue:1250, strengthUnit:'mg', sourceText}, ...]
 * @returns {{ok:true, parts:object[]}|{ok:false, error:string}}
 */
export function parseLegacyComposition(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'composition is empty' };
  const parts = [];
  for (const raw of text.split('+')) {
    const sourceText = raw.trim();
    const match = PART.exec(sourceText);
    if (!match) return { ok: false, error: `cannot read ingredient and strength from "${sourceText}"` };
    const name = match[1].trim();
    parts.push({
      name,
      normalizedName: normalizeText(name),
      strengthValue: Number(match[2]),
      strengthUnit: match[3].toLowerCase(),
      sourceText,
    });
  }
  const names = parts.map((p) => p.normalizedName);
  if (new Set(names).size !== names.length) return { ok: false, error: 'an ingredient is listed twice' };
  return { ok: true, parts };
}

const PACK = /(\d+)\s*(tablet|capsule)s?\b/i;
const FORM_BY_UNIT = { tablet: 'tablet', capsule: 'capsule' };

/**
 * "Strip of 15 tablets" -> {unitCount:15, unit:'tablet', dosageFormCode:'tablet'}
 * Returns nulls when the label does not say.
 */
export function parseLegacyPack(label) {
  const match = typeof label === 'string' ? PACK.exec(label) : null;
  if (!match) return { unitCount: null, unit: null, dosageFormCode: null };
  const unit = match[2].toLowerCase();
  return { unitCount: Number(match[1]), unit, dosageFormCode: FORM_BY_UNIT[unit] };
}
