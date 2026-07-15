/** Device Web Speech API — same approach as jamdai.com */

let cachedVoices: SpeechSynthesisVoice[] = [];

export function loadVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  cachedVoices = window.speechSynthesis.getVoices();
}

function pickChineseVoice(): SpeechSynthesisVoice | null {
  if (!cachedVoices.length) loadVoices();
  return (
    cachedVoices.find((v) => v.lang.toLowerCase().startsWith("zh")) ?? null
  );
}

export function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;

  try {
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.85;

    const voice = pickChineseVoice();
    if (voice) utterance.voice = voice;

    synth.speak(utterance);
  } catch {
    // ignore
  }
}
