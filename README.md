# Opptra Discount Engine — FDE Intern Assignment

**Live deployment:** https://discount-engine-assignment-eight.vercel.app/

---

## Run Locally (3 steps)

```bash
# 1. Install dependencie
npm install

# 2. Add your Groq API key (for natural-language rule input)
# Edit .env and set VITE_GROQ_API_KEY=gsk_your_key_here

# 3. Start the dev server
npm run dev
```

Open **http://localhost:5173** — upload the CSVs from `sample-data/` and click **Calculate Discounts**.

---

## Features

### Base Engine
- Upload `rules.csv` and `cart.csv` from `sample-data/`
- Item-level discount selection: picks the non-stackable rule giving the **maximum saving**, then stacks stackable rules on top
- "No offers available" note for items with no matching rules

### Task 1 — Cart-Level Offer
- `RULE-04` (scope: `cart`) applies a 10% discount to the **entire cart total** when it meets or exceeds Rs.4,000
- Cart offer row shows as a separate highlighted line in results: e.g. `Cart offer: 10% off — Rs.593 saved`
- If the cart total is below the threshold, the offer row is hidden and a "Add Rs.X more to unlock" hint appears instead

### Task 2 — Natural Language Rule Input
- Describe a rule in plain English → Groq LLM (`llama-3.3-70b-versatile`) parses it into a structured `DiscountRule`
- A **confirmation card** shows every parsed field before the rule is committed
- Ambiguous input (e.g. "Give a discount for big orders") surfaces a yellow warning explaining what's missing — no crash
- The engine re-runs automatically after confirmation

### Task 3 — PDF Cart Upload
- Switch the Cart section to "PDF Upload" tab
- Upload an order PDF — the parser extracts the product table and replaces the current cart
- Engine re-runs automatically with existing rules
- Malformed rows appear as warnings; valid rows still load
- Use `sample-data/cart.pdf` to test (generated from the same 6 sample items)

---

## Architecture

```
src/
├── engine/
│   ├── discountEngine.js    # Pure logic — no UI imports
│   ├── csvParser.js         # CSV → CartItem / DiscountRule
│   ├── llmRuleParser.js     # Groq API → validated DiscountRule
│   └── pdfCartParser.js     # pdf.js → CartItem[]
└── components/
    ├── NaturalLanguageRuleInput.jsx   # NL text → confirm → add rule
    ├── PdfUploader.jsx                # PDF drop zone
    ├── CsvUploader.jsx
    ├── DataTable.jsx
    └── ErrorBanner.jsx
```

**Key design principle:** The discount engine is untouched by new input paths. Each new input mode (NL text, PDF) normalises its data into the same `CartItem`/`DiscountRule` shapes before passing to the engine. Adding a 4th input mode (e.g. voice, API) requires zero changes to `discountEngine.js`.

---

## Expected Results

| Item | Base Price | Rules Applied | Final Price |
|------|-----------|---------------|-------------|
| ITEM-01 Cushion Cover | Rs.1,299 | RULE-01 wins (15% > Rs.150) | **Rs.1,104** |
| ITEM-02 Bed Sheet Set | Rs.849 | RULE-02 (−Rs.150) + RULE-03 stacked (−10%) | **Rs.629** |
| ITEM-03 Wall Shelf | Rs.599 | RULE-01 (15% off) | **Rs.509** |
| ITEM-04 Ceramic Vase | Rs.2,499 | No rules match | **Rs.2,499** |
| ITEM-05 Cutting Board | Rs.449 | RULE-01 (15% off) | **Rs.382** |
| ITEM-06 Desk Organiser | Rs.899 | RULE-03 (10% off) | **Rs.809** |
| **Cart offer (RULE-04)** | Rs.5,932 ≥ Rs.4,000 | 10% off entire cart | **−Rs.593** |
| **Final cart total** | | | **Rs.5,339** |

---

## Tradeoff Notes

- **PDF parsing is client-side** — avoids a backend entirely. This works well for text-based PDFs but not scanned/image PDFs. The error message makes this clear to the user.
- **LLM key is user-supplied at runtime** — not baked into the build, so the repo can be public without leaking credentials. The `.env` file can still be used for local dev.
- **Cart offer shows a "nearly there" hint** — when the cart is below the threshold, rather than silently hiding the offer, we tell the user how much more they need to add. This is a deliberate UX choice for a customer-facing tool.
- **Ambiguous NL rules surface an error, not a silent discard** — the user is told exactly what's missing, which is more useful than the alternative (failing silently or adding a broken rule).

---

## Deploy

```bash
npm run build
# Upload the dist/ folder to Vercel, Netlify, or any static host
```

No server required — this is a fully static React app.
