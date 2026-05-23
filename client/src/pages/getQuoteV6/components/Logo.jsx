export function LogoMark({ size = 30 }) {
  return (
    <img
      src="/movesmart-logo.webp"
      alt="MoveSmart"
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
    />
  );
}

// Logo renders the icon only — no wordmark. The `light` and `withMark`
// props are accepted for back-compat but only `size` affects rendering.
export default function Logo({ size = 24 }) {
  return <LogoMark size={Math.round(size * 1.45)} />;
}
