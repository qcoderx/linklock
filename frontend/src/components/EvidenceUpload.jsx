import { useRef, useState } from 'react';
import { Camera, Upload } from './Icons.jsx';

export function EvidenceUpload({ file, onFile, label = 'Upload proof photo', hint }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [drag, setDrag] = useState(false);

  function handle(f) {
    if (!f) return;
    if (!f.type.startsWith('image/')) return;
    onFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}
        className={`w-full rounded-xl2 border-2 border-dashed p-4 text-center transition-colors cursor-pointer
          ${drag ? 'border-gold-deep bg-gold-soft/50' : 'border-line hover:border-gold-deep hover:bg-gold-soft/30'}`}
      >
        {preview ? (
          <div className="flex flex-col items-center gap-2">
            <img src={preview} alt="Selected evidence preview" className="max-h-44 rounded-lg object-contain" />
            <span className="text-xs text-muted">{file?.name} · tap to replace</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4 text-muted">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-soft text-gold-deep">
              <Camera width={22} height={22} />
            </span>
            <span className="text-sm font-medium text-ink">{label}</span>
            {hint && <span className="text-xs max-w-xs">{hint}</span>}
            <span className="inline-flex items-center gap-1 text-xs mt-1"><Upload width={13} height={13} /> tap, or drag an image here</span>
          </div>
        )}
      </button>
    </div>
  );
}
