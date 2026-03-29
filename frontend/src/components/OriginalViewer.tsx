import { originalUrl } from '../api';

interface OriginalViewerProps {
  scoreId: string;
  filename: string;
  zoom?: number;
}

export default function OriginalViewer({ scoreId, filename, zoom = 1 }: OriginalViewerProps) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const isPdf = ext === 'pdf';
  const url = originalUrl(scoreId);

  if (isPdf) {
    return (
      <div style={{ background: '#f0f0f0', height: '80vh' }}>
        <iframe
          src={url}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="Original PDF"
        />
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', background: '#f0f0f0' }}>
      <div style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
        <img
          src={url}
          alt="Original"
          style={{ width: '100%', display: 'block' }}
        />
      </div>
    </div>
  );
}
