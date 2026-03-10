import { useState, useEffect, useRef } from 'react';
import { buildBookmarksHtml, downloadBookmarksHtml, type ExportBookmark } from '../import/exportBookmarks';

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#1e1e2e',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8,
  padding: '1.5rem',
  maxWidth: 420,
  width: '90%',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

interface ExportBookmarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: ExportBookmark[];
}

export default function ExportBookmarksModal({ isOpen, onClose, bookmarks }: ExportBookmarksModalProps) {
  const [step, setStep] = useState<'choice' | 'reorganize'>('choice');
  const [reorganizeFolder, setReorganizeFolder] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('choice');
      setReorganizeFolder('');
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && step === 'choice') closeRef.current?.focus();
  }, [isOpen, step]);

  function handleExportAsIs() {
    if (bookmarks.length === 0) {
      setError('No bookmarks to export.');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const html = buildBookmarksHtml(bookmarks);
      downloadBookmarksHtml(html);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  function handleReorganizeExport() {
    if (bookmarks.length === 0) {
      setError('No bookmarks to export.');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const effectiveFolder = reorganizeFolder.trim();
      const list: ExportBookmark[] = effectiveFolder
        ? bookmarks.map((b) => ({ ...b, folderPath: effectiveFolder }))
        : bookmarks;
      const html = buildBookmarksHtml(list);
      downloadBookmarksHtml(html);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      style={modalOverlayStyle}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
    >
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 id="export-modal-title" style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>
          Export bookmarks
        </h2>

        {step === 'choice' && (
          <>
            <p style={{ margin: '0 0 1rem 0', color: '#b0b0c0', fontSize: '0.95rem' }}>
              Download your {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''} as bookmarks.html.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                ref={closeRef}
                type="button"
                className="btn btn-primary"
                onClick={handleExportAsIs}
                disabled={exporting || bookmarks.length === 0}
              >
                {exporting ? 'Exporting…' : 'Export with current folders'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep('reorganize')}
                disabled={exporting || bookmarks.length === 0}
              >
                Reorganize before export
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'reorganize' && (
          <>
            <p style={{ margin: '0 0 0.75rem 0', color: '#b0b0c0', fontSize: '0.95rem' }}>
              Optionally put all bookmarks under one folder in the exported file. Leave empty to keep current folders.
            </p>
            <label style={{ display: 'block', marginBottom: '1rem', fontSize: '0.9rem' }}>
              Export all under folder (optional)
              <input
                type="text"
                value={reorganizeFolder}
                onChange={(e) => setReorganizeFolder(e.target.value)}
                placeholder="e.g. My Export"
                style={{
                  display: 'block',
                  marginTop: '0.35rem',
                  padding: '0.5rem',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: '1px solid #2d2d44',
                  borderRadius: 4,
                  backgroundColor: '#252538',
                  color: '#eaeaea',
                }}
                onKeyDown={(e) => e.key === 'Escape' && onClose()}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleReorganizeExport}
                disabled={exporting}
              >
                {exporting ? 'Exporting…' : 'Export'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep('choice')}
                disabled={exporting}
              >
                Back
              </button>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={exporting}>
                Cancel
              </button>
            </div>
          </>
        )}

        {error && (
          <p style={{ margin: '1rem 0 0 0', color: '#e0a0a0', fontSize: '0.9rem' }} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
