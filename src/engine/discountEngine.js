/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no side effects.
 * All functions take plain objects and return plain objects.
 *
 * Data shapes:
 *
 * DiscountRule {
 *   ruleId:       string       — e.g. "RULE-01"
 *   scope:        "brand" | "platform" | "cart"
 *   appliesTo:    string       — e.g. "Natura Casa", "Amazon India" (empty for cart)
 *   type:         "percentage" | "flat"
 *   value:        number       — percentage as integer (15 = 15%), flat in rupees
 *   stackable:    boolean
 *   minCartValue: number|null  — minimum cart total to trigger (cart scope only)
 * }
 *
 * CartItem {
 *   itemId:    string       — e.g. "ITEM-01"
 *   product:   string
 *   brand:     string
 *   platform:  string
 *   basePrice: number       — in rupees
 * }
 *
 * DiscountResult {
 *   itemId:        string
 *   product:       string
 *   brand:         string
 *   platform:      string
 *   basePrice:     number
 *   finalPrice:    number
 *   totalDiscount: number
 *   appliedRules:  string[]
 *   skippedRules:  string[]
 *   reasoning:     string   — customer-readable explanation
 * }
 *
 * CartOfferResult {
 *   triggered:       boolean
 *   rule:            DiscountRule | null
 *   itemsTotal:      number   — sum of final item prices before cart offer
 *   cartDiscount:    number   — rupees saved by cart offer
 *   finalCartTotal:  number   — cart total after cart offer
 * }
 */

/**
 * Returns true if the rule applies to this cart item.
 * Cart-scope rules are never matched at item level — they are handled separately.
 */
export function ruleMatchesItem(item, rule) {
  const normalise = (s) => s.trim().toLowerCase()
  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }
  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }
  // 'cart' scope rules do not match individual items
  return false
}

/**
 * Calculates the rupee discount a rule gives on a given price.
 * Uses the provided price, not the original base price — important for stacking.
 */
export function calculateDiscountAmount(price, rule) {
  if (rule.type === 'percentage') {
    return Math.round(price * rule.value / 100)
  }
  if (rule.type === 'flat') {
    return Math.min(rule.value, price) // never give more than the price itself
  }
  return 0
}

/**
 * Builds the customer-facing reasoning string for an applied rule.
 */
function ruleToReasoning(rule) {
  if (rule.scope === 'cart') {
    return rule.type === 'percentage'
      ? `Cart offer: ${rule.value}% off`
      : `Cart offer: Rs.${rule.value} off`
  }
  const scopeLabel = rule.scope === 'brand' ? 'Brand' : 'Platform'
  if (rule.type === 'percentage') {
    return `${scopeLabel} offer: ${rule.value}% off`
  }
  if (rule.type === 'flat') {
    return `${scopeLabel} offer: Rs.${rule.value} off`
  }
  return `${scopeLabel} offer applied`
}

/**
 * Applies the active discount rules to a single cart item.
 * Returns a DiscountResult.
 *
 * Logic:
 *   1. Find all rules that match this item (brand/platform scope only).
 *   2. Among non-stackable rules, pick the one giving the largest discount.
 *   3. Apply any stackable rules on top of that price.
 *   4. Build the reasoning string from what was applied.
 */
