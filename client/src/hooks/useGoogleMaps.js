import { useState, useEffect } from 'react';

const SCRIPT_ID = 'google-maps-script';
let loadState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
const listeners = new Set();

function notify() {
  listeners.forEach(fn => fn(loadState));
}

/**
 * Lazily loads the Google Maps JS API (places library) once per page.
 * Multiple components calling this hook share the same load state.
 *
 * @returns {{ ready: boolean, error: boolean }}
 */
export function useGoogleMaps() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [state, setState] = useState(loadState);

  useEffect(() => {
    const update = (s) => setState(s);
    listeners.add(update);
    return () => listeners.delete(update);
  }, []);

  useEffect(() => {
    if (!apiKey) {
      loadState = 'error';
      notify();
      return;
    }

    // Already loaded or loading
    if (loadState !== 'idle') return;

    // Check if the API is already available (e.g. hot reload)
    if (window.google?.maps?.places) {
      loadState = 'ready';
      notify();
      return;
    }

    loadState = 'loading';
    notify();

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      loadState = 'ready';
      notify();
    };
    script.onerror = () => {
      loadState = 'error';
      notify();
    };

    document.head.appendChild(script);
  }, [apiKey]);

  return { ready: state === 'ready', error: state === 'error' };
}
