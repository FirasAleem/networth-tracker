import { useState } from 'react'
import { ClipboardCopy, Check, Eye } from 'lucide-react'
import { buildNotesText, copyText } from '../lib/notes'

export default function CopyToNotes({ summary }) {
  const [copied, setCopied] = useState(false)
  const [preview, setPreview] = useState(false)
  const text = buildNotesText(summary)

  async function handleCopy() {
    const ok = await copyText(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1 p-1 glass rounded-xl">
        <button
          onClick={handleCopy}
          title="Copy to Notes"
          aria-label="Copy to Notes"
          className={`p-2 rounded-lg transition-colors ${
            copied ? 'text-gain' : 'text-slate-400 hover:text-white hover:bg-dark-600'
          }`}
        >
          {copied ? <Check size={18} /> : <ClipboardCopy size={18} />}
        </button>
        <button
          onClick={() => setPreview(p => !p)}
          title="Preview what will be copied"
          aria-label="Preview"
          className={`p-2 rounded-lg transition-colors ${
            preview ? 'text-white bg-dark-600' : 'text-slate-400 hover:text-white hover:bg-dark-600'
          }`}
        >
          <Eye size={18} />
        </button>
      </div>

      {preview && (
        <div className="absolute right-0 mt-2 z-20 w-72 max-w-[calc(100vw-2rem)] glass rounded-xl p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Copy to Notes</p>
            <button
              onClick={handleCopy}
              className={`text-xs font-medium ${copied ? 'text-gain' : 'text-accent hover:text-accent-light'}`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed">{text}</pre>
        </div>
      )}
    </div>
  )
}
