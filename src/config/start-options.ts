/**
 * Every entry point in "New Project" with its honest status.
 * WORKING = implemented end to end. COMING_SOON = later phase. PROVIDER_REQUIRED = needs a real AI provider.
 */
export type FeatureStatus = "WORKING" | "COMING_SOON" | "PROVIDER_REQUIRED";

export interface StartOption {
  id: string;
  label: string;
  hint: string;
  status: FeatureStatus;
}

export const START_OPTIONS: StartOption[] = [
  { id: "idea", label: "ابدأ من فكرة", hint: "اكتب فكرة قصيرة ونحوّلها إلى نص ومشاهد", status: "WORKING" },
  { id: "text", label: "ابدأ من نص", hint: "الصق قصة أو درسًا أو إعلانًا ونقسّمه إلى مشاهد", status: "WORKING" },
  { id: "script", label: "ابدأ من سيناريو", hint: "سيناريو جاهز بالمشاهد والحوار", status: "COMING_SOON" },
  { id: "image", label: "ابدأ من صورة", hint: "", status: "PROVIDER_REQUIRED" },
  { id: "audio", label: "ابدأ من صوت", hint: "", status: "PROVIDER_REQUIRED" },
  { id: "video", label: "ابدأ من فيديو", hint: "", status: "COMING_SOON" },
  { id: "create-image", label: "إنشاء صورة", hint: "", status: "PROVIDER_REQUIRED" },
  { id: "animate-image", label: "تحريك صورة", hint: "", status: "PROVIDER_REQUIRED" },
  { id: "talking-character", label: "شخصية ناطقة", hint: "", status: "PROVIDER_REQUIRED" },
  { id: "reel", label: "إنشاء ريلز", hint: "", status: "COMING_SOON" },
  { id: "short", label: "إنشاء شورتس", hint: "", status: "COMING_SOON" },
  { id: "film", label: "إنشاء فيلم", hint: "", status: "COMING_SOON" },
  { id: "interactive", label: "فيديو تفاعلي", hint: "", status: "COMING_SOON" },
  { id: "conversational", label: "شخصية محاورة", hint: "", status: "PROVIDER_REQUIRED" },
  { id: "dub", label: "دبلجة فيديو", hint: "", status: "PROVIDER_REQUIRED" },
];

export const STATUS_LABEL: Record<FeatureStatus, string> = {
  WORKING: "يعمل",
  COMING_SOON: "قريبًا",
  PROVIDER_REQUIRED: "يحتاج مزوّدًا",
};
