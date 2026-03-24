(function() {
  const scriptTag = document.currentScript;
  const targetId = 'moveleads-widget';
  const target = document.getElementById(targetId);

  if (!target) {
    console.error(`[MoveLeads] Target element #${targetId} not found.`);
    return;
  }

  const companyId = target.getAttribute('data-company') || '';
  const baseUrl = 'https://moveleads.cloud'; // In production, this would be your real domain
  const embedUrl = `${baseUrl}/embed/widget/${companyId}`;

  const iframe = document.createElement('iframe');
  iframe.src = embedUrl;
  iframe.style.width = '100%';
  iframe.style.height = '720px'; // Set a default height that accommodates the widget
  iframe.style.border = 'none';
  iframe.style.overflow = 'hidden';
  iframe.style.background = 'transparent';
  iframe.style.borderRadius = '20px';
  iframe.style.boxShadow = '0 10px 40px rgba(0,0,0,0.1)';
  iframe.setAttribute('scrolling', 'no');
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allowTransparency', 'true');

  target.appendChild(iframe);

  // Optional: Auto-resize iframe based on content if needed (requires postMessage)
  window.addEventListener('message', (event) => {
    if (event.origin !== baseUrl) return;
    if (event.data.type === 'resize' && event.data.height) {
      iframe.style.height = event.data.height + 'px';
    }
  }, false);
})();
