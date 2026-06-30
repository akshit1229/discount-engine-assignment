/**
 * PdfUploader.jsx
 *
 * Renders a PDF upload drop zone. On file selection, calls parseCartFromPDF
 * and passes results to onCartLoaded(items, errors, fileName).
 *
 * Error rows are surfaced via ErrorBanner but don't block valid rows from loading.
 */

import { useRef, useState } from 'react'
import { parseCartFromPDF } from '../engine/pdfCartParser.js'
import ErrorBanner from './ErrorBanner.jsx'

const STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  DONE: 'done',
  ERROR: 'error',
}

export default function PdfUploader({ onCartLoaded, hasData, fileName }) {
  const inputRef = useRef(null)
  const [status, setStatus] = useState(STATUS.IDLE)
  const [parseErrors, setParseErrors] = useState([])
  const [errorMsg, setErrorMsg] = useState('')

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = '' // reset so same file can be re-uploaded

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMsg('Please upload a PDF file.')
      setStatus(STATUS.ERROR)
      return
    }

    setStatus(STATUS.LOADING)
    setParseErrors([])
    setErrorMsg('')

    const { data, errors } = await parseCartFromPDF(file)

    if (data.length === 0 && errors.length > 0) {
      // Complete failure — no usable rows
      setErrorMsg(errors[0])
      setParseErrors(errors.slice(1))
      setStatus(STATUS.ERROR)
      return
    }

    // Partial success (some rows may have errors)
    setParseErrors(errors)
    setStatus(STATUS.DONE)
    onCartLoaded(data, errors, file.name)
  }

  const isDone = hasData && status === STATUS.DONE
  const isLoading = status === STATUS.LOADING

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div
        style={{
          border: `2px dashed ${isDone ? '#1e5c2c' : isLoading ? '#aaa' : '#CECECE'}`,
          borderRadius: 6,
          padding: '1rem 1.2rem',
          background: isDone ? '#f0faf2' : '#fafafa',
          cursor: isLoading ? 'wait' : 'pointer',
          transition: 'all 0.15s',
        }}
        onClick={() => !isLoading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: 20 }}>
            {isLoading ? '⏳' : isDone ? '✅' : '📄'}
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#131A48' }}>
              {isLoading ? 'Extracting cart from PDF…' : isDone ? fileName : 'cart PDF'}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
              {isLoading
                ? 'Parsing table structure…'
                : isDone
                ? 'PDF loaded — engine re-ran automatically'
                : 'Upload an order PDF with Product, Brand, Platform, Base Price columns'}
            </div>
          </div>
          {!isLoading && (
            <div style={{ marginLeft: 'auto' }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: isDone ? '#1e5c2c' : '#FF5800',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {isDone ? 'Change' : 'Upload PDF'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Fatal error */}
      {status === STATUS.ERROR && errorMsg && (
        <div style={{
          background: '#fff0f0',
          border: '1px solid #f0b0b0',
          borderRadius: 6,
          padding: '0.6rem 0.8rem',
          fontSize: 12,
          color: '#7a0000',
        }}>
          ✕ {errorMsg}
        </div>
      )}

      {/* Row-level parse warnings */}
      {parseErrors.length > 0 && <ErrorBanner errors={parseErrors} />}
    </div>
  )
}
