import axios from 'axios';
import type { ScoreRead, ScoreDetail } from './types';

const api = axios.create({ baseURL: '' });

export async function uploadScore(file: File): Promise<ScoreRead> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post<ScoreRead>('/api/scores', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function listScores(): Promise<ScoreRead[]> {
  const response = await api.get<ScoreRead[]>('/api/scores');
  return response.data;
}

export async function getScore(id: string): Promise<ScoreDetail> {
  const response = await api.get<ScoreDetail>(`/api/scores/${id}`);
  return response.data;
}

export function scoreStatusUrl(id: string): string {
  return `/api/scores/${id}/status`;
}

export function musicxmlUrl(id: string): string {
  return `/api/scores/${id}/musicxml`;
}

export function pdfUrl(id: string): string {
  return `/api/scores/${id}/pdf`;
}

export function midiUrl(id: string): string {
  return `/api/scores/${id}/midi`;
}

export function partMidiUrl(id: string, partName: string): string {
  return `/api/scores/${id}/parts/${encodeURIComponent(partName)}/midi`;
}

export default api;
