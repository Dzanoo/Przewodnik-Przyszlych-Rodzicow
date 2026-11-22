import { useState } from 'react';
import { diffDays, formatPL, parseISO, toISO } from '../domain/dateUtils';
import { KIND_META } from './PlanRibbon';
import { useProfile } from '../state/ProfileContext';
import { Badge, Card, LegalTip, money, pct, weeks } from './ui';
import { periodAmount } from '../domain/benefitCalculator';


export function Timeline() {
  const { derived, today } = useProfile();
  const blocks = derived.timeline;
  const [hover, setHover] = useState<string | null>(null);
  if (!blocks.length) return <Card title="Oś czasu"><p>Brak urlopów do zaplanowania.</p></Card>;

  const start = blocks.reduce((m, b) => (b.start < m ? b.start : m), blocks[0].start);
  const end = blocks.reduce((m, b) => (b.end > m ? b.end : m), blocks[0].end);
  const span = Math.max(1, diffDays(start, end) + 1);
  const pos = (iso: string) => Math.max(0, Math.min(100, (diffDays(start, iso) / span) * 100));

  const months: string[] = [];
  const s = parseISO(start);
  for (let d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1)); toISO(d) <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    months.push(toISO(d));
  }
  const showToday = today >= start && today <= end;

  return (
    <div className="stack-lg">
      <Card title="Kto, kiedy i za ile" subtitle={`Od ${formatPL(start)} do ${formatPL(end)}, razem ${Math.round(span / 7)} tygodni.`}>
        <div className="gantt" role="table" aria-label="Harmonogram urlopów">
          <div className="gantt-scale" aria-hidden="true">
            {months.map((m, i) => (
              <span key={m} style={{ left: `${pos(m)}%` }}>{i % 2 === 0 || months.length < 14 ? m.slice(5, 7) + '.' + m.slice(2, 4) : ''}</span>
            ))}
          </div>
          {blocks.map((b) => (
            <div className="gantt-row" role="row" key={b.id}>
              <div className="gantt-label" role="rowheader">
                <span className={`who who-${b.who}`}>{b.who === 'OJCIEC' ? 'Ojciec' : b.who === 'RODZIC' ? 'Rodzic' : 'Matka'}</span>
                {b.label}
              </div>
              <div className="gantt-track" role="cell">
                {months.map((m) => <i key={m} className="gridline" style={{ left: `${pos(m)}%` }} />)}
                {showToday && <i className="today" style={{ left: `${pos(today)}%` }} />}
                <button
                  type="button"
                  className={`gantt-bar ${KIND_META[b.kind].cls}`}
                  style={{ left: `${pos(b.start)}%`, width: `${Math.max(0.8, pos(b.end) - pos(b.start) + 100 / span)}%` }}
                  onMouseEnter={() => setHover(b.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(b.id)}
                  onBlur={() => setHover(null)}
                  aria-label={`${b.label}: ${formatPL(b.start)} – ${formatPL(b.end)}, ${pct(b.rate)}`}
                >
                  <span>{weeks(Math.round(b.weeks * 100) / 100)}</span>
                </button>
                {hover === b.id && (
                  <div className="tooltip gantt-tip" style={{ left: `${Math.min(70, pos(b.start))}%` }}>
                    <strong>{b.label}</strong>
                    <br />{formatPL(b.start)} – {formatPL(b.end)}
                    <br />Zasiłek: {pct(b.rate)} podstawy
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {showToday && <p className="small muted"><span className="today-key" /> dziś ({formatPL(today)})</p>}
        <table className="table">
          <thead><tr><th>Urlop</th><th>Od</th><th>Do</th><th>Wymiar</th><th>Stawka</th><th className="num">Kwota brutto</th></tr></thead>
          <tbody>
            {blocks.map((b) => {
              const base = b.who === 'OJCIEC' ? derived.fatherBase : derived.motherBase;
              return (
                <tr key={b.id}>
                  <td>{b.label} <LegalTip legal={b.legal} /></td>
                  <td>{formatPL(b.start)}</td>
                  <td>{formatPL(b.end)}</td>
                  <td>{weeks(Math.round(b.weeks * 100) / 100)}</td>
                  <td>{pct(b.rate)}</td>
                  <td className="num">{money(periodAmount(base, b.rate, b.start, b.end))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="small muted">Kwoty w tabeli nie uwzględniają obniżenia zasiłku przy łączeniu urlopu z pracą — pełne wyliczenie w porównywarce wariantów.</p>
      </Card>
      <Deadlines />
    </div>
  );
}

export function Deadlines() {
  const { derived, today } = useProfile();
  return (
    <Card title="Terminy, których nie można przegapić" subtitle="Liczone od daty porodu albo przyjęcia dziecka.">
      <ul className="deadlines">
        {derived.deadlines.map((d) => {
          const left = diffDays(today, d.date);
          const past = left < 0;
          return (
            <li key={d.id} className={`dl dl-${d.severity} ${past ? 'past' : ''}`}>
              <div className="dl-date">
                <strong>{formatPL(d.date)}</strong>
                <span>{past ? `minęło ${-left} dni temu` : left === 0 ? 'dziś' : `za ${left} dni`}</span>
              </div>
              <div>
                <div className="dl-title">
                  {d.title} <Badge tone={d.severity === 'krytyczny' ? 'danger' : d.severity === 'ważny' ? 'warn' : 'info'}>{d.severity}</Badge>
                </div>
                <p className="small">{d.description} <LegalTip legal={d.legal} /></p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
