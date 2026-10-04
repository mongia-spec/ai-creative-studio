import { PLATFORM_PRESETS, STYLES } from "@/config/platform-presets";
import { START_OPTIONS } from "@/config/start-options";
import NewProjectForm from "./NewProjectForm";

export default function NewProjectPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">مشروع جديد</h1>
      <NewProjectForm options={START_OPTIONS} presets={PLATFORM_PRESETS} styles={[...STYLES]} />
    </div>
  );
}
