/**
 * Commercial plans (configuration only). Payments are NOT active: no gateway is connected and no
 * price is charged. Prices are left undecided on purpose until the owner sets them.
 */
export interface Plan {
  id: "free" | "creator" | "studio";
  label: string;
  monthlyCredits: number;
  maxProjects: number | null;
  maxCharacters: number | null;
  maxExportSec: number;
  watermark: boolean;
  commercialUse: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  { id: "free", label: "مجانية", monthlyCredits: 100, maxProjects: 5, maxCharacters: 3, maxExportSec: 120, watermark: true, commercialUse: false,
    features: ["المزوّدات التجريبية", "تصدير مسودة حتى دقيقتين", "علامة مائية"] },
  { id: "creator", label: "صانع محتوى", monthlyCredits: 2000, maxProjects: 50, maxCharacters: 20, maxExportSec: 900, watermark: false, commercialUse: true,
    features: ["مزوّدات حقيقية عند تفعيلها", "تصدير حتى 15 دقيقة", "استخدام تجاري"] },
  { id: "studio", label: "استوديو", monthlyCredits: 10000, maxProjects: null, maxCharacters: null, maxExportSec: 3600, watermark: false, commercialUse: true,
    features: ["كل شيء في صانع محتوى", "أفلام حتى ساعة", "أعضاء فريق"] },
];

export function getPlan(id: string): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

/** Credits charged per US dollar of provider cost (applies only once a paid provider is active). */
export const CREDITS_PER_USD = 100;
