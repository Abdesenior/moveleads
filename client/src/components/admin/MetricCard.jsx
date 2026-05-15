/**
 * MetricCard — small reusable card for the analytics dashboards.
 *
 * Variants:
 *   tone="default" | "success" | "warning" | "danger" | "info"
 *
 * Optional `delta` shows a trend arrow + number (e.g. "+12 vs prev period").
 */

const TONE = {
  default: { bg: '#f8fafc', border: '#e2e8f0', label: '#64748b', value: '#0f172a' },
  success: { bg: '#ecfdf5', border: '#a7f3d0', label: '#047857', value: '#0f172a' },
  warning: { bg: '#fffbeb', border: '#fde68a', label: '#b45309', value: '#0f172a' },
  danger:  { bg: '#fef2f2', border: '#fecaca', label: '#b91c1c', value: '#0f172a' },
  info:    { bg: '#eff6ff', border: '#bfdbfe', label: '#1e40af', value: '#0f172a' },
};

export default function MetricCard({ label, value, sub, tone = 'default', icon, deltaLabel }) {
  const t = TONE[tone] || TONE.default;
  return (
    <div style={{
      padding: 16, borderRadius: 14, background: t.bg, border: `1px solid ${t.border}`,
      display: 'flex', flexDirection: 'column', gap: 4, minHeight: 96,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon && <span style={{ color: t.label, display: 'inline-flex' }}>{icon}</span>}
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: t.label, textTransform: 'uppercase' }}>{label}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: t.value, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value ?? '—'}
      </div>
      {sub && <div style={{ fontSize: 11, color: t.label, marginTop: 2 }}>{sub}</div>}
      {deltaLabel && <div style={{ fontSize: 10, color: t.label, marginTop: 4, fontWeight: 600 }}>{deltaLabel}</div>}
    </div>
  );
}
