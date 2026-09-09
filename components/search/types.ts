export interface SearchResultItem {
  id: string;
  title: string;
  image: string;
  author: string;
  genres: string[];
  status: string;
  rating: number;
  chapters: number;
  views: string;
}

export interface SearchFilters {
  genres: string[];
  format: "Vertical Scroll" | "Manhua";
  rating: "Everyone" | "Teen" | "Mature";
  status: "" | "Ongoing" | "Completed" | "Hiatus";
  sort: "most-read" | "newest" | "highest-rated" | "most-bookmarked";
  africanOnly: boolean;
  freeOnly: boolean;
}

export const DEFAULT_FILTERS: SearchFilters = {
  genres: [],
  format: "Vertical Scroll",
  rating: "Everyone",
  status: "",
  sort: "most-read",
  africanOnly: false,
  freeOnly: false,
};
