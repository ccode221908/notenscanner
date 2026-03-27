import { useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { musicxmlUrl } from '../api';

interface ScoreViewerProps {
  scoreId: string;
}

/** Poll until the element has a real rendered width (> 50px). */
function waitForWidth(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (el.offsetWidth > 50) {
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

export default function ScoreViewer({ scoreId }: ScoreViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    const container = containerRef.current;

    async function loadScore() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(musicxmlUrl(scoreId));
        if (!res.ok) {
          throw new Error(`Failed to fetch MusicXML: ${res.status} ${res.statusText}`);
        }
        const xmlText = await res.text();
        if (cancelled) return;

        // Wait for the container to have its real CSS width before handing it to
        // OSMD — otherwise OSMD sees offsetWidth=0 and puts one measure per line.
        await waitForWidth(container);
        if (cancelled) return;

        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize: true,
          drawingParameters: 'default',
          backend: 'svg',
        });
        osmdRef.current = osmd;

        await osmd.load(xmlText);
        if (cancelled) return;

        await osmd.render();
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load score');
          setLoading(false);
        }
      }
    }

    loadScore();

    return () => {
      cancelled = true;
      if (osmdRef.current) {
        osmdRef.current.clear();
        osmdRef.current = null;
      }
    };
  }, [scoreId]);

  return (
    <div>
      {loading && (
        <div style={{ padding: '16px', color: '#666' }}>Partitur wird geladen...</div>
      )}
      {error && (
        <div style={{ padding: '16px', color: '#c00' }}>Fehler: {error}</div>
      )}
      <div
        ref={containerRef}
        style={{ width: '100%', minHeight: '400px', background: '#fff', overflowX: 'auto' }}
      />
    </div>
  );
}
