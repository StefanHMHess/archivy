import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { getSignedUrl } from '../lib/storage'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const BUCKET = 'archivy-dokumente'

export default function PdfThumbnail({ pfad, width = 60, onClick }) {
  const [url, setUrl] = useState(null)
  const [fehler, setFehler] = useState(false)
  const ref = useRef()

  useEffect(() => {
    let aktiv = true
    setUrl(null)
    setFehler(false)

    if (!pfad) return () => { aktiv = false }

    getSignedUrl(BUCKET, pfad).then(u => {
      if (!aktiv) return
      if (u) setUrl(u)
      else setFehler(true)
    })

    return () => { aktiv = false }
  }, [pfad])

  const h = Math.round(width * 1.414)

  return (
    <button
      type="button"
      ref={ref}
      onClick={e => {
        e.stopPropagation()
        if (typeof onClick !== 'function') {
          e.preventDefault()
          return
        }
        onClick(url || pfad)
      }}
      style={{
        width,
        height: h,
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        position: 'relative',
        cursor: url ? 'zoom-in' : 'default',
        touchAction: 'manipulation',
        padding: 0,
      }}
      aria-label="PDF vergrößern"
      title={url ? 'Klicken für Vollansicht' : 'PDF wird geladen'}
    >
      {!pfad || fehler ? (
        <span style={{ fontSize: 20, opacity: 0.4 }}>📄</span>
      ) : !url ? (
        <span style={{ fontSize: 11, color: '#94a3b8' }}>…</span>
      ) : (
        <>
          <Document
            file={url}
            loading={<span style={{ fontSize: 11, color: '#94a3b8' }}>…</span>}
            error={<span style={{ fontSize: 20, opacity: 0.4 }}>📄</span>}
            onLoadError={() => setFehler(true)}
          >
            <Page
              pageNumber={1}
              width={width}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </Document>
          <span style={{ position: 'absolute', right: 6, bottom: 6, background: 'transparent', color: '#0f172a', fontSize: 12, fontWeight: 700, pointerEvents: 'none' }}>🔍</span>
        </>
      )}
    </button>
  )
}
