import type { Db } from "@/db/client";
import { getProvider } from "@/providers/registry";
import { recordProviderCall } from "./cost";
import { getProject, getScript } from "./projects";
import { getPreset } from "@/config/platform-presets";

/** Hooks and calls to action for a project, written by the text provider and logged in the cost ledger. */
export async function socialCopy(db: Db, projectId: string, kind: "hook" | "cta", count = 5) {
  const project = await getProject(db, projectId);
  if (!project) throw new Error("المشروع غير موجود");
  const script = await getScript(db, projectId);
  const provider = getProvider("text");
  const { result, usage } = await provider.socialCopy({
    kind, count, language: project.language, platform: getPreset(project.platform_preset).platform,
    topic: script?.title || project.title,
  });
  await recordProviderCall(db, { workspaceId: project.workspace_id, projectId, provider: provider.info, usage });
  return { lines: result, mock: provider.info.isMock };
}
