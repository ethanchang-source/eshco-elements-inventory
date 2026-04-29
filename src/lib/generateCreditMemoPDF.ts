import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { logoBase64 } from './logoBase64'

interface CreditMemoData {
  memo_no: string
  issued_at: string
  po_number?: string
  payment_terms?: string
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

export function generateCreditMemoPDF(data: CreditMemoData) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(COMPANY.name, 14, 16)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(COMPANY.address, 14, 22)
  doc.text(COMPANY.city, 14, 27)
  doc.text(`Phone: ${COMPANY.phone}`, 14, 32)
  doc.text(`Email: ${COMPANY.email}`, 14, 37)

  try {
    const logoHeight = 15
    const logoWidth = logoHeight * (2186 / 1460)
    doc.addImage(logoBase64, 'PNG', pageWidth / 2 - logoWidth / 2, 10, logoWidth, logoHeight)
  } catch {}

  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('CREDIT MEMO', pageWidth - 14, 16, { align: 'right' })
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`DATE: ${new Date(data.issued_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}`, pageWidth - 14, 24, { align: 'right' })
  if (data.po_number) {
    doc.text(`REFERENCE #: ${data.po_number}`, pageWidth - 14, 30, { align: 'right' })
  }
  doc.text(`CREDIT MEMO #: ${data.memo_no}`, pageWidth - 14, 36, { align: 'right' })

  doc.setDrawColor(200, 200, 200)
  doc.line(14, 48, pageWidth - 14, 48)

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

  doc.line(14, 80, pageWidth - 14, 80)

  autoTable(doc, {
    startY: 84,
    head: [['ITEM #', 'ITEM DESCRIPTION', 'SIZE', 'UNIT COST', 'QTY', 'TOTAL AMOUNT']],
    body: data.items.map(item => [
      item.sku,
      item.name,
      item.size,
      `$${item.unit_price.toFixed(2)}`,
      item.qty.toString(),
      `$${item.total.toFixed(2)}`,
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [100, 60, 180], textColor: 255, fontStyle: 'bold', fontSize: 8 },
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

  if (data.notes) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('Notes:', 14, finalY + 6)
    doc.setFont('helvetica', 'normal')
    const noteLines = doc.splitTextToSize(data.notes, 100)
    doc.text(noteLines, 14, finalY + 12)
  }

  const rightX = pageWidth - 14
  let sumY = finalY
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('SUB TOTAL', rightX - 50, sumY, { align: 'left' })
  doc.text(`$${data.subtotal.toFixed(2)}`, rightX, sumY, { align: 'right' })
  sumY += 6
  doc.text(`HST (${(data.tax_rate * 100).toFixed(0)}%)`, rightX - 50, sumY, { align: 'left' })
  doc.text(`$${data.tax_amount.toFixed(2)}`, rightX, sumY, { align: 'right' })
  sumY += 2
  doc.line(rightX - 60, sumY, rightX, sumY)
  sumY += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('TOTAL CREDIT', rightX - 50, sumY, { align: 'left' })
  doc.text(`$${data.total.toFixed(2)}`, rightX, sumY, { align: 'right' })

  const bottomY = doc.internal.pageSize.getHeight() - 20
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setDrawColor(200, 200, 200)
  doc.line(14, bottomY - 5, pageWidth - 14, bottomY - 5)
  doc.text('If you have any questions about this credit memo, please contact us at sales@iampurebeauty.com', pageWidth / 2, bottomY, { align: 'center' })
  doc.text('Thank You For Your Business!', pageWidth / 2, bottomY + 5, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.text(`HST / GST #: ${COMPANY.hst}`, pageWidth / 2, bottomY + 10, { align: 'center' })

  doc.save(`${data.memo_no}.pdf`)
}
