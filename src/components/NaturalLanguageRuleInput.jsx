/**
 * NaturalLanguageRuleInput.jsx
 *
 * Accepts a plain-English rule description, calls the Groq LLM to parse it,
 * shows a confirmation card, and calls onRuleAdded(rule) on confirmation.
 *
 * This component is a pure UI adapter — it doesn't touch the discount engine.
 * The engine receives only validated DiscountRule objects from llmRuleParser.js.
 */

import { useState } from 'react'
import { parseRuleFromText } from '../engine/llmRuleParser.js'

const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  CONFIRM: 'confirm',
  ERROR: 'error',
  SUCCESS: 'success',
}

export default function NaturalLanguageRuleInput({ onRuleAdded, apiKey }) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState(STATUS.IDLE)
  const [parsedRule, setParsedRule] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [addedRuleId, setAddedRuleId] = useState(null)

  async function handleParse() {
    if (!text.trim()) return
    setStatus(STATUS.LOADING)
    setParsedRule(null)
    setErrorMsg('')

    const result = await parseRuleFromText(text.trim(), apiKey)

    if (result.error) {
      setStatus(STATUS.ERROR)
      setErrorMsg(result.error)
    } else {
      setParsedRule(result.rule)
      setStatus(STATUS.CONFIRM)
    }
  }

  function handleConfirm() {
    if (!parsedRule) return
    // Generate a human-readable rule ID
    const ruleId = `NL-${Date.now().toString(36).toUpperCase()}`
    const newRule = { ...parsedRule, ruleId }
    setAddedRuleId(ruleId)
    onRuleAdded(newRule)
    setStatus(STATUS.SUCCESS)
    setText('')
    setParsedRule(null)
  }

  function handleDiscard() {
    setStatus(STATUS.IDLE)
    setParsedRule(null)
    setErrorMsg('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && status !== STATUS.LOADING) {
      e.preventDefault()
      handleParse()
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.inputRow}>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (status !== STATUS.IDLE && status !== STATUS.LOADING) {
              setStatus(STATUS.IDLE)
              setParsedRule(null)
              setErrorMsg('')
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder='e.g. "20% off for Natura Casa brand, stackable" or "Rs.100 off on Flipkart items"'
          disabled={status === STATUS.LOADING}
          rows={2}
          style={styles.textarea}
        />
        <button
          onClick={handleParse}
          disabled={status === STATUS.LOADING || !text.trim()}
          style={status === STATUS.LOADING || !text.trim() ? styles.btnDisabled : styles.btn}
        >
          {status === STATUS.LOADING ? <Spinner /> : 'Parse Rule'}
        </button>
      </div>

      {/* Confirmation card */}
      {status === STATUS.CONFIRM && parsedRule && (
        <div style={styles.confirmCard}>
          <div style={styles.confirmTitle}>✦ Parsed Rule — Confirm before adding</div>
          {/* Show original input so user can verify the parse is accurate */}
          <div style={styles.originalInput}>
            <span style={styles.originalInputLabel}>Your input: </span>
            <span style={styles.originalInputText}>"{text}"</span>
          </div>
          <div style={styles.fieldGrid}>
            <Field label="Scope" value={capitalize(parsedRule.scope)} />
            {parsedRule.scope !== 'cart' && (
              <Field label="Applies To" value={parsedRule.appliesTo} />
            )}
            <Field label="Type" value={capitalize(parsedRule.type)} />
            <Field
              label="Value"
              value={parsedRule.type === 'percentage' ? `${parsedRule.value}%` : `Rs.${parsedRule.value}`}
              highlight
            />
            <Field label="Stackable" value={parsedRule.stackable ? 'Yes' : 'No'} />
            {parsedRule.scope === 'cart' && (
              <Field
                label="Min Cart Value"
                value={parsedRule.minCartValue != null ? `Rs.${parsedRule.minCartValue.toLocaleString('en-IN')}` : 'None'}
              />
            )}
          </div>
          <div style={styles.confirmBtns}>
            <button onClick={handleConfirm} style={styles.btnConfirm}>
              ✓ Add Rule
            </button>
            <button onClick={handleDiscard} style={styles.btnDiscard}>
              ✕ Discard
            </button>
          </div>
        </div>
      )}

      {/* Error / ambiguous */}
      {status === STATUS.ERROR && (
        <div style={styles.errorCard}>
          <span style={styles.errorIcon}>⚠</span>
          <div>
            <div style={styles.errorTitle}>Could not parse rule</div>
            <div style={styles.errorMsg}>{errorMsg}</div>
          </div>
          <button onClick={handleDiscard} style={styles.errorClose}>✕</button>
        </div>
      )}

      {/* Success confirmation */}
      {status === STATUS.SUCCESS && (
        <div style={styles.successCard}>
          <span>✅</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e5c2c' }}>Rule added!</div>
            <div style={{ fontSize: 11, color: '#555' }}>
              {addedRuleId} — Engine has been re-run with the new rule.
            </div>
          </div>
          <button onClick={() => setStatus(STATUS.IDLE)} style={styles.errorClose}>✕</button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, value, highlight }) {
  return (
    <div style={styles.field}>
      <div style={styles.fieldLabel}>{label}</div>
      <div style={{ ...styles.fieldValue, ...(highlight ? styles.fieldValueHighlight : {}) }}>
        {value}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <span style={styles.spinner} />
  )
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  inputRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'flex-start',
  },
  textarea: {
    flex: 1,
    padding: '0.6rem 0.8rem',
    borderRadius: 6,
    border: '1.5px solid #CECECE',
    fontSize: 13,
    fontFamily: 'inherit',
    color: '#131A48',
    resize: 'none',
    outline: 'none',
    lineHeight: 1.5,
    transition: 'border-color 0.15s',
  },
  btn: {
    background: '#131A48',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '0.6rem 1.1rem',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    letterSpacing: '0.03em',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 100,
    justifyContent: 'center',
  },
  btnDisabled: {
    background: '#CECECE',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '0.6rem 1.1rem',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'not-allowed',
    whiteSpace: 'nowrap',
    minWidth: 100,
    justifyContent: 'center',
    display: 'flex',
    alignItems: 'center',
  },
  spinner: {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  confirmCard: {
    background: 'linear-gradient(135deg, #f0f7ff 0%, #f8f0ff 100%)',
    border: '1.5px solid #c5d8f5',
    borderRadius: 8,
    padding: '1rem 1.1rem',
    animation: 'slideDown 0.2s ease',
  },
  confirmTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#131A48',
    marginBottom: '0.5rem',
    letterSpacing: '0.03em',
  },
  originalInput: {
    fontSize: 11,
    color: '#555',
    marginBottom: '0.65rem',
    background: 'rgba(255,255,255,0.6)',
    borderRadius: 4,
    padding: '3px 7px',
    lineHeight: 1.4,
  },
  originalInputLabel: {
    fontWeight: 700,
    color: '#888',
  },
  originalInputText: {
    fontStyle: 'italic',
    color: '#2c5f8a',
  },
  fieldGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem 1rem',
    marginBottom: '0.75rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: 600,
    color: '#131A48',
  },
  fieldValueHighlight: {
    color: '#FF5800',
    fontSize: 14,
  },
  confirmBtns: {
    display: 'flex',
    gap: '0.5rem',
  },
  btnConfirm: {
    background: '#1e5c2c',
    color: '#fff',
    border: 'none',
    borderRadius: 5,
    padding: '0.45rem 1rem',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '0.03em',
  },
  btnDiscard: {
    background: 'transparent',
    color: '#888',
    border: '1px solid #CECECE',
    borderRadius: 5,
    padding: '0.45rem 1rem',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  errorCard: {
    background: '#fff8e6',
    border: '1.5px solid #f0c060',
    borderRadius: 8,
    padding: '0.75rem 1rem',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.6rem',
    animation: 'slideDown 0.2s ease',
  },
  errorIcon: {
    fontSize: 18,
    color: '#c07800',
    flexShrink: 0,
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#8a5000',
    marginBottom: 2,
  },
  errorMsg: {
    fontSize: 12,
    color: '#5a3500',
    lineHeight: 1.4,
  },
  errorClose: {
    background: 'transparent',
    border: 'none',
    fontSize: 14,
    cursor: 'pointer',
    color: '#888',
    marginLeft: 'auto',
    flexShrink: 0,
    padding: '0 4px',
  },
  successCard: {
    background: '#f0faf2',
    border: '1.5px solid #a0d8b0',
    borderRadius: 8,
    padding: '0.75rem 1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    animation: 'slideDown 0.2s ease',
  },
}
