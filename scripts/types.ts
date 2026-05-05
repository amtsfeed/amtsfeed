export interface Event {
  id: string;
  title: string;
  description?: string;
  url: string;
  startDate: string; // ISO 8601
  endDate?: string;  // ISO 8601
  location?: string;
  fetchedAt: string; // ISO 8601 — when first seen; stable across re-runs
  updatedAt: string; // ISO 8601
}

export interface NewsItem {
  id: string;
  title: string;
  description?: string;
  url: string;
  publishedAt?: string; // ISO 8601 — real date if known; absent when unavailable
  fetchedAt: string;    // ISO 8601 — when first seen; fallback for RSS pubDate
  updatedAt: string;    // ISO 8601
}

export interface EventsFile {
  updatedAt: string;
  items: Event[];
}

export interface NewsFile {
  updatedAt: string;
  items: NewsItem[];
}
