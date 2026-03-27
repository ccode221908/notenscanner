import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { ScoreDetail } from '../types';
import { getScore, renameScore, scoreStatusUrl } from '../api';
import ScoreViewer from '../components/ScoreViewer';
import PartPlayer from '../components/PartPlayer';
import ExportPanel from '../components/ExportPanel';

const TERMINAL_STATUSES = ['ready', 'failed'];
const PROCESSING_STATUSES = ['pending', 'processing', 'omr_done'];

export default function Score() {
  const { id } = useParams<{ id: string }>();
  const [score, setScore] = useState<ScoreDetail | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [loadError, setLoadError] = useState<string | null>(null);
  const isTerminalRef = useRef(false);

  // Rename state
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    isTerminalRef.current = false;
    getScore(id)
      .then((data) => {
        setScore(data);
        setStatus(data.status);
        if (TERMINAL_STATUSES.includes(data.status)) isTerminalRef.current = true;
      })
      .catch(() => setLoadError('Partitur konnte nicht geladen werden.'));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const es = new EventSource(scoreStatusUrl(id));
    es.onmessage = (event: MessageEvent) => {
      if (isTerminalRef.current) return;
      const newStatus = (event.data as string).trim();
      setStatus(newStatus);
      if (TERMINAL_STATUSES.includes(newStatus)) {
        isTerminalRef.current = true;
        es.close();
        getScore(id).then(setScore).catch(() => {});
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [id]);

  function startRename() {
    if (!score) return;
    setRenameValue(score.display_name ?? score.original_filename);
    setRenameError(null);
    setRenaming(true);
  }

  async function confirmRename() {
    if (!id || !score) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRenameSaving(true);
    setRenameError(null);
    try {
      const updated = await renameScore(id, trimmed);
      setScore({ ...score, display_name: updated.display_name });
      setRenaming(false);
    } catch {
      setRenameError('Umbenennen fehlgeschlagen');
    } finally {
      setRenameSaving(false);
    }
  }

  if (loadError) {
    return (
      <div style={{ padding: '24px' }}>
        <Link to="/">← Zurück</Link>
        <p style={{ color: '#c00', marginTop: '16px' }}>{loadError}</p>
      </div>
    );
  }

  if (!score) {
    return (
      <div style={{ padding: '24px' }}>
        <Link to="/">← Zurück</Link>
        <p style={{ marginTop: '16px', color: '#666' }}>Lädt...</p>
      </div>
    );
  }

  const isProcessing = PROCESSING_STATUSES.includes(status);
  const isReady = status === 'ready';
  const isFailed = status === 'failed';
  const title = score.display_name ?? score.original_filename;
  const iconBtn: React.CSSProperties = {
    background: 'none', border: '1px solid #ddd', borderRadius: '4px',
    cursor: 'pointer', padding: '2px 8px', fontSize: '13px', color: '#555', marginLeft: '8px',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
      <Link to="/">← Zurück</Link>

      {/* Title with inline rename */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: '16px', marginBottom: '8px', gap: '8px' }}>
        {renaming ? (
          <>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              disabled={renameSaving}
              style={{ fontSize: '22px', fontWeight: 700, border: '1px solid #4a90e2', borderRadius: '4px', padding: '2px 8px', width: '400px' }}
            />
            <button onClick={confirmRename} disabled={renameSaving} style={{ ...iconBtn, color: '#28a745', borderColor: '#28a745' }}>✓</button>
            <button onClick={() => setRenaming(false)} disabled={renameSaving} style={{ ...iconBtn, color: '#dc3545', borderColor: '#dc3545' }}>✕</button>
            {renameError && <span style={{ color: '#dc3545', fontSize: '13px' }}>{renameError}</span>}
          </>
        ) : (
          <>
            <h1 style={{ margin: 0, fontSize: '22px' }}>{title}</h1>
            <button onClick={startRename} title="Umbenennen" style={iconBtn}>✎</button>
          </>
        )}
      </div>

      {isProcessing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#555' }}>
          <span style={{
            display: 'inline-block', width: '16px', height: '16px',
            border: '2px solid #aaa', borderTopColor: '#333', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          Verarbeitung läuft... ({status})
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {isFailed && (
        <div style={{ marginBottom: '16px', padding: '12px', background: '#ffe0e0', color: '#c00', borderRadius: '4px' }}>
          <strong>Verarbeitung fehlgeschlagen.</strong>
          {score.error_message && <p style={{ marginTop: '4px' }}>{score.error_message}</p>}
        </div>
      )}

      {isReady && (
        <>
          <ScoreViewer scoreId={score.id} />
          <PartPlayer scoreId={score.id} parts={score.parts} />
          <ExportPanel scoreId={score.id} />
        </>
      )}
    </div>
  );
}
