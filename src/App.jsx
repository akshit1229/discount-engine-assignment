/**
 * App.jsx
 *
 * Top-level component. Manages state for rules, cart items, and results.
 * Wires together:
 *   CSV upload     → parse    → engine → display
 *   PDF upload     → extract  → engine → display
 *   NL text input  → LLM parse → confirm → engine → display
 *
 * The engine (discountEngine.js) is never modified to accommodate new input paths;
 * each input adapter normalises its data into the same CartItem/DiscountRule shape.
 */

import { useState, useCallback } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import PdfUploader from './components/PdfUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import NaturalLanguageRuleInput from './components/NaturalLanguageRuleInput.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { processCartWithCartOffer } from './engine/discountEngine.js'

// ── Column definitions ────────────────────────────────────────────────────────

const RULES_COLUMNS = [
  { key: 'ruleId',    label: 'Rule ID' },
  {
    key: 'scope',
    label: 'Scope',
    render: (v) => {
      const colors = { brand: ['#2c5f8a', '#e8f2fb'], platform: ['#5c2c8a', '#f2e8fb'], cart: ['#1e5c2c', '#f0faf2'] }
      const [fg, bg] = colors[v] || ['#555', '#f0f0f0']
      return <span style={{ ...tag(fg, bg) }}>{v}</span>
    },
  },
  { key: 'appliesTo', label: 'Applies To', render: (v) => v || <span style={{ color: '#aaa' }}>—</span> },
  { key: 'type',      label: 'Type',       render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  {
    key: 'value',
    label: 'Value',
    render: (v, row) => (
      <span style={{ fontWeight: 700, color: '#FF5800' }}>
        {row.type === 'percentage' ? `${v}% off` : `Rs.${v} off`}
      </span>
    ),
  },
  {
    key: 'stackable',
    label: 'Stackable',
    render: (v) => v
      ? <span style={tag('#1e5c2c', '#f0faf2')}>Yes</span>
      : <span style={tag('#888', '#f4f4f4')}>No</span>,
  },
  {
    key: 'minCartValue',
    label: 'Min Cart',
    render: (v) => v != null ? `Rs.${Number(v).toLocaleString('en-IN')}` : <span style={{ color: '#aaa' }}>—</span>,
  },
]

const CART_COLUMNS = [
  { key: 'itemId',    label: 'Item' },
  { key: 'product',   label: 'Product' },
  { key: 'brand',     label: 'Brand' },
  { key: 'platform',  label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
]

const RESULTS_COLUMNS = [
  { key: 'itemId',    label: 'Item' },
  { key: 'product',   label: 'Product' },
  { key: 'basePrice', label: 'Base Price',  render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
  {
    key: 'finalPrice',
    label: 'Final Price',
    render: (v, row) => (
      <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48', fontSize: 13 }}>
        Rs.{v.toLocaleString('en-IN')}
      </span>
    ),
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (v) =>
      v > 0 ? (
        <span style={{ color: '#1e5c2c', fontWeight: 700 }}>
          −Rs.{v.toLocaleString('en-IN')}
        </span>
      ) : (
        <span style={{ color: '#aaa' }}>—</span>
      ),
  },
  {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (v) => (
      <span style={{
        color: v === 'No offers available' ? '#a0a5bf' : '#131A48',
        fontStyle: v === 'No offers available' ? 'italic' : 'normal',
        fontSize: 12,
      }}>
        {v}
      </span>
    ),
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function tag(color, bg) {
  return {
    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px',
    borderRadius: 20, background: bg, color, textTransform: 'uppercase', letterSpacing: '0.04em',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  // ── State ──
  const [rules, setRules]           = useState([])
  const [rulesErrors, setRulesErr]  = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  const [cartItems, setCartItems]   = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName] = useState('')
  const [cartInputMode, setCartInputMode] = useState('csv') // 'csv' | 'pdf'

  const [results, setResults]       = useState(null) // { itemResults, cartOffer }

  // API key for LLM rule parser — read from .env, never shown in UI
  const apiKey = import.meta.env.VITE_GROQ_API_KEY || ''

  // ── Engine runner ──
  const runEngine = useCallback((items, activeRules) => {
    if (items.length > 0 && activeRules.length > 0) {
      setResults(processCartWithCartOffer(items, activeRules))
    }
  }, [])

  // ── Handlers ──

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    setRules(data)
    setRulesErr(errors)
    setRulesFileName(fileName)
    setResults(null)
  }

  function handleCartCsvLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    setCartItems(data)
    setCartErrors(errors)
    setCartFileName(fileName)
    setResults(null)
  }

  function handleCartPdfLoad(items, errors, fileName) {
    setCartItems(items)
    setCartErrors(errors)
    setCartFileName(fileName)
    // Auto re-run if rules are already loaded
    if (rules.length > 0) {
      setResults(processCartWithCartOffer(items, rules))
    } else {
      setResults(null)
    }
  }

  function handleCalculate() {
    const res = processCartWithCartOffer(cartItems, rules)
    setResults(res)
  }

  function handleRuleAdded(newRule) {
    const updatedRules = [...rules, newRule]
    setRules(updatedRules)
    // Re-run engine with updated rule set if cart is loaded
    if (cartItems.length > 0) {
      setResults(processCartWithCartOffer(cartItems, updatedRules))
    }
  }

  const canCalculate = rules.length > 0 && cartItems.length > 0

  // ── Derived ──
  const { itemResults, cartOffer } = results || { itemResults: null, cartOffer: null }

  // ── Render ──
  return (
    <div style={S.page}>
      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.logo}>
            O<span style={{ color: '#FF5800' }}>pp</span>tra
          </div>
          <div style={S.headerPipe} />
          <div style={S.headerSub}>Discount Engine</div>
        </div>
        <div style={S.headerRight}>
          <span style={S.headerTag}>FDE Intern Assignment</span>
        </div>
      </header>

      {/* ── Main content ── */}
      <main style={S.main}>

        {/* ── Upload row ── */}
        <div style={S.grid2}>

          {/* Rules panel */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <div style={S.cardTitle}>
                <span style={S.titleIcon}>📋</span> Discount Rules
              </div>
              {rules.length > 0 && (
                <span style={tag('#1e5c2c', '#f0faf2')}>{rules.length} loaded</span>
              )}
            </div>

            <CsvUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />

            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <DataTable columns={RULES_COLUMNS} rows={rules} />
              </div>
            )}

            {/* Natural language input */}
            <div style={S.nlSection}>
              <div style={S.nlLabel}>
                <span style={S.nlIcon}>✦</span> Add rule in plain English
              </div>

              <NaturalLanguageRuleInput
                onRuleAdded={handleRuleAdded}
                apiKey={apiKey}
                rulesCount={rules.length}
              />
            </div>
          </div>

          {/* Cart panel */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <div style={S.cardTitle}>
                <span style={S.titleIcon}>🛒</span> Cart Items
              </div>
              {cartItems.length > 0 && (
                <span style={tag('#2c5f8a', '#e8f2fb')}>{cartItems.length} items</span>
              )}
            </div>

            {/* Tab switcher */}
            <div style={S.tabBar}>
              {['csv', 'pdf'].map((mode) => (
                <button
                  key={mode}
                  style={cartInputMode === mode ? S.tabActive : S.tab}
                  onClick={() => setCartInputMode(mode)}
                >
                  {mode === 'csv' ? '📄 CSV Upload' : '📑 PDF Upload'}
                </button>
              ))}
            </div>

            {cartInputMode === 'csv' ? (
              <CsvUploader
                label="cart.csv"
                description="Upload your cart CSV"
                onLoad={handleCartCsvLoad}
                hasData={cartItems.length > 0 && cartInputMode === 'csv'}
                fileName={cartFileName}
              />
            ) : (
              <PdfUploader
                onCartLoaded={handleCartPdfLoad}
                hasData={cartItems.length > 0 && cartInputMode === 'pdf'}
                fileName={cartFileName}
              />
            )}

            <ErrorBanner errors={cartErrors} />

            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </div>
        </div>

        {/* ── Calculate button ── */}
        <div style={S.calcRow}>
          <button
            style={canCalculate ? S.calcBtn : S.calcBtnDisabled}
            onClick={handleCalculate}
            disabled={!canCalculate}
          >
            {canCalculate ? '⚡ Calculate Discounts' : 'Calculate Discounts'}
          </button>
          {!canCalculate && (
            <div style={{ fontSize: 12, color: '#a0a5bf', marginTop: 6 }}>
              Upload both rules and cart to calculate
            </div>
          )}
        </div>

        {/* ── Results ── */}
        {itemResults && (
          <div style={{ ...S.card, animation: 'fadeIn 0.3s ease' }}>
            <div style={S.cardHeader}>
              <div style={S.cardTitle}>
                <span style={S.titleIcon}>🏷️</span> Cart Summary
              </div>
              <span style={{ fontSize: 12, color: '#a0a5bf' }}>
                {itemResults.length} item{itemResults.length !== 1 ? 's' : ''}
              </span>
            </div>

            <DataTable columns={RESULTS_COLUMNS} rows={itemResults} />

            {/* Totals section */}
            <div style={S.totalsSection}>

              {/* Subtotal */}
              <div style={S.totalLine}>
                <span style={S.totalLineLabel}>Items subtotal</span>
                <span style={S.totalLineValue}>
                  Rs.{cartOffer.itemsTotal.toLocaleString('en-IN')}
                </span>
              </div>

              {/* Cart offer row */}
              {cartOffer.triggered && (
                <div style={{ ...S.totalLine, ...S.cartOfferLine }}>
                  <div>
                    <div style={S.cartOfferLabel}>
                      🎉 Cart Offer — {cartOffer.rule.ruleId}
                    </div>
                    <div style={S.cartOfferDesc}>
                      {cartOffer.rule.type === 'percentage'
                        ? `${cartOffer.rule.value}% off entire cart`
                        : `Rs.${cartOffer.rule.value} off entire cart`}
                      {cartOffer.rule.minCartValue
                        ? ` (cart ≥ Rs.${cartOffer.rule.minCartValue.toLocaleString('en-IN')})`
                        : ''}
                    </div>
                  </div>
                  <span style={S.cartOfferSaving}>
                    −Rs.{cartOffer.cartDiscount.toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {/* Cart offer not triggered — show why */}
              {!cartOffer.triggered && (() => {
                const cartRules = rules.filter((r) => r.scope === 'cart')
                if (cartRules.length === 0) return null
                const nearest = cartRules.reduce((best, r) =>
                  (r.minCartValue || 0) > (best.minCartValue || 0) ? r : best
                )
                const shortfall = nearest.minCartValue
                  ? nearest.minCartValue - cartOffer.itemsTotal
                  : null
                if (!shortfall || shortfall <= 0) return null
                return (
                  <div style={S.cartOfferMissed}>
                    Add Rs.{shortfall.toLocaleString('en-IN')} more to unlock the cart offer ({nearest.ruleId})
                  </div>
                )
              })()}

              {/* Final total */}
              <div style={S.grandTotalRow}>
                <span style={S.grandTotalLabel}>
                  {cartOffer.triggered ? 'Final Cart Total' : 'Cart Total'}
                </span>
                <span style={S.grandTotalValue}>
                  Rs.{cartOffer.finalCartTotal.toLocaleString('en-IN')}
                </span>
              </div>

              {cartOffer.triggered && (
                <div style={S.totalSaved}>
                  You saved Rs.{(
                    itemResults.reduce((s, r) => s + r.totalDiscount, 0) + cartOffer.cartDiscount
                  ).toLocaleString('en-IN')} in total
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* ── Footer ── */}
      <footer style={S.footer}>
        Opptra Central Tech · FDE Intern Assignment · Discount Engine v2
      </footer>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    fontFamily: "'Inter', system-ui, sans-serif",
    display: 'flex',
    flexDirection: 'column',
  },

  // Header
  header: {
    background: 'var(--navy)',
    padding: '0.75rem 2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 2px 12px rgba(19,26,72,0.25)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  logo: {
    fontFamily: 'Georgia, serif',
    fontSize: 20,
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.02em',
  },
  headerPipe: {
    width: 1,
    height: 18,
    background: 'rgba(255,255,255,0.2)',
  },
  headerSub: {
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  headerRight: {},
  headerTag: {
    fontSize: 10,
    fontWeight: 700,
    color: '#FF5800',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    border: '1px solid rgba(255,88,0,0.4)',
    padding: '3px 8px',
    borderRadius: 20,
  },

  // Layout
  main: {
    maxWidth: 1040,
    margin: '0 auto',
    padding: '1.75rem 1.5rem',
    flex: 1,
    width: '100%',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.25rem',
    marginBottom: '1.25rem',
    alignItems: 'start',
  },

  // Card
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '1.25rem 1.4rem',
    boxShadow: 'var(--shadow-sm)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '0.7rem',
    borderBottom: '2px solid #FF5800',
    marginBottom: '0.1rem',
  },
  cardTitle: {
    fontWeight: 800,
    fontSize: 14,
    color: 'var(--navy)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    letterSpacing: '-0.01em',
  },
  titleIcon: { fontSize: 16 },

  // Tab bar
  tabBar: {
    display: 'flex',
    gap: '0.4rem',
    background: '#f4f5fa',
    padding: 4,
    borderRadius: 8,
  },
  tab: {
    flex: 1,
    padding: '0.4rem 0.8rem',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
  tabActive: {
    flex: 1,
    padding: '0.4rem 0.8rem',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--navy)',
    background: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)',
    fontFamily: 'inherit',
  },

  // NL section
  nlSection: {
    background: '#f8f9ff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '0.9rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  nlLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--navy)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  nlIcon: { color: '#FF5800', fontSize: 14 },

  // API Key
  apiKeyLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  apiKeyInput: {
    width: '100%',
    padding: '0.45rem 0.7rem',
    borderRadius: 6,
    border: '1.5px solid var(--border)',
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--navy)',
    background: '#fff',
    outline: 'none',
  },
  toggleBtn: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--orange)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: 0,
  },

  // Calculate button
  calcRow: {
    textAlign: 'center',
    marginBottom: '1.25rem',
  },
  calcBtn: {
    background: 'linear-gradient(135deg, #FF5800 0%, #ff7a33 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '0.75rem 2.5rem',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    letterSpacing: '0.03em',
    boxShadow: '0 4px 14px rgba(255,88,0,0.35)',
    transition: 'transform 0.15s, box-shadow 0.15s',
    fontFamily: 'inherit',
  },
  calcBtnDisabled: {
    background: '#dde0ec',
    color: '#a0a5bf',
    border: 'none',
    borderRadius: 8,
    padding: '0.75rem 2.5rem',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'not-allowed',
    letterSpacing: '0.03em',
    fontFamily: 'inherit',
  },

  // Totals
  totalsSection: {
    marginTop: '0.5rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  totalLine: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLineLabel: {
    fontSize: 13,
    color: 'var(--text-muted)',
    fontWeight: 500,
  },
  totalLineValue: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
  },
  cartOfferLine: {
    background: 'linear-gradient(135deg, #f0faf2 0%, #eaffef 100%)',
    border: '1px solid var(--green-bd)',
    borderRadius: 8,
    padding: '0.65rem 0.85rem',
    animation: 'slideDown 0.25s ease',
  },
  cartOfferLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: '#1e5c2c',
  },
  cartOfferDesc: {
    fontSize: 11,
    color: '#3a7a4a',
    marginTop: 2,
  },
  cartOfferSaving: {
    fontSize: 15,
    fontWeight: 800,
    color: '#1e5c2c',
  },
  cartOfferMissed: {
    fontSize: 12,
    color: 'var(--amber)',
    background: 'var(--amber-bg)',
    border: '1px solid var(--amber-bd)',
    borderRadius: 6,
    padding: '0.5rem 0.75rem',
  },
  grandTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '0.6rem',
    borderTop: '2px solid var(--navy)',
    marginTop: '0.25rem',
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: 800,
    color: 'var(--navy)',
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: 800,
    color: 'var(--navy)',
    letterSpacing: '-0.02em',
  },
  totalSaved: {
    textAlign: 'right',
    fontSize: 12,
    fontWeight: 600,
    color: '#1e5c2c',
  },

  // Footer
  footer: {
    textAlign: 'center',
    padding: '1.25rem',
    fontSize: 11,
    color: 'var(--text-faint)',
    borderTop: '1px solid var(--border)',
    letterSpacing: '0.04em',
  },
}
