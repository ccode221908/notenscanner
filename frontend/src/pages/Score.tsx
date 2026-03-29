import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { ScoreDetail } from '../types';
import { getScore, renameScore, scoreStatusUrl } from '../api';
import ScoreViewer from '../components/ScoreViewer';
import OriginalViewer from '../components/OriginalViewer';
import PartPlayer from '../components/PartPlayer';
import ExportPanel from '../components/ExportPanel';

const TERMINAL_STATUSES = ['ready', 'failed'];
const PROCESSING_STATUSES = ['pending', 'preparing', 'transcribing', 'typesetting', 'processing', 'omr_done'];

interface Step { label: string; hint: string; }
const STEPS: Step[] = [
  { label: 'Eingabe vorbereiten', hint: 'Datei prüfen und ggf. skalieren' },
  { label: 'Notenerkennung (OMR)', hint: 'Audiveris analysiert das Bild — kann mehrere Minuten dauern' },
  { label: 'Notensatz', hint: 'MuseScore erstellt PDF und MIDI' },
];

function statusToStep(status: string): number {
  switch (status) {
    case 'pending':      return 0;
    case 'preparing':
    case 'processing':   return 1;  // legacy
    case 'transcribing': return 2;
    case 'omr_done':
    case 'typesetting':  return 3;
    default:             return 0;
  }
}

const STEP_ICONS = ['🔧', '🔍', '🎵'];

function ProcessingStepper({ status }: { status: string }) {
  const activeStep = statusToStep(status);
  return (
    <div style={{
      margin: '16px 0 24px', padding: '20px 24px',
      background: '#fff', borderRadius: '14px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
      border: '1px solid #f3f4f6',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {STEPS.map((step, i) => {
          const stepNum = i + 1;
          const isDone = activeStep > stepNum;
          const isActive = activeStep === stepNum;
          const isPending = activeStep < stepNum;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                  background: isDone
                    ? 'linear-gradient(135deg, #16a34a, #15803d)'
                    : isActive
                    ? 'linear-gradient(135deg, #1a73e8, #7c3aed)'
                    : '#f3f4f6',
                  color: isDone || isActive ? '#fff' : '#9ca3af',
                  flexShrink: 0,
                  boxShadow: isActive ? '0 0 0 4px rgba(124,58,237,0.15)' : 'none',
                  transition: 'all 0.3s',
                }}>
                  {isDone ? '✓' : STEP_ICONS[i]}
                </div>
                {isActive && (
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%', marginTop: '6px',
                    border: '2px solid #e5e7eb', borderTopColor: '#7c3aed',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                )}
              </div>
              <div style={{ paddingLeft: '10px', paddingRight: '8px', flex: 1, paddingTop: '6px' }}>
                <div style={{
                  fontSize: '13px', fontWeight: isActive ? 700 : 500,
                  color: isPending ? '#9ca3af' : '#111827',
                }}>
                  {step.label}
                </div>
                {isActive && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{step.hint}</div>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  height: '2px', width: '20px', marginTop: '17px', flexShrink: 0,
                  background: isDone
                    ? 'linear-gradient(90deg, #16a34a, #1a73e8)'
                    : '#e5e7eb',
                  borderRadius: '1px',
                }} />
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ZoomSlider({ zoom, onChange }: { zoom: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        type="range"
        min={50}
        max={200}
        step={10}
        value={Math.round(zoom * 100)}
        onChange={e => onChange(Number(e.target.value) / 100)}
        style={{ width: '100px', cursor: 'pointer', accentColor: '#7c3aed' }}
      />
      <span style={{ fontSize: '12px', color: '#6b7280', minWidth: '38px' }}>
        {Math.round(zoom * 100)}%
      </span>
    </div>
  );
}

export default function Score() {
  const { id } = useParams<{ id: string }>();
  const [score, setScore] = useState<ScoreDetail | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [loadError, setLoadError] = useState<string | null>(null);
  const isTerminalRef = useRef(false);

  // Zoom + split state
  const [splitView, setSplitView] = useState(false);
  const [scoreZoom, setScoreZoom] = useState(1);
  const [originalZoom, setOriginalZoom] = useState(1);

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
    <div style={{ minHeight: '100vh', background: '#f7f8fc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
    <div style={{ padding: '28px 24px', maxWidth: '960px', margin: '0 auto' }}>
      <Link to="/" style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        color: '#7c3aed', textDecoration: 'none', fontSize: '14px', fontWeight: 500,
      }}>← Übersicht</Link>

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

      {isProcessing && <ProcessingStepper status={status} />}

      {isFailed && (
        <div style={{
          marginBottom: '20px', padding: '16px 20px',
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '12px', color: '#dc2626',
          display: 'flex', gap: '12px', alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, marginBottom: '2px' }}>Verarbeitung fehlgeschlagen</div>
            {score.error_message && (
              <div style={{ fontSize: '13px', color: '#ef4444', marginTop: '4px' }}>{score.error_message}</div>
            )}
          </div>
        </div>
      )}

      {isReady && (
        <>
          {/* Toolbar: split toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSplitView(v => !v)}
              style={{
                background: splitView ? 'linear-gradient(135deg, #1a73e8, #7c3aed)' : '#fff',
                color: splitView ? '#fff' : '#374151',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {splitView ? '▣ Einzelansicht' : '⧉ Vergleichsansicht'}
            </button>
            {!splitView && (
              <ZoomSlider zoom={scoreZoom} onChange={setScoreZoom} />
            )}
          </div>

          {splitView ? (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '280px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Original</span>
                  {(score.filename.split('.').pop()?.toLowerCase() !== 'pdf') && (
                    <ZoomSlider zoom={originalZoom} onChange={setOriginalZoom} />
                  )}
                </div>
                <OriginalViewer scoreId={score.id} filename={score.filename} zoom={originalZoom} />
              </div>
              <div style={{ flex: 1, minWidth: '280px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Partitur</span>
                  <ZoomSlider zoom={scoreZoom} onChange={setScoreZoom} />
                </div>
                <ScoreViewer scoreId={score.id} zoom={scoreZoom} />
              </div>
            </div>
          ) : (
            <ScoreViewer scoreId={score.id} zoom={scoreZoom} />
          )}

          <PartPlayer scoreId={score.id} parts={score.parts} />
          <ExportPanel scoreId={score.id} />
        </>
      )}
    </div>
    </div>
  );
}
