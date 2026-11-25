# Function notes 6: lib/pharma (understanding medicines)

This folder reads medicine names and decides if two medicines are the same. Browser and server both use it.

| File | Job | Made in |
|---|---|---|
| [text.js](#textjs) | Clean text | Step 10 |
| [strength.js](#strengthjs) | 500 mg, 250 mg/5 ml | Step 10 |
| [ingredients.js](#ingredientsjs) | Salt names | Step 10 |
| [forms.js](#formsjs) | Form, route, release | Step 10, fixed 19 |
| [composition.js](#compositionjs) | Read a whole name | Step 10 |
| [pack.js](#packjs) | "10's" = 10 | Step 10 |
| [match.js](#matchjs) | Same medicine? | Step 10 |
| [formulation.js](#formulationjs) | Formulation key | Step 14 |
| [query.js](#queryjs) | What you typed | Step 20 |
| [groups.js](#groupsjs) | Group the results | Step 20 |

**Why this folder exists:** the government list gives only a name, like *"Metformin Hydrochloride Sustained Release Tablets IP 500 mg"*. Strength, form and release type have no columns of their own. They must be read out of the name.

**The main rule:** if something cannot be read, say so. Never guess.

---

## text.js

[Source](../../lib/pharma/text.js)

### `prepText(value)`
- **What:** `"Metformin HCl S.R. Tablets I.P. 1,000 mg"` → `"metformin hcl sr tablets ip 1000 mg"`.
- **Why:** Indian labels write one thing in many ways: S.R., SR, µg, 12 lac.
- **Careful part:** `0,25` is unclear (0.25 or 025?). It is made unreadable instead of guessed.

### `nameKey(value)`
- **What:** like `prepText`, also without `+`, `%` and `/`.
- **Why:** key to look up a salt.

### `escapeRegExp(s)`
- **What:** makes text safe inside a pattern. Not used anywhere now.

## strength.js

[Source](../../lib/pharma/strength.js)

| Function | What | Why |
|---|---|---|
| `unitOf(raw)` | milligrams → mg | One spelling |
| `build(match)` | Makes a strength object | Refuses zero or unknown units |
| `STRENGTH_PATTERN` | The pattern for a strength | `d3` in "Vitamin D3" must not become 3 |
| `findStrengths(text)` | All strengths, with their places | |
| `parseStrength(text)` | Exactly one strength, or null | Tests only |
| `parseStrengthList(text)` | All, without places | Tests only |
| `canonicalStrength(s)` | `250 mg/5 ml` → 50 mg per ml. 1 g → 1000 mg | So they can be compared |
| `sameStrength(a, b)` | Are they equal? | 0.5 g equals 500 mg |
| `formatStrength(s)` | Back to text for people | |

## ingredients.js

[Source](../../lib/pharma/ingredients.js)

### `createIngredientResolver({ ingredients, aliases })`
- **What:** makes a "name finder". It has `resolve`, `has` and `nameOf`.
- **Why:** names live in the database, so it is built from there.

### `resolve(raw)`
- **What:** `"Metformin HCl"` → metformin, salt form hydrochloride.
- **How:** exact name → alias → remove salt words one at a time.
- **Why:** Acetaminophen, Paracetamol and PCM are one salt.
- **Careful part:** `zinc sulphate` is not shortened to `zinc`. An unknown name is kept and marked `known: false`.

| Function | What | Why |
|---|---|---|
| `lookup(k)` | Name or alias | Inside the resolver |
| `normalizeSaltForm(word)` | hcl → hydrochloride | Not used anywhere now |
| `titleCase(s)` | paracetamol → Paracetamol | |
| `resolverDataFromCurated(list)` | Resolver data without a database | Tests only |

## forms.js

[Source](../../lib/pharma/forms.js)

**Changed ([Step 19](../04-MY-STEPS.md#step-19)):** PMBI also writes "relase" and "gastro-resistance". Those medicines were read as plain. Now the spellings are known, and any other release wording ("long acting") is **unknown**.

| Function | What | Why |
|---|---|---|
| `detectDosageForm(text)` | tablet, syrup… first match wins | "Dispersible tablet" must be tested before "tablet". Plain "drops" is unclear and is reported |
| `routeForForm(code)` | tablet → oral | |
| `detectRoute(text, formCode)` | Words win over the form | "Eye ointment" is for the eye. "Eye/ear drops" gives unknown |
| `detectReleaseType(text, formCode)` | sr, er… or ir or unknown | Two different markers → conflict. No wording on a known form → ir, because Indian labels always name a slow release |
| `detectPharmacopoeia(text)` | IP, BP, USP | |
| `isSolidOral(code)` | Tablet or capsule? | Not used anywhere now |
| `NOISE_WORDS` | Words removed before reading salts | "tablets", "ip", "film coated" are not salts |

## composition.js

[Source](../../lib/pharma/composition.js). The hardest file of the project.

### `parseComposition(raw, resolver)`
- **What:** reads the whole name: salts, strengths, form, route, release type, plus errors and warnings.
- **Two styles it understands:**
  - inside: `Glimepiride 1mg + Metformin (SR) 500mg Tablets`
  - at the end: `Amoxycillin and Potassium Clavulanate Tablets IP 500 mg + 125 mg`
- **How:** replace each strength with a marker, remove noise words, then connect names with strengths.
- **Why errors:** if there are 2 names and 3 strengths, it does not decide which belongs to which.

| Function | What | Why |
|---|---|---|
| `cleanName(s)` | Removes + , / % and "and" | |
| `splitNames(text)` | "a and b" → two names | |
| `splitEquivalent(text)` | "X eq. to Y" → both parts | |
| `TOKEN(i)` | Marker for a strength | A sign no name can contain |
| `pick(strength)` | Only the four strength fields | |
| `strengthKey(strength)` | Strength as key text | "1% w/w" and "1%" find each other |
| `compositionKey(ingredients)` | `"amoxycillin 500 mg + clavulanic acid 125 mg"`, sorted | Same salts in any order give the same key. Null if a strength is missing |
| `formatComposition(ingredients)` | For people | Tests only |

## pack.js

[Source](../../lib/pharma/pack.js)

| Name | What | Why |
|---|---|---|
| `UNIT_BASIS` | tablet → tablet, syrup → ml, cream → g | What one unit is |
| `named(t, unit)` | "15 tablets" → 15 | |
| `multiplied(t)` | "10 x 10" → 100 | |
| `round(n)` | 3 decimals | |
| `ok(count, unit)` | A good answer, or an error if 0 | Inside `parsePack` |
| `parsePack(label, form)` | Any pack text → number and unit | Prices are per unit |
| `unitPrice(price, count)` | Price ÷ count, 4 decimals | Null if unknown |

## match.js

[Source](../../lib/pharma/match.js). **Changed (Step 20):** a liquid without a volume is not compared. `ENGINE_VERSION` is now `v2`.

| Name | What | Why |
|---|---|---|
| `STATUS` | The four results | |
| `DISCLAIMER` | "Possible alternative only…" | Your plan's exact sentence |
| `ENGINE_VERSION` | Stored with each result | To know which rules made it |
| `RELEASE_CODES` | All release types | Checks input |
| `familyOf(code)` | Related forms | Tablet and dispersible tablet → a pharmacist can judge |
| `formName(code)`, `releaseName(code)` | Words | |
| `lacksVolume(strength, form)` | Liquid without "per ml"? | "120 mg" could be per 5 ml or per ml |
| `compareAmounts(a, b)` | same / differs / unclear / missing | Handles "eq. to" |
| `amountText(i)` | The amount, for the reason text | |

### `compareProducts(original, candidate)`
- **What:** the matching engine. Returns a status and **all** the reasons. Inside: `add` records a reason, `has` asks if there is one of a kind.
- **Why:** the checks come from section 5 of your plan. The worst reason decides: mismatch, then missing, then review, else verified.

### `statusRank(s)`
- **What:** order for sorting, best first.

## formulation.js

[Source](../../lib/pharma/formulation.js). New in Step 14.

### `formulationKey(product)`
- **What:** salts + salt forms + strengths + form + route + release as one text.
- **Why:** same key means prices may be compared. Null if **anything** is unknown.
- **Changed (Step 20):** null for a liquid without a volume.

## query.js

[Source](../../lib/pharma/query.js). New in [Step 20](../04-MY-STEPS.md#step-20), because "Crocin 500mg" also found Lincomycin 500mg.

### `parseQuery(raw)`
- **What:** `"metformin SR tablet"` → name *metformin*, release *sr*, form *tablet*. Inside, `endPhrase` closes one salt of a combination.
- **Why:** each part is matched in its own way. If only "650" was typed, names are searched for it.

### `strengthValues({ value, unit })`
- **What:** 1 g is also 1000 mg.
- **Why:** lists use both.

## groups.js

[Source](../../lib/pharma/groups.js). New in Step 20.

| Function | What | Why |
|---|---|---|
| `formRank(code)` | Tablets first, then others | Order of groups |
| `familyKey(p)` | Salts, strengths, form, route | Like a formulation without the release type |
| `amounts(p)`, `label(p)`, `unitPrice(p)` | Small helpers for sorting and titles | |
| `mergePacks(brands)` | Strip of 15 and strip of 30 → one card, the cheapest per unit | A saving is never made to look bigger |

### `groupProducts(products)`
- **What:** makes the groups, and compares every generic with every brand.
- **Why:** brand search and salt search end in the same place.
- **Important:** sharing a group is only layout. The match comes from `compareProducts`.
- **Careful part:** a brand with unknown release type is never filed under one it may not have.
- Inside: `bucket` (find or make a group), `match`, `matchesFor` (all matches of a generic), `best` (best status), `compareAmounts` (sort by strength).
