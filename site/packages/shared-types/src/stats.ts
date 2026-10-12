// Stats types — the listening history the backend stores

export interface TrackEvent {
  artist: string;
  title: string;
  timestamp: number;
}

export interface StatsState {
  events: TrackEvent[];
  totalListeningTimeSec: number;
  lastActiveDay: string | null;
  dailyStreak: number;
}
