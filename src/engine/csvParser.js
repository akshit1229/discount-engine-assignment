/**
 * csvParser.js
 *
 * Converts raw CSV text into the typed objects the discount engine expects.
 * Uses papaparse for reliable CSV parsing, then maps column names to the
 * internal data shapes.
 *
 * Expected rules.csv columns:
 *   rule_id, scope, applies_to, type, value, stackable, min_cart_value
 *
 * Expected cart.csv columns:
 *   item_id, product, brand, platform, base_price
 */

import Papa from 'papaparse'

/**
 * Parses the raw text of rules.csv into an array of DiscountRule objects.
 * Returns { data, errors } where errors is an array of row-level issues.
 *
 * Supports scopes: "brand", "platform", "cart"
 * Cart rules have an optional applies_to and a required min_cart_value.
 */
export function parseRulesCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const rowNum = i + 2 // account for header row
    const missing = []

    if (!row.rule_id) missing.push('rule_id')
    if (!row.scope) missing.push('scope')
    if (!row.type) missing.push('type')
    if (row.value === undefined || row.value === '') missing.push('value')
    if (row.stackable === undefined || row.stackable === '') missing.push('stackable')

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`)
      return
    }

    const scope = row.scope.trim().toLowerCase()
    if (scope !== 'brand' && scope !== 'platform' && scope !== 'cart') {
      errors.push(`Row ${rowNum}: scope must be "brand", "platform", or "cart", got "${row.scope}"`)
      return
    }

    // Non-cart rules require applies_to
    if (scope !== 'cart' && !row.applies_to) {
      errors.push(`Row ${rowNum}: applies_to is required for scope "${scope}"`)
      return
    }

    const type = row.type.trim().toLowerCase()
    if (type !== 'percentage' && type !== 'flat') {
      errors.push(`Row ${rowNum}: type must be "percentage" or "flat", got "${row.type}"`)
      return
    }

    const value = parseFloat(row.value)
    if (isNaN(value) || value <= 0) {
      errors.push(`Row ${rowNum}: value must be a positive number, got "${row.value}"`)
      return
    }

    const stackableStr = row.stackable.trim().toLowerCase()
    const stackable = stackableStr === 'true' || stackableStr === '1' || stackableStr === 'yes'

    // Parse min_cart_value for cart-scope rules
    let minCartValue = null
    if (scope === 'cart') {
      const rawMin = row.min_cart_value
      if (rawMin && rawMin.trim() !== '') {
        const parsed = parseFloat(rawMin)
        if (isNaN(parsed) || parsed < 0) {
          errors.push(`Row ${rowNum}: min_cart_value must be a non-negative number, got "${rawMin}"`)
          return
        }
        minCartValue = parsed
      }
    }

    data.push({
      ruleId: row.rule_id.trim(),
      scope,
      appliesTo: scope !== 'cart' ? row.applies_to.trim() : '',
      type,
      value,
      stackable,
      minCartValue,
    })
  })

  return { data, errors }
}

/**
 * Parses the raw text of cart.csv into an array of CartItem objects.
 * Returns { data, errors } where errors is an array of row-level issues.
 */
export function parseCartCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const missing = []

    if (!row.item_id) missing.push('item_id')
    if (!row.product) missing.push('product')
    if (!row.brand) missing.push('brand')
    if (!row.platform) missing.push('platform')
    if (row.base_price === undefined || row.base_price === '') missing.push('base_price')

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`)
      return
    }

    const basePrice = parseFloat(row.base_price)
    if (isNaN(basePrice) || basePrice <= 0) {
      errors.push(`Row ${rowNum}: base_price must be a positive number, got "${row.base_price}"`)
      return
    }

    data.push({
      itemId: row.item_id.trim(),
      product: row.product.trim(),
      brand: row.brand.trim(),
      platform: row.platform.trim(),
      basePrice: Math.round(basePrice),
    })
  })

  return { data, errors }
}

/**
 * Normalises a raw cart row object (from PDF or manual entry) into a CartItem.
 * Fields: product, brand, platform, base_price (or basePrice).
 * Returns { item, error } — one of them will be null.
 */
export function normaliseCartRow(raw, index) {
  const rowNum = index + 1
  const product = (raw.product || '').trim()
  const brand = (raw.brand || '').trim()
  const platform = (raw.platform || '').trim()
  const rawPrice = raw.base_price || raw.basePrice || raw['base price'] || ''
  // Match the first digit and all following digits/commas (handles "Rs.1,299", "1,299", "1299")
  const priceMatch = String(rawPrice).match(/(\d[\d,]*)/)
  const priceStr   = priceMatch ? priceMatch[1].replace(/,/g, '') : ''
  const basePrice  = parseFloat(priceStr)

  if (!product || !brand || !platform) {
    return { item: null, error: `Row ${rowNum}: missing product, brand, or platform` }
  }
  if (isNaN(basePrice) || basePrice <= 0) {
    return { item: null, error: `Row ${rowNum}: invalid base_price "${rawPrice}"` }
  }

  return {
    item: {
      itemId: `ITEM-${String(index + 1).padStart(2, '0')}`,
      product,
      brand,
      platform,
      basePrice: Math.round(basePrice),
    },
    error: null,
  }
}
