import { Link } from 'react-router-dom';
import type { ScoreRead } from '../types';

interface ScoreListProps {
  scores: ScoreRead[];
  onRefresh: () => void;
}

function statusColor(status: string): string {
  switch (status) {
    case 'ready':
      return '#28a745';
    case 'failed':
    case 'omr_failed':
      return '#dc3545';
    default:
      // pending, processing, omr_done
      return '#856404';
  }
}

function statusBg(status: string): string {
  switch (status) {
    case 'ready':
      return '#d4edda';
    case 'failed':
    case 'omr_failed':
      return '#f8d7da';
    default:
      return '#fff3cd';
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function ScoreList({ scores, onRefresh }: ScoreListProps) {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '20px' }}>Scores</h2>
        <button
          onClick={onRefresh}
          style={{
            padding: '6px 16px',
            border: '1px solid #aaa',
            borderRadius: '6px',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Refresh
        </button>
      </div>

      {scores.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', padding: '32px 0' }}>
          No scores yet. Upload your first sheet music above.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px' }}>Filename</th>
              <th style={{ padding: '10px 12px' }}>Status</th>
              <th style={{ padding: '10px 12px' }}>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((score) => (
              <tr
                key={score.id}
                style={{ borderBottom: '1px solid #eee' }}
              >
                <td style={{ padding: '10px 12px' }}>
                  <Link
                    to={`/scores/${score.id}`}
                    style={{ color: '#1a73e8', textDecoration: 'none' }}
                  >
                    {score.original_filename}
                  </Link>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span
                    title={
                      (score.status === 'failed' || score.status === 'omr_failed') &&
                      score.error_message
                        ? score.error_message
                        : undefined
                    }
                    style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: '12px',
                      fontWeight: 600,
                      fontSize: '12px',
                      color: statusColor(score.status),
                      backgroundColor: statusBg(score.status),
                      cursor:
                        (score.status === 'failed' || score.status === 'omr_failed') &&
                        score.error_message
                          ? 'help'
                          : 'default',
                    }}
                  >
                    {score.status}
                  </span>
                  {(score.status === 'failed' || score.status === 'omr_failed') &&
                    score.error_message && (
                      <span
                        style={{
                          marginLeft: '8px',
                          color: '#dc3545',
                          fontSize: '12px',
                        }}
                      >
                        {score.error_message}
                      </span>
                    )}
                </td>
                <td style={{ padding: '10px 12px', color: '#666' }}>
                  {formatDate(score.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
