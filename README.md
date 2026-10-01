# Nebeský kompas — tvůj hvězdný kalendář

PWA na **https://nebe.oaza-adamanthea.cz**. Statický web na Vercelu (repo `lukassirael-stack/astro`, větev `main` = produkce), bez build kroku. Výpočty běží v prohlížeči nad knihovnou astronomy-engine (MIT), data uživatele zůstávají v zařízení.

Technický identifikátor v kódu a cache je `kairos` (klíče `kairos_*`, cache `kairos-vN`) — veřejný název je Nebeský kompas.

## Soubory
| soubor | k čemu |
|---|---|
| `index.html` | kostra stránky, uvítací obrazovka, načtení skriptů |
| `styles.css` | vzhled (palety den/noc, karty, vrstvy) |
| `kairos-core.js` | výpočetní jádro: astronomie, tranzity, skóre dne, texty dne (`createKairosEngine`, `createKairosTexts`) |
| `data.js` | čistá data: jmeniny, svátky, čakra roku |
| `app.js` | rozhraní a logika appky (jedna uzavřená funkce) |
| `nebe.js` | Hvězdné nebe teď — obloha v reálném čase podle polohy a natočení telefonu (načítá se až po otevření) |
| `sky-data.js` | data oblohy: hvězdy do 6 mag, souhvězdí, Messier, Mléčná dráha — d3-celestial © Olaf Frohn, BSD-3-Clause |
| `sw.js` | service worker — offline, cache `kairos-vN` |
| `astronomy.browser.min.js`, `qr.min.js` | knihovny |
| `api/noaa.js`, `api/comets.js`, `api/ics.js` | serverless proxy: kosmické počasí, komety, Google kalendář |
| obrázky `sky-*`, `tile-*`, `cat-*`, `logo*` | pozadí, dlaždice O tobě, kategorie Úkazů, logo |

## Nasazení a verze
Při každé změně zvedni verzi na **třech** místech najednou:
1. `app.js` → `const VERSION = 'vN'` (a `qr.min.js?v=N`)
2. `index.html` → `?v=N` u `styles.css`, `kairos-core.js`, `data.js`, `app.js`
3. `sw.js` → `const CACHE = 'kairos-vN'` a `?v=N` v seznamu `SHELL`

Commit do `main` → Vercel nasadí sám. Appka si novou verzi stáhne při dalším otevření (lišta „Nová verze je připravená").

## Data
- Uživatelská data v jednom balíčku `localStorage.kairos_state` (`{v, updated, data: {settings, profiles, journal, plan, cyc, days, partners, …}}`) — připravené pro sync přes účet.
- Přílohy Diáře (fotky, hlas) v IndexedDB.
- Plná verze: licence `kompas_licence` + `kompas_zarizeni` (kód KOMPAS-XXXXX, max 3 zařízení), Stripe předplatné přes Edge Function `stripe-session` (druh kompas / kompas_po_platbe / kompas_overit / kompas_portal) a `stripe-webhook` (checkout.session.completed, invoice.paid, customer.subscription.deleted); dárkový/testovací kód: `select * from kompas_zdarma('email', dny, 'poznámka')`. Přepínač paywallu: `const PAYWALL` v app.js.
- Supabase: `kompas_zpravy` (sdělení v appce, čtení publishable klíčem), `kompas_prenos` (šifrovaný přenos dat mezi zařízeními, platnost 1 h).

## Struktura appky
- **Kalendář** — karta Dnes (pevné jádro + vrstvy z Nastavení → Karta Dnes), měsíc s barvami dnů, detail vybraného dne.
- **Úkazy** — obloha rok dopředu v kategoriích.
- **Diář** — plán a zápis dne, hodnocení, Jak to sedí.
- **O tobě** — mapa, horoskop (celoživotní, den, týden, měsíc, rok), vztahy, čísla, čakra roku, návraty, hvězdy, mayský a čínský horoskop.
- **Nastavení** — profil, místo, vrstvy, obloha, data, nápověda (Jak s Kompasem pracovat, Průvodce vesmírnými vlivy).

## Kde upravit
- Vrstvy karty Dnes: `LAYERS` a `LAYER_SETS` v `app.js`.
- Texty dne: `createKairosTexts` v `kairos-core.js`.
- Horoskop: `HS` a funkce `horoscope*` v `app.js`.
- Nápověda: `guideHTML` v `app.js`.
- Váhy skóre a orbisy: `DEFAULT_RULES` v jádru.

## Archiv
Rozpracovaný „záměr / průvodce směrem" (kostra bez AI) leží ve větvi `archiv/zamer`.

## Ověření
Nativ 3. 9. 1980 16:04 Kroměříž srovnán se Swiss Ephemeris: polohy planet, Asc, MC i hroty Placidus sedí na úhlovou minutu.
