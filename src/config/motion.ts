/** Local camera motion applied at export (FFmpeg), free. Real image-to-video needs a provider. */
export const MOTIONS = [
  ["none", "ثابتة"],
  ["zoom_in", "تقريب بطيء"],
  ["zoom_out", "إبعاد بطيء"],
  ["pan_left", "تحريك أفقي"],
  ["pan_right", "تحريك أفقي معاكس"],
] as const;
export type Motion = (typeof MOTIONS)[number][0];
