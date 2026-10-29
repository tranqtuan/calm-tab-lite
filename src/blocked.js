/** Focus Mode interstitial: shown instead of a distracting site while focusing. */
import { getSettings } from './shared/storage.js';
import { safeUrl } from './shared/util.js';

const params = new URLSearchParams(location.search);
const target = safeUrl(params.get('url'));
const domain = params.get('domain') ?? '';
const category = params.get('category') ?? '';
const mode = params.get('mode') === 'block' ? 'block' : 'warn';

const settings = await getSettings();
const theme = settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.theme;
document.documentElement.dataset.theme = theme;

const limit = params.get('reason') === 'limit';
document.getElementById('headline').textContent = limit ? 'That’s plenty for today. 🍪' : mode === 'block' ? 'Not right now.' : 'Stay with it.';
if (limit) document.getElementById('eyebrow').textContent = 'Daily limit reached';
document.getElementById('message').textContent = limit
  ? `You’ve hit today’s ${category} limit. ${domain} will be right here tomorrow — future you says thanks.`
  : mode === 'block'
  ? `${domain} (${category}) is paused while Focus Mode is on. It will be here when you’re done.`
  : `${domain} is in ${category}. Take a breath — is this what you meant to do right now?`;

const focus = await chrome.runtime.sendMessage({ type: 'focus:get' }).catch(() => null);
if (focus?.until) {
  document.getElementById('until').textContent = `Focus session ends at ${new Date(focus.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

// Going "back" would land on the distracting page again, so return to a calm New Tab instead.
document.getElementById('back').addEventListener('click', () => location.replace(chrome.runtime.getURL('newtab.html')));

const cont = document.getElementById('continue');
if (mode === 'warn' && target) {
  cont.hidden = false;
  cont.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'focus:allow', domain });
    location.replace(target);
  });
}
