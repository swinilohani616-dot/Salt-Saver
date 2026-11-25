# 7. The API

An API is a set of addresses a program can ask. The browser asks, the server answers in JSON. All of them are in [server/app.js](../server/app.js).

| Address | Who uses it | Answer |
|---|---|---|
| `GET /api/health` | You, for checking | Is the database reachable? |
| `GET /api/status` | Every page at start | Each source, how old it is, and counts |
| `GET /api/search?q=crocin` | Search page | Groups of brands and generics |
| `GET /api/suggest?q=cro` | Landing and search page | Names while you type |
| `GET /api/products?ids=1,2` | Basket page | Today's prices |
| `GET /api/products/12/alternatives` | No page now (tests only) | One product and its options |
| `GET /api/medicines` | No page now (tests only) | The 28 demo medicines, old shape |

Every address only **reads**. There is no address that changes data.

## What a search answer looks like

```
{
  "query": "telma 40",
  "matchedBy": "name",              "similar" means: no exact match, these are close
  "groups": [                       one per formulation
    {
      "composition": "Telmisartan 40 mg",
      "dosageForm": "tablet", "route": "oral", "releaseType": "ir",
      "brands":   [ { name, price, pack, ... } ],
      "generics": [ { product: {...}, matches: { "brandId": { status, reasons } } } ],
      "ceilings": [ ]               legal maximum, when NPPA data is loaded
    }
  ],
  "other": [ ],                     found, but not enough details to compare
  "notEquivalent": 3,               hidden because they are different
  "truncated": false,               true when there were too many
  "disclaimer": "Possible alternative only. ..."
}
```

Each product carries `priceStatus`: `verified` or `none`.

## Errors

Every error has the same shape: `{ "error": { "code": "...", "message": "..." } }`

| Code | HTTP | When |
|---|---|---|
| `QUERY_TOO_SHORT` | 400 | Fewer than 2 letters |
| `QUERY_TOO_LONG` | 400 | More than 60 |
| `BAD_QUERY` | 400 | Strange characters |
| `BAD_ID`, `BAD_IDS`, `BAD_RELEASE` | 400 | Wrong id or release type |
| `NOT_FOUND` | 404 | No such medicine or address |
| `RATE_LIMITED` | 429 | More than 60 in a minute |
| `DB_UNAVAILABLE` | 503 | Database problem |
| `INTERNAL` | 500 | Anything else |

The real error is written in the server log. The user gets a friendly sentence.

**Why (Design choice):** error details can show an attacker how the system works.

## Try it

With the server running (`npm start`), open these in the browser:

- http://localhost:3000/api/health
- http://localhost:3000/api/status
- http://localhost:3000/api/search?q=telma%2040

Next: [08-PAGES-HTML-CSS.md](08-PAGES-HTML-CSS.md)
