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
- **DB / Auth**: Supabase (PostgreSQL)
- **UI**: Tailwind CSS v4, lucide-react
- **PDF**: jsPDF + jspdf-autotable
- **Excel**: xlsx (SheetJS)
- **바코드 스캔**: html5-qrcode
- **배포**: Vercel

---

## 완성된 기능

### 대시보드 (`/dashboard`)
- 핵심 지표 카드: 전체 제품 수, 원자재, 월간 생산량, 월간 인보이스
- 재주문 임계값 이하 품목 알림 (Low Stock)
- 최근 인보이스 목록 및 빠른 이동 버튼

### 재고 관리 (`/inventory`)
- 탭별 관리: **원자재** / **포장재** / **완제품**
- 항목 추가·수정·삭제, 재주문 임계값 설정
- CSV 가져오기/내보내기

### 제품 관리 (`/products`)
- 완제품 CRUD: SKU, 용량(oz), 바코드(UPC/ITF-14), 단가, MSRP, 창고가
- CSV/Excel 일괄 가져오기 (upsert — 비어있는 필드는 기존값 유지)
- Excel 내보내기

### 고객 관리 (`/customers`)
- 거래처 정보: 회사명, 주소, 연락처, 결제 조건 (Net15/30/45/60, COD, Prepaid), 통화
- Excel 가져오기/내보내기 (템플릿 제공)
- 검색 필터링, 카드형 UI

### 공급업체 관리 (`/suppliers`)
- 공급업체 연락처·국가 정보 관리
- Excel 가져오기/내보내기

### 인보이스 (`/invoices`)
- 인보이스 생성·수정·삭제 (Draft → Sent → Paid 상태 관리)
- 라인 아이템 관리 (제품 검색, 수량, 단가, 할인)
- HST 세금 자동 계산 (HST# 752458133RT0001)
- **PDF 출력**: 회사 로고 포함 인보이스 PDF 생성
- 납품일·결제일 관리
- Excel 일괄 가져오기
- **크레딧 메모**: 반품·조정용 크레딧 메모 생성, PDF 출력, 적용 날짜 관리

### 생산 관리 (`/production`)
- 생산 오더 생성: 제품·수량 선택 → BOM 기반 필요 자재 자동 계산
- 자재 부족 여부 실시간 경고
- 배치 메모 기록

### BOM (자재 명세서) (`/bom`)
- 제품별 원자재·포장재 컴포넌트 정의
- 단위 생산당 사용량 관리
- 생산 오더와 연동

### 리포트 (`/reports`)
- 연도별 매출 분석 (2024 / 2025 / 2026)
- KPI: 총 매출, 수금 완료·미수 매출, 인보이스 수, 판매 단위 수, 평균 주문금액
- 월별 매출 바 차트
- 상위 10개 제품 매출 순위
- 월별 상세 테이블

### 바코드 스캔 (`/scan`)
- iPhone 카메라로 바코드(UPC / EAN / ITF-14) 스캔
- SKU 또는 바코드로 제품 즉시 조회
- 단가(원가·창고가·MSRP)·재고·Low Stock 표시
- iOS 대응: 사용자 탭 후 카메라 시작

### PWA
- `manifest.json` 설정으로 홈 화면 추가 지원
- `apple-touch-icon` (180×180) 포함, iOS Safari "홈 화면에 추가" 시 회사 로고 표시

---

## 남은 작업

| 우선순위 | 항목 |
|----------|------|
| 높음 | 인증 미들웨어 구현 (`middleware.ts` 현재 pass-through) |
| 높음 | 사용자 역할 및 접근 권한 시스템 |
| 중간 | 생산 오더 완료 시 원자재·포장재 재고 자동 차감 |
| 중간 | 인보이스 Paid 처리 시 완제품 재고 자동 차감 |
| 중간 | 크레딧 메모 ↔ 인보이스 연결 UI |
| 낮음 | ITF-14 바코드 및 유통가(`price_dist_cad`) 제품 UI 표시 |
| 낮음 | 리포트 PDF/Excel 내보내기 |

---

## DB 구조 (Supabase)

```
products
  id, sku, name, size_oz, barcode_upc, barcode_itf14
  unit_cost, price_msrp, price_warehouse, price_dist_cad
  stock_quantity, reorder_threshold, active

raw_materials
  id, name, unit, cost_per_unit, quantity_in_stock, reorder_threshold

packaging
  id, name, unit, cost_per_unit, quantity_in_stock, reorder_threshold

bom
  id, product_id → products
  material_type (raw_material | packaging)
  material_id, quantity_per_unit, unit

production_orders
  id, product_id → products
  quantity, production_date, notes, status

customers
  id, company_name, address, city, province, postal_code
  contact_name, email, phone
  payment_terms, currency, notes

suppliers
  id, company_name, contact_name, email, phone, country, notes

invoices
  id, invoice_number, customer_id → customers
  invoice_date, delivery_date, payment_date
  subtotal, tax_amount, total_amount
  status (draft | sent | paid), notes

invoice_items
  id, invoice_id → invoices, product_id → products
  quantity, unit_price, discount, line_total

credit_memos
  id, memo_number, invoice_id → invoices (optional)
  customer_id → customers
  memo_date, applied_date
  subtotal, tax_amount, total_amount
  status, reference_number, notes

credit_memo_items
  id, credit_memo_id → credit_memos, product_id → products
  quantity, unit_price, line_total
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
│   ├── dashboard/     # 대시보드
│   ├── inventory/     # 재고 관리
│   ├── products/      # 제품 관리
│   ├── customers/     # 고객 관리
│   ├── suppliers/     # 공급업체
│   ├── invoices/      # 인보이스 & 크레딧 메모
│   ├── production/    # 생산 오더
│   ├── bom/           # BOM
│   ├── reports/       # 리포트
│   ├── scan/          # 바코드 스캔
│   └── login/         # 로그인
├── components/
│   └── layout/        # 공통 레이아웃 (사이드바, 헤더)
└── lib/
    ├── supabase.ts              # Supabase 클라이언트
    ├── csvImport.ts             # CSV 파싱 유틸
    ├── generateInvoicePDF.ts    # 인보이스 PDF 생성
    └── generateCreditMemoPDF.ts # 크레딧 메모 PDF 생성
public/
├── logo.png               # 회사 로고 (원본)
├── apple-touch-icon.png   # iOS 홈 화면 아이콘 (180×180)
├── icon-192x192.png       # PWA 아이콘
├── icon-512x512.png       # PWA 아이콘
└── manifest.json          # PWA 매니페스트
```

---

*ESHC Inc. — 내부용 전용 시스템*
