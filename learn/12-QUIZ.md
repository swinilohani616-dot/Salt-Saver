# 12. Test yourself

Cover the answer. Say yours first.

## Project

**What does SaltSaver do, in two sentences?**
It finds the salt in a branded medicine and the Jan Aushadhi generic with the same salt, strength, form, route and release type. It shows how much could be saved, and does not sell anything.

**Why is the saving not shown for every generic?**
Only verified matches get a saving. A wrong comparison could hurt someone.

**Why is the percent rounded down?**
To never promise more than the truth. The PRD also expects 81% for ₹30 and ₹5.50.

**Telma 40 is ₹108.36 for 15, the generic ₹12.38 for 10. What is the saving for 15?**
12.38 ÷ 10 × 15 = 18.57. Saving ₹89.79, 82%.

## Architecture

**Name the front-end layers.**
ui, state, services, core. A layer uses only the layers below it.

**Why is `js/core` pure?**
So it can be tested without a browser, and shared with the server.

**What happens when you search?**
`runSearch` → `/api/search` → `parseQuery` → `searchProducts` → `groupProducts` → `productSummary` → `compareResults` → cards.

**Why is there a server now?**
Thousands of medicines, price history, safe matching, and a database password that must stay secret.

## Data

**Where do prices come from?**
PMBI (generics), NPPA Pharma Sahi Daam (brands), or the user's own pack.

**Why not use the PMBI website's API?**
It is private and undocumented, and permission is needed.

**What stops a wrong file from damaging the data?**
Checksum, parsing errors shown not guessed, a report, approval by a person, a guard against many removals, and one transaction.

**Is the data live?**
No. It is imported from time to time, and each price shows its date.

## Code

**Why paise?**
Whole numbers avoid decimal errors.

**What is a formulation key?**
One text of salts, salt forms, strengths, form, route and release type. Same key means comparable.

**Why does `detectReleaseType` return unknown for "long acting"?**
It is release wording without a known marker. Unknown is safer than "plain".

**What was the cause of the Add to Basket bug?**
The saved line changed shape but the storage name stayed. An old open tab erased the new lines. Messages also covered the buttons.

**How is the Pharmacy Buyer stopped from using the basket?**
In the screen (button hidden) and in `basketService.checkRole`.

**How is XSS prevented?**
`el()` uses text nodes, never `innerHTML`.

## Honest questions

**Did you write all the code yourself?**
I decided what to build and asked for each change. Claude Code wrote the code from my requests.

**What is not finished?**
PMBI permission, import #2, NPPA ceilings, deployment, large-text overflow, five hand tests, and a bug in the brand review import.

**What went wrong during the project?**
Import #1 was approved without a clear yes. Medicine names were misread. The basket lost items. All are in [05-BUGS-AND-DECISIONS.md](05-BUGS-AND-DECISIONS.md).

**What would you do next?**
Get permission, approve the correction, import ceilings, fix the A+ overflow, deploy.
