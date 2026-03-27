import { exportUrl, pdfUrl, midiUrl } from '../api';

interface ExportPanelProps {
  scoreId: string;
}

interface ExportButton {
  label: string;
  url: string;
  filename: string;
  primary?: boolean;
  title?: string;
}

const btn = (label: string, url: string, filename: string, title?: string, primary = false): ExportButton =>
  ({ label, url, filename, title, primary });

export default function ExportPanel({ scoreId }: ExportPanelProps) {
  const notationButtons: ExportButton[] = [
    btn('PDF',        pdfUrl(scoreId),             'score.pdf',  'Druckfertige Partitur', true),
    btn('MusicXML',   exportUrl(scoreId, 'mxl'),   'score.mxl',  'Für Finale, Sibelius, Dorico, MuseScore'),
    btn('MuseScore',  exportUrl(scoreId, 'mscz'),  'score.mscz', 'MuseScore-Datei (direkt öffnen)'),
    btn('LilyPond',   exportUrl(scoreId, 'ly'),    'score.ly',   'LilyPond-Quelltext'),
  ];

  const audioButtons: ExportButton[] = [
    btn('MIDI',  midiUrl(scoreId),              'score.mid', 'Standard MIDI – für DAWs und Sequencer', true),
    btn('MP3',   exportUrl(scoreId, 'mp3'),     'score.mp3', 'MP3-Audio'),
  ];

  const groupStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '8px',
  };

  const primaryStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '7px 16px',
    background: '#1a73e8',
    color: '#fff',
    textDecoration: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    border: 'none',
  };

  const secondaryStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '7px 16px',
    background: '#f5f5f5',
    color: '#333',
    textDecoration: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    border: '1px solid #ddd',
  };

  const renderButton = (b: ExportButton) => (
    <a
      key={b.label}
      href={b.url}
      download={b.filename}
      title={b.title}
      style={b.primary ? primaryStyle : secondaryStyle}
    >
      {b.label}
    </a>
  );

  return (
    <div style={{ marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600 }}>Export</h3>

      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Notation &amp; Druck
        </div>
        <div style={groupStyle}>
          {notationButtons.map(renderButton)}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '12px', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Audio
        </div>
        <div style={groupStyle}>
          {audioButtons.map(renderButton)}
        </div>
      </div>
    </div>
  );
}
