import { useEffect, useState } from 'react';
import { originalInfoUrl, originalPageUrl } from '../api';

interface OriginalViewerProps {
  scoreId: string;
  zoom?: number;
}

export default function OriginalViewer({ scoreId, zoom = 1 }: OriginalViewerProps) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPageCount(null);

    fetch(originalInfoUrl(scoreId))
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { pages: number }) => {
        if (!cancelled) {
          setPageCount(data.pages);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Original konnte nicht geladen werden');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [scoreId]);

  return (
    <div>
      {loading && (
        <div style={{ padding: '16px', color: '#666' }}>Original wird geladen...</div>
      )}
      {error && (
        <div style={{ padding: '16px', color: '#c00' }}>Fehler: {error}</div>
      )}
      {pageCount !== null && (
        <div style={{ overflowX: 'auto', background: '#f0f0f0' }}>
          <div style={{ width: `${zoom * 100}%` }}>
            {Array.from({ length: pageCount }, (_, i) => (
              <div key={i} style={{ marginBottom: i < pageCount - 1 ? '12px' : 0 }}>
                {pageCount > 1 && (
                  <div style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    color: '#666',
                    background: '#e0e0e0',
                    borderBottom: '1px solid #ccc',
                  }}>
                    Seite {i + 1} / {pageCount}
                  </div>
                )}
                <img
                  src={originalPageUrl(scoreId, i + 1)}
                  alt={`Original Seite ${i + 1}`}
                  style={{ width: '100%', display: 'block' }}
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
