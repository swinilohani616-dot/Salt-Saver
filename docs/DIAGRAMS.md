# SaltSaver — Diagrams

> **Note (Nov 2026):** these diagrams show the original static version. The current data flow is shown in [DATA_ARCHITECTURE.md](DATA_ARCHITECTURE.md#overview).

> Mermaid sources for every diagram. They render on GitHub; in VS Code install "Markdown Preview Mermaid Support". See [ARCHITECTURE.md](../ARCHITECTURE.md) and [USER_WORKFLOW.md](../USER_WORKFLOW.md).

## System architecture
*ARCHITECTURE §1–2* — Four layers in a static, browser-only app. Arrows point downward only: core never imports from services or UI, so it can be tested on its own and reused in a React refactor.

```mermaid
flowchart TB
  subgraph UI["UI layer · js/ui"]
    direction LR
    RS[roleSelector] ~~~ SV[searchView] ~~~ MC[medicineCard] ~~~ BV[basketView]
    A11Y[a11yControls] ~~~ PV[printView] ~~~ AL[alerts]
  end
  subgraph ST["State · js/state"]
    STORE[("store.js: role, results, basket, prefs, banner")]
  end
  subgraph SVC["Services · js/services"]
    direction LR
    MS[medicineService] ~~~ BS[basketService] ~~~ DS[dataService] ~~~ STG[storage]
  end
  subgraph CORE["Core · js/core · pure functions"]
    direction LR
    N[normalize] ~~~ SI[saltIndex] ~~~ SE[search] ~~~ SA[savings]
    VA[validate] ~~~ RO[roles] ~~~ SZ[sanitize] ~~~ ER[errors]
  end
  subgraph DATA["Data"]
    direction LR
    JSON[/"data/sample-data.json"/] ~~~ LS[("localStorage saltsaver:v1:*")] ~~~ MEM[("in-memory fallback")]
  end
  UI -- "user actions" --> SVC
  SVC -- "setState" --> ST
  ST -- "subscribe / re-render" --> UI
  SVC -- "pure calls" --> CORE
  DS -- "fetch on first run / reset" --> JSON
  STG -- "read / write" --> LS
  STG -. "quota full" .-> MEM
```

## User workflow
*USER_WORKFLOW §2* — The whole journey for all three roles, including the error branches from PRD §12.

```mermaid
flowchart TD
  A([Open SaltSaver]) --> B{Role saved?}
  B -- No --> C["Role selector: Patient/Senior, Caregiver, Pharmacy Buyer"]
  B -- Yes --> D[Search screen]
  C --> D
  D --> E[Type brand or salt name]
  E --> F{2 or more characters?}
  F -- No --> E
  F -- Yes --> G{Any matches?}
  G -- No --> H["'No brand found. Try searching by active salt name.'"]
  H --> E
  G -- Yes --> I["Result cards: Branded vs Generic price, Save %"]
  I --> J{Which role?}
  J -- Pharmacy Buyer --> K[Compare only]
  J -- Patient or Caregiver --> L[Set packs per month, click Add]
  L --> M{Quantity at least 1?}
  M -- No --> N["Alert: 'Quantity must be at least 1.'"]
  N --> L
  M -- Yes --> O["Basket updated, monthly savings recalculated, saved"]
  O --> P{Next step}
  P -- Add more --> E
  P -- Edit or remove --> O
  P -- Print --> Q["Print savings sheet / Save as PDF"]
  K --> Q
```

## Roles and capabilities
*PRD §4* — The PRD capability matrix. The Pharmacy Buyer has no basket; this is checked in the UI and again in basketService.

```mermaid
flowchart LR
  P(["Patient / Senior"])
  C(["Caregiver"])
  B(["Pharmacy Buyer"])
  S1[Select role]
  S2[Search brand or salt]
  S3[View generic and price difference]
  S4[Add to savings basket]
  S5[Print / export savings list]
  S6[Reset demo data]
  P --> S1 & S2 & S3 & S4 & S5 & S6
  C --> S1 & S2 & S3 & S4 & S5 & S6
  B --> S1 & S2 & S3 & S5 & S6
  B -. "blocked: ERR_FORBIDDEN" .-> S4
```

## App start-up
*ARCHITECTURE §6.1* — localStorage is used when it holds a valid database; otherwise the app seeds it from sample-data.json.

```mermaid
sequenceDiagram
  participant App as app.js
  participant DS as dataService
  participant ST as storage
  participant F as sample-data.json
  participant C as core
  participant S as store
  App->>ST: init() checks localStorage works
  App->>DS: loadDatabase()
  DS->>ST: get saltsaver:v1:db
  alt valid and schemaVersion is 1
    ST-->>DS: medicines
  else missing or invalid
    DS->>F: fetch
    F-->>DS: JSON
    DS->>C: validateDb()
    DS->>ST: save db
  end
  DS->>C: buildSaltIndex(medicines)
  DS-->>App: medicines and saltIndex
  App->>ST: read basket, role, prefs
  App->>S: init state
  App->>App: apply font size and contrast, mount views
  opt no saved role
    App->>App: open role selector
  end
```

## Search and substitute cards
*FR-01 · FR-02 · BR-03* — Search runs 250 ms after the last keystroke and matches brand, salt and generic names.

```mermaid
sequenceDiagram
  actor U as User
  participant SV as searchView
  participant MS as medicineService
  participant SE as core/search
  participant SI as saltIndex
  participant MC as medicineCard
  U->>SV: types "Crocin"
  SV->>SV: debounce 250 ms
  SV->>MS: searchMedicine("Crocin")
  MS->>SE: normalize, match, rank
  SE-->>MS: ranked medicines
  MS->>SI: same-salt substitutes
  alt matches found
    MS-->>SV: ok, results
    SV->>MC: render one card per result
    MC-->>U: "Paracetamol 500mg · Rs 30.00 vs Rs 5.50 · Save 81%"
    SV-->>U: screen reader hears "1 medicine found"
  else no matches
    MS-->>SV: ERR_NOT_FOUND
    SV-->>U: "No brand found. Try searching by active salt name."
  end
```

## Add to basket and savings
*FR-03 · FR-04 · BR-01* — savings = (brandPrice − genericPrice) × quantity, calculated in whole paise. The basket stores only IDs and quantities.

```mermaid
sequenceDiagram
  actor U as Patient
  participant MC as medicineCard
  participant BS as basketService
  participant V as core/validate and roles
  participant ST as storage
  participant SA as core/savings
  participant BV as basketView
  U->>MC: packs per month = 2, click Add
  MC->>BS: addToBasket("med_101", 2)
  BS->>V: validateQuantity(2), can(role, addToBasket)
  alt invalid quantity
    V-->>BS: ERR_VALIDATION
    BS-->>U: "Quantity must be at least 1."
  else role is Pharmacy Buyer
    V-->>BS: ERR_FORBIDDEN
  else valid
    BS->>BS: merge with existing line
    BS->>ST: safeSet(basket)
    BS->>SA: basketSummary(basket)
    SA-->>BV: totals per line and per month
    BV-->>U: toast "Crocin added" and new monthly saving
  end
```

## Search area states
*USER_WORKFLOW W2* — Every state the results area can show, and what moves it between them.

```mermaid
stateDiagram-v2
  [*] --> Loading
  Loading --> Idle: data loaded
  Loading --> DataError: fetch failed
  Idle --> TooShort: 1 character
  TooShort --> Idle: cleared
  TooShort --> Searching: 2+ characters
  Idle --> Searching: 2+ characters
  Searching --> Results: matches found
  Searching --> NotFound: no matches
  Results --> Searching: query changed
  NotFound --> Searching: query changed
  Results --> Idle: cleared
  NotFound --> Idle: cleared
  DataError --> Loading: refresh
```

## Storage and fallback
*PRD §12* — When localStorage is full or blocked, the basket moves to memory for the rest of the tab and a banner tells the user.

```mermaid
flowchart TD
  A[Basket changed] --> B["storage.safeSet()"]
  B --> C{localStorage write OK?}
  C -- Yes --> D[("saltsaver:v1:basket")]
  C -- "No: QuotaExceeded or SecurityError" --> E[Switch to in-memory Map]
  E --> F["Banner: 'Storage is full. Your basket will be kept until you close this tab.'"]
  F --> G[Suggest printing a copy]
  D --> H[Reload page]
  H --> I[Basket restored]
```

## Print savings sheet
*FR-05* — No PDF library: the print stylesheet shows only the sheet, and the browser's "Save as PDF" gives the PDF.

```mermaid
flowchart LR
  A{Basket empty?} -- Yes --> B[Print button disabled]
  A -- No --> C[Click Print savings sheet]
  C --> D["printView.build(): date, table, totals, disclaimer"]
  D --> E["window.print()"]
  E --> F["print.css hides everything except the sheet"]
  F --> G[Paper copy]
  F --> H[Save as PDF]
  G & H --> I[Show at the Jan Aushadhi counter]
```

## Data model
*PRD §8 · ARCHITECTURE §3* — Medicines are grouped by a normalized salt key. Basket items point to a medicine by ID; prices are always read from the medicine record.

```mermaid
erDiagram
  SALT_GROUP ||--|{ MEDICINE : "groups same-salt products"
  MEDICINE ||--o{ BASKET_ITEM : "saved as"
  APP_STATE ||--o{ BASKET_ITEM : holds
  SALT_GROUP {
    string saltKey PK "e.g. paracetamol 500mg"
  }
  MEDICINE {
    string id PK "med_101"
    string brandName "Crocin 500mg"
    string activeSalt "Paracetamol 500mg"
    number brandPrice "30.00"
    string genericName "Jan Aushadhi Paracetamol 500mg"
    number genericPrice "5.50"
    string manufacturer
    string category "optional"
    string packSize "optional"
  }
  BASKET_ITEM {
    string medicineId FK
    int quantityPerMonth "1 to 999"
  }
  APP_STATE {
    string role "patient, caregiver, pharmacy"
    float fontScale "1, 1.25, 1.5"
    bool highContrast
  }
```
