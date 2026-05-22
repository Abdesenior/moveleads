import { forwardRef } from 'react';
import Icon from './Icon';

const FieldInput = forwardRef(function FieldInput(
  { icon, label, value, onChange, placeholder, type = 'text', uppercase = false, maxLength, suffix, autoFocus, inputMode, autoComplete, ariaInvalid },
  ref
) {
  return (
    <label style={{ display: 'block', width: '100%' }}>
      {label && (
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--ink-2)',
          marginBottom: 8, letterSpacing: '-0.005em',
          height: 16, lineHeight: '16px',
        }}>{label}</div>
      )}
      <div className="focusring" style={{
        height: 54, width: '100%',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px',
        background: 'var(--surface)',
        border: '1.5px solid var(--line-strong)',
        borderRadius: 'var(--r-input)',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        boxSizing: 'border-box',
      }}>
        {icon && <Icon name={icon} size={18} color="var(--ink-3)" />}
        <input
          ref={ref}
          type={type}
          value={value || ''}
          onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus={autoFocus}
          inputMode={inputMode}
          autoComplete={autoComplete}
          aria-invalid={ariaInvalid}
          style={{
            flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
            padding: 0,
            fontSize: 16, fontWeight: 500, color: 'var(--ink)',
            letterSpacing: uppercase ? '0.02em' : '-0.005em',
            fontFamily: 'inherit',
          }}
        />
        {suffix && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{suffix}</span>}
        {value && value.length > 0 && !suffix && (
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'var(--good-soft)', color: 'var(--good)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="check" size={13} stroke={2.8} />
          </div>
        )}
      </div>
    </label>
  );
});

export default FieldInput;
