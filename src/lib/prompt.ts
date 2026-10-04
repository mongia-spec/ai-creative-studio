import type { SceneCast } from "./scene-memory";
import { STATE_FIELDS } from "./scene-memory";

/**
 * Builds the final image prompt for a scene: the scene's own visual prompt plus each
 * character's fixed identity (reference pack) and its current continuity state.
 * This text is what a real image provider will receive, so consistency is enforced here.
 */
export function composeScenePrompt(scene: { visual_prompt: string; description: string; title: string; time_of_day: string; location: string }, cast: SceneCast[]): string {
  const lines = [scene.visual_prompt || scene.description || scene.title];
  if (scene.location) lines.push(`المكان: ${scene.location}`);
  if (scene.time_of_day) lines.push(`الوقت: ${scene.time_of_day}`);
  for (const c of cast) {
    const state = STATE_FIELDS.map(([k, label]) => (c.effective[k] ? `${label}: ${c.effective[k]!.value}` : "")).filter(Boolean);
    lines.push(`الشخصية ${c.descriptor}${state.length ? ` — ${state.join("، ")}` : ""}`);
  }
  return lines.join("\n");
}
