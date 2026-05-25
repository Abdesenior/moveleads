import { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { US_STATES } from '../data/usStates';

/**
 * Multi-state picker with chip display + searchable dropdown.
 *
 * Used in Settings → Service Area for the "Where do you pick up?" and
 * "Where do you deliver?" lists. Pure presentational component — caller
 * owns the array state and persistence.
 *
 * @param {string[]} value          Array of 2-letter state codes (uppercase)
 * @param {(next: string[]) => void} onChange  Receives the new array on add/remove
 * @param {boolean} [disabled]      Disables add/remove affordances
 * @param {string}  [emptyHint]     Text shown when value is empty
 */
export default function StatePicker({ value, onChange, disabled = false, emptyHint }) {
  const codes = Array.isArray(value) ? value : [];
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) {
      setQuery('');
      setActiveIdx(0);
      return;
    }
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const add = (code) => {
    if (!code || codes.includes(code) || disabled) return;
    onChange([...codes, code]);
    setMenuOpen(false);
    setQuery('');
  };

  const remove = (code) => {
    if (disabled) return;
    onChange(codes.filter(c => c !== code));
  };

  const q = query.trim().toLowerCase();
  const available = US_STATES.filter(s => !codes.includes(s.code));
  const filtered = (q
    ? available.filter(s =>
        s.name.toLowerCase().includes(q) || s.code.toLowerCase().startsWith(q)
      )
    : available
  ).sort((a, b) => {
    if (!q) return a.name.localeCompare(b.name);
    const aPref = a.name.toLowerCase().startsWith(q) || a.code.toLowerCase().startsWith(q) ? 0 : 1;
    const bPref = b.name.toLowerCase().startsWith(q) || b.code.toLowerCase().startsWith(q) ? 0 : 1;
    if (aPref !== bPref) return aPref - bPref;
    return a.name.localeCompare(b.name);
  }).slice(0, 5);

  const handleKey = (e) => {
    if (e.key === 'ArrowDown')      { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[activeIdx] || filtered[0];
      if (pick) add(pick.code);
    } else if (e.key === 'Escape') {
      setMenuOpen(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {codes.length === 0 && (
        <span style={{ fontSize: 13, color: '#94a3b8' }}>{emptyHint || 'No states selected.'}</span>
      )}
      {codes.map(code => {
        const rec = US_STATES.find(s => s.code === code);
        const label = rec ? `${rec.name} (${rec.code})` : code;
        return (
          <span
            key={code}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa',
              borderRadius: 9999, padding: '6px 8px 6px 14px',
              fontSize: 13, fontWeight: 700, opacity: disabled ? 0.5 : 1,
            }}
          >
            {label}
            <button
              type="button"
              aria-label={`Remove ${rec?.name || code}`}
              onClick={() => remove(code)}
              disabled={disabled}
              style={{
                background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
                color: '#fb923c', padding: 0, lineHeight: 1, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 9999,
              }}
            >
              <X size={14} />
            </button>
          </span>
        );
      })}

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => !disabled && setMenuOpen(o => !o)}
          disabled={disabled}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: disabled ? '#cbd5e1' : '#ea580c', border: 'none', borderRadius: 9999,
            padding: '8px 14px', minHeight: 32,
            fontSize: 13, fontWeight: 700, color: '#fff',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: disabled ? 'none' : '0 2px 6px rgba(234,88,12,0.25)',
          }}
        >
          <Plus size={13} /> Add state
        </button>
        {menuOpen && !disabled && (
          <div
            role="combobox"
            aria-expanded="true"
            style={{
              position: 'absolute', zIndex: 20, top: 'calc(100% + 8px)', left: 0,
              width: 280, background: '#fff',
              border: '1px solid #e2e8f0', borderRadius: 14,
              boxShadow: '0 12px 32px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)',
              overflow: 'hidden',
              animation: 'stateDropdownIn 0.15s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
                onKeyDown={handleKey}
                placeholder="Search states..."
                aria-label="Search states"
                aria-autocomplete="list"
                style={{
                  width: '100%', border: 'none', outline: 'none',
                  padding: '6px 8px', fontSize: 14, fontFamily: 'inherit',
                  color: '#0f172a', background: 'transparent',
                }}
              />
            </div>
            {filtered.length > 0 ? (
              <div role="listbox" style={{ maxHeight: 220, overflowY: 'auto', padding: 4 }}>
                {filtered.map((s, i) => (
                  <button
                    key={s.code}
                    role="option"
                    aria-selected={i === activeIdx}
                    type="button"
                    onClick={() => add(s.code)}
                    onMouseEnter={() => setActiveIdx(i)}
                    style={{
                      display: 'flex', alignItems: 'center',
                      width: '100%', height: 44,
                      padding: '0 12px', borderRadius: 8, border: 'none',
                      background: i === activeIdx ? '#fff7ed' : '#fff',
                      fontSize: 14, color: '#0f172a', cursor: 'pointer',
                      fontFamily: 'inherit', textAlign: 'left',
                      transition: 'background 0.12s',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                    <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 13, fontWeight: 500 }}>({s.code})</span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px 14px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
                {available.length === 0 ? 'All states added.' : 'No matches.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
