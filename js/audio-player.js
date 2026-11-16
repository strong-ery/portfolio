const wired = new WeakSet();

function wireAudio(audio, card) {
  if (wired.has(audio)) return;
  wired.add(audio);

  audio.addEventListener("timeupdate", () => {
    const pct = (audio.currentTime / audio.duration) * 100 || 0;
    const bar = card.querySelector(".audio-progress-bar");
    const time = card.querySelector(".audio-time");
    if (bar) bar.style.width = pct + "%";
    if (time) {
      const m = Math.floor(audio.currentTime / 60);
      const s = Math.floor(audio.currentTime % 60).toString().padStart(2, "0");
      time.textContent = `${m}:${s}`;
    }
  });

  audio.addEventListener("ended", () => {
    const btn = card.querySelector(".audio-btn");
    if (btn) btn.textContent = "▶";
  });
}

export function initAudioPlayers() {
  document.addEventListener("click", e => {
    const card = e.target.closest(".audio-card");
    if (!card) return;
    const audio = card.querySelector("audio");
    if (!audio) return;
    wireAudio(audio, card);

    const btn = e.target.closest(".audio-btn");
    if (btn) {
      if (audio.paused) {
        audio.play();
        btn.textContent = "▐▐";
      } else {
        audio.pause();
        btn.textContent = "▶";
      }
      return;
    }

    const seekWrap = e.target.closest(".audio-progress-wrap");
    if (seekWrap && audio.duration) {
      const rect = seekWrap.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    }
  });
}
