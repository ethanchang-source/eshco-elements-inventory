# I Am Pure — Inventory Management System

내부용 재고·영업 관리 시스템. 헤어오일 제품의 원자재 관리부터 생산, 판매 인보이스, 리포트까지 통합 관리합니다.

---

## 배포

| 환경 | URL |
|------|-----|
| Production | Vercel (GitHub `main` 브랜치 자동 배포) |
| GitHub | https://github.com/ethanchang-source/hair-oil-inventory |
| Supabase | https://yjnwzxnsvnukchzhsfvl.supabase.co |

> 배포 URL은 Vercel 대시보드에서 확인. `main` 푸시 시 자동 배포됩니다.

---

## 기술 스택

- **Framework**: Next.js 15 (App Router)
- **DB / Auth**: Supabase (PostgreSQL + Supabase Auth)
- **UI**: Tailwind CSS v4, lucide-react
- **PDF**: jsPDF + jspdf-autotable
- **Excel / PowerPoint**: xlsx (SheetJS), pptxgenjs
- **바코드 스캔**: html5-qrcode
- **배포**: Vercel

---

## 완성된 기능

### 인증 (`/login`)
- Supabase Auth 로그인 (이메일 + 비밀번호)
- `middleware.ts` 로 전체 라우트 보호 — 비인증 접근 시 `/login` 리다이렉트
- 사이드바 하단 로그인 계정 표시 + Sign Out 버튼

### 대시보드 (`/dashboard`)
- 핵심 지표 카드: 전체 제품 수, 원자재, 월간 생산량, 월간 인보이스
- 재주문 임계값 이하 품목 알림 (Low Stock)
- 최근 인보이스 목록 및 빠른 이동 버튼

### 제품 관리 (`/products`)
- 완제품 CRUD: SKU, 용량(oz), 바코드(UPC/ITF-14), MFG Cost, WHS Price, MSRP, Dist Price
- 비활성화(`is_active`) 및 소프트 삭제(`deleted_at`) 지원
- CSV/Excel 일괄 가져오기 (upsert — 비어있는 필드는 기존값 유지)
- Excel 내보내기, Undo Toast 지원

### 재고 관리 (`/inventory`)
- 탭별 관리: **Raw Materials** / **Packaging** / **Finished Goods**
- Raw Materials: ml/kg/drum 단위 재고, USD 단가, 구매 단위(purchase_unit/kg), 공급업체 연결
- Packaging: ea/roll 단위, 모듈 수량(module_qty), 쉬링크밴드 롤 길이(roll_length_m), 공급업체 연결
- Finished Goods: 박스 단위 입력 (1박스 = 36개)
- 항목 추가·수정·삭제, 재주문 임계값 및 최대 용량(max_capacity) 설정
- 최근 발주 이력 팝업 (Purchase History)
- CSV 가져오기/내보내기, Undo Toast 지원

### 재고 히스토리 (`/inventory-history`)
- 날짜별 완제품 재고 스냅샷 조회
- 두 날짜 간 재고 변동 비교 (Compare)
- 수동 스냅샷 촬영 기능

### BOM (`/bom`)
- 제품별 원자재·포장재 컴포넌트 정의
- 단위 생산당 사용량(qty_per_unit) 관리
- 생산 오더·구매 오더와 연동

### 생산 관리 (`/production`)
- 생산 오더 생성: 제품·수량 선택 → BOM 기반 필요 자재 자동 계산
- 자재 부족 여부 실시간 경고
- 생산 오더 삭제 시 원자재·포장재 재고 자동 복구, 완제품 재고 차감 롤백
- 배치 메모 기록

