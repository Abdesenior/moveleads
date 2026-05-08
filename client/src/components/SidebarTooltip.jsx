import { useState, useRef, useEffect, cloneElement, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * Lightweight hover tooltip used by the collapsed sidebar. Renders into
 * document.body via a portal so it escapes the sidebar's overflow:hidden
 * and the dashboard-shell's overflow:hidden.
 *
 * Pass a single React child (e.g. a NavLink, button, or div). The child
 * receives ref + hover/focus handlers via cloneElement — no extra wrapper
 * DOM, so existing flex/spacing rules keep working.
 *
 * Tooltip only renders when `enabled` is true. The sidebar passes
 * enabled={collapsed} so the expanded sidebar (which already shows labels
 * inline) doesn't get duplicate tooltips.
 */
export default function SidebarTooltip({ label, enabled, children }) {
  const triggerRef = useRef(null);
  const [pos, setPos] = useState(null);

  const measure = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.top + r.height / 2, left: r.right + 10 });
  }, []);

  const show = useCallback(() => {
    if (!enabled || !label) return;
    measure();
  }, [enabled, label, measure]);

  const hide = useCallback(() => setPos(null), []);

  // Hide on scroll/resize so a stale tooltip doesn't drift away from its trigger.
  useEffect(() => {
    if (!pos) return;
    const onMove = () => setPos(null);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [pos]);

  // Re-measure if the trigger moves while still hovered (rare but cheap).
  useEffect(() => {
    if (!pos) return;
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [pos, measure]);

  // Compose handlers so the child's existing onMouseEnter/Leave/Focus/Blur still fire.
  const childProps = children.props;
  const merged = {
    ref: (node) => {
      triggerRef.current = node;
      const cr = children.ref;
      if (typeof cr === 'function') cr(node);
      else if (cr) cr.current = node;
    },
    onMouseEnter: (e) => { show(); childProps.onMouseEnter && childProps.onMouseEnter(e); },
    onMouseLeave: (e) => { hide(); childProps.onMouseLeave && childProps.onMouseLeave(e); },
    onFocus:      (e) => { show(); childProps.onFocus      && childProps.onFocus(e); },
    onBlur:       (e) => { hide(); childProps.onBlur       && childProps.onBlur(e); },
  };

  return (
    <>
      {cloneElement(children, merged)}
      {pos && enabled && createPortal(
        <div
          className="sidebar-tooltip"
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
        >
          {label}
        </div>,
        document.body
      )}
    </>
  );
}
