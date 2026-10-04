import { STATUS_LABEL, type FeatureStatus } from "@/config/start-options";

export function FeatureBadge({ status }: { status: FeatureStatus }) {
  const cls =
    status === "WORKING" ? "bg-secondary text-white" : status === "MOCK" ? "bg-primary/15 text-primary" : status === "COMING_SOON" ? "bg-surface-2 text-muted" : "bg-warn/15 text-warn";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{STATUS_LABEL[status]}</span>;
}

/** A button for a feature that is not implemented: always disabled and labelled honestly. */
export function UnavailableButton({ label, status }: { label: string; status: Exclude<FeatureStatus, "WORKING" | "MOCK"> }) {
  return (
    <button className="btn w-full justify-between" disabled title={STATUS_LABEL[status]}>
      <span>{label}</span>
      <FeatureBadge status={status} />
    </button>
  );
}

const PROJECT_STATUS: Record<string, string> = {
  draft: "مسودة",
  script_ready: "النص جاهز",
  storyboard_ready: "لوحة القصة قيد المراجعة",
  approved: "معتمد",
  archived: "مؤرشف",
};
export function ProjectStatus({ status }: { status: string }) {
  return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{PROJECT_STATUS[status] ?? status}</span>;
}
