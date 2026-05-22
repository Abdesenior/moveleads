export default function ScreenWrap({ children, gap = 18, pad = '20px 18px 28px' }) {
  return (
    <div className="screen-enter" style={{ padding: pad, display: 'flex', flexDirection: 'column', gap }}>
      {children}
    </div>
  );
}
