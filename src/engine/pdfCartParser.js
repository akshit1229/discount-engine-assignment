/**
 * pdfCartParser.js
 *
 * Extracts cart items from a PDF file using pdf.js.
 * Expects a table with columns: Product | Brand | Platform | Base Price.
 * Returns { data: CartItem[], errors: string[] }.
 *
 * Strategy — two-pass extraction:
 *  Pass 1 (coordinate-aware): locate the four column headers, bucket all
 *           data-row items by nearest column X, zip into rows.
 *  Pass 2 (text-stream fallback): if Pass 1 yields no rows, treat the
 *           extracted text as an ordered stream and parse it column-by-column
 *           using keyword sentinels.  This handles PDFs where columns are
 *           stored as independent text streams with non-matching Y values.
 *
 * Design decisions:
 * - Malformed rows are collected as errors, not thrown — valid rows still load.
 * - Rs. prefixes and comma-thousands separators are stripped before parsing price.
 * - If no table is detected at all, a clear error is returned.
 */

import { normaliseCartRow } from './csvParser.js'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export async function parseCartFromPDF(file) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  let pdf
  try {
    const arrayBuffer = await file.arrayBuffer()
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  } catch (e) {
    return { data: [], errors: [`Failed to read PDF: ${e.message}`] }
  }

  // Collect all text items with coordinates
  const textItems = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page    = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    for (const item of content.items) {
      const str = (item.str || '').trim()
      if (str) {
        textItems.push({
          text: str,
          x:    item.transform[4],
          y:    item.transform[5],
        })
      }
    }
  }

  if (textItems.length === 0) {
    return { data: [], errors: ['PDF appears to be empty or image-based (no extractable text).'] }
  }

  // Pass 1 — coordinate-aware column bucketing
  const result = parseByColumns(textItems)
  if (result && result.data.length > 0) return result

  // Pass 2 — text-stream column sentinel parser (handles column-stream PDFs)
  const result2 = parseByTextStream(textItems)
  if (result2 && result2.data.length > 0) return result2

  return {
    data:   [],
    errors: [
      'Could not find a table with columns: Product, Brand, Platform, Base Price. ' +
      'Please ensure the PDF matches the expected format.',
    ],
  }
}

// ── Pass 1: coordinate-aware ──────────────────────────────────────────────────

function parseByColumns(textItems) {
  // 1a. Locate headers
  const H = { product: null, brand: null, platform: null, base_price: null }
  for (const item of textItems) {
    const t = item.text.toLowerCase()
    if (!H.product    && t === 'product')                             H.product    = item
    if (!H.brand      && t === 'brand')                               H.brand      = item
    if (!H.platform   && t === 'platform')                            H.platform   = item
    if (!H.base_price && (t === 'base price' || t === 'price' || t === 'base')) H.base_price = item
  }
  if (!Object.values(H).every(Boolean)) return null

  const colX       = { product: H.product.x, brand: H.brand.x, platform: H.platform.x, base_price: H.base_price.x }
  const headerMaxY = Math.max(...Object.values(H).map(h => h.y))
  const headerSet  = new Set(Object.values(H))
  const SKIP       = new Set(['product', 'brand', 'platform', 'base price', 'price', 'base'])
  const colEntries = Object.entries(colX)
  const buckets    = { product: [], brand: [], platform: [], base_price: [] }

  for (const item of textItems) {
    if (headerSet.has(item))                           continue
    if (item.y >= headerMaxY - 2)                      continue  // at or above header
    if (SKIP.has(item.text.toLowerCase()))             continue

    let nearest = null, minDist = Infinity
    for (const [col, x] of colEntries) {
      const d = Math.abs(item.x - x)
      if (d < minDist) { minDist = d; nearest = col }
    }
    if (nearest && minDist < 120) buckets[nearest].push(item)
  }

  // 1b. Sort top-to-bottom within each column
  for (const col of Object.keys(buckets)) {
    buckets[col].sort((a, b) => b.y - a.y || a.x - b.x)
  }

  // 1c. Merge tokens at the same Y (e.g. "Amazon" + "India", or split price)
  const cols = {}
  for (const [col, items] of Object.entries(buckets)) {
    cols[col] = mergeByY(items, 4)
  }

  return zipToRows(cols)
}

