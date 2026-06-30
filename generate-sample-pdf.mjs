/**
 * generate-sample-pdf.mjs
 *
 * Creates sample-data/cart.pdf for testing the PDF cart upload feature.
 * Run with: node generate-sample-pdf.mjs
 *
 * Requires: npm install --save-dev @pdf-lib/fontkit pdf-lib
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { writeFileSync } from 'fs'

async function createCartPDF() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 500]) // A4-ish width, shorter height
  const { width, height } = page.getSize()

  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)

  const navy = rgb(0.075, 0.102, 0.282)
  const orange = rgb(1, 0.345, 0)
  const gray = rgb(0.55, 0.55, 0.55)
  const lightGray = rgb(0.9, 0.9, 0.95)
  const white = rgb(1, 1, 1)

  // Header background
  page.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: navy })

  // Logo
  page.drawText('Opptra', { x: 40, y: height - 35, font: bold, size: 22, color: white })

  // Order metadata
  page.drawText('Order #OP-9921', { x: 40, y: height - 80, font: bold, size: 11, color: navy })
  page.drawText('Date: 15 Jan 2025', { x: 40, y: height - 96, font: regular, size: 10, color: gray })

  // Separator
  page.drawLine({ start: { x: 40, y: height - 110 }, end: { x: width - 40, y: height - 110 }, thickness: 1, color: lightGray })

  // Column headers
  const cols = { product: 40, brand: 200, platform: 320, price: 460 }
  const headerY = height - 130

  page.drawRectangle({ x: 30, y: headerY - 6, width: width - 60, height: 22, color: navy })

  for (const [key, x] of Object.entries(cols)) {
    const label = key === 'price' ? 'Base Price' : key.charAt(0).toUpperCase() + key.slice(1)
    page.drawText(label, { x, y: headerY, font: bold, size: 9, color: white })
  }

  // Data rows
  const rows = [
    { product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', price: 'Rs.1,299' },
    { product: 'Bed Sheet Set', brand: 'Natura Casa', platform: 'Flipkart', price: 'Rs.849' },
    { product: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Amazon India', price: 'Rs.599' },
    { product: 'Ceramic Vase', brand: 'LivSpace Pro', platform: 'Noon', price: 'Rs.2,499' },
    { product: 'Cutting Board', brand: 'Nordic Basics', platform: 'Amazon India', price: 'Rs.449' },
    { product: 'Desk Organiser', brand: 'Nordic Basics', platform: 'Flipkart', price: 'Rs.899' },
  ]

  let y = headerY - 28
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    // Alternating row background
    if (i % 2 === 1) {
      page.drawRectangle({ x: 30, y: y - 6, width: width - 60, height: 20, color: rgb(0.97, 0.97, 0.99) })
    }
    page.drawText(row.product,  { x: cols.product,  y, font: regular, size: 10, color: navy })
    page.drawText(row.brand,    { x: cols.brand,    y, font: regular, size: 10, color: navy })
    page.drawText(row.platform, { x: cols.platform, y, font: regular, size: 10, color: navy })
    page.drawText(row.price,    { x: cols.price,    y, font: bold,    size: 10, color: orange })
    y -= 26
  }

  // Bottom separator
  page.drawLine({ start: { x: 40, y: y + 10 }, end: { x: width - 40, y: y + 10 }, thickness: 1, color: lightGray })

  // Footer
  page.drawText('Opptra Marketplace · Confidential', {
    x: 40, y: 30, font: regular, size: 8, color: gray
  })

  const bytes = await doc.save()
  writeFileSync('sample-data/cart.pdf', bytes)
  console.log('✅ sample-data/cart.pdf created successfully')
}

createCartPDF().catch(console.error)
