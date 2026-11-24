/**
 * Phase 3: normalisation (strength, aliases, salt forms, suffixes, dosage forms, pack sizes).
 * The product names below are written the way Indian lists write them; they are
 * test inputs, not catalogue data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepText } from '../../lib/pharma/text.js';
import { parseStrength, parseStrengthList, sameStrength, canonicalStrength, formatStrength } from '../../lib/pharma/strength.js';
import { createIngredientResolver, resolverDataFromCurated } from '../../lib/pharma/ingredients.js';
import { parseComposition, formatComposition } from '../../lib/pharma/composition.js';
import { parsePack, unitPrice } from '../../lib/pharma/pack.js';
import { CURATED_INGREDIENTS } from '../../db/reference/ingredients.js';

const resolver = createIngredientResolver(resolverDataFromCurated(CURATED_INGREDIENTS));
const parse = (s) => parseComposition(s, resolver);
const summary = (r) => r.ingredients.map((i) => [i.key, i.strength && formatStrength(i.strength), i.saltForm]);

// ---------------------------------------------------------------- text

test('prepText collapses abbreviations, thousands separators and µ', () => {
  assert.equal(prepText('Metformin HCl S.R. Tablets I.P. 1,000 mg'), 'metformin hcl sr tablets ip 1000 mg');
  assert.equal(prepText('Vitamin B12 500 µg'), 'vitamin b12 500 mcg');
  assert.equal(prepText('Amoxycillin & Potassium Clavulanate'), 'amoxycillin and potassium clavulanate');
  assert.equal(prepText("10's"), '10 s');
});

// ---------------------------------------------------------------- strength

test('strength parsing: the formats in the spec', () => {
  assert.deepEqual(parseStrength('650mg'), { value: 650, unit: 'mg', perValue: null, perUnit: null });
  assert.deepEqual(parseStrength('650 mg'), { value: 650, unit: 'mg', perValue: null, perUnit: null });
  assert.deepEqual(parseStrength('250mg/5ml'), { value: 250, unit: 'mg', perValue: 5, perUnit: 'ml' });
  assert.deepEqual(parseStrength('250 mg per 5 ml'), { value: 250, unit: 'mg', perValue: 5, perUnit: 'ml' });
  assert.deepEqual(parseStrength('40 mg/ml'), { value: 40, unit: 'mg', perValue: 1, perUnit: 'ml' });
  assert.deepEqual(parseStrength('1 gm'), { value: 1, unit: 'g', perValue: null, perUnit: null });
  assert.deepEqual(parseStrength('100 mcg/dose'), { value: 100, unit: 'mcg', perValue: 1, perUnit: 'dose' });
  assert.deepEqual(parseStrength('60000 I.U.'), { value: 60000, unit: 'iu', perValue: null, perUnit: null });
  assert.deepEqual(parseStrength('1% w/w'), { value: 1, unit: '%w/w', perValue: null, perUnit: null });
  assert.deepEqual(parseStrength('12.5 mg'), { value: 12.5, unit: 'mg', perValue: null, perUnit: null });
  assert.deepEqual(parseStrengthList('500 mg + 125 mg').map(formatStrength), ['500 mg', '125 mg']);
  assert.deepEqual(parseStrengthList('1000 mg + 500 mg').map(formatStrength), ['1000 mg', '500 mg']);
});

test('strength parsing rejects what is not a strength', () => {
  assert.equal(parseStrength('Vitamin D3'), null);
  assert.equal(parseStrength('650'), null);
  assert.equal(parseStrength('30 ml'), null, 'a volume alone is a pack size, not a strength');
  assert.equal(parseStrength('0 mg'), null);
  assert.deepEqual(parseStrengthList('Vitamin D3 250 IU').map(formatStrength), ['250 IU'], '"d3" is not 3 of anything');
});

test('strength comparison converts units and concentrations', () => {
  assert.ok(sameStrength(parseStrength('1 g'), parseStrength('1000 mg')));
  assert.ok(sameStrength(parseStrength('500 mcg'), parseStrength('0.5 mg')));
  assert.ok(sameStrength(parseStrength('250 mg/5 ml'), parseStrength('50 mg/ml')));
  assert.ok(!sameStrength(parseStrength('500 mg'), parseStrength('650 mg')));
  assert.ok(!sameStrength(parseStrength('250 mg/5 ml'), parseStrength('250 mg')), 'a concentration is not a tablet strength');
  assert.ok(!sameStrength(parseStrength('1% w/w'), parseStrength('1% w/v')));
  assert.ok(!sameStrength(parseStrength('1000 IU'), parseStrength('1000 mg')));
  assert.deepEqual(canonicalStrength(parseStrength('125 mg/5 ml')), { amount: 25, unit: 'mg', per: 'ml' });
});

// ---------------------------------------------------------------- aliases and salt forms

test('alias matching: Indian, INN and US names resolve to one ingredient', () => {
  const key = (n) => resolver.resolve(n).key;
  assert.equal(key('Acetaminophen'), 'paracetamol');
  assert.equal(key('PCM'), 'paracetamol');
  assert.equal(key('Albuterol'), 'salbutamol');
  assert.equal(key('Epinephrine'), 'adrenaline');
  assert.equal(key('Amoxicillin'), 'amoxycillin');
  assert.equal(key('Vitamin D3'), 'cholecalciferol');
  assert.equal(key('Frusemide'), 'furosemide');
  assert.equal(resolver.resolve('Amoxicillin').name, 'Amoxycillin', 'display name is the Indian one');
});

test('salt forms are separated from the ingredient', () => {
  assert.deepEqual(resolver.resolve('Metformin HCl'), { key: 'metformin', saltForm: 'hydrochloride', name: 'Metformin', known: true });
  assert.deepEqual(resolver.resolve('Metformin Hydrochloride'), { key: 'metformin', saltForm: 'hydrochloride', name: 'Metformin', known: true });
  assert.equal(resolver.resolve('Amlodipine Besilate').saltForm, 'besylate', 'besilate and besylate are one spelling');
  assert.equal(resolver.resolve('Clopidogrel Bisulfate').saltForm, 'bisulphate');
  assert.equal(resolver.resolve('Clopidogrel Hydrogen Sulphate').saltForm, 'bisulphate');
  assert.equal(resolver.resolve('Metoprolol Tartrate').saltForm, 'tartrate');
  assert.equal(resolver.resolve('Metoprolol Succinate').saltForm, 'succinate');
  assert.equal(resolver.resolve('Pantoprazole Sodium Sesquihydrate').saltForm, 'sodium', 'hydrates are not salt forms');
  assert.equal(resolver.resolve('Amoxycillin Trihydrate').saltForm, null);
  assert.deepEqual(resolver.resolve('Potassium Clavulanate'), { key: 'clavulanic acid', saltForm: 'potassium', name: 'Clavulanic Acid', known: true });
});

test('mineral salts are ingredients in their own right, and unknown names are flagged', () => {
  assert.equal(resolver.resolve('Sodium Chloride').key, 'sodium chloride');
  assert.equal(resolver.resolve('Zinc Sulphate').key, 'zinc sulphate', 'not "zinc" with salt "sulphate"');
  const unknown = resolver.resolve('Teneligliptin Hydrobromide Hydrate');
  assert.equal(unknown.key, 'teneligliptin');
  assert.equal(unknown.known, true);
  const reallyUnknown = resolver.resolve('Exampletide Maleate');
  assert.deepEqual(reallyUnknown, { key: 'exampletide', name: 'Exampletide', saltForm: 'maleate', known: false });
});

// ---------------------------------------------------------------- compositions

test('composition: single ingredient with suffixes', () => {
  const r = parse('Paracetamol Tablets IP 650 mg');
  assert.ok(r.ok, r.errors.join('; '));
  assert.deepEqual(summary(r), [['paracetamol', '650 mg', null]]);
  assert.equal(r.dosageForm, 'tablet');
  assert.equal(r.route, 'oral');
  assert.equal(r.releaseType, 'ir');
  assert.equal(r.pharmacopoeia, 'IP');
  assert.equal(r.compositionKey, 'paracetamol 650 mg');
});

test('composition: trailing strengths "A and B Tablets IP 500 mg + 125 mg"', () => {
  const r = parse('Amoxycillin and Potassium Clavulanate Tablets IP 500 mg + 125 mg');
  assert.ok(r.ok, r.errors.join('; '));
  assert.deepEqual(summary(r), [['amoxycillin', '500 mg', null], ['clavulanic acid', '125 mg', 'potassium']]);
  assert.equal(formatComposition(r.ingredients), 'Amoxycillin 500 mg + Clavulanic Acid 125 mg');
});

test('composition: inline strengths with salt and release markers', () => {
  const r = parse('Glimepiride 2mg + Metformin Hydrochloride (SR) 500mg Tablets');
  assert.ok(r.ok, r.errors.join('; '));
  assert.deepEqual(summary(r), [['glimepiride', '2 mg', null], ['metformin', '500 mg', 'hydrochloride']]);
  assert.equal(r.releaseType, 'sr');
});

test('composition: "eq. to" statements', () => {
  const r = parse('Amoxycillin Trihydrate eq. to Amoxycillin 500 mg + Potassium Clavulanate Diluted IP eq. to Clavulanic Acid 125 mg Tablets');
  assert.ok(r.ok, r.errors.join('; '));
  assert.deepEqual(summary(r), [['amoxycillin', '500 mg', null], ['clavulanic acid', '125 mg', 'potassium']]);

  const shelcal = parse('Calcium Carbonate 1250 mg (eq. to elemental Calcium 500 mg) + Vitamin D3 250 IU Tablets');
  assert.ok(shelcal.ok, shelcal.errors.join('; '));
  assert.deepEqual(summary(shelcal), [['calcium carbonate', '1250 mg', null], ['cholecalciferol', '250 IU', null]]);
  assert.equal(formatStrength(shelcal.ingredients[0].equivalent.strength), '500 mg');
});

test('composition: liquids, injections, topicals and inhalers', () => {
  const susp = parse('Cefixime Oral Suspension IP 50mg/5ml');
  assert.deepEqual([susp.dosageForm, susp.route, formatStrength(susp.ingredients[0].strength)], ['suspension', 'oral', '50 mg/5 ml']);
  const combo = parse('Amoxycillin and Potassium Clavulanate Oral Suspension IP 200 mg + 28.5 mg/5 ml');
  assert.deepEqual(summary(combo), [['amoxycillin', '200 mg/5 ml', null], ['clavulanic acid', '28.5 mg/5 ml', 'potassium']], 'a trailing "/5 ml" applies to every strength');
  const dry = parse('Amoxycillin Dry Syrup IP 125 mg/5 ml');
  assert.equal(dry.dosageForm, 'dry_syrup');
  const vial = parse('Ceftriaxone Injection IP 1 gm (Vial & WFI)');
  assert.deepEqual([vial.dosageForm, vial.route, formatStrength(vial.ingredients[0].strength)], ['injection_vial', 'parenteral', '1 g']);
  const amp = parse('Ondansetron Injection IP 2 mg/ml (2 ml Ampoule)');
  assert.equal(amp.dosageForm, 'injection_ampoule');
  const cream = parse('Clotrimazole Cream IP 1% w/w');
  assert.deepEqual([cream.dosageForm, cream.route, formatStrength(cream.ingredients[0].strength)], ['cream', 'topical', '1% w/w']);
  const inhaler = parse('Salbutamol Inhaler IP 100 mcg/dose (200 MDI)');
  assert.deepEqual([inhaler.dosageForm, inhaler.route, inhaler.ingredients[0].key], ['inhaler', 'inhalation', 'salbutamol']);
  const eye = parse('Ciprofloxacin Eye Drops IP 0.3% w/v');
  assert.equal(eye.dosageForm, 'eye_drops');
});

test('release types: every marker is recognised and film coating is not a release type', () => {
  const rel = (s) => parse(s).releaseType;
  assert.equal(rel('Metformin Hydrochloride Sustained Release Tablets IP 1000 mg'), 'sr');
  assert.equal(rel('Metformin Hydrochloride ER Tablets 500 mg'), 'er');
  assert.equal(rel('Metformin XR Tablets 500 mg'), 'xr');
  assert.equal(rel('Metoprolol Succinate XL Tablets 25 mg'), 'xl');
  assert.equal(rel('Gliclazide MR Tablets 60 mg'), 'mr');
  assert.equal(rel('Carbamazepine CR Tablets 200 mg'), 'cr');
  assert.equal(rel('Pantoprazole Gastro-resistant Tablets IP 40 mg'), 'dr');
  assert.equal(rel('Aspirin Enteric Coated Tablets 75 mg'), 'dr');
  assert.equal(rel('Ibuprofen Film Coated Tablets IP 400 mg'), 'ir');
  assert.equal(rel('Paracetamol 500mg'), null, 'no dosage form means the release type is unknown');
  const both = parse('Example SR ER Tablets 10 mg');
  assert.equal(both.releaseType, null);
  assert.ok(both.errors.some((e) => /more than one release type/.test(e)));
});

test('release types: the spellings found in the PMBI list are not mistaken for plain tablets', () => {
  const read = (s) => {
    const r = parse(s);
    return { release: r.releaseType, salts: r.ingredients.map((i) => i.name), key: r.compositionKey };
  };
  assert.deepEqual(read('Pantoprazole Gastro-Resistance Tablets IP 20mg'), { release: 'dr', salts: ['Pantoprazole'], key: 'pantoprazole 20 mg' });
  assert.deepEqual(read('Esomeprazole Gastro-Resistance Tablets IP 20mg'), { release: 'dr', salts: ['Esomeprazole'], key: 'esomeprazole 20 mg' });
  const metformin = parse('Metformin Hydrochloride (sustained-relase) 500mg and Myo-Inositol 600mg Tablets');
  assert.equal(metformin.releaseType, 'sr');
  assert.equal(metformin.ingredients[0].key, 'metformin');
  const metoprolol = parse('Metoprolol Succinate (Extended-relase) 50mg, Telmisartan 40mg and Chlorthalidone 12.5mg Tablets');
  assert.equal(metoprolol.releaseType, 'er');
  assert.deepEqual([metoprolol.ingredients[0].key, metoprolol.ingredients[0].saltForm], ['metoprolol', 'succinate']);
});

test('release types: wording that cannot be read is unknown, never plain', () => {
  for (const name of ['Metformin Sustaned Release Tablets 500 mg', 'Diclofenac Retard Tablets 100 mg', 'Octreotide long acting release Injection 20mg', 'Aspirin Enteric Tablets 75 mg']) {
    const r = parse(name);
    assert.equal(r.releaseType, null, name);
    assert.ok(r.warnings.some((w) => /release wording/.test(w)), name);
  }
  // Names without any release wording still read as plain, without a warning.
  for (const name of ['Paracetamol Tablets IP 500 mg', 'Ibuprofen Film Coated Tablets IP 400 mg']) {
    const r = parse(name);
    assert.equal(r.releaseType, 'ir', name);
    assert.deepEqual(r.warnings, [], name);
  }
});

test('oral strips: the strip wording is not part of the salt name, and a strip is not read as a tablet', () => {
  for (const [name, key] of [
    ['Donepezil Hydrochloride Orally Disintegrating Strips 10 mg', 'donepezil 10 mg'],
    ['Tadalafil Oral Disintegrating Strips 10 mg', 'tadalafil 10 mg'],
    ['Ondansetron 4mg Oral Disintegrating Strips', 'ondansetron 4 mg'],
  ]) {
    const r = parse(name);
    assert.ok(r.ok, `${name}: ${r.errors.join('; ')}`);
    assert.deepEqual([r.ingredients.length, r.dosageForm, r.releaseType], [1, null, null], name);
    assert.ok(!/strip|disintegrat/i.test(r.ingredients[0].name), r.ingredients[0].name);
    assert.ok(r.compositionKey.startsWith(key.split(' ')[0]), r.compositionKey);
  }
  // A test strip is not a medicine; its name is left alone.
  assert.deepEqual(parse('Blood Glucose Monitoring Strips').ingredients.map((i) => i.name), ['Blood Glucose Monitoring Strips']);
});

test('dosage form variants: DT, MD, chewable, capsules', () => {
  assert.equal(parse('Paracetamol DT Tablets 125 mg').dosageForm, 'dispersible_tablet');
  assert.equal(parse('Ondansetron MD Tablets 4 mg').dosageForm, 'mouth_dissolving_tablet');
  assert.equal(parse('Omeprazole Capsules IP 20 mg').dosageForm, 'capsule');
  assert.equal(parse('Salbutamol Rotacaps 200 mcg').dosageForm, 'inhalation_capsule');
  const sachet = parse('Cholecalciferol Granules 60000 IU (1 gm Sachet)');
  assert.ok(sachet.ok, sachet.errors.join('; '));
  assert.deepEqual([sachet.dosageForm, formatStrength(sachet.ingredients[0].strength)], ['granules', '60000 IU']);
  assert.deepEqual(parsePack('1 gm Sachet', 'granules'), { count: null, unit: null, error: 'cannot read a unit count from "1 gm Sachet"' });
  assert.deepEqual(parsePack('4 Sachets', 'granules'), { count: 4, unit: 'sachet', error: null });
});

test('composition: problems are reported, not guessed', () => {
  const mismatch = parse('Amoxycillin and Potassium Clavulanate Tablets 625 mg');
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.errors.join(), /2 ingredient name\(s\) but 1 strength/);

  const noStrength = parse('Clotrimazole Cream');
  assert.equal(noStrength.ok, true);
  assert.equal(parse('Exampletide Tablets 5 mg').warnings.length, 0, 'an unlisted ingredient is reported separately, not as a row warning');
  assert.equal(parse('Exampletide Tablets 5 mg').ingredients[0].known, false);
  assert.equal(noStrength.ingredients[0].strength, null);
  assert.equal(noStrength.compositionKey, null);
  assert.ok(noStrength.warnings.includes('no strength is given'));

  const drops = parse('Paracetamol Drops 100 mg/ml');
  assert.equal(drops.dosageForm, null);
  assert.ok(drops.warnings.some((w) => /type of drops/.test(w)));

  assert.equal(parse('').ok, false);
  assert.equal(parse('Paracetamol 500 mg + Acetaminophen 500 mg').ok, false, 'the same ingredient twice');
});

test('composition keys are order-independent and unit-normalised', () => {
  const a = parse('Telmisartan 40 mg + Hydrochlorothiazide 12.5 mg Tablets').compositionKey;
  const b = parse('Hydrochlorothiazide 12.5mg + Telmisartan 40mg Tablets').compositionKey;
  assert.equal(a, b);
});

// ---------------------------------------------------------------- pack sizes

test('pack size to unit count', () => {
  assert.deepEqual(parsePack("10's", 'tablet'), { count: 10, unit: 'tablet', error: null });
  assert.deepEqual(parsePack('15 tablets', 'tablet'), { count: 15, unit: 'tablet', error: null });
  assert.deepEqual(parsePack('Strip of 15 tablets', 'tablet'), { count: 15, unit: 'tablet', error: null });
  assert.deepEqual(parsePack('10 x 10', 'tablet'), { count: 100, unit: 'tablet', error: null });
  assert.deepEqual(parsePack('1x10 Tablets', 'tablet'), { count: 10, unit: 'tablet', error: null });
  assert.deepEqual(parsePack('10 Capsules', 'capsule'), { count: 10, unit: 'capsule', error: null });
  assert.deepEqual(parsePack('30 ml bottle', 'syrup'), { count: 30, unit: 'ml', error: null });
  assert.deepEqual(parsePack('60ml', 'dry_syrup'), { count: 60, unit: 'ml', error: null });
  assert.deepEqual(parsePack('1 vial', 'injection_vial'), { count: 1, unit: 'vial', error: null });
  assert.deepEqual(parsePack('1 Vial & WFI', 'injection_vial'), { count: 1, unit: 'vial', error: null });
  assert.deepEqual(parsePack('2 ml Ampoule', 'injection_ampoule'), { count: 1, unit: 'ampoule', error: null });
  assert.deepEqual(parsePack('15 gm', 'cream'), { count: 15, unit: 'g', error: null });
  assert.deepEqual(parsePack('200 MDI', 'inhaler'), { count: 200, unit: 'dose', error: null });
  assert.deepEqual(parsePack('30 Rotacaps', 'inhalation_capsule'), { count: 30, unit: 'capsule', error: null });
});

test('pack sizes that cannot be read are reported', () => {
  assert.equal(parsePack('1 bottle', 'syrup').count, null);
  assert.ok(parsePack('1 bottle', 'syrup').error);
  assert.equal(parsePack('', 'tablet').count, null);
  assert.equal(parsePack("10's", null).count, null, 'without a dosage form "10\'s" could be anything');
  assert.deepEqual(parsePack('15 tablets', null), { count: 15, unit: 'tablet', error: null }, 'a label that names its unit is fine');
});

test('unit price', () => {
  assert.equal(unitPrice(32, 15), 2.1333);
  assert.equal(unitPrice(9, 10), 0.9);
  assert.equal(unitPrice(10, 0), null);
  assert.equal(unitPrice(10, null), null);
});
