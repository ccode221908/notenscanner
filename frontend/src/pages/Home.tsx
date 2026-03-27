import { useState, useEffect, useCallback } from 'react';
import { listScores } from '../api';
import type { ScoreRead } from '../types';
import UploadZone from '../components/UploadZone';
import ScoreList from '../components/ScoreList';

export default function Home() {
  const [scores, setScores] = useState<ScoreRead[]>([]);

  const fetchScores = useCallback(() => {
    listScores()
      .then(setScores)
      .catch((err) => console.error('Failed to fetch scores:', err));
  }, []);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  const handleUploaded = useCallback((score: ScoreRead) => {
    setScores((prev) => [score, ...prev]);
  }, []);

  return (
    <div style={{ padding: '32px 16px', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '32px' }}>Sheet Music Web</h1>
      <UploadZone onUploaded={handleUploaded} />
      <ScoreList scores={scores} onRefresh={fetchScores} />
    </div>
  );
}