export function applyDiscounts(item, rules) {
  // Only brand/platform rules are eligible at item level
  const itemRules = rules.filter((r) => r.scope !== 'cart')
  const matchingRules = itemRules.filter((r) => ruleMatchesItem(item, r))

  // No rules match — return base price with explanation
  if (matchingRules.length === 0) {
    return {
      itemId: item.itemId,
      product: item.product,
      brand: item.brand,
      platform: item.platform,
      basePrice: item.basePrice,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      reasoning: 'No offers available',
    }
  }

  const nonStackable = matchingRules.filter((r) => !r.stackable)
  const stackable = matchingRules.filter((r) => r.stackable)

  // Pick the non-stackable rule that gives the largest saving
  let winner = null
  let losers = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(item.basePrice, b) -
        calculateDiscountAmount(item.basePrice, a)
    )
    winner = sorted[0]
    losers = sorted.slice(1)
  }

  // Apply winner first, then stack on top
  let price = item.basePrice
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    const saving = calculateDiscountAmount(price, winner)
    price -= saving
    appliedRules.push(winner.ruleId)

    // Explain the choice when multiple non-stackable rules competed
    if (losers.length > 0) {
      const loserDesc = losers.map((r) => {
        const s = calculateDiscountAmount(item.basePrice, r)
        return `${r.ruleId} (Rs.${s})`
      }).join(', ')
      reasoningParts.push(
        `${winner.ruleId} wins: ${ruleToReasoning(winner)} — Rs.${saving} saved (beat ${loserDesc})`
      )
    } else {
      reasoningParts.push(`${winner.ruleId}: ${ruleToReasoning(winner)}`)
    }
  }

  for (const rule of stackable) {
    const saving = calculateDiscountAmount(price, rule)
    price -= saving
    appliedRules.push(rule.ruleId)
    reasoningParts.push(`${rule.ruleId} stacked: ${ruleToReasoning(rule)}`)
  }

  const finalPrice = Math.round(price)

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules,
    skippedRules: losers.map((r) => r.ruleId),
    reasoning: reasoningParts.join(' + '),
  }
}

/**
 * Evaluates cart-level rules against the sum of item final prices.
 * Returns a CartOfferResult.
 *
 * Logic:
 *   1. Filter rules to scope === 'cart'.
 *   2. Sum all item finalPrices.
 *   3. Find cart rules where minCartValue <= itemsTotal (or no condition).
 *   4. Among eligible cart rules, pick the one giving the largest saving.
 *   5. Apply that discount to itemsTotal.
 */
export function applyCartOffer(itemResults, rules) {
  const cartRules = rules.filter((r) => r.scope === 'cart')
  const itemsTotal = itemResults.reduce((sum, r) => sum + r.finalPrice, 0)

  if (cartRules.length === 0) {
    return {
      triggered: false,
      rule: null,
      itemsTotal,
      cartDiscount: 0,
      finalCartTotal: itemsTotal,
    }
  }

  // Find eligible cart rules (condition met)
  const eligible = cartRules.filter(
    (r) => r.minCartValue === null || r.minCartValue === undefined || itemsTotal >= r.minCartValue
  )

  if (eligible.length === 0) {
    return {
      triggered: false,
      rule: null,
      itemsTotal,
      cartDiscount: 0,
      finalCartTotal: itemsTotal,
    }
  }

  // Pick the rule that gives the maximum cart discount
  const best = eligible.reduce((prev, curr) => {
    const prevDiscount = calculateDiscountAmount(itemsTotal, prev)
    const currDiscount = calculateDiscountAmount(itemsTotal, curr)
    return currDiscount > prevDiscount ? curr : prev
  })

  const cartDiscount = calculateDiscountAmount(itemsTotal, best)
  const finalCartTotal = Math.round(itemsTotal - cartDiscount)

  return {
    triggered: true,
    rule: best,
    itemsTotal,
    cartDiscount,
    finalCartTotal,
  }
}

/**
 * Runs applyDiscounts across every item in the cart, then evaluates cart-level offers.
 * Returns { itemResults, cartOffer }.
 */
export function processCartWithCartOffer(cartItems, rules) {
  const itemResults = cartItems.map((item) => applyDiscounts(item, rules))
  const cartOffer = applyCartOffer(itemResults, rules)
  return { itemResults, cartOffer }
}

/**
 * Runs applyDiscounts across every item in the cart.
 * Returns an array of DiscountResult objects.
 * @deprecated Use processCartWithCartOffer instead.
 */
export function processCart(cartItems, rules) {
  return cartItems.map((item) => applyDiscounts(item, rules))
}

/**
 * Sums the final prices across all results (item level, before cart offer).
 */
export function cartTotal(results) {
  return results.reduce((sum, r) => sum + r.finalPrice, 0)
}
