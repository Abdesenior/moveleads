/**
 * Plays a soft two-tone chime using the Web Audio API.
 * No external file required — works offline and avoids CDN dependency.
 * Respects the user's 'soundEnabled' preference stored in localStorage.
 *
 * Browsers auto-suspend AudioContext when created outside a user gesture.
 * We call ctx.resume() first, then schedule notes once the context is running.
 */
export function playNewLeadSound() {
  if (localStorage.getItem('soundEnabled') === 'false') return;

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const scheduleNotes = () => {
      const play = (freq, startAt, duration) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startAt);

        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(0.25, startAt + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);

        osc.start(startAt);
        osc.stop(startAt + duration);
      };

      const now = ctx.currentTime;
      play(880,  now,        0.18); // A5 — first note
      play(1320, now + 0.12, 0.24); // E6 — second note (ascending chime)

      setTimeout(() => ctx.close(), 600);
      console.log('[Sound] Chime played (ctx state:', ctx.state, ')');
    };

    if (ctx.state === 'suspended') {
      // Resume first — required when AudioContext was created outside a user gesture
      ctx.resume().then(scheduleNotes).catch(err => {
        console.warn('[Sound] ctx.resume() failed:', err);
      });
    } else {
      scheduleNotes();
    }
  } catch (err) {
    console.error('[Sound] Failed to play:', err);
  }
}
