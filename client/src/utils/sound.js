/**
 * Plays a soft two-tone chime using the Web Audio API.
 * No external file required — works offline and avoids CDN dependency.
 * Respects the user's 'soundEnabled' preference stored in localStorage.
 */
export function playNewLeadSound() {
  if (localStorage.getItem('soundEnabled') === 'false') return;

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const play = (freq, startAt, duration) => {
      const osc   = ctx.createOscillator();
      const gain  = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type      = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);

      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.25, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

      osc.start(startAt);
      osc.stop(startAt + duration);
    };

    const now = ctx.currentTime;
    play(880, now,        0.18); // A5 — first note
    play(1320, now + 0.12, 0.24); // E6 — second note (ascending chime)

    // Close context after sound finishes to release resources
    setTimeout(() => ctx.close(), 600);
  } catch (err) {
    console.error('[Sound] Failed to play:', err);
  }
}
