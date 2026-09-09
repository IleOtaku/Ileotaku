"use client";

import { Toggle } from "@/components/ui";
import { GENRES } from "@/lib/utils";
import { DEFAULT_FILTERS, type SearchFilters } from "./types";

export interface FilterSidebarProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}

const FORMATS: SearchFilters["format"][] = ["Vertical Scroll", "Manhua"];
const RATINGS: SearchFilters["rating"][] = ["Everyone", "Teen", "Mature"];
const STATUSES: { label: string; value: SearchFilters["status"] }[] = [
  { label: "Any", value: "" },
  { label: "Ongoing", value: "Ongoing" },
  { label: "Completed", value: "Completed" },
  { label: "Hiatus", value: "Hiatus" },
];
const SORTS: { label: string; value: SearchFilters["sort"] }[] = [
  { label: "Most Read", value: "most-read" },
  { label: "Newest", value: "newest" },
  { label: "Highest Rated", value: "highest-rated" },
  { label: "Most Bookmarked", value: "most-bookmarked" },
];

/** The full filter set: genre checkboxes, format/rating/status toggles, sort, and two on/off switches. */
export default function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  function toggleGenre(genre: string) {
    const genres = filters.genres.includes(genre)
      ? filters.genres.filter((g) => g !== genre)
      : [...filters.genres, genre];
    onChange({ ...filters, genres });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="font-syne text-sm font-semibold text-text">Filters</h3>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="font-noto text-xs text-gold hover:underline"
        >
          Clear all
        </button>
      </div>

      <div>
        <p className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
          Genres
        </p>
        <div className="grid max-h-48 grid-cols-2 gap-x-2 gap-y-1.5 overflow-y-auto pr-1">
          {GENRES.map((genre) => (
            <label
              key={genre}
              className="flex cursor-pointer items-center gap-2 font-noto text-xs text-text"
            >
              <input
                type="checkbox"
                checked={filters.genres.includes(genre)}
                onChange={() => toggleGenre(genre)}
                className="h-3.5 w-3.5 accent-clay"
              />
              {genre}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
          Format
        </p>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => onChange({ ...filters, format })}
              className={`rounded-full border px-3 py-1.5 font-noto text-xs transition-colors ${
                filters.format === format
                  ? "border-clay bg-clay text-ivory"
                  : "border-muted2 bg-bg3 text-muted"
              }`}
            >
              {format}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
          Content Rating
        </p>
        <div className="flex flex-wrap gap-2">
          {RATINGS.map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => onChange({ ...filters, rating })}
              className={`rounded-full border px-3 py-1.5 font-noto text-xs transition-colors ${
                filters.rating === rating
                  ? "border-clay bg-clay text-ivory"
                  : "border-muted2 bg-bg3 text-muted"
              }`}
            >
              {rating}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
          Status
        </p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onChange({ ...filters, status: s.value })}
              className={`rounded-full border px-3 py-1.5 font-noto text-xs transition-colors ${
                filters.status === s.value
                  ? "border-clay bg-clay text-ivory"
                  : "border-muted2 bg-bg3 text-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-syne text-xs font-semibold uppercase tracking-wide text-muted">
          Sort By
        </p>
        <select
          value={filters.sort}
          onChange={(e) => onChange({ ...filters, sort: e.target.value as SearchFilters["sort"] })}
          className="input-base text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <Toggle
        checked={filters.africanOnly}
        onChange={(checked) => onChange({ ...filters, africanOnly: checked })}
        label="African Originals only"
      />
      <Toggle
        checked={filters.freeOnly}
        onChange={(checked) => onChange({ ...filters, freeOnly: checked })}
        label="Free to read only"
      />
    </div>
  );
}