### 인보이스 (`/invoices`)
- CAD / USD 탭 분리, 인보이스 번호 자동 채번 (결번 우선 재사용)
- 인보이스 생성·수정·삭제 (Draft → Sent → Paid)
- 라인 아이템: 제품 검색, 수량, 단가, 할인
- 고객별 커스텀 단가(`customer_prices`) 자동 적용
- HST 세금 자동 계산 (HST# 752458133RT0001)
- 납품일·결제일 관리
- **PDF 출력**: 회사 로고 포함 인보이스 PDF 생성
- 인보이스 삭제 시 완제품 재고 자동 복구
- **크레딧 메모**: 반품·조정용 크레딧 메모 생성, PDF 출력, Applied Date 저장
- Excel Import/Export (인보이스 + 크레딧 메모 목록)

### 고객 관리 (`/customers`)
- 거래처 정보: 회사명, 창고 주소, Ship-to 주소(별도 관리), 연락처
- 결제 조건 (Net15/30/45/60, COD, Prepaid), 통화 (CAD/USD)
- 고객별 커스텀 단가 설정 (제품별 override)
- 고객 카드 클릭 시 수정 모달 (전체 필드 수정 + 삭제)
- Excel Import/Export + 템플릿 다운로드, 검색 필터링

### 공급업체 관리 (`/suppliers`)
- 공급업체 연락처·국가·배송 주소 관리
- 고객 카드 클릭 시 수정 모달 (전체 필드 수정 + 삭제)
- Excel Import/Export + 템플릿 다운로드

### 구매 관리 (`/purchasing`)
- 발주서(PO) 생성: 공급업체 선택, 다중 라인 아이템 (원자재/포장재)
- PO 상태 관리: Draft → Ordered → Shipped → Received → Cancelled
- 비용 항목: 물품비(CAD/USD), 환율, Shipping, Brokerage, Duty
- 발주서 첨부 파일 URL 관리
- 수령 시 재고 자동 반영 (qty_received 기록)
- 발주 이력 조회

### 지출 관리 (`/expenses`)
- 지출 항목 CRUD: 날짜, 카테고리, 결제수단, 세금, 환율
- 카테고리: RENT, UTILITIES, PAYROLL, SHIPPING 등 19개 분류
- 영수증 첨부 파일 업로드 (Supabase Storage, 다중 파일 지원)
- Excel Import/Export (월별 지출 내보내기)

### 리포트 (`/reports`)
- 연도별 매출 분석 (2024 / 2025 / 2026)
- KPI: 총 매출, 수금 완료·미수, 인보이스 수, 판매 단위, 평균 주문금액
- 월별 매출 바 차트
- 상위 10개 제품 매출 순위
- 고객별 드릴다운, 분기별 매출 분석
- **생산 분석**: 연도별/월별/분기별 생산량 차트
- **PowerPoint 내보내기**: 연간 리포트 PPT 생성

### 바코드 스캔 (`/scan`)
- iPhone 카메라로 바코드(UPC / EAN / ITF-14) 스캔
- SKU 또는 바코드로 제품 즉시 조회
- 단가(원가·창고가·MSRP)·재고·Low Stock 표시
- iOS 대응: 사용자 탭 후 카메라 시작

### 활동 로그 (`/activity`)
- 모든 주요 테이블의 INSERT / UPDATE / DELETE 변경 이력 자동 기록
- 변경 전·후 필드 비교 표시 (Before / After diff)
- 관리자 전용: 선택 삭제 및 전체 삭제 기능 (`ethan.chang@iampurebeauty.com` 한정)
- 레코드 복구 (Restore) — invoice_items, credit_memo_items 포함 연쇄 복구

### 데이터 백업 (`/backup`)
- 전체 데이터 Excel 다운로드 (한 파일, 다중 시트):
  - Invoices CAD, Invoices USD, Credit Memos
  - Customers, Suppliers
  - Raw Materials, Packaging, Products (완제품 재고 포함)
  - Purchase Orders, Expenses, Production History
- 개별 시트 빠른 내보내기 버튼

### PWA
- `manifest.json` 설정으로 홈 화면 추가 지원
- `apple-touch-icon` (180×180) 포함, iOS Safari "홈 화면에 추가" 시 회사 로고 표시

---

## 현재 이슈 / 남은 작업

| 우선순위 | 항목 |
|----------|------|
| 중간 | 생산 오더 생성 시 원자재·포장재 재고 자동 차감 (현재는 삭제 시 복구만 구현) |
| 중간 | 인보이스 Paid 처리 시 완제품 재고 자동 차감 (현재는 삭제 시만 복구) |
| 중간 | 크레딧 메모 ↔ 인보이스 연결 UI (현재는 `invoice_id` 필드만 존재) |
| 낮음 | 리포트 PDF 내보내기 |
| 낮음 | 사용자 역할 시스템 (현재는 Supabase Auth 1계정, 관리자 이메일 하드코딩) |

---

## DB 구조 (Supabase)

```
products
  id, sku, name, size_oz
  barcode_upc, barcode_itf14
  unit_cost_cad, price_whs_cad, msrp_cad, price_dist_cad
  current_stock, reorder_threshold
  is_active, deleted_at, notes, created_at

raw_materials
  id, item_no, name, unit
  cost_per_unit_cad, cost_per_unit_usd, avg_cost_cad
  current_stock, reorder_threshold, max_capacity
  purchase_unit, purchase_unit_kg   -- 구매 단위 (e.g. drum, 200kg)
  preferred_supplier_id → suppliers

packaging
  id, item_no, name, type, unit, size_oz
  cost_cad, avg_cost_cad
  current_stock, reorder_threshold, max_capacity
  module_qty        -- 모듈 단위 수량 (e.g. 박스당 ea 수)
  roll_length_m     -- 쉬링크밴드 롤 길이(m)
  preferred_supplier_id → suppliers

bom
  id, product_id → products
  component_type ('raw_material' | 'packaging')
  raw_material_id → raw_materials (nullable)
  packaging_id    → packaging (nullable)
  qty_per_unit

production_orders
  id, product_id → products
  qty_produced, produced_at, notes

inventory_snapshots
  id, snapshot_date, snapshot_type
  product_id → products
  sku, product_name
  current_stock, unit_cost_cad, price_whs_cad

customers
  id, company_name
  warehouse_address, city, province, postal_code
  ship_to_address, ship_to_city, ship_to_province, ship_to_postal_code
  bill_to_same_as_ship_to
  contact_name, contact_email, contact_phone
  payment_terms, currency, notes
  deleted_at

customer_prices
  id, customer_id → customers, product_id → products
  custom_price

suppliers
  id, name, contact_name, contact_email, contact_phone
  country, ship_to_address, notes

invoices
  id, invoice_no, customer_id → customers
  issued_at, delivery_date, payment_date
  currency ('CAD' | 'USD')
  subtotal_cad, tax_amount_cad, total_cad
  status ('draft' | 'sent' | 'paid'), notes

invoice_items
  id, invoice_id → invoices, product_id → products
  qty, unit_price_cad, line_total_cad  -- line_total_cad: GENERATED ALWAYS

credit_memos
  id, memo_no, customer_id → customers
  invoice_id → invoices (nullable)
  issued_at, applied_date
  subtotal_cad, tax_amount_cad, total_cad
  status, reference_number, notes

credit_memo_items
  id, memo_id → credit_memos, product_id → products
  qty, unit_price_cad, line_total_cad

purchase_orders
  id, po_number, supplier_id → suppliers
  status ('draft' | 'ordered' | 'shipped' | 'received' | 'cancelled')
  ordered_at, shipped_at, received_at
  qty_ordered, qty_received, unit
  cost_total_cad, shipping_cad, brokerage_cad, duty_cad
  amount_usd, exchange_rate
  invoice_url, notes

purchase_order_items
  id, po_id → purchase_orders
  material_type ('raw_material' | 'packaging')
  material_id, quantity, unit_price
  line_total  -- GENERATED ALWAYS
  raw_materials → raw_materials (nullable)
  packaging   → packaging (nullable)

expenses
  id, expense_date
  category, type, payee, category2, description
  amount_before_tax, sales_tax, freight_tip, total_amount
  reference, payment_method
  amount_usd, exchange_rate, currency
  receipt_url, receipt_urls   -- Supabase Storage URLs
  created_at

activity_log
  id, table_name, record_id
  action ('INSERT' | 'UPDATE' | 'DELETE')
  old_data (jsonb), new_data (jsonb)
  created_at
```

---

## 로컬 개발

```bash
# 의존성 설치
npm install

# 환경변수 설정 (.env.local)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# 개발 서버 실행
npm run dev
# → http://localhost:3000

# 프로덕션 빌드
npm run build
```

---

## 디렉토리 구조

```
src/
├── app/
│   ├── dashboard/          # 대시보드
│   ├── products/           # 제품 관리
│   ├── inventory/          # 재고 관리 (원자재/포장재/완제품)
│   ├── inventory-history/  # 재고 스냅샷 히스토리
│   ├── bom/                # BOM (자재 명세서)
│   ├── production/         # 생산 오더
│   ├── invoices/           # 인보이스 & 크레딧 메모
│   ├── customers/          # 고객 관리
│   ├── suppliers/          # 공급업체
│   ├── purchasing/         # 구매 발주 (PO)
│   ├── expenses/           # 지출 관리
│   ├── reports/            # 매출·생산 리포트
│   ├── scan/               # 바코드 스캔
│   ├── activity/           # 활동 로그
│   ├── backup/             # 전체 데이터 백업
│   └── login/              # 로그인
├── components/
│   ├── layout/             # 공통 레이아웃 (Sidebar, Header, MainLayout)
│   └── UndoToast.tsx       # 삭제 Undo 토스트
└── lib/
    ├── supabase.ts                  # Supabase 클라이언트
    ├── activityLog.ts               # 활동 로그 기록 유틸
    ├── csvImport.ts                 # CSV 파싱 유틸
    ├── dateUtils.ts                 # Toronto 타임존 날짜 유틸
    ├── utils.ts                     # formatCurrency 등 공통 유틸
    ├── generateInvoicePDF.ts        # 인보이스 PDF 생성
    └── generateCreditMemoPDF.ts     # 크레딧 메모 PDF 생성
public/
├── logo.png               # 회사 로고 (원본)
├── apple-touch-icon.png   # iOS 홈 화면 아이콘 (180×180)
├── icon-192x192.png       # PWA 아이콘
├── icon-512x512.png       # PWA 아이콘
└── manifest.json          # PWA 매니페스트
```

---

*ESHC Inc. — 내부용 전용 시스템*
