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
  /** Games catalog spotlight: how many featured games, and how often it rotates. */
  spotlightCount: 5,
  spotlightRotateMs: 8000,
  /** Episodes past this fraction count as watched. */
  watchedFraction: 0.95
} as const
