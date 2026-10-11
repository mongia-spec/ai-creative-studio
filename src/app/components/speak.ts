/**
 * Read Arabic text aloud with the device's own voice (Web Speech API): free and offline-capable,
 * but it is the phone/computer voice, not the character's saved voice. Returns false when the
 * device has no Arabic voice or no speech support.
 */
export function speakAr(text: string, onEnd?: () => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("ar"));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? "ar-SA";
  if (voice) u.voice = voice;
  u.rate = 0.95;
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
  synth.cancel();
  synth.speak(u);
  return true;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
