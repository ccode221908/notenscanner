import { useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { musicxmlUrl } from '../api';

interface ScoreViewerProps {
  scoreId: string;
}

/** Wait until the element has a real rendered width (> 200px). */
function waitForWidth(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (el.offsetWidth > 200) {
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
  const lastWidthRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    const container = containerRef.current;

    async function doRender() {
      if (!osmdRef.current || cancelled) return;
      try {
        await osmdRef.current.render();
        lastWidthRef.current = container.offsetWidth;
      } catch {
        // ignore re-render errors
      }
    }

    function handleResize() {
      const w = container.offsetWidth;
      if (w > 200 && Math.abs(w - lastWidthRef.current) > 20) {
        doRender();
      }
    }

    async function loadScore() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(musicxmlUrl(scoreId));
        if (!res.ok) throw new Error(`MusicXML laden fehlgeschlagen: ${res.status}`);
        const xmlText = await res.text();
        if (cancelled) return;

        // Wait until the container has its real CSS width before handing it to OSMD.
        // autoResize is disabled — OSMD's own ResizeObserver fires after the SVG is
        // inserted and measures an inflated scroll-width, causing 1-measure-per-line.
        await waitForWidth(container);
        if (cancelled) return;

        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize: false,
          drawingParameters: 'default',
          backend: 'svg',
        });
        osmdRef.current = osmd;

        await osmd.load(xmlText);
        if (cancelled) return;

        await osmd.render();
        lastWidthRef.current = container.offsetWidth;
        if (!cancelled) setLoading(false);

        // Re-render once after a short delay in case the layout still hadn't
        // fully settled when we first measured (e.g. scrollbar appearing).
        setTimeout(() => {
          if (!cancelled) doRender();
        }, 150);

        window.addEventListener('resize', handleResize);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Partitur konnte nicht angezeigt werden');
          setLoading(false);
        }
      }
    }

    loadScore();

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
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
