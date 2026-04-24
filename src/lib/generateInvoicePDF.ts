import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { logoBase64 } from './logoBase64'

interface InvoiceData {
  invoice_no: string
  issued_at: string
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
  po_number?: string
  box_count?: string
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

export function generateInvoicePDF(data: InvoiceData) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // 로고 (가운데 상단)
  try {
    doc.addImage(logoBase64, 'PNG', pageWidth / 2 - 25, 8, 50, 18)
  } catch {}

  // 회사 정보 (좌측)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(COMPANY.name, 14, 32)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(COMPANY.address, 14, 37)
  doc.text(COMPANY.city, 14, 42)
  doc.text(`Phone: ${COMPANY.phone}`, 14, 47)
  doc.text(`Email: ${COMPANY.email}`, 14, 52)

  // INVOICE 제목 (우측)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('INVOICE', pageWidth - 14, 32, { align: 'right' })
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`DATE: ${new Date(data.issued_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}`, pageWidth - 14, 42, { align: 'right' })
  doc.text(`INVOICE #: ${data.invoice_no}`, pageWidth - 14, 48, { align: 'right' })

  // 구분선
  doc.setDrawColor(200, 200, 200)
  doc.line(14, 58, pageWidth - 14, 58)

  // BILL TO / SHIP TO
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO:', 14, 66)
  doc.text('SHIP TO:', pageWidth / 2, 66)
  doc.setFont('helvetica', 'normal')
  const addr = [
    data.customer.company_name,
    data.customer.warehouse_address,
    `${data.customer.city}, ${data.customer.province} ${data.customer.postal_code}`,
  ].filter(Boolean)
  addr.forEach((line, i) => {
    doc.text(line, 14, 72 + i * 5)
    doc.text(line, pageWidth / 2, 72 + i * 5)
  })

  // 구분선
  doc.line(14, 90, pageWidth - 14, 90)

  // 아이템 테이블
  autoTable(doc, {
    startY: 94,
    head: [['ITEM #', 'ITEM DESCRIPTION', 'SIZE', 'UNIT COST', 'ORDER QTY', 'TOTAL AMOUNT']],
    body: data.items.map(item => [
      item.sku,
      item.name,
      item.size,
      `$${item.unit_price.toFixed(2)}`,
      item.qty.toString(),
      `$${item.total.toFixed(2)}`,
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
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

  const finalY = (doc as any).lastAutoTable.finalY + 8

  // Notes (좌측)
  if (data.po_number || data.box_count) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('Notes', 14, finalY)
    doc.setFont('helvetica', 'normal')
    let noteY = finalY + 5
    if (data.box_count) {
      doc.text(` - Total number of Boxes: ${data.box_count}`, 14, noteY)
      noteY += 5
    }
    if (data.po_number) {
      doc.text(` - PO #: ${data.po_number}`, 14, noteY)
    }
  }

  // 합계 (우측)
  const rightX = pageWidth - 14
  let sumY = finalY
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('SUB TOTAL', rightX - 50, sumY, { align: 'left' })
  doc.text(`$${data.subtotal.toFixed(2)}`, rightX, sumY, { align: 'right' })
  sumY += 6
  doc.text('S & H', rightX - 50, sumY, { align: 'left' })
  doc.text(`$${data.shipping.toFixed(2)}`, rightX, sumY, { align: 'right' })
  sumY += 6
  doc.text(`HST (${(data.tax_rate * 100).toFixed(0)}%)`, rightX - 50, sumY, { align: 'left' })
  doc.text(`$${data.tax_amount.toFixed(2)}`, rightX, sumY, { align: 'right' })
  sumY += 2
  doc.line(rightX - 60, sumY, rightX, sumY)
  sumY += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('TOTAL', rightX - 50, sumY, { align: 'left' })
  doc.text(`$${data.total.toFixed(2)}`, rightX, sumY, { align: 'right' })

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

  doc.save(`${data.invoice_no}.pdf`)
}
