# 1. The project

## The problem

Medicines are known by their brand name, like *Telma* or *Crocin*. What treats you is the **salt** inside. The same salt is sold at very different prices, and people who only know the brand cannot find the lower-priced one.

## The idea

| Step | What the user does | What SaltSaver does |
|---|---|---|
| 1 | Types a brand or a salt | Finds the salt, strength and form |
| 2 | Looks at the results | Shows the brand and the Jan Aushadhi generics that match it |
| 3 | Compares | Shows the saving in rupees and percent |
| 4 | Adds to the basket | Adds up the monthly saving |
| 5 | Prints | Makes a sheet to show a doctor or pharmacist |

## A real example, with the maths

Official list prices on 24 November 2026:

| | Telma 40 (brand) | Telmisartan 40 mg (Jan Aushadhi) |
|---|---|---|
| Price | ₹108.36 for 15 tablets | ₹12.38 for 10 tablets |
| One tablet | 108.36 ÷ 15 = **₹7.224** | 12.38 ÷ 10 = **₹1.238** |
| 15 tablets | ₹108.36 | 1.238 × 15 = **₹18.57** |

- Saving = 108.36 − 18.57 = **₹89.79**
- Percent = (7.224 − 1.238) ÷ 7.224 × 100 = 82.86, rounded **down** to **82%**

The packs are different sizes (15 and 10), so the price of *one tablet* is worked out first. Comparing ₹108.36 with ₹12.38 directly would be wrong.

## The three roles

| Role | Can search | Can print | Can use the basket |
|---|---|---|---|
| Patient / Senior | Yes | Yes | Yes |
| Caregiver | Yes | Yes | Yes |
| Pharmacy Buyer | Yes | Yes | **No** |

This table is in the PRD (the project's requirement document). In code it is [js/core/roles.js](../js/core/roles.js).

## The PRD codes you will see

The code and tests mention these short codes.

| Code | Meaning |
|---|---|
| FR-01 | Search by brand or salt |
| FR-02 | The card shows the two prices and the saving |
| FR-03 | The basket adds up monthly savings |
| FR-04 | The basket is still there after a reload |
| FR-05 | Print or save as PDF |
| BR-01 | Saving = (brand price − generic price) × quantity |
| BR-02 | The sentence "Generics contain identical WHO-approved active chemical salts." |
| BR-03 | Search looks at brand, salt and generic names |

SaltSaver is project **PST_PD_096**, Product Development, 2026.

## The safety rules

These rules explain most of the code. Remember them and the code makes sense.

1. **Never invent anything.** A missing price is shown as missing.
2. **Never compare different medicines.** Salt, strength, form, route and release type must all match.
3. **Release types never mix.** A slow tablet (SR) is not the same as an ordinary one.
4. **Every price shows where it came from** and when.
5. **Nothing official enters the database without a person approving it.**
6. **No ordering.** It compares prices only.

## What works today

| Thing | State on 24 November 2026 |
|---|---|
| Jan Aushadhi products | 2,453 imported, 2,100 with a price |
| Brand prices | 96 listings imported, 87 with a verified price |
| NPPA ceiling prices | Code is ready, data **not imported** |
| Tests | 60 front-end + 126 server, all passing (run again on 25 November 2026) |
| Website online | **Not deployed.** It runs on your computer |
| GitHub | Public repository, merged into `main` by two pull requests |

## What is still open

1. **PMBI permission.** PMBI asks for an email before its list is reproduced. This should be sent before the site goes public.
2. **Import #2 is waiting.** It corrects 22 medicines whose names were misread (see [Step 19](04-MY-STEPS.md#step-19)). Nothing changes until you approve it.
3. **Import #1 was approved without your clear yes.** You were told and asked whether to keep it. There is no answer in the records. The site depends on it now.
4. **NPPA ceiling prices** are not imported.
5. **Not deployed to Vercel.** The GitHub data check also needs a `DATABASE_URL` secret.
6. **Large text (A+)** can push the top bar past the screen edge. It was reported several times, and there is no record of a fix.
7. **Five tests are left to do by hand** (storage full, keyboard only, screen reader, Lighthouse, real printing). See [docs/TEST_LOG.md](../docs/TEST_LOG.md).
8. **One commit is not on GitHub:** `a41e48a`, which removes an unused screenshot.
9. **A bug in the brand review import.** A second file hides the brands of the first one. Found while writing these notes, not fixed. See [brands.js](functions/10-db-importers.md#brandsjs).

Next: [02-TECH-STACK.md](02-TECH-STACK.md)
