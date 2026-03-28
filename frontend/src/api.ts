import axios from 'axios';
import type { ScoreRead, ScoreDetail } from './types';

const api = axios.create({ baseURL: '' });

export async function uploadScore(file: File, ocr: boolean = false): Promise<ScoreRead> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('ocr', String(ocr));
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

export async function renameScore(id: string, displayName: string): Promise<ScoreRead> {
  const response = await api.patch<ScoreRead>(`/api/scores/${id}`, { display_name: displayName });
  return response.data;
}

export async function deleteScore(id: string): Promise<void> {
  await api.delete(`/api/scores/${id}`);
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

export function exportUrl(id: string, fmt: string): string {
  return `/api/scores/${id}/export/${fmt}`;
}

export function svgInfoUrl(id: string): string {
  return `/api/scores/${id}/svg`;
}

export function svgPageUrl(id: string, page: number): string {
  return `/api/scores/${id}/svg/${page}`;
}

export default api;
