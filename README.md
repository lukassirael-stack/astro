# Nebeský kalendář

PWA pro `kairos.oaza-adamanthea.cz`. Jeden `index.html` s veškerou logikou, výpočty běží v prohlížeči (knihovna astronomy-engine, MIT), data zůstávají v zařízení (localStorage).

## Soubory
| soubor | k čemu |
|---|---|
| `index.html` | celá aplikace (CSS + jádro výpočtů + UI) |
| `astronomy.browser.min.js` | astronomická knihovna (astronomy-engine 2.1.19, MIT) |
| `sw.js` | service worker – offline, cache `kairos-vN` |
| `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png` | PWA |
| `api/noaa.js` | záložní proxy pro data NOAA (když prohlížeč zablokuje přímé stažení) |

## Nasazení
1. Nový repozitář `lukassirael-stack/kairos`, nahrát obsah této složky do kořene.
2. Vercel → New Project → root `/`, bez build příkazu (statický web). `api/noaa.js` se nasadí jako serverless funkce automaticky.
3. Doména `kairos.oaza-adamanthea.cz` (CNAME na Vercel).
4. Na telefonu: otevřít, Nastavení → „Přidat na plochu“ (iOS: Sdílet → Přidat na plochu).

**Při každé změně `index.html` zvedni `const CACHE = 'kairos-v1'` v `sw.js`** (stejné pravidlo jako u Tatev a admin panelu).

## Verze 1.1 — co se změnilo
Povrch je teď praktický, technika je schovaná. Detail dne začíná jednou větou o dni, pak **Co dnes jde** a **Co bude stát víc sil** v běžné češtině, pak **Okna dne** s konkrétními časy. Všechny glyfy, orbisy a skóre jsou pod rozklikávacím **„Podrobnosti — pro astrologa"**. Nahoře v kalendáři je pás **Nejbližší dny** (14 dní dopředu se slovním hodnocením). Paleta je světlejší, barvy dnů kontrastnější, na pozadí je hvězdné nebe.

Texty se skládají ze šablon v `createKairosTexts` — vrstva 1 (`dayLede`, `generalItems`) nezávisí na nativu a je stejná pro všechny, vrstva 2 (`personalItems`) pracuje s tranzity. To rozdělení je záměrné: až přijde placená verze, vrstva 1 zůstane volně a vrstva 2 se zamkne. AI napojení pak nahradí jen skládání vět, ne výpočty.

## Co aplikace umí
- **Kalendář** – barva dne (harmonický / neutrální / napjatý) podle tranzitů k nativu, Luny, Luny bez kurzu, Merkuru retro a Kp indexu. Ikony: ✦ tvá hvězda, ◉ zatmění, ⚡ Kp ≥ 5, ℞ Merkur zpět, ● ○ novoluní/úplněk, fáze Luny v rohu.
- **Detail dne** – pás dne (světlo, planetární hodiny, Luna bez kurzu, přesné aspekty Luny, značka „teď“), seznam „tohle je ve hře“ s příspěvky ke skóre, pozadí období (Jupiter–Pluto), Luna (lunární den, východ/západ, fáze), Slunce a 24 planetárních hodin, polohy planet v poledne, úkazy dne.
- **Úkazy** – rok dopředu: fáze (super/mikro úplněk), zatmění s viditelností z Halenkovic, rovnodennosti a slunovraty, opozice, elongace, stanice retrogradity, ingresy, těsné konjunkce planet a Luny s planetami, meteorické roje s rušením Lunou, Slunce/Venuše/Merkur/Mars na tvých hvězdách, heliakické východy tvých hvězd, vlastní komety.
- **Efemeridy** – měsíční tabulka Slunce–Pluto + střední uzel (půlnoc našeho času), ingresy/stanice/fáze, Luna bez kurzu, export CSV.
- **Nativ** – kolo, body, domy Placidus, aspekty, **Tvé hvězdy** (konjunkce orbis 1°, hvězdy na úhlech v okamžiku narození, parany dne narození).
- **Nastavení** – profily (přepínatelné, Martina atd.), místo pro tranzity, prahy barev, Kp zap/vyp, komety, NOAA, cache, instalace.

