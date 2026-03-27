import { useState, useRef, useCallback } from 'react';
import { uploadScore } from '../api';
import type { ScoreRead } from '../types';

interface UploadZoneProps {
  onUploaded: (score: ScoreRead) => void;
}

export default function UploadZone({ onUploaded }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsUploading(true);
      try {
        const score = await uploadScore(file);
        onUploaded(score);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Upload failed. Please try again.';
        setError(message);
      } finally {
        setIsUploading(false);
      }
    },
    [onUploaded]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleClick = useCallback(() => {
    if (!isUploading) {
      inputRef.current?.click();
    }
  }, [isUploading]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
        // Reset so same file can be re-uploaded
        e.target.value = '';
      }
    },
    [handleFile]
  );

  const zoneStyle: React.CSSProperties = {
    border: `2px dashed ${isDragging ? '#4a90e2' : '#aaa'}`,
    borderRadius: '12px',
    padding: '48px 32px',
    textAlign: 'center',
    cursor: isUploading ? 'not-allowed' : 'pointer',
    backgroundColor: isDragging ? '#eef4ff' : '#fafafa',
    transition: 'all 0.2s ease',
    userSelect: 'none',
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto 32px' }}>
      <div
        style={zoneStyle}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        aria-label="Upload sheet music"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.tiff,.tif,.pdf"
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎼</div>
        {isUploading ? (
          <p style={{ color: '#555', margin: 0 }}>Uploading...</p>
        ) : (
          <p style={{ color: '#555', margin: 0 }}>
            Drop sheet music here or click to upload
          </p>
        )}
        <p style={{ color: '#999', fontSize: '13px', marginTop: '8px', marginBottom: 0 }}>
          Accepted: PNG, JPG, JPEG, TIFF, PDF
        </p>
      </div>
      {error && (
        <div
          style={{
            marginTop: '12px',
            padding: '10px 14px',
            backgroundColor: '#fff0f0',
            border: '1px solid #ffcccc',
            borderRadius: '6px',
            color: '#cc0000',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
