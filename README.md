# ESHCO ELEMENTS — Inventory Management System

ESHCO ELEMENTS (원자재·포장재 납품 전문) internal inventory & sales management system. PO, invoices, expenses, and reports in one place.

---

## ESHC Group Structure

| Site | URL |
|------|-----|
| Master Landing | https://www.eshcgroup.com |
| I AM PURE | https://iampure.eshcgroup.com |
| **ESHCO ELEMENTS** | **https://eshco.eshcgroup.com** |

---

## Deployment

| Environment | URL |
|-------------|-----|
| Production | https://eshco.eshcgroup.com |
| GitHub | https://github.com/ethanchang-source/eshco-elements-inventory |
| Local | ~/Desktop/eshco-elements-inventory |
| Supabase | https://xkyzuczpgicuanxtebcr.supabase.co |

`main` branch push → Vercel auto-deploy.

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| DB / Auth | Supabase (PostgreSQL + Supabase Auth) |
| UI | Tailwind CSS v4, lucide-react, recharts |
| PDF | jsPDF + jspdf-autotable |
| Excel | xlsx (SheetJS) |
| PowerPoint | pptxgenjs |
| Barcode scan | html5-qrcode |
| Deployment | Vercel |

---

## Complete Feature List

### Authentication (`/login`, `/reset-password`)
- Supabase Auth (email + password)
- `middleware.ts` protects all routes — unauthenticated → `/login`
- Public: `/login`, `/reset-password`, `/auth/confirm`

### Dashboard (`/dashboard`)
- KPI cards: total products, active raw materials, active packaging, monthly invoice total (CAD)
- Low Stock alerts (below reorder threshold)
- Recent invoices + quick navigation

### Products (`/products`)
- Tabs: **Raw Materials** / **Packaging**
- Raw Materials: item_no, name, unit (ml/kg/drum), cost CAD/USD, avg cost, stock, supplier link
- Packaging: item_no, name, type, unit (ea/roll), cost, avg cost, stock, module_qty, supplier link
- CRUD + Excel import/export + Undo Toast

### Inventory (`/inventory`)
- Tabs: **Raw Materials** / **Packaging**
- Reorder threshold + max_capacity settings
- Purchase History popup per item
- Excel import/export, Undo Toast

### Inventory History (`/inventory-history`)
- Date snapshot viewer
- Two-date comparison (Compare mode)
- Manual snapshot capture

