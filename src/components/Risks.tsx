import { DEMO_SCENARIOS } from '../data/demoScenarios';
import { useProfile } from '../state/ProfileContext';
import { Card, Icon, LegalTip } from './ui';

export function Risks() {
  const { derived, loadDemo, activeDemo } = useProfile();
  const groups = [
    { key: 'krytyczne', title: 'Zrób to koniecznie' },
    { key: 'ostrzeżenie', title: 'Sprawdź' },
    { key: 'informacja', title: 'Warto wiedzieć' },
  ] as const;
  return (
    <div className="stack-lg">
      {groups.map((g) => {
        const rows = derived.risks.filter((r) => r.severity === g.key);
        if (!rows.length) return null;
        return (
          <section key={g.key}>
            <h3 className="section-title">{g.title} <span className="count">{rows.length}</span></h3>
            <div className="risk-grid">
              {rows.map((r) => (
                <article key={r.id} className={`risk risk-${r.severity === 'krytyczne' ? 'crit' : r.severity === 'ostrzeżenie' ? 'warn' : 'info'}`}>
                  <header>
                    <Icon name={r.severity === 'informacja' ? 'info' : 'alert'} />
                    <h4>{r.title}</h4>
                  </header>
                  <p>{r.body}</p>
                  <footer className="small muted">Podstawa prawna: {r.legal} <LegalTip legal={r.legal} /></footer>
                </article>
              ))}
            </div>
          </section>
        );
      })}
      {derived.risks.length === 0 && <Card><p>Brak wykrytych ryzyk dla tego profilu.</p></Card>}
      <Card title="Przykładowe rodziny" subtitle="Każdy przykład to trudny przypadek z przepisów. Kliknij, aby wczytać go do wszystkich zakładek.">
        <div className="demo-list">
          {DEMO_SCENARIOS.map((s) => (
            <button key={s.id} type="button" className={`demo-card ${activeDemo === s.id ? 'on' : ''}`} onClick={() => loadDemo(s.id)}>
              <span><strong>{s.title}</strong><span className="small block muted">{s.description}</span></span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
