import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ScoreRead } from '../types';
import { renameScore, deleteScore } from '../api';

interface ScoreListProps {
  scores: ScoreRead[];
  onRefresh: () => void;
  onDeleted: (id: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending:      'Wartend',
  preparing:    'Vorbereitung…',
  transcribing: 'Notenerkennung…',
  typesetting:  'Notensatz…',
  processing:   'Verarbeitung…',   // legacy
  omr_done:     'Notensatz…',      // legacy
  ready:        'Fertig',
  failed:       'Fehlgeschlagen',
  omr_failed:   'Fehlgeschlagen',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusColor(status: string): string {
  switch (status) {
    case 'ready': return '#28a745';
    case 'failed': case 'omr_failed': return '#dc3545';
    default: return '#856404';
  }
}

function statusBg(status: string): string {
  switch (status) {
    case 'ready': return '#d4edda';
    case 'failed': case 'omr_failed': return '#f8d7da';
    default: return '#fff3cd';
  }
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function displayTitle(score: ScoreRead): string {
  return score.display_name ?? score.original_filename;
}

// ── Per-row component ────────────────────────────────────────────────────────

interface ScoreRowProps {
  score: ScoreRead;
  onRenamed: (updated: ScoreRead) => void;
  onDeleted: (id: string) => void;
}

function ScoreRow({ score, onRenamed, onDeleted }: ScoreRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEdit() {
    setEditValue(displayTitle(score));
    setSaveError(null);
    setEditing(true);
  }

  async function confirmRename() {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await renameScore(score.id, trimmed);
      onRenamed(updated);
      setEditing(false);
    } catch {
      setSaveError('Umbenennen fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!window.confirm(`"${displayTitle(score)}" wirklich löschen?`)) return;
    try {
      await deleteScore(score.id);
      onDeleted(score.id);
    } catch {
      alert('Löschen fehlgeschlagen');
    }
  }

  const iconBtn: React.CSSProperties = {
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: '2px 7px',
    fontSize: '13px',
    color: '#555',
    marginLeft: '4px',
  };

  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      {/* Name / editable */}
      <td style={{ padding: '10px 12px' }}>
        {editing ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              style={{
                border: '1px solid #4a90e2',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '14px',
                width: '220px',
              }}
              disabled={saving}
            />
            <button onClick={confirmRename} disabled={saving} style={{ ...iconBtn, color: '#28a745', borderColor: '#28a745' }}>✓</button>
            <button onClick={() => setEditing(false)} disabled={saving} style={{ ...iconBtn, color: '#dc3545', borderColor: '#dc3545' }}>✕</button>
            {saveError && <span style={{ color: '#dc3545', fontSize: '12px' }}>{saveError}</span>}
          </span>
        ) : (
          <Link to={`/scores/${score.id}`} style={{ color: '#1a73e8', textDecoration: 'none' }}>
            {displayTitle(score)}
          </Link>
        )}
      </td>

      {/* Status */}
      <td style={{ padding: '10px 12px' }}>
        <span
          title={score.error_message ?? undefined}
          style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: '12px',
            fontWeight: 600,
            fontSize: '12px',
            color: statusColor(score.status),
            backgroundColor: statusBg(score.status),
            cursor: score.error_message ? 'help' : 'default',
          }}
        >
          {statusLabel(score.status)}
        </span>
      </td>

      {/* Date */}
      <td style={{ padding: '10px 12px', color: '#666' }}>
        {formatDate(score.created_at)}
      </td>

      {/* Actions */}
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        {!editing && (
          <>
            <button onClick={startEdit} title="Umbenennen" style={iconBtn}>✎</button>
            <button onClick={confirmDelete} title="Löschen" style={{ ...iconBtn, color: '#dc3545', borderColor: '#f5c6cb' }}>🗑</button>
          </>
        )}
      </td>
    </tr>
  );
}

// ── Main list ────────────────────────────────────────────────────────────────

export default function ScoreList({ scores: initialScores, onRefresh, onDeleted }: ScoreListProps) {
  const [scores, setScores] = useState<ScoreRead[]>(initialScores);

  // Sync when parent passes new data (e.g. after refresh)
  if (scores !== initialScores && initialScores.length !== scores.length) {
    setScores(initialScores);
  }

  function handleRenamed(updated: ScoreRead) {
    setScores((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleDeleted(id: string) {
    setScores((prev) => prev.filter((s) => s.id !== id));
    onDeleted(id);
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Partituren</h2>
        <button
          onClick={onRefresh}
          style={{ padding: '6px 16px', border: '1px solid #aaa', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '14px' }}
        >
          Aktualisieren
        </button>
      </div>

      {scores.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', padding: '32px 0' }}>
          Noch keine Partituren. Lade deine erste Partitur oben hoch.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px' }}>Name</th>
              <th style={{ padding: '10px 12px' }}>Status</th>
              <th style={{ padding: '10px 12px' }}>Hochgeladen</th>
              <th style={{ padding: '10px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {scores.map((score) => (
              <ScoreRow
                key={score.id}
                score={score}
                onRenamed={handleRenamed}
                onDeleted={handleDeleted}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
