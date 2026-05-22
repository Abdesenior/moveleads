import Icon from './Icon';
import Spinner from './Spinner';

export default function PrimaryButton({ children, onClick, disabled, full = true, icon = 'arrow', loading = false, size = 'lg' }) {
  const h = size === 'lg' ? 56 : 48;
  const baseGradient = 'linear-gradient(180deg, #fb923c 0%, #f97316 50%, #ea6c0a 100%)';
  const hoverGradient = 'linear-gradient(180deg, #fca15a 0%, #fb8c2a 50%, #d65d05 100%)';
  return (
    <button
      onClick={disabled || loading ? undefined : onClick}
      className="nostroke ml-cta"
      style={{
        width: full ? '100%' : 'auto',
        height: h,
        padding: full ? 0 : '0 22px',
        borderRadius: 14,
        background: disabled ? '#e2e8f0' : baseGradient,
        color: disabled ? '#94a3b8' : 'white',
        fontWeight: 700,
        fontSize: size === 'lg' ? 16 : 15,
        letterSpacing: '-0.01em',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: disabled
          ? 'none'
          : '0 14px 32px -10px rgba(249,115,22,0.55), 0 4px 12px -2px rgba(249,115,22,0.18), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(180,60,0,0.18)',
        transition: 'transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 200ms ease, background 200ms ease',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        border: 'none',
      }}
      onMouseEnter={e => {
        if (disabled || loading) return;
        e.currentTarget.style.background = hoverGradient;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        if (disabled || loading) return;
        e.currentTarget.style.background = baseGradient;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {loading ? <Spinner /> : (
        <>
          <span>{children}</span>
          {icon && <Icon name={icon} size={17} stroke={2.4} />}
        </>
      )}
    </button>
  );
}
