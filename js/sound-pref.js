// Remembers the answer to "sound on?" so it only ever has to be asked once.
// Browsers still won't let a page make noise before the visitor has touched it, so a returning
// visitor who said yes gets sound from their first click or key press, with no prompt.
const KEY = "dylan-sound";

export function getSoundPref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

export function setSoundPref(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // private mode or blocked storage: it just asks again next time
  }
}