// ── Pass 2: text-stream sentinel parser ───────────────────────────────────────

/**
 * Treats the PDF text items as an ordered stream.
 * Column headers act as sentinels that set the "current column".
 * Everything between two sentinels belongs to the preceding column.
 *
 * Works for PDFs where columns are stored as independent text streams
 * (all items from column 1, then all from column 2, etc.) with non-matching
 * Y coordinates across columns — making coordinate-based row grouping fail.
 */
function parseByTextStream(textItems) {
  // Extract just the text strings in extraction order
  const texts = textItems.map(i => i.text)

  const METADATA_RE = /^(opptra|order|date:|page\s*\d|confidential)/i
  const HEADER_KEYWORDS = new Set(['product', 'brand', 'platform', 'base price', 'price'])

  const cols = { product: [], brand: [], platform: [], base_price: [] }
  let currentCol = null
  let foundHeaders = 0

  // We accumulate a pending "Base" to combine with the following "Price"
  let pendingBase = false

  for (const text of texts) {
    const t = text.toLowerCase().trim()

    // Detect column headers
    if (t === 'product')    { currentCol = 'product';    foundHeaders++; pendingBase = false; continue }
    if (t === 'brand')      { currentCol = 'brand';      foundHeaders++; pendingBase = false; continue }
    if (t === 'platform')   { currentCol = 'platform';   foundHeaders++; pendingBase = false; continue }
    if (t === 'base price') { currentCol = 'base_price'; foundHeaders++; pendingBase = false; continue }
    if (t === 'base')       { pendingBase = true; continue }
    if (t === 'price' && pendingBase) {
      currentCol = 'base_price'; foundHeaders++; pendingBase = false; continue
    }
    pendingBase = false

    // Skip metadata lines (title, order#, date, footer)
    if (METADATA_RE.test(t)) continue

    // Skip separator lines
    if (/^[-─═\s]+$/.test(text)) continue

    // Skip stray header keywords
    if (HEADER_KEYWORDS.has(t)) continue

    // Nothing useful until we've seen at least one header
    if (foundHeaders === 0 || !currentCol) continue

    // Accumulate into current column
    cols[currentCol].push(text)
  }

  if (foundHeaders < 4) return null
  return zipToRows(cols)
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Merge consecutive items whose Y coordinates are within Y_TOL of each other. */
function mergeByY(items, Y_TOL = 4) {
  const merged = []
  for (const item of items) {
    const last = merged[merged.length - 1]
    if (last && Math.abs(item.y - last.y) <= Y_TOL) {
      last.text += ' ' + item.text
      last.y     = (last.y + item.y) / 2
    } else {
      merged.push({ text: item.text, y: item.y })
    }
  }
  return merged.map(i => i.text)
}

/** Zip four column arrays into CartItem rows. */
function zipToRows(cols) {
  const numRows = Math.min(...Object.values(cols).map(c => c.length))
  if (numRows === 0) return { data: [], errors: ['No data rows found after the header row.'] }

  const data   = []
  const errors = []

  for (let i = 0; i < numRows; i++) {
    const rawRow = {
      product:    cols.product[i],
      brand:      cols.brand[i],
      platform:   cols.platform[i],
      base_price: cols.base_price[i],
    }
    const { item, error } = normaliseCartRow(rawRow, i)
    if (error) errors.push(error)
    else        data.push(item)
  }

  data.forEach((item, i) => {
    item.itemId = `ITEM-${String(i + 1).padStart(2, '0')}`
  })

  return { data, errors }
}
