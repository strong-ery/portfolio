// Background music for the footer: a YouTube player the visitor never sees or controls.
// It plays three hand-picked stretches of the song in a loop, fading out and in at each cut.

const VIDEO_ID = "PzIXNqpCug0";
const SEGMENTS = [[36, 71], [92, 128], [149, 212]];
const FADE_SECONDS = 1.6;
const MAX_VOLUME = 33;
const TICK_MS = 100;

let player = null;
let apiReady = false;
let activated = !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
let mutedFallback = false;
let fallbackTimer = 0;
let wantPlaying = false;
let declined = false;
let master = 0;          // 0..1, eased toward 1 while the footer is on screen
let segment = 0;
let seeking = true;
let started = false;
let onChange = () => {};

const clamp01 = v => Math.min(Math.max(v, 0), 1);

function loadApi() {
  return new Promise(resolve => {
    if (window.YT && window.YT.Player) return resolve();
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (previous) previous(); resolve(); };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
}

function buildPlayer() {
  const host = document.createElement("div");
  host.className = "yt-host";
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = `<div id="finale-yt"></div>`;
  document.body.appendChild(host);

  player = new window.YT.Player("finale-yt", {
    host: "https://www.youtube-nocookie.com",
    width: 200,
    height: 200,
    videoId: VIDEO_ID,
    playerVars: {
      controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, modestbranding: 1,
      start: SEGMENTS[0][0],
    },
    events: {
      onReady: () => { apiReady = true; sync(); },
      onStateChange: e => {
        const playing = e.data === window.YT.PlayerState.PLAYING;
        if (playing) {
          started = true;
          clearTimeout(fallbackTimer);
        }
        onChange(playing && master > 0.02);
        // If something outside our control pauses it while we still want sound, nudge it back.
        if (e.data === window.YT.PlayerState.PAUSED && wantPlaying && master > 0) player.playVideo();
      },
      onError: () => onChange(false),
    },
  });
}

function startSegment(index) {
  segment = index;
  seeking = true;
  player.setVolume(0);
  player.seekTo(SEGMENTS[segment][0], true);
}

function tick() {
  if (!apiReady || !player) return;

  const target = wantPlaying ? 1 : 0;
  const step = TICK_MS / 1000 / FADE_SECONDS;
  master = clamp01(master + Math.sign(target - master) * Math.min(step, Math.abs(target - master)));

  if (master === 0 && !wantPlaying) {
    if (player.getPlayerState() === window.YT.PlayerState.PLAYING) player.pauseVideo();
    return;
  }
  if (player.getPlayerState() !== window.YT.PlayerState.PLAYING) return;

  const [start, end] = SEGMENTS[segment];
  const t = player.getCurrentTime();

  if (seeking) {
    if (t >= start - 0.5 && t < start + 4) seeking = false;
    else { player.setVolume(0); return; }
  }

  if (t >= end - 0.05) {
    startSegment((segment + 1) % SEGMENTS.length);
    return;
  }

  const segmentGain = Math.min(clamp01((t - start) / FADE_SECONDS), clamp01((end - t) / FADE_SECONDS));
  player.setVolume(Math.round(MAX_VOLUME * segmentGain * master));
}

// Try to play with sound. Browsers often refuse until the visitor has interacted with the page,
// so if it hasn't started shortly after, play it muted and unmute on their first click or key press.
function sync() {
  if (!apiReady || !player || !wantPlaying) return;
  if (player.getPlayerState() === window.YT.PlayerState.PLAYING) return;

  if (!started) startSegment(0);
  if (!mutedFallback) player.unMute();
  player.playVideo();

  clearTimeout(fallbackTimer);
  fallbackTimer = setTimeout(() => {
    if (!wantPlaying || player.getPlayerState() === window.YT.PlayerState.PLAYING) return;
    mutedFallback = true;
    player.mute();
    player.playVideo();
  }, 1500);
}

function armOnFirstGesture() {
  if (activated) return;
  const arm = () => {
    activated = true;
    window.removeEventListener("pointerdown", arm, true);
    window.removeEventListener("keydown", arm, true);
    if (player && apiReady && mutedFallback) {
      mutedFallback = false;
      player.unMute();
    }
  };
  window.addEventListener("pointerdown", arm, true);
  window.addEventListener("keydown", arm, true);
}

export function initFinaleAudio(stateCallback) {
  onChange = stateCallback || onChange;
  armOnFirstGesture();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && player && apiReady) player.pauseVideo();
    else sync();
  });
}

// The YouTube player is a heavy download, so it is only fetched shortly before the footer is reached.
let preparing = false;
export function prepareFinaleAudio() {
  if (preparing || declined) return;
  preparing = true;
  loadApi().then(() => { buildPlayer(); setInterval(tick, TICK_MS); });
}

export function setFinaleAudioWanted(wanted) {
  wanted = wanted && !declined;
  if (wantPlaying === wanted) return;
  wantPlaying = wanted;
  sync();
}

// The visitor said no thanks, so the song never starts.
export function declineFinaleAudio() {
  declined = true;
  setFinaleAudioWanted(false);
}
