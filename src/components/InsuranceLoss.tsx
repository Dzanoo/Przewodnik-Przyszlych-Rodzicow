import { useMemo, useState } from 'react';
import { insuranceLoss } from '../domain/benefitCalculator';
import { MIN_WAGE_2026 } from '../domain/constants2026';
import { useProfile, useSection } from '../state/ProfileContext';
import { Card, Field, LegalTip, NumberInput, money } from './ui';

/** Kolory zweryfikowane skryptem validate_palette (CVD, kontrast). */
const C = { insured: '#14876A', uninsured: '#C98318' } as const;
const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const monthLabel = (ym: string) => `${MONTHS_PL[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

export function useInsuranceLoss() {
  const { profile, today } = useProfile();
  return useMemo(() => insuranceLoss(profile, today, profile.plan.hypotheticalSalary), [profile, today]);
}

/** Wersja skrócona — do kreatora (krok 1). */
export function InsuranceLossSummary({ onShowDetails }: { onShowDetails?: () => void }) {
  const loss = useInsuranceLoss();
  const max = Math.max(loss.insuredTotal, loss.uninsuredTotal, 1);
  return (
    <div className="loss-summary" role="region" aria-label="Ile tracisz bez ubezpieczenia">
      <p className="loss-kicker">Bez ubezpieczenia chorobowego dostaniesz około</p>
      <p className="loss-big">{money(loss.loss)} mniej</p>
      <p className="small muted">na rękę niż przy umowie o pracę za {money(loss.salaryGross)} brutto.</p>
      <div className="loss-bars">
        <LossBar label="Z ubezpieczeniem" value={loss.insuredTotal} max={max} color={C.insured} />
        <LossBar label="Bez ubezpieczenia" value={loss.uninsuredTotal} max={max} color={C.uninsured} />
      </div>
      {onShowDetails && <button type="button" className="btn btn-ghost" onClick={onShowDetails}>Zobacz wyliczenie miesiąc po miesiącu</button>}
    </div>
  );
}

function LossBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="loss-bar">
      <span className="loss-bar-label">{label}</span>
      <span className="loss-bar-track"><span style={{ width: `${(value / max) * 100}%`, background: color }} /></span>
      <span className="loss-bar-value">{money(value)}</span>
    </div>
  );
}

/** Pełna wersja — do kalkulatora. */
export function InsuranceLossPanel() {
  const loss = useInsuranceLoss();
  const { defaults } = useProfile();
  const [plan, setPlan] = useSection('plan');
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const months = loss.months;
  const max = Math.max(1, ...months.map((m) => Math.max(m.insured, m.uninsured)));
  const W = 1000, H = 260, padL = 64, padB = 34, padT = 12;
  const plotW = W - padL - 8;
  const plotH = H - padB - padT;
  const slot = plotW / Math.max(1, months.length);
  const barW = Math.max(3, Math.min(18, slot / 2 - 3));
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round((max * t) / 100) * 100);
  const extrasTotal = loss.extras.reduce((a, x) => a + x.amount, 0);

  return (
    <Card title="Ile tracisz bez ubezpieczenia" subtitle="Porównanie na rękę: świadczenie rodzicielskie (1 000 zł miesięcznie, bez podatku) i zasiłek macierzyński z ZUS, który dostałabyś na umowie o pracę." actions={<LegalTip legal="art. 29–31 ustawy zasiłkowej; art. 17c ustawy o świadczeniach rodzinnych (świadczenie rodzicielskie)" />}>
      <div className="loss-head">
        <div>
          <p className="loss-big">{money(loss.loss)}</p>
          <p className="muted">mniej przez cały okres po porodzie{extrasTotal > 0 ? `, plus ${money(extrasTotal)} innych zasiłków` : ''}.</p>
        </div>
        <Field label="Gdybyś pracowała na umowę o pracę za" hint={`Domyślnie płaca minimalna ${money(MIN_WAGE_2026)} brutto.`}>
          <NumberInput value={plan.hypotheticalSalary} def={defaults.plan.hypotheticalSalary} min={0} onChange={(v) => setPlan('hypotheticalSalary', v)} suffix="zł" />
        </Field>
      </div>

      <div className="stats stats-sm">
        <div className="stat"><span className="stat-label">Z ubezpieczeniem</span><span className="stat-value" style={{ color: '#0e6b53' }}>{money(loss.insuredTotal)}</span><span className="stat-sub">zasiłek macierzyński, {Math.round(loss.insuredWeeks)} tyg., podstawa {money(loss.base)}</span></div>
        <div className="stat"><span className="stat-label">Bez ubezpieczenia</span><span className="stat-value" style={{ color: '#8a5300' }}>{money(loss.uninsuredTotal)}</span><span className="stat-sub">świadczenie rodzicielskie, {loss.uninsuredWeeks} tyg.</span></div>
      </div>

      <div className="legend" aria-hidden="true">
        <span><i style={{ background: C.insured }} /> Z ubezpieczeniem (na rękę)</span>
        <span><i style={{ background: C.uninsured }} /> Bez ubezpieczenia</span>
      </div>
      <div className="chart loss-chart" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Miesięczne kwoty: z ubezpieczeniem razem ${money(loss.insuredTotal)}, bez ubezpieczenia razem ${money(loss.uninsuredTotal)}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#e6ebe7" />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="axis-label">{t.toLocaleString('pl-PL')}</text>
            </g>
          ))}
          {months.map((m, i) => {
            const cx = padL + slot * i + slot / 2;
            return (
              <g key={m.month} onMouseEnter={() => setHover(i)}>
                <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill={hover === i ? 'rgba(23,42,38,0.05)' : 'transparent'} />
                {m.insured > 0 && <rect x={cx - barW - 1} y={y(m.insured)} width={barW} height={Math.max(0, padT + plotH - y(m.insured))} rx={3} fill={C.insured} />}
                {m.uninsured > 0 && <rect x={cx + 1} y={y(m.uninsured)} width={barW} height={Math.max(0, padT + plotH - y(m.uninsured))} rx={3} fill={C.uninsured} />}
                {(months.length <= 14 || i % 2 === 0) && <text x={cx} y={H - 12} textAnchor="middle" className="axis-label">{monthLabel(m.month)}</text>}
              </g>
            );
          })}
          <line x1={padL} x2={W - 8} y1={padT + plotH} y2={padT + plotH} stroke="#b8c4bd" />
        </svg>
        {hover !== null && months[hover] && (
          <div className="tooltip" style={{ left: `${Math.min(78, ((padL + slot * hover + slot / 2) / W) * 100)}%`, top: 8 }}>
            <strong>{monthLabel(months[hover].month)}</strong><br />
            Z ubezpieczeniem: {money(months[hover].insured)}<br />
            Bez ubezpieczenia: {money(months[hover].uninsured)}<br />
            Różnica: {money(months[hover].insured - months[hover].uninsured)}
          </div>
        )}
      </div>
      <button type="button" className="btn btn-quiet loss-toggle" aria-expanded={showTable} onClick={() => setShowTable((s) => !s)}>{showTable ? 'Ukryj tabelę' : 'Pokaż tabelę miesięcy'}</button>
      {showTable && (
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Miesiąc</th><th className="num">Z ubezpieczeniem</th><th className="num">Bez ubezpieczenia</th><th className="num">Różnica</th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}><td>{monthLabel(m.month)}</td><td className="num">{money(m.insured)}</td><td className="num">{money(m.uninsured)}</td><td className="num">{money(m.insured - m.uninsured)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="loss-sub">Co jeszcze daje ubezpieczenie chorobowe</h4>
      <ul className="loss-list">
        {loss.extras.map((x) => (
          <li key={x.label}><span>{x.label} <LegalTip legal={x.legal} /></span><strong>{money(x.amount)}</strong></li>
        ))}
        <li><span>Zasiłek chorobowy w ciąży: 100% podstawy, nawet do 270 dni <LegalTip legal="art. 8 i 11 ustawy zasiłkowej" /></span><strong>{money(loss.base)} / mies.</strong></li>
        <li><span>Zasiłek opiekuńczy na chore dziecko: 80% podstawy, do 60 dni w roku <LegalTip legal="art. 32–33 ustawy zasiłkowej" /></span><strong>{money(loss.base * 0.8 / 30)} / dzień</strong></li>
        <li><span>Uzupełniający urlop przy wcześniaku i dłuższy urlop przy wieloraczkach (100%) <LegalTip legal="art. 180² KP" /></span><strong>—</strong></li>
        <li><span>Ochrona przed zwolnieniem w ciąży i na urlopie (umowa o pracę) <LegalTip legal="art. 177 KP" /></span><strong>—</strong></li>
      </ul>
      <p className="small muted">Kwoty z ubezpieczeniem liczone dla wybranego wariantu ({plan.variant === 'USREDNIONY' ? '81,5%' : '100% + 70%'}), z zaliczką na PIT{plan.hypotheticalSalary ? '' : ''}. Świadczenie rodzicielskie jest zwolnione z podatku. Jeśli ubezpieczony jest ojciec dziecka, część urlopu może przejąć on — sprawdź „Szczególną sytuację” w kreatorze.</p>
    </Card>
  );
}
