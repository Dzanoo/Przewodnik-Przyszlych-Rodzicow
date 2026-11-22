import { useEffect, useState } from 'react';
import { fetchHealth, type ApiHealth } from './api/client';
import { Calculator } from './components/Calculator';
import { Documents } from './components/Documents';
import { PlanRibbon } from './components/PlanRibbon';
import { Risks } from './components/Risks';
import { Support } from './components/Support';
import { Timeline } from './components/Timeline';
import { Icon } from './components/ui';
import { Wizard } from './components/Wizard';
import { DEMO_SCENARIOS } from './data/demoScenarios';
import { ProfileProvider, useProfile } from './state/ProfileContext';

type Tab = 'kreator' | 'kalkulator' | 'os' | 'dokumenty' | 'ryzyka' | 'wsparcie';

const TABS: { id: Tab; label: string; hint: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'kreator', label: 'Twoja sytuacja', hint: 'praca, rodzina, zarobki', icon: 'user' },
  { id: 'kalkulator', label: 'Ile dostaniesz', hint: 'zasiłki i warianty', icon: 'calc' },
  { id: 'os', label: 'Kiedy i do kiedy', hint: 'urlopy i terminy', icon: 'calendar' },
  { id: 'dokumenty', label: 'Co złożyć', hint: 'checklista i wnioski', icon: 'file' },
  { id: 'ryzyka', label: 'Na co uważać', hint: 'pułapki w przepisach', icon: 'alert' },
  { id: 'wsparcie', label: 'Gdzie szukać wsparcia', hint: 'fundacje i oficjalne źródła', icon: 'heart' },
];

function Shell() {
  const [tab, setTab] = useState<Tab>('kreator');
  const [openForm, setOpenForm] = useState<string | null>(null);
  const { loadDemo, activeDemo, reset, derived } = useProfile();
  const critical = derived.risks.filter((r) => r.severity === 'krytyczne').length;
  const [api, setApi] = useState<ApiHealth | null | undefined>(undefined);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchHealth(ctrl.signal).then(setApi);
    return () => ctrl.abort();
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    document.getElementById('main')?.focus({ preventScroll: true });
  };
  return (
    <div className="app">
      <a href="#main" className="skip">Przejdź do treści</a>
      <header className="masthead">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="30" height="30"><rect x="3" y="9" width="6" height="6" rx="1.5" fill="#A8326B" /><rect x="11" y="9" width="6" height="6" rx="1.5" fill="#A8326B" /><rect x="19" y="9" width="6" height="6" rx="1.5" fill="#2F69B3" /><rect x="3" y="17" width="6" height="6" rx="1.5" fill="#DCE3DE" /><rect x="11" y="17" width="6" height="6" rx="1.5" fill="#14876A" /><rect x="19" y="17" width="6" height="6" rx="1.5" fill="#14876A" /></svg>
          </span>
          <div>
            <strong>Przewodnik przyszłych rodziców</strong>
            <span>Urlopy, zasiłki i wnioski według przepisów z września 2026</span>
          </div>
        </div>
        <div className="families" role="group" aria-label="Przykładowe rodziny">
          <span className="families-caption">Przykładowe rodziny</span>
          {DEMO_SCENARIOS.map((s) => (
            <button key={s.id} type="button" className={activeDemo === s.id ? 'on' : ''} title={s.title} aria-pressed={activeDemo === s.id} onClick={() => { loadDemo(s.id); setTab('kalkulator'); }}>
              {s.short}
            </button>
          ))}
          <button type="button" className="families-reset" onClick={reset}>Zacznij od zera</button>
        </div>
      </header>

      <PlanRibbon onOpenTimeline={() => go('os')} />

      <div className="workspace">
        <nav className="sidenav" aria-label="Moduły">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              <Icon name={t.icon} />
              <span>
                {t.label}
                <small>{t.hint}</small>
              </span>
              {t.id === 'ryzyka' && critical > 0 && <span className="pill" aria-label={`${critical} krytyczne`}>{critical}</span>}
            </button>
          ))}
        </nav>

        <main id="main" className="main" tabIndex={-1}>
          {activeDemo && (
            <p className="demo-banner">
              Oglądasz przykład: {DEMO_SCENARIOS.find((d) => d.id === activeDemo)?.title}. Zmień dowolne dane w zakładce „Twoja sytuacja”, a wyliczenia przeliczą się od razu.
            </p>
          )}
          {tab === 'kreator' && <Wizard onFinish={() => go('kalkulator')} />}
          {tab === 'kalkulator' && <Calculator onOpenDocs={() => { setOpenForm('part-time'); go('dokumenty'); }} />}
          {tab === 'os' && <Timeline />}
          {tab === 'dokumenty' && <Documents initialForm={openForm} />}
          {tab === 'ryzyka' && <Risks />}
          {tab === 'wsparcie' && <Support />}
        </main>
      </div>
      <footer className="foot">
        Prototyp na HackNation 2026. Obliczenia wykonują się w Twojej przeglądarce i nigdzie nie są wysyłane. Kwoty netto są orientacyjne, a wynik nie zastępuje decyzji ZUS.
        {api !== undefined && (
          <span className="api-status">
            {api ? `REST API v${api.version}: połączono (te same wyliczenia pod /api/calculate)` : 'REST API niedostępne — aplikacja działa w pełni w przeglądarce.'}
          </span>
        )}
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ProfileProvider>
      <Shell />
    </ProfileProvider>
  );
}
