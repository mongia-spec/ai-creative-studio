/** Continuity fields tracked per character across scenes (client-safe config). */
export const STATE_FIELDS = [
  ["wardrobe", "الملابس"],
  ["props", "ما يحمله"],
  ["appearance", "تغيّر في المظهر"],
] as const;
export type StateKey = (typeof STATE_FIELDS)[number][0];
