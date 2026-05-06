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

export interface AmtsblattItem {
  id: string;
  title: string;
  url: string;            // direct PDF URL or listing page if PDF requires POST
  publishedAt: string;   // ISO 8601
  fetchedAt: string;     // ISO 8601
}

export interface AmtsblattFile {
  updatedAt: string;
  items: AmtsblattItem[];
}

export interface NoticeItem {
  id: string;
  title: string;
  url: string;           // PDF or HTML URL
  publishedAt: string;   // ISO 8601
  fetchedAt: string;     // ISO 8601
}

export interface NoticesFile {
  updatedAt: string;
  items: NoticeItem[];
}