### Invoices (`/invoices`)
- Tabs: **CAD** / **USD**
- Auto-increment invoice numbers (gap-fill)
- Create/edit/delete (Draft → Sent → Paid)
- **Paid invoices are fully editable**
- Line items: raw material or packaging, qty, unit price, discount
- Customer-specific custom pricing auto-applied (`customer_prices`)
- HST auto-calculation (HST# 752458133RT0001)
- Delivery date + payment date
- **PDF output** with company logo
- **Credit Memos**: PDF output
- Excel import/export

### Customers (`/customers`)
- `bill_to_corp_name` / `ship_to_corp_name` / `ship_to_name` columns
- `bill_to_same_as_ship_to` toggle
- Per-customer custom pricing via `customer_prices`
- Excel import/export + template

### Suppliers (`/suppliers`)
- Contact, country, ship-to / bill-to addresses
- `bill_to_same_as_ship_to` toggle
- Excel import/export + template

### Purchasing (`/purchasing`)
- PO creation: supplier, multi-line items (raw material / packaging)
- **Drum unit input for raw materials**:
  - Purchase Unit: ml / kg / Drum
  - Drum: enter count + kg/drum → auto-converts to ml for quantity storage
  - unit_price stored as ml-basis
  - purchase_unit and weight_per_drum columns saved for edit reverse-calculation
- PO list Items column: always "N item(s)" format (never shows item name for single items)
- Status: Draft → Ordered → Shipped → Received → Cancelled
- Cost fields: goods (CAD/USD), exchange rate, shipping, brokerage, duty
- **Attachments**: Supabase Storage multi-file upload per PO
- On Received: stock auto-updated
- Shipped Date direct input

### Expenses (`/expenses`)
- Expense CRUD: date, category, type, payee, description, tax, payment method, currency, exchange rate
- **No `freight_tip`, `reference`, `deleted_at` columns** (ESHCO schema differs from I AM PURE)
- **Category filter** dropdown
- **Monthly Summary by Category**
- Receipt file upload (Supabase Storage)
- **Yearly Excel Export**: `{year}_Expenses-ESHCO_Elements.xlsx`
  - Summary sheet + 12 monthly sheets
  - Query uses NO `deleted_at` filter (column does not exist)

### Reports (`/reports`)

Tabs: **Overview** / **Revenue** / **All-Time Summary** / **P&L** / **By Customer** / **Expenses** / **Tax Summary**

#### Overview tab
- Year selector (2020–present)
- KPI cards: total revenue, paid, unpaid, invoice count, avg order value, units sold
- Gross Profit Summary: revenue, COGS, gross profit, gross margin %, est. net profit
- Monthly revenue bar chart + quarterly breakdown
- Top 10 items by revenue
- PowerPoint annual report export

#### All-Time Summary tab
- 5 KPI dark cards: All-Time Revenue, Units Sold, Expenses, Gross Margin, Current Inventory Value
- Revenue by Year table + chart
- Units Sold by Year table + chart
- All data fetched with pagination (1000/page); no `deleted_at` filter on expenses

#### P&L tab
- Monthly table: Revenue / Gross Profit / GP% / Expenses / Net Profit / Net%
- Job Materials category excluded from expenses
- recharts BarChart: Revenue / Gross Profit / Net Profit

#### By Customer tab
- HERA BEAUTY grouped across all locations
- Drill-down modal: top 10 items per customer

#### Expenses tab
- Expenses by Category (year × month)
- All-years expense report + chart
- No `deleted_at` filter (column does not exist in ESHCO schema)

### Other Pages
- **Barcode Scan** (`/scan`): raw material / packaging lookup
- **Activity Log** (`/activity`): INSERT/UPDATE/DELETE auto-logging, before/after diff
- **Data Backup** (`/backup`): Full Excel backup (all tables)
- **PWA**: `manifest.json`, `apple-touch-icon`

---

## DB Schema (Supabase — xkyzuczpgicuanxtebcr)

```
raw_materials
  id, item_no, name, unit
  cost_per_unit_cad, cost_per_unit_usd, avg_cost_cad
  current_stock, reorder_threshold, max_capacity
  purchase_unit, purchase_unit_kg
  preferred_supplier_id → suppliers

packaging
  id, item_no, name, type, unit, size_oz
  cost_cad, avg_cost_cad
  current_stock, reorder_threshold, max_capacity
  module_qty, roll_length_m
  preferred_supplier_id → suppliers

customers
  id, company_name
  warehouse_address, city, province, postal_code        -- Bill To
  ship_to_address, ship_to_city, ship_to_province, ship_to_postal_code
  ship_to_name, ship_to_corp_name, bill_to_corp_name
  bill_to_same_as_ship_to
  contact_name, contact_email, contact_phone
  payment_terms, currency, notes
  deleted_at

customer_prices
  id, customer_id → customers
  material_type ('raw_material' | 'packaging'), material_id
  custom_price

suppliers
  id, name, contact_name, contact_email, contact_phone
  country, notes
  ship_to_address, ship_to_city, ship_to_province, ship_to_postal_code
  bill_to_same_as_ship_to
  bill_to_address, bill_to_city, bill_to_province, bill_to_postal_code

invoices
  id, invoice_no, customer_id → customers
  issued_at, delivery_date, payment_date
  currency ('CAD' | 'USD')
  subtotal_cad, tax_rate, tax_amount_cad, total_cad
  status ('draft' | 'sent' | 'paid'), notes
  -- tax_rate stored as decimal: 0.05 = GST 5%, 0.13 = HST 13%

invoice_items
  id, invoice_id → invoices
  item_type ('raw_material' | 'packaging'), item_id
  qty, unit_price_cad, discount
  line_total_cad  -- GENERATED ALWAYS AS (qty * unit_price_cad) — never include in INSERT

credit_memos
  id, memo_no, customer_id → customers
  invoice_id → invoices (nullable)
  issued_at, applied_date
  subtotal_cad, tax_amount_cad, total_cad
  status, reference_number, notes

credit_memo_items
  id, memo_id → credit_memos
  material_type, material_id
  qty, unit_price_cad, line_total_cad

purchase_orders
  id, po_number, supplier_id → suppliers
  status ('draft' | 'ordered' | 'shipped' | 'received' | 'cancelled')
  ordered_at, shipped_at, received_at
  cost_total_cad, shipping_cad, brokerage_cad, duty_cad
  amount_usd, exchange_rate
  notes

purchase_order_items
  id, po_id → purchase_orders
  material_type ('raw_material' | 'packaging')
  material_id, quantity, unit_price
  purchase_unit       -- 'ml' | 'Drum'
  weight_per_drum     -- kg/drum (for edit reverse-calculation)
  line_total          -- GENERATED ALWAYS AS (quantity * unit_price) — never include in INSERT

purchase_order_attachments
  id, po_id → purchase_orders
  file_name, file_url, file_size, content_type
  created_at

expenses
  id, expense_date
  category, type, payee
  description
  amount_before_tax, sales_tax, total_amount
  payment_method, currency
  receipt_url
  created_at
  -- NOTE: NO freight_tip, reference, deleted_at columns (differs from I AM PURE)

supplier_prices
  id, item_type ('raw_material' | 'packaging')
  raw_material_id (uuid, nullable)
  packaging_id (uuid, nullable)
  supplier_id, supplier_name    -- denormalized text
  unit_cost_cad, unit
  note, price_date
  created_at

inventory_history
  id, recorded_at, material_type
  material_id, item_no, name, unit
  current_stock, snapshot_note

activity_log
  id, table_name, record_id
  action ('INSERT' | 'UPDATE' | 'DELETE')
  old_data (jsonb), new_data (jsonb)
  created_at
```

---

## Critical Schema Differences vs I AM PURE

| Feature | I AM PURE | ESHCO ELEMENTS |
|---------|-----------|----------------|
| Products table | `products` (finished goods) | `raw_materials` + `packaging` |
| Invoice items FK | `product_id → products` | `item_type + item_id` (no FK) |
| Invoice items generated | `line_total_cad` NOT NULL plain | `line_total_cad` GENERATED ALWAYS |
| Expenses `freight_tip` | ✅ exists | ❌ does not exist |
| Expenses `reference` | ✅ exists | ❌ does not exist |
| Expenses `deleted_at` | ✅ exists | ❌ does not exist |
| BOM / Production | ✅ full | ❌ not applicable |

**Critical**: When writing queries for ESHCO expenses, do NOT include `freight_tip`, `reference`, or `.is('deleted_at', null)`.

---

## Key Schema Rules (Always Apply)

| Table | Column | Rule |
|-------|--------|------|
| `invoice_items` | `line_total_cad` | GENERATED ALWAYS — NEVER include in INSERT |
| `purchase_order_items` | `line_total` | GENERATED ALWAYS — NEVER include in INSERT |
| `expenses` | (no deleted_at) | Never filter `.is('deleted_at', null)` — column doesn't exist |
| `supplier_prices` | `raw_material_id`/`packaging_id` | Separate nullable columns (not `material_id`) |
| `supplier_prices` | `supplier_name` | Denormalized text, not FK |
| `supplier_prices` | price column | `unit_cost_cad` (not `price`) |
| `supplier_prices` | date column | `price_date` (not `updated_at`) |

---

## Historical Data

| Dataset | Status |
|---------|--------|
| CAD invoices (2020–2026) | ✅ Fully entered (latest: EE26-00016) |
| Expenses (2020–2026) | ✅ Fully entered |

All-Time Summary and P&L tabs reflect complete historical data from 2020 onwards.

---

## Key Customers

- **BSM CO INC. (Earth To Me)**: ESHCO Elements customer
- **HERA BEAUTY**: grouped across all locations in By Customer tab

---

## Security

- **Supabase RLS**: all tables → `authenticated` role only (policy name: `authenticated_only`)
- **middleware.ts**: all routes protected; public: `/login`, `/reset-password`, `/auth/confirm`
- **Supabase public schema GRANT advisory**: safe until October 30, 2026 — action needed before that date

---

## UI Conventions

- **Modal close**: only via Cancel button or X button — backdrop click does NOT close modals
- **All UI text**: English only
- **Toronto timezone**: throughout
- **Korean-locale date input**: use `type="text"` with YYYY-MM-DD placeholder validation

---

## Local Development

```bash
npm install

# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xkyzuczpgicuanxtebcr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

npm run dev   # → http://localhost:3000
npm run build
```

---

## Directory Structure

```
src/
├── app/
│   ├── dashboard/
│   ├── products/           # Raw Materials + Packaging tabs
│   ├── inventory/
│   ├── inventory-history/
│   ├── invoices/           # CAD / USD tabs + Credit Memos
│   ├── customers/
│   ├── suppliers/
│   ├── purchasing/         # Drum unit input, N item(s) display
│   ├── expenses/           # Yearly Excel export (top-right)
│   ├── reports/            # Revenue + Expense Report + PPT
│   ├── scan/
│   ├── activity/
│   ├── backup/
│   ├── auth/confirm/
│   ├── reset-password/
│   └── login/
├── components/
│   ├── layout/             # Sidebar, Header, MainLayout
│   └── UndoToast.tsx
└── lib/
    ├── supabase.ts
    ├── activityLog.ts
    ├── csvImport.ts
    ├── dateUtils.ts
    ├── utils.ts
    ├── logoBase64.ts
    ├── generateInvoicePDF.ts   # Uses bill_to_corp_name, ship_to_corp_name, ship_to_name
    └── generateCreditMemoPDF.ts
```

---

*ESHC Inc. — Internal use only*
