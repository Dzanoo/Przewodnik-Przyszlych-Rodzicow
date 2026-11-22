import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { formatPL } from '../domain/dateUtils';

export const money = (v: number) =>
  `${v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
export const pct = (v: number) => `${(v * 100).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%`;
export const weeks = (w: number) => (Number.isInteger(w) ? `${w}` : w.toLocaleString('pl-PL', { maximumFractionDigits: 2 })) + ' tyg.';

export function Card({ title, subtitle, children, actions, className = '' }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Dymek „Podstawa prawna”. Pozycjonowany względem okna (position: fixed), więc nigdy nie wychodzi
 * poza ekran: przy prawej krawędzi przesuwa się w lewo, przy dolnej otwiera się nad przyciskiem.
 * Zamyka się po kliknięciu obok, klawiszem Escape oraz przy przewijaniu lub zmianie rozmiaru okna.
 */
export function LegalTip({ legal }: { legal: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLSpanElement | null>(null);
  const id = useId();

  const place = () => {
    const el = btn.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const margin = 16;
    const width = Math.min(300, vw - 2 * margin);
    const left = Math.max(margin, Math.min(r.left - 12, vw - width - margin));
    const spaceBelow = window.innerHeight - r.bottom;
    const above = spaceBelow < 180 && r.top > spaceBelow;
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left, width, above });
  };

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        btn.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !pop.current?.contains(t)) close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [pos]);

  return (
    <span className="legal">
      <button
        ref={btn}
        type="button"
        className="legal-btn"
        aria-expanded={pos !== null}
        aria-controls={id}
        aria-label="Podstawa prawna"
        onClick={(e) => {
          e.preventDefault(); // przycisk bywa wewnątrz <label> — nie przenoś fokusu do pola
          if (pos) setPos(null);
          else place();
        }}
      >
        §
      </button>
      {pos && (
        <span
          ref={pop}
          role="note"
          id={id}
          className={`legal-pop ${pos.above ? 'above' : ''}`}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <strong>Podstawa prawna</strong>
          {legal}
        </span>
      )}
    </span>
  );
}

export function Field({ label, hint, legal, children, error }: { label: string; hint?: string; legal?: string; children: ReactNode; error?: string | null }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <span className="field-label">
        {label}
        {legal && <LegalTip legal={legal} />}
      </span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}

const fmtNum = (v: number) => (Number.isFinite(v) ? String(v).replace('.', ',') : '');

/**
 * Pola z wartością domyślną: gdy pole jest puste, wartość domyślna jest widoczna jako placeholder
 * i to ona trafia do obliczeń. `def` — wartość domyślna (gdy brak: wartość z chwili zamontowania pola).
 */
export function NumberInput({ value, onChange, min, max, step = 1, suffix, def, placeholder }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; def?: number; placeholder?: string }) {
  const [mountValue] = useState(value);
  const fallback = def ?? mountValue;
  const [raw, setRaw] = useState<string | null>(null);
  const shown = raw ?? (value === fallback ? '' : fmtNum(value));
  return (
    <span className="input-wrap">
      <input
        inputMode="decimal"
        value={shown}
        placeholder={placeholder ?? fmtNum(fallback)}
        onChange={(ev) => {
          const text = ev.target.value;
          setRaw(text);
          if (text.trim() === '') {
            onChange(fallback);
            return;
          }
          const n = Number(text.replace(/\s/g, '').replace(',', '.'));
          if (Number.isFinite(n)) {
            let v = n;
            if (min !== undefined) v = Math.max(min, v);
            if (max !== undefined) v = Math.min(max, v);
            onChange(v);
          }
        }}
        onBlur={() => setRaw(null)}
        aria-valuemin={min}
        aria-valuemax={max}
        data-step={step}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  );
}

export function TextInput({ value, onChange, def, sanitize, inputMode, maxLength }: { value: string; onChange: (v: string) => void; def?: string; sanitize?: (v: string) => string; inputMode?: 'numeric' | 'text'; maxLength?: number }) {
  const [mountValue] = useState(value);
  const fallback = def ?? mountValue;
  const [raw, setRaw] = useState<string | null>(null);
  const shown = raw ?? (value === fallback ? '' : value);
  return (
    <input
      value={shown}
      placeholder={fallback}
      inputMode={inputMode}
      maxLength={maxLength}
      onChange={(e) => {
        const v = sanitize ? sanitize(e.target.value) : e.target.value;
        setRaw(v);
        onChange(v.trim() === '' ? fallback : v);
      }}
      onBlur={() => setRaw(null)}
    />
  );
}

/** Pole daty: puste pokazuje datę domyślną jako placeholder (dd.mm.rrrr), po kliknięciu otwiera kalendarz. */
export function DateInput({ value, onChange, def }: { value: string; onChange: (v: string) => void; def?: string }) {
  const [mountValue] = useState(value);
  const fallback = def ?? mountValue;
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState<string | null>(null);
  const isDefault = value === fallback;
  const showPlaceholder = !focused && isDefault && raw === null;
  return (
    <input
      type={showPlaceholder ? 'text' : 'date'}
      value={showPlaceholder ? '' : raw ?? (isDefault ? '' : value)}
      placeholder={fallback ? formatPL(fallback) : 'dd.mm.rrrr'}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setRaw(null);
      }}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(e.target.value || fallback);
      }}
    />
  );
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label, legal }: { checked: boolean; onChange: (v: boolean) => void; label: string; legal?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span>{label}</span>
      {legal && <LegalTip legal={legal} />}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function CopyButton({ text, label = 'Kopiuj' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setDone(true);
        window.setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? 'Skopiowano ✓' : label}
    </button>
  );
}

/** W osadzonej ramce (np. podgląd artefaktu) przeglądarka blokuje druk i pobieranie — wtedy zostaje „Kopiuj”. */
export const canExportFiles = (() => {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
})();

/**
 * Drukuje sam tekst wniosku. Treść trafia do osobnego kontenera poza aplikacją (#print-root),
 * a w trybie druku cała aplikacja ma display:none — dzięki temu PDF ma tylko strony z tekstem.
 */
export function printText(text: string, title: string) {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  root.innerHTML = '';
  const pre = document.createElement('pre');
  pre.textContent = text;
  root.appendChild(pre);
  const prevTitle = document.title;
  document.title = title; // nazwa pliku PDF proponowana przez przeglądarkę
  const cleanup = () => {
    document.title = prevTitle;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

export function downloadText(filename: string, text: string, mime = 'text/markdown') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Ikony (lekki odpowiednik Lucide — inline SVG, bez zależności). */
export function Icon({ name, size = 18 }: { name: 'user' | 'calc' | 'calendar' | 'file' | 'alert' | 'check' | 'baby' | 'print' | 'download' | 'info' | 'arrow' | 'heart'; size?: number }) {
  const paths: Record<string, ReactNode> = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
    calc: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
    alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h0" /></>,
    check: <path d="m5 12 5 5 9-10" />,
    baby: <><circle cx="12" cy="9" r="5" /><path d="M10 9h0M14 9h0M10.5 11.5c.8.6 2.2.6 3 0M7 21c0-3 2-5 5-5s5 2 5 5" /></>,
    print: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h0" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
