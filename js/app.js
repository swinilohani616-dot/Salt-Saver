/* =========================================================
   SaltSaver – Phase 1 application logic
   ---------------------------------------------------------
   What this file does, in order:
     1. Finds the HTML elements we need
     2. Small helper functions (formatting, creating elements)
     3. Validates each medicine record from the JSON file
     4. Loads data/sample-data.json with fetch()
     5. Searches by brand name or active ingredient
     6. Groups medicines with the same listed composition
     7. Builds the comparison cards (safely, with textContent)
     8. Shows no-results / invalid-input states
     9. Runs the savings calculator
    10. Connects everything to the page (event listeners)

   SAFETY RULE: data from the JSON file and text typed by the user
   is "untrusted". We NEVER put it into innerHTML. We always use
   textContent or document.createElement(), so that text such as
   "<script>" is shown as plain text and never run as code.
   ========================================================= */

'use strict'; // Turns some silent mistakes into visible errors

/* ---------------------------------------------------------
   1. Settings and references to HTML elements
   --------------------------------------------------------- */

const DATA_URL = 'data/sample-data.json';
const MIN_QUERY_LENGTH = 2;   // 1 letter would match almost everything
const MAX_QUERY_LENGTH = 60;  // Nobody needs a longer medicine name
const ALLOWED_TYPES = ['brand', 'generic'];

// Elements from index.html
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const statusMessage = document.getElementById('status-message');
const dataNotice = document.getElementById('data-notice');
const resultsContainer = document.getElementById('results');

const calcForm = document.getElementById('calc-form');
const calcAPrice = document.getElementById('calc-a-price');
const calcASize = document.getElementById('calc-a-size');
const calcBPrice = document.getElementById('calc-b-price');
const calcBSize = document.getElementById('calc-b-size');
const calcResult = document.getElementById('calc-result');

// Data, filled in by loadData()
let medicines = [];     // only records that passed validation
let dataLoaded = false; // becomes true once the JSON loads successfully

/* ---------------------------------------------------------
   2. Small helper functions
   --------------------------------------------------------- */

// Formats a number as Indian Rupees, e.g. 2 -> "₹2.00"
const rupeeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatRupees(amount) {
  return rupeeFormatter.format(amount);
}

// Lower-case and trim, so "  PARAcetamol " matches "paracetamol"
function normalise(text) {
  return String(text).trim().toLowerCase();
}

// "tablet" -> "tablets" when count is not 1. "ml" never changes.
function pluraliseUnit(count, unit) {
  if (unit === 'ml' || count === 1) {
    return unit;
  }
  return unit + 's';
}

// "tablet" -> "Tablet"
function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "1 record" / "3 records"
function pluralise(count, word) {
  return count + ' ' + word + (count === 1 ? '' : 's');
}

/*
  Creates an element SAFELY.
  Example: makeElement('p', 'small text-muted', 'Hello')
  -> <p class="small text-muted">Hello</p>
  The text is set with textContent, so it can never become HTML.
*/
function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined && text !== null) {
    element.textContent = text;
  }
  return element;
}

// Shows a message in the status line above the results
function setStatus(message) {
  statusMessage.textContent = message;
}

/* ---------------------------------------------------------
   3. Validation: check each record before we trust it
   ---------------------------------------------------------
   A JSON file can contain mistakes (missing prices, text where
   a number should be, a pack size of 0...). If we used such a
   record, we could show "₹NaN" or divide by zero. So each
   record is checked first, and broken ones are skipped.
*/

