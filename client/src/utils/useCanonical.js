import { useEffect } from 'react';

export default function useCanonical(path) {
  useEffect(() => {
    const url = `https://moveleads.cloud${path}`;
    let tag = document.querySelector('link[rel="canonical"]');
    if (!tag) {
      tag = document.createElement('link');
      tag.setAttribute('rel', 'canonical');
      document.head.appendChild(tag);
    }
    tag.setAttribute('href', url);
    return () => { tag.setAttribute('href', 'https://moveleads.cloud/'); };
  }, [path]);
}
