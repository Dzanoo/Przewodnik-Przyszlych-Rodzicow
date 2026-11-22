/**
 * Organizacje o charakterze charytatywnym (fundacje, OPP), które wspierają rodziców w szczególnych sytuacjach.
 * Wymóg z opisu wyzwania, pkt 3 i). Dane sprawdzone w publicznych źródłach 22.11.2026 — przed wdrożeniem
 * produkcyjnym listę powinien zweryfikować i utrzymywać ZUS (np. w panelu administracyjnym).
 */
export type SupportTopic = 'STRATA' | 'WCZESNIAK' | 'CIEZKA_CHOROBA';

export interface SupportOrganization {
  id: string;
  name: string;
  topics: SupportTopic[];
  description: string;
  url?: string;
  phone?: string;
  /** Dodatkowy materiał (np. bezpłatny informator). */
  extra?: { label: string; url: string };
}

export const SUPPORT_TOPIC_LABEL: Record<SupportTopic, string> = {
  STRATA: 'Po stracie dziecka, martwym urodzeniu lub poronieniu',
  WCZESNIAK: 'Przedwczesny poród i wcześniak',
  CIEZKA_CHOROBA: 'Ciężka choroba dziecka, także rozpoznana w ciąży',
};

export const SUPPORT_ORGANIZATIONS: SupportOrganization[] = [
  {
    id: 'rodzic-po-ludzku',
    name: 'Fundacja Rodzić po Ludzku',
    topics: ['STRATA'],
    description: 'Od lat wspiera kobiety po poronieniu, martwym urodzeniu i narodzinach chorego dziecka. Wydaje bezpłatny informator o tym, co czeka w szpitalu i jak zadbać o siebie po wyjściu.',
    url: 'https://rodzicpoludzku.pl',
    extra: {
      label: 'Informator „Poronienie i urodzenie martwego dziecka w szpitalu” (PDF)',
      url: 'https://gdzierodzic.info/wp-content/uploads/2025/09/Informator-Rodzic-po-Ludzku-Poronienie-i-urodzenie-martwego-dziecka-w-szpitalu-wersja-na-telefon-2025.pdf',
    },
  },
  {
    id: 'nagle-sami',
    name: 'Fundacja Nagle Sami',
    topics: ['STRATA'],
    description: 'Bezpłatna infolinia wsparcia dla osób w żałobie.',
    phone: '800 108 108',
  },
  {
    id: 'whd',
    name: 'Fundacja Warszawskie Hospicjum dla Dzieci',
    topics: ['CIEZKA_CHOROBA', 'STRATA'],
    description: 'Hospicjum perinatalne: opieka lekarska i psychologiczna od rozpoznania wady letalnej, przez poród, po wsparcie rodziców i rodzeństwa w żałobie.',
    url: 'https://www.hospicjum.waw.pl',
  },
  {
    id: 'gajusz',
    name: 'Fundacja Gajusz',
    topics: ['CIEZKA_CHOROBA'],
    description: 'Prowadzi w Łodzi hospicjum perinatalne, stacjonarne i domowe dla dzieci. Na stronie jest lista hospicjów perinatalnych w Polsce.',
    url: 'https://gajusz.org.pl',
    extra: { label: 'Lista hospicjów perinatalnych', url: 'https://gajusz.org.pl/dla-potrzebujacych/hospicjum-perinatalne' },
  },
  {
    id: 'wczesniak',
    name: 'Fundacja Wcześniak Rodzice-Rodzicom',
    topics: ['WCZESNIAK'],
    description: 'Organizacja pożytku publicznego dla rodziców dzieci urodzonych przed 36. tygodniem ciąży: bezpłatna wypożyczalnia sprzętu (np. monitorów oddechu), „Niezbędnik rodzica wcześniaka”, subkonta i pomoc finansowa.',
    url: 'https://www.wczesniak.pl',
  },
  {
    id: 'koalicja',
    name: 'Fundacja Koalicja dla wcześniaka',
    topics: ['WCZESNIAK'],
    description: 'Informacje i poradniki dla rodziców wcześniaków, m.in. „Bezpieczny wcześniak — w szpitalu i w domu”.',
    url: 'https://koalicjadlawczesniaka.pl',
  },
];

/** Oficjalne źródła wskazane w opisie wyzwania (przekierowanie do informacji o uprawnieniach). */
export const OFFICIAL_LINKS: { label: string; url: string; note: string }[] = [
  { label: 'ZUS — zasiłki dla rodziców', url: 'https://www.zus.pl', note: 'Pytania: mama@zus.pl, infolinia 22 560 16 00, eZUS, mZUS, placówki ZUS.' },
  { label: 'Ministerstwo Rodziny, Pracy i Polityki Społecznej — urlop rodzicielski', url: 'https://www.gov.pl/web/rodzina/urlop-rodzicielski', note: 'Zasady urlopów związanych z rodzicielstwem.' },
  { label: 'Państwowa Inspekcja Pracy — rodzicielstwo', url: 'https://www.pip.gov.pl/dla-pracodawcow/porady-prawne/rodzicielstwo', note: 'Prawa pracownicze w ciąży i w czasie urlopów.' },
  { label: 'Rejestr stanu cywilnego — odpis aktu urodzenia', url: 'https://www.gov.pl/web/cyfryzacja/rejestr-stanu-cywilnego', note: 'Gdy płatnikiem jest ZUS, odpisu nie dostarczasz — ZUS pobierze go sam.' },
];
