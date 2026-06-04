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
| Supabase | https://xkyzuczpgicuanxtebcr.supabase.co |

`main` branch push → Vercel auto-deploy.

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| DB / Auth | Supabase (PostgreSQL + Supabase Auth) |
| UI | Tailwind CSS v4, lucide-react |
| PDF | jsPDF + jspdf-autotable |
| Excel | xlsx (SheetJS) |
| PowerPoint | pptxgenjs |
| Barcode scan | html5-qrcode |
| Deployment | Vercel |

---

## Complete Feature List

### Authentication (`/login`, `/reset-password`)
- Supabase Auth (email + password)
- Password reset (`/reset-password`)
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
- Tabs: **Raw Materials** / **Packaging** (no Finished Goods — no manufacturing)
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
- Line items: raw material or packaging, qty, unit price, discount
- Customer-specific custom pricing auto-applied (`customer_prices`)
- HST auto-calculation (HST# 752458133RT0001)
- Delivery date + payment date
- **PDF output**: invoice PDF with company logo
- **Credit Memos**: return/adjustment memos, PDF output
- Excel import/export

### Customers (`/customers`)
- Company info: name, warehouse_address (bill-to), ship_to_address (separate)
- `bill_to_corp_name` / `ship_to_corp_name` / `ship_to_name` columns (added for PDF corp name display)
- Payment terms, currency (CAD/USD)
- Per-customer custom pricing (per-item price override via `customer_prices`)
- Excel import/export + template

### Suppliers (`/suppliers`)
- Supplier info: contact, country, ship-to / bill-to addresses
- bill_to_same_as_ship_to toggle
- Excel import/export + template

### Purchasing (`/purchasing`)
- PO creation: supplier, multi-line items (raw material / packaging)
- Status: Draft → Ordered → Shipped → Received → Cancelled
- Cost fields: goods (CAD/USD), exchange rate, shipping, brokerage, duty
- **Attachments**: Supabase Storage multi-file upload per PO
- On Received: stock auto-updated
- Shipped Date direct input

### Expenses (`/expenses`)
- Expense CRUD: date, category, type, payee, description, tax, payment method, currency, exchange rate
- **No `freight_tip`, `reference`, `deleted_at` columns** (ESHCO schema differs from I AM PURE)
- Expense columns: `expense_date, category, type, payee, description, amount_before_tax, sales_tax, total_amount, payment_method, currency`
- **Category filter** dropdown
- **Monthly Summary by Category**
- Receipt file upload (Supabase Storage)
- **Yearly Excel Export**: year selector + Export Excel button (top-right of month tabs)
  - File: `{year}_Expenses-ESHCO_Elements.xlsx`
  - Summary sheet + 12 monthly sheets
  - Query uses NO `deleted_at` filter (column does not exist)
- Excel import/export

### Reports (`/reports`)

Tabs: **Overview** / **Monthly** / **All-Time Summary** / **By Customer** / **Expenses** / **Tax Summary**

#### Overview tab
- Year selector (2020–present)
- KPI cards: total revenue, paid, unpaid, invoice count, avg order value, units sold
- Gross Profit Summary: revenue, COGS, gross profit, gross margin %, est. net profit
- Monthly revenue bar chart + quarterly breakdown
- Top 10 items by revenue
- PowerPoint annual report export

#### Monthly tab
- Year × month revenue table — Subtotal CAD (excl. tax) + Total CAD (incl. tax)
- Multi-year line/bar chart toggle

#### All-Time Summary tab
- **5 KPI dark cards**: All-Time Revenue (CAD), All-Time Units Sold, All-Time Expenses (CAD), Gross Margin (Revenue − Expenses, green/red), Current Inventory Value (raw materials + packaging stock × cost)
- **Revenue by Year** table (year × month, subtotal CAD) + bar/line chart toggle
- **Units Sold by Year** table (year × month) + bar/line chart toggle
- All data fetched with pagination (1000/page); no `deleted_at` filter on expenses

#### By Customer tab
- Customer revenue breakdown for selected year
- Drill-down modal: top 10 items per customer
- HERA BEAUTY grouped across all locations

#### Expenses tab
- Expenses by Category table (year × month)
- All-years expense report table + bar/line chart toggle
- No `deleted_at` filter (column does not exist in ESHCO schema)

#### Tax Summary tab
- Tax Collected (invoices − credit memos), Tax Paid (expenses), Estimated Tax Owing

### Barcode Scan (`/scan`)
- Camera barcode scan
- Raw material / packaging lookup by SKU or barcode
- Stock + Low Stock display

### Activity Log (`/activity`)
- INSERT / UPDATE / DELETE auto-logging
- Before/after diff
- Selective + full delete

### Data Backup (`/backup`)
- Full Excel backup (all tables, multiple sheets)
- Quick individual exports

### PWA
- `manifest.json`, `apple-touch-icon` (180×180)

---

## DB Schema (Supabase)

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
  ship_to_name          -- Ship To display name
  ship_to_corp_name     -- Ship To corporation legal name
  bill_to_corp_name     -- Bill To corporation legal name
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
  qty, unit_price_cad, discount, line_total_cad  -- line_total_cad GENERATED ALWAYS

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
  line_total  -- GENERATED ALWAYS

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

## Key Schema Differences vs I AM PURE

| Feature | I AM PURE | ESHCO ELEMENTS |
|---------|-----------|----------------|
| Products table | `products` (finished goods) | `raw_materials` + `packaging` |
| Invoice items | `product_id → products` | `material_type + material_id` |
| Expenses `freight_tip` | ✅ exists | ❌ does not exist |
| Expenses `reference` | ✅ exists | ❌ does not exist |
| Expenses `deleted_at` | ✅ exists | ❌ does not exist |
| BOM / Production | ✅ full | ❌ not applicable |
| Margin analysis | ✅ | ❌ not applicable |

**Critical**: When writing queries for ESHCO expenses, do NOT include `freight_tip`, `reference`, or `.is('deleted_at', null)`.

---

## Security

- **Supabase RLS**: all tables → `authenticated` role only
- **middleware.ts**: all routes protected; public: `/login`, `/reset-password`, `/auth/confirm`
- **Environment variables**: `.env.local` gitignored
- **Client-exposed keys**: `NEXT_PUBLIC_SUPABASE_*` only (protected by RLS)

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
│   ├── purchasing/
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
public/
├── logo.png
├── apple-touch-icon.png
├── icon-192x192.png
├── icon-512x512.png
└── manifest.json
```

---

## Historical Data Notes

| Dataset | Status |
|---------|--------|
| CAD invoices (2020–2026) | ✅ Fully entered |
| Expenses (2020–2026) | ✅ Fully entered |

All-Time Summary tab reflects complete historical data from 2020 onwards.

---

*ESHC Inc. — Internal use only*
