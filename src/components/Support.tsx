import { OFFICIAL_LINKS, SUPPORT_ORGANIZATIONS, SUPPORT_TOPIC_LABEL, type SupportOrganization, type SupportTopic } from '../data/supportOrganizations';
import { useProfile } from '../state/ProfileContext';
import { Card } from './ui';

const TOPICS: SupportTopic[] = ['STRATA', 'WCZESNIAK', 'CIEZKA_CHOROBA'];

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');

function Org({ o }: { o: SupportOrganization }) {
  return (
    <li className="org">
      <strong className="org-name">{o.name}</strong>
      <p>{o.description}</p>
      <p className="org-links">
        {o.url && <a href={o.url} target="_blank" rel="noopener noreferrer">{host(o.url)}</a>}
        {o.phone && <span>Telefon: <a href={`tel:${o.phone.replace(/\s/g, '')}`} className="nowrap">{o.phone}</a></span>}
        {o.extra && <a href={o.extra.url} target="_blank" rel="noopener noreferrer">{o.extra.label}</a>}
      </p>
    </li>
  );
}

export function Support() {
  const { profile, derived } = useProfile();
  const f = profile.family;
  // Tematy dopasowane do sytuacji z kreatora — pokazujemy je jako pierwsze.
  const matched = new Set<SupportTopic>();
  if (f.situation === 'PO_PORODZIE' && f.childOutcome !== 'ZYWE') matched.add('STRATA');
  if (f.situation === 'PO_PORODZIE' && f.childOutcome === 'ZYWE' && (f.pregnancyWeekAtBirth < 37 || derived.supplementary.weeks > 0)) matched.add('WCZESNIAK');
  if (f.zaZyciem) matched.add('CIEZKA_CHOROBA');
  const ordered = [...TOPICS.filter((t) => matched.has(t)), ...TOPICS.filter((t) => !matched.has(t))];

  return (
    <div className="stack-lg">
      <Card
        title="Gdzie szukać wsparcia"
        subtitle="Organizacje charytatywne, które pomagają rodzicom w trudnych sytuacjach. Ich pomoc jest bezpłatna i niezależna od ZUS."
      >
        {ordered.map((t) => {
          const orgs = SUPPORT_ORGANIZATIONS.filter((o) => o.topics.includes(t));
          return (
            <section key={t} className={`org-group${matched.has(t) ? ' org-group-match' : ''}`} aria-labelledby={`topic-${t}`}>
              <h4 id={`topic-${t}`}>
                {SUPPORT_TOPIC_LABEL[t]}
                {matched.has(t) && <span className="org-match">pasuje do Twojej sytuacji</span>}
              </h4>
              <ul className="org-list">{orgs.map((o) => <Org key={`${t}-${o.id}`} o={o} />)}</ul>
            </section>
          );
        })}
        <p className="small muted">Lista nie jest pełna. Dane sprawdzono 22.11.2026; przed skorzystaniem upewnij się na stronie organizacji, jaką pomoc oferuje w Twoim regionie.</p>
      </Card>

      <Card title="Oficjalne informacje o uprawnieniach" subtitle="Strony urzędów, do których kieruje ZUS.">
        <ul className="org-list">
          {OFFICIAL_LINKS.map((l) => (
            <li key={l.url} className="org">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="org-name">{l.label}</a>
              <p className="small muted">{l.note}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
