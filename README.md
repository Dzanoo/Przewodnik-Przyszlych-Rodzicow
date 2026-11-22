# Przewodnik Przyszłych Rodziców — HackNation 2026

Asystent, kalkulator świadczeń, planer urlopów i generator dokumentów dla rodziców i działów kadr.
Stan prawny: **wrzesień 2026 r.** Reguły i obliczenia działają w przeglądarce, a te same wyliczenia udostępnia REST API (`server/`) — jeden silnik domenowy dla obu warstw.

## Uruchomienie

```bash
npm install
npm run dev      # http://localhost:5173 (przekierowuje /api na serwer)
npm run api      # REST API: http://localhost:3001 (w drugim terminalu; api:dev = z przeładowaniem)
npm test         # testy silnika domenowego i REST API (node:test + tsx)
npm run build    # produkcyjny build do dist/
```

## Architektura

| Plik | Odpowiedzialność |
|---|---|
| `src/domain/constants2026.ts` | Parametry 2026: płaca minimalna 4 806 zł, min. podstawa 4 147,10 zł, maks. 20 321,30 zł, próg płatnika 20 osób, tolerancja długu 48,06 zł, wymiary urlopów, stawki |
| `src/domain/types.ts` | Model profilu (tytuł ubezpieczenia, rodzina, wynagrodzenie, plan, opieka) |
| `src/domain/eligibilityEngine.ts` | Ubezpieczenie chorobowe, płatnik (ZUS/pracodawca), okres wyczekiwania, art. 2a, wymiary urlopów (art. 180–183 KP), uzupełniający urlop (art. 180²), łączenie z pracą (art. 182¹f § 2 i § 7), oś czasu, terminy |
| `src/domain/benefitCalculator.ts` | Podstawa wymiaru (art. 36–47, w tym art. 38 i 42; art. 48–52 i 48a), kwoty za okres, zasiłek chorobowy w ciąży (33/14 dni, kod B, 270 dni), porównanie wariantów 81,5% vs 100%+70% z wyrównaniem (art. 31 ust. 4), podwyższenie do 1 000 zł (art. 31 ust. 3a), zasiłek opiekuńczy (pule 60/30/14) |
| `src/domain/documentGenerator.ts` | Checklista (pracodawca / ZUS / lekarz) z uproszczeniami (§ 13 rozp. 27.09.2026, § 22 rozp. 11.03.2025, dokumenty z UE/EFTA/UK) i generator wniosków |
| `src/domain/riskAuditor.ts` | Karty ryzyk (ZUS ZUA po macierzyńskim, dług > 1%, ulga na start, zbieg tytułów, kod B, art. 177, e-ZLA…) |
| `src/data/demoScenarios.ts` | 4 scenariusze „One-Click Demo” |
| `src/data/requiredDocuments.ts` | Katalog dokumentów (z `wymagane_dokumenty.json`) |
| `src/state/ProfileContext.tsx` | Wspólny stan profilu (React Context) i wyliczenia pochodne |
| `src/components/*` | Kreator, Kalkulator, Oś czasu, Dokumenty, Audytor ryzyk |

## Uwagi

* Style: własny design system w `src/styles.css` (tokeny granat/szmaragd/biel, WCAG AA) zamiast Tailwind — prototyp był budowany bez dostępu do sieci. Ikony: inline SVG w stylu Lucide. Wykresy: dedykowane komponenty SVG (zamiast Recharts).
* Kwoty netto są orientacyjne (zaliczka PIT 12%, opcjonalnie kwota zmniejszająca z PIT-2). Wynik nie jest decyzją ZUS.


## REST API

Serwer w `server/` korzysta z tego samego silnika co frontend (`src/domain/results.ts` → `computeResults`), więc wynik z API i z aplikacji jest identyczny. Bez dodatkowych zależności: `node:http` uruchamiany przez `tsx`. Routing i walidacja są w `server/app.ts` (testowalne bez HTTP, `server/api.test.ts`), serwer HTTP w `server/index.ts`. Zmienne: `PORT` (domyślnie 3001), `CORS_ORIGIN` (domyślnie `*`).

| Metoda i ścieżka | Opis |
|---|---|
| `GET /api/health` | Stan serwera, wersja API i stan prawny |
| `GET /api/parameters` | Parametry 2026 (stawki, wymiary urlopów, limity) — podstawa panelu administracyjnego |
| `GET /api/profiles/default` | Profil domyślny (wzór pól) |
| `GET /api/profiles/demo` | Przykładowe rodziny z gotowymi profilami |
| `POST /api/calculate` | Pełne wyliczenie: uprawnienia, podstawa wymiaru, oś czasu, warianty 81,5% / 100%+70%, zasiłek chorobowy i rehabilitacyjny, ryzyka |
| `POST /api/documents` | Wnioski do złożenia, checklista dokumentów i wypełnione wzory |
| `GET /api/catalog/scenarios` | Katalog scenariuszy wniosków (`wymagane_dokumenty.json`) |
| `GET /api/catalog/documents` | Katalog dokumentów |
| `GET /api/support` | Organizacje wsparcia i oficjalne źródła |

`POST` przyjmuje `{ "today": "RRRR-MM-DD" (opcjonalnie), "profile": { …częściowy profil… } }`. Brakujące pola uzupełnia profil domyślny, nieznane pola i złe typy są pomijane. Błędy: 400 (zły JSON lub typ), 404, 405.

```bash
curl -X POST http://localhost:3001/api/calculate -H 'Content-Type: application/json' \
  -d '{"profile":{"family":{"situation":"PO_PORODZIE","birthDate":"2027-01-10","childOutcome":"MARTWE"}}}'
```
