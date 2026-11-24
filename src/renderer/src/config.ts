// Renderer tuning knobs in one place.
export const ui = {
  toastMs: 4200,
  railWidth: 220,
  railCollapsedWidth: 56,
  barCollapsedHeight: 32,
  barExpandedHeight: 240,
  searchResultLimit: 8,
  /** Home "Continue Watching" is a single 4-across row. */
  continueWatchingCount: 4,
  /** Library home "Recent games" shelf length. */
  recentShelfCount: 5,
  /** Episodes past this fraction count as watched. */
  watchedFraction: 0.95
} as const
