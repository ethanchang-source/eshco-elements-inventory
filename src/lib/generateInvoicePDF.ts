import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { logoBase64 } from './logoBase64'

interface InvoiceData {
  invoice_no: string
  issued_at: string
  po_number?: string
  payment_terms?: string
  currency?: string
  wire_fee?: number
  received_amount?: number
  customer: {
    company_name: string
    warehouse_address: string
    city: string
    province: string
    postal_code: string
  }
  items: {
    sku: string
    name: string
    size: string
    unit_price: number
    qty: number
    total: number
  }[]
  subtotal: number
  shipping: number
  tax_rate: number
  tax_amount: number
  total: number
  notes?: string
}

const COMPANY = {
  name: 'ESHC Inc.',
  address: '328 North Rivermede Road, Unit 9',
  city: 'Concord, ON L4K 3N5',
  phone: '(647) 400-7180',
  email: 'sales@iampurebeauty.com',
  hst: '752458133RT0001',
}

function fmt(n: number): string {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function generateInvoicePDF(data: InvoiceData) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // 회사 정보 (좌측)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(COMPANY.name, 14, 16)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(COMPANY.address, 14, 22)
  doc.text(COMPANY.city, 14, 27)
  doc.text(`Phone: ${COMPANY.phone}`, 14, 32)
  doc.text(`Email: ${COMPANY.email}`, 14, 37)

  // 로고 (가운데)
  try {
    const logoHeight = 15
    const logoWidth = logoHeight * (2186 / 1460)
    doc.addImage(logoBase64, 'PNG', pageWidth / 2 - logoWidth / 2, 10, logoWidth, logoHeight)
  } catch {}

  // INVOICE 제목 (우측)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('INVOICE', pageWidth - 14, 16, { align: 'right' })
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`DATE: ${new Date(data.issued_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}`, pageWidth - 14, 24, { align: 'right' })
  if (data.po_number) {
    doc.text(`PO #: ${data.po_number}`, pageWidth - 14, 30, { align: 'right' })
  }
  doc.text(`INVOICE #: ${data.invoice_no}`, pageWidth - 14, 36, { align: 'right' })
  if (data.payment_terms) {
    doc.text(`TERMS: ${data.payment_terms}`, pageWidth - 14, 42, { align: 'right' })
  }

  // 구분선
  doc.setDrawColor(200, 200, 200)
  doc.line(14, 48, pageWidth - 14, 48)

  // BILL TO / SHIP TO
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO:', 14, 56)
  doc.text('SHIP TO:', pageWidth / 2, 56)
  doc.setFont('helvetica', 'normal')
  const addr = [
    data.customer.company_name,
    data.customer.warehouse_address,
    `${data.customer.city}, ${data.customer.province} ${data.customer.postal_code}`,
  ].filter(Boolean)
  addr.forEach((line, i) => {
    doc.text(line, 14, 62 + i * 5)
    doc.text(line, pageWidth / 2, 62 + i * 5)
  })

  // 구분선
  doc.line(14, 80, pageWidth - 14, 80)

  // 총 박스 수 자동 계산
  const totalQty = data.items.reduce((sum, item) => sum + item.qty, 0)
  const totalBoxes = Math.ceil(totalQty / 36)

  // 아이템 테이블
  autoTable(doc, {
    startY: 84,
    head: [['ITEM #', 'ITEM DESCRIPTION', 'SIZE', 'UNIT COST', 'ORDER QTY', 'TOTAL AMOUNT']],
    body: [
      ...data.items.map(item => [
        item.sku,
        item.name,
        item.size,
        `$${fmt(item.unit_price)}`,
        item.qty.toString(),
        `$${fmt(item.total)}`,
      ]),
      [{
        content: `Total number of Boxes: ${totalBoxes}`,
        colSpan: 6,
        styles: { fontStyle: 'italic' as const, textColor: [80, 80, 80] as [number, number, number], fillColor: [245, 247, 250] as [number, number, number] }
      }]
    ],
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 75 },
      2: { cellWidth: 28 },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 25, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  const pageHeight = doc.internal.pageSize.getHeight()
  let finalY = (doc as any).lastAutoTable.finalY + 8

  // If the summary section won't fit on the current page, start a new page
  if (finalY + 80 > pageHeight - 25) {
    doc.addPage()
    finalY = 20
  }

  // Notes (좌측 하단)
  if (data.notes) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('Notes:', 14, finalY + 6)
    doc.setFont('helvetica', 'normal')
    const noteLines = doc.splitTextToSize(data.notes, 100)
    doc.text(noteLines, 14, finalY + 12)
  }

  // 합계 (우측)
  const rightX = pageWidth - 14
  let sumY = finalY
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('SUB TOTAL', rightX - 50, sumY, { align: 'left' })
  doc.text(`$${fmt(data.subtotal)}`, rightX, sumY, { align: 'right' })
  sumY += 6
  doc.text('S & H', rightX - 50, sumY, { align: 'left' })
  doc.text(`$${fmt(data.shipping)}`, rightX, sumY, { align: 'right' })
  sumY += 6
  doc.text(`HST (${(data.tax_rate * 100).toFixed(0)}%)`, rightX - 50, sumY, { align: 'left' })
  doc.text(`$${fmt(data.tax_amount)}`, rightX, sumY, { align: 'right' })
  sumY += 2
  doc.line(rightX - 60, sumY, rightX, sumY)
  sumY += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('TOTAL', rightX - 50, sumY, { align: 'left' })
  doc.text(`$${fmt(data.total)}`, rightX, sumY, { align: 'right' })

  if (data.currency === 'USD' && data.wire_fee !== undefined && data.wire_fee > 0) {
    sumY += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text('WIRE FEE', rightX - 50, sumY, { align: 'left' })
    doc.text(`-$${fmt(data.wire_fee)}`, rightX, sumY, { align: 'right' })
    sumY += 6
    const received = data.received_amount !== undefined ? data.received_amount : data.total - data.wire_fee
    doc.setFont('helvetica', 'bold')
    doc.text('RECEIVED AMOUNT', rightX - 50, sumY, { align: 'left' })
    doc.text(`$${fmt(received)}`, rightX, sumY, { align: 'right' })
  }

  // 하단
  const bottomY = doc.internal.pageSize.getHeight() - 20
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setDrawColor(200, 200, 200)
  doc.line(14, bottomY - 5, pageWidth - 14, bottomY - 5)
  doc.text('If you have any questions about this invoice, please contact us at sales@iampurebeauty.com', pageWidth / 2, bottomY, { align: 'center' })
  doc.text('Thank You For Your Business!', pageWidth / 2, bottomY + 5, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text(`HST / GST #: ${COMPANY.hst}`, pageWidth / 2, bottomY + 10, { align: 'center' })

  // Add "Page X of Y" to each page after all content is rendered
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(148, 163, 184)
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' })
  }
  doc.setTextColor(0, 0, 0)

  doc.save(`${data.invoice_no}.pdf`)
}
