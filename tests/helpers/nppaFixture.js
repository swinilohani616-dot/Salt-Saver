/**
 * A PDF laid out like NPPA's ceiling price lists, with synthetic test prices.
 */
import { makePdf } from './makePdf.js';

const COLS = { sl: 95, med: 127, form: 255, unit: 404, price: 481 };
const header = (y) => [
  { x: 94, y, text: 'Sl No' }, { x: 164, y, text: 'Medicines' }, { x: 258, y, text: 'Dosage form and Strength' }, { x: 412, y, text: 'Unit' }, { x: 479, y, text: 'Ceiling' },
  { x: 482, y: y - 11, text: 'price' },
  { x: 98, y: y - 22, text: '(1)' }, { x: 179, y: y - 22, text: '(2)' }, { x: 308, y: y - 22, text: '(3)' }, { x: 414, y: y - 22, text: '(4)' }, { x: 486, y: y - 22, text: '(5)' },
];
// NPPA sets long units in smaller type so they stay inside the column (e.g. "Each Pack (10 ml)" at x 401-441).
const row = (y, sl, med, form, unit, price) => [
  { x: COLS.sl, y, text: sl }, { x: COLS.med, y, text: med }, { x: COLS.form, y, text: form },
  { x: unit.length > 12 ? 401 : COLS.unit, y, text: unit, size: unit.length > 12 ? 7 : 9 }, { x: COLS.price, y, text: price },
];

export function nppaPdf(prices = {}) {
  const p = (k, v) => prices[k] ?? v;
  return makePdf([
    [
      { x: 94, y: 716, text: 'List of Ceiling prices (synthetic test list)' },
      ...header(672),
      ...row(638, '1.', 'Paracetamol', 'Tablet 500 mg', '1 Tablet', p('para', '1.00')),
      ...row(626, '2.', 'Abacavir (A) + Lamivudine', 'Tablet 60 mg(A) + 30 mg(B)', '1 Tablet', '20.00'),
      { x: COLS.med, y: 615, text: '(B)' },
      ...row(603, '3.', 'Acetylsalicylic acid', 'Effervescent/ Dispersible/', '1 Tablet', '1.10'),
      { x: COLS.form, y: 592, text: 'Enteric coated Tablet 75 mg' },
      ...row(580, '4.', 'Amoxicillin (A) + Clavulanic', 'Oral Liquid 200 mg(A) + 28.5', '1 ml', '2.00'),
      { x: COLS.med, y: 569, text: 'acid (B)' }, { x: COLS.form, y: 569, text: 'mg(B)/5ml' },
      ...row(557, '5.', 'Dexamethasone', 'Injection 4 mg/ml', 'Each Pack (2 ml)', '9.00'),
      ...row(545, '6.', 'Dexamethasone', 'Injection 4 mg/ml', 'Each Pack (10 ml)', '13.00'),
      ...row(533, '7.', 'Iron', 'Tablet 100 mg', '1 Tablet', '0.50'),
      ...row(521, '8.', 'Mystery device', 'As licensed', '1 IUD', '100.00'),
    ],
    [
      ...header(715),
      ...row(681, '9.', 'Cetirizine', 'Tablet 10 mg', '1 Tablet', '1.50'),
    ],
  ]);
}
