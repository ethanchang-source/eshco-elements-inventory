# ESHCO ELEMENTS — Inventory Management System

원자재·포장재 납품 전문 회사 ESHCO ELEMENTS의 내부용 재고·영업 관리 시스템입니다.  
구매 발주(PO)부터 인보이스, 지출 관리, 매출 리포트까지 통합 관리합니다.

---

## ESHC Group 구조

| 사이트 | URL |
|--------|-----|
| Master Landing | [www.eshcgroup.com](https://www.eshcgroup.com) |
| I AM PURE | [iampure.eshcgroup.com](https://iampure.eshcgroup.com) |
| **ESHCO ELEMENTS** | **[eshco.eshcgroup.com](https://eshco.eshcgroup.com)** |

---

## 배포

| 환경 | URL |
|------|-----|
| Production | https://eshco.eshcgroup.com |
| GitHub | https://github.com/ethanchang-source/eshco-elements-inventory |
| Supabase | https://xkyzuczpgicuanxtebcr.supabase.co |

`main` 브랜치 푸시 시 자동 배포됩니다.

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| DB / Auth | Supabase (PostgreSQL + Supabase Auth) |
| UI | Tailwind CSS v4, lucide-react |
| PDF | jsPDF + jspdf-autotable |
| Excel | xlsx (SheetJS) |
| PowerPoint | pptxgenjs |
| 바코드 스캔 | html5-qrcode |
| 배포 | Vercel |
| PWA | manifest.json + apple-touch-icon |

---

## 완성된 기능

### 인증 (`/login`)
- Supabase Auth 로그인 (이메일 + 비밀번호)
- 비밀번호 재설정 (`/reset-password`)
- `middleware.ts`로 전체 라우트 보호 — 비인증 접근 시 `/login` 리다이렉트

### 대시보드 (`/dashboard`)
- KPI 카드: 총 제품 수, 활성 원자재, 활성 포장재, 월간 인보이스 합계
- Low Stock 알림 (재주문 임계값 이하 품목)
- 최근 인보이스 목록 및 빠른 이동

### 제품 관리 (`/products`)
- Raw Materials + Packaging 통합 관리 (탭 전환)
- **Raw Materials**: item_no, 이름, 단위(ml/kg/drum), 원가(CAD/USD), 평균원가, 재고, 공급업체 연결
- **Packaging**: item_no, 이름, 타입, 단위(ea/roll), 원가, 평균원가, 재고, module_qty, 공급업체 연결
- CRUD (추가 / 수정 / 삭제), Excel Import/Export, Undo Toast

### 재고 관리 (`/inventory`)
- 탭별 관리: **Raw Materials** / **Packaging** (Finished Goods 탭 없음)
- 재주문 임계값 및 최대 용량(max_capacity) 설정
- 최근 발주 이력 팝업 (Purchase History)
- Excel Import/Export, Undo Toast

### 재고 히스토리 (`/inventory-history`)
- 날짜별 재고 스냅샷 조회
- 두 날짜 간 재고 변동 비교 (Compare)
- 수동 스냅샷 촬영

### 인보이스 (`/invoices`)
- CAD / USD 탭 분리, 인보이스 번호 자동 채번 (결번 우선 재사용)
- 인보이스 생성·수정·삭제, 상태 관리 (Draft → Sent → Paid)
- 라인 아이템: 원자재·포장재 검색, 수량, 단가, 할인
- 고객별 커스텀 단가 자동 적용
- HST 세금 자동 계산 (HST# 752458133RT0001)
- 납품일·결제일 관리
- **PDF 출력**: 회사 로고 포함 인보이스 PDF 생성
- **크레딧 메모**: 반품·조정용 크레딧 메모 생성, PDF 출력
- Excel Import/Export

### 고객 관리 (`/customers`)
- 거래처 정보: 회사명, Ship-to 주소, Bill-to 주소, 연락처
- 결제 조건(Net15/30/45/60, COD, Prepaid), 통화(CAD/USD)
- 고객별 커스텀 단가 설정 (품목별 override)
- Excel Import/Export + 템플릿 다운로드, 검색 필터

### 공급업체 관리 (`/suppliers`)
- 공급업체 정보: 연락처, 국가, Ship-to / Bill-to 주소 (동일 여부 체크)
- 전체 필드 수정 + 삭제
- Excel Import/Export + 템플릿 다운로드

### 구매 발주 (`/purchasing`)
- 발주서(PO) 생성: 공급업체 선택, 다중 라인 아이템 (원자재/포장재)
- PO 상태 관리: Draft → Ordered → Shipped → Received → Cancelled
- 비용 항목: 물품비(CAD/USD), 환율, Shipping, Brokerage, Duty
- **첨부 파일**: Supabase Storage 파일 업로드 (다중 파일, 미리보기/다운로드/삭제)
- 수령(Received) 시 원자재·포장재 재고 자동 반영
- 선적일(Shipped Date) 직접 입력

### 지출 관리 (`/expenses`)
- 지출 항목 CRUD: 날짜, 카테고리, 결제수단, 세금, 환율
- 19개 카테고리: RENT, UTILITIES, PAYROLL, SHIPPING 등
- **Category 필터**: 드롭다운으로 특정 카테고리만 조회
- **Monthly Summary by Category**: 월별 카테고리 소계 / 세금 / 합계 + GRAND TOTAL
- 영수증 첨부 파일 업로드 (Supabase Storage, 다중 파일)
- Excel Import/Export

### 리포트 (`/reports`)
- 연도별 매출 분석 (연도 선택)
- KPI: 총 매출, 수금 완료·미수, 인보이스 수, 판매 단위, 평균 주문금액
- 월별 매출 바 차트 (SVG)
- 상위 10개 품목 매출 순위
- 고객별 드릴다운, 분기별 매출 분석
- **Tax Summary**: 월별 세금 분석표
- **Expenses by Category 매트릭스**: 월 × 카테고리 지출 현황표
- PowerPoint 내보내기 (연간 리포트 PPT)

### 바코드 스캔 (`/scan`)
- 카메라로 바코드(UPC / EAN / ITF-14) 스캔
- SKU 또는 바코드로 원자재·포장재 즉시 조회
- 단가·재고·Low Stock 표시

### 활동 로그 (`/activity`)
- 모든 주요 테이블의 INSERT / UPDATE / DELETE 변경 이력 자동 기록
- 변경 전·후 필드 비교 (Before / After diff)
- 선택 삭제 및 전체 삭제 기능

### 데이터 백업 (`/backup`)
- 전체 데이터 Excel 다운로드 (한 파일, 다중 시트)
- 포함 시트: Invoices CAD/USD, Credit Memos, Customers, Suppliers, Raw Materials, Packaging, Purchase Orders, Expenses, Production History
- 개별 시트 빠른 내보내기 버튼

### PWA
- `manifest.json`으로 홈 화면 추가 지원
- `apple-touch-icon` (180×180) 포함 — iOS Safari "홈 화면에 추가" 시 회사 로고 표시

---

## 미구현 / 제외된 기능

| 페이지 | 이유 |
|--------|------|
| BOM (`/bom`) | ESHCO ELEMENTS는 제조 없음 |
| 생산 관리 (`/production`) | 제조 없음 |
| Margin 분석 (`/margin`) | 제조 없음 |
| Inventory Finished Goods 탭 | 완제품 재고 없음 |

---

## DB 구조 (Supabase)

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
  warehouse_address, city, province, postal_code
  ship_to_address, ship_to_city, ship_to_province, ship_to_postal_code
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
  subtotal_cad, tax_amount_cad, total_cad
  status ('draft' | 'sent' | 'paid'), notes

invoice_items
  id, invoice_id → invoices
  material_type ('raw_material' | 'packaging'), material_id
  qty, unit_price_cad, line_total_cad  -- line_total_cad: GENERATED ALWAYS

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
  category, type, payee, category2, description
  amount_before_tax, sales_tax, freight_tip, total_amount
  reference, payment_method
  amount_usd, exchange_rate, currency
  receipt_url, receipt_urls
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

## 보안 설정

| 항목 | 상태 |
|------|------|
| 인증 (middleware) | 모든 라우트 보호 — `/login`, `/reset-password`, `/auth/confirm` 제외 |
| API 라우트 | `/api/*` bypass 없음 — 미래 엔드포인트도 자동 보호 |
| 환경변수 | `.env.local`은 `.gitignore`의 `.env*` 패턴으로 제외 |
| 클라이언트 노출 키 | `NEXT_PUBLIC_SUPABASE_*`만 노출 (Supabase anon key — RLS로 보호) |
| Supabase RLS | 모든 테이블 `authenticated` role만 접근 허용 |
| XSS | `dangerouslySetInnerHTML` / `innerHTML` 사용 없음 |
| console.log | 프로덕션 민감 정보 로깅 없음 |

---

## 로컬 개발

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.local.example .env.local
# .env.local 에 Supabase 프로젝트 URL과 anon key 입력

# 3. 개발 서버 실행
npm run dev
# → http://localhost:3000

# 4. 프로덕션 빌드 확인
npm run build
```

**.env.local 필수 항목**

```
NEXT_PUBLIC_SUPABASE_URL=https://xkyzuczpgicuanxtebcr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

---

## 디렉토리 구조

```
src/
├── app/
│   ├── dashboard/          # 대시보드
│   ├── products/           # 제품 관리 (Raw Materials + Packaging)
│   ├── inventory/          # 재고 관리 (Raw Materials / Packaging)
│   ├── inventory-history/  # 재고 스냅샷 히스토리
│   ├── invoices/           # 인보이스 & 크레딧 메모
│   ├── customers/          # 고객 관리
│   ├── suppliers/          # 공급업체 관리
│   ├── purchasing/         # 구매 발주 (PO)
│   ├── expenses/           # 지출 관리
│   ├── reports/            # 매출·지출 리포트
│   ├── scan/               # 바코드 스캔
│   ├── activity/           # 활동 로그
│   ├── backup/             # 전체 데이터 백업
│   ├── auth/confirm/       # Supabase OTP 콜백
│   ├── reset-password/     # 비밀번호 재설정
│   └── login/              # 로그인
├── components/
│   ├── layout/             # Sidebar, Header, MainLayout
│   └── UndoToast.tsx       # 삭제 Undo 토스트
└── lib/
    ├── supabase.ts                  # Supabase 클라이언트
    ├── activityLog.ts               # 활동 로그 기록 유틸
    ├── csvImport.ts                 # CSV 파싱 유틸
    ├── dateUtils.ts                 # Toronto 타임존 날짜 유틸
    ├── utils.ts                     # formatCurrency 등 공통 유틸
    ├── logoBase64.ts                # PDF용 로고 Base64
    ├── generateInvoicePDF.ts        # 인보이스 PDF 생성
    └── generateCreditMemoPDF.ts     # 크레딧 메모 PDF 생성
public/
├── logo.png               # 회사 로고
├── apple-touch-icon.png   # iOS 홈 화면 아이콘 (180×180)
├── icon-192x192.png       # PWA 아이콘
├── icon-512x512.png       # PWA 아이콘
└── manifest.json          # PWA 매니페스트
```

---

*ESHC Inc. — 내부용 전용 시스템*
