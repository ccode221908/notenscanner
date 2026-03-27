export interface ScoreRead {
  id: string;
  filename: string;
  original_filename: string;
  status: string; // pending | processing | omr_done | omr_failed | ready | failed
  created_at: string;
  updated_at: string;
  error_message: string | null;
}

export interface PartRead {
  id: string;
  name: string;
  midi_filename: string;
}

export interface ScoreDetail extends ScoreRead {
  parts: PartRead[];
}
