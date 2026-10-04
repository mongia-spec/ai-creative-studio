/** Character profile fields (client-safe config). */
export const ATTRIBUTE_FIELDS = [
  ["ageRange", "العمر"],
  ["face", "ملامح الوجه"],
  ["skinTone", "لون البشرة"],
  ["hair", "الشعر أو الحجاب"],
  ["glasses", "النظارة"],
  ["body", "بنية الجسم والنسب"],
  ["clothing", "الملابس الأساسية"],
  ["accessories", "الإكسسوارات"],
  ["distinctive", "سمات مميزة"],
  ["visualStyle", "الأسلوب البصري"],
  ["personality", "الشخصية والسلوك"],
  ["speakingStyle", "أسلوب الكلام"],
] as const;
export type AttributeKey = (typeof ATTRIBUTE_FIELDS)[number][0];

/** Attributes that define how the character looks; all go into every image prompt. */
export const VISUAL_KEYS: AttributeKey[] = ["ageRange", "face", "skinTone", "hair", "glasses", "body", "clothing", "accessories", "distinctive", "visualStyle"];

export const REFERENCE_ROLES = [
  ["primary", "الصورة الرئيسية"],
  ["face", "الوجه"],
  ["outfit", "الملابس"],
  ["pose", "وضعية/زاوية"],
  ["reference", "مرجع آخر"],
] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number][0];

/** Arabic varieties a character can be set to speak. Whether a provider supports one is checked separately. */
export const DIALECTS = [
  ["fusha", "الفصحى"],
  ["omani", "العُمانية"],
  ["gulf", "الخليجية"],
  ["tunisian", "التونسية"],
  ["egyptian", "المصرية"],
  ["levantine", "الشامية"],
  ["moroccan", "المغربية"],
  ["iraqi", "العراقية"],
] as const;
export const VOICE_LANGUAGES = [["ar", "العربية"], ["en", "English"]] as const;
