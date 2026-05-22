export default function RouteArc({ route, desktop }) {
  // Bail early if either endpoint lacks coords — caller renders nothing.
  if (route?.from?.lat == null || route?.from?.lng == null
      || route?.to?.lat == null || route?.to?.lng == null) {
    return null;
  }
  // We use lat/lng but normalize to a US-ish viewport
  const W = 600, H = desktop ? 280 : 220;
  // US bbox roughly: lng -125..-66, lat 25..49
  const project = (lat, lng) => {
    const x = ((lng + 125) / 59) * W;
    const y = H - ((lat - 24) / 25) * H;
    return [Math.max(20, Math.min(W - 20, x)), Math.max(20, Math.min(H - 20, y))];
  };
  const [x1, y1] = project(route.from.lat, route.from.lng);
  const [x2, y2] = project(route.to.lat, route.to.lng);

  // Curved arc — control point offset perpendicular. `dist || 1` guards
  // against same-point routes producing NaN in the perpendicular vector.
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.sqrt(dx*dx + dy*dy) || 1;
  const nx = -dy / dist, ny = dx / dist;
  const offset = -Math.min(80, dist * 0.18);
  const cx = mx + nx * offset, cy = my + ny * offset;

  return (
    <div style={{
      position: 'relative',
      borderRadius: 'var(--r-card)',
      overflow: 'hidden',
      background: 'linear-gradient(160deg, #f8fafc 0%, #eef2f7 100%)',
      border: '1px solid var(--line)',
      boxShadow: 'var(--shadow-sm)',
      aspectRatio: desktop ? '600/280' : '600/220',
    }}>
      {/* topographic dots */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.9" fill="#cbd5e1" />
          </pattern>
          <linearGradient id="arc-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
            <stop offset="50%" stopColor="var(--accent)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#dots)" opacity="0.5" />

        {/* faint US outline-ish swoosh */}
        <path
          d={`M 30 ${H - 60} Q ${W * 0.3} ${H - 200} ${W * 0.5} ${H - 100} T ${W - 30} ${H - 80}`}
          stroke="#cbd5e1"
          strokeWidth="1.2"
          strokeDasharray="3 5"
          fill="none"
          opacity="0.7"
        />

        {/* arc with draw-in animation */}
        <path
          d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
          stroke="url(#arc-grad)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          style={{
            strokeDasharray: dist * 2,
            strokeDashoffset: dist * 2,
            animation: 'drawArc 1100ms cubic-bezier(0.2, 0.8, 0.2, 1) 100ms forwards',
          }}
        />

        {/* endpoints */}
        <g>
          <circle cx={x1} cy={y1} r="14" fill="white" stroke="var(--accent)" strokeWidth="2.4" />
          <circle cx={x1} cy={y1} r="4" fill="var(--accent)" />
          <circle cx={x1} cy={y1} r="22" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.4">
            <animate attributeName="r" from="14" to="26" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.5" to="0" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </g>
        <g>
          <circle cx={x2} cy={y2} r="14" fill="var(--accent)" stroke="white" strokeWidth="3" />
          <circle cx={x2} cy={y2} r="4" fill="white" />
        </g>

        {/* labels */}
        <g style={{ animation: 'screenIn 600ms 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
          <rect x={x1 - 36} y={y1 + 18} width="72" height="22" rx="6" fill="white" stroke="var(--line)" />
          <text x={x1} y={y1 + 33} fontSize="11" fontWeight="600" fill="var(--ink)" textAnchor="middle" fontFamily="var(--font)">
            {route.from.city}
          </text>
        </g>
        <g style={{ animation: 'screenIn 600ms 900ms cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
          <rect x={x2 - 36} y={y2 - 38} width="72" height="22" rx="6" fill="var(--ink)" />
          <text x={x2} y={y2 - 23} fontSize="11" fontWeight="600" fill="white" textAnchor="middle" fontFamily="var(--font)">
            {route.to.city}
          </text>
        </g>
      </svg>
    </div>
  );
}
