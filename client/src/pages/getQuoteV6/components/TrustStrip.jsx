import { Fragment } from 'react';
import Icon from './Icon';

export default function TrustStrip({ vertical = false }) {
  const items = [
    { icon: 'lock',   t: 'Secure submission' },
    { icon: 'shield', t: 'Licensed movers only' },
    { icon: 'check',  t: 'No obligation' },
  ];
  return (
    <div style={{
      display: 'flex', gap: vertical ? 8 : 14, flexDirection: vertical ? 'column' : 'row',
      alignItems: vertical ? 'flex-start' : 'center', justifyContent: 'center',
      fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 500, flexWrap: 'wrap',
    }}>
      {items.map((it, i) => (
        <Fragment key={it.t}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name={it.icon} size={13} color="var(--ink-3)" stroke={1.9} />
            {it.t}
          </span>
          {!vertical && i < items.length - 1 && (
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--line-strong)' }} />
          )}
        </Fragment>
      ))}
    </div>
  );
}