## Kde co upravit v `index.html`
- `DEFAULT_PROFILE` – výchozí nativ (teď Lukáš, 3. 9. 1980 16:04 Kroměříž).
- `DEFAULT_SETTINGS` – výchozí místo (Halenkovice), prahy.
- `DEFAULT_RULES` (v jádru) – váhy skóre, orbisy.
- `STARS` – seznam hvězd (RA/Dec J2000, `av` = arcus visionis pro heliakický východ). Avalon, Hargaliat, Agartha, Maldek, Void a Cestovatel časem nemají nebeský bod – nejsou tam.
- `METEOR_SHOWERS` – tabulka rojů.
- Texty u aspektů: `CONJ_HINT`, věty v `dayDetailHTML`.

## Ověření
Nativ pro 3. 9. 1980 16:04 Kroměříž srovnán se Swiss Ephemeris (pyswisseph 2.10): polohy planet, Asc 0°54′ Kozoroh, MC 3°28′ Štír i hroty Placidus sedí na úhlovou minutu. Stálice: Procyon 1980 = 25°30′ Rak (J2000 25°47′ minus precese) sedí. Zatmění 12. 8. 2026 (částečné 86 % při západu Slunce) a 28. 8. 2026 (Luna zapadá v maximu) sedí s efemeridami.

## Známé meze v1
- Uzel je střední (pravý se liší do ±1,5°). Chiron, Lilith ani asteroidy knihovna neumí.
- Parany a úhly: orbis 1° (cca 4 minuty času). Heliakické východy jsou přiblížení (pevný arcus visionis), ± pár dní.
- Viditelnost zatmění Luny se bere z výšky Luny v maximu a na okrajích částečné fáze.
- Kp z 27denního výhledu je orientační. Erupce a sluneční vítr zatím nejsou.
- Pomalé tranzity (Jupiter–Pluto) barvu dne záměrně neurčují – jsou „pozadí období“.

## Obloha podle denni doby (v1.2)
Ctyri palety - **rozednivani, den, stmivani, noc**. Na automatiku se prepinaji podle skutecneho vychodu a zapadu Slunce v nastavenem miste: rozednivani od 70 min pred vychodem do 50 min po nem, den do 60 min pred zapadem, stmivani do 70 min po zapadu, jinak noc. Prepina se pri otevreni, pri navratu na kartu a kazde 4 minuty. Rucne lze zvolit pevnou paletu v **Nastaveni -> Obloha**.

Technicky: kazda paleta je sada CSS promennych na `[data-theme="..."]`. Barvy dnu jsou ulozene jako RGB triplety (`--harm-rgb`), aby sly michat s pruhlednosti. Ve svetlych paletach se skryva hvezdne pole a nabehne vrstva mraku (`drawClouds`), v tmavych naopak. Maly skript v `<head>` nastavi paletu jeste pred nactenim aplikace, aby to neproblesklo.

Pridat patou paletu = blok promennych v CSS + polozka v `THEMES` + barva v `THEME_META`.

## Kde upravit texty
Všechno je v jednom bloku `createKairosTexts`: `SUN_TONE` (tón období), `MOON_EL` (živel dne), `MOON_SIGN` (Luna ve znamení), `phaseText` (fáze), `GO` / `COST` / `CONJ` (co která planeta přináší nebo stojí), `DOMAIN` (oblast života podle nativního bodu), `HOUR_USE` (na co je která planetární hodina), `dayWord` (slovo v mřížce).

## v2 (plán)
**Elekce — „chci investovat, kdy je vhodný čas"**: uživatel zvolí úkon (začít podnikání, podepsat smlouvu, cestovat, operace, svatba, stěhování, ceremonie, pohovor, těžký rozhovor…), systém proskenuje 90 dní dopředu podle pravidel pro ten úkon a vrátí pět nejlepších oken s odůvodněním. Pravidla: vládce úkonu silný, Luna nepoškozená, ne bez kurzu. U zdraví a peněz musí jazyk zůstat u „na tohle je vítr v zádech", nikdy u pokynu.

Dál skener výjimečných dnů (stellia, velké trigony, T-kvadratury, stacionární planety, ingresy pomalých planet, okna „všechny planety direktní“, sluneční/lunární návraty, zatmění na osobních bodech) a elekce s katalogem úkonů (5 nejlepších dnů + proč). Pak login + Supabase pro klientskou verzi bez přepisu výpočtů.
