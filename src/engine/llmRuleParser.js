/**
 * llmRuleParser.js
 *
 * Sends a plain-English description to the Groq API and extracts a structured
 * DiscountRule object. Returns the rule or a typed error — never throws.
 *
 * The engine never receives raw LLM output; all fields are validated here
 * before being returned to the caller.
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `You are a discount rule parser for an e-commerce pricing engine.
Extract structured discount rule data from the user's plain-English description.

Return ONLY a JSON object with these exact fields (no markdown, no explanation):
{
  "scope": "brand" | "platform" | "cart",
  "appliesTo": string (brand name or platform name; empty string "" for cart scope),
  "type": "percentage" | "flat",
  "value": number (percentage as integer e.g. 15 for 15%, or rupee amount),
  "stackable": boolean,
  "minCartValue": number | null (only for cart scope, null otherwise)
}

Rules:
- scope "brand" means it applies to a specific brand (e.g. "Natura Casa")
- scope "platform" means it applies to a specific platform (e.g. "Amazon India", "Flipkart")
- scope "cart" means it applies to the entire cart total when a condition is met
- stackable: true only if the user explicitly mentions "stackable" or "stack with other offers"
- For "flat" type, value is the rupee amount (e.g. Rs.150 → value: 150)
- For "percentage" type, value is the integer percentage (e.g. 20% → value: 20)
- minCartValue: the minimum cart total in rupees required to trigger a cart rule (null if not specified)

If the input is ambiguous or missing critical information (no discount value, no scope, etc.),
return ONLY this error object instead:
{
  "error": "brief explanation of what is missing or ambiguous"
}

Examples:
Input: "20% off for Natura Casa brand, stackable with other offers"
Output: {"scope":"brand","appliesTo":"Natura Casa","type":"percentage","value":20,"stackable":true,"minCartValue":null}

Input: "Rs.100 flat discount on all Flipkart items"
Output: {"scope":"platform","appliesTo":"Flipkart","type":"flat","value":100,"stackable":false,"minCartValue":null}

Input: "10% off if cart value is more than Rs.5000"
Output: {"scope":"cart","appliesTo":"","type":"percentage","value":10,"stackable":false,"minCartValue":5000}

Input: "Give a discount for big orders"
Output: {"error":"Discount value and threshold are unspecified. Please provide a percentage or rupee amount, and a minimum cart value if this is a cart-level offer."}`

/**
 * Parses a plain-English rule description into a DiscountRule object.
 *
 * @param {string} text - User's natural language input
 * @param {string} apiKey - Groq API key
 * @returns {Promise<{rule: object}|{error: string}>}
 */
export async function parseRuleFromText(text, apiKey) {
  if (!text || !text.trim()) {
    return { error: 'Please describe a discount rule.' }
  }
  if (!apiKey || !apiKey.trim()) {
    return { error: 'Groq API key is required for natural language rule parsing.' }
  }

  let raw
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text.trim() },
        ],
        temperature: 0,
        max_tokens: 256,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      const msg = errBody?.error?.message || `HTTP ${response.status}`
      return { error: `Groq API error: ${msg}` }
    }

    const body = await response.json()
    raw = body.choices?.[0]?.message?.content
    if (!raw) {
      return { error: 'LLM returned an empty response. Please try again.' }
    }
  } catch (e) {
    return { error: `Network error calling Groq API: ${e.message}` }
  }

  // Parse the JSON
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'LLM returned malformed JSON. Please try again.' }
  }

  // Check for explicit error from LLM
  if (parsed.error) {
    return { error: parsed.error }
  }

  // Validate all required fields
  const validationError = validateParsedRule(parsed)
  if (validationError) {
    return { error: `Parsed rule is invalid: ${validationError}` }
  }

  return { rule: parsed }
}

/**
 * Validates the structure of a parsed rule object.
 * Returns an error string or null if valid.
 */
function validateParsedRule(r) {
  if (!['brand', 'platform', 'cart'].includes(r.scope)) {
    return `scope must be "brand", "platform", or "cart", got "${r.scope}"`
  }
  if (r.scope !== 'cart' && (typeof r.appliesTo !== 'string' || !r.appliesTo.trim())) {
    return `appliesTo must be a non-empty string for scope "${r.scope}"`
  }
  if (!['percentage', 'flat'].includes(r.type)) {
    return `type must be "percentage" or "flat", got "${r.type}"`
  }
  if (typeof r.value !== 'number' || r.value <= 0) {
    return `value must be a positive number, got ${r.value}`
  }
  if (r.type === 'percentage' && r.value > 100) {
    return `percentage value cannot exceed 100, got ${r.value}`
  }
  if (typeof r.stackable !== 'boolean') {
    return `stackable must be a boolean, got ${typeof r.stackable}`
  }
  if (r.scope === 'cart' && r.minCartValue !== null && typeof r.minCartValue !== 'number') {
    return `minCartValue must be a number or null for cart scope`
  }
  return null
}
