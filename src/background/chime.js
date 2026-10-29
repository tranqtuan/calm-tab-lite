/**
 * Soft chime for the end of a Pomodoro session, synthesised in the offscreen document
 * (service workers can't play audio). Chrome closes the document itself once it's silent,
 * so ambient sound playing there is never cut off.
 */
import { toOffscreen } from './offscreen.js';

export async function playChime() {
  await toOffscreen({ type: 'chime' });
}
