import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { ScoreDetail } from '../types';
import { getScore, scoreStatusUrl, pdfUrl } from '../api';
import ScoreViewer from '../components/ScoreViewer';
import PartPlayer from '../components/PartPlayer';

const TERMINAL_STATUSES = ['ready', 'failed'];
const PROCESSING_STATUSES = ['pending', 'processing', 'omr_done'];

export default function Score() {
  const { id } = useParams<{ id: string }>();
  const [score, setScore] = useState<ScoreDetail | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [loadError, setLoadError] = useState<string | null>(null);
  const isTerminalRef = useRef(false);

  // Initial fetch of score detail
  useEffect(() => {
    if (!id) return;
    isTerminalRef.current = false;

    getScore(id)
      .then((data) => {
        setScore(data);
        setStatus(data.status);
        if (TERMINAL_STATUSES.includes(data.status)) {
          isTerminalRef.current = true;
        }
      })
      .catch(() => {
        setLoadError('Failed to load score.');
      });
  }, [id]);

  // SSE polling — single persistent connection, only depends on id
  useEffect(() => {
    if (!id) return;

    const es = new EventSource(scoreStatusUrl(id));

    es.onmessage = (event: MessageEvent) => {
      if (isTerminalRef.current) return;

      // Backend sends plain text: "data: ready\n\n" → event.data is "ready"
      const newStatus = (event.data as string).trim();
      setStatus(newStatus);

      if (TERMINAL_STATUSES.includes(newStatus)) {
        isTerminalRef.current = true;
        es.close();
        // Re-fetch to get updated parts list / error message
        getScore(id).then(setScore).catch(() => {});
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [id]);

  if (loadError) {
    return (
      <div style={{ padding: '24px' }}>
        <Link to="/">← Back to list</Link>
        <p style={{ color: '#c00', marginTop: '16px' }}>{loadError}</p>
      </div>
    );
  }

  if (!score) {
    return (
      <div style={{ padding: '24px' }}>
        <Link to="/">← Back to list</Link>
        <p style={{ marginTop: '16px', color: '#666' }}>Loading...</p>
      </div>
    );
  }

  const isProcessing = PROCESSING_STATUSES.includes(status);
  const isReady = status === 'ready';
  const isFailed = status === 'failed';

  return (
    <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
      <Link to="/">← Back to list</Link>

      <h1 style={{ marginTop: '16px', marginBottom: '8px' }}>
        {score.original_filename}
      </h1>

      {isProcessing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#555' }}>
          <span
            style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              border: '2px solid #aaa',
              borderTopColor: '#333',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          Processing... ({status})
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {isFailed && (
        <div style={{ marginBottom: '16px', padding: '12px', background: '#ffe0e0', color: '#c00', borderRadius: '4px' }}>
          <strong>Processing failed.</strong>
          {score.error_message && <p style={{ marginTop: '4px' }}>{score.error_message}</p>}
        </div>
      )}

      {isReady && (
        <>
          <ScoreViewer scoreId={score.id} />

          <PartPlayer scoreId={score.id} parts={score.parts} />

          <div style={{ marginTop: '16px' }}>
            <a
              href={pdfUrl(score.id)}
              download
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: '#0066cc',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: '4px',
              }}
            >
              Download PDF
            </a>
          </div>
        </>
      )}
    </div>
  );
}
