# SaltSaver — Manual Test Log

Run each test in a fresh browser profile, or click **Reset demo** first. Record the date, browser and result.
The first run below was automated in headless Chrome 1280×900 and 390×844. Repeat it by hand in Week 4 and add your own rows.

| ID | Requirement | Steps | Expected | Result | Date / Browser / Tester |
|---|---|---|---|---|---|
| T01 | Role (PRD §4) | Open the app for the first time | The "Who is using SaltSaver today?" modal opens | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T02 | FR-01 | Choose Patient. Type `Crocin` | The card shows salt **Paracetamol 500mg** | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T03 | FR-02 | Look at the Crocin card | Branded **₹30.00** vs Generic **₹5.50**, badge **Save 81%** | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T04 | BR-02 | Look at any card | It shows "Generics contain identical WHO-approved active chemical salts." | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T05 | BR-03 | Type `Paracetamol` | Crocin, Calpol and Dolo 650 are listed | ✅ Pass | 2026-11-19 / Node test suite |
| T06 | PRD §12 | On a card, set packs to `0` and click Add | Alert "Quantity must be at least 1."; nothing is added | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T07 | FR-03 | Add Crocin × 2 and Glycomet 500 × 1 | "You save per month" shows **₹68.00 (80%)** | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T08 | FR-04 | Reload the page | The basket still has both medicines and ₹68.00 | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T09 | PRD §12 | Type `xyz` | "No brand found. Try searching by active salt name." | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T10 | Salt badge | Search Crocin, click the "Paracetamol 500mg" badge | Crocin and Calpol are both listed | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T11 | FR-05 | Click **Print savings sheet** | The print dialog opens; the preview shows only the savings table | ✅ Pass (print media emulated) | 2026-11-19 / Chrome headless / automated |
| T12 | PRD §16 | Click **A+**, then **High contrast** | Text grows to 125%; black/white/yellow theme | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T13 | PRD §4 | Switch role to Pharmacy Buyer | The basket is hidden; cards show "Print this comparison" | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T14 | Responsive | View at 390px width | No sideways scrolling; the bottom bar opens the basket | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T15 | Reset | Click **Reset demo** → confirm | The basket and role are cleared; the role modal opens | ✅ Pass | 2026-11-19 / Chrome headless / automated |
| T16 | Storage full | DevTools → Application → set the storage quota very low, or use a browser that blocks storage | The yellow banner appears and the basket keeps working in this tab | ☐ To do by hand | |
| T17 | Keyboard | Use only Tab / Enter / Esc for T02–T08 | Every control is reachable, the focus ring is visible, and Esc closes dialogs | ☐ To do by hand | |
| T18 | Screen reader | VoiceOver / NVDA: search, add | Hears the results count and the "added" message | ☐ To do by hand | |
| T19 | Lighthouse | Chrome DevTools → Lighthouse → Accessibility | Score ≥ 95 | ☐ To do by hand | |
| T20 | Real print | Print to paper / Save as PDF in Chrome, Firefox and Safari | One clean page with the table and totals | ☐ To do by hand | |
