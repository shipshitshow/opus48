import { useRef } from 'react'

interface Props {
  value: string
  onChange: (text: string) => void
  onGenerate: () => void
  onLoadBracket: () => void
  onLoadFlange: () => void
  onImportImage: (file: File) => void
  notice?: string | null
  warnings: string[]
  error?: string
}

export default function SpecBox({ value, onChange, onGenerate, onLoadBracket, onLoadFlange, onImportImage, notice, warnings, error }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="section">
      <h3 className="section-title">
        Part spec
        <span className="hint">paste · import · generate</span>
      </h3>
      <textarea
        className="spec"
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'part: my-part\nunits: mm\nplate:\n  width: 120\n  height: 72\n  thickness: 4'}
      />
      <div className="spec-actions">
        <button className="btn primary" onClick={onGenerate}>Generate model</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>⤒ Import drawing</button>
      </div>
      <div className="spec-actions">
        <button className="btn" onClick={onLoadBracket}>Sample: bracket</button>
        <button className="btn" onClick={onLoadFlange}>Sample: flange</button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onImportImage(f)
          e.target.value = '' // allow re-importing the same file
        }}
      />

      {notice && <div className="msg info">{notice}</div>}
      {error && <div className="msg error">{error}</div>}
      {!error && warnings.length > 0 && (
        <div className="msg warn">
          Parsed with {warnings.length} note{warnings.length > 1 ? 's' : ''}:
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
