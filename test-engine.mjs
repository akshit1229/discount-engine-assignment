import { processCartWithCartOffer } from './src/engine/discountEngine.js'
import { parseRulesCSV, parseCartCSV } from './src/engine/csvParser.js'
import { readFileSync } from 'fs'

const rules = parseRulesCSV(readFileSync('./sample-data/rules.csv', 'utf8')).data
const cart  = parseCartCSV(readFileSync('./sample-data/cart.csv', 'utf8')).data

const { itemResults, cartOffer } = processCartWithCartOffer(cart, rules)

console.log('\n=== ITEM RESULTS ===')
for (const r of itemResults) {
  console.log(`${r.itemId}  base=Rs.${r.basePrice}  final=Rs.${r.finalPrice}  save=Rs.${r.totalDiscount}  => ${r.reasoning}`)
}

console.log('\n=== CART OFFER ===')
console.log(`Items total : Rs.${cartOffer.itemsTotal}`)
console.log(`Triggered   : ${cartOffer.triggered}`)
if (cartOffer.triggered) {
  console.log(`Rule        : ${cartOffer.rule.ruleId}`)
  console.log(`Discount    : -Rs.${cartOffer.cartDiscount}`)
  console.log(`Final total : Rs.${cartOffer.finalCartTotal}`)
}

console.log('\n=== VERIFICATION ===')
const expected = [1104, 629, 509, 2499, 382, 809]
const pass = itemResults.every((r, i) => r.finalPrice === expected[i])
console.log(`Item prices match  : ${pass ? 'ALL PASS' : 'MISMATCH'}`)
console.log(`Cart offer Rs.593  : ${cartOffer.cartDiscount === 593 ? 'PASS' : 'MISMATCH (got ' + cartOffer.cartDiscount + ')'}`)
console.log(`Final total Rs.5339: ${cartOffer.finalCartTotal === 5339 ? 'PASS' : 'MISMATCH (got ' + cartOffer.finalCartTotal + ')'}`)
