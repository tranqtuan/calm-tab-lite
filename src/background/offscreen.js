/**
 * The offscreen document (offscreen.html) plays all sound, because service workers can't.
 * One document at a time; Chrome closes it by itself after ~30 s of silence, and the next
 * command simply creates it again.
 */
const OFFSCREEN_URL = 'offscreen.html';
let creating = null;

export async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  creating ??= chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play ambient sound and the Pomodoro chime.',
  }).finally(() => { creating = null; });
  await creating;
}

/** Send a message to the offscreen document (creating it first) and return its reply. */
export async function toOffscreen(msg) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', ...msg });
}
