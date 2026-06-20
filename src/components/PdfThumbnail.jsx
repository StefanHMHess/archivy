import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { getSignedUrl } from '../lib/storage'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const BUCKET = 'archivy-dokumente'

export default function PdfThumbnail({ pfad, width = 60 }) {
  const [url, setUrl] = useState(null)
  const [fehler, setFehler] = useState(false)
  const [sichtbar, setSichtbar] = useState(false)
  const ref = useRef()

  useEffect(() => {
    if (!pfad) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setSichtbar(true) },
      { threshold: 0.05 }
    )
    const el = ref.current
    if (el) observer.observe(el)
    return () => { if (el) observer.unobserve(el) }
  }, [pfad])

  useEffect(() => {
    if (!sichtbar || !pfad) return
    getSignedUrl(BUCKET, pfad).then(u => {
      if (u) setUrl(u)
      else setFehler(true)
    })
  }, [sichtbar, pfad])

  const h = Math.round(width * 1.414)

  return (
    <div
      ref={ref}
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
      }}
    >
      {!pfad || fehler ? (
        <span style={{ fontSize: 20, opacity: 0.4 }}>📄</span>
      ) : !url ? (
        <span style={{ fontSize: 11, color: '#94a3b8' }}>…</span>
      ) : (
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
      )}
    </div>
  )
}