function isNonEmptyText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isPositiveNumber(value) {
  // typeof check stops strings like "12" or "cheap";
  // Number.isFinite stops NaN and Infinity
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// Returns a list of problems. An empty list means the record is valid.
function validateMedicine(record) {
  const problems = [];

  if (record === null || typeof record !== 'object') {
    return ['record is not an object'];
  }

  // Required text fields
  const textFields = ['id', 'brandName', 'dosageForm', 'manufacturer',
                      'packUnit', 'source', 'verificationStatus'];
  textFields.forEach(function (field) {
    if (!isNonEmptyText(record[field])) {
      problems.push(field + ' is missing');
    }
  });

  if (!ALLOWED_TYPES.includes(record.type)) {
    problems.push('type must be "brand" or "generic"');
  }

  // Ingredients must be a non-empty list of {name, strength, unit}
  if (!Array.isArray(record.ingredients) || record.ingredients.length === 0) {
    problems.push('ingredients list is missing or empty');
  } else {
    record.ingredients.forEach(function (ingredient, i) {
      if (!ingredient || !isNonEmptyText(ingredient.name) ||
          !isPositiveNumber(ingredient.strength) || !isNonEmptyText(ingredient.unit)) {
        problems.push('ingredient ' + (i + 1) + ' needs a name, a positive strength and a unit');
      }
    });
  }

  // Prices and pack size
  if (!isPositiveNumber(record.packSize) || !Number.isInteger(record.packSize)) {
    problems.push('packSize must be a positive whole number');
  }
  if (!isPositiveNumber(record.packPrice)) {
    problems.push('packPrice must be a positive number');
  }
  if (!isPositiveNumber(record.unitPrice)) {
    problems.push('unitPrice must be a positive number');
  }

  // If all numbers are fine, check unitPrice really equals packPrice ÷ packSize
  if (problems.length === 0) {
    const expectedUnitPrice = record.packPrice / record.packSize;
    if (Math.abs(expectedUnitPrice - record.unitPrice) > 0.01) {
      problems.push('unitPrice does not equal packPrice ÷ packSize');
    }
  }

  return problems;
}

/* ---------------------------------------------------------
   4. Loading the JSON file with fetch()
   ---------------------------------------------------------
   fetch() asks for a file over HTTP and returns a Promise.
   "async/await" lets us write that as normal top-to-bottom code.

   WHY A LOCAL SERVER IS NEEDED:
   If you double-click index.html, the address starts with
   file://. For security, browsers block fetch() from reading
   files that way, so loading fails. Running a local server
   (e.g. "python3 -m http.server 8000") serves the files over
   http://localhost, just like a real website.
*/

async function loadData() {
  setStatus('Loading sample data…');

  // A helpful early warning for the most common beginner problem
  if (window.location.protocol === 'file:') {
    showLoadError('This page was opened directly as a file (file://). Browsers block fetch() ' +
      'from reading local files. Start a local server in the project folder, for example ' +
      '"python3 -m http.server 8000", then open http://localhost:8000');
    return;
  }

  try {
    const response = await fetch(DATA_URL);

    // fetch() only fails on network errors; a 404 must be checked by hand
    if (!response.ok) {
      throw new Error('Server answered with status ' + response.status);
    }

    // .json() fails if the file is not valid JSON (e.g. a missing comma)
    const data = await response.json();

    if (!data || !Array.isArray(data.medicines)) {
      throw new Error('The file has no "medicines" list');
    }

    // Keep valid records, remember the skipped ones
    const skipped = [];
    data.medicines.forEach(function (record, index) {
      const problems = validateMedicine(record);
      if (problems.length === 0) {
        medicines.push(record);
      } else {
        const label = (record && isNonEmptyText(record.id)) ? record.id : 'record #' + (index + 1);
        skipped.push({ label: label, problems: problems });
        console.warn('SaltSaver skipped invalid record', label, problems);
      }
    });

    showDataNotice(data.meta, skipped);

    if (medicines.length === 0) {
      showLoadError('The data file loaded, but none of its records were valid.');
      return;
    }

    dataLoaded = true;
    setStatus('Sample data ready: ' + pluralise(medicines.length, 'fictional record') +
      '. Type a brand name or active ingredient above to search.');
  } catch (error) {
    console.error('SaltSaver could not load data:', error);
    showLoadError('The sample data could not be loaded (' + error.message + '). ' +
      'Check that data/sample-data.json exists, is valid JSON, and that you are using a local server.');
  }
}

// Shows dataset info (from "meta") and lists any skipped records
function showDataNotice(meta, skipped) {
  dataNotice.replaceChildren(); // remove old content

  if (meta && isNonEmptyText(meta.datasetName)) {
    const info = makeElement('p', 'mb-1');
    info.append(makeElement('strong', '', meta.datasetName));
    if (isNonEmptyText(meta.version)) {
      info.append(' (version ' + meta.version + ')');
    }
    dataNotice.append(info);
  }
  if (meta && isNonEmptyText(meta.disclaimer)) {
    dataNotice.append(makeElement('p', 'mb-1 small', meta.disclaimer));
  }

  if (skipped.length > 0) {
    dataNotice.append(makeElement('p', 'mb-1 mt-2 fw-semibold',
      pluralise(skipped.length, 'record') + ' skipped because of invalid data:'));
    const list = makeElement('ul', 'mb-0 small');
    skipped.forEach(function (item) {
      list.append(makeElement('li', '', item.label + ': ' + item.problems.join('; ')));
    });
    dataNotice.append(list);
  }

  // Only show the box if we put something in it
  dataNotice.classList.toggle('d-none', dataNotice.childElementCount === 0);
}

// Error state when the data cannot be used at all
function showLoadError(message) {
  setStatus('Search is unavailable: the sample data did not load.');
  resultsContainer.replaceChildren(
    makeStateBox('⚠️', 'Could not load sample data', message, 'alert-danger')
  );
}

/* ---------------------------------------------------------
   5. Searching
   --------------------------------------------------------- */

// Returns medicines whose brand name OR any ingredient name contains the query
function searchMedicines(query) {
  const q = normalise(query);
  return medicines.filter(function (medicine) {
    const nameMatches = normalise(medicine.brandName).includes(q);
    const ingredientMatches = medicine.ingredients.some(function (ingredient) {
      return normalise(ingredient.name).includes(q);
    });
    return nameMatches || ingredientMatches;
  });
}

/* ---------------------------------------------------------
   6. Grouping by composition
   ---------------------------------------------------------
   Two records are only compared if they list exactly the same
   ingredients + strengths + units, the same dosage form and the
   same pack unit. Ingredients are sorted first, so
   "Ibuprofen + Paracetamol" and "Paracetamol + Ibuprofen" match.

   This is a comparison of what the SAMPLE DATA lists. It does
   NOT prove two products are clinically interchangeable.
*/

function sortedIngredients(medicine) {
  return medicine.ingredients.slice().sort(function (a, b) {
    return normalise(a.name).localeCompare(normalise(b.name));
  });
}

// Builds a text key, e.g. "paracetamol|500|mg#tablet#tablet"
function compositionKey(medicine) {
  const parts = sortedIngredients(medicine).map(function (ingredient) {
    return normalise(ingredient.name) + '|' + ingredient.strength + '|' + normalise(ingredient.unit);
  });
  return parts.join('+') + '#' + normalise(medicine.dosageForm) + '#' + normalise(medicine.packUnit);
}

// For the matches, collect EVERY record with the same composition.
// That way searching "Pyrovin" also shows the generic alternatives.
function buildGroups(matches) {
  const groups = new Map(); // key -> list of medicines (Map keeps insertion order)

  matches.forEach(function (match) {
    const key = compositionKey(match);
    if (!groups.has(key)) {
      const sameComposition = medicines.filter(function (medicine) {
        return compositionKey(medicine) === key;
      });
      groups.set(key, sameComposition);
    }
  });

  return Array.from(groups.values());
}

/* ---------------------------------------------------------
   7. Price comparison (shared by cards and the calculator)
   ---------------------------------------------------------
   Pack prices cannot be compared directly when pack sizes differ
   (₹30 for 15 tablets vs ₹9 for 10 tablets). So we convert both
   to a price PER UNIT first, then compare.
*/

function compareUnitPrices(priceA, sizeA, priceB, sizeB) {
  const unitA = priceA / sizeA;
  const unitB = priceB / sizeB;
  const difference = unitA - unitB;               // positive = B is cheaper
  const percent = (difference / unitA) * 100;     // relative to A
  return { unitA: unitA, unitB: unitB, difference: difference, percent: percent };
}

// Turns a comparison into a sentence, e.g. "₹1.10 per tablet (55.0%) lower"
function describeDifference(comparison, unitLabel) {
  if (Math.abs(comparison.difference) < 0.005) {
    return 'Same price per ' + unitLabel + '.';
  }
  const amount = formatRupees(Math.abs(comparison.difference)) + ' per ' + unitLabel;
  const percent = Math.abs(comparison.percent).toFixed(1) + '%';
  if (comparison.difference > 0) {
    return amount + ' lower (' + percent + ' less per ' + unitLabel + ').';
  }
  return amount + ' higher (' + percent + ' more per ' + unitLabel + ').';
}

/* ---------------------------------------------------------
   8. Building the cards (safe DOM creation)
   --------------------------------------------------------- */

// "Paracetamol 500 mg + Ibuprofen 400 mg"
function compositionLabel(medicine) {
  return sortedIngredients(medicine).map(function (ingredient) {
    return ingredient.name + ' ' + ingredient.strength + ' ' + ingredient.unit;
  }).join(' + ');
}

// One row inside a card, for one medicine
function makeProductRow(medicine) {
  const isBrand = medicine.type === 'brand';
  const row = makeElement('div', 'product-row ' + (isBrand ? 'is-brand' : 'is-generic'));

  const heading = makeElement('div', 'd-flex flex-wrap justify-content-between align-items-start gap-2');
  heading.append(makeElement('h4', 'h6 mb-1', medicine.brandName));
  heading.append(makeElement('span',
    'badge ' + (isBrand ? 'badge-brand' : 'badge-generic'),
    isBrand ? 'Brand' : 'Generic'));
  row.append(heading);

  row.append(makeElement('p', 'mb-1 small', 'Manufacturer: ' + medicine.manufacturer));
  row.append(makeElement('p', 'mb-1 small',
    'Pack: ' + medicine.packSize + ' ' + pluraliseUnit(medicine.packSize, medicine.packUnit) +
    ' for ' + formatRupees(medicine.packPrice) + ' (sample price)'));

  const unitPrice = makeElement('p', 'mb-1');
  unitPrice.append(makeElement('span', 'unit-price', formatRupees(medicine.packPrice / medicine.packSize)));
  unitPrice.append(' per ' + medicine.packUnit);
  row.append(unitPrice);

  row.append(makeElement('p', 'meta-line mb-0',
    'ID ' + medicine.id + ' · Source: ' + medicine.source +
    ' · Verification: ' + medicine.verificationStatus));

  return row;
}

// The green box summarising price differences in a group
function makeSavingsBox(brands, cheapestGeneric, unitLabel) {
  const box = makeElement('div', 'savings-box mb-3');
  box.append(makeElement('h4', 'h6', 'Sample unit-price difference'));

  if (brands.length === 0) {
    box.append(makeElement('p', 'mb-0 small',
      'Only generic records with this composition are in the sample data, so there is no brand to compare with.'));
    return box;
  }
  if (!cheapestGeneric) {
    box.append(makeElement('p', 'mb-0 small',
      'No generic with the same listed ingredients, strength and form is in the sample data.'));
    return box;
  }

  const list = makeElement('ul', 'mb-0 ps-3');
  brands.forEach(function (brand) {
    const comparison = compareUnitPrices(
      brand.packPrice, brand.packSize, cheapestGeneric.packPrice, cheapestGeneric.packSize);
    const item = makeElement('li', 'small');
    item.append(cheapestGeneric.brandName + ' vs ' + brand.brandName + ': ');
    item.append(makeElement('span', comparison.difference > 0 ? 'savings-amount' : 'fw-semibold',
      describeDifference(comparison, unitLabel)));
    list.append(item);
  });
  box.append(list);
  return box;
}

// One card for one composition group
function makeComparisonCard(group) {
  const first = group[0];
  const unitLabel = first.packUnit;

  // Brands first, then generics from cheapest to most expensive (per unit)
  const brands = group.filter(function (m) { return m.type === 'brand'; });
  const generics = group.filter(function (m) { return m.type === 'generic'; })
    .sort(function (a, b) { return (a.packPrice / a.packSize) - (b.packPrice / b.packSize); });
  const cheapestGeneric = generics[0]; // undefined if there are no generics

  const column = makeElement('div', 'col-12 col-lg-6');
  const card = makeElement('article', 'card comparison-card shadow-sm');
  const body = makeElement('div', 'card-body');

  // Title and subtitle
  body.append(makeElement('span', 'badge text-bg-warning mb-2', 'Fictional sample data'));
  body.append(makeElement('h3', 'card-title h5', compositionLabel(first)));
  body.append(makeElement('p', 'text-muted small',
    capitalise(first.dosageForm) + ' · prices compared per ' + unitLabel +
    ' · ' + pluralise(group.length, 'sample record')));

  // Rows for every product
  brands.concat(generics).forEach(function (medicine) {
    body.append(makeProductRow(medicine));
  });

  // Savings summary
  body.append(makeSavingsBox(brands, cheapestGeneric, unitLabel));

  // "Use in calculator" button (only when there is a brand AND a generic)
  if (brands.length > 0 && cheapestGeneric) {
    const button = makeElement('button', 'btn btn-outline-brand btn-sm mb-3', 'Use in calculator');
    button.type = 'button';
    button.setAttribute('aria-label',
      'Use ' + brands[0].brandName + ' and ' + cheapestGeneric.brandName + ' in the savings calculator');
    button.addEventListener('click', function () {
      fillCalculator(brands[0], cheapestGeneric);
    });
    body.append(button);
  }

  // The warning that appears on EVERY card
  const warning = makeElement('div', 'alert alert-warning substitution-warning mb-0');
  warning.setAttribute('role', 'note');
  warning.append(makeElement('strong', '', 'Not a recommendation to substitute. '));
  warning.append('These records only list the same ingredients, strength and form in fictional ' +
    'demonstration data. That does not show they are interchangeable for you, and prices are not real. ' +
    'Talk to a doctor or pharmacist before changing any medicine.');
  body.append(warning);

  card.append(body);
  column.append(card);
  return column;
}

/* ---------------------------------------------------------
   9. Empty, no-results and error states
   --------------------------------------------------------- */

// A reusable centred message box
function makeStateBox(icon, title, message, extraClass) {
  const column = makeElement('div', 'col-12');
  const box = makeElement('div', 'empty-state ' + (extraClass || ''));
  box.append(makeElement('span', 'empty-icon', icon));
  box.lastChild.setAttribute('aria-hidden', 'true'); // emoji is decoration only
  box.append(makeElement('h3', 'h5', title));
  box.append(makeElement('p', 'mb-0', message));
  column.append(box);
  return column;
}

// Unique ingredient names in the data, used as search suggestions
function allIngredientNames() {
  const names = new Set();
  medicines.forEach(function (medicine) {
    medicine.ingredients.forEach(function (ingredient) {
      names.add(ingredient.name);
    });
  });
  return Array.from(names).sort();
}

function showNoResults(query) {
  const column = makeStateBox('🔍', 'No matching sample records',
    'Nothing in the sample data matches “' + query + '”. Check the spelling, or try an ' +
    'active ingredient name instead of a brand. This small demo dataset only contains a few medicines.');

  // Suggestion buttons. Clicking one runs a search for that ingredient.
  const suggestions = makeElement('div', 'mt-3 d-flex flex-wrap justify-content-center gap-2');
  suggestions.setAttribute('aria-label', 'Ingredients available in the sample data');
  allIngredientNames().forEach(function (name) {
    const button = makeElement('button', 'btn btn-sm btn-outline-brand', name);
    button.type = 'button';
    button.addEventListener('click', function () {
      searchInput.value = name;
      runSearch(name);
    });
    suggestions.append(button);
  });
  column.firstChild.append(suggestions);

  resultsContainer.replaceChildren(column);
}

// Marks the search box as invalid (red border + screen-reader flag)
function setSearchInvalid(isInvalid) {
  searchInput.classList.toggle('is-invalid', isInvalid);
  searchInput.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
}

/* ---------------------------------------------------------
   The main search flow
   --------------------------------------------------------- */

function runSearch(rawQuery) {
  const query = rawQuery.trim();

  if (!dataLoaded) {
    setStatus('Please wait: the sample data has not loaded yet (or failed to load).');
    return;
  }

  // Input checks
  if (query.length === 0) {
    setSearchInvalid(true);
    setStatus('Please type a brand name or an active ingredient.');
    resultsContainer.replaceChildren();
    searchInput.focus();
    return;
  }
  if (query.length < MIN_QUERY_LENGTH) {
    setSearchInvalid(true);
    setStatus('Please type at least ' + MIN_QUERY_LENGTH + ' characters.');
    resultsContainer.replaceChildren();
    searchInput.focus();
    return;
  }
  if (query.length > MAX_QUERY_LENGTH) {
    setSearchInvalid(true);
    setStatus('That search is too long. Please use at most ' + MAX_QUERY_LENGTH + ' characters.');
    resultsContainer.replaceChildren();
    searchInput.focus();
    return;
  }
  setSearchInvalid(false);

  const matches = searchMedicines(query);
  if (matches.length === 0) {
    setStatus('No results for “' + query + '”.');
    showNoResults(query);
    return;
  }

  const groups = buildGroups(matches);
  setStatus('Found ' + pluralise(groups.length, 'comparison group') + ' for “' + query + '”.');

  const cards = groups.map(makeComparisonCard);
  resultsContainer.replaceChildren(...cards); // "..." spreads the list into separate arguments
}

/* ---------------------------------------------------------
   10. Savings calculator
   --------------------------------------------------------- */

function showCalcMessage(alertClass, lines) {
  const box = makeElement('div', 'alert ' + alertClass + ' mb-0');
  lines.forEach(function (line, i) {
    box.append(makeElement('p', i === lines.length - 1 ? 'mb-0' : 'mb-1', line));
  });
  calcResult.replaceChildren(box);
}

function clearCalcErrors() {
  [calcAPrice, calcASize, calcBPrice, calcBSize].forEach(function (input) {
    input.classList.remove('is-invalid');
    input.removeAttribute('aria-invalid');
  });
}

// Reads one number input. Returns the number, or null if it is invalid.
function readNumber(input, mustBeWhole) {
  const text = input.value.trim();
  const value = Number(text);
  const valid = text !== '' && Number.isFinite(value) && value > 0 &&
                (!mustBeWhole || Number.isInteger(value));
  if (!valid) {
    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    return null;
  }
  return value;
}

// unitLabel is optional: "tablet", "ml", ... (defaults to "unit")
function calculateSavings(unitLabel, heading) {
  const unit = unitLabel || 'unit';
  clearCalcErrors();

  const priceA = readNumber(calcAPrice, false);
  const sizeA = readNumber(calcASize, true);
  const priceB = readNumber(calcBPrice, false);
  const sizeB = readNumber(calcBSize, true);

  if (priceA === null || sizeA === null || priceB === null || sizeB === null) {
    showCalcMessage('alert-danger', [
      'Please check the highlighted fields.',
      'Pack prices must be numbers greater than 0, and units in pack must be whole numbers of 1 or more.'
    ]);
    return;
  }

  const result = compareUnitPrices(priceA, sizeA, priceB, sizeB);

  let summary;
  if (Math.abs(result.difference) < 0.005) {
    summary = 'Both packs cost the same per ' + unit + '.';
  } else if (result.difference > 0) {
    summary = 'Pack B is ' + formatRupees(result.difference) + ' per ' + unit + ' cheaper, which is ' +
      result.percent.toFixed(1) + '% less than Pack A.';
  } else {
    summary = 'Pack B is ' + formatRupees(-result.difference) + ' per ' + unit + ' more expensive, which is ' +
      (-result.percent).toFixed(1) + '% more than Pack A.';
  }

  const lines = [];
  if (heading) {
    lines.push(heading);
  }
  lines.push('Pack A: ' + formatRupees(result.unitA) + ' per ' + unit);
  lines.push('Pack B: ' + formatRupees(result.unitB) + ' per ' + unit);
  lines.push(summary);
  lines.push('Only compare packs measured in the same unit. This is arithmetic only, not advice.');

  showCalcMessage('alert-success', lines);
}

// Called by the "Use in calculator" button on a card
function fillCalculator(packA, packB) {
  calcAPrice.value = packA.packPrice;
  calcASize.value = packA.packSize;
  calcBPrice.value = packB.packPrice;
  calcBSize.value = packB.packSize;
  calculateSavings(packA.packUnit,
    'Comparing ' + packA.brandName + ' (A) with ' + packB.brandName + ' (B), sample prices:');
  calcAPrice.focus(); // moves keyboard focus (and the screen) to the calculator
}

/* ---------------------------------------------------------
   11. Connect everything to the page
   --------------------------------------------------------- */

searchForm.addEventListener('submit', function (event) {
  event.preventDefault(); // stop the browser from reloading the page
  runSearch(searchInput.value);
});

// Remove the red border as soon as the user starts typing again
searchInput.addEventListener('input', function () {
  setSearchInvalid(false);
});

calcForm.addEventListener('submit', function (event) {
  event.preventDefault();
  calculateSavings();
});

// The "Clear" button resets inputs; we also clear messages and errors
calcForm.addEventListener('reset', function () {
  clearCalcErrors();
  calcResult.replaceChildren();
});

// Start!
loadData();
