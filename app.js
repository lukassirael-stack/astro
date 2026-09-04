(function () {
  'use strict';
  const VERSION = 'v271';
  const A = Astronomy;
  const K = createKairosEngine(A);
  const TX = createKairosTexts(K);
  const TZ = 'Europe/Prague';

  // ===================== výchozí data (můžeš změnit v Nastavení) =====================
  const DEFAULT_PROFILE = { id: 'lukas', name: 'Lukáš', y: 1980, m: 9, d: 3, hh: 16, mm: 4, place: 'Kroměříž', lat: 49.2979, lon: 17.3931, alt: 200, tz: TZ };
  const DEFAULT_SETTINGS = {
    loc: { name: 'Halenkovice', lat: 49.1686, lon: 17.4783, alt: 250 },
    rules: { harm: 2, tense: -2, vocHours: 6, starOrb: 1 },
    comets: '',
    showKp: true,
    theme: 'auto',
    themeHold: 'stay',   // 'stay' = ruční volba drží, 'once' = do nejbližší přirozené změny
    themeMark: null,     // jaká byla automatika ve chvíli ruční volby
    clouds: true,
    organs: true,
    numerology: true,
    country: 'both', // cz | sk | both — svátky a jmeniny
    lang: 'cs', // cs | sk — jazyk rozhraní
  };
  // místa na jeden klik – uprav podle sebe
  const PLACES = [
    { name: 'Halenkovice', lat: 49.1686, lon: 17.4783, alt: 250 },
    { name: 'Kroměříž', lat: 49.2979, lon: 17.3931, alt: 210 },
    { name: 'Zlín', lat: 49.2265, lon: 17.6666, alt: 230 },
    { name: 'Brno', lat: 49.1951, lon: 16.6068, alt: 237 },
    { name: 'Praha', lat: 50.0755, lon: 14.4378, alt: 200 },
    { name: 'Bali (Ubud)', lat: -8.5069, lon: 115.2625, alt: 200 },
    { name: 'Egypt (Luxor)', lat: 25.6872, lon: 32.6396, alt: 76 },
  ];
  const NOAA = {
    kpObs: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
    kpFc: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
    outlook: 'https://services.swpc.noaa.gov/text/27-day-outlook.txt',
  };

  // ===================== úložiště =====================
  // ---------- úložiště: jeden balíček kairos_state pro data uživatele ----------
  // Uživatelská data (profil, diář, plány, cyklus, nastavení…) žijí v jednom objektu
  // s číslem verze — sync mezi zařízeními pak přenáší jednu věc. Dočasné věci
  // (stažené Kp, počasí, kalendář z Googlu, otevřená záložka) zůstávají zvlášť,
  // protože se dají kdykoli stáhnout znovu.
  const STATE_KEY = 'kairos_state', STATE_V = 1;
  const USER_KEYS = ['settings', 'profiles', 'active', 'journal', 'plan', 'cyc', 'cyc_on', 'days', 'days_seen', 'partners', 'ics', 'plus'];
  const rawGet = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };
  const rawSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const rawDel = (k) => { try { localStorage.removeItem(k); } catch (e) { } };
  let stateObj = rawGet(STATE_KEY, null);
  if (!stateObj || typeof stateObj !== 'object' || !stateObj.data) stateObj = { v: STATE_V, updated: 0, data: {} };
  // převod ze starých klíčů: cokoli ještě leží zvlášť (první spuštění nové verze,
  // nebo obnovená starší záloha) se přenese dovnitř a smaže
  (function migrate() {
    let moved = 0;
    for (const sk of USER_KEYS) {
      const lk = 'kairos_' + sk;
      if (localStorage.getItem(lk) != null) { stateObj.data[sk] = rawGet(lk, undefined); rawDel(lk); moved++; }
    }
    if (moved) { stateObj.updated = Date.now(); rawSet(STATE_KEY, stateObj); }
  })();
  const stateKey = (k) => { const sk = k.replace(/^kairos_/, ''); return USER_KEYS.includes(sk) ? sk : null; };
  const store = {
    get(k, def) { const sk = stateKey(k); if (sk) return sk in stateObj.data ? stateObj.data[sk] : def; return rawGet(k, def); },
    set(k, v) { const sk = stateKey(k); if (sk) { stateObj.data[sk] = v; stateObj.updated = Date.now(); rawSet(STATE_KEY, stateObj); return; } rawSet(k, v); },
    del(k) { const sk = stateKey(k); if (sk) { delete stateObj.data[sk]; stateObj.updated = Date.now(); rawSet(STATE_KEY, stateObj); return; } rawDel(k); },
    // celý balíček pro sync/zálohu a jeho nahrání zpět
    exportState() { return JSON.parse(JSON.stringify(stateObj)); },
    importState(obj) { if (obj && obj.data) { stateObj = { v: STATE_V, updated: obj.updated || Date.now(), data: obj.data }; rawSet(STATE_KEY, stateObj); } },
  };
  let profiles = store.get('kairos_profiles', null);
  if (!Array.isArray(profiles) || !profiles.length) profiles = [DEFAULT_PROFILE];
  let activeId = store.get('kairos_active', profiles[0].id);
  if (!profiles.find(p => p.id === activeId)) activeId = profiles[0].id;
  let settings = deepMerge(DEFAULT_SETTINGS, store.get('kairos_settings', {}));
  function deepMerge(a, b) { const o = Object.assign({}, a); for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) o[k] = deepMerge(a[k] || {}, b[k]); else if (b[k] !== undefined) o[k] = b[k]; } return o; }

  // ---------- slovenské rozhraní: překlad hotového DOMu ----------
  // Rozhraní se překládá až po vykreslení: krátké texty podle přesné shody, měsíce a dny podle slov.
  // Výkladové texty (horoskopy, čtení dne) zůstávají v češtině.
  const SK_WORD_RE = new RegExp('(^|[^\\p{L}])(' + Object.keys(SK_WORDS).sort((x, y) => y.length - x.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}])', 'gu');
  function skText(t) {
    const k = t.trim(); if (!k) return t;
    if (SK_UI[k]) return t.replace(k, SK_UI[k]);
    if (k.length > 160) return t;
    return t.replace(/(\d+\.\s*)září/g, '$1septembra').replace(SK_WORD_RE, (m, pre, w) => pre + SK_WORDS[w]);
  }
  function translateDOM(root) {
    if (!root || (settings.lang || 'cs') !== 'sk') return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => { const p = n.parentNode && n.parentNode.nodeName; return (p === 'SCRIPT' || p === 'STYLE' || !n.nodeValue.trim()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) { const v = n.nodeValue, t = skText(v); if (t !== v) { if (n._cs == null) n._cs = v; n.nodeValue = t; } }
    const els = root.querySelectorAll ? root.querySelectorAll('[aria-label],[placeholder],[title]') : [];
    for (const el of els) for (const at of ['aria-label', 'placeholder', 'title']) { const v = el.getAttribute(at); if (v && SK_UI[v]) el.setAttribute(at, SK_UI[v]); }
  }
  function restoreCzechDOM(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) if (n._cs != null) { n.nodeValue = n._cs; delete n._cs; }
  }
  function tr(s) { return (settings.lang || 'cs') === 'sk' ? skText(s) : s; }
  let _trPending = null;
  new MutationObserver((muts) => {
    if ((settings.lang || 'cs') !== 'sk') return;
    if (_trPending) return;
    _trPending = requestAnimationFrame(() => { _trPending = null; for (const m of muts) for (const n of m.addedNodes) { if (n.nodeType === 1) translateDOM(n); else if (n.nodeType === 3) { const t = skText(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; } } });
  }).observe(document.body, { childList: true, subtree: true });

  // ---------- příroda a obloha: zahrádkář, zlatá a modrá hodina, tmavé noci ----------
  // Lunární zahrádkář: živel znamení Luny říká, která část rostliny je „ve hře"
  const GARDEN = [
    ['plodový den', 'oheň', 'setí a sklizeň plodů — rajčata, fazole, obilí, ovoce'],
    ['kořenový den', 'země', 'kořenová zelenina, brambory, cibule; dobrý i na přesazování'],
    ['květový den', 'vzduch', 'květiny, brokolice, květák; řez a vazba kytic'],
    ['listový den', 'voda', 'listová zelenina, saláty, bylinky na list; zalévání a hnojení'],
  ];
  function gardenLine(da) {
    const g = GARDEN[da.moonSign % 4];
    const grow = da.phaseAngle < 180;
    return { kind: g[0], el: g[1], tip: g[2], phase: grow ? 'dorůstající Luna — čas sít, sázet a roubovat' : 'couvající Luna — čas sklízet, prořezávat a ošetřovat půdu' };
  }
  // zlatá hodina: Slunce mezi −4° a +6°; modrá hodina: mezi −6° a −4°; tmavá noc: konec astronomického soumraku (−18°)
  const _twCache = {};
  function twilight(y, m, d, obs) {
    const k = `${y}-${m}-${d}`; if (_twCache[k]) return _twCache[k];
    const start = A.MakeTime(K.dayStart(y, m, d, TZ));
    const at = (dir, alt) => { try { const r = A.SearchAltitude('Sun', obs, dir, start, 1, alt); return r ? r.date : null; } catch (e) { return null; } };
    const out = { goldAM: [at(+1, -4), at(+1, 6)], goldPM: [at(-1, 6), at(-1, -4)], blueAM: [at(+1, -6), at(+1, -4)], bluePM: [at(-1, -4), at(-1, -6)], astroDawn: at(+1, -18), astroDusk: at(-1, -18) };
    return (_twCache[k] = out);
  }
  // tmavá noc: od konce astronomického soumraku do dalšího svítání je Luna pod obzorem aspoň dvě hodiny
  function darkNight(y, m, d, obs, moonrise, moonset) {
    const tw = twilight(y, m, d, obs); if (!tw.astroDusk) return null;
    const next = K.tzParts(new Date(tw.astroDusk.getTime() + 20 * 3600000), TZ);
    const tw2 = twilight(next.y, next.m, next.d, obs); if (!tw2.astroDawn) return null;
    const n0 = tw.astroDusk.getTime(), n1 = tw2.astroDawn.getTime();
    // poloha Luny během noci po půlhodinách
    let dark = 0, from = null, to = null;
    for (let t = n0; t < n1; t += 1800000) {
      const eq = A.Equator('Moon', A.MakeTime(new Date(t)), obs, true, true); const hz = A.Horizon(A.MakeTime(new Date(t)), obs, eq.ra, eq.dec, 'normal');
      if (hz.altitude < -2) { dark += 0.5; if (from == null) from = t; to = t + 1800000; } else if (from != null && to != null && dark >= 2) break;
    }
    if (dark < 2 || from == null) return null;
    return { from: new Date(from), to: new Date(Math.min(to, n1)), hours: dark };
  }
  // ---------- numerologie: životní číslo, osobní rok, měsíc a den ----------
  const numReduce = (n, keepMaster) => { n = Math.abs(n); while (n > 9) { if (keepMaster && (n === 11 || n === 22 || n === 33)) return n; n = String(n).split('').reduce((s, ch) => s + (+ch), 0); } return n; };
  const digitsSum = (str) => String(str).split('').reduce((s, ch) => s + (/\d/.test(ch) ? +ch : 0), 0);
  function numerology(p, y, m, d) {
    const life = numReduce(digitsSum(`${p.d}${p.m}${p.y}`), true);
    const year = numReduce(digitsSum(`${p.d}${p.m}${y}`));
    const month = numReduce(year + m);
    const day = numReduce(month + d);
    return { life, year, month, day };
  }
  const NUM_LIFE = {
    1: ['Průkopník', 'Přišel jsi razit cestu. Síla je v samostatnosti, rozhodnosti a odvaze začínat; úkolem je vést bez toho, abys šel sám.'],
    2: ['Prostředník', 'Přišel jsi spojovat. Síla je v citlivosti, diplomacii a trpělivosti; úkolem je stát za sebou stejně pevně jako za druhými.'],
    3: ['Tvůrce', 'Přišel jsi vyjadřovat. Síla je v radosti, slově a představivosti; úkolem je dotahovat, co jsi s lehkostí začal.'],
    4: ['Stavitel', 'Přišel jsi stavět. Síla je v řádu, práci a spolehlivosti; úkolem je nechat do pevných zdí vejít i změnu.'],
    5: ['Poutník', 'Přišel jsi poznávat. Síla je ve svobodě, pohybu a přizpůsobivosti; úkolem je najít v pohybu střed.'],
    6: ['Pečovatel', 'Přišel jsi pečovat. Síla je v odpovědnosti, kráse a domově; úkolem je dávat, aniž bys sám zmizel.'],
    7: ['Hledač', 'Přišel jsi rozumět. Síla je v hloubce, samotě a intuici; úkolem je sdílet, co jsi v tichu našel.'],
    8: ['Správce', 'Přišel jsi spravovat. Síla je v moci, hmotě a vytrvalosti; úkolem je použít sílu ve prospěch víc než sebe.'],
    9: ['Dokončovatel', 'Přišel jsi uzavírat. Síla je v soucitu, rozhledu a schopnosti pouštět; úkolem je dovolit si i vlastní nový začátek.'],
    11: ['Vizionář', 'Zesílená dvojka. Vidíš dál a jemněji než ostatní; úkolem je unést vlastní citlivost a přeložit vizi do srozumitelné řeči.'],
    22: ['Stavitel velkého', 'Zesílená čtyřka. Umíš dát tvar něčemu, co přesahuje jeden život; úkolem je nezůstat u plánu a opravdu položit základ.'],
    33: ['Učitel', 'Zesílená šestka. Péče povýšená na poslání; úkolem je učit příkladem a přitom se nevyčerpat.'],
  };
  const NUM_YEAR = {
    1: 'rok začátků — sej, zakládej, rozhoduj se za sebe', 2: 'rok trpělivosti — vztahy, spolupráce, zrání pod povrchem', 3: 'rok rozkvětu — tvorba, slovo, radost, společnost',
    4: 'rok práce — základy, řád, zdraví, dotahování', 5: 'rok změny — pohyb, cesty, svoboda, nečekané obraty', 6: 'rok domova — péče, rodina, odpovědnost, krása',
    7: 'rok nitra — samota, studium, ticho, hloubka', 8: 'rok sklizně — peníze, moc, výsledky, zodpovědnost', 9: 'rok uzavírání — pouštění, odpuštění, konec cyklu',
  };
  const NUM_DAY = {
    1: 'začni, rozhodni, jdi první', 2: 'naslouchej, spolupracuj, nespěchej', 3: 'tvoř, mluv, těš se', 4: 'pracuj, uspořádej, dotáhni', 5: 'změň, vyjdi ven, zkus nové',
    6: 'pečuj, buď doma, sladi', 7: 'ztiš se, přemýšlej, buď sám', 8: 'jednej, spravuj, rozhodni o penězích', 9: 'uzavři, pusť, odpusť',
  };
  // ---------- hlubší rozbor čísel: narozeniny, karmické dluhy, vrcholy a výzvy, období, mřížka ----------
  const NUM_BDAY = {
    1: 'samostatný začátečník — nejlíp ti je, když věci vedeš', 2: 'citlivý a diplomatický — vnímáš, co druzí nevysloví', 3: 'hravý a výřečný — slovo a radost jsou tvůj nástroj',
    4: 'poctivý a metodický — stavíš z toho, co drží', 5: 'zvědavý a pohyblivý — potřebuješ prostor a změnu', 6: 'pečující a odpovědný — domov a lidé jsou ti na prvním místě',
    7: 'přemýšlivý a hledající — potřebuješ ticho, abys rozuměl', 8: 'rozhodný a praktický — máš tah na výsledek', 9: 'velkorysý a soucitný — myslíš v celku, ne v detailu',
    10: 'jednička s nadhledem — vedeš, ale s lehkostí', 11: 'intuitivní a citlivý — vnímáš víc, než dokážeš říct', 12: 'tvořivý s rozumem — nápad i způsob, jak ho uskutečnit',
    13: 'houževnatý — co jiní vzdají, ty dotáhneš prací', 14: 'svobodomyslný — potřebuješ pohyb a zároveň míru', 15: 'laskavý a přitažlivý — lidé k tobě přicházejí pro klid',
    16: 'hloubavý a nezávislý — rozumíš věcem zevnitř, sám', 17: 'ctižádostivý a schopný — hmotu i myšlenku držíš najednou', 18: 'širokého záběru — máš dar vidět souvislosti a pomáhat',
    19: 'silný a samostatný — učíš se, že síla roste sdílením', 20: 'jemný a vnímavý — tvá síla je v tichu a spolupráci', 21: 'společenský a tvůrčí — oživuješ, kam přijdeš',
    22: 'stavitel velkých věcí — vidíš celek a umíš ho udělat', 23: 'pružný a komunikativní — zvládneš skoro každé prostředí', 24: 'starostlivý a pracovitý — rodina a dílo jdou ruku v ruce',
    25: 'analytický a citlivý — rozum s intuicí v jednom', 26: 'organizátor s velkým srdcem — umíš řídit i pečovat', 27: 'moudrý a nezávislý — přemýšlíš o celku, chodíš svou cestou',
    28: 'vůdčí a laskavý — vedeš tak, že se tě lidé rádi drží', 29: 'hluboce citlivý — vnímáš proudy, které jiní minou', 30: 'radostný tvůrce — slovo a představivost bez zábran', 31: 'praktický tvůrce — nápad hned zkoušíš rukama',
  };
  const NUM_KARMA = {
    13: 'Karmický dluh 13 — lekce práce. Zkratky se nevyplácejí, výsledek přichází vytrvalostí; dar je schopnost dokončit, co jiní opustí.',
    14: 'Karmický dluh 14 — lekce míry. Svoboda bez hranic se rozpouští v roztěkanosti; dar je pružnost, když k ní přidáš disciplínu.',
    16: 'Karmický dluh 16 — lekce pokory. Co je postavené na obraze sebe, může spadnout; dar je hluboké poznání, které po pádu zůstane.',
    19: 'Karmický dluh 19 — lekce sdílení. Síla a samostatnost ti jdou samy; dar je vedení, které přestane být o tobě.',
  };
  const NUM_PIN = {
    1: 'období samostatnosti — učíš se stát na vlastních nohou a vést', 2: 'období vztahů — učíš se spolupracovat, čekat a naslouchat', 3: 'období vyjádření — tvorba, slovo, společnost, radost',
    4: 'období práce — základy, řád, trpělivé budování', 5: 'období změny — pohyb, cesty, svoboda, nové zkušenosti', 6: 'období domova — rodina, péče, odpovědnost za druhé',
    7: 'období nitra — studium, samota, duchovní hloubka', 8: 'období sklizně — hmota, moc, výsledky, zodpovědnost za víc lidí', 9: 'období uzavírání — soucit, služba, pouštění a rozhled',
  };
  const NUM_CHAL = {
    0: 'výzva volby — máš všechny možnosti otevřené a učíš se sám za sebe rozhodnout', 1: 'výzva samostatnosti — stát za sebou bez vzdoru i bez podřízení', 2: 'výzva citlivosti — nenechat se přecitlivělostí ovládat a přitom neotupět',
    3: 'výzva soustředění — roztříštěnou tvořivost sebrat do jedné věci', 4: 'výzva řádu — přijmout práci a kázeň bez toho, aby ztvrdly v rutinu', 5: 'výzva míry — svobodu žít, aniž by se rozpadla v neklid',
    6: 'výzva rovnováhy — pečovat, aniž bys ovládal nebo se ztratil', 7: 'výzva důvěry — nezůstat v hlavě a v samotě, pustit k sobě lidi', 8: 'výzva hmoty — zacházet s penězi a mocí, aniž by tě vedly',
  };
  const NUM_GRID_MISS = {
    1: 'chybí 1 — samostatnost se učí; prosadit se je pro tebe práce, ne samozřejmost', 2: 'chybí 2 — cit a trpělivost se učí; vnímat druhé chce vědomou pozornost', 3: 'chybí 3 — vyjádření se učí; slovo a radost si musíš dovolit',
    4: 'chybí 4 — řád se učí; praktické věci a vytrvalost přicházejí zkušeností', 5: 'chybí 5 — pohyb se učí; změna a svoboda ti nejsou přirozené, a proto jsou důležité', 6: 'chybí 6 — péče se učí; domov a odpovědnost za druhé chtějí zralost',
    7: 'chybí 7 — hloubka se učí; ticho a otázky po smyslu si musíš vyhledat', 8: 'chybí 8 — hmota se učí; peníze a moc chtějí vědomý postoj', 9: 'chybí 9 — soucit se učí; nadhled a služba celku přicházejí věkem',
  };
  const NUM_GRID_MANY = {
    1: 'silná 1 — pevná vůle a ego; ve větším počtu i tvrdohlavost', 2: 'silná 2 — citlivost a intuice; ve větším počtu snadná zranitelnost', 3: 'silná 3 — představivost a řeč; ve větším počtu roztěkanost',
    4: 'silná 4 — praktičnost a práce; ve větším počtu strnulost', 5: 'silná 5 — svoboda a pohyb; ve větším počtu neklid', 6: 'silná 6 — péče a domov; ve větším počtu sklon k obětování',
    7: 'silná 7 — hloubka a samota; ve větším počtu uzavřenost', 8: 'silná 8 — energie a hmota; ve větším počtu tlak na výkon', 9: 'silná 9 — soucit a rozhled; ve větším počtu idealismus',
  };
  function numerologyDeep(p, y) {
    const rd = (n) => numReduce(n);
    const m = rd(p.m), d = rd(p.d), yr = rd(digitsSum(p.y));
    const life = numReduce(digitsSum(`${p.d}${p.m}${p.y}`));
    const raw = [p.d, digitsSum(`${p.d}${p.m}${p.y}`), m + d + yr];
    const karma = [...new Set(raw.filter(x => NUM_KARMA[x]))];
    const pins = [rd(m + d), rd(d + yr), 0, rd(m + yr)]; pins[2] = rd(pins[0] + pins[1]);
    const chal = [Math.abs(m - d), Math.abs(d - yr), 0, Math.abs(m - yr)]; chal[2] = Math.abs(chal[0] - chal[1]);
    const a1 = 36 - life, ages = [[0, a1], [a1 + 1, a1 + 9], [a1 + 10, a1 + 18], [a1 + 19, null]];
    const cycles = [[m, 0, a1], [d, a1 + 1, a1 + 27], [yr, a1 + 28, null]];
    const cnt = {}; for (const ch of `${p.d}${p.m}${p.y}`) if (ch !== '0') cnt[ch] = (cnt[ch] || 0) + 1;
    const age = y - p.y;
    return { life, bday: p.d, karma, pins, chal, ages, cycles, cnt, age };
  }
  function numerologyDeepHTML(p) {
    const n = numerologyDeep(p, np.y);
    const cur = n.ages.findIndex(([a, b]) => n.age >= a && (b == null || n.age <= b));
    const grid = [[3, 6, 9], [2, 5, 8], [1, 4, 7]].map(r => `<div class="gr">${r.map(k => `<span class="${n.cnt[k] ? 'on' : 'off'}">${n.cnt[k] ? String(k).repeat(Math.min(n.cnt[k], 4)) : '·'}</span>`).join('')}</div>`).join('');
    const miss = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(k => !n.cnt[k]), many = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(k => n.cnt[k] >= 2);
    return `<details class="numdeep" open><summary>Hlubší rozbor čísel</summary><div class="card small">
      <p><b>Číslo narozeniny ${n.bday}</b> — ${NUM_BDAY[n.bday]}.</p>
      ${n.karma.length ? n.karma.map(k => `<p class="karma">${NUM_KARMA[k]}</p>`).join('') : '<p class="note">V tvém datu se žádné z karmických čísel 13, 14, 16 a 19 neobjevuje — bez dluhu z minula, lekce si vybíráš sám.</p>'}
      <div class="h3">Vrcholy a výzvy</div>
      <p class="note" style="margin-top:-4px">Čtyři období života; každé má svůj vrchol (co období nese) a výzvu (co v něm zraje). Věky vycházejí z tvého životního čísla.</p>
      ${n.pins.map((pn, i) => `<p class="${i === cur ? 'now' : ''}"><b>${i + 1}. období${i === cur ? ' · teď' : ''}</b> <small>${n.ages[i][1] == null ? `od ${n.ages[i][0]} let` : `${n.ages[i][0]}–${n.ages[i][1]} let`}</small><br>vrchol ${pn} — ${NUM_PIN[pn]}<br>${NUM_CHAL[n.chal[i]]}</p>`).join('')}
      <div class="h3">Tři životní období</div>
      ${n.cycles.map(([v, a, b], i) => `<p><b>${['Mládí', 'Střed', 'Zralost'][i]}</b> <small>${b == null ? `od ${a} let` : `${a}–${b} let`}</small> — ${v}: ${NUM_YEAR[v].replace(/^rok /, '')}.</p>`).join('')}
      <div class="h3">Mřížka data narození</div>
      <div class="numgrid">${grid}</div>
      ${many.map(k => `<p>${NUM_GRID_MANY[k]}.</p>`).join('')}
      ${miss.map(k => `<p class="muted">${NUM_GRID_MISS[k]}.</p>`).join('')}
    </div></details>`;
  }
  // ---------- čím procházíš: tranzity jako oblouky se začátkem, vrcholem a koncem ----------
  const _arcCache = {};
  function transitArcs(y, m, d) {
    const key = `${activeId}|${y}-${m}-${d}`; if (_arcCache[key]) return _arcCache[key];
    const da = analyze(y, m, d); const ref = K.dayStart(y, m, d, TZ);
    const all = da.background.concat(da.fast).filter(t => t.transit !== 'Moon');
    const out = all.map(t => {
      const slow = t.slow; const orbs = rules().orbs || {}; const maxOrb = orbs[t.key] != null ? orbs[t.key] : (orbs.default != null ? orbs.default : 3);
      const arc = K.transitArc(t.transit, S.natal.points[t.natal].lon, t.angle, ref, maxOrb, slow ? 420 : 45);
      const total = arc.end - arc.start || 1; const pos = Math.max(0, Math.min(1, (ref - arc.start) / total));
      const nextExact = arc.exact.find(x => x >= ref) || null, lastExact = [...arc.exact].reverse().find(x => x < ref) || null;
      return { t, arc, pos, nextExact, lastExact, slow };
    });
    out.sort((x, y) => (y.slow - x.slow) || (x.t.orb - y.t.orb));
    return (_arcCache[key] = out);
  }
  // texty období pro pomalé planety: co období žádá a co dává (měsíce, ne dny)
  const PERIOD_TXT = {
    Jupiter: { harm: 'Období otevřených dveří. Věci se daří s menším úsilím, přichází podpora a příležitosti; to, co v této oblasti zaseješ, má prostor růst. Stojí za to říkat ano a nebát se velikosti.', tense: 'Období velkého apetitu. Chce se ti víc, než se vejde — sliby, plány, výdaje. Období dává rozhled a chuť; žádá míru, aby z rozletu zůstalo něco skutečného.', conj: 'Rok nového cyklu růstu v této oblasti. Přichází prostor, důvěra a někdy i štěstí; co začneš teď, s tebou zůstane dvanáct let.' },
    Saturn: { harm: 'Období, kdy se staví natrvalo. Práce má výsledky, závazky drží, trpělivost se vyplácí. Dává pevnou půdu; žádá poctivost a klid v tempu.', tense: 'Období zkoušky. Co v této oblasti stojí na pevných základech, obstojí a zesílí; co bylo jen zvyk nebo přání, se ukáže. Bývá to náročné a bývá to zakládající — dává zralost a jasno, žádá vytrvalost.', conj: 'Začátek nového cyklu odpovědnosti — Saturn v této oblasti přeskládává, co je opravdu tvé. Období dává dospělost a strukturu, žádá, abys věci vzal vážně a dotáhl.' },
    Uranus: { harm: 'Období čerstvého vzduchu. Přicházejí nové nápady, lidé a cesty ven ze zajetých kolejí, a jde to lehce. Dává svobodu a překvapení, žádá jen ochotu vykročit.', tense: 'Období, kdy se hýbe zaběhané. Co v této oblasti ztuhlo, se láme — někdy zvenčí, někdy tvým vlastním rozhodnutím. Dává svobodu a pravdu o tom, co tě svazovalo; žádá pružnost a méně lpění.', conj: 'Zlom. Uran v této oblasti probouzí něco, co spalo, a život se tu na čas zrychlí. Období dává nový začátek a jiný pohled; žádá odvahu pustit staré podoby.' },
    Neptune: { harm: 'Období jemnosti. Sílí intuice, tvořivost a soucit, hranice mezi tebou a světem měknou příjemným způsobem. Dává inspiraci a klid; žádá čas pro ticho, aby bylo slyšet.', tense: 'Období mlhy. V této oblasti je těžší vidět jasně — únava, idealizace, nejasné odhady. Dává citlivost a schopnost pustit iluzi; žádá, aby ses velká rozhodnutí naučil odkládat na jasnější dny a věřil spíš tělu než představám.', conj: 'Období rozpouštění. Co v této oblasti bylo pevné, měkne a mění tvar; přichází sen, inspirace i zmatek. Dává hlubší cit a tvorbu; žádá pevnou půdu jinde — spánek, tělo, rytmus.' },
    Pluto: { harm: 'Období síly. V této oblasti máš přístup k hloubce a vytrvalosti, kterou jindy nemáš — dá se tu opravdu něco proměnit. Dává tah a pravdivost; žádá, aby síla sloužila něčemu většímu než ovládání.', tense: 'Období přestavby. Pluto tuto oblast pomalu a důkladně rozebírá až na základy; co není pravdivé, neobstojí, a tlak roste tam, kde se drží kontroly. Dává nejtrvalejší proměnu, jakou astrologie zná; žádá pustit řízení a nechat rozpadnout, co se rozpadá.', conj: 'Období smrti a zrození v této oblasti. Něco starého končí do hloubky a něco nového vzniká z kořenů. Dává sílu, kterou po něm už nikdo nevezme; žádá odvahu projít tmou beze spěchu.' },
  };
  const ASP_VERB = { conj: 'zesiluje', sextile: 'podněcuje', trine: 'podporuje', square: 'tlačí na', opposition: 'zrcadlí' };
  const ASP_NAME = { conj: 'konjunkce', sextile: 'sextil', trine: 'trigon', square: 'kvadratura', opposition: 'opozice' };
  const ASP_HOW = { conj: 'obě témata splývají v jedno', sextile: 'příležitost, která chce malý krok', trine: 'jde to samo, snadno se přehlédne', square: 'tření, které nutí rozhodnout', opposition: 'dvě strany, které chtějí vyvážit' };
  function arcTitle(t) { return `${K.BODY_CZ[t.transit]} ${ASP_VERB[t.key] || t.glyph} ${NATAL_ACC[t.natal]}`; }
  function arcPhrase(t) {
    const base = t.key === 'conj' ? (TX.CONJ[t.transit] || '') : (t.kind === 'harm' ? TX.GO[t.transit] : TX.COST[t.transit]);
    const dom = TX.DOMAIN[t.natal] ? ` — oblast: ${TX.DOMAIN[t.natal]}` : '';
    return base + dom;
  }
  const fmtD = (dt) => { const p = K.tzParts(dt, TZ); return `${p.d}. ${p.m}.`; };
  const fmtDY = (dt, y) => { const p = K.tzParts(dt, TZ); return p.y === y ? `${p.d}. ${p.m}.` : `${p.d}. ${p.m}. ${p.y}`; };
  function arcsHTML(y, m, d, opts) {
    opts = opts || {};
    const list = transitArcs(y, m, d); if (!list.length) return opts.empty || '';
    const ref = K.dayStart(y, m, d, TZ);
    // seskupit dotyky téže planety a téhož aspektu, které běží ve stejném období
    const groups = [];
    for (const it of list) {
      const g = groups.find(x => x.t.transit === it.t.transit && x.t.key === it.t.key && Math.abs(x.arc.start - it.arc.start) < 10 * 86400000 && Math.abs(x.arc.end - it.arc.end) < 10 * 86400000);
      if (g) g.targets.push(it.t.natal); else groups.push({ ...it, targets: [it.t.natal] });
    }
    const kindOf = (t) => t.key === 'conj' ? 'conj' : t.kind;
    const cls = (t) => t.key === 'conj' ? (t.weight > 0 ? 'harm' : t.weight < 0 ? 'tense' : '') : t.kind;
    const joinT = (arr) => arr.map(k => NATAL_ACC[k]).join(arr.length > 1 ? ' a ' : '');
    const line = (g) => {
      const { arc, pos, nextExact, lastExact, t } = g;
      const days = Math.round((arc.end - ref) / 86400000);
      const peak = nextExact ? (Math.abs(nextExact - ref) < 86400000 ? 'přesně dnes' : `vrchol ${fmtDY(nextExact, y)}`) : (lastExact ? `vrchol byl ${fmtDY(lastExact, y)}` : '');
      const marks = arc.exact.map(x => `<i style="left:${(100 * (x - arc.start) / ((arc.end - arc.start) || 1)).toFixed(1)}%"></i>`).join('');
      return `<div class="tarc-bar"><span class="fill" style="width:${(pos * 100).toFixed(1)}%"></span>${marks}<em style="left:${(pos * 100).toFixed(1)}%"></em></div>
        <div class="tarc-d"><span>${fmtDY(arc.start, y)}</span><span class="pk">${peak}</span><span>${fmtDY(arc.end, y)}${days > 0 && days < 400 ? ` · ještě ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}` : ''}</span></div>`;
    };
    const slowG = groups.filter(g => g.slow), fastG = groups.filter(g => !g.slow);
    const slowHTML = slowG.map(g => {
      const t = g.t; const period = (PERIOD_TXT[t.transit] || {})[kindOf(t)] || arcPhrase(t);
      const doms = g.targets.map(k => TX.DOMAIN[k]).filter(Boolean).join('; ');
      return `<div class="tarc slow ${cls(t)}">
        <div class="tarc-h"><span class="g">${K.BODY_GLYPH[t.transit]}</span><b>${esc(K.BODY_CZ[t.transit])} ${ASP_VERB[t.key] || ''} ${esc(joinT(g.targets))}</b>${t.retro ? '<span class="rx" title="retrográdně">℞</span>' : ''}</div>
        <div class="tarc-p">${esc(period)}${doms ? `<span class="dom">Oblast: ${esc(doms)}.</span>` : ''}<span class="asp">${t.glyph} ${ASP_NAME[t.key] || ''} · ${ASP_HOW[t.key] || ''}</span></div>
        ${line(g)}
      </div>`;
    }).join('');
    const fastHTML = fastG.length ? `<details class="tfast"><summary>Tento týden · rychlé tranzity (${fastG.length})</summary>${fastG.map(g => { const t = g.t; return `<div class="tarc fast ${cls(t)}">
        <div class="tarc-h"><span class="g">${K.BODY_GLYPH[t.transit]}</span><b>${esc(K.BODY_CZ[t.transit])} ${ASP_VERB[t.key] || ''} ${esc(joinT(g.targets))}</b></div>
        <div class="tarc-p">${esc(arcPhrase(t))}</div>${line(g)}</div>`; }).join('')}</details>` : '';
    return `<div class="tarcs">${slowHTML || '<p class="note">Žádná pomalá planeta se teď tvé mapy nedotýká — klidné pozadí.</p>'}${fastHTML}</div>`;
  }
  // jedna věta pro kartu Dnes: nejsilnější pomalý tranzit, nebo nejtěsnější rychlý
  function arcSentence() {
    const list = transitArcs(np.y, np.m, np.d); if (!list.length) return '';
    const it = list[0]; const t = it.t; const ref = K.dayStart(np.y, np.m, np.d, TZ);
    const when = it.nextExact ? (Math.abs(it.nextExact - ref) < 86400000 ? 'dnes je to přesné' : `vrchol ${fmtD(it.nextExact)}`) : (it.lastExact ? `vrchol byl ${fmtD(it.lastExact)}, dozní ${fmtD(it.arc.end)}` : `do ${fmtD(it.arc.end)}`);
    return `${arcTitle(t)} · ${when}`;
  }
  // ---------- Průvodce Kompasem ----------
  function guideHTML() {
    return `<div class="guide">
      <button type="button" class="btn ghost small" data-act="guideBack">‹ Zpět do Nastavení</button>
      <div class="h2">Průvodce Kompasem</div>
      <p class="lede">Nebeský kompas je kalendář žitý s oblohou. Z postavení Slunce, Luny, planet a stálic nad tvým místem a z tvé vlastní mapy narození skládá každý den do jedné barvy, jedné věty a několika tichých vrstev. Je to mapa terénu: říká, kudy dnes půjde snáz a kde budeš potřebovat víc trpělivosti. Kroky děláš ty.</p>

      <div class="h3">Jak začít</div>
      <p>Zadej v Nastavení datum, čas a místo narození. Z toho vzniká tvá mapa a všechno osobní v Kompasu — barva dnů, tranzity, hvězdy, návraty. Přesný čas narození dělá rozdíl u ascendentu a domů; když ho neznáš, Kompas počítá s polednem a řekne ti, co je tím méně jisté. Pak si Kompas přidej na plochu a nech ho běžet — nejlíp se čte ráno.</p>

      <div class="h3">Kalendář — barva dne</div>
      <p>Každý den v mřížce má barvu: <b>příznivý</b>, <b>vlídný</b>, <b>klidný</b>, <b>pomalejší</b>, <b>náročný</b>. Vzniká součtem toho, co se dnes na obloze dotýká tvé mapy, jak stojí Luna a jaké je kosmické počasí. Zlatá hvězdička ✦ značí den, kdy planeta stojí na tvé hvězdě. Tečka u čísla je svátek nebo tradice. Klepnutím na den otevřeš jeho detail.</p>

      <div class="h3">Karta Dnes</div>
      <p>Nahoře v Kalendáři je karta s dneškem. Řádky odshora: <b>hodina</b> (která planetární hodina právě běží a na co se hodí), <b>cena dne</b> (co dnes bude stát víc sil), <b>tatva</b> (jemný rytmus po 24 minutách od východu Slunce), <b>tělo</b> (orgánové hodiny ukotvené na skutečné poledne), <b>u tebe</b> (nejsilnější tranzit na tvou mapu a kde v jeho oblouku stojíš). Otazník u každého řádku vysvětlí, co je zač. Dole je <b>Pozvánka dne</b> — otázka a jeden krok podle znamení Luny, dne v týdnu nebo živlu.</p>

      <div class="h3">Detail dne</div>
      <p>Co dnes jde a co bude stát víc sil, průběh dne na ose (východy a západy, planetární hodiny, aspekty Luny, Luna bez kurzu), pod tím příroda a obloha: zlatá a modrá hodina, tmavé noci pro hvězdy, lunární zahrádkář a tvůj osobní den. <b>Podrobnosti — pro astrologa</b> otevřou přesná čísla: tranzity, orbisy, skóre. Tenhle vzor platí v celém Kompasu: nejdřív věta, mechanika až na požádání.</p>

      <div class="h3">Úkazy</div>
      <p>Obloha rok dopředu: fáze Luny, zatmění, ingresy, retrogradity, konjunkce, elongace, meteorické roje, heliakické východy hvězd, Kolo roku s osmi branami, perigeum a apogeum Luny. Čip <b>tvé cykly</b> ukáže tvé osobní návraty — sluneční (tvůj osobní nový rok), lunární každých 27 dní, Jupiterův a Saturnův. Každý úkaz má otazník s výkladem na míru tělesu a znamení.</p>

      <div class="h3">Diář</div>
      <p>Zapiš pár slov o dni a ohodnoť ho. Po pěti dnech Kompas ukáže, jak tvá hodnocení sedí s výpočtem; po osmi i podle fází cyklu, pokud ho vedeš. Plány na den se ráno objeví v kartě Dnes. Diář je tvůj kontrolní nástroj: Kompas říká, co je ve hře, ty říkáš, jak to bylo, a časem se ukáže, kde se potkáváte.</p>

      <div class="h3">O tobě</div>
      <p><b>Ty</b> začíná tím, čím právě procházíš — tranzity jako oblouky s počátkem, vrcholem a koncem, ohlédnutí na kterékoli datum. Pod tím tvoje mapa: Slunce, Luna, ascendent, celý horoskop v kapitolách, hvězdy, velké návraty a tvá čísla. <b>Vztahy</b> čtou, jak si tvá mapa rozumí s mapami lidí kolem tebe.</p>

      <div class="h3">Nastavení</div>
      <p>Profil a místo, obloha (den a noc se přepínají podle skutečného východu a západu Slunce), pravidla barvení dne s přesnými váhami pro zvídavé, cyklus, orgánové hodiny, numerologie, kosmické počasí, svátky pro Česko a Slovensko, jazyk rozhraní, Google kalendář, záloha a sdílení. Verze appky je úplně dole.</p>

      <div class="h3">Jak Kompas číst</div>
      <p>Ráno karta Dnes, jedna věta, jeden krok. Když plánuješ, <b>Najít vhodný den</b> pod detailem dne. Když se něco děje, otazník. Když chceš rozumět, Podrobnosti. Kompas mluví jazykem <em>tohle je ve hře, tohoto si všímej</em>; nejlepší výsledky dává tomu, kdo ho vede vedle vlastního pozorování a Diáře, ne místo něj.</p>

      <div class="h3">Tvá data</div>
      <p>Všechno běží v prohlížeči a zůstává v tomto zařízení. Záloha v Nastavení je jediná cesta, kudy data odcházejí, a jde jen tam, kam ji pošleš ty.</p>
      <button type="button" class="btn ghost small" data-act="guideBack" style="margin-top:8px">‹ Zpět do Nastavení</button>
    </div>`;
  }
  // ---------- svátky a volné dny ----------
  // Velikonoční neděle (Meeus/Jones/Butcher), z ní odvozené pohyblivé svátky
  function easterSunday(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(y, mo - 1, da));
  }
  const _holCache = {};
  function holidaysFor(y) {
    const ctry = settings.country || 'both', ck = y + ':' + ctry;
    if (_holCache[ck]) return _holCache[ck];
    const out = {};
    const put = (dt, v) => { out[K.isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())] = v; };
    const shift = (dt, n) => new Date(dt.getTime() + n * 86400000);
    const es = easterSunday(y);
    const sk = ctry === 'sk';
    put(shift(es, -46), { n: sk ? 'Popolcová streda' : 'Popeleční středa', t: true });
    put(shift(es, -7), { n: sk ? 'Kvetná nedeľa' : 'Květná neděle', t: true });
    put(shift(es, -2), { n: sk ? 'Veľký piatok' : 'Velký pátek', f: true });
    put(es, { n: sk ? 'Veľkonočná nedeľa' : 'Velikonoční neděle · Boží hod velikonoční', t: true });
    put(shift(es, 1), { n: sk ? 'Veľkonočný pondelok' : 'Velikonoční pondělí', f: true });
    // adventní neděle: čtyři neděle před Štědrým dnem
    const xmas = new Date(Date.UTC(y, 11, 24));
    const lastAdv = shift(xmas, -xmas.getUTCDay()); // neděle před Štědrým dnem (nebo on sám, když je neděle)
    for (let i = 0; i < 4; i++) { const dt = shift(lastAdv, -7 * i); put(dt, { n: `${4 - i}. ${sk ? 'adventná nedeľa' : 'adventní neděle'}`, t: true }); }
    const merge = (tab, tag) => { for (const [md, v] of Object.entries(tab)) { const k = `${y}-${md}`, prev = out[k]; const nv = Object.assign({}, v, ctry === 'both' ? { n: `${tag} ${v.n}` } : {}); out[k] = prev ? { n: `${prev.n} · ${nv.n}`, f: !!(prev.f || nv.f), t: !!(prev.t || nv.t) } : nv; } };
    if (ctry !== 'sk') merge(HOLIDAYS_CZ, 'CZ');
    if (ctry !== 'cz') merge(HOLIDAYS_SK, 'SK');
    return (_holCache[ck] = out);
  }
  function holidayFor(y, m, d) { return holidaysFor(y)[K.isoDate(y, m, d)] || null; }
  const holidayLine = (y, m, d) => { const h = holidayFor(y, m, d); return h ? `${h.f ? 'státní svátek' : 'tradice'} · ${h.n}` : ''; };

  const namedayLine = (m, d) => {
    const k = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const ctry = settings.country || 'both';
    const cz = ctry !== 'sk' ? NAMEDAY_CZ[k] : '', sk = ctry !== 'cz' ? NAMEDAY_SK[k] : '';
    if (!cz && !sk) return '';
    if (ctry === 'sk') return `meniny ${sk}`;
    return (cz ? `svátek ${cz}` : '') + (cz && sk ? ' · ' : '') + (sk ? `SK ${sk}` : '');
  };

  // ---------- diář ----------
  let journal = store.get('kairos_journal', {}) || {};
  const MDB = {
    db: null, _p: null,
    open() {
      if (MDB._p) return MDB._p;
      MDB._p = new Promise((res) => {
        if (!window.indexedDB) return res(null);
        try {
          const rq = indexedDB.open('kairos-media', 1);
          rq.onupgradeneeded = () => rq.result.createObjectStore('m');
          rq.onsuccess = () => { MDB.db = rq.result; res(MDB.db); };
          rq.onerror = () => res(null);
        } catch (e) { res(null); }
      });
      return MDB._p;
    },
    async put(id, blob) { const db = await MDB.open(); if (!db) return false; return new Promise((res) => { const tx = db.transaction('m', 'readwrite'); tx.objectStore('m').put(blob, id); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); },
    async get(id) { const db = await MDB.open(); if (!db) return null; return new Promise((res) => { const rq = db.transaction('m').objectStore('m').get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); }); },
    async del(id) { const db = await MDB.open(); if (!db) return; return new Promise((res) => { const tx = db.transaction('m', 'readwrite'); tx.objectStore('m').delete(id); tx.oncomplete = () => res(); tx.onerror = () => res(); }); },
  };
  let recState = null;
  const WX_EMO = (c) => c == null ? '' : c === 0 ? '☀️' : c <= 2 ? '🌤' : c === 3 ? '☁️' : c <= 48 ? '🌫' : c <= 57 ? '🌦' : c <= 67 ? '🌧' : c <= 77 ? '🌨' : c <= 82 ? '🌧' : c <= 86 ? '🌨' : '⛈';
  function wxGet() { return store.get('kairos_wx', null); }
  const SUNRISE_I = '<svg viewBox="0 0 16 12" width="15" height="11" aria-hidden="true"><path d="M3.5 9a4.5 4.5 0 0 1 9 0" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="1" y1="11" x2="15" y2="11" stroke="currentColor" stroke-width="1.2"/><line x1="8" y1="1" x2="8" y2="3.4" stroke="currentColor" stroke-width="1.2"/><line x1="3" y1="3" x2="4.6" y2="4.6" stroke="currentColor" stroke-width="1.1"/><line x1="13" y1="3" x2="11.4" y2="4.6" stroke="currentColor" stroke-width="1.1"/></svg>';
  const SUNSET_I = '<svg viewBox="0 0 16 12" width="15" height="11" aria-hidden="true"><path d="M3.5 9a4.5 4.5 0 0 1 9 0" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".55"/><line x1="1" y1="11" x2="15" y2="11" stroke="currentColor" stroke-width="1.2"/><path d="M8 1.2 6.4 3.2h3.2Z" fill="currentColor" transform="rotate(180 8 2.2)"/></svg>';
  const TATVY = [
    { n: 'Akáša', el: 'éter', tip: 'ticho, meditace a vhled', col: CHAKRA_COL.brow, sym: '<svg viewBox="0 0 14 14" width="13" height="13"><ellipse cx="7" cy="7" rx="4.2" ry="5.6" fill="#2E2440" stroke="currentColor" stroke-width="1"/></svg>' },
    { n: 'Váju', el: 'vzduch', tip: 'myšlenky, rozhovory a pohyb', col: CHAKRA_COL.throat, sym: '<svg viewBox="0 0 14 14" width="13" height="13"><circle cx="7" cy="7" r="5" fill="#274A66" stroke="currentColor" stroke-width="1"/></svg>' },
    { n: 'Tédžas', el: 'oheň', tip: 'vůli, akci a rozhodnutí', col: CHAKRA_COL.sacral, sym: '<svg viewBox="0 0 14 14" width="13" height="13"><path d="M7 1.6 12.6 12H1.4Z" fill="#6E2B1C" stroke="currentColor" stroke-width="1"/></svg>' },
    { n: 'Ápas', el: 'voda', tip: 'cit, plynutí a doplnění sil', col: '#9ED4E4', sym: '<svg viewBox="0 0 14 14" width="13" height="13"><path d="M1.8 8.2a5.4 5.4 0 0 0 10.4 0 5.4 5.4 0 0 1-10.4 0Z" fill="#2B4C5C" stroke="currentColor" stroke-width="1"/><path d="M2.6 7.4a4.6 4.6 0 0 0 8.8 0" fill="none" stroke="currentColor" stroke-width=".8"/></svg>' },
    { n: 'Prithví', el: 'země', tip: 'tělo, práci rukama a stabilitu', col: '#D9B96E', sym: '<svg viewBox="0 0 14 14" width="13" height="13"><rect x="2.4" y="2.4" width="9.2" height="9.2" fill="#5C4A1E" stroke="currentColor" stroke-width="1"/></svg>' },
  ];
  function tattvaNow() {
    try {
      const now = new Date();
      const q = K.tzParts(now, TZ);
      let ph = K.planetaryHours(q.y, q.m, q.d, observer(), TZ);
      if (!ph || !ph.sunrise) return null;
      let sr = ph.sunrise;
      if (now < sr) {
        const yd = K.tzParts(K.addDays(K.dayStart(q.y, q.m, q.d, TZ), -0.5), TZ);
        const ph2 = K.planetaryHours(yd.y, yd.m, yd.d, observer(), TZ);
        if (ph2 && ph2.sunrise) sr = ph2.sunrise;
      }
      const min = (now - sr) / 60000;
      if (min < 0) return null;
      const idx = Math.floor(min / 24) % 5;
      const left = 24 - (min % 24);
      const end = new Date(now.getTime() + left * 60000);
      return { t: TATVY[idx], end, left: Math.ceil(left) };
    } catch (e) { return null; }
  }
  function tattvaHTML() {
    const x = tattvaNow();
    if (!x) return '';
    return `<i class="ht-ic tv" style="border-color:${x.t.col};color:${x.t.col}">${x.t.sym}</i><b class="tvn"><small class="tvlab">tatva</small><span style="color:${x.t.col}">${x.t.n} <em>(${x.t.el})</em></span><small>do ${K.fmtTime(x.end, TZ)}</small></b><span class="tx">přeje ${x.t.tip}</span><i class="tvq" data-act="tvHelp" role="button" aria-label="Co jsou tatvy?">?</i>`;
  }
  // ---------- orgánové hodiny (TČM) — ukotvené na skutečné sluneční poledne ----------
  const ORG_COL = CHAKRA_COL.heart;
  const ORG_I = '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><circle cx="7" cy="7" r="5.1" fill="none" stroke="' + ORG_COL + '" stroke-width="1"/><circle cx="7" cy="7" r="1.7" fill="' + ORG_COL + '" opacity=".55"/></svg>';
  // pořadí od dvouhodiny srdce, která leží kolem pravého poledne
  const ORGANS = [
    { n: 'srdce', tip: 'vrchol dne — setkání a živý kontakt' },
    { n: 'tenké střevo', tip: 'třídění a trávení — nechat věci usadit' },
    { n: 'močový měchýř', tip: 'druhý dech — pití a pohyb' },
    { n: 'ledviny', tip: 'tělo bere zpátky — teplo a zpomalení' },
    { n: 'osrdečník', tip: 'blízkost a jemnost — večer pro srdce' },
    { n: 'trojitý ohřívač', tip: 'sladění a úklid — příprava na spánek' },
    { n: 'žlučník', tip: 'obnova a bilancování — hluboký spánek' },
    { n: 'játra', tip: 'nejhlubší očista — tma a klid' },
    { n: 'plíce', tip: 'dech se prohlubuje — tiché rozednívání' },
    { n: 'tlusté střevo', tip: 'ráno se otevírá — voda a klid' },
    { n: 'žaludek', tip: 'nejsilnější trávení — vydatná snídaně' },
    { n: 'slezina a slinivka', tip: 'síla do práce — soustředění a mysl' },
  ];
  function solarNoon(now) {
    const q = K.tzParts(now, TZ);
    const ph = K.planetaryHours(q.y, q.m, q.d, observer(), TZ);
    if (!ph || !ph.sunrise || !ph.sunset) return null;
    return new Date((ph.sunrise.getTime() + ph.sunset.getTime()) / 2);
  }
  function orgNow() {
    try {
      if (settings.organs === false) return null;
      const now = new Date();
      const noon = solarNoon(now);
      if (!noon) return null;
      const off = (now - noon) / 60000;
      const idx = Math.floor((off + 60) / 120);
      const o = ORGANS[((idx % 12) + 12) % 12];
      const start = new Date(noon.getTime() + (idx * 120 - 60) * 60000);
      const end = new Date(start.getTime() + 120 * 60000);
      return { o, start, end, noon, idx };
    } catch (e) { return null; }
  }
  function orgHTML() {
    const x = orgNow();
    if (!x) return '';
    return `<i class="ht-ic tv" style="border-color:${ORG_COL};color:${ORG_COL}">${ORG_I}</i><b class="tvn"><small class="tvlab">tělo</small><span style="color:${ORG_COL}">${x.o.n}</span><small>do ${K.fmtTime(x.end, TZ)}</small></b><span class="tx">${x.o.tip}</span><i class="tvq" data-act="orgHelp" role="button" aria-label="Co jsou orgánové hodiny?">?</i>`;
  }
  function orgExpHTML() {
    const x = orgNow();
    if (!x) return '';
    const cur = ((x.idx % 12) + 12) % 12;
    const rows = ORGANS.map((o, i) => {
      const st = new Date(x.noon.getTime() + (i * 120 - 60) * 60000);
      const en = new Date(st.getTime() + 120 * 60000);
      return `<span class="orow ${i === cur ? 'on' : ''}"><b>${K.fmtTime(st, TZ)}–${K.fmtTime(en, TZ)}</b><span>${o.n}</span><em>${o.tip}</em></span>`;
    }).join('');
    return `<span class="tvexp orgexp">Orgánové hodiny čínské medicíny dělí den na dvanáct dvouhodin, kterými postupně prochází čchi. Dvouhodina srdce leží kolem poledne, a proto je tady kruh ukotvený na <b>skutečnou kulminaci Slunce</b> pro tvé místo (dnes ${K.fmtTime(x.noon, TZ)}) — časy se tak přes rok posouvají spolu se Sluncem.<span class="orglist">${rows}</span>Ber to jako tichou orientaci v rytmu dne, kterou potvrdíš vlastním pozorováním.</span>`;
  }
  const DAY_TASKS = [
    ['Odkládáš první krok? Dnes je den ho udělat — pět minut stačí.', 'Neseš rozdělanou věc? Dnes je den ji uzavřít: dokonči ji, nebo ji vědomě polož.'],
    ['Chtějí tvé ruce tvořit? Dnes je den pro hmatatelnou práci — uvař, oprav, zasaď.', 'Hromadí se doma věci? Dnes je den něco spotřebovat a udělat místo.'],
    ['Myslíš na někoho? Dnes je den se ozvat — zavolej nebo napiš.', 'Čekají na tebe zprávy? Dnes je den v nich udělat čisto.'],
    ['Volá tě domov? Dnes je den udělat jedno místo hezčí.', 'Máš doma své lidi? Dnes je den jim věnovat večer.'],
    ['Vytvořil jsi něco, co svět ještě neviděl? Dnes je den to ukázat.', 'Drží tě někdo dlouho a věrně? Dnes je den mu nahlas poděkovat.'],
    ['Ruší tě jedno neuklizené místo? Dnes je den ho srovnat — šuplík stačí.', 'Přetéká ti seznam? Dnes je den vybrat tři věci: dvě udělej, jednu vyřaď.'],
    ['Odkládáš setkání? Dnes je den ho domluvit.', 'Máš něco na srdci? Dnes je den to říct — napiš, poděkuj, usmiř se.'],
    ['Nosíš v sobě něco nevysloveného? Dnes je den to pojmenovat pravým jménem.', 'Neseš něco, co už dávno netěší? Dnes je den to pustit.'],
    ['Láká tě něco nového? Dnes je den si na to vzít deset minut.', 'Mluvíš o cestě? Dnes je den naplánovat její první krok.'],
    ['Stavíš něco velkého? Dnes je den to posunout o jeden krok.', 'Která povinnost visí nejdéle? Dnes je den ji dokončit.'],
    ['Jedeš v zajetých kolejích? Dnes je den udělat jednu věc jinak.', 'Bere ti něco čas bez užitku? Dnes je den si ho vzít zpět.'],
    ['Kdy jsi byl naposled v tichu? Dnes je den si dopřát půl hodiny jen pro sebe.', 'Spěcháš na dokončení? Dnes je den to udělat jemně a beze spěchu.'],
  ];
  // podle vládce dne v týdnu (ne Slunce, po Luna, út Mars, st Merkur, čt Jupiter, pá Venuše, so Saturn): [dorůstající, couvající]
  const WEEKDAY_TASKS = [
    ['Co ti dnes dodá světlo? Dnes je den udělat jednu věc jen proto, že tě těší.', 'Kde jsi tento týden zářil? Dnes je den to v klidu docenit a odpočinout.'],
    ['Co potřebuje tvé tělo? Dnes je den mu dát, oč si říká — spánek, teplo, jídlo.', 'Co tě v týdnu rozhodilo? Dnes je den to nechat usednout.'],
    ['Co vyžaduje odvahu? Dnes je den do toho jít první.', 'Co tě zbytečně dráždí? Dnes je den ušetřit sílu na to podstatné.'],
    ['Co chceš vyřídit? Dnes je den na hovory, maily a domluvy.', 'Které slovo bylo navíc? Dnes je den mluvit míň a poslouchat víc.'],
    ['Kam chceš růst? Dnes je den udělat krok, který má rozměr.', 'Za co jsi vděčný? Dnes je den to říct nahlas.'],
    ['Co je krásné a čeká na tebe? Dnes je den si to dopřát.', 'Co si zaslouží péči? Dnes je den ji věnovat — sobě nebo místu, kde žiješ.'],
    ['Co chce řád? Dnes je den nastavit jedno pravidlo a držet ho.', 'Co dlouho vleče nohy? Dnes je den to uzavřít, nebo pustit.'],
  ];
  // podle živlu znamení Luny (oheň, země, vzduch, voda): [dorůstající, couvající]
  const ELEMENT_TASKS = [
    ['Hoří v tobě něco? Dnes je den to rozdmýchat — začni.', 'Kde už není co dohořívat? Dnes je den nechat oheň klidně dohasnout.'],
    ['Co chce pevný základ? Dnes je den ho položit — malý a skutečný.', 'Co je hotové? Dnes je den to sklidit a uklidit po sobě.'],
    ['Jaká myšlenka se vrací? Dnes je den ji napsat a poslat dál.', 'Kde je moc slov? Dnes je den vybrat jen ta pravá.'],
    ['Co cítíš pod povrchem? Dnes je den tomu dát prostor.', 'Co odplouvá? Dnes je den to nechat jít a neohlížet se.'],
  ];
  function taskOfDay(da) {
    const pa = da.phaseAngle;
    const sig0 = '';
    if (pa < 18 || pa > 342) return { t: 'Co chceš, aby v příštím měsíci rostlo? Dnes je den zapsat jeden záměr — jednou větou.', sig: 'nov — čas záměrů' };
    if (Math.abs(pa - 180) < 18) return { t: 'Co ve tvém životě dozrálo? Dnes je den to dokončit a poděkovat.', sig: 'úplněk — čas sklizně' };
    if (da.color === 'tense' && da.score <= -4) return { t: 'Tlačí se toho moc? Dnes je den vybrat tři podstatné věci a zbytek nechat na jindy.', sig: 'náročný den — méně je víc' };
    const grow = pa < 180;
    const sig = grow ? 'dorůstající Luna — čas přidávat' : 'couvající Luna — čas dokončovat';
    // Luna je ve znamení dva až tři dny — text se proto střídá: den znamení, den vládce dne v týdnu, den živlu
    const lon = da.pos && da.pos.Moon ? da.pos.Moon.lon : da.moonSign * 30;
    const dayInSign = Math.min(2, Math.floor(((lon % 30) + 30) % 30 / 13.2));
    if (dayInSign === 1) { const wd = K.tzParts(da.noon, TZ).wd; return { t: WEEKDAY_TASKS[wd][grow ? 0 : 1], sig }; }
    if (dayInSign === 2) return { t: ELEMENT_TASKS[da.moonSign % 4][grow ? 0 : 1], sig };
    return { t: DAY_TASKS[da.moonSign][grow ? 0 : 1], sig };
  }
  const FEEDBACK_MAIL = 'oaza.adamanthea@gmail.com';
  // ============ cyklus (volitelný modul) ============
  const CYC_PHASES = [
    { k: 'men', n: 'reflektivní', full: 'Menstruační · reflektivní', col: CHAKRA_COL.throat,
      t: 'Čas ztišení a vhledu. Energie se stahuje dovnitř a co se přežilo, se v tomhle období pouští snadno. Je vidět podstata věcí a odpočinek nese víc než výkon.' },
    { k: 'dyn', n: 'dynamická', full: 'Předovulační · dynamická', col: CHAKRA_COL.heart,
      t: 'Energie se vrací a chce ven. Věci se rozjíždějí lehce, myšlení je jasné a přímé — dobrá doba pustit se do nového a dotáhnout, co dlouho leželo.' },
    { k: 'exp', n: 'expresivní', full: 'Ovulační · expresivní', col: CHAKRA_COL.sacral,
      t: 'Čas otevřenosti a kontaktu. Slova jdou snadno, druzí jsou blízko a péče o sebe i o ostatní chutná. Fáze, kdy se dobře domlouvá, spojuje a ukazuje.' },
    { k: 'kre', n: 'kreativní', full: 'Předmenstruační · kreativní', col: CHAKRA_COL.crown,
      t: 'Nápady přicházejí samy a intuice mluví nahlas. Je zřetelně vidět, co potřebuje změnu — fáze pro tvoření a pro poctivé pojmenování toho, co už nesedí.' },
  ];
  const cycOn = () => !!store.get('kairos_cyc_on', false);
  const cycAll = () => store.get('kairos_cyc', []).slice().sort();
  const cycSet = (list) => store.set('kairos_cyc', [...new Set(list)].sort());
  function cycAvg() {
    const l = cycAll();
    if (l.length < 2) return 28;
    const gaps = [];
    for (let i = 1; i < l.length; i++) {
      const g = Math.round((K.dayStart(...l[i].split('-').map(Number), TZ) - K.dayStart(...l[i - 1].split('-').map(Number), TZ)) / 86400000);
      if (g >= 18 && g <= 45) gaps.push(g);
    }
    if (!gaps.length) return 28;
    return Math.round(gaps.slice(-6).reduce((a, b) => a + b, 0) / gaps.slice(-6).length);
  }
  function cycFor(key) {
    if (!cycOn()) return null;
    const l = cycAll();
    if (!l.length) return null;
    const t = K.dayStart(...key.split('-').map(Number), TZ);
    let start = null;
    for (const k of l) { const d = K.dayStart(...k.split('-').map(Number), TZ); if (d <= t) start = d; else break; }
    if (!start) return null;
    const day = Math.round((t - start) / 86400000) + 1;
    const len = cycAvg();
    if (day > len + 20) return null;
    const ov = Math.max(11, len - 14);
    let ph;
    if (day <= 5) ph = CYC_PHASES[0];
    else if (day <= ov - 2) ph = CYC_PHASES[1];
    else if (day <= ov + 2) ph = CYC_PHASES[2];
    else ph = CYC_PHASES[3];
    const next = new Date(start + len * 86400000);
    return { day, len, ph, next, isStart: day === 1 };
  }
  function cycLine(key) {
    const c = cycFor(key);
    if (!c) return '';
    return `<div class="cycline"><span class="cdot" style="background:${c.ph.col}"></span><b>${c.day}. den cyklu</b><span>${esc(c.ph.n)} fáze</span><i class="cq" data-act="cycHelp">?</i></div>${S.cycHelp ? `<div class="cycexp"><b>${esc(c.ph.full)}</b><p>${esc(c.ph.t)}</p><p class="small muted">Průměrná délka cyklu ${c.len} dní · další začátek kolem ${c.next.getDate()}. ${K.MONTH_GEN[c.next.getMonth()]}. Odhad z tvých zápisů, ne lékařský údaj.</p></div>` : ''}`;
  }
  const sdAll = () => store.get('kairos_days', []);
  const SD_EMO = { narozeniny: '🎂', vyroci: '💍', jine: '✦' };
  function sdForDay(y, m, d) { return sdAll().filter(x => +x.m === +m && +x.d === +d && (x.r === 0 ? +x.y === +y : true)); }
  function sdLabel(x, y) {
    const yrs = x.r === 0 ? null : (x.y ? y - (+x.y) : null);
    const base = x.t === 'narozeniny' ? 'narozeniny' : x.t === 'vyroci' ? 'výročí' : '';
    return `${SD_EMO[x.t] || '✦'} ${esc(x.name)}${base ? ' — ' + base : ''}${yrs != null && yrs > 0 ? ` (${yrs})` : ''}`;
  }
  async function wxRefresh() {
    try {
      const pr = activeProfile(); if (!pr || pr.lat == null) return;
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${+pr.lat}&longitude=${+pr.lon}&current=temperature_2m,weather_code&daily=temperature_2m_min,temperature_2m_max&forecast_days=1&timezone=${encodeURIComponent(TZ)}`;
      const r = await fetch(u); if (!r.ok) return;
      const j = await r.json();
      store.set('kairos_wx', { when: Date.now(), t: Math.round(j.current.temperature_2m), c: j.current.weather_code, tmin: Math.round(j.daily.temperature_2m_min[0]), tmax: Math.round(j.daily.temperature_2m_max[0]) });
      if (S.tab === 'kalendar') renderCalendar();
    } catch (e) { }
  }
  function wxLine() {
    const w = wxGet();
    if (!w || Date.now() - w.when > 3 * 3600 * 1000) return '';
    return `<span class="ht-wx" title="venku teď"><i>${WX_EMO(w.c)}</i><b>${w.t}<span class="dg">°</span></b></span>`;
  }
  async function reconcileMedia() {
    const db = await MDB.open(); if (!db) return;
    const keys = await new Promise((res) => { const rq = db.transaction('m').objectStore('m').getAllKeys(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => res([]); });
    const used = new Set();
    for (const k of Object.keys(journal)) for (const m of (journal[k].media || [])) used.add(m.id);
    let saved = 0;
    for (const id of keys) {
      if (used.has(id) || !/^[ai][0-9a-z]+$/.test(id)) continue;
      const ts = parseInt(id.slice(1), 36);
      if (!ts || ts < 1500000000000) continue;
      const q = K.tzParts(new Date(ts), TZ);
      const dayKey = K.isoDate(q.y, q.m, q.d);
      const e = jGet(dayKey) || {};
      jSet(dayKey, { media: [...(e.media || []), { id, t: id[0] === 'a' ? 'a' : 'i' }] });
      saved++;
    }
    if (saved) { toast(`Obnoveno ${saved} ${saved === 1 ? 'ztracená příloha' : saved < 5 ? 'ztracené přílohy' : 'ztracených příloh'} v diáři.`); if (S.tab === 'diar') renderJournal(); if (S.tab === 'kalendar') renderCalendar(); }
  }
  async function jMediaHydrate(root) {
    for (const el of (root || document).querySelectorAll('[data-mid]')) {
      const blob = await MDB.get(el.dataset.mid);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      if (el.tagName === 'IMG') el.src = url; else { el.src = url; el.closest('.jmau') && el.closest('.jmau').classList.add('ready'); }
    }
  }
  const RATES = [
    { v: -2, label: 'náročný den', cls: 'tense' },
    { v: -1, label: 'pomalejší den', cls: 'tense' },
    { v: 0, label: 'klidný den', cls: '' },
    { v: 1, label: 'vlídný den', cls: 'harm' },
    { v: 2, label: 'příznivý den', cls: 'harm' },
  ];
  // plán: { "2026-08-24": [ {id, t:'14:00'|null, name, note} ] }
  let plan = store.get('kairos_plan', {}) || {};
  const pGet = (key) => plan[key] || [];
  // ---- Google kalendář: načítání událostí přes tajnou iCal adresu ----
  function icsUnescape(t) { return String(t || '').replace(/\\n/g, ' · ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'); }
  function icsParse(text, winFrom, winTo) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const evs = [];
    let cur = null;
    for (const ln of lines) {
      if (ln === 'BEGIN:VEVENT') { cur = { ex: [] }; continue; }
      if (ln === 'END:VEVENT') { if (cur && cur.start) evs.push(cur); cur = null; continue; }
      if (!cur) continue;
      const i = ln.indexOf(':'); if (i < 0) continue;
      const head = ln.slice(0, i), val = ln.slice(i + 1);
      const name = head.split(';')[0];
      if (name === 'SUMMARY') cur.name = icsUnescape(val);
      else if (name === 'RRULE') cur.rrule = val;
      else if (name === 'EXDATE') { for (const v of val.split(',')) cur.ex.push(v.slice(0, 8)); }
      else if (name === 'DTSTART' || name === 'DTEND') {
        const allDay = /VALUE=DATE(?!-TIME)/.test(head) || /^\d{8}$/.test(val);
        const tz = (head.match(/TZID=([^;:]+)/) || [])[1];
        let dt, hm = null;
        if (allDay) { dt = new Date(val.slice(0, 4) + '-' + val.slice(4, 6) + '-' + val.slice(6, 8) + 'T12:00:00'); }
        else if (/Z$/.test(val)) { dt = new Date(val.slice(0, 4) + '-' + val.slice(4, 6) + '-' + val.slice(6, 8) + 'T' + val.slice(9, 11) + ':' + val.slice(11, 13) + ':00Z'); const q = K.tzParts(dt, TZ); hm = pad(q.hh) + ':' + pad(q.mi); }
        else { dt = new Date(val.slice(0, 4) + '-' + val.slice(4, 6) + '-' + val.slice(6, 8) + 'T' + val.slice(9, 11) + ':' + val.slice(11, 13) + ':00'); hm = val.slice(9, 11) + ':' + val.slice(11, 13); }
        if (name === 'DTSTART') { cur.start = dt; cur.allDay = allDay; cur.t = allDay ? null : hm; }
      }
    }
    // rozbalit jednoduchá opakování v okně
    const out = [];
    const DAY = 86400000;
    for (const e of evs) {
      const base = e.start;
      const push = (d) => {
        const q = K.tzParts(d, TZ);
        const key = K.isoDate(q.y, q.m, q.d);
        const ymd = key.replace(/-/g, '');
        if (d < winFrom || d > winTo || e.ex.includes(ymd)) return;
        out.push({ d: key, t: e.t, name: e.name || '(bez názvu)' });
      };
      if (!e.rrule) { push(base); continue; }
      const R = {}; for (const kv of e.rrule.split(';')) { const [k, v] = kv.split('='); R[k] = v; }
      const freq = R.FREQ, interval = Math.max(1, +(R.INTERVAL || 1));
      let count = R.COUNT ? +R.COUNT : Infinity;
      const until = R.UNTIL ? new Date(R.UNTIL.slice(0, 4) + '-' + R.UNTIL.slice(4, 6) + '-' + R.UNTIL.slice(6, 8) + 'T23:59:59') : null;
      if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) { push(base); continue; }
      const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
      const bydays = freq === 'WEEKLY' && R.BYDAY ? R.BYDAY.split(',').map(x => WD[x.slice(-2)]).filter(x => x != null) : null;
      let n = 0, guard = 0;
      let d = new Date(base);
      while (d <= winTo && n < count && guard++ < 3000) {
        if (until && d > until) break;
        if (!bydays || bydays.includes(d.getDay())) { if (n < count) { push(d); } n++; }
        if (freq === 'DAILY') d = new Date(d.getTime() + interval * DAY);
        else if (freq === 'WEEKLY') { d = new Date(d.getTime() + DAY); if (!bydays && d.getDay() === base.getDay()) d = new Date(d.getTime() + (interval - 1) * 7 * DAY); if (bydays && d.getDay() === base.getDay()) d = new Date(d.getTime() + (interval - 1) * 7 * DAY); }
        else if (freq === 'MONTHLY') { const q = new Date(d); q.setMonth(q.getMonth() + interval); d = q; }
        else { const q = new Date(d); q.setFullYear(q.getFullYear() + interval); d = q; }
      }
    }
    out.sort((a, b) => a.d.localeCompare(b.d) || String(a.t || '').localeCompare(String(b.t || '')));
    return out.slice(0, 800);
  }
  const gEv = () => store.get('kairos_icsev', null);
  function gEvByDay(key) { const c = gEv(); return c ? (c.ev || []).filter(e => e.d === key) : []; }
  async function icsRefresh(silent) {
    const url = store.get('kairos_ics', '');
    if (!url) { if (!silent) toast('Nejdřív vlož tajnou iCal adresu v Nastavení.'); return; }
    if (!silent) toast('Načítám Google kalendář…');
    try {
      const r = await fetch('api/ics?url=' + encodeURIComponent(url.trim()));
      if (!r.ok) throw new Error(await r.text());
      const text = await r.text();
      const now = Date.now();
      const ev = icsParse(text, new Date(now - 35 * 86400000), new Date(now + 400 * 86400000));
      store.set('kairos_icsev', { when: now, ev });
      if (!silent) toast(`Načteno ${ev.length} událostí z Google kalendáře.`);
      if (S.tab === 'kalendar') renderCalendar();
      if (S.tab === 'nastaveni') renderSettings();
    } catch (e) { if (!silent) toast('Nepodařilo se načíst — zkontroluj adresu.'); }
  }
  function gcalLink(key, it) {
    const d = key.replace(/-/g, '');
    let dates;
    if (it.t) {
      const hm = it.t.replace(':', '');
      const start = d + 'T' + hm + '00';
      const eh = Math.min(23, +it.t.slice(0, 2) + 1);
      dates = start + '/' + d + 'T' + String(eh).padStart(2, '0') + it.t.slice(3) + '00';
    } else {
      const nx = new Date(key + 'T12:00:00'); nx.setDate(nx.getDate() + 1);
      dates = d + '/' + nx.toISOString().slice(0, 10).replace(/-/g, '');
    }
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(it.name) + '&dates=' + dates + (it.t ? '&ctz=' + encodeURIComponent(TZ) : '');
  }
  function pSave() { store.set('kairos_plan', plan); }
  function pAdd(key, item) { (plan[key] = plan[key] || []).push(item); plan[key].sort(cmpPlan); pSave(); }
  function pDel(key, id) { plan[key] = pGet(key).filter(x => x.id !== id); if (!plan[key].length) delete plan[key]; pSave(); }
  function cmpPlan(a, b) { if (!a.t && !b.t) return 0; if (!a.t) return 1; if (!b.t) return -1; return a.t.localeCompare(b.t); }
  const planMs = (key, t) => { const [y, m, d] = key.split('-').map(Number); const [hh, mm] = (t || '00:00').split(':').map(Number); return K.localToDate(y, m, d, hh, mm, TZ).getTime(); };

  const jGet = (key) => journal[key] || null;
  function jSet(key, patch) {
    const cur = journal[key] || {};
    const next = Object.assign({}, cur, patch);
    if (!next.note && next.rate == null && !(next.media && next.media.length)) delete journal[key]; else journal[key] = next;
    store.set('kairos_journal', journal);
  }

  const now = new Date();
  const np = K.tzParts(now, TZ);
  const S = { tab: 'kalendar', y: np.y, m: np.m, sel: { y: np.y, m: np.m, d: np.d }, natal: null, kpMap: {}, kpUpdated: null, kpError: null, dayCache: {}, evCache: {}, filter: 'vse', eph: { y: np.y, m: np.m }, installEvt: null, elek: { open: false, cat: null, sub: null, span: 30, results: null }, hsTheme: 'rok' };

  // ===================== pomocné =====================
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const fmtNum = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: d });
  const fmtOrb = (o) => fmtNum(o, 1).replace('.', ',') + '°';
  const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + fmtNum(Math.abs(x), 2);
  const observer = () => new A.Observer(+settings.loc.lat, +settings.loc.lon, +settings.loc.alt || 0);
  const activeProfile = () => profiles.find(p => p.id === activeId) || profiles[0];
  const rules = () => { const r = JSON.parse(JSON.stringify(K.DEFAULT_RULES)); r.thresholds.harm = +settings.rules.harm; r.thresholds.tense = +settings.rules.tense; r.vocHours = +settings.rules.vocHours; r.starOrb = +settings.rules.starOrb; return r; };
  const NATAL_ACC = { Sun: 'tvé Slunce', Moon: 'tvou Lunu', Mercury: 'tvůj Merkur', Venus: 'tvou Venuši', Mars: 'tvůj Mars', Jupiter: 'tvůj Jupiter', Saturn: 'tvůj Saturn', Uranus: 'tvůj Uran', Neptune: 'tvůj Neptun', Pluto: 'tvé Pluto', Asc: 'tvůj Ascendent', MC: 'tvůj životní směr (MC)' };
  const ASP_LOC = { conj: 'konjunkci', sextile: 'sextilu', square: 'kvadratuře', trine: 'trigonu', opposition: 'opozici' };
  const NATAL_LOC = { Sun: 'tvém Slunci', Moon: 'tvé Luně', Mercury: 'tvém Merkuru', Venus: 'tvé Venuši', Mars: 'tvém Marsu', Jupiter: 'tvém Jupiteru', Saturn: 'tvém Saturnu', Uranus: 'tvém Uranu', Neptune: 'tvém Neptunu', Pluto: 'tvém Plutu', Asc: 'tvém Ascendentu', MC: 'tvém MC' };
  const CONJ_HINT = { Sun: 'zviditelnění, soustředění světla', Mercury: 'myšlenky, zprávy, domluvy', Venus: 'laskavost, krása, vztah', Mars: 'energie, tlak, spěch', Jupiter: 'otevírání, růst, důvěra', Saturn: 'zkouška, struktura, zpomalení', Uranus: 'zvrat, probuzení, změna', Neptune: 'rozpouštění, zjemnění, mlha', Pluto: 'přerod, intenzita, hloubka', Moon: 'citové naladění' };
  const PLANET_COLOR = { Sun: 'var(--sun)', Moon: 'var(--moon)', Mercury: 'var(--merc)', Venus: 'var(--ven)', Mars: 'var(--mar)', Jupiter: 'var(--jup)', Saturn: 'var(--sat)' };
  // ---------- jednotná sada ikon (14×14, jedna tloušťka čáry, barva z okolí) ----------
  const _ic = (inner) => `<svg class="ico" viewBox="0 0 14 14" aria-hidden="true">${inner}</svg>`;
  const ICO = {
    '☉': _ic('<circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="7" r="1.3" fill="currentColor"/>'),
    '☽': _ic('<path d="M9.4 1.9a5.3 5.3 0 1 0 2.7 8.9 4.3 4.3 0 0 1-2.7-8.9Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'),
    '●': _ic('<circle cx="7" cy="7" r="4.6" fill="currentColor"/>'),
    '○': _ic('<circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/>'),
    '◐': _ic('<circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M7 2.4a4.6 4.6 0 0 0 0 9.2Z" fill="currentColor"/>'),
    '◇': _ic('<path d="M7 1.8 12.2 7 7 12.2 1.8 7Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'),
    '◆': _ic('<path d="M7 1.8 12.2 7 7 12.2 1.8 7Z" fill="currentColor"/>'),
    '✦': _ic('<path d="M7 .9c.5 3.4 2.7 5.6 6.1 6.1-3.4.5-5.6 2.7-6.1 6.1C6.5 9.7 4.3 7.5.9 7 4.3 6.5 6.5 4.3 7 .9Z" fill="currentColor"/>'),
    '✧': _ic('<path d="M7 1.6c.5 2.8 2.6 4.9 5.4 5.4-2.8.5-4.9 2.6-5.4 5.4C6.5 9.6 4.4 7.5 1.6 7 4.4 6.5 6.5 4.4 7 1.6Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>'),
    '△': _ic('<path d="M7 2.2 12.4 11.6H1.6Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'),
    '∅': _ic('<circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3.2 10.8 10.8 3.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'),
    '→': _ic('<path d="M2 7h9M8 3.6 11.4 7 8 10.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'),
    '◉': _ic('<circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="7" cy="7" r="2.4" fill="currentColor"/>'),
    '☄': _ic('<circle cx="9.6" cy="4.4" r="2.4" fill="currentColor"/><path d="M7.6 6.4 2 12M6.4 4.6 1.4 8.8M9.4 7.6 5.2 12.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>'),
    '♃': _ic('<path d="M3.2 4.2c1.2-2 4.3-1.9 4.3.6 0 1.7-1.8 2.3-3.4 4.4h7.2M8.9 3.4v9" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>'),
    '℞': _ic('<path d="M3.6 12V2.4h3.1a2.6 2.6 0 0 1 0 5.2H3.6m3.2 0 2.3 4.4M6.9 8.4l3.6 3.6M10.5 8.4l-3.6 3.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>'),
    '⟳': _ic('<path d="M11.4 7A4.4 4.4 0 1 1 9.8 3.6M9.4 1.6l.6 2.4-2.4.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>'),
    '☌': _ic('<circle cx="7" cy="8.8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9.3 6.5 12.4 3.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'),
    '☍': _ic('<circle cx="4" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="1.15"/><circle cx="10" cy="4" r="2.4" fill="none" stroke="currentColor" stroke-width="1.15"/><path d="M5.7 8.3 8.3 5.7" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/>'),
    '✺': _ic('<circle cx="7" cy="7" r="2.2" fill="currentColor"/><path d="M7 1.2v2.4M7 10.4v2.4M1.2 7h2.4M10.4 7h2.4M2.9 2.9l1.7 1.7M9.4 9.4l1.7 1.7M2.9 11.1l1.7-1.7M9.4 4.6l1.7-1.7" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>'),
    '✳': _ic('<path d="M7 1.6v10.8M2.3 4.3l9.4 5.4M2.3 9.7l9.4-5.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'),
  };
  const ico = (g) => ICO[g] || g;
  const CAT_ICON = { luna: '☽', zatmeni: '◉', slunce: '☉', planety: '♃', roje: '☄', hvezdy: '✦', komety: '✧', osobni: '✺' };
  const CAT_CZ = { vse: 'vše', luna: 'Luna', zatmeni: 'zatmění', slunce: 'Slunce', planety: 'planety', roje: 'roje', hvezdy: 'hvězdy', komety: 'komety', osobni: 'tvé cykly' };
  const TODAY_KEY = K.isoDate(np.y, np.m, np.d);

  function toast(msg) { const t = $('#toast'); t.textContent = tr(msg); t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600); }

  function moonSVG(phase, size, cls) {
    const r = size / 2 - 0.6, p = phase * Math.PI / 180;
    const f = (1 - Math.cos(p)) / 2, wax = phase < 180, rx = Math.abs(Math.cos(p)) * r, big = f > 0.5;
    const d = wax ? `M0,${-r} A${r},${r} 0 0 1 0,${r} A${rx},${r} 0 0 ${big ? 1 : 0} 0,${-r}Z` : `M0,${-r} A${r},${r} 0 0 0 0,${r} A${rx},${r} 0 0 ${big ? 0 : 1} 0,${-r}Z`;
    if (size < 28) return `<svg class="${cls || 'moon'}" viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle r="${r}" fill="var(--moon-dark)" stroke="var(--line2)" stroke-width=".6"/><path d="${d}" fill="var(--moon)"/></svg>`;
    // velký medailon: fotorealistická Luna (textura), fáze přes výřez terminátoru
    const uid = 'mn' + (moonSVG._i = (moonSVG._i || 0) + 1);
    return `<svg class="${cls || 'moon'}" viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <defs><clipPath id="${uid}c"><path d="${d}"/></clipPath><filter id="${uid}t"><feComponentTransfer><feFuncR type="linear" slope=".70" intercept=".145"/><feFuncG type="linear" slope=".70" intercept=".135"/><feFuncB type="linear" slope=".70" intercept=".115"/></feComponentTransfer></filter></defs>
      <circle r="${r + 0.5}" fill="none" stroke="rgba(240,216,152,.32)" stroke-width="1"/>
      <image href="moon-tex.png?v=1" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" opacity=".3"/>
      <circle r="${r}" fill="rgba(18,26,50,.5)"/>
      <g clip-path="url(#${uid}c)">
        <image href="moon-tex.png?v=1" filter="url(#${uid}t)" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}"/>
        <circle r="${r}" fill="none" stroke="rgba(255,250,230,.25)" stroke-width=".8"/>
      </g>
    </svg>`;
  }
  const phaseName = (ph) => ph < 10 || ph > 350 ? 'novoluní' : ph < 80 ? 'dorůstající srpek' : ph < 100 ? 'první čtvrt' : ph < 170 ? 'dorůstající Luna' : ph < 190 ? 'úplněk' : ph < 260 ? 'couvající Luna' : ph < 280 ? 'poslední čtvrt' : 'couvající srpek';

  // ===================== nativ =====================
  function computeNatal() {
    const p = activeProfile();
    try { S.natal = K.natalChart({ ...p, lat: +p.lat, lon: +p.lon, alt: +p.alt || 200, y: +p.y, m: +p.m, d: +p.d, hh: +p.hh, mm: +p.mm, tz: p.tz || TZ }, now); }
    catch (e) { console.error(e); S.natal = null; toast('Nativ se nepodařilo spočítat – zkontroluj data v Nastavení.'); }
    S.dayCache = {}; S.evCache = {};
    $('#profilePill').textContent = p.name || 'profil';
  }

  // ===================== NOAA =====================
  async function fetchText(url, key) {
    try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return await r.text(); }
    catch (e) { const r2 = await fetch('/api/noaa?src=' + key, { cache: 'no-store' }); if (!r2.ok) throw new Error('NOAA nedostupné'); return await r2.text(); }
  }
  async function loadKp(force) {
    const cached = store.get('kairos_kp', null);
    if (cached && cached.map && cached.updated && !force && Date.now() - cached.updated < 3 * 3600000) { S.kpMap = cached.map; S.kpUpdated = cached.updated; return; }
    if (cached && cached.map) { S.kpMap = cached.map; S.kpUpdated = cached.updated; }
    if (!navigator.onLine && !force) return;
    try {
      const [obs, fc, out] = await Promise.all([fetchText(NOAA.kpObs, 'kp').then(t => K.parseKpJson(JSON.parse(t))).catch(() => []), fetchText(NOAA.kpFc, 'kpf').then(t => K.parseKpJson(JSON.parse(t))).catch(() => []), fetchText(NOAA.outlook, 'outlook').then(t => K.parseOutlook(t)).catch(() => [])]);
      if (!obs.length && !fc.length && !out.length) throw new Error('prázdná odpověď');
      S.kpMap = K.mergeKp(obs, fc, out, TZ); S.kpUpdated = Date.now(); S.kpError = null;
      store.set('kairos_kp', { map: S.kpMap, updated: S.kpUpdated });
      S.dayCache = {};
      if (S.tab === 'kalendar') renderCalendar();
      if (S.tab === 'nastaveni') renderSettings();
    } catch (e) { S.kpError = 'Data NOAA se nepodařilo stáhnout (' + (e.message || e) + ').'; if (S.tab === 'nastaveni') renderSettings(); }
  }

  // ===================== analýza dne (cache) =====================
  function analyze(y, m, d) {
    const key = `${activeId}|${y}-${m}-${d}|${S.kpUpdated}|${JSON.stringify(settings.rules)}|${settings.loc.lat},${settings.loc.lon}`;
    if (S.dayCache[key]) return S.dayCache[key];
    const kp = settings.showKp ? S.kpMap[K.isoDate(y, m, d)] || null : null;
    const da = K.dayAnalysis(y, m, d, S.natal, observer(), TZ, kp, rules());
    S.dayCache[key] = da;
    return da;
  }
  function monthEvents(y, m) {
    const key = `m|${activeId}|${y}-${m}|${settings.loc.lat},${settings.loc.lon}`;
    if (S.evCache[key]) return S.evCache[key];
    const d0 = K.dayStart(y, m, 1, TZ), d1 = K.addDays(K.dayStart(y, m, K.daysInMonth(y, m), TZ), 1);
    const ev = K.skyEvents(d0, d1, observer(), S.natal, TZ).concat(cometEvents(d0, d1));
    S.evCache[key] = ev; return ev;
  }
  function cometEvents(d0, d1) {
    const out = [];
    for (const line of String(settings.comets || '').split('\n')) {
      const mt = line.match(/^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*\|\s*([^|]+?)\s*(?:\|\s*(.*))?$/);
      if (!mt) continue;
      const date = K.localToDate(+mt[1], +mt[2], +mt[3], 21, 0, TZ);
      if (date >= d0 && date < d1) out.push({ date, cat: 'komety', title: mt[4], note: mt[5] || '', custom: true });
    }
    return out;
  }

  const verTapState = { t: 0, n: 0 };
  // ===================== navigace =====================
  document.addEventListener('DOMContentLoaded', () => translateDOM(document.body));
  if (document.readyState !== 'loading') setTimeout(() => translateDOM(document.body), 0);
  function showTab(tab) {
    S.tab = tab;
    store.set('kairos_tab', tab);
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + tab));
    window.scrollTo({ top: 0 });
    const run = ({ kalendar: renderCalendar, ukazy: renderEvents, diar: renderJournal, nativ: renderNatal, nastaveni: renderSettings })[tab];
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => run()); else run();
  }
  // přepnutí už na dotek: první ťuknutí nesmí jen zastavit setrvačné rolování
  let tabTapAt = 0;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    tabTapAt = Date.now();
    if (S.tab !== t.dataset.tab) showTab(t.dataset.tab);
  }, { passive: true });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]'); if (t) { if (Date.now() - tabTapAt > 900) showTab(t.dataset.tab); return; }
    const act = e.target.closest('[data-act]'); if (act && act.tagName !== 'SELECT') { actions[act.dataset.act](act, e); }
  });

  const actions = {
    elekToggle() { S.elek.open = !S.elek.open; renderCalendar(); if (S.elek.open) setTimeout(() => { const p = $('#view-kalendar .eltoggle'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 40); },
    hsTheme(el) { S.hsTheme = el.dataset.t; renderNatal(); setTimeout(() => { const c = $('#view-nativ .card.hs'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); },
    // (hydratace médií se volá po renderCalendar níže)
    synSel(el) { S.synId = S.synId === el.dataset.id ? null : el.dataset.id; S.synForm = null; renderNatal(); },
    synAdd() { S.synForm = { mode: 'new' }; renderNatal(); setTimeout(() => { const f = $('#synForm [name=name]'); if (f) f.focus(); }, 40); },
    synEdit() { if (S.synId) { S.synForm = { mode: 'edit' }; renderNatal(); } },
    synCancel() { S.synForm = null; renderNatal(); },
    synDel() {
      const rec = S.synId && synPartners().find(q => q.id === S.synId);
      if (!rec || !confirm(`Odebrat ${rec.name || 'osobu'} ze srovnání?`)) return;
      store.set('kairos_partners', synPartners().filter(q => q.id !== S.synId)); S.synId = null; renderNatal();
    },
    synSave() {
      const f = $('#synForm'); if (!f) return;
      const date = $('[name=date]', f).value, time = $('[name=time]', f).value;
      if (!date || !time) { toast('Vyplň datum i čas.'); return; }
      const [y, m, d] = date.split('-').map(Number), [hh, mm] = time.split(':').map(Number);
      const rec = { name: $('[name=name]', f).value.trim() || 'Bez jména', y, m, d, hh, mm, place: $('[name=place]', f).value.trim(), lat: +$('[name=lat]', f).value, lon: +$('[name=lon]', f).value, tz: TZ };
      const list = synPartners();
      if (S.synForm.mode === 'edit' && S.synId) { const i = list.findIndex(q => q.id === S.synId); if (i >= 0) { rec.id = S.synId; list[i] = rec; } }
      else { rec.id = 'x' + Date.now().toString(36); list.push(rec); S.synId = rec.id; }
      store.set('kairos_partners', list); S.synForm = null; renderNatal(); toast('Uloženo.');
    },
    stripNav(el) { const st = document.querySelector('.strip-wrap .ahead'); if (st) st.scrollBy({ left: (+el.dataset.dir) * st.clientWidth * 0.7, behavior: 'smooth' }); },
    pastToggle() { S.showPast = !S.showPast; renderCalendar(); },
    verTap() {
      const t = Date.now();
      if (!verTapState.t || t - verTapState.t > 2500) verTapState.n = 0;
      verTapState.t = t; verTapState.n++;
      if (verTapState.n >= 7) { verTapState.n = 0; const on = !store.get('kairos_plus', false); store.set('kairos_plus', on); toast(on ? 'Plná verze aktivní ✧' : 'Základní verze.'); renderSettings(); }
    },
    synPrint() { const d = synDoc(); if (!d) return; const wnd = window.open('', '_blank'); if (wnd) { wnd.document.write(d); wnd.document.close(); } else { const url = URL.createObjectURL(new Blob([d], { type: 'text/html' })); const el = document.createElement('a'); el.href = url; el.download = 'horoskop-dvou-map.html'; el.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('Uloženo jako soubor — otevři ho a vytiskni.'); } },
    async synShare() {
      const d = synDoc(); if (!d) return;
      const tmp = document.createElement('div'); tmp.innerHTML = d.slice(d.indexOf('<div class="wrap">'));
      tmp.querySelectorAll('.noprint, footer, .hstag').forEach(el => el.remove());
      tmp.querySelectorAll('h2, h4, p').forEach(el => el.insertAdjacentText('afterend', '\n'));
      const text = tmp.textContent.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      try { if (navigator.share) { await navigator.share({ title: 'Horoskop dvou map', text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(text); toast('Text zkopírován — stačí vložit do zprávy.'); } catch (e) { prompt('Text horoskopu:', text); }
    },
    hsPrint() {
      const doc = horoscopeDoc(S.natal);
      const wnd = window.open('', '_blank');
      if (wnd) { wnd.document.write(doc); wnd.document.close(); }
      else {
        const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
        const a = document.createElement('a'); a.href = url; a.download = 'horoskop.html'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast('Horoskop stažen jako soubor — otevři ho a vytiskni.');
      }
    },
    elekCat(el) { const c = el.dataset.c; S.elek.cat = S.elek.cat === c ? null : c; S.elek.sub = null; electRun(); renderCalendar(); },
    elekSub(el) { S.elek.sub = el.dataset.s; electRun(); renderCalendar(); },
    elekSpan(el) { S.elek.span = +el.dataset.n; electRun(); renderCalendar(); },
    toMonth() { const t = $('#view-kalendar .monthbar'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    prevMonth() { S.m--; if (S.m < 1) { S.m = 12; S.y--; } renderCalendar(); actions.toMonth(); },
    nextMonth() { S.m++; if (S.m > 12) { S.m = 1; S.y++; } renderCalendar(); actions.toMonth(); },
    today() { S.y = np.y; S.m = np.m; S.sel = { y: np.y, m: np.m, d: np.d }; renderCalendar(); actions.toMonth(); },
    selDay(el) { S.sel = { y: +el.dataset.y, m: +el.dataset.m, d: +el.dataset.d }; renderCalendar(); $('#dayDetail') && $('#dayDetail').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    ephPrev() { S.eph.m--; if (S.eph.m < 1) { S.eph.m = 12; S.eph.y--; } renderEphemeris(); },
    ephNext() { S.eph.m++; if (S.eph.m > 12) { S.eph.m = 1; S.eph.y++; } renderEphemeris(); },
    ephCsv() { downloadCsv(); },
    filter(el) { S.filter = el.dataset.f; renderEvents(); },
    saveProfile() { saveProfileForm(); },
    newProfile() {
      const FREE_PROFILES = 2;
      if (!store.get('kairos_plus', false) && profiles.length >= FREE_PROFILES) { toast('Dvě osoby jsou v základu. Další přinese plná verze — připravujeme.'); return; }
      const id = 'p' + Date.now().toString(36); profiles.push({ id, name: 'Nový profil', y: 1990, m: 1, d: 1, hh: 12, mm: 0, place: 'Kroměříž', lat: 49.2979, lon: 17.3931, alt: 200, tz: TZ }); activeId = id; persistProfiles(); computeNatal(); renderSettings(); toast('Profil založen – vyplň údaje a ulož.'); },
    switchProfile(el) { activeId = el.value; store.set('kairos_active', activeId); computeNatal(); renderSettings(); toast('Profil přepnut: ' + activeProfile().name); },
    deleteProfile() { if (profiles.length < 2) { toast('Poslední profil nejde smazat.'); return; } if (!confirm('Smazat profil ' + activeProfile().name + '?')) return; profiles = profiles.filter(p => p.id !== activeId); activeId = profiles[0].id; persistProfiles(); computeNatal(); renderSettings(); },
    locate(el) {
      if (!navigator.geolocation) { toast('Tvůj prohlížeč polohu neumí — vyplň souřadnice ručně.'); return; }
      const orig = el.textContent; el.disabled = true; el.textContent = 'Zjišťuji…';
      navigator.geolocation.getCurrentPosition((pos) => {
        const f = $('#locForm');
        $('[name=llat]', f).value = pos.coords.latitude.toFixed(4);
        $('[name=llon]', f).value = pos.coords.longitude.toFixed(4);
        if (pos.coords.altitude != null && !isNaN(pos.coords.altitude)) $('[name=lalt]', f).value = Math.round(pos.coords.altitude);
        el.disabled = false; el.textContent = orig;
        toast('Souřadnice vyplněny — pojmenuj místo a ulož.');
      }, (err) => {
        el.disabled = false; el.textContent = orig;
        const m = err.code === 1 ? 'Povolení k poloze zamítnuto.' : err.code === 3 ? 'Zjišťování polohy trvalo příliš dlouho.' : 'Polohu se nepodařilo zjistit.';
        toast(m + ' Vyplň souřadnice ručně.');
      }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
    },
    pickPlace(el) {
      const pl = PLACES[+el.dataset.i];
      settings.loc = { name: pl.name, lat: pl.lat, lon: pl.lon, alt: pl.alt };
      persistSettings(); S.dayCache = {}; S.evCache = {}; applyTheme(); renderSettings();
      toast('Místo: ' + pl.name + '.');
    },
    saveLoc() { const f = $('#locForm'); settings.loc = { name: $('[name=lname]', f).value.trim() || 'místo', lat: +$('[name=llat]', f).value, lon: +$('[name=llon]', f).value, alt: +$('[name=lalt]', f).value || 0 }; persistSettings(); S.dayCache = {}; S.evCache = {}; applyTheme(); renderSettings(); toast('Místo uloženo — časy a viditelnost přepočítány.'); },
    saveRules() { const f = $('#rulesForm'); settings.rules = { harm: +$('[name=harm]', f).value, tense: +$('[name=tense]', f).value, vocHours: +$('[name=voc]', f).value, starOrb: +$('[name=starOrb]', f).value }; persistSettings(); S.dayCache = {}; toast('Pravidla uložena.'); },
    toggleClouds(el) { settings.clouds = !(settings.clouds === true); persistSettings(); drawClouds(); renderSettings(); },
    addPlan(el) {
      const key = el.dataset.k;
      const wrap = el.closest('.planadd');
      const raw = $('[name=ptime]', wrap).value.trim();
      let t = null;
      if (raw) {
        const mt = raw.match(/^(\d{1,2})[:.,h ]?(\d{2})?$/);
        const hh = mt ? +mt[1] : -1, mm = mt && mt[2] ? +mt[2] : 0;
        if (!mt || hh > 23 || mm > 59) { toast('Čas zadej jako 14:30 (nebo nech prázdné).'); return; }
        t = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
      }
      const name = $('[name=pname]', wrap).value.trim();
      if (!name) { toast('Napiš, co tě čeká.'); return; }
      pAdd(key, { id: 'p' + Date.now().toString(36), t, name });
      $('[name=pname]', wrap).value = ''; $('[name=ptime]', wrap).value = '';
      if (S.tab === 'diar') renderJournal(); else renderCalendar();
    },
    delPlan(el) { pDel(el.dataset.k, el.dataset.id); if (S.tab === 'diar') renderJournal(); else renderCalendar(); },
    rate(el) {
      const key = el.dataset.k, v = +el.dataset.v;
      const cur = jGet(key);
      jSet(key, { rate: cur && cur.rate === v ? null : v });
      if (S.tab === 'diar') renderJournal(); else renderCalendar();
    },
    noteBlur(el) { jSet(el.dataset.k, { note: el.value.trim() }); },
    sdAdd() {
      const name = $('#sdName').value.trim(), date = $('#sdDate').value;
      if (!name || !date) { toast('Vyplň jméno i datum.'); return; }
      const [y, m, d] = date.split('-').map(Number);
      const once = $('#sdRep') && $('#sdRep').value === 'once';
      const list = sdAll();
      list.push({ id: 's' + Date.now().toString(36), name, d, m, r: once ? 0 : 1, y: once ? y : (y > 1902 && y < np.y ? y : (y === np.y ? null : y)), t: $('#sdType').value });
      store.set('kairos_days', list); renderSettings(); toast('Přidáno — uvidíš ho ráno v kartě Dnes.');
    },
    sdDel(el) { store.set('kairos_days', sdAll().filter(x => x.id !== el.dataset.id)); renderSettings(); },
    tvHelp() { S.tvHelp = !S.tvHelp; renderCalendar(); },
    orgHelp() { S.orgHelp = !S.orgHelp; renderCalendar(); },
    goNatal() { showTab('nastaveni'); setTimeout(() => { const f = $('#profileForm'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80); },
    setLang(el) { settings.lang = el.value; persistSettings(); if (settings.lang === 'sk') { translateDOM(document.body); } else { restoreCzechDOM(document.body); } showTab(S.tab); },
    setCountry(el) { settings.country = el.value; persistSettings(); for (const k in _holCache) delete _holCache[k]; S.dayCache = {}; renderSettings(); },
    async shareApp() {
      const url = location.origin + location.pathname.replace(/index\.html$/, '');
      const text = 'Nebeský kompas — tvůj hvězdný kalendář. Co je dnes ve hře podle postavení planet, Luny a tvých hvězd.';
      try {
        if (navigator.share) { await navigator.share({ title: 'Nebeský kompas', text, url }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(url); toast('Odkaz zkopírován — stačí ho vložit do zprávy.'); }
      catch (e) { prompt('Odkaz na Kompas:', url); }
    },
    toggleKp() { settings.showKp = !settings.showKp; persistSettings(); S.dayCache = {}; renderSettings(); },
    guide() { S.guide = true; renderSettings(); window.scrollTo({ top: 0 }); },
    goGuide() { S.guide = true; showTab('nastaveni'); },
    guideBack() { S.guide = false; renderSettings(); window.scrollTo({ top: 0 }); },
    goArcs() { S.natalView = 'prochazis'; showTab('nativ'); },
    natalView(el) { S.natalView = el.dataset.v; renderNatal(); window.scrollTo({ top: 0 }); },
    lookback() { const v = ($('#lookbackDate') || {}).value; if (!v) return; S.lookback = v; S.natalView = 'prochazis'; renderNatal(); setTimeout(() => { const el = $('#view-nativ .lookback'); if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 40); },
    toggleNum() { settings.numerology = settings.numerology === false; persistSettings(); S.dayCache = {}; renderSettings(); },
    toggleOrg() { settings.organs = settings.organs === false; persistSettings(); renderCalendar(); renderSettings(); },
    evWhat(el) { const b = el.closest('.ev'); if (b) b.classList.toggle('open'); },
    plSel(el) { S.plSel = el.dataset.k; renderJournal(); },
    plPrev() { const t = (S.plSel || TODAY_KEY).split('-').map(Number); let y = S.plY || t[0], m = (S.plM || t[1]) - 1; if (m < 1) { m = 12; y--; } S.plY = y; S.plM = m; renderJournal(); },
    plNext() { const t = (S.plSel || TODAY_KEY).split('-').map(Number); let y = S.plY || t[0], m = (S.plM || t[1]) + 1; if (m > 12) { m = 1; y++; } S.plY = y; S.plM = m; renderJournal(); },
    plToday() { S.plSel = TODAY_KEY; const t = TODAY_KEY.split('-').map(Number); S.plY = t[0]; S.plM = t[1]; renderJournal(); },
    fbKind(el) { S.fbKind = el.dataset.k; renderSettings(); },
    fbBody() {
      const t = ($('#fbText') && $('#fbText').value || '').trim();
      const info = `\n\n—\nNebeský kompas ${VERSION} · ${S.fbKind || 'nápad'} · ${new Date().toLocaleString('cs-CZ')}\n${navigator.userAgent}`;
      return { t, body: t + info };
    },
    fbSend() {
      const { t, body } = actions.fbBody();
      if (!t) { toast('Napiš prosím pár vět.'); return; }
      const subj = `Nebeský kompas — ${S.fbKind || 'nápad'}`;
      const url = `mailto:${FEEDBACK_MAIL}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
      if (window.__navSpy) { window.__navSpy(url); return; }
      location.href = url;
    },
    async fbCopy() {
      const { t, body } = actions.fbBody();
      if (!t) { toast('Napiš prosím pár vět.'); return; }
      try { await navigator.clipboard.writeText(body); toast(`Zkopírováno — pošli na ${FEEDBACK_MAIL}`); }
      catch (e) { toast(`Pošli prosím na ${FEEDBACK_MAIL}`); }
    },
    cycHelp() { S.cycHelp = !S.cycHelp; renderJournal(); },
    cycMark(el) {
      const k = el.dataset.k, l = cycAll();
      cycSet(l.includes(k) ? l.filter(x => x !== k) : [...l, k]);
      renderJournal();
      toast(cycAll().includes(k) ? 'Zapsáno — fáze se přepočítaly.' : 'Zrušeno.');
    },
    cycToggle() { store.set('kairos_cyc_on', !cycOn()); renderSettings(); },
    goNatal() { showTab('nativ'); },
    ptOpen(el) { S.ptOpen = S.ptOpen === el.dataset.k ? null : el.dataset.k; if (S.tab === 'nativ') renderNatal(); else renderCalendar(); },
    goDiar(el) { const k = el.dataset.k, [yy, mm] = k.split('-').map(Number); S.plSel = k; S.plY = yy; S.plM = mm; showTab('diar'); setTimeout(() => { const t = $('#view-diar .pcal'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 140); },
    evPastOn() { S.evPast = true; renderEvents(); },
    evPastOff() { S.evPast = false; renderEvents(); },
    evAll() { S.evAll = true; renderEvents(); },
    evLess() { S.evAll = false; renderEvents(); },
    sdLater() { store.set('kairos_days_seen', true); renderCalendar(); },
    sdGo() { store.set('kairos_days_seen', true); showTab('nastaveni'); setTimeout(() => { const el = $('#sdName'); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } }, 140); },
    icsSave() { const v = $('#icsUrl'); if (!v || !v.value.trim()) { toast('Vlož adresu.'); return; } store.set('kairos_ics', v.value.trim()); icsRefresh(false); },
    icsOff() { store.set('kairos_ics', ''); store.set('kairos_icsev', null); renderSettings(); toast('Google kalendář odpojen.'); },
    async bkExport() {
      toast('Připravuji zálohu…');
      const data = { app: 'kairos', v: 1, when: new Date().toISOString(), ls: {}, media: [] };
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('kairos')) data.ls[k] = localStorage.getItem(k);
      }
      const db = await MDB.open();
      if (db) {
        const [keys, vals] = await new Promise((res) => {
          const st = db.transaction('m').objectStore('m');
          const rq1 = st.getAllKeys(), rq2 = st.getAll();
          let done = 0, out = [null, null];
          rq1.onsuccess = () => { out[0] = rq1.result; if (++done === 2) res(out); };
          rq2.onsuccess = () => { out[1] = rq2.result; if (++done === 2) res(out); };
          rq1.onerror = rq2.onerror = () => res([[], []]);
        });
        for (let i = 0; i < (keys || []).length; i++) {
          const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(vals[i]); });
          if (b64) data.media.push({ id: keys[i], d: b64 });
        }
      }
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kairos-zaloha-' + K.isoDate(...Object.values(K.tzParts(new Date(), TZ)).slice(0, 3)) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      toast(`Záloha stažena (${data.media.length} příloh).`);
    },
    async jmDel(el) {
      if (!confirm('Smazat přílohu?')) return;
      const k = el.dataset.k, id = el.dataset.id;
      await MDB.del(id);
      const e = jGet(k) || {};
      jSet(k, { media: (e.media || []).filter(m => m.id !== id) });
      if (S.tab === 'diar') renderJournal(); else renderCalendar();
    },
    jmView(el) {
      const src = el.src; if (!src) return;
      const ov = document.createElement('div'); ov.className = 'jview';
      ov.innerHTML = `<img src="${src}" alt="">`;
      ov.addEventListener('click', () => ov.remove());
      document.body.appendChild(ov);
    },
    async jRec(el) {
      const key = el.dataset.k;
      if (recState) { recState.rec.stop(); return; }
      if (!navigator.mediaDevices || !window.MediaRecorder) { toast('Nahrávání tu prohlížeč nepodporuje.'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = (ev) => chunks.push(ev.data);
        rec.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          clearTimeout(recState && recState.tm); recState = null;
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          const id = 'a' + Date.now().toString(36);
          if (await MDB.put(id, blob)) {
            const e = jGet(key) || {};
            jSet(key, { media: [...(e.media || []), { id, t: 'a' }] });
            toast('Nahrávka uložena.');
          } else toast('Uložení se nepovedlo.');
          if (S.tab === 'diar') renderJournal(); else renderCalendar();
        };
        rec.start();
        recState = { rec, key, tm: setTimeout(() => rec.stop(), 5 * 60 * 1000) };
        if (S.tab === 'diar') renderJournal(); else renderCalendar();
        toast('Nahrávám… (max 5 minut)');
      } catch (e) { toast('Mikrofon se nepodařilo otevřít.'); }
    },
    saveNote(el) {
      const ta = $('#jNote'); if (!ta) return;
      jSet(ta.dataset.k, { note: ta.value.trim() });
      toast('Zapsáno.');
      if (S.tab === 'diar') renderJournal(); else renderCalendar();
    },
    jumpDay(el) { S.sel = { y: +el.dataset.y, m: +el.dataset.m, d: +el.dataset.d }; S.y = S.sel.y; S.m = S.sel.m; showTab('kalendar'); setTimeout(() => { const n = $('#dayDetail'); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 140); },
    exportJournal() {
      const rows = Object.keys(journal).sort();
      const payload = { app: 'nebesky-kalendar', version: VERSION, exported: new Date().toISOString(), profile: activeProfile().name, entries: journal, plan: plan };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `diar-${K.isoDate(np.y, np.m, np.d)}.json`; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      toast(rows.length + ' zápisů uloženo do souboru.');
    },
    exportJournalCsv() {
      const rows = Object.keys(journal).sort();
      let csv = 'datum;hodnoceni;slovo;skore;barva;zapis\n';
      for (const k of rows) {
        const [y, m, d] = k.split('-').map(Number);
        const da = analyze(y, m, d), e = journal[k];
        const r = RATES.find(x => x.v === e.rate);
        csv += `${k};${e.rate != null ? e.rate : ''};${r ? r.label : ''};${String(da.score).replace('.', ',')};${da.color};"${(e.note || '').replace(/"/g, '""')}"\n`;
      }
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `diar-${K.isoDate(np.y, np.m, np.d)}.csv`; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    importJournal() { const i = $('#jFile'); if (i) i.click(); },
    closeLegend(el) { const d = el.closest('details'); if (d) { d.removeAttribute('open'); d.scrollIntoView({ block: 'nearest' }); } },
    pickBg(el) { settings.bg = el.dataset.b; persistSettings(); applyTheme(); renderSettings(); },
    pickTheme(el) {
      settings.theme = el.dataset.t;
      settings.themeMark = settings.theme === 'auto' ? null : themeForNow();
      persistSettings(); applyTheme(); renderSettings();
      toast(settings.theme === 'auto' ? 'Obloha se mění podle denní doby.'
        : 'Obloha: ' + THEMES[settings.theme] + (settings.themeHold === 'once' ? ' — do nejbližší změny.' : '.'));
    },
    pickHold(el) {
      settings.themeHold = el.dataset.h;
      if (settings.theme !== 'auto') settings.themeMark = themeForNow();
      persistSettings(); applyTheme(); renderSettings();
    },
    saveComets() { settings.comets = $('#cometsForm textarea').value; persistSettings(); S.evCache = {}; toast('Seznam uložen.'); },
    refreshKp(el) { el.disabled = true; loadKp(true).finally(() => { el.disabled = false; renderSettings(); toast(S.kpError ? S.kpError : 'Kosmické počasí aktualizováno.'); }); },
    clearCache() { store.del('kairos_kp'); S.kpMap = {}; S.kpUpdated = null; S.dayCache = {}; S.evCache = {}; K.clearCache(); if (navigator.serviceWorker) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.update())); toast('Mezipaměť vymazána.'); renderSettings(); },
    install() { if (S.installEvt) { S.installEvt.prompt(); } else toast('V prohlížeči zvol „Přidat na plochu“ (Safari: Sdílet → Přidat na plochu).'); },
  };
  function persistProfiles() { store.set('kairos_profiles', profiles); store.set('kairos_active', activeId); }
  function persistSettings() { store.set('kairos_settings', settings); }

  // ===================== KALENDÁŘ =====================
  function renderCalendarRaw() {
    const v = $('#view-kalendar');
    if (!S.natal) { v.innerHTML = noNatalHTML('barvu každého dne, nejbližší chvíle a rytmus dne'); return; }
    const { y, m } = S;
    const n = K.daysInMonth(y, m);
    const offset = (K.tzParts(K.dayStart(y, m, 1, TZ), TZ).wd + 6) % 7;
    const evs = monthEvents(y, m);
    const evByDay = {};
    for (const e of evs) { const k = K.dateKey(e.date, TZ); (evByDay[k] = evByDay[k] || []).push(e); }
    const cellArr = [];
    for (let i = 0; i < offset; i++) cellArr.push({ key: null, html: '<div class="cell empty"></div>' });
    let cells = '';
    for (let d = 1; d <= n; d++) {
      const da = analyze(y, m, d);
      const key = K.isoDate(y, m, d);
      const dayEv = evByDay[key] || [];
      const alpha = Math.min(0.46, 0.14 + Math.abs(da.score) / 6 * 0.32).toFixed(2);
      const isToday = key === TODAY_KEY, isSel = S.sel.y === y && S.sel.m === m && S.sel.d === d;
      // jen jedna značka: to nejvýraznější, co ten den je
      let mk = '';
      const q = da.quarters.find(q => q.quarter === 0 || q.quarter === 2);
      if (dayEv.some(e => e.eclipse)) mk = '<span class="ec" title="zatmění">◉</span>';
      else if (da.resonance.length || dayEv.some(e => e.resonance)) mk = '<span class="st" title="tvá hvězda">✦</span>';
      else if (q) mk = `<span class="${q.quarter === 0 ? 'nm' : 'fm'}" title="${q.quarter === 0 ? 'novoluní' : 'úplněk'}">${q.quarter === 0 ? '●' : '○'}</span>`;
      else if (da.kp && da.kp.kp >= 5) mk = '<span class="kp" title="geomagnetická bouře">⚡</span>';
      const hasJ = !!jGet(key);
      const hasP = pGet(key).length > 0;
      const isPast = key < TODAY_KEY;
      cellArr.push({ key, html: `<button type="button" class="cell ${da.color} ${isToday ? 'today' : ''} ${isSel ? 'sel' : ''} ${holidayFor(y, m, d) && holidayFor(y, m, d).f ? 'free' : ''} ${isPast ? 'past' : ''} ${hasJ ? 'noted' : ''} ${hasP ? 'planned' : ''}" style="--a:${alpha}" data-act="selDay" data-y="${y}" data-m="${m}" data-d="${d}" aria-label="${d}. ${K.MONTH_GEN[m - 1]} — ${TX.dayWord(da)}">
        <span class="d">${d}</span><span class="mk">${mk}</span>${(() => { const h = holidayFor(y, m, d); return h ? `<span class="hol ${h.f ? 'free' : 'trad'}" title="${esc(h.n)}"></span>` : ''; })()}${sdForDay(y, m, d).length ? '<span class="sdmark" title="významný den">🎂</span>' : ''}${gEvByDay(key).length ? '<span class="gdot" title="událost z Google kalendáře"></span>' : ''}${hasP || hasJ ? `<span class="marks">${hasP ? `<span class="pc" title="zapsané plány">${pGet(key).length}</span>` : ''}${hasJ ? '<span class="pen" title="zápis dne">✎</span>' : ''}</span>` : ''}${moonSVG(da.phaseAngle, 12, q ? (q.quarter === 2 ? 'moon full' : 'moon new') : 'moon')}
      </button>` });
    }
    // uplynulé celé týdny aktuálního měsíce sbalit
    const nowP = K.tzParts(new Date(), TZ);
    const isCurMonth = y === nowP.y && m === nowP.m;
    let hiddenDays = 0, pastBar = '';
    const weeks = [];
    for (let i = 0; i < cellArr.length; i += 7) weeks.push(cellArr.slice(i, i + 7));
    const todayWk = weeks.findIndex(wk => wk.some(c => c.key === TODAY_KEY));
    for (let wi = 0; wi < weeks.length; wi++) {
      const wk = weeks[wi];
      const real = wk.filter(c => c.key);
      const wholePast = isCurMonth && real.length && real.every(c => c.key < TODAY_KEY) && wi < todayWk - 1;
      if (wholePast && !S.showPast) { hiddenDays += real.length; continue; }
      cells += wk.map(c => c.html).join('');
    }
    if (isCurMonth && (hiddenDays || S.showPast)) pastBar = `<div class="pastbar"><button type="button" class="chip small" data-act="pastToggle">${S.showPast ? '▴ skrýt uplynulé dny' : `▾ zobrazit ${hiddenDays} uplynulých dnů`}</button></div>`;
    v.innerHTML = `
      ${natalSumHTML(true)}
      ${todayHeroHTML()}
      ${aheadHTML()}
      ${todayReadHTML()}
      <div class="monthbar">
        <button class="navbtn" data-act="prevMonth" aria-label="Předchozí měsíc">‹</button>
        <div class="mn">${K.MONTH_CZ[m - 1].charAt(0).toUpperCase() + K.MONTH_CZ[m - 1].slice(1)}<em>${y}</em></div>
        <div class="row"><button type="button" class="btn ghost small" data-act="today">Dnes</button><button class="navbtn" data-act="nextMonth" aria-label="Další měsíc">›</button></div>
      </div>
      ${!store.get('kairos_days_seen', false) && !sdAll().length ? `<div class="card sdask"><p style="margin:2px 0 8px">Chceš si zapsat <b>významné dny</b> — narozeniny, výročí, důležitá data? Ráno ti pak zlatě zasvítí v kartě Dnes.</p><div class="row"><button type="button" class="btn primary small" data-act="sdGo">Přidat dny</button><button type="button" class="btn ghost small" data-act="sdLater">Teď ne</button></div></div>` : ''}
      ${pastBar}
      <div class="weekdays"><span>Po</span><span>Út</span><span>St</span><span>Čt</span><span>Pá</span><span>So</span><span>Ne</span></div>
      <div class="grid">${cells}</div>
      <div class="legend"><span><i style="background:linear-gradient(90deg,#8FE8BE,#2F9E72)"></i>plyne to</span><span><i style="background:linear-gradient(90deg,#FFB598,#C9563A)"></i>větší tření</span><span>✦ tvá hvězda</span><span>◉ zatmění</span><span>● ○ novoluní / úplněk</span><span style="color:var(--gold)">1</span><span style="margin-left:-8px">zapsané plány</span><span style="color:var(--gold)">✎</span><span style="margin-left:-8px">zápis dne</span></div>
      <details class="legend-more"><summary>Co značky znamenají?</summary>
        <p><b style="color:#8FE8BE"><i class="lg" style="background:linear-gradient(90deg,#8FE8BE,#2F9E72)"></i>Zelený proužek</b> — den, kdy jsou energie více v souladu s tvým osobním horoskopem. Věci mohou jít přirozeněji a s menším úsilím.</p>
        <p><b style="color:#FFB598"><i class="lg" style="background:linear-gradient(90deg,#FFB598,#C9563A)"></i>Lososový proužek</b> — den s větším odporem nebo napětím. Některé věci mohou vyžadovat více energie, trpělivosti a odpočinku.</p>
        <p><b>${ico('✦')} Tvá hvězda</b> — tento den se tě postavení Luny nebo planet dotýká osobně. Něco může být výraznější, důležitější nebo citlivější právě pro tebe. Hvězda na zeleném dni značí příznivý čas pro důležité kroky. Hvězda na lososovém dni znamená silné osobní téma, ale zároveň náročnější energii — spíš vnímej, co se děje, než abys tlačil/a na výsledek.</p>
        <p><b>${ico('◉')} Zatmění</b> — energeticky výrazné novoluní nebo úplněk. Tradičně se doporučuje nechat velká rozhodnutí a nové začátky na jiný den.</p>
        <p><b>${ico('●')} / ${ico('○')} Novoluní a úplněk</b> — novoluní podporuje nové záměry a začátky, úplněk přináší vyvrcholení, uvědomění a završení.</p>
        <p>Barvy i značky jsou vypočítané podle tvého osobního horoskopu, takže u každého člověka mohou vycházet jinak. Po rozkliknutí konkrétního dne se dozvíš, proč má právě takové označení.</p>
        <button type="button" class="legend-close" data-act="closeLegend">▲ &nbsp;Sbalit vysvětlivky</button>
      </details>

      <div class="day" id="dayDetail">${dayDetailHTML(S.sel.y, S.sel.m, S.sel.d, evByDay)}</div>
      ${electHTML()}
      ${arcHTML()}`;
    const ar = v.querySelector('.arc');
    if (ar) ar.addEventListener('toggle', () => {
      S.arcOpen = ar.open;
      if (ar.open) setTimeout(() => ar.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
    });
  }

  // ---------- Oblouk dne: sedm kroků přirozeným životem ----------
  const ARC_STEPS = [
    { n: 1, ch: 'Kořenová čakra', t: 'návrat do těla', col: CHAKRA_COL.root,
      p: 'Probuzení. Dřív než přijde jakákoli myšlenka na den, je tu tíha těla v posteli, teplota vzduchu, zvuky domu. Vstávání, chodidla na podlaze, gravitace. Základní potřeby, bezpečí, jistota, že tohle místo je moje. <b>Jsem tady.</b>' },
    { n: 2, ch: 'Sakrální čakra', t: 'rozhýbání života', col: CHAKRA_COL.sacral,
      p: 'Voda, toaleta, hygiena, protažení. Organismus se rozproudí, krev se rozejde do končetin, přichází hlad a s ním první jídlo. Smysly se otevírají, tělo si vzpomíná, že je živé a že ho život baví.' },
    { n: 3, ch: 'Solar plexus', t: 'vykročení do světa', col: CHAKRA_COL.solar,
      p: 'Činnost. Rozhodování, práce rukama i hlavou, obstarávání, tvoření, prosazení vlastní vůle. Člověk bere den do ruky a nechává na něm stopu. <b>Něco dnes udělám.</b>' },
    { n: 4, ch: 'Srdeční čakra', t: 'setkání', col: CHAKRA_COL.heart,
      p: 'Předěl celého dne. Společné jídlo, rodina, blízkost, spolupráce, péče, chvíle venku mezi stromy. Člověk přestává být jen <em>já konající</em> a vzniká <b>my</b>.' },
    { n: 5, ch: 'Krční čakra', t: 'sdílení a předávání', col: CHAKRA_COL.throat,
      p: 'Rozhovory, domlouvání, vyprávění, zpěv, učení, předávání zkušeností. V tradiční komunitě sem patří pozdní odpoledne a podvečer, kdy se práce utlumuje a lidé jsou spolu.' },
    { n: 6, ch: 'Třetí oko', t: 'vnitřní pohled', col: CHAKRA_COL.brow,
      p: 'Se stmíváním ubývá vnějšího jednání. Reflexe dne, ticho, pozorování ohně nebo oblohy, modlitba, meditace, imaginace, intuice. Sny začínají ještě před usnutím. Pozornost jde zvenku dovnitř.' },
    { n: 7, ch: 'Korunní čakra', t: 'odevzdání', col: CHAKRA_COL.crown,
      p: 'Spánek. Opuštění běžné identity, kontroly a jednání. Člověk už nic nevytváří ani neřeší. Rozpouští se do něčeho většího a ráno se z toho beztvarého vrací zpátky dolů do těla, do prostoru, do konkrétního života.' },
  ];
  function arcHTML() {
    const steps = ARC_STEPS.map(x => `<div class="arcstep">
      <span class="arcdot" style="background:${x.col};box-shadow:0 0 0 4px ${x.col}22"></span>
      <div class="arcbody"><h4><span class="arcnum">${x.n}</span>${x.ch} <em>— ${x.t}</em></h4><p>${x.p}</p></div>
    </div>`).join('');
    return `<details class="arc"${S.arcOpen ? ' open' : ''}>
      <summary><span class="arcsum"><img class="arcthumb" src="cyklus-dne.webp?v=1" alt="" loading="lazy"><span class="arctitle">Čakrový cyklus dne<em>sedm poloh od probuzení k odevzdání</em></span><span class="arcchev" aria-hidden="true">›</span></span></summary>
      <div class="arcin">
        <div class="arcwheel"><img src="cyklus-dne.webp?v=1" alt="Kruh dne nad krajinou od svítání k noci" loading="lazy"><svg class="arcsvg" viewBox="0 0 1023 1537" aria-hidden="true"><circle cx="177" cy="807" r="42" fill="#E8503A" opacity=".2"/><circle cx="177" cy="807" r="26" fill="#E8503A" opacity=".32"/><circle cx="177" cy="807" r="16" fill="#E8503A"/><text x="111" y="823" class="arcn">1</text><circle cx="195" cy="590" r="42" fill="#F5762A" opacity=".2"/><circle cx="195" cy="590" r="26" fill="#F5762A" opacity=".32"/><circle cx="195" cy="590" r="16" fill="#F5762A"/><text x="133" y="563" class="arcn">2</text><circle cx="339" cy="431" r="42" fill="#F5C542" opacity=".2"/><circle cx="339" cy="431" r="26" fill="#F5C542" opacity=".32"/><circle cx="339" cy="431" r="16" fill="#F5C542"/><text x="305" y="372" class="arcn">3</text><circle cx="511" cy="386" r="52" fill="#6FCB5A" opacity=".2"/><circle cx="511" cy="386" r="32" fill="#6FCB5A" opacity=".32"/><circle cx="511" cy="386" r="20" fill="#6FCB5A"/><text x="511" y="318" class="arcn">4</text><circle cx="700" cy="446" r="42" fill="#6FB6E8" opacity=".2"/><circle cx="700" cy="446" r="26" fill="#6FB6E8" opacity=".32"/><circle cx="700" cy="446" r="16" fill="#6FB6E8"/><text x="739" y="390" class="arcn">5</text><circle cx="847" cy="715" r="42" fill="#9B5FD8" opacity=".2"/><circle cx="847" cy="715" r="26" fill="#9B5FD8" opacity=".32"/><circle cx="847" cy="715" r="16" fill="#9B5FD8"/><text x="911" y="669" class="arcn">6</text><circle cx="529" cy="1065" r="42" fill="#B98BF0" opacity=".2"/><circle cx="529" cy="1065" r="26" fill="#B98BF0" opacity=".32"/><circle cx="529" cy="1065" r="16" fill="#B98BF0"/><text x="533" y="1133" class="arcn">7</text><text x="62" y="778" class="arcw" text-anchor="start">východ</text><text x="961" y="778" class="arcw" text-anchor="end">západ</text></svg></div>
        <p class="arclede">Když se den poskládá podle přirozených činností člověka, vychází docela čistý oblouk — a je to týž oblouk, jaký nad hlavou opisuje Slunce. Pozornost vychází s tělem na východě, kulminuje v setkání a klesá k odevzdání ve spánku, nejhlouběji pod obzorem. Ráno pak vyjde znovu.</p>
        <div class="arcsteps">${steps}</div>
        <p class="arcnote">Nejzajímavější je čtvrtý krok. Není to další činnost v řadě, je to zlom celé křivky: první tři polohy jsou hlavně <em>já v těle</em> a <em>já ve světě</em>, pátá až sedmá vedou k jemnějším vrstvám vědomí. Srdce je most, kterým se přechází z <em>já</em> do <em>my</em>. Jóga zná na dráze sušumny tři uzly, <b>granthi</b>, a druhý z nich leží právě na úrovni srdce — jako místo, kde přechod stojí něco navíc.</p>
        <p class="arcline">Přijdu do těla&nbsp;→ ožiju&nbsp;→ konám&nbsp;→ propojuji&nbsp;se&nbsp;→ sdílím&nbsp;→ nahlížím&nbsp;dovnitř&nbsp;→ odevzdávám&nbsp;se.</p>
        <p class="arcnote">Je to posloupnost života, která se teprve druhotně může projevit v denním čase. Skutečný den se mezi polohami vrací a přeskakuje — v poledne jsi u srdce, odpoledne zpátky v konání, večer znovu u lidí. Proto tady nejsou žádné hodiny. Je to tvar, ne rozvrh: mapa, na které se člověk najde.</p>
      </div>
    </details>`;
  }
  // dnešní shrnutí nahoře
  function todayHeroHTML() {
    const da = analyze(np.y, np.m, np.d);
    const key = K.isoDate(np.y, np.m, np.d);
    const dayEv = monthEvents(np.y, np.m).filter(e => K.dateKey(e.date, TZ) === key);
    const gen = TX.generalItems(da, dayEv, rules());
    const per = TX.personalItems(da, rules());
    const go = gen.go.concat(per.go), cost = gen.cost.concat(per.cost);
    const ph = TX.phaseText(da.phaseAngle);
    const phh = K.planetaryHours(np.y, np.m, np.d, observer(), TZ);
    const nd = namedayLine(np.m, np.d);
    const hol = holidayFor(np.y, np.m, np.d);
    const arcS = arcSentence();
    return `<button type="button" class="hero-today ${da.color}" data-act="jumpDay" data-y="${np.y}" data-m="${np.m}" data-d="${np.d}" aria-label="Otevřít dnešek">
      <span class="ht-date">dnes · ${K.WEEKDAY_CZ[np.wd]} ${np.d}. ${K.MONTH_GEN[np.m - 1]}${hol ? ` <em class="ht-hol ${hol.f ? 'free' : 'trad'}">${esc(hol.n)}</em>` : ''}</span>
      <span class="ht-date ht-date2">${phh ? `<i class="sri">${SUNRISE_I}</i>&nbsp;${K.fmtTime(phh.sunrise, TZ)}&nbsp;&nbsp;–&nbsp;&nbsp;<i class="sri">${SUNSET_I}</i>&nbsp;${K.fmtTime(phh.sunset, TZ)}` : ''}${nd ? ' · ' + String(nd).replace(/\s*·\s*SK.*$/i, '') : ''}</span>${wxLine()}${(() => { const sd = sdForDay(np.y, np.m, np.d); return sd.length ? `<span class="ht-sd">${sd.map(x => sdLabel(x, np.y)).join(' · ')}</span>` : ''; })()}
      <span class="ht-head"><span class="ht-word">${TX.dayWord(da)}<svg class="wflo" viewBox="0 0 180 14" aria-hidden="true"><path d="M4 8 C 50 2, 80 12, 176 6" fill="none" stroke="currentColor" stroke-width="1" opacity=".55"/><path d="M88 4.6 90.6 7.2 88 9.8 85.4 7.2Z" fill="currentColor" opacity=".8"/></svg></span></span>
      <span class="ht-moon"><span class="ht-medal"><svg class="mring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="37" fill="none" stroke="rgba(239,200,120,.7)" stroke-width=".9"/><circle cx="60" cy="60" r="42" fill="none" stroke="rgba(239,200,120,.42)" stroke-width=".8"/></svg>${moonSVG(da.phaseAngle, 38, 'moon hm')}</span> Luna ${K.SIGN_LOC_V[da.moonSign]} · ${ph.name.replace(' Luna', '')} · ${Math.round(da.illum * 100)}&nbsp;%</span>
      <span class="ht-div"></span>
      ${go.length ? `<span class="ht-row ht-go"><i class="ht-ic go">✦</i><b>Podporuje</b><span class="tx">${esc(go[0].text)}</span></span>` : ''}
      ${cost.length ? `<span class="ht-div"></span><span class="ht-row ht-cost"><i class="ht-ic cost">${ico('✳')}</i><b>Nepříznivé</b><span class="tx">${esc(cost[0].text)}</span></span>` : ''}
      ${cycOn() && cycFor(K.isoDate(np.y, np.m, np.d)) ? `<span class="ht-div"></span><span class="ht-cyc">${(() => { const c = cycFor(K.isoDate(np.y, np.m, np.d)); return `<i class="cdot" style="background:${c.ph.col}"></i><b>${c.day}. den cyklu</b><span>${esc(c.ph.n)} fáze</span>`; })()}</span>` : ''}
      ${tattvaHTML() ? `<span class="ht-div"></span><span class="ht-row ht-tv" id="tatvaLine">${tattvaHTML()}</span>${S.tvHelp ? `<span class="tvexp">Tatvy jsou jemné rytmy dne: od východu slunce se po <b>24 minutách</b> střídá pět živlů a kruh se opakuje každé dvě hodiny. <span style="color:#8F7BC0">Akáša (éter)</span> přeje tichu a vhledu, <span style="color:#7FB6DD">Váju (vzduch)</span> myšlenkám a rozhovorům, <span style="color:#E8865C">Tédžas (oheň)</span> vůli a rozhodnutím, <span style="color:#9ED4E4">Ápas (voda)</span> citu a plynutí, <span style="color:#D9B96E">Prithví (země)</span> tělu a stabilitě. Když můžeš, slaď důležité kroky s běžícím živlem: rozhovor do vzduchu, rozhodnutí do ohně, odpočinek do vody.</span>` : ''}` : ''}
      ${orgHTML() ? `<span class="ht-div"></span><span class="ht-row ht-tv ht-org" id="orgLine">${orgHTML()}</span>${S.orgHelp ? orgExpHTML() : ''}` : ''}
      ${arcS ? `<span class="ht-div"></span><span class="ht-row ht-arc"><i class="ht-ic arc">${ico('✺')}</i><b>u tebe</b><span class="tx">${esc(arcS)}</span><i class="tvq" data-act="goArcs" role="button" aria-label="Čím teď procházíš">›</i></span>` : ''}
      ${(() => { const u = taskOfDay(da); const m = u.t.match(/^([^?]+\?)\s*(.*)$/); const q = m ? m[1] : u.t, a = m ? m[2] : ''; return `<span class="ht-invite"><svg class="inv-orn" viewBox="0 0 80 80" aria-hidden="true" fill="none"><defs>
<linearGradient id="invG" gradientUnits="userSpaceOnUse" x1="40" y1="8" x2="40" y2="72"><stop offset="0" stop-color="#F7E3A8"/><stop offset="1" stop-color="#D9A54A"/></linearGradient>
<radialGradient id="invBloom" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFEFC8" stop-opacity=".75"/><stop offset=".3" stop-color="#FBD489" stop-opacity=".34"/><stop offset=".62" stop-color="#F3BC63" stop-opacity=".1"/><stop offset="1" stop-color="#F3BC63" stop-opacity="0"/></radialGradient>
<radialGradient id="invCore" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFFEF8"/><stop offset=".38" stop-color="#FFF3D4" stop-opacity=".85"/><stop offset="1" stop-color="#FFE6B0" stop-opacity="0"/></radialGradient>
<filter id="invSoft" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation=".85"/></filter>
</defs><circle cx="40" cy="40" r="35" stroke="url(#invG)" stroke-width="1" opacity=".5" fill="none"/><ellipse cx="40" cy="43.5" rx="23" ry="14.5" fill="url(#invBloom)"/><line x1="16.9" y1="41.9" x2="9.5" y2="40.6" stroke="url(#invG)" stroke-width="1.1" opacity=".92"/><line x1="17.9" y1="38.0" x2="14.2" y2="36.6" stroke="url(#invG)" stroke-width="1.1" opacity=".62"/><line x1="19.6" y1="34.2" x2="13.2" y2="30.5" stroke="url(#invG)" stroke-width="1.1" opacity=".92"/><line x1="22.0" y1="30.9" x2="18.9" y2="28.3" stroke="url(#invG)" stroke-width="1.1" opacity=".62"/><line x1="24.9" y1="28.0" x2="20.1" y2="22.3" stroke="url(#invG)" stroke-width="1.1" opacity=".92"/><line x1="28.3" y1="25.6" x2="26.3" y2="22.2" stroke="url(#invG)" stroke-width="1.1" opacity=".62"/><line x1="32.0" y1="23.9" x2="29.4" y2="16.9" stroke="url(#invG)" stroke-width="1.1" opacity=".92"/><line x1="35.9" y1="22.9" x2="35.2" y2="18.9" stroke="url(#invG)" stroke-width="1.1" opacity=".62"/><line x1="40.0" y1="22.5" x2="40.0" y2="15.0" stroke="url(#invG)" stroke-width="1.1" opacity=".92"/><line x1="44.1" y1="22.9" x2="44.8" y2="18.9" stroke="url(#invG)" stroke-width="1.1" opacity=".62"/><line x1="48.0" y1="23.9" x2="50.6" y2="16.9" stroke="url(#invG)" stroke-width="1.1" opacity=".92"/><line x1="51.8" y1="25.6" x2="53.8" y2="22.2" stroke="url(#invG)" stroke-width="1.1" opacity=".62"/><line x1="55.1" y1="28.0" x2="59.9" y2="22.3" stroke="url(#invG)" stroke-width="1.1" opacity=".92"/><line x1="58.0" y1="30.9" x2="61.1" y2="28.3" stroke="url(#invG)" stroke-width="1.1" opacity=".62"/><line x1="60.4" y1="34.2" x2="66.8" y2="30.5" stroke="url(#invG)" stroke-width="1.1" opacity=".92"/><line x1="62.1" y1="38.0" x2="65.8" y2="36.6" stroke="url(#invG)" stroke-width="1.1" opacity=".62"/><line x1="63.1" y1="41.9" x2="70.5" y2="40.6" stroke="url(#invG)" stroke-width="1.1" opacity=".92"/><path d="M21 46 A19 19 0 0 1 59 46" stroke="url(#invG)" stroke-width="1.6" fill="none"/><path d="M26 46 A14 14 0 0 1 54 46" stroke="url(#invG)" stroke-width="1" opacity=".6" fill="none"/><circle cx="40" cy="45.2" r="8" fill="url(#invCore)" opacity=".95"/><g filter="url(#invSoft)" stroke="#FFFAEA" stroke-linecap="round"><line x1="40" y1="39.5" x2="40" y2="51" stroke-width="1.4"/><line x1="34.5" y1="45.2" x2="45.5" y2="45.2" stroke-width="1.4"/><line x1="36.4" y1="41.6" x2="43.6" y2="48.8" stroke-width=".85" opacity=".7"/><line x1="43.6" y1="41.6" x2="36.4" y2="48.8" stroke-width=".85" opacity=".7"/></g><circle cx="40" cy="45.2" r="2.1" fill="#FFFEF6"/><line x1="12" y1="46" x2="68" y2="46" stroke="url(#invG)" stroke-width="1.2" opacity=".85"/><line x1="18.0" y1="50" x2="22.9" y2="50" stroke="url(#invG)" stroke-width="1.2" opacity="0.55"/><line x1="27.8" y1="50" x2="32.7" y2="50" stroke="url(#invG)" stroke-width="1.2" opacity="0.75"/><line x1="37.6" y1="50" x2="42.4" y2="50" stroke="url(#invG)" stroke-width="1.2" opacity="0.95"/><line x1="47.3" y1="50" x2="52.2" y2="50" stroke="url(#invG)" stroke-width="1.2" opacity="0.75"/><line x1="57.1" y1="50" x2="62.0" y2="50" stroke="url(#invG)" stroke-width="1.2" opacity="0.55"/><line x1="23.0" y1="54.5" x2="27.9" y2="54.5" stroke="url(#invG)" stroke-width="1.2" opacity="0.56"/><line x1="32.7" y1="54.5" x2="37.6" y2="54.5" stroke="url(#invG)" stroke-width="1.2" opacity="0.82"/><line x1="42.4" y1="54.5" x2="47.3" y2="54.5" stroke="url(#invG)" stroke-width="1.2" opacity="0.82"/><line x1="52.1" y1="54.5" x2="57.0" y2="54.5" stroke="url(#invG)" stroke-width="1.2" opacity="0.56"/><line x1="27.5" y1="59" x2="32.5" y2="59" stroke="url(#invG)" stroke-width="1.2" opacity="0.59"/><line x1="37.5" y1="59" x2="42.5" y2="59" stroke="url(#invG)" stroke-width="1.2" opacity="0.95"/><line x1="47.5" y1="59" x2="52.5" y2="59" stroke="url(#invG)" stroke-width="1.2" opacity="0.59"/><line x1="32.0" y1="63.5" x2="37.3" y2="63.5" stroke="url(#invG)" stroke-width="1.2" opacity="0.65"/><line x1="42.7" y1="63.5" x2="48.0" y2="63.5" stroke="url(#invG)" stroke-width="1.2" opacity="0.65"/><line x1="35.5" y1="67.5" x2="44.5" y2="67.5" stroke="url(#invG)" stroke-width="1.2" opacity="0.95"/></svg><svg class="inv-wm" viewBox="0 0 160 160" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1"><circle cx="80" cy="80" r="70"/><circle cx="80" cy="80" r="52" stroke-dasharray="2 5"/><circle cx="80" cy="80" r="30"/><line x1="80" y1="4" x2="80" y2="156"/><line x1="4" y1="80" x2="156" y2="80"/><line x1="26" y1="26" x2="134" y2="134" opacity=".6"/><line x1="134" y1="26" x2="26" y2="134" opacity=".6"/><circle cx="80" cy="10" r="2" fill="currentColor"/><circle cx="150" cy="80" r="1.6" fill="currentColor"/><circle cx="46" cy="118" r="1.4" fill="currentColor"/></svg><span class="inv-body"><b>Pozvánka dne</b><i class="q">${esc(q)}</i>${a ? `<i class="a">${esc(a)}</i>` : ''}<small>${esc(u.sig)}</small></span></span>`; })()}
    </button>`;
  }

  // pás nejbližších dnů
  const PT_INFO = {
    sun: { g: () => K.BODY_GLYPH.Sun, k: 'Slunce', what: 'Jádro osobnosti: čím svítíš, kam rosteš a co ti dává smysl.', si: (n) => n.sunSign, txt: (si) => HS.SUN[si] },
    moon: { g: () => K.BODY_GLYPH.Moon, k: 'Luna', what: 'Vnitřní svět: co potřebuješ, aby ti bylo dobře, a jak prožíváš.', si: (n) => n.moonSign, txt: (si) => (HS.MOON && HS.MOON[si]) || `Uvnitř potřebuješ ${HS.NEED[si]}.` },
    asc: { g: () => 'Asc', k: 'Ascendent', what: 'Znamení, které vycházelo na východě v okamžiku narození: jak vstupuješ do světa a jak tě druzí vidí na první pohled.', si: (n) => K.signOf(n.points.Asc.lon), txt: (si) => HS.ASC[si] },
    dsc: { g: () => 'Dsc', k: 'Descendent', what: 'Bod přesně naproti Ascendentu, hrot sedmého domu: koho k sobě přitahuješ, co hledáš v partnerství a co se o sobě učíš skrze druhé. Ascendent je „já", Descendent je „ty".', si: (n) => K.signOf(n.cusps[7]), txt: (si) => HS.D7[si] },
  };
  function natalSumHTML(home) {
    const n = S.natal; if (!n) return '';
    const open = S.ptOpen;
    const cards = ['sun', 'moon', 'asc', 'dsc'].map(k => { const P = PT_INFO[k], si = P.si(n);
      return `<button type="button" class="ns ${open === k ? 'on' : ''}" data-act="ptOpen" data-k="${k}"><span class="g">${P.g()}</span><span class="k">${P.k}</span><span class="v">${K.SIGNS[si]}</span></button>`; }).join('');
    let exp = '';
    if (open && PT_INFO[open]) {
      const P = PT_INFO[open], si = P.si(n);
      exp = `<div class="ptexp"><div class="pth"><b>${P.k} ${K.SIGN_LOC_V[si]}</b><button type="button" class="ptx" data-act="ptOpen" data-k="${open}" aria-label="Zavřít">×</button></div>
        <p class="ptwhat">${P.what}</p>
        <p class="ptme">${esc(P.txt(si) || '')}</p>
        ${home ? `<button type="button" class="chip small" data-act="goNatal">✦ celý horoskop v O tobě</button>` : ''}</div>`;
    }
    return `<div class="natal-sum ${home ? 'home' : ''}">${cards}</div>${exp}`;
  }
  function todayReadHTML() {
    const { y, m, d } = np;
    const da = analyze(y, m, d);
    const key = K.isoDate(y, m, d);
    const dayEv = monthEvents(y, m).filter(e => K.dateKey(e.date, TZ) === key);
    const ph = K.planetaryHours(y, m, d, observer(), TZ);
    const r = TX.dayReading(da, dayEv);
    return `<div class="day-hero dayread">
      <div class="dr-head">
        <i class="dr-i"><svg class="dr-orn" viewBox="0 0 64 26" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M2 17c5-9 10-9 15 0s10 9 15 0 10-9 15 0 10 9 15 0" stroke-width="1.3" opacity=".9"/><path d="M32 4.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" fill="currentColor" stroke="none"/></svg></i>
        <span class="dr-lab">Denní rytmus</span>
        <span class="badge ${da.color}">${TX.dayWord(da)}</span>
      </div>
      <div class="dr-date">${K.WEEKDAY_CZ[K.tzParts(da.noon, TZ).wd]} ${d}. ${K.MONTH_GEN[m - 1]} ${y}</div>
      <p class="lede">${esc(r.text)}</p><p class="lede-sig">${esc(r.sign)}</p>
    </div>`;
  }
  function aheadHTML() {
    let out = '';
    for (let i = 0; i < 14; i++) {
      const dt = K.addDays(K.dayStart(np.y, np.m, np.d, TZ), i + 0.5);
      const p = K.tzParts(dt, TZ);
      const da = analyze(p.y, p.m, p.d);
      const key = K.isoDate(p.y, p.m, p.d);
      const sel = S.sel.y === p.y && S.sel.m === p.m && S.sel.d === p.d;
      out += `<button class="a ${da.color} ${key === TODAY_KEY ? 'today' : ''} ${sel ? 'sel' : ''}" data-act="selDay" data-y="${p.y}" data-m="${p.m}" data-d="${p.d}">
        <span class="wd">${i === 0 ? 'dnes' : K.WEEKDAY_CZ[p.wd].slice(0, 2)}</span><span class="dd">${p.d}</span><span class="wo">${TX.dayWord(da)}</span></button>`;
    }
    return `<div class="h3" style="margin-top:14px">Nejbližší dny</div><div class="strip-wrap"><button type="button" class="strip-nav l" data-act="stripNav" data-dir="-1" aria-label="Posunout zpět">‹</button><div class="ahead">${out}</div><button type="button" class="strip-nav r" data-act="stripNav" data-dir="1" aria-label="Posunout dál">›</button></div>`;
  }

  function dayDetailHTML(y, m, d, evByDay) {
    const da = analyze(y, m, d);
    const obs = observer();
    const ph = K.planetaryHours(y, m, d, obs, TZ);
    const pp = K.tzParts(K.addDays(da.dayStart, -0.5), TZ);
    const phPrev = K.planetaryHours(pp.y, pp.m, pp.d, obs, TZ);
    const ld = K.lunarDay(da.noon, obs);
    const key = K.isoDate(y, m, d);
    const dayEv = (evByDay && evByDay[key]) || monthEvents(y, m).filter(e => K.dateKey(e.date, TZ) === key);
    const isToday = key === TODAY_KEY;
    const moonrise = A.SearchRiseSet('Moon', obs, +1, A.MakeTime(da.dayStart), 1), moonset = A.SearchRiseSet('Moon', obs, -1, A.MakeTime(da.dayStart), 1);

    const gen = TX.generalItems(da, dayEv, rules());
    const per = TX.personalItems(da, rules());
    const wins = TX.windows(da, ph, TZ);
    const bullet = (it) => `<li class="${it.star ? 'mine' : ''}">${it.icon ? `<i class="bic">${it.icon}</i>` : ''}<span>${esc(it.text)}${it.tag ? `<span class="tag">${it.tag}</span>` : ''}${it.note ? `<span class="n">${esc(it.note)}</span>` : ''}</span></li>`;
    const go = gen.go.concat(per.go), cost = gen.cost.concat(per.cost);

    return `
      ${isToday ? `<div class="h3" style="margin-top:22px">Dnes podrobně</div><div class="day-hero today-detail">` : `<div class="day-hero">
      <div class="day-head">
        <div class="day-title"><small>${K.WEEKDAY_CZ[K.tzParts(da.noon, TZ).wd]}</small>${d}. ${K.MONTH_GEN[m - 1]} ${y}</div>
        <div><span class="badge ${da.color}">${TX.dayWord(da)}</span></div>
      </div>`}
      ${isToday ? '' : `<p class="day-moon">${moonSVG(da.phaseAngle, 13)} Luna ${K.SIGN_LOC_V[da.moonSign]} · ${TX.phaseText(da.phaseAngle).name.replace(' Luna', '')} · ${Math.round(da.illum * 100)}&nbsp;% osvětlení</p>
      <p class="day-sun">☉ východ ${K.fmtTime(ph.sunrise, TZ)} · západ ${K.fmtTime(ph.sunset, TZ)}${namedayLine(m, d) ? ' &nbsp;·&nbsp; ' + namedayLine(m, d) : ''}</p>${holidayFor(y, m, d) ? `<p class="day-hol ${holidayFor(y, m, d).f ? 'free' : 'trad'}">${esc(holidayLine(y, m, d))}</p>` : ''}
      ${(() => { const tw = twilight(y, m, d, obs); const f = (x) => x ? K.fmtTime(x, TZ) : '–'; const dn = darkNight(y, m, d, obs, moonrise, moonset); const g = gardenLine(da);
        return `<div class="nature">
          <p><span class="nl">zlatá hodina</span>${f(tw.goldAM[0])}–${f(tw.goldAM[1])} · ${f(tw.goldPM[0])}–${f(tw.goldPM[1])}<span class="nl">modrá hodina</span>${f(tw.blueAM[0])}–${f(tw.blueAM[1])} · ${f(tw.bluePM[0])}–${f(tw.bluePM[1])}</p>
          ${dn ? `<p><span class="nl">tmavá noc</span>Luna pod obzorem ${f(dn.from)}–${f(dn.to)} — ${dn.hours >= 4 ? 'Mléčná dráha a slabé hvězdy jsou dobře vidět' : 'krátké okno na hvězdy bez Luny'}</p>` : ''}
          ${settings.numerology !== false && S.natal && S.natal.profile ? (() => { const n = numerology(S.natal.profile, y, m, d); return `<p><span class="nl">osobní den</span><b>${n.day}</b> — ${NUM_DAY[n.day]} <small>(osobní rok ${n.year}, měsíc ${n.month})</small></p>`; })() : ''}
          <p><span class="nl">zahrádkář</span><b>${g.kind}</b> (Luna ${SIGN_LOC[['Beran','Býk','Blíženc','Rak','Lv','Pann','Váh','Štír','Střelc','Kozoroh','Vodnář','Ryb'][da.moonSign]]}) — ${g.tip} · ${g.phase}</p>
        </div>`; })()}`}
      ${isToday ? '' : (() => { const r = TX.dayReading(da, dayEv); return `<p class="lede">${esc(r.text)}</p><p class="lede-sig">${esc(r.sign)}</p>`; })()}
      ${(() => {
        const key = K.isoDate(y, m, d), sd = sdForDay(y, m, d), mine = pGet(key), gv = gEvByDay(key);
        if (!sd.length && !mine.length && !gv.length) return `<div class="daymine"><button type="button" class="chip small" data-act="goDiar" data-k="${key}">✎ zapsat program v Diáři</button></div>`;
        const bits = sd.map(x => `<span class="dm-sd">${esc(sdLabel(x, y).replace(/<[^>]+>/g, ''))}</span>`)
          .concat(gv.map(e => `<span class="dm-it">${e.t ? esc(e.t) + ' ' : ''}${esc(e.name)}<i>G</i></span>`))
          .concat(mine.map(it => `<span class="dm-it">${it.t ? esc(it.t) + ' ' : ''}${esc(it.name)}</span>`));
        return `<div class="daymine">${bits.join('')}<button type="button" class="chip small dm-go" data-act="goDiar" data-k="${key}">✎ upravit v Diáři</button></div>`;
      })()}
      </div>
      <div class="panel go"><h4>Co dnes jde</h4>
      <div class="ctxchips"><span>☽ Luna ${K.SIGN_LOC_V[da.moonSign]}</span><span>○ ${TX.phaseText(da.phaseAngle).name.replace(' Luna', '')} ${Math.round(da.illum * 100)}&nbsp;%</span>${da.kp ? `<span>≋ Kp ${da.kp.kp} ${da.kp.kp >= 5 ? 'zvýšená' : 'klidná'}</span>` : ''}</div>
      <ul>${go.map(bullet).join('')}</ul></div>
      ${cost.length ? `<div class="panel cost"><h4>Co bude stát víc sil</h4><ul>${cost.map(bullet).join('')}</ul></div>` : ''}
      <div class="h3">Průběh dne</div>
      ${timelineHTML(da, ph, wins, ld, moonrise, moonset, dayEv, isToday)}
      <details><summary>Podrobnosti — pro astrologa</summary>
        <div class="h3">Pás dne</div>
        ${stripHTML(da, ph, phPrev, isToday, moonrise, moonset)}
        <div class="striplegend"><span>▮ denní světlo</span><span>▨ Luna bez kurzu</span><span>spodní pás = planetární hodiny, barva = vládnoucí planeta</span>${isToday ? '<span style="color:var(--gold)">│ teď</span>' : ''}</div>
        <p class="note">Skóre dne ${signed(da.score)} · práh ${signed(rules().thresholds.harm)} / ${signed(rules().thresholds.tense)}.</p>
        <div class="h3">Tranzity k nativu</div>
        ${da.fast.length ? `<ul class="list">${da.fast.map(transitItem).map(li).join('')}</ul>` : '<p class="muted small">Žádné v orbisu.</p>'}
        ${da.background.length ? `<div class="h3">Pozadí období · pomalé planety</div><ul class="list">${da.background.map(transitItem).map(li).join('')}</ul><p class="note">Trvají týdny až měsíce, barvu dne neurčují (součet ${signed(da.backgroundScore)}).</p>` : ''}
        ${da.moonToNatal.length ? `<div class="h3">Aspekty Luny</div><ul class="list">${da.moonToNatal.map(e => li({ g: '☽', cls: e.kind === 'harm' ? 'tone-harm' : e.kind === 'tense' ? 'tone-tense' : '', text: `Luna ${e.glyph} ${NATAL_ACC[e.target]}`, note: K.fmtTime(new Date(e.ms), TZ), w: e.weight ? signed(e.weight) : '' })).join('')}</ul>` : ''}
        <div class="h3">Luna</div>
        <p class="small">${TX.phaseText(da.phaseAngle).name} · ${Math.round(da.illum * 100)} % · ${K.fmtLon(da.pos.Moon.lon)}${ld ? ` · ${ld.day}. lunární den od ${K.fmtTime(ld.since, TZ)}` : ''}${moonrise ? ` · východ ${K.fmtTime(moonrise.date, TZ)}` : ''}${moonset ? ` · západ ${K.fmtTime(moonset.date, TZ)}` : ''}</p>
        ${ph ? `<div class="h3">Planetární hodiny</div><p class="small">východ Slunce <b class="mono">${K.fmtTime(ph.sunrise, TZ)}</b> · západ <b class="mono">${K.fmtTime(ph.sunset, TZ)}</b> · vládce dne ${K.BODY_GLYPH[ph.ruler]} ${K.BODY_CZ[ph.ruler]}</p>
        <div class="ph-table">${ph.hours.map(h => `<div class="${isToday && Date.now() >= h.start.getTime() && Date.now() < h.end.getTime() ? 'cur' : ''}"><span>${K.BODY_GLYPH[h.ruler]} ${K.BODY_CZ[h.ruler]}${h.night ? ' ·noc' : ''}</span><span>${K.fmtTime(h.start, TZ)}–${K.fmtTime(h.end, TZ)}</span></div>`).join('')}</div>` : ''}
        <div class="h3">Planety v poledne</div>
        <p class="small mono">${K.BODIES.map(b => `${K.BODY_GLYPH[b]} ${K.fmtLon(da.pos[b].lon)}${da.pos[b].retro ? '<span class="tone-tense">R</span>' : ''}`).join(' &nbsp; ')} &nbsp; ☊ ${K.fmtLon(da.pos.Node.lon)}</p>
      </details>
      <p class="note">Nic z toho není předpověď ani pokyn. Je to mapa terénu — kudy dnes půjde snáz a kde budeš potřebovat víc trpělivosti. Rozhoduješ pořád ty.</p>`;
  }

  // ===================== horoskop podle nativu =====================
  const HS = {
    ELEM_CZ: { oheň: 'oheň', země: 'země', vzduch: 'vzduch', voda: 'voda' },
    ASC: [
      'Vstupuješ rovnou a beze zbytku. Lidé z tebe čtou energii a přímost dřív, než cokoli řekneš — a čekají, že věci uvedeš do pohybu. Síla je v odvaze začít; úkol je vydržet i tam, kde se hned nic neděje.',
      'Působíš klidně a spolehlivě, jako někdo, o koho se dá opřít. Nespěcháš — a právě proto ti lidé věří. Hlídej jen, aby se z pevnosti nestala neochota cokoli měnit.',
      'Působíš živě, zvědavě a v kontaktu. Snadno navazuješ, ptáš se, propojuješ. Tvůj úkol je nezůstat jen u lehkosti — dotáhnout i to, co začalo jako hra.',
      'Lidé u tebe rychle cítí, že je vnímáš. Vstupuješ citem, oklikou, přes atmosféru. Chrání tě to — jen ať se z ochrany nestane zeď, přes kterou se k tobě nikdo nedostane.',
      'Vcházíš s přirozenou vahou — je tě vidět, i když nic neděláš. Lidé od tebe čekají jistotu a velkorysost. Úkol: nést tu pozornost, aniž by ses pro ni musel hrát.',
      'Působíš pozorně a přesně; věci kolem tebe dostávají řád. Lidé ti svěřují, co potřebuje spolehlivost. Hlídej, ať služba druhým nesklouzne v neviditelnost tebe samotného.',
      'Vstupuješ s taktem a smyslem pro druhé; umíš vyladit atmosféru. Přitahuješ spolupráci. Tvůj růst vede přes odvahu říct i to, co rovnováhu na chvíli rozhodí.',
      'Působíš intenzivně, i mlčky. Lidé cítí, že vidíš pod povrch, a buď je to přitáhne, nebo znejistí. Tvá síla je pravdivost; úkol je nedržet vše jen pod kontrolou.',
      'Vcházíš otevřeně, s nadhledem a tahem někam dál. Zvedáš druhým horizont. Hlídej jen, ať velké směry nepřeskočí malé kroky, které k nim vedou.',
      'Působíš zdrženlivě a vážně; důvěru si u tebe člověk vyslouží — a pak platí. Neseš přirozenou autoritu. Úkol: dovolit si měkkost dřív, než ji vynutí únava.',
      'Působíš svobodně a jinak — lidé u tebe čekají nečekané. Vidíš věci zvenku a dopředu. Tvůj úkol je zůstat ve spojení i s tím, co je obyčejné a pomalé.',
      'Vstupuješ tiše a prostupně; lidé se u tebe uvolní, aniž ví proč. Vnímáš víc, než se říká. Chraň si hranice — tvá otevřenost je dar, ne povinnost.',
    ],
    SUN: [
      'V jádru jsi ten, kdo začíná. Potřebuješ výzvu, pohyb a možnost jít první — tam žiješ naplno. Zralost tvého ohně je v tom, že už nemusí vyhrát každý souboj.',
      'V jádru stojíš o skutečné, hmatatelné a trvalé. Buduješ pomalu a pořádně; co vytvoříš, drží. Růst přichází, když pustíš i něco jistého, co už dosloužilo.',
      'Tvé jádro je zvědavost. Žiješ výměnou — slov, myšlenek, dojmů — a potřebuješ víc než jednu kolej. Hloubka pro tebe není opak lehkosti; je to lehkost, která vydržela.',
      'V jádru jsi pečující a věrný — domov, blízcí a bezpečí nejsou kulisa, ale osa tvého života. Síla je v citu; úkol je nenechat minulost rozhodovat o přítomnosti.',
      'V jádru potřebuješ tvořit a být u toho celý. Máš přirozenou velkorysost a potřebu, aby tvůj život měl srdce. Zraje to ve chvíli, kdy záře slouží něčemu většímu než potlesku.',
      'V jádru jsi ten, kdo věci umí udělat pořádně. Vidíš detail, sloužíš smyslu, zlepšuješ. Tvá lekce: dokonalost je směr, ne podmínka tvé hodnoty.',
      'V jádru hledáš rovnováhu, krásu a férovost. Rozhoduješ se s ohledem na celek a druhé. Růst je v odvaze zvolit — i když každá volba něco vychýlí.',
      'Tvé jádro je hloubka. Nezajímá tě povrch; jdeš tam, kde se věci opravdu rozhodují, a uneseš i to, co jiní odvracejí. Síla zraje, když proměnu nevynucuješ, ale doprovázíš.',
      'V jádru potřebuješ smysl a dálku — věřit něčemu, rozumět celku, mít kam růst. Jsi od přírody učitel i poutník. Lekce: pravda druhého může být jiná než tvoje, a přesto pravá.',
      'V jádru jsi stavitel. Cíl, kázeň a odpovědnost ti nejsou tíha, ale páteř. Co slíbíš, platí. Dovol si ale i úspěch užít — ne jen hned stavět další patro.',
      'V jádru jsi svobodný duch s citem pro celek. Vidíš dál a jinak; táhne tě to k lidem, ideám a budoucnosti. Lekce: patřit někam neznamená přestat být sám sebou.',
      'V jádru jsi propojený s něčím větším — cit, představivost a soucit jsou tvůj základní materiál. Umíš dát druhým útěchu i vizi. Úkol: mít břehy, aby řeka někam tekla.',
    ],
    MOON: [
      'Uvnitř reaguješ rychle a rovnou — cit u tebe rovná se impulz. Potřebuješ pohyb a upřímnost; dusno tě ničí. Klid nacházíš, když smíš věci řešit hned.',
      'Uvnitř potřebuješ klid, stálost a smyslové bezpečí — dobré jídlo, dotek, známé místo. Emoce zpracováváš pomalu a důkladně. Jistota je tvůj lék; jen ať není klecí.',
      'Uvnitř zpracováváš pocity slovy a myšlenkou — potřebuješ si věci říct, přečíst, pojmenovat. Rozptýlení je tvá první pomoc, rozhovor tvá terapie.',
      'Tvé nitro je doma samo v sobě: hluboké, věrné, s výbornou pamětí na dobré i zlé. Potřebuješ své lidi a své hnízdo. Péče o druhé ti jde sama — nezapomínej v ní na sebe.',
      'Uvnitř potřebuješ být viděn a mít z čeho se radovat — cit u tebe chce výraz. Když tvé srdce nemá jeviště, hasne. Dovol si hrát, tvořit a přijímat pozornost bez viny.',
      'Uvnitř hledáš klid v pořádku — když je uklizeno, je uklizeno i v tobě. Pečuješ prakticky: činem, ne řečmi. Hlídej vnitřního kritika; užitečný je jen do určité míry.',
      'Uvnitř potřebuješ harmonii a hezké prostředí; konflikt tě stojí víc než druhé. Zklidňuje tě krása a společnost. Lekce: řečený nesouhlas vztah pročistí, neshodí.',
      'Tvé nitro je hluboké a nic nezapomíná. Cítíš naplno — a proto si vybíráš, komu se otevřeš. Důvěra je u tebe vzácná měna; kde ji dáš, tam jdeš až na dno.',
      'Uvnitř potřebuješ prostor, smysl a naději — stísněnost tě dusí víc než cokoli. Zvedá tě příroda, cesty a velké myšlenky. Tvůj cit je optimista; dej mu i kořeny.',
      'Uvnitř jsi zdrženlivý — cit si necháváš pro sebe a projevuješ ho spolehlivostí. Emoce bereš jako odpovědnost. Dovol si i potřebovat druhé; není to slabost.',
      'Uvnitř potřebuješ vzduch a svobodu — cit zpracováváš s odstupem, hlavou. Blízkost ano, ale bez pout. Lekce: odstup je dobrý sluha; nenech ho rozhodovat za srdce.',
      'Tvé nitro je propustné — nasáváš nálady místa i lidí a někdy neseš, co není tvoje. Potřebuješ ticho, vodu, hudbu a čas o samotě, aby ses vrátil k sobě.',
    ],
    HOUSE_AREA: ['tebe samotného, tvého těla a toho, jak vstupuješ do světa', 'peněz, jistot a vlastní hodnoty', 'komunikace, učení a nejbližšího okolí', 'domova, rodiny a kořenů', 'tvořivosti, radosti a dětí', 'každodenní práce, služby a zdraví', 'partnerství a blízkých vztahů', 'hlubokých proměn, sdílených zdrojů a témat, kterým se jiní vyhýbají', 'cest, víry, vzdělání a hledání smyslu', 'povolání, směřování a veřejné role', 'přátel, společenství a vizí do budoucna', 'nitra, ústraní a toho, co zraje ve skrytu'],
    ANCH: { Sun: ['tvou vůli a směr', 'tvé vůle'], Moon: ['tvé pocity a potřeby', 'tvých pocitů'], Asc: ['to, jak působíš', 'tvého vystupování'] },
    ASP: {
      Mercury: { conj: 'Myšlení a řeč jsou od {A} neoddělitelné — co žiješ, potřebuješ i pojmenovat. Slovo je tvůj nástroj; važ ho, má u tebe váhu činu.', harm: 'Hlava a {A2} táhnou za jeden provaz: snadno pojmenováváš, co se v tobě děje, a domluva ti otvírá dveře.', tense: 'Hlava a {A2} si občas skáčou do řeči — co cítíš a co říkáš, nemusí být totéž. Pomáhá zpomalit a dopovědět; nedorozumění tu bývá častější než zlá vůle.' },
      Venus: { conj: 'Láska, krása a hodnoty prorůstají {A3} — vztahy a vkus nejsou doplněk, ale součást tvé podstaty. Umíš mít rád; hlídej jen, ať harmonie nekupuje tvé mlčení.', harm: 'Vztahovost a {A2} se podporují: umíš získat lidi, vyladit atmosféru a dopřát si dobré věci bez boje.', tense: 'Mezi {A3} a potřebou lásky či pohody bývá tichý spor — buď já, nebo klid. Zralé řešení: laskavost, která umí říct ne.' },
      Mars: { conj: 'Energie a tah na branku jsou přímo v {A3} — máš sílu, kterou nejde schovat. Když má úkol, hory přenáší; bez úkolu se obrací dovnitř. Dej jí denně kus práce.', harm: 'Vůle k činu podporuje {A4}: umíš se rozhodnout, začít a vydržet. Odvaha je u tebe praktická, ne teatrální.', tense: 'Síla se s {A5} občas sráží — netrpělivost, hrany, přepálený start. Je to motor, ne vada; chce jen řízení: pohyb, sport, jasné cíle.' },
      Jupiter: { conj: 'Růst, důvěra a velkorysost jsou vepsané přímo do {A3}. Lidé u tebe cítí naději a šíři. Hlídej míru — tvé „hodně“ je pro jiné „příliš“.', harm: 'Důvěra a nadhled podporují {A4} — máš přirozené štěstí na dveře, které se otvírají. Stačí do nich vejít.', tense: 'Sklon přestřelit: víc slíbit, víc si naložit, víc věřit, než je zdrávo. Tvůj optimismus je dar — jen mu dej rozpočet.' },
      Saturn: { conj: 'Řád, nárok a odpovědnost stojí přímo v {A3}. Bereš život vážně a rosteš pomalu, ale doopravdy. Přísnost na sebe měj — jen ať není jediným hlasem.', harm: 'Kázeň podporuje {A4}: co si předsevezmeš, doneseš. Umíš stavět na dlouho a lidé se o tebe opírají.', tense: 'Vnitřní kritik mluví do {A5} — pocit „ještě to nestačí“ znáš dobře. Je to brzda i motor: nauč se ho brát jako poradce, ne soudce. Časem z toho bývá největší síla mapy.' },
      Uranus: { conj: 'Svoboda a jinakost jsou přímo v {A3} — nejde tě zaškatulkovat a rutina tě dusí. Tvá originalita je poslání; jen jí dej i řád, ať může něco dokončit.', harm: 'Otevřenost změně podporuje {A4}: umíš se odrazit z místa, kde jiní zamrznou, a vidět řešení z boku.', tense: 'V {A5} to občas zajiskří — náhlé zvraty, potřeba utéct, když je těsno. Změna je tvůj vzduch; uč se ji dělat dřív, než musí přijít výbuchem.' },
      Neptune: { conj: 'Citlivost, představivost a přesah prostupují {A3} — vnímáš vrstvy, které jiní neregistrují. Je to dar vize i riziko mlhy: kotvi se v těle a v konkrétních krocích.', harm: 'Intuice podporuje {A4} — umíš vycítit správný okamžik a lidem u tebe měkne obrana. Tvá empatie léčí.', tense: 'Mlha občas padá na {A5} — ideál se plete se skutečností, hranice se rozpouští. Pomáhá jednoduchost: fakta, tělo, termíny. Tvá citlivost pak slouží, místo aby zaplavovala.' },
      Pluto: { conj: 'Hloubka a intenzita jsou přímo v {A3} — nic neděláš napůl a lidé to cítí. Procházíš proměnami, po kterých nejsi stejný. Síla je obrovská; užívej ji k osvobození, ne kontrole.', harm: 'Vnitřní síla podporuje {A4}: v krizi rosteš a uneseš, co by jiné složilo. Regenerace je tvá přirozenost.', tense: 'V {A5} se občas ozve tlak všechno uřídit nebo vše zbořit a začít znovu. Uprostřed je třetí cesta: pustit kontrolu, ne odpovědnost.' },
    },
    PAIR: {
      'Sun|Moon': { conj: 'Vůle a pocity jedou u tebe v jednom proudu — co chceš, to i cítíš. Dává ti to celistvost a tah; slabší místo je odstup od sebe. Občas se na sebe podívej cizíma očima.', harm: 'Vůle a pocity se u tebe domlouvají snadno — rozhodnutí nebolí, protože hlava i srdce míří podobně. Vzácná výbava; stav na ní.', tense: 'Co chceš a co potřebuješ, u tebe často nejde stejným směrem — den chce jedno, nitro druhé. Není to vada, je to vnitřní dialog. Rozhodnutí, které vyslechne obě strany, u tebe drží nejdéle.' },
      'Sun|Asc': { conj: 'Jsi navenek přesně tím, kým jsi uvnitř — bez masky. Lidé vidí, co dostanou. Síla v pravdivosti; jen pozor, prostor sdílíš i s jinými.', harm: 'To, jak působíš, přirozeně ladí s tím, kdo jsi — nemusíš se přehrávat ani schovávat. Lidé ti věří, protože obraz sedí.', tense: 'To, jak působíš, a to, kým uvnitř jsi, se liší — lidé tě často čtou jinak, než se cítíš. Chce to trpělivost: dávej okolí čas poznat obě vrstvy.' },
      'Moon|Asc': { conj: 'Tvé pocity jsou vidět — vstupuješ do místnosti i s náladou. Je to poctivé a lidi to sbližuje; jen ne každý den musí být veřejný.', harm: 'Nitro a vystupování si u tebe rozumí: působíš tak, jak ti opravdu je, a lidem je s tebou přirozeně dobře.', tense: 'Navenek držíš jiný tón, než jaký zní uvnitř — okolí tě má za klidnějšího či tvrdšího, než se cítíš. Blízkým pomáhej krátkou zprávou o tom, jak ti doopravdy je.' },
    },
  };
  HS.D2 = ['K penězům jdeš přímo a rychle — vyděláváš akcí a odvahou. Rychlý start, kratší dech: nauč se držet, co získáš.','Peníze u tebe chtějí růst pomalu a jistě — máš přirozený cit pro hodnotu a majetek. Jistota je tvůj styl; jen ať nezamrzne.','Vyděláváš hlavou a slovem, klidně z více zdrojů naráz. Pružnost je výhoda — roztěkanost daň, kterou hlídej.','Peníze pro tebe znamenají bezpečí pro tebe a tvé lidi; šetříš citem, utrácíš pro blízké. Finanční klid ti dělá i klid vnitřní.','Vyděláváš tím, čím záříš, a umíš utratit se stylem. Velkorysost ti sluší — rozpočet jí dá královskou míru.','Přesnost, užitečnost, poctivá práce — tvé příjmy stojí na kvalitě. Umíš počítat; nezapomeň se z vydělaného i radovat.','Peníze přichází přes spolupráci, vkus a lidi. Férovost je tvůj kapitál. Rozhoduj i sám — čekání na shodu něco stojí.','Máš instinkt pro skryté zdroje a velké proměny financí. Umíš z mála vybudovat hodně — a chceš mít věci pod kontrolou. Sdílej ji.','Vyděláváš rozhledem, vírou a švihem; peníze bereš jako palivo, ne cíl. Optimismus ano — s rezervou pro horší počasí.','Stavíš majetek trpělivě jako zeď — kámen po kameni. Dlouhodobě málokdo obstojí líp. Dovol si užívat už cestou.','Netradiční zdroje, technologie, společenství — tvé finance nejdou vyšlapanou cestou. Systém a automatizace jsou tví spojenci.','Peníze k tobě tečou i odtékají intuitivně; vyděláváš citem, tvorbou, pomocí. Průhledná evidence tvou intuici podrží.'];
  HS.D7 = ['Přitahují tě přímí, odvážní, samostatní — vztah má mít jiskru a pohyb. Hádka pročistí; jen ať je fér.','Hledáš stálost, věrnost a smyslové teplo. Partner má být opora, ne drama. Dej vztahu čas růst.','Hledáš parťáka do řeči — vztah žije rozhovorem, humorem, zvědavostí. Nuda je jediný skutečný nepřítel.','Hledáš citový domov: partnera, u kterého je bezpečno. Pečuješ a chceš péči zpět — říkej si o ni nahlas.','Hledáš vztah, na který můžeš být hrdý — vřelost, věrnost, trocha lesku. Obdiv dávej i přijímej.','Přitahují tě spolehliví a skromní; láska se u tebe projevuje činem a péčí o všední den. Nároky měj — perfekcionismus krot.','Partnerství je pro tebe přirozený stav — hledáš rovného, se kterým to ladí. Uč se unést i nesouhlas; rovnováha není bezkonflikt.','Hledáš hloubku a úplnou pravdivost — buď celý, nebo nic. Důvěra se u tebe buduje pomalu a je vším.','Hledáš spolucestovatele — vztah má růst, smát se a mířit někam. Svoboda obou je podmínka lásky.','Vztah bereš jako závazek a stavbu na roky; často zraje s věkem. Spolehlivost je tvá řeč lásky.','Hledáš především přítele — rovnost, volnost, jinakost. Vztah podle šablony ti nesedne; tvořte si vlastní.','Hledáš duši, ne jen člověka — vztah jako splynutí a útočiště. Miluj s otevřenýma očima; soucit není sebeobětování.'];
  HS.VEN = ['rychle, přímo a naplno — dobývání tě baví','smysly a stálostí — dotek, jídlo, věrnost','slovy a hrou — láska u tebe musí mluvit','péčí a pamětí srdce — kdo je tvůj, je tvůj','velkoryse a s gestem — láska má zářit','činem a všímavostí — malými věcmi každý den','souladem a krásou — uměním být ve dvou','hluboko a bezezbytku — polovičatost neumíš','svobodně a s humorem — láska je cesta','vážně a věrně — činy víc než slova','přátelstvím a volností — blízkost bez pout','oddaně a bezpodmínečně — s citem pro duši druhého'];
  HS.MARS = ['jdeš si za tím rovnou — přitažlivost je u tebe akce','pomalý tah a smyslnost — co rozehřeješ, dlouho hřeje','svádíš slovem a hrou','touha jde přes cit a bezpečí','vášeň s velkým gestem — chceš i být viděn','jiskra v detailu a péči; touha roste s důvěrou','přitahuje tě soulad — svádění je tanec','magnetická intenzita — vše, nebo nic','vášeň dobrodružství — společný pohyb spojuje','touha vytrvalá a věrná; roste časem','jiskří jinakost a mysl','touha splynout — něha je tvůj jazyk'];
  HS.D4 = ['Kořeny v pohybu a boji — domov, kde se muselo jednat. Svůj domov stavíš činem a chráníš ho odvážně.','Kořeny v zemi a stálosti — domov má být pevný, hezký a navždy. Zahrada, jídlo, klid: tvé rodinné svátosti.','Domov plný slov a pohybu; možná víc míst než jedno. Rodina je pro tebe rozhovor, který nekončí.','Hluboké rodové pouto — domov a rodina jsou tvůj střed. Tradice neseš dál; vybírej vědomě které.','Domov jako srdce a jeviště rodiny — potřebuješ v něm teplo a hrdost. Rád hostíš a dáváš.','Domov v řádu a péči — fungující zázemí je tvůj základ klidu. Služba rodině je tvá tichá láska.','Domov má být krásný a smírný; rodinné vztahy stojí na dohodě. Uč se doma i zdravému sporu.','Rodové hlubiny a tajemství; domov intenzivní, ne vlažný. Co v kořenech uzdravíš, osvobodí i další.','Kořeny s širokým obzorem — domov u cesty, rodina víry a názorů. Doma potřebuješ vzduch a smysl.','Kořeny s tíhou a řádem; brzy jsi nesl odpovědnost. Tvůj vlastní domov je stavba na skále.','Netradiční kořeny či rodina „jiná než ostatní“. Domov si definuješ sám — a smí to být svobodně.','Kořeny v citu a mlze; domov jako útočiště duše. Jasnost o rodinné minulosti ti vrací pevnou zem.'];
  HS.NODE = ['Tvůj růst vede k samostatnosti a odvaze — od ohlížení na druhé k vlastnímu kroku.','Tvůj růst vede ke klidu, jednoduchosti a vlastní hodnotě — od dramat k pevné zemi.','Tvůj růst vede ke zvědavosti a naslouchání — od hotových pravd k otázkám.','Tvůj růst vede k citu a domovu — od výkonu k péči o vnitřní svět.','Tvůj růst vede k odvaze zazářit — od schovávání v davu k vlastnímu srdci.','Tvůj růst vede k řádu, službě a přítomnosti — od snění k poctivé práci dne.','Tvůj růst vede ke spolupráci — od „já sám“ k umění být ve dvou.','Tvůj růst vede do hloubky a proměny — od hromadění jistot k odvaze pustit.','Tvůj růst vede ke smyslu a víře — od sbírání informací k vlastní pravdě.','Tvůj růst vede k zodpovědnosti a cíli — od citových vln k pevné stavbě.','Tvůj růst vede ke svobodě a službě celku — od vlastního jeviště ke společnému dílu.','Tvůj růst vede k důvěře a odevzdání — od kontroly detailů k proudu života.'];
  HS.SAT = ['Lekce: jednat za sebe. Učíš se odvaze a zdravé razanci — strach ze začátku se láme jen začátkem.','Lekce: jistota zevnitř. Učíš se, že hodnota není v majetku — pak ti majetek slouží.','Lekce: důvěra vlastní hlavě a slovu. Uč se mluvit, i když hlas přeskočí.','Lekce: dovolit si cit a blízkost. Zeď kolem srdce stavěná v dětství se dá přestavět na dům.','Lekce: dovolit si zářit. Učíš se, že tvá tvořivost má právo na svět i bez záruky potlesku.','Lekce: dost dobré je dost. Učíš se sloužit bez sebetrestání a pracovat bez sebezničení.','Lekce: závazek a rovnost. Učíš se vztahům jako řemeslu — a časem v něm býváš mistr.','Lekce: důvěra a odevzdání kontroly. Učíš se, že zranitelnost není smrt — je to brána.','Lekce: vlastní pravda. Učíš se věřit — ne převzatě, ale ověřeně životem.','Lekce: nést odpovědnost lehčeji. Stavět umíš; uč se u toho i žít.','Lekce: patřit a zůstat svůj. Učíš se, že společenství není ztráta svobody.','Lekce: hranice v soucitu. Učíš se pomáhat, aniž se rozpustíš.'];
  HS.P_MONEY = { Sun:'vlastní hodnota a příjem jsou u tebe jedno téma: potřebuješ vydělávat tím, kým jsi. Cizí kolej tě neuživí dlouho.', Moon:'finanční pocit kolísá s náladou a jistota peněz je i jistota citová. Stabilní rezerva ti léčí nervy víc než výnos.', Mercury:'vyděláváš hlavou, slovem a obchodem; příjmů může být víc naráz. Pozor jen na roztříštěnost.', Venus:'peníze přichází přes krásu, vztahy a to, co lidem dělá dobře. Umíš je i užívat; hlídej rovnováhu mezi dopřát si a rozpustit.', Mars:'vyděláváš tahem a odvahou; rychle vydělané umí rychle odejít. Energie do vlastních projektů se ti vrací nejvíc.', Jupiter:'přirozená důvěra v dostatek a štěstí na příležitosti. Riziko: přestřelené výdaje. Růst ano, s rozpočtem.', Saturn:'peníze jsou pro tebe vážná věc; stavíš pomalu, ale trvale. Strach z nedostatku časem vystřídá mistrovství správce.', Uranus:'příjmy skoky, nečekané zdroje, netradiční cesty. Stabilitu hledej v systému, ne v jednom zaměstnavateli.', Neptune:'peníze protékají; skvělé pro tvorbu a pomoc, zrádné pro evidenci. Průhledné účty jsou tvůj ochranný kruh.', Pluto:'velké proměny majetku a síla obnovit se z nuly. Téma moci a peněz chce čistotu záměru.' };
  HS.P_REL = { Sun:'partnerství je pro tebe osou života; skrze protějšek poznáváš sám sebe. Hledej rovnost, ne dokončení sebe.', Moon:'potřebuješ partnera-domov: bezpečí a citovou blízkost. Nálada vztahu je nálada tvého dne.', Mercury:'vztah pro tebe stojí na rozhovoru; partner má být i parťák do řeči. Mlčení tě vzdaluje.', Venus:'dar harmonických vztahů — přitahuješ náklonnost. Hlídej, ať kvůli klidu nemlčíš.', Mars:'do vztahů vnášíš jiskru i třecí plochy; přitahují tě silní partneři. Hádka není konec, je to kontakt — uč se ji vést čistě.', Jupiter:'vztahy tě rozšiřují; partner často přináší růst, víru či svět. Velkorysost oplácej mírou.', Saturn:'vztahy bereš vážně a nastálo; často zrají později a s věkem se lepší. Závazek je pro tebe brána, ne past.', Uranus:'potřebuješ vztah se vzduchem: blízkost i volnost zároveň. Netradiční forma může být tvoje forma.', Neptune:'hledáš spřízněnou duši a umíš bezpodmínečně milovat. Dívej se, kdo partner je — ne kým by mohl být.', Pluto:'vztahy tě proměňují od základů; povrchní svazek tě nenaplní. Intenzita ano, vlastnění ne.' };
  HS.P_FAM = { Sun:'domov je tvé jeviště i kotva; potřebuješ v něm být sám sebou. Rodinné téma je součást tvé identity.', Moon:'hluboké pouto s rodinou a minulostí; domov je tvá nabíječka. Rodové vzorce v tobě žijí silně — vybírej, které poneseš dál.', Mercury:'domov plný slov, knih a pohybu; rodina, se kterou se mluví. Kořen nosíš v hlavě, stěhování tě neláme.', Venus:'potřebuješ hezký, laskavý domov; umíš z místa udělat útočiště. Smír v rodině je tvá práce i dar.', Mars:'v rodině se kalila tvá bojovnost; doma potřebuješ i akci, ne jen klid. Starou zlobu přetav v ochranu svých.', Jupiter:'velkorysé kořeny nebo široká rodina; domov, který roste a hostí. Štěstí ti přeje víc, když má kde bydlet.', Saturn:'kořeny nesou tíhu: povinnost, řád, možná chlad. Svůj domov stavíš sám — a právě proto bude pevný.', Uranus:'kořeny v pohybu: stěhování, zlomy, jinakost rodu. Tvůj domov nemusí vypadat jako ostatní; musí být tvůj.', Neptune:'domov jako útočiště duše, ale i mlhy v rodinné historii. Pravda o kořenech osvobozuje.', Pluto:'rodové téma síly a tajemství; proměna, která začíná u kořenů. Co v rodu uzdravíš, už se nedědí dál.' };
  HS.P_SPIRIT = { Sun:'část tvé podstaty pracuje ve skrytu; potřebuješ ústraní, aby ses našel. Tvé světlo sílí v tichu.', Moon:'city zrají v samotě a nasáváš i kolektivní nálady. Pravidelné ticho je pro tebe hygiena duše.', Mercury:'myšlení napojené na hlubinu; nápady chodí z ticha, snů a meditace. Zapisuj si je.', Venus:'tichá, oddaná láska a cit pro posvátné umění. Dávej lásku i viditelně, ne jen ve skrytu.', Mars:'síla pracující vskrytu; bojuješ spíš za druhé než na veřejnosti. Hněv nezametej dovnitř — dej mu tichou práci: pohyb, službu, rituál.', Jupiter:'tichý ochránce: víra, která tě podrží, i když nevíš jak. Samota tě nezmenšuje — rozšiřuje.', Saturn:'vnitřní klášter: disciplína ducha a práce se strachy. Co si v tichu srovnáš, venku už neřešíš.', Uranus:'záblesky poznání z nevědomí; probuzení přichází skokem. Vhledu důvěřuj — a ověř ho životem.', Neptune:'přirozený mystik: tenká hranice k jemným světům. Kotva v těle a řádu ti dovolí jít hluboko bezpečně.', Pluto:'hlubinná proměna ve skrytu; sestupuješ a vracíš se silnější. Stín je tvůj učitel, ne nepřítel.' };
  HS.NOUN = { Sun:'vůle', Moon:'city', Mercury:'mysl', Venus:'láska a hodnoty', Mars:'síla', Jupiter:'růst', Saturn:'řád', Uranus:'svoboda', Neptune:'citlivost', Pluto:'hloubka', Asc:'vystupování', MC:'směřování' };
  HS.ADVICE = { Saturn:'Pomáhá trpělivost a malé sliby, které dodržíš.', Pluto:'Pomáhá pustit kontrolu dřív, než ji život vezme sám.', Uranus:'Pomáhá dělat změny dobrovolně a včas.', Neptune:'Pomáhá jasnost: fakta, hranice, střízlivé oči.', Mars:'Pomáhá dát síle pravidelný ventil.' };
  const hsPara = (title, text, tg) => `<div class="hsp">${title ? `<h4>${title}</h4>` : ''}<p>${text}</p>${tg ? `<span class="hstag">${tg}</span>` : ''}</div>`;
  const hsPlanetsIn = (n, h) => ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'].filter(k => n.points[k].house === h);
  function horoscopeMoney(n) {
    const si = K.signOf(n.cusps[2]);
    let out = hsPara('Tvůj rukopis s penězi', `Druhý dům mapy ukazuje tvůj vztah k penězům, majetku a vlastní hodnotě — jak vyděláváš, držíš a utrácíš. ${HS.D2[si]}`, `2. dům ${K.SIGN_LOC_V[si]}`);
    const in2 = hsPlanetsIn(n, 2);
    if (in2.length) out += in2.map(k => hsPara('', `${K.BODY_CZ[k]} v oblasti peněz: ${HS.P_MONEY[k]}`, `${K.BODY_CZ[k]} · 2. dům`)).join('');
    else out += hsPara('', 'Ve 2. domě nemáš žádnou planetu — peníze pro tebe nejsou životní téma samo o sobě. Řídí se tím, jak žiješ ostatní oblasti; základní rukopis ti dává znamení na hrotu.', '');
    const in8 = hsPlanetsIn(n, 8);
    if (in8.length) {
      out += hsPara('Sdílené zdroje', `Osmý dům jsou peníze, které nejsou jen tvoje: společné finance v partnerství, dědictví, hypotéky a dluhy, daně, cizí kapitál — a s nimi hluboké proměny majetku. ${in8.length > 1 ? `U tebe je to silně obsazená oblast (${in8.map(k => K.BODY_CZ[k]).join(', ')}), takže velká finanční témata tvého života se odehrávají spíš tady než ve výplatní pásce.` : 'Máš tu jednu planetu — tahle oblast v tvém životě mluví zřetelně.'}`, `8. dům — ${in8.length} ${in8.length === 1 ? 'planeta' : in8.length < 5 ? 'planety' : 'planet'}`);
      out += in8.map(k => hsPara('', `${K.BODY_CZ[k]}: ${HS.P_MONEY[k]}`, `${K.BODY_CZ[k]} · 8. dům`)).join('');
    }
    out += hsPara('Kde ti přeje růst', `Štěstí a příležitosti ti nejsnáz tečou v oblasti ${HS.HOUSE_AREA[n.points.Jupiter.house - 1]}. Tam se vyplácí investovat čas i důvěru.`, `Jupiter · ${n.points.Jupiter.house}. dům`);
    out += hsPara('Kde je pozdní sklizeň', `Disciplínu a trpělivost po tobě život chce v oblasti ${HS.HOUSE_AREA[n.points.Saturn.house - 1]}. Co tam poctivě vybuduješ, drží nejdéle z celé mapy.`, `Saturn · ${n.points.Saturn.house}. dům`);
    return out;
  }
  function horoscopeLove(n) {
    const si = K.signOf(n.cusps[7]), v = K.signOf(n.points.Venus.lon), ma = K.signOf(n.points.Mars.lon);
    let out = hsPara('Co hledáš v partnerství', `Descendent stojí přesně naproti Ascendentu — je to hrot sedmého domu a zrcadlo naproti tobě: ukazuje, koho přitahuješ, co od partnerství čekáš a co se o sobě skrze druhé učíš. ${HS.D7[si]}`, `Descendent ${K.SIGN_LOC_V[si]} · 7. dům`);
    out += hsPara('Jak miluješ', `Miluješ ${HS.VEN[v]}. Tvá jiskra: ${HS.MARS[ma]}.`, `Venuše ${K.SIGN_LOC_V[v]} · Mars ${K.SIGN_LOC_V[ma]}`);
    const in7 = hsPlanetsIn(n, 7);
    if (in7.length) out += in7.map(k => hsPara('', `${K.BODY_CZ[k]} v domě partnerství: ${HS.P_REL[k]}`, `${K.BODY_CZ[k]} · 7. dům`)).join('');
    out += hsPara('', 'Tvé citové potřeby ve vztahu čti z Luny — viz Tvůj vnitřní svět v Osobnostním tématu. Partner, který je zná, má klíč.', '');
    return out;
  }
  function horoscopeFamily(n) {
    const si = K.signOf(n.cusps[4]);
    let out = hsPara('Tvé kořeny', `Imum Coeli — IC, dno mapy naproti MC — je hrot čtvrtého domu a její základ: rodina, ze které vycházíš, domov, který tvoříš, a to, co sis z dětství odnesl jako samozřejmost. ${HS.D4[si]}`, `IC ${K.SIGN_LOC_V[si]} · 4. dům`);
    const in4 = hsPlanetsIn(n, 4);
    if (in4.length) out += in4.map(k => hsPara('', `${K.BODY_CZ[k]} u kořenů: ${HS.P_FAM[k]}`, `${K.BODY_CZ[k]} · 4. dům`)).join('');
    else out += hsPara('', 'Ve 4. domě nemáš planetu — rodina není tvé osudové bojiště. Rukopis kořenů čti ze znamení hrotu; svůj vlastní domov tvoříš svobodněji než většina.', '');
    out += hsPara('', 'Domov je místo, odkud se vychází i kam se vrací. Ať mu dáš jakoukoli podobu, měř ho jediným: dá se v něm vydechnout.', '');
    return out;
  }
  function horoscopeSpirit(n) {
    const ns = K.signOf(n.points.Node.lon);
    let out = hsPara('Směr růstu', `Uzel je směrovka duše — neukazuje, co ti jde samo, ale kam máš v tomhle životě dorůst; proto to zprvu drhne a časem naplňuje. ${HS.NODE[ns]} Tahle cesta se odehrává hlavně v oblasti ${HS.HOUSE_AREA[n.points.Node.house - 1]}.`, `Uzel ${K.SIGN_LOC_V[ns]} · ${n.points.Node.house}. dům`);
    out += hsPara('Kde se dotýkáš přesahu', `Hranice mezi tebou a něčím větším je nejtenčí v oblasti ${HS.HOUSE_AREA[n.points.Neptune.house - 1]}. Tam přichází inspirace — a tam je i potřeba střízlivosti.`, `Neptun · ${n.points.Neptune.house}. dům`);
    const in12 = hsPlanetsIn(n, 12).filter(k => k !== 'Neptune');
    if (in12.length) out += in12.map(k => hsPara('Ve vnitřním tichu', `${K.BODY_CZ[k]}: ${HS.P_SPIRIT[k]}`, `${K.BODY_CZ[k]} · 12. dům`)).join('');
    else out += hsPara('', 'Dvanáctý dům máš prázdný — tvá duchovní cesta se neděje v ústraní, ale přímo uprostřed života: ve vztazích, práci a všedním dni.', '');
    return out;
  }
  function horoscopeChallenge(n) {
    const ss = K.signOf(n.points.Saturn.lon);
    let out = hsPara('Hlavní lekce', `Saturn v mapě označuje místo, kde život nejde zadarmo — a kde právě proto vzniká tvá největší dovednost. ${HS.SAT[ss]}`, `Saturn ${K.SIGN_LOC_V[ss]}`);
    out += hsPara('Kde tě život zkouší', `Nejvíc trpělivosti po tobě chce oblast ${HS.HOUSE_AREA[n.points.Saturn.house - 1]}. Pozdě, ale doopravdy — to je saturnský slib.`, `Saturn · ${n.points.Saturn.house}. dům`);
    const NA = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Asc','MC'];
    const HEAVY = ['Pluto','Neptune','Uranus','Saturn','Mars'];
    const N4 = { Sun:'vůli', Moon:'city', Mercury:'mysl', Venus:'lásku a hodnoty', Mars:'sílu', Jupiter:'růst a důvěru', Saturn:'řád', Uranus:'svobodu', Neptune:'citlivost', Pluto:'hloubku', Asc:'to, jak působíš', MC:'tvé směřování' };
    const TENSE_TXT = {
      Mars: (l) => `Tvá síla se otírá o ${N4[l]} — netrpělivost, hrany, přepálené starty. Není to vada, je to nevytížený motor: dej mu denní pohyb, sport nebo jasně ohraničený úkol a z tření se stane tah.`,
      Saturn: (l) => `Vnitřní nárok tlačí na ${N4[l]} — pocit „ještě to nestačí“ znáš dobře. Ta přísnost kdysi chránila; teď ji povyš na řemeslo: malé sliby sobě, důsledně splněné. Z takového napětí časem bývá nejspolehlivější síla celé mapy.`,
      Uranus: (l) => `Touha po svobodě a změně naráží na ${N4[l]} — dlouho klid, pak náhlý zlom. Uč se dělat změny v malém a dobrovolně; co měníš sám a včas, nemusí přijít výbuchem.`,
      Neptune: (l) => `Sen a citlivost občas zaplaví ${N4[l]} — hranice mezi ideálem a skutečností měkne, snadno uvěříš tomu, co chceš vidět. Kotvou jsou fakta na papíře, jasné hranice a tělo; citlivost pak slouží jako radar, ne jako záplava.`,
      Pluto: (l) => `Hlubinný tlak prověřuje ${N4[l]} — všechno, nebo nic, ovládnout, nebo zbořit. Třetí cesta je pustit kontrolu, ne odpovědnost; přesně tam se z tlaku stává tvá odolnost.`,
    };
    const tens = [];
    for (let i = 0; i < NA.length; i++) for (let j = i + 1; j < NA.length; j++) {
      const a = K.aspectBetween(n.points[NA[i]].lon, n.points[NA[j]].lon, { default: 6, sextile: 4 });
      if (a && a.kind === 'tense') tens.push({ a: NA[i], b: NA[j], ...a });
    }
    tens.sort((x, y) => x.orb - y.orb);
    const groups = {};
    for (const t of tens) {
      const heavy = HEAVY.find(h => h === t.b || h === t.a);
      const pairKey = [t.a, t.b].sort().join('|');
      const pk = ['Sun|Moon', 'Asc|Sun', 'Asc|Moon'].includes(pairKey) ? pairKey : (heavy || 'ostatni');
      if (!groups[pk]) groups[pk] = [];
      groups[pk].push({ ...t, heavy });
    }
    let cnt = 0;
    for (const pk of Object.keys(groups)) {
      if (cnt >= 3) break;
      const g = groups[pk]; const t = g[0]; cnt++;
      let txt;
      if (pk === 'Sun|Moon') txt = HS.PAIR['Sun|Moon'].tense;
      else if (pk === 'Asc|Sun') txt = HS.PAIR['Sun|Asc'].tense;
      else if (pk === 'Asc|Moon') txt = HS.PAIR['Moon|Asc'].tense;
      else if (t.heavy) { const light = t.a === t.heavy ? t.b : t.a; txt = TENSE_TXT[t.heavy](light); }
      else txt = `${HS.NOUN[t.a].charAt(0).toUpperCase() + HS.NOUN[t.a].slice(1)} a ${HS.NOUN[t.b]} se v tobě přetahují. Napětí zmizí, když obě strany dostanou úkol — pojmenuj je a nech je spolupracovat.`;
      if (g.length > 1) txt += ` Stejné téma v mapě zesiluje ještě ${g.slice(1).map(x => `${K.BODY_CZ[x.a]} ${x.cz} ${K.BODY_CZ[x.b]}`).join(' a ')}.`;
      out += hsPara('', txt, g.map(x => `${K.BODY_CZ[x.a]} ${x.cz} ${K.BODY_CZ[x.b]} · ${fmtOrb(x.orb)}`).join(' · '));
    }
    out += hsPara('', 'Překážky v mapě nejsou tresty — jsou to posilovny. Každá má na druhé straně dovednost, kterou jinak nezískáš.', '');
    return out;
  }
  HS.MC = ['Tvé směřování chce průkopnictví — vést, začínat, jít první. Kariéra roste odvahou a rychlostí; šéfovat si potřebuješ hlavně sám.','Směřuješ k trvalým hodnotám — budovat něco hmatatelného, co přetrvá. Pomalý růst, pevný výsledek; obory blízko země, krásy či peněz.','Tvé poslání jde přes slovo a propojování — psát, učit, obchodovat, komunikovat. Klidně dvě dráhy naráz.','Směřuješ k péči — vytvářet lidem zázemí a bezpečí v jakékoli podobě. Povolání s citem je tvá autorita.','Tvé poslání je vidět — tvořit, vést, inspirovat. Potřebuješ pole, kde smíš dát srdce a podpis.','Směřuješ k mistrovství řemesla — zlepšovat, léčit, dávat věci do pořádku. Tvá pověst stojí na kvalitě, ne na hluku.','Poslání skrze lidi: spojovat, vyjednávat, kultivovat. Tam, kde jiní tříští, ty ladíš — a to je profese.','Směřuješ k práci s hloubkou — krize, proměny, skryté zdroje, psychika. Autorita ti roste tam, kam se jiní bojí.','Poslání učitele a průvodce — rozšiřovat obzory, své i cizí. Práce musí mít smysl, jinak ji opustíš.','Směřuješ vzhůru dlouhým tahem — stavět, nést odpovědnost, být oporou systému. Vrchol přichází zráním a pak drží.','Poslání pro celek — inovace, společenství, budoucnost. Nejlíp pracuješ mimo šablony a hierarchie.','Směřuješ ke službě duši — umění, pomoc, léčení, tichá práce s neviditelným. Úspěch měř smyslem, ne jen čísly.'];
  HS.D6 = ['rychle a v náporech, s potřebou akce','v klidném rytmu a pořádně','pestře a v pohybu — rutina tě ubíjí','s citem pro lidi a atmosféru','s hrdostí a potřebou uznání','přesně, systematicky, poctivě','v týmu a hezkém prostředí','soustředěně a naplno, nebo vůbec','s vervou a potřebou smyslu','disciplinovaně a vytrvale','po svém a s nápadem','plynule, intuitivně, v tichu'];
  HS.P_CAREER = { Sun:'být vidět ve své roli je pro tebe bytostné — kariéra je součást identity. Hledej pole, kde smíš být plně sám sebou.', Moon:'veřejnost tě vnímá osobně a citlivě; péče je tvůj profesní dar a kariéra dýchá s tvou náladou.', Mercury:'profese slova a myšlenky — mluvit, psát, jednat. Tvé jméno dělá tvá hlava.', Venus:'profesní šarm: lidé s tebou rádi pracují. Obory krásy, vztahů a harmonie ti sedí.', Mars:'kariéra tahem — ambice je u tebe zdravá a viditelná. Jen nevaľč boje o pozice, které nestojí za krev.', Jupiter:'profesní štěstí a růst; dveře nahoru se ti otvírají snáz. Velké cíle jsou u tebe realismus.', Saturn:'kariéra jako dlouhá stavba — autorita přichází zráním a pak je nezpochybnitelná.', Uranus:'dráha se zlomy a originalitou; klasický postup není tvůj. Vybuduj vlastní pole.', Neptune:'povolání s vizí, uměním či službou; obraz o tobě může být mlhavý — dávej mu kontury sám.', Pluto:'profesní síla a vliv; dráhu měníš od základů. Moc užívej průhledně.' };
  HS.P_WORK = { Sun:'práce je pro tebe zdroj identity — všední den chce být smysluplný.', Moon:'pracovní pohoda je životní pohoda; pečuj o atmosféru na pracovišti.', Mercury:'den plný komunikace a detailů ti sedí; hlava potřebuje úkoly.', Venus:'pracuješ nejlíp v hezkém prostředí a dobrých vztazích.', Mars:'výkonný motor všedního dne — dej mu tempo, jinak pálí zevnitř.', Jupiter:'práce ti roste pod rukama; rád bereš víc — hlídej míru.', Saturn:'spolehlivost sama; uč se odpočívat bez výčitek.', Uranus:'potřebuješ volný režim — pružnou dobu a vlastní systém.', Neptune:'všední den chce ostrůvky ticha; služba druhým tě naplňuje.', Pluto:'pracuješ intenzivně a do hloubky; mocenským hrám na pracovišti se vyhýbej.' };
  HS.BODY = ['hlavu a oči','krk, šíji a hlasivky','plíce, ramena a ruce','žaludek a trávení','srdce, záda a oběh','střeva a látkovou výměnu','ledviny a bedra','podbřišek a vylučování','kyčle, stehna a játra','kolena, klouby a kosti','lýtka, kotníky a nervy','chodidla a lymfu'];
  HS.VIT = ['výbušná — rychlé nabití, rychlé vybití; potřebuje denní pohyb','vytrvalá — pomalu se rozjíždí, dlouho vydrží','nervová — dobíjí ji změna a vzduch','vlnivá — jde s citem; chraň ji před dusnem','srdeční — roste s radostí a uznáním','úsporná — svědčí jí přesné dávkování a pravidelnost','párová — táhne líp ve dvou a v rovnováze','hlubinná — obrovské rezervy, když má proč','ohnivá do dálky — potřebuje výpravy a cíl','železná — kázeň jí svědčí víc než nálada','přerývaná — skoky a průlomy; šetři nervy','proudivá — voda, hudba a spánek ji vrací'];
  HS.ASC_VIT = ['ohnivá konstituce — síla v náporu; ochlazuj hlavu a nespěchej v rekonvalescenci','pevná konstituce — velká výdrž; hlídej ztuhlost, tělo chce pohyb','vzdušná konstituce — živé nervy; dýchej, choď, spi pravidelně','citlivá konstituce — tělo mluví přes trávení a nálady; teplo a rytmus léčí','silná konstituce se srdcem v centru — radost je tvůj lék, přepětí riziko','jemnější konstituce s citlivým trávením — režim a čistá strava dělají zázraky','vyvážená konstituce — rovnováha je doslova zdravotní princip; hlídej pitný režim','houževnatá konstituce — regeneruješ z hloubky; nedrž napětí v těle','výkonná konstituce — potřebuje pohyb a vzduch; hlídej přejídání optimismem','šlachovitá, vytrvalá konstituce — stárne k lepšímu; promazávej klouby i přísnost','nervově laděná konstituce — elektrika v těle; uzemňuj se a spi','propustná konstituce — vnímá vše; spánek, voda a hranice jsou tvá medicína'];
  HS.D5 = ['Tvoříš akcí a raduješ se z pohybu — hra je pro tebe závod i dobrodružství. Začínej věci pro radost, ne jen pro výsledek.','Tvoříš rukama a smysly — zahrada, kuchyně, materiál. Radost u tebe roste pomalu a chutná dlouho.','Tvoříš slovem a nápadem — psaní, hry, improvizace. Radost je zvědavost puštěná ze řetězu.','Tvoříš citem a pamětí — z domova, vzpomínek, péče. Radost sdílená s blízkými je dvojnásobná.','Tvoření a radost jsou ti přirozené jako dech; jeviště ti patří. Tvoř i bez publika.','Tvoříš zlepšováním — řemeslo, detail, užitečná krása. Dovol si i nedokonalou radost.','Tvoříš krásou a pro druhé — estetika, hudba, společné zážitky. Radost ale potřebuje i tvé vlastní přání.','Tvoříš z hloubky — umění, které jde na dřeň. Tvá radost není lehká, ale je skutečná.','Tvoříš rozmachem — cesty, příběhy, velká plátna. Radost je svoboda a smích.','Tvoříš s kázní a formou — stavby, struktury, mistrovství. Radost si dovol dřív, než bude „zasloužená“; už je.','Tvoříš jinak než ostatní — experiment, nové formy. Radost je objev.','Tvoříš z jemných světů — hudba, obrazy, sny. Radost k tobě připlouvá; udělej jí přístav.'];
  HS.P_JOY = { Sun:'tvořivost je tvé jádro — bez vlastního díla chřadneš.', Moon:'tvoření léčí tvé emoce; děti a hra tě vracejí k sobě.', Mercury:'tvoříš slovem a vtipem; psaní je tvá hračka.', Venus:'umění a krása jsou tvůj přirozený jazyk radosti.', Mars:'radost potřebuje akci — sport, tanec, soutěž.', Jupiter:'velká hravost a štěstí v tvorbě; riskuj s mírou.', Saturn:'tvoříš vážně a trvale; dovol hře být i neužitečná.', Uranus:'originální tvůrce — tvá radost je vynález.', Neptune:'múzická duše — hudba, film, sen; tvoř z vln.', Pluto:'tvorba jako proměna; co vytvoříš, mění i druhé.' };
  HS.MERC = ['Myslíš rychle a rovnou — rozhodnutí padají v letu. Síla: pohotovost. Riziko: střelba od boku; jednou vydechni.','Myslíš pomalu a důkladně — co promyslíš, platí. Nesnaž se stíhat rychlé; tvá váha je v rozvaze.','Merkur je tu doma: hbitá hlava, dar řeči, věčná zvědavost. Uč se myšlenky dokončovat, ne jen sbírat.','Myslíš citem a pamětí — rozhoduje, jak to cítíš. Tvá slova umí pohladit; jen ať vzpomínka nerozhoduje za dnešek.','Myslíš a mluvíš s jistotou — tvá slova mají váhu a styl. Přesvědčuješ srdcem; nech zazářit i druhé.','Přesná analytická hlava — vidíš detail i chybu. Dar rozlišování; kritika ať slouží, ne soudí.','Myslíš ve dvojicích — pro a proti, ty a druhý. Diplomatické slovo je tvůj dar; rozhodnutí tvůj trénink.','Myslíš do hloubky a mlčíš strategicky — vidíš motivy pod slovy. Pravda je tvůj skalpel; řež s citem.','Myslíš ve velkém — smysl, souvislosti, vize. Detail deleguj a hlídej sliby dané v nadšení.','Myslíš prakticky a v plánech — tvé slovo je smlouva. Suchý humor, pevný úsudek; dovol hlavě i hrát.','Myslíš dopředu a z boku — vidíš, co přijde. Nápady předbíhají dobu; překládej je ostatním trpělivě.','Myslíš obrazně a intuitivně — víš věci dřív, než je umíš říct. Mluv v příbězích; fakta si ověřuj.'];
  HS.P_MIND = { Sun:'slovo a učení jsou součást tvé identity; potřebuješ mluvit za sebe.', Moon:'mluvíš citem a nálada dne barví tvá slova.', Mercury:'komunikace na druhou — psaní, jazyky, obchod ti jdou samy.', Venus:'mluvíš hezky a rád; slovo je u tebe umění vztahu.', Mars:'ostré pero i jazyk; debata je tvůj sport — hraj fér.', Jupiter:'učitel od přírody; slova s přesahem a nakažlivé nadšení.', Saturn:'mluvíš méně a přesně; psané slovo a struktura jsou tvá síla.', Uranus:'blesková hlava; nápady mimo řadu a řeč vlastním rytmem.', Neptune:'poetická mysl; mluvíš obrazy — krásné pro umění, ošidné pro smlouvy.', Pluto:'slova s váhou tajemství; umíš přesvědčit — užívej to čistě.' };
  HS.MERC_RX = 'Merkur máš v nativu retrográdní — myslíš dovnitř a po svém; závěru předchází vnitřní zrání. Není to vada řeči, je to hloubka zpracování: piš si a dopřávej si čas na odpověď.';
  HS.STAR_TXT = { alcyone:'Plejády — hvězdy vidění a citlivosti; dar vhledu, který chce soucit, ne únik.', hyades:'Hyády — hvězdy prožitku naplno; síla, která zraje sebekázní.', aldebaran:'Aldebaran, královská hvězda východu — úspěch skrze integritu; drž slovo a nic tě nezastaví.', rigel:'Rigel — hvězda učitele a stavitele; úspěch skrze předávání znalostí.', bellatrix:'Bellatrix — bojovnice Orionu; odvaha a strategie, vítězství skrze rozvahu.', mintaka:'Mintaka — hvězda pásu Orionu; smysl pro řád a správné načasování.', betelgeuse:'Betelgeuse — velká šťastná hvězda; úspěch a síla, které rostou velkorysostí.', sirius:'Sirius — nejjasnější hvězda nebe; posvátný oheň, věhlas a strážcovství.', procyon:'Procyon — rychlý úspěch; nauč se ho udržet trpělivostí.', regulus:'Regulus, královská hvězda severu — srdce Lva: vůdcovství, které stojí a padá s ušlechtilostí. Vyhni se odplatě a koruna drží.', arcturus:'Arcturus — průkopník a průvodce; jdeš první a prošlapáváš cestu jiným.', hadar:'Hadar — hvězda oddanosti a služby celku.', alphacen:'Alfa Centauri — hvězda vztahu dvou sluncí; síla rovnocenného partnerství.', antares:'Antares, královská hvězda západu — srdce Štíra: intenzita, odvaha a regenerace; síla, která chce čistý záměr.', vega:'Vega — hvězda harmonie a umění; charisma, které léčí krásou.', sheliak:'Sheliak — lyra jemných tónů; umění vyjádřit nevyslovitelné.', fomalhaut:'Fomalhaut, královská hvězda jihu — vize a ideály; úspěch skrze čistotu snu.', andromeda:'Andromeda — vysvobození z řetězů; dar pomáhat spoutaným.', schedar:'Schedar — důstojnost královny; klidná autorita.', polaris:'Polárka — hvězda severu; jsi bod, podle kterého se jiní orientují.', tauceti:'Tau Ceti — tiché blízké slunce; stálost a domov v sobě.', zetaret:'Zeta Reticuli — hvězda hlubokého poznání za hranou známého.' };
  function horoscopeWork(n) {
    const mc = K.signOf(n.points.MC.lon), d6 = K.signOf(n.cusps[6]);
    let out = hsPara('Kam směřuješ', `MC je nejvyšší bod mapy — směr, kterým tvůj život veřejně míří: povolání, pověst, stopa, kterou zanecháš. ${HS.MC[mc]}`, `MC ${K.SIGN_LOC_V[mc]}`);
    const in10 = hsPlanetsIn(n, 10);
    if (in10.length) out += in10.map(k => hsPara('', `${K.BODY_CZ[k]} v domě povolání: ${HS.P_CAREER[k]}`, `${K.BODY_CZ[k]} · 10. dům`)).join('');
    let denni = `Všední práci děláš ${HS.D6[d6]}.`;
    const in6 = hsPlanetsIn(n, 6);
    out += hsPara('Každodenní práce', denni + (in6.length ? '' : ' Šestý dům máš bez planet — práce sama o sobě není tvé osudové téma; důležitější je, kam míří (viz výše).'), `6. dům ${K.SIGN_LOC_V[d6]}`);
    if (in6.length) out += in6.map(k => hsPara('', `${K.BODY_CZ[k]} ve všedním dni: ${HS.P_WORK[k]}`, `${K.BODY_CZ[k]} · 6. dům`)).join('');
    out += hsPara('', 'Povolání je to, čím se živíš. Poslání je to, co skrze tebe chce na svět. Nejlepší roky jsou ty, kdy se ta dvě slova potkají.', '');
    return out;
  }
  function horoscopeHealth(n) {
    const a = K.signOf(n.points.Asc.lon), ma = K.signOf(n.points.Mars.lon), sa = K.signOf(n.points.Saturn.lon);
    let out = hsPara('Tvá konstituce', `Ascendent dává tělu základní ladění: ${HS.ASC_VIT[a]}.`, `Ascendent — ${K.SIGNS[a]}`);
    out += hsPara('Tvá energie', `Tvoje energie je ${HS.VIT[ma]}. Nejsnáz ji dobíjíš i vydáváš v oblasti ${HS.HOUSE_AREA[n.points.Mars.house - 1]}.`, `Mars ${K.SIGN_LOC_V[ma]} · ${n.points.Mars.house}. dům`);
    out += hsPara('Co šetřit', `Saturn ukazuje, kde tělo časem tuhne a chce péči: u tebe ${HS.BODY[sa]}. Pravidelnost tu zmůže víc než nárazové odhodlání.`, `Saturn ${K.SIGN_LOC_V[sa]}`);
    out += hsPara('', 'Tohle je energetický portrét, ne diagnóza — se zdravím vždy k lékaři. Mapa umí jediné: napovědět, kde se vyplatí prevence.', '');
    return out;
  }
  function horoscopeJoy(n) {
    const d5 = K.signOf(n.cusps[5]);
    let out = hsPara('Jak tvoříš a raduješ se', `Pátý dům je tvá hra: tvořivost, radost, láska, která se dvoří, a děti — všechno, co děláš proto, že tě to těší. ${HS.D5[d5]}`, `5. dům ${K.SIGN_LOC_V[d5]}`);
    const in5 = hsPlanetsIn(n, 5);
    if (in5.length) out += in5.map(k => hsPara('', `${K.BODY_CZ[k]} v domě tvořivosti: ${HS.P_JOY[k]}`, `${K.BODY_CZ[k]} · 5. dům`)).join('');
    out += hsPara('Kde nacházíš krásu', `Radost a krásu ti nejsnáz nosí oblast ${HS.HOUSE_AREA[n.points.Venus.house - 1]}. Choď tam, když je ti šedivo.`, `Venuše · ${n.points.Venus.house}. dům`);
    out += hsPara('', 'Radost není odměna za výkon — je to palivo. Den s kouskem tvé hry unese dvakrát tolik povinností.', '');
    return out;
  }
  function horoscopeMind(n) {
    const me = K.signOf(n.points.Mercury.lon);
    let out = hsPara('Jak myslíš a mluvíš', `Merkur je tvá hlava a jazyk — způsob, jakým vnímáš, zpracováváš a předáváš. ${HS.MERC[me]}`, `Merkur ${K.SIGN_LOC_V[me]}${n.points.Mercury.retro ? ' · retrográdní' : ''}`);
    if (n.points.Mercury.retro) out += hsPara('', HS.MERC_RX, '');
    out += hsPara('Kde ti hlava pracuje nejvíc', `Myšlení a slovo nejvíc zapojuješ v oblasti ${HS.HOUSE_AREA[n.points.Mercury.house - 1]}.`, `Merkur · ${n.points.Mercury.house}. dům`);
    const in3 = hsPlanetsIn(n, 3).filter(k => k !== 'Mercury');
    if (in3.length) out += in3.map(k => hsPara('', `${K.BODY_CZ[k]} v domě komunikace: ${HS.P_MIND[k]}`, `${K.BODY_CZ[k]} · 3. dům`)).join('');
    out += hsPara('', 'Rozumět vlastní hlavě znamená vědět, kdy jí věřit hned — a kdy jí dát den.', '');
    return out;
  }
  function horoscopeStars(n) {
    const mine = n.stars.filter(st => st.mine).sort((a, b) => b.strength - a.strength);
    let out = hsPara('', 'Kromě planet nese tvá mapa i stálice — vzdálená slunce, která v okamžiku narození stála na tvých bodech. Jsou to tiché podpisy: neurčují všední den, ale barví celý příběh.', '');
    if (!mine.length) return out + hsPara('', 'V tuto chvíli nemáš žádnou hlavní hvězdu — buď je čas narození nepřesný, nebo tvůj příběh píšou čistě planety. I to je odpověď: tvá mapa stojí na tom, co děláš, ne na tom, co ti bylo dáno.', '');
    out += mine.slice(0, 4).map(st => hsPara(st.name.split(' (')[0], (HS.STAR_TXT[st.id] || 'Hvězda, která v okamžiku tvého narození stála na důležitém bodě mapy — vzácný podpis, který stojí za pozornost.') + (st.house ? ` V tvé mapě působí v oblasti ${HS.HOUSE_AREA[st.house - 1]}.` : ''), `${st.name} · ${st.house}. dům`)).join('');
    out += hsPara('', 'Podrobnosti — přesné polohy, parany a dny, kdy se tvých hvězd něco dotkne — najdeš níže v sekci Tvé hvězdy a v kalendáři pod značkou ✦.', '');
    return out;
  }

    const PRINT_STYLE = `<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#1B2436;background:#FDFBF6;margin:0;padding:34px 22px;line-height:1.6}
  .wrap{max-width:680px;margin:0 auto}
  header{text-align:center;border-bottom:1px solid #D8CBA8;padding-bottom:18px;margin-bottom:8px}
  header .brand{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#9A7B33}
  header h1{margin:10px 0 4px;font-weight:500;font-size:30px}
  header .meta{font-size:14px;color:#5A6478}
  section{page-break-inside:auto;margin-top:26px}
  h2{font-size:12.5px;letter-spacing:.22em;text-transform:uppercase;color:#9A7B33;border-bottom:1px solid #E7DDC4;padding-bottom:7px;font-weight:600;page-break-after:avoid}
  .hsp{padding:11px 0;border-bottom:1px solid #EFE8D6;page-break-inside:avoid}
  .hsp:last-child{border-bottom:0}
  .hsp h4{margin:0 0 5px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9A7B33;font-weight:600}
  .hsh{margin:14px 0 0;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9A7B33;font-weight:600}
  .hsp p{margin:0;font-size:15px}
  .hstag{display:block;margin-top:5px;font-size:11px;color:#8A93A6;font-family:'Courier New',monospace}
  footer{margin-top:34px;padding-top:14px;border-top:1px solid #D8CBA8;font-size:12.5px;color:#8A93A6;text-align:center}
  .noprint{position:fixed;right:16px;top:16px;display:flex;gap:8px}
  .noprint button{font:inherit;font-size:12.5px;padding:9px 16px;border-radius:999px;border:1px solid #9A7B33;background:#14213C;color:#F2E9D4;cursor:pointer}
  @media print{.noprint{display:none}body{padding:0;background:#fff}}
</style>`;
  function synDoc() {
    const selRec = S.synId ? synFind(S.synId) : null; if (!selRec || !S.natal) return '';
    const A = activeProfile();
    let body;
    try {
      const nb = K.natalChart({ ...selRec, lat: +selRec.lat, lon: +selRec.lon, alt: +selRec.alt || 200, y: +selRec.y, m: +selRec.m, d: +selRec.d, hh: +selRec.hh, mm: +selRec.mm, tz: selRec.tz || TZ }, new Date());
      body = synastry(S.natal, nb, (A.name || 'A').split(' ')[0], (selRec.name || 'B').split(' ')[0]);
    } catch (e) { return ''; }
    const meta = (p) => `${p.d}. ${p.m}. ${p.y} v ${p.hh}:${String(p.mm).padStart(2, '0')} · ${esc(p.place || '')}`;
    return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><title>Horoskop dvou map — ${esc(A.name)} a ${esc(selRec.name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
${PRINT_STYLE}</head><body>
<div class="noprint"><button onclick="window.print()">Vytisknout / uložit PDF</button></div>
<div class="wrap">
<header><div class="brand">Nebeský kompas · horoskop dvou map</div><h1>${esc(A.name)} &amp; ${esc(selRec.name)}</h1><div class="meta">${meta(A)}<br>${meta(selRec)}</div></header>
<section>${body}</section>
<footer>Spočítáno v Nebeském kompasu · ${new Date().toLocaleDateString('cs-CZ')}</footer>
</div></body></html>`;
  }
  function horoscopeDoc(n) {
    const prof = activeProfile();
    const parts = HS_THEMES.map(t => `<section><h2>${t[1]}</h2>${t[2](n)}</section>`).join('');
    const meta = `${prof.d}. ${prof.m}. ${prof.y} v ${prof.hh}:${String(prof.mm).padStart(2, '0')} · ${esc(prof.place)}`;
    return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><title>Horoskop — ${esc(prof.name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
${PRINT_STYLE}</head><body>
<div class="noprint"><button onclick="window.print()">Vytisknout / uložit PDF</button></div>
<div class="wrap">
<header><div class="brand">Nebeský kompas · tvůj hvězdný kalendář</div><h1>${esc(prof.name)}</h1><div class="meta">${meta} · domy Placidus · tropický zvěrokruh</div></header>
<section><h2>Jak číst tento horoskop</h2><p>Mapa je zápis nebe v okamžiku tvého prvního nádechu — chvíle, kdy tu poprvé byl někdo, komu se dalo něco vložit. Jako tři sudičky u kolébky ti ten okamžik vložil dary i úkoly: <b>co ti bylo dáno do vínku</b>. Mapa je zrcadlo a jazyk — ukazuje, s čím jsi přišel; jak s tím naložíš, je tvůj příběh.</p></section>
${parts}
<footer>Sestaveno ${new Date().toLocaleDateString('cs-CZ')} · Oáza Adamanthea · oaza-adamanthea.cz<br>Mapa je zrcadlo — popis nástrojů, se kterými jsi přišel.</footer>
</div></body></html>`;
  }

  // ===================== roční výhled =====================
  HS.TGT_Y = { Sun: 'tvé Slunce (jádro, vůle a směr)', Moon: 'tvou Lunu (city, potřeby, domov)', Mercury: 'tvůj Merkur (myšlení a komunikaci)', Venus: 'tvou Venuši (lásku, vztahy a hodnoty)', Mars: 'tvůj Mars (sílu a akceschopnost)', Asc: 'tvůj Ascendent (tebe a tvé vystupování)', MC: 'tvé MC (povolání a směřování)' };
  HS.TR_Y = {
    Jupiter: { conj: 'Jupiter se postaví přímo na {T}. Rok otevřených dveří: co v téhle části života začneš, roste snáz než jindy — přichází nabídky, lidé i chuť. Jediné riziko je nechat období jen proplout; štěstí přeje připraveným plánům. Řekni si o víc, teď se dává.', harm: 'Jupiter podpoří {T} z klidného úhlu. Nečekej ohňostroj — spíš se věci daří: dveře jdou otevřít, lidé vychází vstříc, náhody hrají pro tebe. Dobrý čas rozšířit, co už funguje.', tense: 'Jupiter tlačí na {T} — všechno chce být větší: sliby, výdaje, plány, porce. Optimismus je skvělé palivo, ale mizerný řidič; dej mu rozpočet, kalendář a jedno velké ano místo pěti polovičatých. Pak z období vytěžíš růst bez kocoviny.' },
    Saturn: { conj: 'Saturn dolehne na {T}. Velká inventura: život prověří, co je v téhle oblasti postavené poctivě — to potvrdí a zpevní; co stálo na písku, nechá spadnout. Bývá to náročné, ale patří to k nejcennějším obdobím celého cyklu: co z něj vyjde, nese dlouhé roky. Zjednoduš, dotáhni, nelži si.', harm: 'Saturn podrží {T} pevným úhlem. Nenápadné, ale vzácné období: disciplína nese viditelné plody, autorita roste, dohody drží. Cokoli teď postavíš — návyk, projekt, vztah — má neobvykle pevné základy.', tense: 'Saturn brzdí {T} — věci jdou pomaleji, překážky se množí a snadno vzniká pocit zdi. Není to trest, je to kontrola základů: co skřípe, má být opraveno teď, dokud je to levné. Zpomal dobrovolně a zeď se promění ve schod.' },
    Uranus: { conj: 'Uran zasáhne {T} — období zlomů a osvobození. Co bylo dlouho těsné, praskne; přijde chuť všechno předělat, a část té chuti je zdravá. Dělej změny sám, po kouscích a dřív, než je udělá život za tebe — dobrovolná změna je vždycky levnější než vynucená.', harm: 'Uran osvěží {T} — změny jdou lehce a vyplácí se: nové cesty, nová řešení, čerstvý vzduch v zajetých kolejích. Ideální období zkusit věci jinak, přeskládat je, modernizovat.', tense: 'Uran rozechvěje {T} — nečekané zvraty, neklid, chuť utéct nebo všechno shodit ze stolu. Potřeba změny je pravdivá; jen ať její formu vybereš ty, ne náhoda. Drž kotvu v podstatném a experimentuj v malém.' },
    Neptune: { conj: 'Neptun obestře {T} mlhou i inspirací. Zjemní se vnímání, zesílí sny, tvorba a soucit — a s nimi i schopnost vidět to, co vidět chceš. Pro duchovní a uměleckou práci vzácný čas; pro smlouvy, sliby a velká rozhodnutí čas svědků, faktů a druhého názoru.', harm: 'Neptun zjemní {T} — silnější intuice, živější sny, víc soucitu se sebou i s druhými. Dobré období pro vnitřní práci, tvorbu, meditaci a odpouštění. Tělo chce víc spánku a vody — dej mu je.', tense: 'Neptun rozmlžuje {T} — únava, iluze, nejasné situace i lidé, kteří nejsou tím, kým se zdají. V mlze nic trvalého nepodepisuj: rozhoduj s odstupem, ověřuj dvakrát a spi. Mlha se zvedne — a ukáže se, co bylo skutečné.' },
    Pluto: { conj: 'Pluto přeorává {T} — pomalu, do hloubky a nadobro. Staré struktury v téhle oblasti odchází, ať se držíš, nebo ne; smyslem období je nechat jít, co dosloužilo, a zachránit jen to, co má kořeny. Z takových let se vychází jiný — a o poznání silnější.', harm: 'Pluto prohlubuje {T} — tiché, vytrvalé posilování zevnitř. Roste tvá odolnost, vliv a schopnost jít na dřeň. Co v tomhle období vybuduješ, ponese roky; je to i dobré okno pro terapii a práci se stínem.', tense: 'Pluto tlačí na {T} — mocenské tahanice, tlak okolností a pokušení všechno uřídit silou. Skutečný úkol je opak: pustit kontrolu, ne odpovědnost. Když něco končí, uvolňuje místo — nedrž dveře, kterými už prošel průvan.' },
  };
  HS.JUP_H = ['rok osobního růstu — víc sebevědomí, energie a viditelnosti; dobré období začít něco sám za sebe', 'přeje financím a vlastní hodnotě — příjmy mohou růst, stejně jako chuť utrácet', 'přeje učení, psaní, jednáním a blízkému okolí — rok plný kontaktů a nápadů', 'přeje domovu a rodině — dobré období pro bydlení, kořeny a usmíření', 'přeje tvorbě, radosti, lásce a dětem — rok, kdy si máš hrát ve velkém', 'přeje práci a zdraví — víc zakázek i chuti pečovat o tělo; jen si toho nenaber přespříliš', 'přeje partnerství — vztahy rostou, uzavírají se svazky i spojenectví', 'přeje společným financím a hlubokým proměnám — investice, dědictví, terapie', 'přeje cestám, studiu a víře — rok rozšířených obzorů', 'přeje kariéře — postup, uznání, viditelnost; řekni si o víc', 'přeje přátelstvím, komunitě a vizím — správní lidé přichází sami', 'přeje nitru — rok tichého zrání a duchovní práce; úroda bude vidět později'];
  HS.SAT_H = ['zkouší tebe samotného — tělo, identitu, hranice; rok převzetí odpovědnosti za sebe', 'zkouší finance — rozpočet, dluhy, vlastní hodnotu; co srovnáš, drží roky', 'zkouší komunikaci a závazky slova — mluv méně a přesněji', 'zkouší domov a kořeny — rodinné povinnosti a dospělé srovnání s minulostí', 'zkouší radost — uč se tvořit a milovat i s odpovědností, ne místo ní', 'zkouší práci a tělo — režim, zdraví, poctivé řemeslo; skvělý rok na disciplínu', 'zkouší vztahy — co je vážné, se prohloubí; co je vyčpělé, dostane termín', 'zkouší sdílené zdroje — dluhy, dědictví, důvěru; velká inventura závazků', 'zkouší přesvědčení — víra dostane zkoušku praxí; studuj do hloubky', 'zkouší kariéru — víc odpovědnosti, méně potlesku; stavíš základy pozice na příští roky', 'zkouší přátelství a plány — zůstanou ti ti praví a cíle, které unesou tíhu', 'zkouší nitro — únava starých vzorců; rok úklidu v pozadí, spánku a odpuštění'];
  function horoscopeYear(n) {
    const ck = activeId + '|' + TODAY_KEY;
    if (S._year && S._year.k === ck) return S._year.html;
    const now = new Date();
    const fmtD = (d) => { const q = K.tzParts(d, TZ); return `${q.d}. ${K.MONTH_GEN[q.m - 1]}` + (q.y !== K.tzParts(now, TZ).y ? ` ${q.y}` : ''); };
    const TRP = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    const TGT = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Asc', 'MC'];
    const STEP = 5, NPTS = 74;
    const samples = [];
    for (let i = 0; i <= NPTS; i++) {
      const d = new Date(now.getTime() + i * STEP * 86400000);
      const pos = K.positions(d);
      samples.push({ d, lon: Object.fromEntries(TRP.map(b => [b, pos[b].lon])) });
    }
    const dif = (a, b) => { let x = Math.abs(((a - b) % 360 + 360) % 360); return x > 180 ? 360 - x : x; };
    const ASP = [[0, 'konjunkce', 'conj'], [90, 'kvadratura', 'tense'], [120, 'trigon', 'harm'], [180, 'opozice', 'tense']];
    const items = [];
    for (const tr of TRP) for (const tg of TGT) for (const [ang, cz, tone] of ASP) {
      const wins = []; let cur = null, best = 99;
      for (const sm of samples) {
        const err = Math.abs(dif(sm.lon[tr], n.points[tg].lon) - ang);
        if (err <= 3) { if (!cur) cur = { from: sm.d, to: sm.d }; cur.to = sm.d; if (err < best) best = err; }
        else if (cur) { wins.push(cur); cur = null; }
      }
      if (cur) wins.push(cur);
      if (wins.length) items.push({ tr, tg, ang, cz, tone, wins, best });
    }
    const W = { Pluto: 5, Neptune: 4, Uranus: 3, Saturn: 2, Jupiter: 1 };
    items.sort((a, b) => W[b.tr] - W[a.tr] || a.best - b.best);
    const rangeTxt = (wins) => wins.map(w => (w.from.getTime() - now.getTime() < 6 * 86400000 ? `právě běží, do ${fmtD(w.to)}` : `${fmtD(w.from)} – ${fmtD(w.to)}`)).join(', potom ');
    // domy Jupitera a Saturnu během roku
    const houseRanges = (body) => {
      const out = [];
      for (let i = 0; i <= 12; i++) {
        const d = new Date(now.getTime() + i * 30.4 * 86400000);
        const h = K.houseOf(K.positions(d)[body].lon, n.cusps);
        if (!out.length || out[out.length - 1].h !== h) out.push({ h, from: d });
      }
      return out;
    };
    const jh = houseRanges('Jupiter'), sh = houseRanges('Saturn');
    let html = `<div class="hsp hsintro-note"><svg class="hsorn" viewBox="0 0 80 80" aria-hidden="true" fill="none"><defs><linearGradient id="hsog" gradientUnits="userSpaceOnUse" x1="40" y1="10" x2="40" y2="72"><stop offset="0" stop-color="#F7E3A8"/><stop offset="1" stop-color="#D9A54A"/></linearGradient><radialGradient id="hsor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF3D2" stop-opacity=".9"/><stop offset=".5" stop-color="#F3C97F" stop-opacity=".35"/><stop offset="1" stop-color="#F3C97F" stop-opacity="0"/></radialGradient></defs><circle cx="40" cy="40" r="33" stroke="url(#hsog)" stroke-width=".9" opacity=".45"/><circle cx="40" cy="40" r="26" stroke="url(#hsog)" stroke-width=".7" opacity=".3" stroke-dasharray="2 5"/><ellipse cx="40" cy="50" rx="20" ry="13" fill="url(#hsor)"/><path d="M27 54a13 13 0 0 1 26 0" stroke="url(#hsog)" stroke-width="1.5"/><g stroke="url(#hsog)" stroke-width="1.1" stroke-linecap="round"><path d="M40 33v-5M28.5 37l-2.8-3.4M51.5 37l2.8-3.4M22 47h-4M58 47h4M32.6 34.6l-1.8-4M47.4 34.6l1.8-4"/></g><line x1="16" y1="54" x2="64" y2="54" stroke="url(#hsog)" stroke-width="1.1" opacity=".85"/><g stroke="url(#hsog)" stroke-width="1.1" stroke-linecap="round" opacity=".85"><path d="M28 58h8M44 58h8M32 62h6M42 62h6M36 66h8"/></g><path d="M40 12l1.1 3 3 1.1-3 1.1-1.1 3-1.1-3-3-1.1 3-1.1z" fill="url(#hsog)" opacity=".9"/><circle cx="21" cy="24" r="1.1" fill="url(#hsog)" opacity=".7"/><circle cx="60" cy="26" r=".9" fill="url(#hsog)" opacity=".6"/></svg><p>Roční výhled čte počasí nad tvou mapou: kudy půjdou v příštích dvanácti měsících (od ${fmtD(now)}) pomalé planety, kdy nastanou hlavní období a o čem budou. Kdo jsi, čte nativní horoskop.</p></div>`;
    const houseStory = (name, intro, rs, bank) => rs.map((r, i) => i === 0
      ? `${name} — ${intro} — ${rs.length > 1 ? `do ${fmtD(rs[1].from)}` : 'letos'} prochází tvým ${r.h}. domem: ${bank[r.h - 1]}.`
      : `Od ${fmtD(r.from)} přejde do tvého ${r.h}. domu: ${bank[r.h - 1]}.`).join(' ');
    html += hsPara('Kde ti roste štěstí', houseStory('Jupiter', 'planeta růstu a příležitostí', jh, HS.JUP_H), `Jupiter · ${jh.map(r => r.h + '. dům').join(' → ')}`);
    html += hsPara('Co letos stavíš', houseStory('Saturn', 'planeta řádu a zrání', sh, HS.SAT_H), `Saturn · ${sh.map(r => r.h + '. dům').join(' → ')}`);
    const groups = {};
    for (const it of items) {
      const gk = it.tr + '|' + it.tone;
      if (!groups[gk]) groups[gk] = { tr: it.tr, tone: it.tone, tgs: [], pairs: [], wins: [], best: 99 };
      const g = groups[gk];
      g.tgs.push(it.tg); g.pairs.push(`${K.BODY_CZ[it.tr]} ${it.cz} ${K.BODY_CZ[it.tg]}`);
      g.wins = g.wins.concat(it.wins); g.best = Math.min(g.best, it.best);
    }
    const glist = Object.values(groups).sort((a, b) => W[b.tr] - W[a.tr] || a.best - b.best).slice(0, 5);
    if (glist.length) {
      html += `<h4 class="hsh">Velká témata roku</h4>`;
      for (const g of glist) {
        // sloučit překrývající se okna (mezera do 15 dnů)
        g.wins.sort((a, b) => a.from - b.from);
        const merged = [];
        for (const wn of g.wins) {
          const last = merged[merged.length - 1];
          if (last && wn.from - last.to <= 15 * 86400000) { if (wn.to > last.to) last.to = wn.to; }
          else merged.push({ from: wn.from, to: wn.to });
        }
        const w1 = merged[0];
        const running = w1.from.getTime() - now.getTime() < 6 * 86400000;
        const title = running ? `Právě běží — do ${fmtD(w1.to)}` : `${fmtD(w1.from)} – ${fmtD(w1.to)}`;
        const tgsTxt = g.tgs.map(t => HS.TGT_Y[t]).join(' a zároveň ');
        let txt = HS.TR_Y[g.tr][g.tone].replace('{T}', tgsTxt);
        if (merged.length > 1) txt += ` Vrátí se ještě ${merged.slice(1).map(x => `${fmtD(x.from)} – ${fmtD(x.to)}`).join(' a ')}.`;
        html += hsPara(title, txt, `${g.pairs.join(' · ')} · orbis do 3°`);
      }
    } else html += hsPara('', 'Pomalé planety letos tvou mapu míjejí bez přesných úhlů — klidnější rok bez velkých vnějších témat. O rytmu rozhodují rychlé vlivy: sleduj kalendář.', '');
    // zatmění
    const ecl = [];
    let qy = K.tzParts(now, TZ).y, qm = K.tzParts(now, TZ).m;
    for (let i = 0; i < 12; i++) {
      for (const e of monthEvents(qy, qm)) if (e.eclipse && e.date > now) {
        const pos = K.positions(e.date);
        const solar = (e.title || '').includes('Slunce');
        const lon = solar ? pos.Sun.lon : pos.Moon.lon;
        ecl.push({ date: e.date, solar, house: K.houseOf(lon, n.cusps) });
      }
      qm++; if (qm > 12) { qm = 1; qy++; }
    }
    const eSeen = new Set();
    const eFin = ecl.filter(e => { const k = e.date.toISOString().slice(0, 10); if (eSeen.has(k)) return false; eSeen.add(k); return true; }).slice(0, 4);
    if (eFin.length) {
      html += `<h4 class="hsh">Zatmění roku</h4>`;
      for (const e of eFin) {
        html += hsPara('', e.solar
          ? `Zatmění Slunce ${fmtD(e.date)} otevře novou kapitolu v oblasti ${HS.HOUSE_AREA[e.house - 1]} — začátky z tohoto období mívají neobvyklou váhu.`
          : `Zatmění Měsíce ${fmtD(e.date)} osvětlí a uzavře téma v oblasti ${HS.HOUSE_AREA[e.house - 1]} — něco dozraje k viditelnosti, nebo ke konci.`,
          `${e.solar ? 'sluneční' : 'měsíční'} zatmění · ${e.house}. dům`);
      }
    }
    html += hsPara('', 'Tranzity nejsou příkazy — jsou to termíny témat. Když víš, o čem období je, přestáváš s ním bojovat a začínáš ho používat.', '');
    S._year = { k: ck, html };
    return html;
  }

  // ===================== partnerský horoskop =====================
  HS.NEED = ['upřímnost, pohyb a možnost řešit věci hned', 'klid, stálost a smyslové bezpečí', 'rozhovor, pojmenování a rozptýlení', 'blízkost, domov a věrnou paměť srdce', 'pozornost, radost a prostor zazářit', 'řád, užitečnost a klid v uklizeném', 'harmonii, krásu a společnost', 'hloubku, pravdivost a pomalu budovanou důvěru', 'prostor, smysl a naději', 'spolehlivost, respekt a čas', 'vzduch, svobodu a rozumový odstup', 'ticho, jemnost a čas o samotě'];
  HS.SYN = {
    'Sun|Sun': { conj: 'Dvě slunce na stejném místě — rozumíte si beze slov, ale soupeříte o stejné jeviště. Střídejte se v hlavní roli.', harm: 'Vaše podstaty táhnou stejným směrem — je vám spolu přirozeně dobře a posilujete si sebevědomí.', tense: 'Dvě vůle, dva směry. Respekt k odlišné cestě toho druhého je tu podmínka — a zároveň největší dar, který si můžete dát.' },
    'Moon|Sun': { conj: 'Vůle jednoho a city druhého splývají — hluboké porozumění, pocit „ty mě znáš“. Klasický znak dlouhých svazků.', harm: 'Jeden svítí, druhý hřeje — vůle a cit se u vás doplňují bez námahy. Vzácný základ každodenní pohody.', tense: 'Co jeden chce, druhého citově dře. Neznamená to nesoulad povah — jen nutnost víc říkat nahlas, co se děje uvnitř.' },
    'Moon|Moon': { conj: 'Vaše nitra mluví stejným jazykem — náladu druhého poznáte dřív, než promluví. Pozor jen na společné propady: kdo dnes drží hladinu?', harm: 'Citové rytmy si rozumí — doma je vám spolu dobře, potřeby se potkávají. Základ, na kterém se dá stavět všechno ostatní.', tense: 'Každý potřebujete jiné bezpečí — co jednoho uklidňuje, druhého dusí. Řešení není splynout, ale znát návod toho druhého.' },
    'Mercury|Mercury': { conj: 'Myslíte podobně — rozhovor u vás teče sám. Riziko jediné: mluvit o všem, jen ne o tom podstatném.', harm: 'Domluvíte se snadno a rádi — slova jsou u vás most, ne zbraň.', tense: 'Dva různé jazyky: jeden mluví fakty, druhý dojmy. Nedorozumění tu nejsou zlá vůle — ptejte se „jak to myslíš?“ dřív, než se urazíte.' },
    'Sun|Venus': { conj: 'Náklonnost na první pohled — jeden v druhém vidí krásu a rád ji ukazuje světu. Vztah, který zkrášluje oba.', harm: 'Máte se rádi snadno — obdiv, vkus a radost ze společných věcí. Vztah s přirozeným půvabem.', tense: 'Přitažlivost je, ale vkus a hodnoty se rozchází — co jeden miluje, druhý nechápe. Kupujte si zážitky odděleně a lásku společně.' },
    'Moon|Venus': { conj: 'Něha potkává potřebu — umíte se navzájem opečovat přesně tak, jak to ten druhý potřebuje. Jeden z nejsladších kontaktů vůbec.', harm: 'Cit a láska si rozumí — vztah, ve kterém je měkko. Chraňte si to před provozem všedního dne.', tense: 'Projev lásky jednoho míjí potřebu druhého — dává se, ale nedochází to. Naučte se navzájem svůj jazyk lásky; je jiný, ne horší.' },
    'Mars|Sun': { conj: 'Energie na druhou — spolu hory přenesete, nebo se o ně pohádáte. Dejte té síle společný projekt, jinak si najde vás.', harm: 'Akce a vůle spolupracují — jeden druhého uvádí do pohybu. Skvělé pro společné podnikání i sport.', tense: 'Jiskří to — přitažlivost i třenice ze stejného zdroje. Hádky budou; učte se je vést fér a krátce, bez ran pod pás.' },
    'Mars|Moon': { conj: 'Vášeň a cit v jednom bodě — silná přitažlivost, rychlé emoce. Krásné a hořlavé: zacházejte s ohněm vědomě.', harm: 'Touha a něha v rovnováze — vztah, kde se cit umí projevit i tělem. Živé a zdravé spojení.', tense: 'Jeden svou razancí nechtěně zraňuje citlivá místa druhého. Klíč: brzdit první reakci a říkat „tohle mi ubližuje“ dřív, než se střílí zpátky.' },
    'Venus|Venus': { conj: 'Stejný vkus, stejné potěšení — víte, co druhého těší, protože to těší i vás.', harm: 'Vaše představy o lásce a kráse ladí — snadno se domluvíte, co je „hezky spolu“.', tense: 'Jiný vkus, jiné projevy lásky. Nic vážného — jen nechtějte, aby druhý miloval vaším způsobem.' },
    'Mars|Venus': { conj: 'Učebnicová přitažlivost — magnetismus, který nestárne. Držte ho živý pozorností, ne jen zvykem.', harm: 'Touha a láska si jdou naproti — fyzická i citová rovina se doplňují přirozeně.', tense: 'Přitahujete se a míjíte v rytmu — jeden chce teď, druhý jinak či jindy. Mluvte o tom beze studu; sladit se dá jen nahlas.' },
    'Asc|Sun': { conj: 'Jeden ztělesňuje to, čím druhý je — okolí vás čte jako přirozený pár.', harm: 'Vystupujete v souladu — na veřejnosti i doma jste čitelní jeden pro druhého.', tense: 'První dojem klame — každý působíte jinak, než ten druhý čeká. Dejte si čas poznat, co je pod slupkou.' },
    'Asc|Moon': { conj: 'Doma i navenek jedno — s tímhle člověkem se dá bydlet: jeho projev uklidňuje tvé nitro.', harm: 'Přirozenost jednoho konejší city druhého — je vám spolu snadno.', tense: 'Způsoby jednoho dráždí citlivá místa druhého — drobnosti, ale denně. Pomáhá říct si, které maličkosti bolí, a pár jich vědomě změnit.' },
    'Asc|Venus': { conj: 'Líbíte se — jeden je pro druhého prostě hezký na pohled i na bytí. Nepodceňuj, jak to nese vztah v čase.', harm: 'Estetika a projev ladí — rádi se spolu ukazujete.', tense: 'Styl jednoho není šálek druhého — víc otázka vkusu než citu. Neber si to osobně.' },
    'Asc|Mars': { conj: 'Přítomnost druhého tě nabíjí — akce, přitažlivost, netrpělivost. Vztah s tempem.', harm: 'Uvádíte se navzájem do pohybu — spolu toho stihnete víc než každý zvlášť.', tense: 'Samotné vystupování druhého umí vyprovokovat — semtam bez důvodu. Když to víš, přestane to být osobní útok a začne to být počasí.' },
    'Saturn|Sun': { conj: 'Vztah s páteří — jeden druhému dává řád a vážnost. Může tížit, ale drží; svazky s tímhle kontaktem vydrží desetiletí.', harm: 'Spolehlivost a věrnost — jeden je druhému pevnou zdí, o kterou se dá opřít. Málo ohňostrojů, hodně jistoty.', tense: 'Jeden na druhého působí jako přísný soudce — kritika, brzdy, pocit „nejsem dost“. Lék: oceňovat nahlas. Tenhle kontakt umí být nejpevnější pouto, když se přísnost promění v péči.' },
    'Moon|Saturn': { conj: 'Vážné pouto — city tu nejsou lehké, ale jsou opravdové a trvalé. Dovolte si i hravost; závazek už máte.', harm: 'Citová spolehlivost — druhý tu bude i v úterý ve tři ráno. Tichá, pevná forma lásky.', tense: 'Jeden se vedle druhého bojí projevit city — chlad, který ve skutečnosti bývá ostych a strach ze zamítnutí. Prolomí ho jen opakované bezpečné přijetí.' },
    'Saturn|Venus': { conj: 'Láska se závazkem v základech — vztah, který se nebere na zkoušku. Hlídejte, ať povinnost neudusí radost.', harm: 'Věrnost a stálost v lásce — cit, který zraje jako víno.', tense: 'Láska tu naráží na zdrženlivost — jeden čeká projevy, druhý je dávkuje. Neznamená to málo lásky; znamená to jiné tempo. Trpělivost se tu úročí.' },
    'Mars|Saturn': { conj: 'Síla pod kontrolou — spolu dokážete systematicky budovat. Občas to skřípe mezi „hned“ a „pořádně“; obojí je potřeba.', harm: 'Výkon a vytrvalost — pracovní dvojka snů. Nezapomeňte, že vztah není jen projekt.', tense: 'Brzda a plyn — jeden startuje, druhý zpomaluje, oba se tím vzájemně unavují. Rozdělte role vědomě: kdo zapaluje, kdo hlídá, a je z toho tým.' },
    'Mars|Mars': { conj: 'Stejné tempo, stejný zápal — spolu jste síla. Jen se nehádejte o volant.', harm: 'Vaše energie spolupracují — akce vás spojuje, ne rozděluje.', tense: 'Dva berani na lávce — síly se srážejí čelně. Sport, práce a jasná pravidla hádek z toho udělají motor místo bojiště.' },
    'Asc|Asc': { conj: 'Vstupujete do světa stejným krokem — lidé vás vnímají jako jeden celek.', harm: 'Vaše naladění se doplňuje — spolu se dobře vychází i vchází.', tense: 'Každý jiný styl — jeden zpříma, druhý oklikou. Kontrast, který může bavit, když se z něj neudělá spor o „správně“.' },
  };
  function synPartners() { return store.get('kairos_partners', []); }
  function synFind(id) { return profiles.find(q => q.id === id) || synPartners().find(q => q.id === id); }
  function synSectionHTML(n) {
    const partners = synPartners();
    const others = profiles.filter(q => q.id !== activeId);
    const selRec = S.synId ? synFind(S.synId) : null;
    const isPartner = selRec && String(S.synId).startsWith('x');
    const chip = (q) => `<button type="button" class="chip ${S.synId === q.id ? 'on' : ''}" data-act="synSel" data-id="${q.id}">${esc(q.name)}</button>`;
    let form = '';
    if (S.synForm) {
      const e = S.synForm.mode === 'edit' && selRec ? selRec : { name: '', y: 1990, m: 1, d: 1, hh: 12, mm: 0, place: activeProfile().place, lat: activeProfile().lat, lon: activeProfile().lon };
      form = `<form class="form card" id="synForm" onsubmit="return false" style="margin-bottom:10px">
        <label class="wide">Jméno<input name="name" value="${esc(e.name)}" placeholder="Jméno osoby"></label>
        <label>Datum narození<input name="date" type="date" value="${e.y}-${pad(e.m)}-${pad(e.d)}"></label>
        <label>Čas narození<input name="time" type="time" value="${pad(e.hh)}:${pad(e.mm)}"></label>
        <label class="wide">Místo<input name="place" value="${esc(e.place || '')}"></label>
        <label>Šířka (N)<input name="lat" type="number" step="0.0001" value="${e.lat}"></label>
        <label>Délka (E)<input name="lon" type="number" step="0.0001" value="${e.lon}"></label>
        <div class="wide row"><button type="button" class="btn primary" data-act="synSave">${S.synForm.mode === 'edit' ? 'Uložit změny' : 'Přidat a porovnat'}</button><button type="button" class="btn ghost" data-act="synCancel">Zrušit</button></div>
        <p class="note wide">Neznáš-li čas narození, nech 12:00 — srovnání planet platí, jen Ascendent bude orientační. Osoby pro porovnání nezabírají profily.</p>
      </form>`;
    }
    let card = '';
    if (selRec && !S.synForm) {
      try {
        const nb = K.natalChart({ ...selRec, lat: +selRec.lat, lon: +selRec.lon, alt: +selRec.alt || 200, y: +selRec.y, m: +selRec.m, d: +selRec.d, hh: +selRec.hh, mm: +selRec.mm, tz: selRec.tz || TZ }, new Date());
        card = `<div class="card hs">${synastry(n, nb, (activeProfile().name || 'A').split(' ')[0], (selRec.name || 'B').split(' ')[0])}</div>
        <div class="row" style="margin:-4px 0 14px;gap:8px"><button type="button" class="btn ghost small" data-act="synPrint">Uložit · tisk</button><button type="button" class="btn ghost small" data-act="synShare">Poslat text</button></div>`;
      } catch (e) { card = '<div class="card hs"><div class="hsp"><p>Mapu se nepodařilo spočítat — zkontroluj zadané údaje.</p></div></div>'; }
    }
    return `<div class="h3">Horoskop dvou map</div>
      <div class="row echips" style="margin-bottom:8px"><span class="elbl">${esc(activeProfile().name)} ×</span>${others.map(chip).join('')}${partners.map(chip).join('')}<button type="button" class="chip" data-act="synAdd">＋ přidat osobu</button>${isPartner && !S.synForm ? `<button type="button" class="chip" data-act="synEdit" title="Upravit údaje">✎</button><button type="button" class="chip" data-act="synDel" title="Odebrat osobu">×</button>` : ''}</div>
      ${form}
      ${!S.synForm && !selRec ? `<p class="note">Vyber, s kým mapu porovnat, nebo přidej osobu — jen pro srovnání, bez zakládání profilu.</p>` : ''}
      ${card}`;
  }

  function synastry(nA, nB, nameA, nameB) {
    const BODS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Asc', 'Saturn'];
    const found = [];
    for (const a of BODS) for (const b of BODS) {
      const asp = K.aspectBetween(nA.points[a].lon, nB.points[b].lon, { default: 5, sextile: 3 });
      if (!asp) continue;
      const key = [a, b].sort().join('|');
      if (!HS.SYN[key]) continue;
      found.push({ ...asp, a, b, key, tone: asp.cz === 'konjunkce' ? 'conj' : (asp.kind === 'harm' ? 'harm' : 'tense') });
    }
    // sloučit stejné téma (A.Venuše–B.Mars i A.Mars–B.Venuše)
    const seen = {};
    for (const f of found) { const gk = f.key + '|' + f.tone; if (!seen[gk] || f.orb < seen[gk].orb) { f.all = (seen[gk] ? seen[gk].all : []); f.all.push(f); seen[gk] = f; } else seen[gk].all.push(f); }
    const list = Object.values(seen).sort((x, y) => x.orb - y.orb);
    const tagOf = (f) => f.all.map(x => `${K.BODY_CZ[x.a]} (${nameA}) ${x.cz} ${K.BODY_CZ[x.b]} (${nameB}) · ${fmtOrb(x.orb)}`).join(' · ');
    const mA = K.signOf(nA.points.Moon.lon), mB = K.signOf(nB.points.Moon.lon);
    const eA = K.ELEMENT[K.signOf(nA.points.Sun.lon)], eB = K.ELEMENT[K.signOf(nB.points.Sun.lon)];
    const REL = { 'oheň|vzduch': 1, 'vzduch|oheň': 1, 'země|voda': 1, 'voda|země': 1 };
    const elTxt = eA === eB ? `Obě vaše slunce hoří stejným živlem (${eA}) — základní životní tempo máte společné.` : (REL[eA + '|' + eB] ? `Vaše živly (${eA} a ${eB}) se přirozeně doplňují — každý umí, co druhému chybí.` : `Vaše živly (${eA} a ${eB}) mluví každý jinak — vztah, který víc učí, než hladí. Co si vysvětlíte, to vás spojí pevněji než samozřejmost.`);
    let out = hsPara('', `Partnerský horoskop čte, jak si vaše dvě mapy rozumí: kde se potkávají samy a kde potřebují překladatele. ${elTxt}`, `${nameA} × ${nameB}`);
    out += hsPara('Vaše vnitřní světy', `${nameA} uvnitř potřebuje ${HS.NEED[mA]}. ${nameB} potřebuje ${HS.NEED[mB]}. Kdo zná návod toho druhého, drží klíč ke klidnému domovu.`, `Luna ${K.SIGN_LOC_V[mA]} × Luna ${K.SIGN_LOC_V[mB]}`);
    const sat = list.filter(f => f.key.includes('Saturn'));
    const rest = list.filter(f => !f.key.includes('Saturn'));
    if (rest.length) {
      out += `<h4 class="hsh">Klíčové kontakty vašich map</h4>`;
      for (const f of rest.slice(0, 6)) out += hsPara('', HS.SYN[f.key][f.tone], tagOf(f));
    }
    if (sat.length) {
      out += `<h4 class="hsh">Co drží — a co umí tížit</h4>`;
      out += hsPara('', 'Saturnové kontakty jsou lepidlo dlouhých vztahů: dávají závazek a trvání, ale umí i tlačit. Tady jsou ty vaše:', '');
      for (const f of sat.slice(0, 3)) out += hsPara('', HS.SYN[f.key][f.tone], tagOf(f));
    }
    if (!list.length) out += hsPara('', 'Vaše mapy spolu nemluví přes přesné úhly — vztah se pak řídí víc svobodnou volbou než osudovým tahem. To není málo: je to vztah, který si každý den vybíráte.', '');
    out += hsPara('', 'Každý kontakt map je pozvání — harmonie chce žít a napětí se dá proměnit v tah. Mapy říkají, s čím pracujete; jak, to je na vás dvou.', '');
    return out;
  }

  const HS_ICON = {
    osobnost: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9.6" r="2.8"/><path d="M6.9 18.4c1-2.3 2.9-3.4 5.1-3.4s4.1 1.1 5.1 3.4"/>',
    penize: '<circle cx="12" cy="12" r="9"/><path d="M14.6 9.2c-.5-.9-1.5-1.4-2.7-1.4-1.6 0-2.7.8-2.7 2s1 1.7 2.7 2.1c1.9.4 2.9 1 2.9 2.3 0 1.3-1.2 2.1-2.9 2.1-1.3 0-2.4-.5-2.9-1.5"/><path d="M12 6.2v11.6"/>',
    vztahy: '<path d="M12 20s-7-4.4-7-9.2A3.9 3.9 0 0 1 12 8.4a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z"/>',
    rodina: '<path d="M12 21v-6"/><path d="M9.4 21h5.2"/><path d="M12 15c0-3.2 2.3-5 4.6-5.4M12 15c0-3.2-2.3-5-4.6-5.4"/><path d="M12 15V5"/><path d="M12 8.6c1.6-1.4 3.6-1.8 5.4-1.2M12 8.6C10.4 7.2 8.4 6.8 6.6 7.4"/>',
    duch: '<path d="M7 20c3.4-1.2 4.6-3.4 3.4-5.4-1.2-2-.2-4.2 3-5.2 2.4-.8 3.6-2.2 3.6-3.8"/><path d="M15.6 4.4l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z"/><circle cx="18.4" cy="9.6" r=".8"/>',
    vyzvy: '<path d="M3 18l5.4-8.2 3 3.6L14.8 8 21 18z"/><path d="M14.8 8l1.7 2.6"/>',
    prace: '<rect x="3.5" y="8" width="17" height="10.5" rx="2"/><path d="M9 8V6.6c0-.9.7-1.6 1.6-1.6h2.8c.9 0 1.6.7 1.6 1.6V8"/><path d="M3.5 12.6h17"/><path d="M11.2 12.6h1.6"/>',
    zdravi: '<path d="M19 6c0 6.6-3.6 11-8.6 12C9 13.6 12.6 7.4 19 6z"/><path d="M10.4 18c.4-3.4 1.9-6.3 4.3-8.3"/>',
    radost: '<circle cx="12" cy="12" r="4"/><path d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18"/>',
    mysl: '<path d="M4 8.6c0-1.6 1.3-2.9 2.9-2.9h6.2c1.6 0 2.9 1.3 2.9 2.9v2.8c0 1.6-1.3 2.9-2.9 2.9H8.4L4.6 17v-2.9C4.2 13.6 4 12.6 4 11.4z"/><path d="M18.4 9.6c1 .4 1.6 1.4 1.6 2.5v2.5c0 .9-.4 1.7-1 2.3V20l-2.4-2h-3"/>',
    hvezdy: '<path d="M12 3.6l1.5 4.1 4.1 1.5-4.1 1.5L12 14.8l-1.5-4.1L6.4 9.2l4.1-1.5z"/><path d="M18.4 14.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/><path d="M5.6 15.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z"/>',
    rok: '<circle cx="12" cy="12" r="6.4"/><ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-22 12 12)"/><circle cx="12" cy="12" r="1"/>',
  };
  const hsIcon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HS_ICON[k] || ''}</svg>`;
  const HS_ORDER = ['rok', 'hvezdy', 'radost', 'zdravi', 'vztahy', 'rodina', 'duch', 'osobnost', 'mysl', 'prace', 'vyzvy', 'penize'];
  const HS_SPAN = [2, 2, 2, 3, 3, 3, 3, 2, 2, 2, 3, 3];
  const HS_THEMES = [['osobnost', 'Osobnostní', (n) => horoscopePersonal(n)], ['penize', 'Peníze', horoscopeMoney], ['vztahy', 'Vztahy a láska', horoscopeLove], ['rodina', 'Rodina a kořeny', horoscopeFamily], ['duch', 'Duchovní cesta', horoscopeSpirit], ['vyzvy', 'Překážky a výzvy', horoscopeChallenge], ['prace', 'Práce a poslání', horoscopeWork], ['zdravi', 'Zdraví a vitalita', horoscopeHealth], ['radost', 'Tvořivost a radost', horoscopeJoy], ['mysl', 'Komunikace a mysl', horoscopeMind], ['hvezdy', 'Tvé hvězdy', horoscopeStars], ['rok', 'Tvůj rok', horoscopeYear]];

  function horoscopePersonal(n) {
    const sgn = (k) => K.signOf(n.points[k].lon);
    const el = (si) => K.ELEMENT[si];
    const sunS = sgn('Sun'), moonS = sgn('Moon'), ascS = sgn('Asc');
    const tag = (t) => `<span class="hstag">${t}</span>`;
    const para = (title, text, tg) => `<div class="hsp">${title ? `<h4>${title}</h4>` : ''}<p>${text}</p>${tg ? tag(tg) : ''}</div>`;
    // úvodní syntéza živlů
    const e1 = el(sunS), e2 = el(moonS);
    const REL = { 'oheň|vzduch': 1, 'vzduch|oheň': 1, 'země|voda': 1, 'voda|země': 1 };
    let mix;
    if (e1 === e2) mix = `Vůle i pocity u tebe mluví stejnou řečí — živlem ${e1}. Dává ti to vnitřní jednotu: co chceš, to i cítíš, a lidé z tebe čtou jeden jasný tón.`;
    else if (REL[e1 + '|' + e2]) mix = `Vůle (${e1}) a pocity (${e2}) se u tebe doplňují — dvě různé řeči, které si rozumí. Umíš čerpat z obou stran, aniž se přetahují.`;
    else mix = `Vůle (${e1}) a pocity (${e2}) u tebe mluví každá jinou řečí. Není to porucha — je to vnitřní rozhovor, který tě celý život prohlubuje. Zralost je nechat mluvit obě.`;
    const intro = `Tvá mapa stojí na třech tónech: Slunce ${K.SIGN_LOC_V[sunS]} (kdo jsi v jádru), Luna ${K.SIGN_LOC_V[moonS]} (co potřebuješ uvnitř) a Ascendent v ${K.SIGNS[ascS] === 'Beran' ? 'Beranu' : K.SIGN_LOC_V[ascS].replace('ve ', '').replace('v ', '')} (jak působíš). ${mix}`;
    // aspekty ke Slunci, Luně a Ascendentu
    const OTH = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    const AN = ['Sun', 'Moon', 'Asc'];
    const found = [];
    for (let i = 0; i < AN.length; i++) for (let j = i + 1; j < AN.length; j++) {
      const a = K.aspectBetween(n.points[AN[i]].lon, n.points[AN[j]].lon, { default: 6, sextile: 4 });
      if (a) found.push({ pair: AN[i] + '|' + AN[j], a: AN[i], b: AN[j], ...a });
    }
    for (const an of AN) for (const o of OTH) {
      const a = K.aspectBetween(n.points[an].lon, n.points[o].lon, { default: 6, sextile: 4 });
      if (a) found.push({ a: an, b: o, ...a });
    }
    found.sort((x, y) => x.orb - y.orb);
    const tone = (a) => a.cz === 'konjunkce' ? 'conj' : (a.kind === 'harm' ? 'harm' : 'tense');
    const seen = new Set();
    const aspParas = [];
    for (const a of found) {
      if (aspParas.length >= 4) break;
      const kk = a.pair || (a.b + '|' + tone(a));
      if (seen.has(kk)) continue; seen.add(kk);
      let txt;
      if (a.pair) txt = HS.PAIR[a.pair] && HS.PAIR[a.pair][tone(a)];
      else {
        const t = HS.ASP[a.b] && HS.ASP[a.b][tone(a)];
        if (t) {
          const A = HS.ANCH[a.a];
          txt = t.replaceAll('{A}', A[0]).replaceAll('{A2}', A[0]).replaceAll('{A3}', A[1]).replaceAll('{A4}', A[0]).replaceAll('{A5}', A[1]);
        }
      }
      if (txt) aspParas.push(para('', txt, `${K.BODY_CZ[a.a]} ${a.cz} ${K.BODY_CZ[a.b]} · orbis ${fmtOrb(a.orb)}`));
    }
    return `
      ${para('', intro, '')}
      ${para('Jak působíš', HS.ASC[ascS], `Ascendent — ${K.SIGNS[ascS]}`)}
      ${para('Tvé jádro', HS.SUN[sunS] + ' Nejvíc se to odehrává v oblasti ' + HS.HOUSE_AREA[n.points.Sun.house - 1] + '.', `Slunce ${K.SIGN_LOC_V[sunS]} · ${n.points.Sun.house}. dům`)}
      ${para('Tvůj vnitřní svět', HS.MOON[moonS] + ' Nejvíc to žiješ v oblasti ' + HS.HOUSE_AREA[n.points.Moon.house - 1] + '.', `Luna ${K.SIGN_LOC_V[moonS]} · ${n.points.Moon.house}. dům`)}
      ${aspParas.length ? `<h4 class="hsh">Silná témata tvé osobnosti</h4>${aspParas.join('')}` : ''}
      ${para('', 'Mapa je zrcadlo — popis nástrojů, se kterými jsi přišel. Silné stránky chtějí užívat, napětí chtějí vědomí. Obojí je tvoje.', '')}`;
  }

  // ===================== najít vhodný den (elekce) =====================
  const ELECT_CATS = [
    { id: 'smlouva', label: 'Smlouva a dohoda', rules: { noRetro: 1, vocPlus: 1, wax: .5 }, subs: [['podpis', 'Podpis smlouvy'], ['urad', 'Úřad · žádost'], ['dohoda', 'Důležitá dohoda']] },
    { id: 'penize', label: 'Peníze a větší nákup', rules: { noRetro: 1, wax: 1 }, subs: [['nakup', 'Větší nákup'], ['investice', 'Investice'], ['uver', 'Úvěr · financování'], ['koupe', 'Koupě auta · nemovitosti']] },
    { id: 'projekt', label: 'Projekt a podnikání', rules: { newMoon: 1, vocPlus: 1 }, subs: [['zacit', 'Začít projekt'], ['web', 'Spustit web'], ['provoz', 'Otevřít provoz'], ['produkt', 'Představit produkt']] },
    { id: 'prace', label: 'Práce a kariéra', rules: { noRetro: 1, wax: .5 }, subs: [['pohovor', 'Pohovor'], ['nastup', 'Nástup'], ['zvyseni', 'Žádost o zvýšení'], ['prezentace', 'Prezentace · vystoupení'], ['zkouska', 'Zkouška · přihláška']] },
    { id: 'laska', label: 'Láska a vztahy', rules: { wax: .5, venusSign: 1, venusNoRetro: 1 }, subs: [['rande', 'Rande'], ['setkani', 'Důležité setkání'], ['zasnuby', 'Zásnuby'], ['svatba', 'Svatba', { vocPlus: 1 }]] },
    { id: 'bydleni', label: 'Stěhování a bydlení', rules: { wax: .5, noKp: 1, retroMinus: .5 }, subs: [['stehovani', 'Stěhování'], ['najem', 'Nové bydlení · nájem']] },
    { id: 'cesta', label: 'Cesta a dovolená', rules: { noKp: 1, retroMinus: 1 }, subs: [['odjezd', 'Odjezd na cestu'], ['dovolena', 'Dovolená'], ['presun', 'Přesun · logistika']] },
    { id: 'rozhovor', label: 'Důležitý rozhovor', rules: { noRetro: 1, vocPlus: 1, airSign: 1 }, subs: [['vyjednavani', 'Vyjednávání'], ['citlive', 'Citlivé téma'], ['zadost', 'Žádost · prosba']] },
    { id: 'zakrok', label: 'Plánovaný zákrok', rules: { wane: 1, avoidFull: 1, noKp: 1, noRetro: 1, marsNoRetro: 1, vocPlus: 1, health: 1 }, subs: [['operace', 'Zákrok · operace'], ['zubar', 'Zubař', { avoidMoonSigns: [0, 6] }]] },
  ];
  function electCfg() {
    const cat = ELECT_CATS.find(c => c.id === S.elek.cat);
    if (!cat) return null;
    const sub = cat.subs.find(x => x[0] === S.elek.sub) || cat.subs[0];
    return { ...cat.rules, ...(sub[2] || {}), catLabel: cat.label, subLabel: sub[1], health: cat.rules.health };
  }
  function electDay(cfg, y, m, d, evs) {
    const da = analyze(y, m, d);
    const key = K.isoDate(y, m, d);
    if (evs.some(e => e.eclipse && K.dateKey(e.date, TZ) === key)) return null;
    if (cfg.noRetro && da.mercuryRetro) return null;
    if (cfg.venusNoRetro && da.pos.Venus.retro) return null;
    if (cfg.marsNoRetro && da.pos.Mars.retro) return null;
    if (cfg.avoidMoonSigns && cfg.avoidMoonSigns.includes(da.moonSign)) return null;
    if (cfg.noKp && da.kp && da.kp.kp >= 5) return null;
    const phA = da.phaseAngle;
    if (cfg.avoidFull && phA >= 160 && phA <= 200) return null;
    let sc = da.score, why = [];
    if (cfg.wax && phA < 175) { sc += cfg.wax; why.push('dorůstající Luna'); }
    if (cfg.wane && phA >= 195 && phA < 350) { sc += 1; why.push('couvající Luna'); }
    if (cfg.newMoon && phA >= 5 && phA < 95) { sc += 1; why.push('Luna mezi novem a první čtvrtí'); }
    if (cfg.venusSign && (da.moonSign === 1 || da.moonSign === 6)) { sc += .5; why.push('Luna ve znamení Venuše'); }
    if (cfg.airSign && (da.moonSign === 2 || da.moonSign === 6 || da.moonSign === 10)) { sc += .5; why.push('Luna ve vzdušném znamení'); }
    if (cfg.vocPlus && !da.voc.length) { sc += .5; why.push('Luna celý den v kurzu'); }
    if (cfg.retroMinus && da.mercuryRetro) { sc -= cfg.retroMinus; why.push('Merkur retrográdní'); }
    if (da.color === 'harm') why.unshift('celkově příznivý den');
    return { key, y, m, d, sc, da, why };
  }
  function electRun() {
    const cfg = electCfg();
    if (!cfg) { S.elek.results = null; S.elek.progress = null; return; }
    const runId = (electRun._id = (electRun._id || 0) + 1);
    const out = [], evCacheM = {};
    const total = S.elek.span;
    S.elek.results = null; S.elek.progress = 0;
    let i = 1;
    const step = () => {
      if (runId !== electRun._id) return; // spuštěn novější výpočet
      const t0 = Date.now();
      while (i <= total && Date.now() - t0 < 34) {
        const dt = K.addDays(K.dayStart(np.y, np.m, np.d, TZ), i + 0.5);
        const pp = K.tzParts(dt, TZ);
        const mk = pp.y + '-' + pp.m;
        if (!evCacheM[mk]) evCacheM[mk] = monthEvents(pp.y, pp.m);
        const r = electDay(cfg, pp.y, pp.m, pp.d, evCacheM[mk]);
        if (r) out.push(r);
        i++;
      }
      if (i <= total) {
        S.elek.progress = Math.round((i - 1) / total * 100);
        const el = $('#elekProgress'); if (el) el.textContent = S.elek.progress + ' %';
        setTimeout(step, 0);
      } else {
        out.sort((a, b) => b.sc - a.sc || a.key.localeCompare(b.key));
        S.elek.results = out.slice(0, 6).sort((a, b) => a.key.localeCompare(b.key)); S.elek.progress = null;
        renderCalendar();
      }
    };
    if (total <= 70) { // krátké rozsahy najednou, bez blikání
      while (i <= total) {
        const dt = K.addDays(K.dayStart(np.y, np.m, np.d, TZ), i + 0.5);
        const pp = K.tzParts(dt, TZ);
        const mk = pp.y + '-' + pp.m;
        if (!evCacheM[mk]) evCacheM[mk] = monthEvents(pp.y, pp.m);
        const r = electDay(cfg, pp.y, pp.m, pp.d, evCacheM[mk]);
        if (r) out.push(r);
        i++;
      }
      out.sort((a, b) => b.sc - a.sc || a.key.localeCompare(b.key));
      S.elek.results = out.slice(0, 6).sort((a, b) => a.key.localeCompare(b.key)); S.elek.progress = null;
    } else step();
  }
  function electHTML() {
    const cat = ELECT_CATS.find(c => c.id === S.elek.cat);
    const cats = `<div class="row echips">${ELECT_CATS.map(c => `<button type="button" class="chip ${S.elek.cat === c.id ? 'on' : ''}" data-act="elekCat" data-c="${c.id}">${c.label}</button>`).join('')}</div>`;
    let body = '';
    if (cat) {
      const subOn = (cat.subs.find(x => x[0] === S.elek.sub) || cat.subs[0])[0];
      body += `<div class="row echips sub">${cat.subs.map(x => `<button type="button" class="chip small ${subOn === x[0] ? 'on' : ''}" data-act="elekSub" data-s="${x[0]}">${x[1]}</button>`).join('')}</div>`;
      body += `<div class="row echips span"><span class="elbl">Rozsah</span>${[14, 30, 60, 90].map(n => `<button type="button" class="chip small ${+S.elek.span === n ? 'on' : ''}" data-act="elekSpan" data-n="${n}">${n} dní</button>`).join('')}<label class="chip small elcust ${[14, 30, 60, 90].includes(+S.elek.span) ? '' : 'on'}">vlastní: <input id="elekCustom" type="number" min="7" max="400" step="1" value="${[14, 30, 60, 90].includes(+S.elek.span) ? '' : S.elek.span}" placeholder="365"> dnů</label></div>`;
      const cfg = electCfg();
      if (S.elek.progress != null) body += `<p class="small muted" style="margin:10px 0 0">Prohledávám nebe… <span id="elekProgress">${S.elek.progress} %</span></p>`;
      if (S.elek.results) {
        const scs = S.elek.results.map(r => r.sc), smin = Math.min(...scs), smax = Math.max(...scs);
        const tier = (sc) => smax === smin ? 2 : (sc - smin) / (smax - smin) >= 0.67 ? 3 : (sc - smin) / (smax - smin) >= 0.34 ? 2 : 1;
        body += S.elek.results.length ? `<ul class="elist">${S.elek.results.map(r => `<li><button type="button" data-act="selDay" data-y="${r.y}" data-m="${r.m}" data-d="${r.d}">
          <span class="ed">${K.WEEKDAY_CZ[K.tzParts(r.da.noon, TZ).wd]} ${r.d}. ${K.MONTH_GEN[r.m - 1]} <i class="estars" title="síla dne v rámci výběru">${'✦'.repeat(tier(r.sc))}</i></span>
          <span class="badge ${r.da.color}">${TX.dayWord(r.da)}</span>
          <span class="ew">${esc(r.why.join(' · ') || 'bez zvláštních výhrad')}</span>
        </button></li>`).join('')}</ul>` : '<p class="small muted" style="margin:8px 0 0">V tomhle rozmezí žádný vyloženě vhodný den nevychází — zkus delší rozsah.</p>';
        body += `<p class="note">Nejlepší dny pro: ${cfg.subLabel.toLowerCase()} — seřazeno podle data; ✦✦✦ značí nejsilnější dny z výběru. Vybráno podle skóre dne s příplatky za to, co dané věci svědčí; vyřazeny dny zatmění${cfg.noRetro ? ', retrográdního Merkuru' : ''}${cfg.venusNoRetro ? ', retrográdní Venuše' : ''}${cfg.marsNoRetro ? ', retrográdního Marsu' : ''}${cfg.avoidMoonSigns ? ', Luny ve znamení operované části těla (Beran/Váhy)' : ''}${cfg.noKp ? ', geomagnetických bouří' : ''}${cfg.avoidFull ? ' a okolí úplňku' : ''}.${cfg.health ? ' Jen orientačně — termín zákroku se vždy řídí tím, co řekne lékař.' : ''}</p>`;
      }
    }
    const head = `<button type="button" class="eltoggle ${S.elek.open ? 'open' : ''}" data-act="elekToggle" aria-expanded="${S.elek.open}">Najít vhodný den <i>${S.elek.open ? '▾' : '▸'}</i></button>`;
    if (!S.elek.open) return head;
    return `${head}<div class="card elect">
      <p class="elq">Pro co hledám vhodný den?</p>
      ${cats}${body}</div>`;
  }

  function planPanel(key, inner) {
    const items = pGet(key);
    const [ky, km, kd] = key.split('-').map(Number);
    const sd = sdForDay(ky, km, kd);
    const sdList = sd.length ? `<div class="sdline">${sd.map(x => sdLabel(x, ky)).join(' · ')}</div>` : '';
    const gv = gEvByDay(key);
    const gList = gv.length ? `<ul class="plist gcal">${gv.map(e => `<li><span class="pt">${e.t ? esc(e.t) : '—'}</span><span class="pn">${esc(e.name)}</span><span class="gsrc" title="Z Google kalendáře">G</span></li>`).join('')}</ul>` : '';
    const list = items.map(it => `<li><button type="button" class="px" data-act="delPlan" data-k="${key}" data-id="${it.id}" aria-label="Smazat">×</button><span class="pt">${it.t ? esc(it.t) : '—'}</span><span class="pn">${esc(it.name)}</span>
      <a class="pg" target="_blank" rel="noopener" href="${gcalLink(key, it)}" title="Přidat do Google kalendáře" aria-label="Přidat do Google kalendáře">G</a></li>`).join('');
    return `<div class="panel pl${inner ? ' plain' : ''}">
      ${inner ? '' : '<h4><i class="hstar">✧</i> Program dne</h4>'}
      ${sdList}
      ${gList}
      ${items.length ? `<ul class="plist">${list}</ul>` : '<p class="small muted" style="margin:0 0 8px">Přidej první plán — zapíše se sem a ráno tě čeká v kartě Dnes.</p>'}
      <div class="planadd">
        <input type="text" name="ptime" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="čas" aria-label="Čas (nepovinný), např. 14:30" title="Čas (nepovinný), např. 14:30">
        <input type="text" name="pname" placeholder="Co máš v plánu…" aria-label="Co máš v plánu">
        <button type="button" class="btn small" data-act="addPlan" data-k="${key}">Přidat</button>
      </div>
    </div>`;
  }

  function journalPanel(key, da) {
    const e = jGet(key) || {};
    const chips = RATES.map(r => `<button type="button" class="rate ${r.cls} ${e.rate === r.v ? 'on' : ''}" data-act="rate" data-k="${key}" data-v="${r.v}">${r.label}</button>`).join('');
    return `<div class="panel jr">
      <textarea id="jNote" class="jnote" data-k="${key}" rows="3" placeholder="Chceš si něco z dneška poznamenat? Co se stalo, jak ti bylo, co vyšlo.">${esc(e.note || '')}</textarea>
      ${(e.media && e.media.length) ? `<div class="jmedia">${e.media.map(m => m.t === 'i'
        ? `<span class="jmit"><img data-mid="${m.id}" alt="fotka ke dni" data-act="jmView" data-mid2="${m.id}"><button type="button" class="jmx" data-act="jmDel" data-k="${key}" data-id="${m.id}" title="Smazat">×</button></span>`
        : `<span class="jmau"><audio data-mid="${m.id}" controls preload="none"></audio><button type="button" class="jmx" data-act="jmDel" data-k="${key}" data-id="${m.id}" title="Smazat">×</button></span>`).join('')}</div>` : ''}
      <div class="row" style="gap:8px;margin-top:7px">
        <label class="btn ghost small jphoto-l">📷 Fotka<input type="file" class="jphoto" accept="image/*" data-k="${key}" hidden></label>
        <button type="button" class="btn ghost small" data-act="jRec" data-k="${key}">${recState && recState.key === key ? '■ Zastavit nahrávání' : '🎙 Hlasová poznámka'}</button>
      </div>
      <div class="jrate">
        <small>jak ti den přišel <em>· nepovinné, pomáhá to ladit výpočet</em></small>
        <div class="rates">${chips}</div>
      </div>
      <div class="row" style="justify-content:space-between;margin-top:6px">
        <button type="button" class="btn ghost small" data-act="saveNote">Zapsat</button>
        <span class="small muted">appka na dnes říká „${TX.dayWord(da)}“</span>
      </div>
    </div>`;
  }

  function programCal() {
    const st = S.plSel || TODAY_KEY;
    const [sy, sm, sd] = st.split('-').map(Number);
    const cy = S.plY || sy, cm = S.plM || sm;
    const n = K.daysInMonth(cy, cm);
    const offset = (K.tzParts(K.dayStart(cy, cm, 1, TZ), TZ).wd + 6) % 7;
    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<span class="pc empty"></span>';
    for (let d = 1; d <= n; d++) {
      const key = K.isoDate(cy, cm, d);
      const has = pGet(key).length, gv = gEvByDay(key).length, sdn = sdForDay(cy, cm, d).length;
      const isSel = key === st, isToday = key === TODAY_KEY;
      cells += `<button type="button" class="pc${isSel ? ' sel' : ''}${isToday ? ' today' : ''}" data-act="plSel" data-k="${key}">
        <b>${d}</b><span class="pcm">${sdn ? '<i class="sd">🎂</i>' : ''}${has ? '<i class="dot"></i>' : ''}${gv ? '<i class="dot g"></i>' : ''}${(() => { const c = cycFor(key); return c ? `<i class="dot c" style="background:${c.ph.col};${c.isStart ? 'width:7px;height:7px' : ''}"></i>` : ''; })()}</span></button>`;
    }
    const wd = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'].map(x => `<span class="pw">${x}</span>`).join('');
    return `<div class="h3">Program</div>
      <div class="card pcal">
        <div class="pcbar">
          <button type="button" class="navbtn" data-act="plPrev" aria-label="Předchozí měsíc">‹</button>
          <div class="mn">${K.MONTH_CZ[cm - 1].charAt(0).toUpperCase() + K.MONTH_CZ[cm - 1].slice(1)}<em>${cy}</em></div>
          <button type="button" class="btn ghost small" data-act="plToday">Dnes</button>
          <button type="button" class="navbtn" data-act="plNext" aria-label="Další měsíc">›</button>
        </div>
        <div class="pcgrid head">${wd}</div>
        <div class="pcgrid">${cells}</div>
        <div class="pcday"><span class="pcd">${sd}. ${K.MONTH_GEN[sm - 1]} ${sy}</span>${st === TODAY_KEY ? '<span class="pcnow">dnes</span>' : ''}</div>
        ${cycOn() ? cycLine(st) + `<div class="row" style="margin:2px 0 10px"><button type="button" class="chip small" data-act="cycMark" data-k="${st}">${cycAll().includes(st) ? '✓ začátek menstruace — zrušit' : '● tímto dnem začala menstruace'}</button></div>` : ''}
        ${planPanel(st, true)}
      </div>`;
  }
  function renderJournal() {
    const v = $('#view-diar');
    const jk = Object.keys(journal), pk = Object.keys(plan);
    const keys = [...new Set([...jk, ...pk])].sort().reverse();
    if (!keys.length) {
      v.innerHTML = `<div class="h2">Diář</div>
        ${programCal()}
        <div class="h3" style="margin-top:14px">Zápis dne — ${np.d}. ${K.MONTH_GEN[np.m - 1]}</div>
        ${journalPanel(TODAY_KEY, analyze(np.y, np.m, np.d))}
        <p class="note" style="margin-bottom:2px">Zapiš pár slov o tom, jak den šel, a ohodnoť ho. Přidat jde i fotka nebo hlasová poznámka. Po pěti dnech se tu začne ukazovat, jak tvá hodnocení sedí s výpočtem, po osmi i podle fází cyklu.</p>
        ${journalIO()}`;
      setTimeout(() => jMediaHydrate($('#view-diar')), 30);
      return;
    }
    // shoda hodnocení se spočítaným skóre
    const rated = keys.filter(k => { const e = jGet(k); return e && e.rate != null; });
    let stat = '';
    if (rated.length >= 5) {
      let n = 0, agree = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (const k of rated) {
        const [y, m, d] = k.split('-').map(Number);
        const da = analyze(y, m, d), r = jGet(k).rate;
        const sc = da.score;
        if ((r > 0 && sc > 0) || (r < 0 && sc < 0) || (r === 0 && Math.abs(sc) < 2)) agree++;
        n++; sx += r; sy += sc; sxx += r * r; syy += sc * sc; sxy += r * sc;
      }
      const den = Math.sqrt(n * sxx - sx * sx) * Math.sqrt(n * syy - sy * sy);
      const corr = den > 0 ? (n * sxy - sx * sy) / den : 0;
      const pct = Math.round(agree / n * 100);
      const slovo = corr > 0.5 ? 'silná' : corr > 0.25 ? 'zřetelná' : corr > 0.05 ? 'slabá' : corr > -0.05 ? 'žádná' : 'obrácená';
      stat = `<div class="card"><div class="h3" style="margin-top:0">Jak to sedí</div>
        <p><b>${pct} %</b> dnů se shoduje ve směru · souvislost <b>${slovo}</b> (r = ${fmtNum(corr, 2).replace('.', ',')})</p>
        <p class="note">Počítáno z ${n} ohodnocených dnů. Pod dvacet dnů je to jen orientační — na náhodě se dá snadno vidět vzorec, který tam není. Kdyby souvislost zůstala žádná i po dvou měsících, znamená to, že váhy v Nastavení potřebují přeladit, nebo že tenhle způsob barvení dnů pro tebe nefunguje.</p></div>`;
    } else {
      stat = `<p class="note">Od pěti ohodnocených dnů se tu ukáže, jak tvá hodnocení sedí s výpočtem. ${rated.length ? `Máš ${rated.length}, chybí ${5 - rated.length}.` : 'Stačí u zápisu dne klepnout na hodnocení.'}</p>`;
    }
    // rozložení hodnocení po fázích cyklu
    let cycStat = '';
    if (cycOn()) {
      const buckets = {};
      for (const P of CYC_PHASES) buckets[P.k] = [];
      for (const k of rated) { const c = cycFor(k); if (c) buckets[c.ph.k].push(jGet(k).rate); }
      const total = CYC_PHASES.reduce((a, P) => a + buckets[P.k].length, 0);
      const filled = CYC_PHASES.filter(P => buckets[P.k].length >= 2).length;
      if (total >= 8 && filled >= 3) {
        const avg = {};
        for (const P of CYC_PHASES) avg[P.k] = buckets[P.k].length ? buckets[P.k].reduce((a, b) => a + b, 0) / buckets[P.k].length : null;
        const have = CYC_PHASES.filter(P => avg[P.k] != null);
        const best = have.reduce((a, b) => (avg[b.k] > avg[a.k] ? b : a));
        const low = have.reduce((a, b) => (avg[b.k] < avg[a.k] ? b : a));
        const spread = avg[best.k] - avg[low.k];
        const rows = CYC_PHASES.map(P => {
          const n = buckets[P.k].length, a = avg[P.k];
          if (!n) return `<div class="cyrow"><span class="cdot" style="background:${P.col};opacity:.3"></span><span class="cyn">${esc(P.n)}</span><span class="cybar"><u></u></span><span class="cyv">zatím</span></div>`;
          const w = Math.abs(a) / 2 * 50;
          const left = a >= 0 ? 50 : 50 - w;
          const val = (a >= 0 ? '+' : '−') + fmtNum(Math.abs(a), 1).replace('.', ',');
          return `<div class="cyrow"><span class="cdot" style="background:${P.col}"></span><span class="cyn">${esc(P.n)}</span><span class="cybar"><i style="left:${left}%;width:${Math.max(w, 2)}%;background:${P.col}"></i><u></u></span><span class="cyv">${val} · ${n}×</span></div>`;
        }).join('');
        const shrnuti = spread >= 0.5
          ? `<p>Nejvýš zatím vycházejí dny ve fázi <b>${esc(best.n)}</b>, nejtišeji ve fázi <b>${esc(low.n)}</b>. Rozdíl mezi fázemi je ${spread >= 1 ? 'zřetelný' : 'jemný'}.</p>`
          : `<p>Hodnocení se zatím drží napříč fázemi vyrovnaně.</p>`;
        cycStat = `<div class="card"><div class="h3" style="margin-top:0">Hodnocení podle fáze cyklu</div>
          <div class="cystat">${rows}</div>
          ${shrnuti}
          <p class="note">Průměr tvého hodnocení v každé fázi na škále od náročného po příznivý den, počítáno z ${total} ohodnocených dnů se známou fází. Obraz se ustálí zhruba po třech cyklech.</p></div>`;
      } else if (total >= 1) {
        cycStat = `<p class="note">Od osmi ohodnocených dnů se známou fází uvidíš, jak ti vycházejí jednotlivé fáze cyklu. Máš ${total}, chybí ${8 - total}.</p>`;
      }
    }
    const tk = TODAY_KEY, [ty, tm, td] = tk.split('-').map(Number);
    let html = `<div class="h2">Diář</div>
      ${programCal()}
      <div class="h3" style="margin-top:14px">Zápis dne — ${td}. ${K.MONTH_GEN[tm - 1]}</div>
      ${journalPanel(tk, analyze(ty, tm, td))}
      <div class="h3">Historie</div><p class="note">${keys.length} ${keys.length === 1 ? 'zápis' : keys.length < 5 ? 'zápisy' : 'zápisů'} · vše zůstává jen v tomto zařízení</p>${stat}${cycStat}`;
    let curMonth = '';
    for (const k of keys) {
      const [y, m, d] = k.split('-').map(Number);
      const mk = `${y}-${m}`;
      if (mk !== curMonth) { curMonth = mk; html += `<div class="ev-month">${K.MONTH_CZ[m - 1].charAt(0).toUpperCase() + K.MONTH_CZ[m - 1].slice(1)} ${y}</div>`; }
      const e = jGet(k) || {}, da = analyze(y, m, d);
      const r = RATES.find(x => x.v === e.rate);
      const pls = pGet(k);
      const cy = cycFor(k);
      const cyHtml = cy ? `<span class="jcy"><i class="cdot" style="background:${cy.ph.col}"></i>${cy.day}. den cyklu · ${esc(cy.ph.n)} fáze</span>` : '';
      const plHtml = pls.length ? `<span class="jc" style="color:var(--gold)">${pls.map(x => (x.t ? x.t + ' ' : '') + esc(x.name)).join(' · ')}</span>` : '';
      const med = e.media || [];
      const medHtml = med.length ? `<span class="jc muted">${med.filter(x => x.t === 'i').length ? '📷 ' + med.filter(x => x.t === 'i').length : ''} ${med.filter(x => x.t === 'a').length ? '🎙 ' + med.filter(x => x.t === 'a').length : ''}</span>` : '';
      const p = K.tzParts(K.dayStart(y, m, d, TZ), TZ);
      html += `<button type="button" class="jitem ${da.color}" data-act="jumpDay" data-y="${y}" data-m="${m}" data-d="${d}">
        <span class="jd"><b>${d}.</b>${K.WEEKDAY_CZ[p.wd].slice(0, 2)}</span>
        <span class="jt">${r ? `<span class="badge ${r.cls}">${r.label}</span>` : ''}${cyHtml}${plHtml}${medHtml}${e.note ? `<span class="jc">${esc(e.note)}</span>` : ''}
        <span class="n">appka: ${TX.dayWord(da)}${r && ((r.v > 0 && da.color === 'tense') || (r.v < 0 && da.color === 'harm')) ? ' · rozchází se' : ''}</span></span></button>`;
    }
    v.innerHTML = html + journalIO();
    setTimeout(() => jMediaHydrate($('#view-diar')), 30);
  }
  function journalIO() {
    return `<div class="h3">Správa dat</div><div class="card">
      <div class="row"><button type="button" class="btn" data-act="exportJournal">Uložit zálohu (JSON)</button><button type="button" class="btn ghost" data-act="exportJournalCsv">Export do tabulky (CSV)</button><button type="button" class="btn ghost" data-act="importJournal">Načíst zálohu</button></div>
      <input type="file" id="jFile" accept="application/json" style="display:none">
      <p class="note">Zápisy jsou uložené jen v tomto prohlížeči. Když vymažeš data prohlížeče nebo odinstaluješ appku, zmizí. Dělej si zálohu — tohle je jediná věc v appce, která se nedá znovu spočítat.</p></div>`;
  }

  function timelineHTML(da, ph, wins, ld, moonrise, moonset, dayEv, isToday) {
    const E = TX.timeline(da, ph, wins, ld, moonrise, moonset, dayEv, TZ);
    const key = K.isoDate(da.y, da.m, da.d);
    const mine = pGet(key);
    for (const it of mine) if (it.t) E.push({ ms: planMs(key, it.t), icon: '◆', text: it.name, note: nearbyNote(planMs(key, it.t), da, wins), kind: 'mine', mine: true });
    E.sort((a, b) => a.ms - b.ms);
    const untimed = mine.filter(it => !it.t);
    if (!E.length) return '<p class="muted small">Dnes se na obloze nic výrazného neděje.</p>';
    const nowMs = Date.now();
    let nextIdx = -1;
    if (isToday) { for (let i = 0; i < E.length; i++) if (E[i].ms >= nowMs) { nextIdx = i; break; } }
    return `<div class="tl">${E.map((e, i) => `<div class="e ${e.kind} ${i === nextIdx ? 'now' : ''}">
      <span class="t">${K.fmtTime(new Date(e.ms), TZ)}</span><span class="dot">${ico(e.icon)}</span>
      <span class="x">${esc(e.text)}${e.note ? `<span class="n">${esc(e.note)}</span>` : ''}</span></div>`).join('')}</div>
      ${untimed.length ? `<p class="note">Bez času: ${untimed.map(x => esc(x.name)).join(' · ')}</p>` : ''}
      ${isToday && nextIdx > 0 ? '<p class="note">Zvýrazněné je nejbližší, co tě dnes čeká.</p>' : ''}`;
  }

  // co leží blízko naplánovaného času – kvůli tomu ten plán v ose je
  function nearbyNote(ms, da, wins) {
    const bits = [];
    for (const w of wins || []) if (ms >= w.from.getTime() - 60000 && ms < w.to.getTime()) bits.push('padá do okna ' + w.use);
    for (const v of da.voc) if (ms >= v.fromClip && ms < v.toClip) bits.push('Luna bez kurzu — nezačínej tím nic nového');
    for (const e of da.moonToNatal) {
      const d = Math.abs(e.ms - ms);
      if (d <= 75 * 60000) {
        const kdy = e.ms > ms ? 'krátce po' : 'krátce před';
        if (e.kind === 'harm') bits.push(`${kdy} tom vstřícná chvíle (${K.fmtTime(new Date(e.ms), TZ)})`);
        else if (e.kind === 'tense') bits.push(`${kdy} tom citlivější chvíle (${K.fmtTime(new Date(e.ms), TZ)})`);
      }
    }
    const ph = K.planetaryHours(da.y, da.m, da.d, observer(), TZ);
    if (ph) { const h = ph.hours.find(x => ms >= x.start.getTime() && ms < x.end.getTime()); if (h) bits.push('hodina ' + K.BODY_GEN[h.ruler]); }
    return bits.length ? bits.join(' · ') : '';
  }

  function transitItem(t) {
    const cls = t.key === 'conj' ? (t.weight > 0 ? 'tone-harm' : t.weight < 0 ? 'tone-tense' : '') : t.kind === 'harm' ? 'tone-harm' : 'tone-tense';
    const note = (t.key === 'conj' ? CONJ_HINT[t.transit] : t.kind === 'harm' ? 'podpora, plynutí' : 'tření, tlak, nutnost rozhodnout') + ` · orbis ${fmtOrb(t.orb)} · ${t.applying ? 'blíží se' : 'odeznívá'}${t.retro ? ' · retrográdně' : ''}`;
    return { g: K.BODY_GLYPH[t.transit], cls, text: `${K.BODY_CZ[t.transit]} ${t.glyph} ${NATAL_ACC[t.natal]}`, note, w: t.weight ? signed(t.weight) : '' };
  }
  const li = (it) => `<li><span class="g ${it.cls || ''}">${it.g}</span><span class="t"><span class="${it.cls || ''}">${esc(it.text)}</span>${it.note ? `<span class="n">${esc(it.note)}</span>` : ''}</span>${it.w ? `<span class="w">${it.w}</span>` : ''}</li>`;

  function stripHTML(da, ph, phPrev, isToday, moonrise, moonset) {
    const t0 = da.dayStart.getTime(), t1 = da.dayEnd.getTime();
    const pct = (ms) => Math.max(0, Math.min(100, (ms - t0) / (t1 - t0) * 100));
    let h = '<div class="sky"></div>';
    if (ph) h += `<div class="daylight" style="left:${pct(ph.sunrise)}%;width:${pct(ph.sunset) - pct(ph.sunrise)}%"></div>`;
    for (const v of da.voc) h += `<div class="voc" style="left:${pct(v.fromClip)}%;width:${pct(v.toClip) - pct(v.fromClip)}%"></div>`;
    const hours = [].concat(phPrev ? phPrev.hours : [], ph ? ph.hours : []);
    for (const hr of hours) {
      const a = Math.max(hr.start.getTime(), t0), b = Math.min(hr.end.getTime(), t1);
      if (b <= a) continue;
      const nowD = new Date();
      const cur = isToday && nowD >= hr.start && nowD < hr.end;
      h += `<div class="hour ${cur ? 'cur' : ''}" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%;background:${PLANET_COLOR[hr.ruler]};opacity:${hr.night ? .55 : .85}" title="${K.BODY_CZ[hr.ruler]} ${K.fmtTime(hr.start, TZ)}–${K.fmtTime(hr.end, TZ)}"></div>`;
    }
    for (const hh of [0, 6, 12, 18, 24]) h += `<span class="hl" style="left:${hh / 24 * 100}%">${hh}</span>`;
    if (ph) { h += `<span class="sunmark" style="left:${pct(ph.sunrise)}%">☉↑</span><span class="sunmark" style="left:${pct(ph.sunset)}%">☉↓</span>`; }
    if (moonrise) h += `<span class="moonmark" style="left:${pct(moonrise.date)}%">☽↑</span>`;
    if (moonset) h += `<span class="moonmark" style="left:${pct(moonset.date)}%">☽↓</span>`;
    for (const e of da.moonToNatal) h += `<span class="tick ${e.kind}" style="left:${pct(e.ms)}%" title="Luna ${e.cz} ${NATAL_ACC[e.target]} ${K.fmtTime(new Date(e.ms), TZ)}">${e.glyph}<b>${K.BODY_GLYPH[e.target]}</b></span>`;
    for (const r of da.resonance.filter(r => r.ms)) h += `<span class="tick" style="left:${pct(r.ms)}%;color:var(--gold)" title="${esc(r.text)}">✦</span>`;
    if (isToday) h += `<div class="now" style="left:${pct(Date.now())}%"></div>`;
    return `<div class="strip" role="img" aria-label="Pás dne: světlo, planetární hodiny, Luna bez kurzu, aspekty Luny">${h}</div>`;
  }

  // ===================== ÚKAZY =====================
  // co který druh úkazu je — jedna věta na rozkliknutí
  const EV_WHAT = [
    [/Novolun/i, 'Luna stojí mezi Zemí a Sluncem a na obloze ji nevidíme. Tradičně je to čas záměrů a nových začátků.'],
    [/První čtvr/i, 'Luna je z poloviny osvětlená a dorůstá. Bývá to čas, kdy se rozjeté věci lámou do rozhodnutí.'],
    [/Úplněk/i, 'Luna stojí proti Slunci a svítí celou noc. Bývá to čas vrcholu, uvědomění a dokončování.'],
    [/Poslední čtvr/i, 'Luna je z poloviny osvětlená a couvá. Bývá to čas úklidu, pouštění a poctivého účtu.'],
    [/zatmění Luny/i, 'Země vrhne stín na Lunu a ta se zbarví do měděna. Nastává jen za úplňku a bývá cítit několik dní kolem.'],
    [/zatmění Slunce/i, 'Luna zakryje sluneční kotouč. Nastává jen za novoluní a působí jako silný obrat, který doznívá týdny.'],
    [/rovnodennost/i, 'Den a noc mají stejnou délku a Slunce vstupuje do dalšího ročního oddílu. Bod rovnováhy a nového rozběhu.'],
    [/slunovrat/i, 'Slunce dosáhne krajní polohy: nejdelšího, nebo nejkratšího dne v roce. Obrat, od kterého světla přibývá či ubývá.'],
    [/v opozici se Sluncem/i, 'Planeta stojí proti Slunci, je nejblíž Zemi a nad obzorem celou noc. Nejlepší doba v roce si ji prohlédnout.'],
    [/dolní konjunkci/i, 'Planeta prochází mezi Zemí a Sluncem a stěhuje se z večerní oblohy na ranní. Několik dní kolem je ztracená v záři Slunce.'],
    [/Přechod .* přes sluneční kotouč/i, 'Planeta přejde jako malý černý bod přes sluneční kotouč. Vzácný úkaz, který se opakuje jednou za roky až desetiletí.'],
    [/Heliakick/i, 'První ráno, kdy je hvězda po týdnech neviditelnosti znovu vidět nízko nad obzorem. Staré kultury tím značily začátky období.'],
    [/maximum roje|roj|idy —|idy$|Perseid|Geminid|Kvadrantid|Lyrid|Aquarid|Orionid|Leonid|Ursid|Taurid/i, 'Země prolétá prachem po kometě a v maximu bývá vidět nejvíc meteorů. Nejštědřejší bývá čas po půlnoci mimo světla města.'],
    [/největší ranní elongace/i, 'Planeta je nejdál od Slunce na ranní obloze a stojí nejvýš nad obzorem před svítáním. Nejlepší dny ji zahlédnout ráno.'],
    [/největší večerní elongace/i, 'Planeta je nejdál od Slunce na večerní obloze a drží se nejdéle po západu. Nejlepší dny ji zahlédnout večer.'],
    [/vstupuje do/i, 'Těleso přechází do dalšího znamení zvěrokruhu a mění se tím ladění následujícího období.'],
    [/na tvé hvězdě/i, 'Planeta prochází přesně přes stálici, která stojí na citlivém místě tvé mapy. Bývá to krátké, výrazné okno.'],
    [/^Konjunkce/i, 'Dvě tělesa stojí na obloze těsně u sebe. Bývá to hezký pohled a v mapě se jejich témata na chvíli spojí.'],
    [/Luna u /i, 'Luna se na obloze přiblíží k planetě nebo jasné hvězdě. Krásný pohled pouhým okem, obvykle jeden večer nebo ráno.'],
    [/obrací do retrogradity/i, 'Planeta se ze Země začne jevit jako couvající. Bývá to čas návratů, revizí a doladění rozdělaného.'],
    [/vrací do přímého pohybu/i, 'Planeta po couvání znovu vykročí vpřed. Odložené věci se rozjíždějí a co se přehodnotilo, dostává směr.'],
    [/^Sluneční návrat$/, 'Slunce stojí přesně tam, kde stálo v okamžiku tvého narození — na minutu přesný začátek tvého osobního roku, obvykle den před nebo po narozeninách. Mapa oblohy v tento okamžik tradičně popisuje rok, který přichází. Dobrý den na ticho, záměr a pohled na uplynulý rok.'],
    [/^Lunární návrat$/, 'Luna se vrací na místo, kde stála při tvém narození — děje se to každých 27 dní. Tichý osobní nov: nálada a potřeby se na pár dní vracejí k tomu, co je ti od základu vlastní. Dobrý den na odpočinek a pozornost k tomu, co doopravdy potřebuješ.'],
    [/^Jupiterův návrat$/, 'Jupiter se po dvanácti letech vrací na místo tvé mapy — kolem 12, 24, 36, 48, 60 let. Tradičně rok otevřených dveří a růstu: co jsi za dvanáct let vybudoval, dostává prostor, a nový cyklus začíná tam, kde máš důvěru.'],
    [/^Saturnův návrat$/, 'Saturn se po 29 letech vrací na místo tvé mapy — kolem 29, 58 a 87 let. Jeden z nejvýznamnějších přechodů života: dospělost se skládá znovu, co bylo jen převzaté, padá, a zůstává, co je opravdu tvé. Bývá náročný a bývá zakládající.'],
    [/^Imbolc$/, 'Brána mezi zimním slunovratem a jarní rovnodenností: Slunce stojí přesně v 15° Vodnáře. Světla znatelně přibývá, pod sněhem se hýbe život. Tradičně čas očisty, světla a prvních záměrů roku.'],
    [/^Beltain$/, 'Brána mezi jarní rovnodenností a letním slunovratem: Slunce v 15° Býka. Vrchol rozkvětu a plodnosti — ohně, tanec, spojení. Tradičně nejradostnější z bran roku.'],
    [/^Lughnasad$/, 'Brána mezi letním slunovratem a podzimní rovnodenností: Slunce v 15° Lva. První sklizeň, chléb z nového obilí, vděčnost za to, co dozrálo, a první tušení, že se rok obrací.'],
    [/^Samhain$/, 'Brána mezi podzimní rovnodenností a zimním slunovratem: Slunce v 15° Štíra. Konec starého roku v kole, čas předků a ticha, kdy se závoj mezi světy ztenčuje. Dušičky k tomu patří.'],
    [/Luna v perigeu/i, 'Luna je na své dráze nejblíž Zemi — vypadá o kousek větší a přílivy jsou silnější. Když se to sejde s úplňkem, říká se tomu superúplněk.'],
    [/Luna v apogeu/i, 'Luna je na své dráze nejdál od Země — zdánlivě menší, přílivy slabší. Úplněk v apogeu je mikroúplněk.'],
    [/kometa|Kometa/i, 'Ledové těleso z okraje sluneční soustavy se přiblížilo ke Slunci a rozsvítilo se. Jasnost komet se odhaduje těžko, tak stojí za to sledovat aktuální zprávy.'],
  ];
  // ---------- ingresy: co která planeta v novém znamení přináší ----------
  const SIGN_KEY = ['Beran','Býk','Blíženc','Rak','Lv','Pann','Váh','Štír','Střelc','Kozoroh','Vodnář','Ryb'];
  const INGRESS_BODY = {
    'Slunce': { d: 'zhruba měsíc', t: 'Roční oddíl se láme a s ním celková nálada období. Sluneční znamení určuje, co má příští týdny hlavní slovo.' },
    'Merkur': { d: 'dva až tři týdny', t: 'Mění se způsob, jakým se domlouváme, píšeme a přemýšlíme — tón hovorů, jednání a rozhodování.' },
    'Venuše': { d: 'tři až čtyři týdny', t: 'Mění se, co nás přitahuje a co považujeme za krásné — chuť ve vztazích, penězích i pohodlí.' },
    'Mars': { d: 'šest až sedm týdnů', t: 'Mění se, kudy jde síla a odvaha — čím se pouštíme do věcí a co nás dokáže vytočit.' },
    'Jupiter': { d: 'asi rok', t: 'Mění se oblast, kde se otevírá prostor a přichází růst. Velký pomalý posun, který ovlivní celý rok.' },
    'Saturn': { d: 'dva a půl roku', t: 'Mění se oblast, která žádá řád, trpělivost a poctivou práci. Dlouhý úsek, do kterého se dozrává.' },
    'Uran': { d: 'sedm let', t: 'Mění se pole, kde se hýbe zaběhané a přichází nečekané. Generační posun, který doznívá roky.' },
    'Neptun': { d: 'čtrnáct let', t: 'Mění se pole, kde se rozpouštějí hranice a sílí představivost i citlivost. Velmi pomalý příliv.' },
    'Pluton': { d: 'kolem dvaceti let', t: 'Mění se pole hluboké proměny — co se rozpadne, aby mohlo vzniknout znovu. Nejpomalejší z posunů.' },
    'Luna': { d: 'dva až tři dny', t: 'Mění se barva nálady dne. Nejrychlejší ze všech posunů — projeví se hned a za pár dní je jinak.' },
  };
  const SIGN_TONE = {
    'Beran': 'rozběh, přímost a chuť začínat', 'Býk': 'klid, hmatatelnost a smysl pro trvanlivost',
    'Blíženc': 'zvědavost, hovory a lehkost', 'Rak': 'péče, domov a citlivost',
    'Lv': 'srdce, viditelnost a radost z tvoření', 'Pann': 'pořádek, detail a služba věci',
    'Váh': 'vyváženost, vztahy a smysl pro krásu', 'Štír': 'hloubka, opravdovost a proměna',
    'Střelc': 'rozhled, důvěra a chuť za obzor', 'Kozoroh': 'řád, vytrvalost a odpovědnost',
    'Vodnář': 'nadhled, svoboda a nové cesty', 'Ryb': 'prostupnost, soucit a představivost',
  };
  // ---------- výklady úkazů: konkrétní podle tělesa a znamení ----------
  const BODY_GLYPH_CZ = { 'Slunce': '☉', 'Luna': '☽', 'Merkur': '☿', 'Venuše': '♀', 'Mars': '♂', 'Jupiter': '♃', 'Saturn': '♄', 'Uran': '♅', 'Neptun': '♆', 'Pluton': '♇' };
  // téma tělesa v 1. pádu (pro skládané věty)
  const BODY_THEME = { 'Slunce': 'vůle a životní střed', 'Luna': 'nálada a potřeby', 'Merkur': 'myšlení a řeč', 'Venuše': 'vztahy, krása a hodnoty', 'Mars': 'síla a odvaha', 'Jupiter': 'růst a důvěra', 'Saturn': 'řád a trpělivost', 'Uran': 'změna a svoboda', 'Neptun': 'sen, cit a soucit', 'Pluton': 'hloubka a proměna' };
  // 2. pád jmen těles v názvech (Luna u Venuše, Konjunkce Venuše a Jupitera)
  const BODY_FROM_GEN = { 'Slunce': 'Slunce', 'Luny': 'Luna', 'Merkuru': 'Merkur', 'Venuše': 'Venuše', 'Marsu': 'Mars', 'Jupitera': 'Jupiter', 'Saturnu': 'Saturn', 'Uranu': 'Uran', 'Neptunu': 'Neptun', 'Plutona': 'Pluton' };
  const SIGN_RE = [[/^Beran/, 'Beran'], [/^Býk/, 'Býk'], [/^Blíženc/, 'Blíženc'], [/^Rak/, 'Rak'], [/^L(v|ev)/, 'Lv'], [/^Pann/, 'Pann'], [/^Váh/, 'Váh'], [/^Štír/, 'Štír'], [/^Střel/, 'Střelc'], [/^Kozoroh/, 'Kozoroh'], [/^Vodnář/, 'Vodnář'], [/^Ryb/, 'Ryb']];
  const SIGN_LOC = { 'Beran': 'v Beranu', 'Býk': 'v Býku', 'Blíženc': 'v Blížencích', 'Rak': 'v Raku', 'Lv': 've Lvu', 'Pann': 'v Panně', 'Váh': 've Vahách', 'Štír': 've Štíru', 'Střelc': 've Střelci', 'Kozoroh': 'v Kozorohu', 'Vodnář': 've Vodnáři', 'Ryb': 'v Rybách' };
  const signKeyOf = (s) => { const h = SIGN_RE.find(([re]) => re.test(s || '')); return h ? h[1] : null; };
  const signFromNote = (note) => { const m = (note || '').match(/\d+°(?:\d+′)?\s+([^\s·]+)/); return m ? signKeyOf(m[1]) : null; };
  const RETRO_BODY = {
    'Merkur': ['zhruba tři týdny', 'Nejčastěji se to pozná na domluvách, cestách a technice: co jde vyřídit, chce druhé přečtení, a věci z minulosti se vracejí k dořešení. Dobrý čas na revizi, špatný na podpis, který nejde vzít zpět.'],
    'Venuše': ['zhruba šest týdnů', 'Vracejí se témata vztahů a hodnot: staří známí, nedořešené city, přehodnocení toho, co má pro tebe cenu. Velké kroky ve vztazích a větší nákupy snesou odklad.'],
    'Mars': ['dva až dva a půl měsíce', 'Síla jde dovnitř místo ven: rozjeté věci zpomalují, tlak vyvolává tření. Dobrý čas dokončovat a trénovat trpělivost, nový boj nezačínat.'],
    'Jupiter': ['zhruba čtyři měsíce', 'Růst se přesouvá z vnějšího do vnitřního: méně expanze, víc porozumění tomu, co už máš. Velké plány zrají, místo aby se rozjížděly.'],
    'Saturn': ['zhruba čtyři a půl měsíce', 'Řád se přehodnocuje: struktury, závazky a odpovědnosti procházejí zkouškou, zda ještě drží. Co je pevné, obstojí; co bylo jen zvyk, se ukáže.'],
    'Uran': ['zhruba pět měsíců', 'Změna se odehrává uvnitř, ne navenek: člověk si teprve uvědomuje, co ho svazuje. Vnější zvraty přijdou až po návratu k přímému pohybu.'],
    'Neptun': ['zhruba pět a půl měsíce', 'Závoje se odhrnují: co bylo idealizované, se ukáže střízlivěji. Čas na pravdu vůči sobě, dobrý pro tvorbu a vnitřní práci.'],
    'Pluton': ['zhruba pět a půl měsíce', 'Hluboká proměna zpomalí a prohloubí se: co se má rozpadnout, se rozpadá tiše a zevnitř. Pomalý, ale nejtrvalejší z retrográdních pohybů.'],
  };
  const DIRECT_BODY = {
    'Merkur': 'Domluvy, cesty a technika se zase rozjíždějí; co bylo přehodnoceno, se dá podepsat. Prvních pár dní ještě doznívá, plná rychlost přijde do dvou týdnů.',
    'Venuše': 'Vztahy a hodnoty se zase dívají dopředu. Co retrograda vrátila k přezkoumání, dostává jasnou odpověď.',
    'Mars': 'Síla se vrací ven — rozjeté věci znovu nabírají tempo a co se odkládalo, se dá udělat.',
    'Jupiter': 'Růst se obrací navenek: plány, které měsíce zrály, se dají rozjet.',
    'Saturn': 'Co obstálo v přezkoumání, se dá stavět dál. Závazky, které přežily, jsou teď pevnější.',
    'Uran': 'Změna, kterou sis uvědomil, se začíná dít i navenek.',
    'Neptun': 'Sny a tvorba dostávají zase proud; co ses o sobě dozvěděl, se dá žít.',
    'Pluton': 'Hluboká proměna dostává směr: co se rozpadlo, uvolňuje místo novému.',
  };
  const LUNA_NEAR = {
    'Venuše': 'Nejjasnější planeta vedle Luny — nejkrásnější z těchto setkání, obvykle za soumraku nebo před svítáním. Tradičně večer pro něhu a smíření.',
    'Jupiter': 'Zlatavá tečka vedle Luny, dobře viditelná i ve městě. Setkání Luny s planetou růstu — tradičně příznivá chvíle pro velkorysost.',
    'Mars': 'Načervenalá tečka vedle Luny. Setkání nálady se silou — tradičně den, kdy emoce mají tah, tak s nimi zacházej vědomě.',
    'Saturn': 'Bledě žlutá tečka vedle Luny. Setkání nálady s řádem — tradičně tišší, vážnější den, dobrý na povinnosti.',
    'Merkur': 'Drobná tečka u Luny nízko nad obzorem, vidět jen za dobrých podmínek. Nálada a řeč se potkávají — den na rozhovory s citem.',
    'Uran': 'Pouhým okem nevidíš, v dalekohledu je to modrozelený kotouček. Setkání nálady s nečekaným.',
    'Neptun': 'Jen v dalekohledu. Nálada se potkává se snem — den citlivější a méně ostrý.',
    'Pluton': 'Jen ve velkém dalekohledu. Nálada se potkává s hloubkou — den, kdy se ozve, co bylo pod povrchem.',
  };
  const OPPO_BODY = {
    'Mars': 'Mars je v opozici jen jednou za dva roky a tehdy je nejjasnější a největší v dalekohledu. Tradičně vrchol jeho síly — energie a tlak jsou na maximu.',
    'Jupiter': 'Jupiter je v opozici každý rok, teď je nejjasnější a v dalekohledu ukáže pásy i měsíce. Tradičně vrchol tématu růstu a důvěry.',
    'Saturn': 'Saturn je v opozici každý rok, teď je nejjasnější a prstence jsou v dalekohledu nejzřetelnější. Tradičně vrchol tématu řádu a trpělivosti.',
    'Uran': 'Uran je v opozici každý rok; za dobré noci je na hranici viditelnosti pouhým okem, v dalekohledu modrozelený kotouček.',
    'Neptun': 'Neptun je v opozici každý rok, k vidění jen v dalekohledu jako modravá tečka.',
  };
  function evWhatSpecific(title, note) {
    let m;
    if ((m = title.match(/^(\S+)\s+vstupuje do\s+(.+)$/))) {
      const body = INGRESS_BODY[m[1]]; if (!body) return '';
      const key = signKeyOf(m[2]); const tone = key ? SIGN_TONE[key] : '';
      return `${body.t}${tone ? ` Nové znamení tomu dává tón: ${tone}.` : ''} ${m[1]} v něm zůstane ${body.d}.`;
    }
    if ((m = title.match(/^(\S+) se obrací do retrogradity/))) {
      const r = RETRO_BODY[m[1]]; const sk = signFromNote(note);
      return r ? `${m[1]} se ze Země začne jevit jako couvající${sk ? ` — ${SIGN_LOC[sk]}, takže se to nejvíc dotkne témat, která toto znamení nese` : ''}. ${r[1]} Potrvá to ${r[0]}.` : '';
    }
    if ((m = title.match(/^(\S+) se vrací do přímého pohybu/))) {
      const d = DIRECT_BODY[m[1]]; return d ? `${m[1]} po couvání znovu vykročí vpřed. ${d}` : '';
    }
    if ((m = title.match(/^Luna u (\S+)$/))) {
      const b = BODY_FROM_GEN[m[1]]; return b && LUNA_NEAR[b] ? LUNA_NEAR[b] : '';
    }
    if ((m = title.match(/^Konjunkce (\S+) a (\S+)$/))) {
      const b1 = BODY_FROM_GEN[m[1]], b2 = BODY_FROM_GEN[m[2]];
      if (b1 && b2 && BODY_THEME[b1] && BODY_THEME[b2]) return `${b1} a ${b2} stojí na obloze těsně u sebe, obvykle hezký pohled za soumraku nebo před svítáním. Na několik dní se spojuje, co nese ${b1} (${BODY_THEME[b1]}), s tím, co nese ${b2} (${BODY_THEME[b2]}).`;
      return '';
    }
    if ((m = title.match(/^(\S+) v opozici se Sluncem/))) return OPPO_BODY[m[1]] || '';
    if ((m = title.match(/^(\S+) – největší (ranní|večerní) elongace/))) {
      const when = m[2] === 'ranní' ? 'ráno před svítáním nízko nad východním obzorem' : 'večer po západu Slunce nízko nad západním obzorem';
      return `${m[1]} je teď nejdál od Slunce, jak se z naší strany dostane, a proto ${m[1] === 'Venuše' ? 'září' : 'je vidět'} ${when}. ${m[1] === 'Merkur' ? 'Merkur se jinak drží u Slunce a tohle je jedno z mála oken, kdy ho pouhým okem zahlédneš.' : 'Nejjasnější Venuše roku bývá právě kolem elongace.'}`;
    }
    if ((m = title.match(/^(Novoluní|Úplněk|První čtvrt|Poslední čtvrt)$/))) {
      const sk = signFromNote(note); if (!sk) return '';
      const base = { 'Novoluní': 'Luna stojí mezi Zemí a Sluncem a na obloze ji nevidíme. Tradičně čas záměrů a nových začátků', 'Úplněk': 'Luna stojí proti Slunci a svítí celou noc. Tradičně čas vrcholu, uvědomění a dokončování', 'První čtvrt': 'Luna je z poloviny osvětlená a dorůstá. Čas, kdy se rozjeté věci lámou do rozhodnutí', 'Poslední čtvrt': 'Luna je z poloviny osvětlená a couvá. Čas úklidu, pouštění a poctivého účtu' }[m[1]];
      return `${base} — tentokrát ${SIGN_LOC[sk]}, tedy kolem témat, jako je ${SIGN_TONE[sk]}.`;
    }
    if (/zatmění Luny/i.test(title)) { const sk = signFromNote(note); return `Země vrhne stín na Lunu a ta se zbarví do měděna. Nastává jen za úplňku a bývá cítit několik týdnů — silnější úplněk se stejným tématem${sk ? `, tentokrát ${SIGN_LOC[sk]}: ${SIGN_TONE[sk]}` : ''}.`; }
    if (/zatmění Slunce/i.test(title)) { const sk = signFromNote(note); return `Luna zakryje sluneční kotouč. Nastává jen za novoluní a působí jako silný obrat, který doznívá měsíce — nový začátek s velkou vahou${sk ? `, tentokrát ${SIGN_LOC[sk]}: ${SIGN_TONE[sk]}` : ''}.`; }
    return '';
  }
  // ikona podle tělesa v názvu; stanice mají vlastní značku
  function evIcon(e) {
    const t = e.title || '';
    if (/se obrací do retrogradity/.test(t)) return '℞';
    if (/se vrací do přímého pohybu/.test(t)) return '⟳';
    if (/^Konjunkce /.test(t)) return '☌';
    if (/v opozici se Sluncem/.test(t)) return '☍';
    const m = t.match(/^(Slunce|Luna|Merkur|Venuše|Mars|Jupiter|Saturn|Uran|Neptun|Pluton)\b/);
    if (m && e.cat === 'planety') return BODY_GLYPH_CZ[m[1]];
    return CAT_ICON[e.cat] || '✧';
  }
  function evWhat(title, note) { const sp = evWhatSpecific(title, note); if (sp) return sp; const h = EV_WHAT.find(([re]) => re.test(title)); return h ? h[1] : ''; }
  function renderEvents() {
    const v = $('#view-ukazy');
    if (!S.natal) { v.innerHTML = noNatalHTML('úkazy roku dopředu a to, jak se dotknou právě tebe'); return; }
    v.innerHTML = '<div class="loading">Počítám oblohu na rok dopředu…</div>';
    setTimeout(() => {
      const key = `y|${activeId}|${np.y}-${np.m}|${settings.loc.lat},${settings.loc.lon}|${(settings.comets || '').length}`;
      let evs = S.evCache[key];
      if (!evs) {
        const d0 = K.dayStart(np.y, np.m, 1, TZ);
        const endM = np.m === 12 ? 1 : np.m + 1, endY = np.m === 12 ? np.y + 1 : np.y;
        const d1 = K.dayStart(endY + 1, endM, 1, TZ);
        evs = K.skyEvents(d0, d1, observer(), S.natal, TZ).concat(cometEvents(d0, d1));
        // heliakické východy tvých hvězd
        for (const st of S.natal.stars.filter(s => s.mine || s.strength > 0)) {
          for (const yy of [np.y, np.y + 1]) {
            const hr = K.heliacalRising(st, yy, observer(), TZ);
            if (hr && hr >= d0 && hr < d1) evs.push({ date: new Date(hr.getTime() + 5 * 3600000), cat: 'hvezdy', title: `Heliakický východ – ${st.name}`, note: `první ranní viditelnost (${esc(settings.loc.name)}) po období, kdy hvězdu zakrývalo Slunce · ${st.mine ? 'hlavní' : 'vedlejší'} hvězda tvého nativu`, resonance: st.mine });
          }
        }
        evs.sort((a, b) => a.date - b.date);
        S.evCache[key] = evs;
      }
      const list = S.filter === 'vse' ? evs : evs.filter(e => e.cat === S.filter);
      const months = {};
      for (const e of list) { const p = K.tzParts(e.date, TZ); const k = `${p.y}-${pad(p.m)}`; (months[k] = months[k] || { y: p.y, m: p.m, items: [] }).items.push(e); }
      const chips = ['vse', 'osobni', 'zatmeni', 'luna', 'planety', 'hvezdy', 'roje', 'slunce', 'komety'].map(c => `<button type="button" class="chip ${S.filter === c ? 'on' : ''}" data-act="filter" data-f="${c}">${CAT_CZ[c]}</button>`).join('');
      let html = `<div class="h2">Úkazy · ${esc(settings.loc.name)}</div><p class="note">${S.evAll ? 'Rok dopředu od tohoto měsíce.' : 'Nejbližší tři měsíce.'} Časy jsou v našem čase, viditelnost počítaná pro ${esc(settings.loc.name)} (${fmtNum(settings.loc.lat, 3)} N, ${fmtNum(settings.loc.lon, 3)} E).</p><div class="row" style="gap:6px">${chips}</div>`;
      const allKeys = Object.keys(months).sort();
      const keys = S.evAll ? allKeys : allKeys.slice(0, 3);
      if (!keys.length) html += '<p class="muted">V této kategorii nic není.</p>';
      const nowMs = Date.now();
      let pastCount = 0;
      for (const k of keys) { for (const e of months[k].items) if (e.date.getTime() < nowMs) pastCount++; }
      if (pastCount && !S.evPast) html += `<div class="pastbar"><button type="button" class="chip small" data-act="evPastOn">▾ zobrazit ${pastCount} ${pastCount === 1 ? 'uplynulý úkaz' : (pastCount < 5 ? 'uplynulé úkazy' : 'uplynulých úkazů')}</button></div>`;
      else if (pastCount) html += `<div class="pastbar"><button type="button" class="chip small" data-act="evPastOff">▴ skrýt uplynulé</button></div>`;
      for (const k of keys) {
        const mo = months[k];
        const shown = S.evPast ? mo.items : mo.items.filter(e => e.date.getTime() >= nowMs);
        if (!shown.length) continue;
        html += `<div class="ev-month">${K.MONTH_CZ[mo.m - 1].charAt(0).toUpperCase() + K.MONTH_CZ[mo.m - 1].slice(1)} ${mo.y}</div>`;
        for (const e of shown) {
          const p = K.tzParts(e.date, TZ);
          html += `<div class="ev ${e.resonance ? 'res' : ''} ${e.date.getTime() < nowMs ? 'gone' : ''}"><div class="dt"><b>${p.d}.</b>${e.cat === 'roje' || e.custom || e.cat === 'hvezdy' && e.title.startsWith('Heliak') ? '' : K.fmtTime(e.date, TZ)}</div><div><div class="ti"><span class="c">${ico(evIcon(e))}</span>${esc(e.title)}${evWhat(e.title, e.note) ? `<i class="evq" data-act="evWhat" role="button" aria-label="Co to je?">?</i>` : ''}</div>${e.note ? `<div class="no">${esc(e.note)}</div>` : ''}${evWhat(e.title, e.note) ? `<div class="evwhat">${esc(evWhat(e.title, e.note))}</div>` : ''}</div></div>`;
        }
      }
      html += `<p class="note" style="margin-top:18px">Komety, novy a podobné jednorázové úkazy se spočítat nedají – přidáš si je v Nastavení (řádek: datum | název | poznámka).</p>`;
      if (!S.evAll && allKeys.length > 3) html += `<div class="row" style="justify-content:center;margin:12px 0 4px"><button type="button" class="btn ghost" data-act="evAll">Zobrazit celý rok</button></div>`;
      else if (S.evAll && allKeys.length > 3) html += `<div class="row" style="justify-content:center;margin:12px 0 4px"><button type="button" class="btn ghost" data-act="evLess">Zobrazit jen tři měsíce</button></div>`;
      v.innerHTML = html;
    }, 30);
  }

  // ===================== EFEMERIDY =====================
  function ephRows() { return K.ephemerisMonth(S.eph.y, S.eph.m, TZ); }
  function renderEphemeris() {
    const v = $('#ephHost');
    if (!v) return;
    const { y, m } = S.eph;
    const rows = ephRows();
    const cols = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    const evs = S.natal ? monthEvents(y, m) : K.skyEvents(K.dayStart(y, m, 1, TZ), K.addDays(K.dayStart(y, m, K.daysInMonth(y, m), TZ), 1), observer(), null, TZ);
    const ctx = K.monthContext(y, m, TZ);
    const phaseDays = new Set(evs.filter(e => e.cat === 'luna' && e.quarter != null).map(e => K.dateKey(e.date, TZ)));
    let t = `<table class="eph"><thead><tr><th>den</th>${cols.map(c => `<th title="${K.BODY_CZ[c]}">${K.BODY_GLYPH[c]}</th>`).join('')}<th title="střední uzel">☊</th></tr></thead><tbody>`;
    for (const r of rows) {
      const key = K.dateKey(r.date, TZ);
      t += `<tr class="${phaseDays.has(key) ? 'phase' : ''}"><td>${r.d}.</td>${cols.map(c => `<td>${K.fmtLon(r.pos[c].lon)}${r.pos[c].retro ? '<span class="r">R</span>' : ''}</td>`).join('')}<td>${K.fmtLon(r.pos.Node.lon)}</td></tr>`;
    }
    t += '</tbody></table>';
    const monthEvs = evs.filter(e => ['luna', 'planety', 'slunce', 'zatmeni'].includes(e.cat) && !(e.conj)).map(e => `<li><span class="g">${ico(CAT_ICON[e.cat])}</span><span class="t">${esc(e.title)}<span class="n">${K.fmtDateCz(e.date, TZ)} ${K.fmtTime(e.date, TZ)}${e.note ? ' · ' + esc(e.note) : ''}</span></span></li>`).join('');
    const vocList = ctx.voc.filter(vv => K.tzParts(new Date(vv.to), TZ).m === m && K.tzParts(new Date(vv.to), TZ).y === y).map(vv => `<li><span class="g">∅</span><span class="t">${K.fmtDateCz(new Date(vv.from), TZ)} ${K.fmtTime(new Date(vv.from), TZ)} → ${K.fmtDateCz(new Date(vv.to), TZ)} ${K.fmtTime(new Date(vv.to), TZ)}<span class="n">${vv.lastAspect ? 'poslední aspekt ' + vv.lastAspect.glyph + ' ' + K.BODY_CZ[vv.lastAspect.target] + ' · ' : ''}vstup do ${K.SIGN_GEN[vv.toSign]}</span></span></li>`).join('');
    v.innerHTML = `
      <div class="monthbar"><button class="navbtn" data-act="ephPrev" aria-label="Předchozí měsíc">‹</button><div class="mn">${K.MONTH_CZ[m - 1].charAt(0).toUpperCase() + K.MONTH_CZ[m - 1].slice(1)}<em>${y}</em></div><button class="navbtn" data-act="ephNext" aria-label="Další měsíc">›</button></div>
      <p class="note">Geocentrické tropické polohy o půlnoci našeho času (začátek dne). R = retrográdní pohyb. Řádky zlatě = den novoluní, čtvrti nebo úplňku.</p>
      <div class="row" style="margin:0 0 10px"><button type="button" class="btn ghost small" data-act="ephCsv">Stáhnout CSV</button></div>
      <div class="eph-wrap">${t}</div>
      <div class="h3">Ingresy, stanice, fáze</div><ul class="list">${monthEvs || '<li class="muted">—</li>'}</ul>
      <div class="h3">Luna bez kurzu</div><ul class="list">${vocList || '<li class="muted">—</li>'}</ul>`;
  }
  function downloadCsv() {
    const { y, m } = S.eph;
    const rows = ephRows();
    const cols = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Node'];
    let csv = 'datum;' + cols.map(c => K.BODY_CZ[c]).join(';') + ';' + cols.map(c => K.BODY_CZ[c] + '_stupne').join(';') + '\n';
    for (const r of rows) csv += `${K.isoDate(y, m, r.d)};` + cols.map(c => K.fmtLonText(r.pos[c].lon) + (r.pos[c].retro ? ' R' : '')).join(';') + ';' + cols.map(c => (Math.round(r.pos[c].lon * 1000) / 1000).toString().replace('.', ',')).join(';') + '\n';
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `efemeridy-${y}-${pad(m)}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ===================== NATIV =====================
  const STAR_ANGLE_PAST = { kulminuje: 'kulminovala', antikulminuje: 'procházela dolní kulminací', vychází: 'vycházela', zapadá: 'zapadala' };
  const PL_GENDER = { Sun: 'n', Moon: 'f', Venus: 'f' };
  function planetVerb(angle, planet) {
    const g = PL_GENDER[planet] || 'm';
    const base = { kulminuje: 'kulminoval', antikulminuje: 'procházel dolní kulminací', vychází: 'vycházel', zapadá: 'zapadal' }[angle];
    return g === 'm' ? base : base.replace(/kulminoval|procházel|vycházel|zapadal/, w => w + (g === 'f' ? 'a' : 'o'));
  }
  const CHAKRA = [{"n": "Múládhára", "cz": "kořenová", "col": CHAKRA_COL.root, "t": "tělo, bezpečí, domov, důvěra"}, {"n": "Svádhišthána", "cz": "křížová", "col": CHAKRA_COL.sacral, "t": "cit, chuť, blízkost, tvořivost"}, {"n": "Manipúra", "cz": "solar plexus", "col": CHAKRA_COL.solar, "t": "vůle, síla, jednání, hranice"}, {"n": "Anáhata", "cz": "srdeční", "col": CHAKRA_COL.heart, "t": "srdce, přijetí, dávání, spojení"}, {"n": "Višuddha", "cz": "krční", "col": CHAKRA_COL.throat, "t": "hlas, pravda, vyjádření"}, {"n": "Ádžňá", "cz": "třetí oko", "col": CHAKRA_COL.brow, "t": "vhled, rozlišení, vidění celku"}, {"n": "Sahasrára", "cz": "korunní", "col": CHAKRA_COL.crown, "t": "smysl, přesah, celistvost"}];
  const CHAKRA_BLOCK = ["Blok o kořenech: o těle, bezpečí, domově a důvěře, že svět unese.", "Blok o prožívání: o citu, blízkosti, tvořivosti a chuti do života.", "Blok o vlastní síle: o jednání, hranicích, sebedůvěře a směru.", "Blok o vztazích: o dávání a přijímání, o partnerství a soucitu.", "Blok o vyjádření: o vlastní řeči, pravdivosti, tvorbě a naslouchání.", "Blok o vidění: o rozlišení, směru, intuici a chápání souvislostí.", "Blok o celistvosti: o smyslu, napojení, odevzdání a tichém návratu k podstatě."];
  // rok života a čakry malého i velkého cyklu
  function chakraYear(prof, ref) {
    const now = ref || new Date();
    const by = +prof.y, bm = +prof.m, bd = +prof.d;
    const ny = now.getFullYear();
    const hadBirthday = (now.getMonth() + 1 > bm) || (now.getMonth() + 1 === bm && now.getDate() >= bd);
    const age = ny - by - (hadBirthday ? 0 : 1);
    const n = age + 1;                     // pořadí roku života
    const small = ((n - 1) % 7);
    const big = (Math.floor((n - 1) / 7) % 7);
    const round = Math.floor((n - 1) / 49) + 1;
    const from = new Date(hadBirthday ? ny : ny - 1, bm - 1, bd);
    const to = new Date(hadBirthday ? ny + 1 : ny, bm - 1, bd);
    return { n, age, small, big, round, from, to, cell: CHAKRA_GRID[big][small], sm: CHAKRA[small], bg: CHAKRA[big], block: CHAKRA_BLOCK[big] };
  }
  const ARC = [
    'první rok sedmiletí — pokládají se základy nového tématu a hledá se v něm jistota',
    'druhý rok — téma se okouší a přichází k němu chuť',
    'třetí rok — do tématu vstupuje vlastní vůle a síla',
    'čtvrtý rok, střed sedmiletí — téma se prohlubuje a otevírá se druhým',
    'pátý rok — téma hledá svůj hlas a dá se vyslovit',
    'šestý rok — téma se chápe a je vidět jako celek',
    'poslední rok sedmiletí — téma se uzavírá a otevírají se dveře k dalšímu bloku',
  ];
  function chakraHTML(prof) {
    const c = chakraYear(prof);
    const dd = (d) => `${d.getDate()}. ${K.MONTH_GEN[d.getMonth()]} ${d.getFullYear()}`;
    const blockFrom = c.n - c.small, blockTo = blockFrom + 6;
    const dots = (activeIdx) => CHAKRA.map((ch, i) => `<span class="ch-dot${i === activeIdx ? ' on' : ''}" style="${i === activeIdx ? `background:${ch.col};box-shadow:0 0 10px ${ch.col}77` : `background:${ch.col};opacity:.28`}" title="${esc(ch.n)}"></span>`).join('');
    return `<div class="h3">Čakra roku</div>
      <div class="card chakra">
        <p class="ch-lead">Život se dělí na sedmiletí a každý rok uvnitř nich patří jedné čakře. Teď jsi v <b>${blockFrom}.–${blockTo}. roce života</b> — to je sedmiletí <b style="color:${c.bg.col}">${esc(c.bg.n)}</b> — a uvnitř něj v <b>${c.small + 1}. roce</b>, který patří čakře <b style="color:${c.sm.col}">${esc(c.sm.n)}</b>. Sedmiletí drží <b>základní téma</b>, rok říká, <b>čím se to téma letos zpracovává</b>. Jejich setkání dává letošku jméno:</p>
        <div class="ch-head">
          <span class="ch-mark" style="background:${c.sm.col};box-shadow:0 0 12px ${c.sm.col}66"></span>
          <span class="ch-name">${esc(c.cell.n)}</span>
          <span class="ch-year">${c.n}. rok života${c.round > 1 ? ` · ${c.round}. oktáva` : ''}</span>
        </div>
        <p class="ch-text">${esc(c.cell.t)}</p>
        <div class="ch-track">
          <small>Sedmiletí — kolikáté v pořadí</small>
          <div class="ch-dots">${dots(c.big)}</div>
          <b style="color:${c.bg.col}">${c.big + 1}. · ${esc(c.bg.n)}</b> <span>${esc(c.bg.cz)} — ${esc(c.bg.t)}</span>
          <em>${esc(c.block)}</em>
        </div>
        <div class="ch-track">
          <small>Rok uvnitř sedmiletí</small>
          <div class="ch-dots">${dots(c.small)}</div>
          <b style="color:${c.sm.col}">${c.small + 1}. · ${esc(c.sm.n)}</b> <span>${esc(c.sm.cz)} — ${esc(c.sm.t)}</span>
          <em>${esc(ARC[c.small])}.</em>
          <em>Platí od ${dd(c.from)} do ${dd(c.to)}, kdy nastupuje další.</em>
        </div>
        <details class="hsintro ch-how"><summary>Jak se čakra roku počítá</summary><p>Sedm čaker se střídá po roce: první rok života patří kořenové, druhý křížové a tak dál. Po sedmi letech začne řada znovu — a zároveň každé celé sedmiletí patří jedné čakře ve stejném pořadí, takže běží dva cykly naráz.</p><p>Sedmiletí drží základní téma období, rok uvnitř něj říká, kterou funkcí se to téma právě rozvíjí. Uvnitř každého sedmiletí má řada svůj oblouk: první rok pokládá základy a hledá jistotu, prostřední roky téma prohlubují a vyslovují, poslední rok je uzavírá a otevírá dveře k dalšímu bloku.</p><p>Pětkrát sedm let přivádí zhruba do středu života, sedmkrát sedm uzavírá celý cyklus 49 let. Padesátým rokem začíná nový úsek — stejná témata ve vyšší oktávě, s tím, co už člověk umí. Druhý velký průchod se uzavírá kolem 98 let.</p><p class="ch-src">Vychází z modelu popsaného v Základní knize o čakrách (Sharamon, Baginski) a z antroposofické nauky o sedmiletích.</p></details>
      </div>`;
  }
  function renderNatal() {
    const v = $('#view-nativ');
    const n = S.natal, p = activeProfile();
    if (!n) { v.innerHTML = noNatalHTML('tvůj horoskop, domy a hvězdy'); return; }
    const keys = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Node', 'Asc', 'MC'];
    const PT_WHAT = { Sun: 'jádro osobnosti, vůle a životní směr', Moon: 'pocity, potřeby a vnitřní pohoda', Mercury: 'myšlení, řeč a učení', Venus: 'vztahy, hodnoty a smysl pro krásu', Mars: 'síla, odvaha a schopnost jednat', Jupiter: 'růst, důvěra a příležitosti', Saturn: 'řád, odpovědnost a zrání', Uranus: 'svoboda, změna a originalita', Neptune: 'intuice, sen a soucit', Pluto: 'hloubka, moc a proměna', Node: 'směr růstu v tomto životě', Asc: 'jak vstupuješ do světa a jak tě druzí vidí', MC: 'životní směr, povolání a veřejná role' };
    const ptsCards = keys.map(k => {
      const pt = n.points[k]; const si = K.signOf(pt.lon); const h = pt.house;
      const signTxt = k === 'Sun' ? HS.SUN[si] : k === 'Moon' ? HS.MOON[si] : k === 'Asc' ? HS.ASC[si] : (PT_SIGN[k] || [])[si] || '';
      const houseTxt = (k !== 'Asc' && k !== 'MC' && h && PT_VERB[k]) ? `${PT_VERB[k]} hlavně v oblasti ${HS.HOUSE_AREA[h - 1]} (${h}. dům).` : '';
      return `<details class="ptcard"><summary><span class="g">${K.BODY_GLYPH[k]}</span><b>${K.BODY_CZ[k]}${k === 'Node' ? ' (uzel)' : ''}</b><span class="sg">${K.SIGN_LOC_V[si]} · ${K.fmtLon(pt.lon)}${pt.retro && k !== 'Node' ? ' R' : ''}${h && k !== 'Asc' && k !== 'MC' ? ` · ${h}. dům` : ''}</span></summary>
        <div class="ptbody"><p class="what">${PT_WHAT[k] || ''}.</p>${signTxt ? `<p>${signTxt}</p>` : ''}${houseTxt ? `<p class="muted">${houseTxt}</p>` : ''}${pt.retro && k !== 'Node' && k !== 'Sun' && k !== 'Moon' ? '<p class="muted">Retrográdní při narození: toto téma zraje dovnitř a projevuje se později, ale hlouběji.</p>' : ''}</div>
      </details>`;
    }).join('');
    const pts = keys.map(k => `<tr><td class="g">${K.BODY_GLYPH[k]}</td><td>${K.BODY_CZ[k]}${k === 'Node' ? ' (střední)' : ''}${k === 'Asc' ? ' <span class="muted small">· hrot 1. domu</span>' : (k === 'MC' ? ' <span class="muted small">· Medium Coeli, hrot 10. domu</span>' : '')}</td><td class="p">${K.fmtLon(n.points[k].lon)}${n.points[k].retro && k !== 'Node' ? '<span class="tone-tense"> R</span>' : ''}</td><td class="muted">${k === 'Asc' || k === 'MC' ? '' : n.points[k].house + '. dům'}</td></tr>`).join('')
      + `<tr><td class="g">Dsc</td><td>Descendent <span class="muted small">· hrot 7. domu, naproti Ascendentu</span></td><td class="p">${K.fmtLon(n.cusps[7])}</td><td class="muted"></td></tr>`
      + `<tr><td class="g">IC</td><td>Imum Coeli <span class="muted small">· hrot 4. domu, naproti MC</span></td><td class="p">${K.fmtLon(n.cusps[4])}</td><td class="muted"></td></tr>`;
    const houses = Array.from({ length: 12 }, (_, i) => `<span class="mono small">${i + 1}: ${K.fmtLon(n.cusps[i + 1])}</span>`).join(' · ');
    // nativní aspekty
    const NA = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Asc', 'MC'];
    const asps = [];
    for (let i = 0; i < NA.length; i++) for (let j = i + 1; j < NA.length; j++) { const a = K.aspectBetween(n.points[NA[i]].lon, n.points[NA[j]].lon, { default: 6, sextile: 4 }); if (a) asps.push({ a: NA[i], b: NA[j], ...a }); }
    asps.sort((x, y) => x.orb - y.orb);
    const PT_SHORT = { Sun: 'Slunce', Moon: 'Luna', Mercury: 'Merkur', Venus: 'Venuše', Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturn', Uranus: 'Uran', Neptune: 'Neptun', Pluto: 'Pluto', Node: 'uzel', Asc: 'Ascendent', MC: 'životní směr (MC)' };
    const ASP_KIND_CZ = { conj: ['spojené', 'konjunkce'], sextile: ['v souladu', 'sextil'], trine: ['v souladu', 'trigon'], square: ['v napětí', 'kvadratura'], opposition: ['v protikladu', 'opozice'] };
    const aspStrength = (o) => o <= 1 ? 'velmi silný' : o <= 3 ? 'silný' : o <= 5 ? 'střední' : 'slabý';
    const aspText = (x) => {
      const kind = x.key === 'conj' ? 'c' : x.kind === 'harm' ? 'h' : 't';
      const pair = ASP_PAIR[`${x.a}|${x.b}`] || ASP_PAIR[`${x.b}|${x.a}`];
      if (pair && pair[kind]) return pair[kind];
      const tA = BODY_THEME[x.a] || TX.DOMAIN[x.a] || PT_SHORT[x.a], tB = BODY_THEME[x.b] || TX.DOMAIN[x.b] || PT_SHORT[x.b];
      if (kind === 'c') return `Kde je jedno, je i druhé: ${tA} a ${tB} u tebe splývají v jednu, silnou kvalitu, kterou z tebe lidé čtou hned.`;
      if (kind === 'h') return `${tA.charAt(0).toUpperCase() + tA.slice(1)} a ${tB} si u tebe rozumí samy od sebe. Jde to lehce — a právě proto se to dá přehlédnout; vědomě užívané je z toho talent.`;
      return `${tA.charAt(0).toUpperCase() + tA.slice(1)} a ${tB} se u tebe přetahují. Tření je zdroj: nutí tě hledat vlastní řešení, a zralá podoba je síla, kterou jiní nemají.`;
    };
    const aspCards = asps.slice(0, 12).map(x => `<details class="ptcard asp ${x.kind === 'harm' ? 'harm' : x.kind === 'tense' ? 'tense' : ''}"><summary><span class="g">${x.glyph}</span><b>${PT_SHORT[x.a] || K.BODY_CZ[x.a]} a ${PT_SHORT[x.b] || K.BODY_CZ[x.b]}</b><span class="sg">${(ASP_KIND_CZ[x.key] || ['', x.cz])[0]} · ${aspStrength(x.orb)}</span></summary>
      <div class="ptbody"><p class="what">${(ASP_KIND_CZ[x.key] || ['', x.cz])[1]} · orbis ${fmtOrb(x.orb)}${x.orb <= 1 ? ' · podpis tvé mapy' : ''}</p><p>${esc(aspText(x))}</p></div></details>`).join('');
    const aspHtml = asps.map(a => `<li><span class="g ${a.kind === 'harm' ? 'tone-harm' : a.kind === 'tense' ? 'tone-tense' : ''}">${a.glyph}</span><span class="t">${K.BODY_CZ[a.a]} ${a.cz} ${K.BODY_CZ[a.b]}</span><span class="w">${fmtOrb(a.orb)}</span></li>`).join('');
    const mine = n.stars.filter(s => s.mine).sort((a, b) => b.strength - a.strength);
    const second = n.stars.filter(s => !s.mine && s.strength > 0).sort((a, b) => b.strength - a.strength);
    const rest = n.stars.filter(s => !s.mine && s.strength === 0);
    const starBlock = (s, main) => `<div class="star ${main ? 'main' : ''}"><div class="nm">${esc(s.name)}<em>${K.fmtLon(s.lon)} · ${s.house}. dům · dnes ${K.fmtLon(s.lonNow)}</em></div><div class="why">
      ${s.conj.map(c => `<span>stojí na ${NATAL_LOC[c.point]} (${fmtOrb(c.orb)})</span>`).join('')}
      ${s.angles.map(a => `<span>v okamžiku narození ${STAR_ANGLE_PAST[a.angle]}${s.neverRises ? ' – pod obzorem, z našich šířek nikdy nevychází' : ''} (${fmtOrb(a.orb)})</span>`).join('')}
      ${s.parans.map(pr => `<span>paran: když hvězda ${STAR_ANGLE_PAST[pr.starAngle].replace('procházela dolní kulminací', 'byla v dolní kulminaci')}, ${K.BODY_CZ[pr.planet]} ${planetVerb(pr.planetAngle, pr.planet)} (${K.fmtTime(pr.time, TZ)}, ${fmtOrb(pr.orb)})</span>`).join('')}
      ${s.neverRises && !s.angles.length ? '<span>z našich šířek nikdy nevychází nad obzor</span>' : ''}${s.circumpolar ? '<span>cirkumpolární – nad obzorem po celý rok</span>' : ''}
    </div>${STAR_DEEP[s.id] ? `<div class="stardeep"><p class="rod">${esc(STAR_DEEP[s.id].rod)}</p><p><b>Dar</b> ${esc(STAR_DEEP[s.id].dar)}</p><p><b>Stín</b> ${esc(STAR_DEEP[s.id].stin)}</p><p><b>Úkol</b> ${esc(STAR_DEEP[s.id].ukol)}</p></div>` : (HS.STAR_TXT[s.id] ? `<div class="stardeep"><p>${esc(HS.STAR_TXT[s.id])}</p></div>` : '')}</div>`;
    const SEC = {
      prochazis: `      
      <p class="note" style="margin-top:-4px">Tranzity na tvou mapu jako oblouky: kdy začaly, kdy jsou přesné a kdy doznějí. Pomalé planety nahoře nesou období, rychlé dole barví týden.</p>
      ${arcsHTML(np.y, np.m, np.d, { empty: '<p class="note">Právě teď se tvé mapy nedotýká žádný tranzit v orbisu — klidné pozadí.</p>' })}
      <details class="lookback"><summary>Ohlédnutí — co bylo ve hře jindy</summary>
        <div class="row" style="align-items:center;gap:10px;margin:6px 0 10px"><input type="date" id="lookbackDate" class="btn" value="${S.lookback || K.isoDate(np.y, np.m, np.d)}" style="flex:1;min-width:0;max-width:260px"><button type="button" class="btn ghost small" data-act="lookback">Ukázat</button></div>
        ${S.lookback ? (() => { const [ly, lm, ld] = S.lookback.split('-').map(Number); return `<p class="small" style="margin:0 0 6px">${ld}. ${lm}. ${ly}</p>${arcsHTML(ly, lm, ld, { empty: '<p class="note">Ten den se tvé mapy nedotýkal žádný tranzit v orbisu.</p>' })}`; })() : '<p class="note">Vyber datum — třeba den, kdy ses stěhoval, začal něco nového nebo se ti něco stalo — a uvidíš, čím jsi tehdy procházel.</p>'}
      </details>`,
      mapa: `      
      ${natalSumHTML(false)}
      <p class="note" style="margin:0 2px 10px">Ťukni na kartu — dozvíš se, co ten bod znamená a jak vychází tobě.</p>
      <div class="h3">Body nativu</div>
      <p class="note" style="margin-top:-4px">Každý bod otevři — u každého je, co znamená, jak ho máš ve znamení a kde v životě pracuje.</p>
      ${ptsCards}
      <details class="expl"><summary>Tabulka poloh</summary><table class="pts">${pts}</table></details>
      <details class="expl"><summary>Co ty body znamenají?</summary><div class="card small">
        <p><b>☉ Slunce</b> — jádro osobnosti, vůle a životní směr · <b>☽ Luna</b> — pocity, potřeby a vnitřní svět · <b>☿ Merkur</b> — myšlení, řeč a domluva · <b>♀ Venuše</b> — láska, vztahy a hodnoty · <b>♂ Mars</b> — energie, odvaha a prosazení · <b>♃ Jupiter</b> — růst, štěstí a příležitosti · <b>♄ Saturn</b> — řád, hranice a životní lekce · <b>♅ Uran</b> — svoboda, změny a originalita · <b>♆ Neptun</b> — intuice, sny a citlivost · <b>♇ Pluto</b> — hloubka a proměna · <b>☊ Uzel</b> — směr, kterým duše roste · <b>Asc</b> — jak působíš navenek · <b>MC</b> — povolání a veřejná role.</p>
        <p class="note">Znamení říká, v jakém ladění bod pracuje. Stupeň je přesná poloha ve znamení. Dům říká, ve které oblasti života se projevuje nejvíc.</p>
      </div></details>
      <div class="h3">Hroty domů</div><div class="card small">${houses}</div>
      <details class="expl"><summary>Co jsou domy?</summary><div class="card small">
        <p>Nebe se dělí na 12 domů — 12 oblastí života. <b>1</b> já a tělo · <b>2</b> peníze a jistoty · <b>3</b> komunikace a blízké okolí · <b>4</b> domov a rodina · <b>5</b> tvořivost, radost a děti · <b>6</b> každodenní práce a zdraví · <b>7</b> partnerství · <b>8</b> sdílené zdroje a hluboké proměny · <b>9</b> cesty, víra a vzdělání · <b>10</b> povolání a směřování · <b>11</b> přátelé a vize · <b>12</b> nitro, klid a ústraní.</p>
        <p class="note">Hrot je stupeň, kde dům začíná. Který dům čím žiješ, poznáš podle toho, kde stojí tvé planety — viz sloupec „dům" v tabulce výše.</p>
      </div></details>
      <div class="h3">Aspekty v nativu</div>
      <p class="note" style="margin-top:-4px">Aspekt je rozhovor dvou bodů tvé mapy. Čím menší číslo (orbis), tím silněji ho žiješ; nejtěsnější jsou podpis tvé mapy.</p>
      ${aspCards}
      <details class="expl"><summary>Seznam aspektů</summary><ul class="list">${aspHtml}</ul></details>
      <details class="expl"><summary>Co znamenají aspekty?</summary><div class="card small">
        <p>Aspekt je úhel mezi dvěma body — rozhovor, který spolu vedou. <b>☌ konjunkce (0°)</b> — síly se spojují v jedno silné téma · <b>✶ sextil (60°)</b> — příležitost, které stačí vyjít vstříc · <b>△ trigon (120°)</b> — přirozený dar, plyne to samo · <b>□ kvadratura (90°)</b> — tření, které nutí růst · <b>☍ opozice (180°)</b> — dva protipóly hledající rovnováhu.</p>
        <p class="note">Číslo vpravo je orbis — o kolik stupňů se aspekt liší od přesného úhlu. Čím menší číslo, tím silněji téma působí. Seznam je řazený od nejpřesnějších.</p>
      </div></details>`,
      horoskop: `      ${wheelSVG(n)}
      <div class="hshead"><svg class="hsstar" viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.1"><circle cx="20" cy="20" r="7"/><path d="M20 3v8M20 29v8M3 20h8M29 20h8"/><path d="M20 13l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="currentColor" stroke="none"/></svg><div class="hstitle">Tvůj horoskop</div><div class="hsrule"><i></i><b>✦</b><i></i></div></div>
      <details class="hsintro hscenter"><summary><span class="hsq">✧</span> Jak číst svůj horoskop <span class="hsq">✧</span></summary><p>Mapa je zápis nebe v okamžiku tvého prvního nádechu — chvíle, kdy tu poprvé byl někdo, komu se dalo něco vložit. Jako tři sudičky u kolébky ti ten okamžik vložil dary i úkoly: <b>co ti bylo dáno do vínku</b>. Mapa je zrcadlo a jazyk — ukazuje, s čím jsi přišel; jak s tím naložíš, je tvůj příběh.</p></details>
      <div class="hsgrid">${HS_ORDER.map((k, i) => [HS_THEMES.find(x => x[0] === k), HS_SPAN[i]]).filter(x => x[0]).map(([t, sp]) => `<button type="button" class="hsb ${(S.hsTheme || 'rok') === t[0] ? 'on' : ''}" style="--sp:${sp}" data-act="hsTheme" data-t="${t[0]}"><i class="hsi">${hsIcon(t[0])}</i><span>${t[1]}</span></button>`).join('')}
      <button type="button" class="hsb hsprint" style="--sp:6" data-act="hsPrint" title="Celý horoskop k tisku nebo uložení"><i class="hsi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10"/><path d="M8.4 10.6L12 14.2l3.6-3.6"/><path d="M5 17.6h14"/></svg></i><span>Uložit · tisk</span></button></div>
      <div class="card hs">${(HS_THEMES.find(t => t[0] === (S.hsTheme || 'rok')) || HS_THEMES[0])[2](n)}</div>`,
      hvezdy: `      
      <p class="note">Hvězdy systémů z Hvězdného kvízu a královské hvězdy jako body v tvém nativu. Hlavní = hvězda stojí na tvém bodě (orbis 1°), byla na úhlu v okamžiku narození, nebo tvoří paran se Sluncem či Lunou. Vedlejší = parany s ostatními planetami v den narození. Rod z kvízu se do výpočtu nepočítá – tohle je čisté nebe.</p>
      ${mine.length ? mine.map(s => starBlock(s, true)).join('') : '<p class="muted">Žádná hlavní hvězda – neobvyklé, ověř čas narození.</p>'}
      ${second.length ? `<div class="h3">Vedlejší hvězdy</div>${second.map(s => starBlock(s, false)).join('')}` : ''}
      <details><summary>Ostatní hvězdy v nativu (bez kontaktu)</summary>${rest.map(s => `<div class="star"><div class="nm" style="font-size:var(--fs-l)">${esc(s.name)}<em>${K.fmtLon(s.lon)} · ${s.house}. dům</em></div>${s.neverRises ? '<div class="why">z našich šířek nikdy nevychází</div>' : ''}${s.circumpolar ? '<div class="why">cirkumpolární</div>' : ''}</div>`).join('')}</details>`,
      navraty: `${(() => { const by = +p.y; const yr = np.y; const age = yr - by; const hi = (x) => Math.abs(x - yr) <= 1 ? 'on' : '';
        const rows = [
          ['Saturnův návrat', [by + 29, by + 59, by + 88], 'Saturn oběhne zvěrokruh za 29,5 roku. První návrat kolem 27–30 let je zkouška dospělosti: co jsi převzal od rodiny a světa, se láme, a zůstává, co je opravdu tvoje. Bývá to čas velkých rozhodnutí — práce, vztah, místo. Druhý návrat kolem 58–60 let je zkouška moudrosti: co ze života předat dál. Návrat trvá kolem roku a mívá tři přesné průchody (přímý, zpětný, přímý).'],
          ['Jupiterův návrat', [by + 12, by + 24, by + 36, by + 48, by + 60, by + 72, by + 84], 'Jupiter oběhne zvěrokruh za 11,9 roku. Každý návrat otevírá nový dvanáctiletý cyklus růstu: přichází prostor, důvěra a příležitosti v oblasti, kde máš Jupiter v mapě. Rok návratu bývá rokem rozšíření — cesty, studia, dětí, nového záběru.'],
          ['Uranova opozice', [by + 41], 'Uran oběhne zvěrokruh za 84 let a kolem 40–42 let stojí přesně naproti svému místu v mapě. Je to tradiční polovina života: co se nežilo, se hlásí, a přichází chuť změnit, co ztuhlo. Období dává svobodu a druhý dech; žádá, aby změna přišla vědomě, ne jako útěk.'],
          ['Návrat uzlů', [by + 19, by + 37, by + 56, by + 74], 'Lunární uzly oběhnou zvěrokruh za 18,6 roku. Návrat kolem 19, 37 a 56 let je čas, kdy se ptáš na směr: kam chceš, ne kam tě to nese. V polovině mezi návraty (kolem 28, 46, 65) přichází opozice uzlů — bod obratu, kdy se starý směr vyčerpává.'],
          ['Chironův návrat', [by + 50], 'Chiron, léčitel mezi Saturnem a Uranem, se vrací kolem 50 let. Tradičně čas, kdy se staré zranění ukáže jako dar — to, co bolelo, se stává tím, čím umíš pomoci druhým.'],
        ];
        return `<p class="note" style="margin-top:-2px">Velké cykly života podle oběhu pomalých těles kolem tvé mapy. Roky jsou přibližné na ±1 rok; přesný den najdeš v Úkazech pod <b>tvé cykly</b>. Ten, který je do roka, svítí zlatě. Je ti ${age} let.</p>
        ${rows.map(([t, years, txt]) => `<div class="card small returns"><div class="h3" style="margin-top:0">${t}</div><p class="yrs">${years.filter(x => x >= by && x <= by + 95).map(x => `<span class="${hi(x)}">${x}${x <= yr ? '' : ''}</span>`).join(' · ')}</p><p>${txt}</p></div>`).join('')}`; })()}`,
      cisla: `      ${settings.numerology !== false ? (() => { const n = numerology(p, np.y, np.m, np.d); const L = NUM_LIFE[n.life] || NUM_LIFE[numReduce(n.life)];
        return `<div class="card small numcard"><div class="h3" style="margin-top:0">Tvá čísla</div>
        <p><b>Životní číslo ${n.life}</b> · ${L[0]}<br>${L[1]}</p>
        <p><b>Osobní rok ${n.year}</b> — ${NUM_YEAR[n.year]}.</p>
        <p><b>Osobní měsíc ${n.month}</b> · <b>osobní den ${n.day}</b> — ${NUM_DAY[n.day]}.</p>
        <p class="note" style="margin:6px 0 0">Životní číslo je součet číslic data narození (11, 22 a 33 zůstávají jako mistrovská). Osobní rok vychází z tvého dne a měsíce narození a běžného roku; z něj se odvíjí měsíc a den. Osobní den každého dne najdeš v jeho detailu.</p></div>${numerologyDeepHTML(p)}`; })() : ''}`,
      cakra: `${chakraHTML(p)}`,
      efemeridy: `<p class="note" style="margin-top:-2px">Měsíční tabulka poloh v poledne, ingresy, Luna bez kurzu a export do CSV — pro toho, kdo chce vidět čísla.</p><div id="ephHost"></div>
      <p class="note" style="margin-top:16px">Rezonanční dny v kalendáři (✦) vznikají, když Slunce, Venuše, Merkur či Mars stojí na tvé hvězdě (orbis ${fmtNum(settings.rules.starOrb, 1)}°), když přes ni přechází Luna, nebo když na ní nastane novoluní či úplněk (orbis 2°).</p>`,
    };
    const natalHead = `      <div class="nhead"><div class="h2">${esc(p.name)}</div>
      <p class="note natal-meta">${p.d}. ${p.m}. ${p.y} v ${p.hh}:${pad(p.mm)} · ${esc(p.place)} (${fmtNum(+p.lat, 3)} N, ${fmtNum(+p.lon, 3)} E) · ${n.date.toISOString().slice(0, 16).replace('T', ' ')} UTC · domy Placidus · tropický zvěrokruh</p></div>`;
    const view = S.natalView && S.natalView !== 'ty' ? S.natalView : 'menu';
    const TILES = [
      ['mapa', '☉', 'Tvoje mapa', 'Slunce, Luna, ascendent, body, domy, aspekty', 'main'],
      ['prochazis', '✺', 'Čím teď procházíš', 'tranzity jako oblouky, ohlédnutí', 'main'],
      ['vztahy', '♡', 'Vztahy', 'jak si tvá mapa rozumí s druhými'],
      ['horoskop', '✦', 'Tvůj horoskop', 'kapitoly o tobě, tisk'],
      ['cisla', '8', 'Tvá čísla', 'životní číslo, osobní rok, hlubší rozbor'],
      ['cakra', '◉', 'Čakra roku', 'kterou čakrou letos procházíš'],
      ['navraty', '⟳', 'Velké návraty', 'Saturn, Jupiter, Uran a uzly v tvém životě'],
      ['hvezdy', '★', 'Tvé hvězdy', 'stálice na tvých bodech'],
    ].filter(t => t[0] !== 'cisla' || settings.numerology !== false);
    if (view === 'menu') {
      const arcS = arcSentence();
      v.innerHTML = natalHead + (arcS ? `<p class="nnow"><span class="tvlab">u tebe teď</span>${esc(arcS)}</p>` : '') + `<div class="ntiles">${TILES.map(([id, ic, t, sub, kind]) => `<button type="button" class="ntile img ${kind || ''}" data-act="natalView" data-v="${id}" aria-label="${t} — ${sub}"><img src="tile-${id}.webp?v=3" alt="" width="420" height="${kind ? 317 : 249}"></button>`).join('')}</div>`+ `<p class="note astrolink"><button type="button" class="linkbtn" data-act="natalView" data-v="efemeridy">Podrobnosti — pro astrologa: Efemeridy ›</button></p>`;
      return;
    }
    const tile = TILES.find(t => t[0] === view) || (view === 'efemeridy' ? ['efemeridy', '≡', 'Efemeridy', ''] : TILES[0]);
    const back = `<div class="row" style="align-items:center;gap:10px;margin:2px 0 8px"><button type="button" class="btn ghost small" data-act="natalView" data-v="menu">‹ O tobě</button><div class="h2" style="margin:0">${tile[2]}</div></div>`;
    if (view === 'vztahy') {
      v.innerHTML = back + `<p class="note" style="margin-top:-2px">Jak si tvá mapa rozumí s mapami lidí kolem tebe — partner, děti, rodiče, přátelé, kolegové. Přidej datum, čas a místo narození druhého a Kompas přečte, kde se vaše mapy potkávají samy a kde to chce práci.</p>${synSectionHTML(n)}`;
      return;
    }
    v.innerHTML = back + (SEC[view] || SEC.prochazis);
    if (view === 'efemeridy') renderEphemeris();
  }
  function wheelSVG(n) {
    const cx = 180, cy = 180, R = 172, Rz = 150, Rh = 118, Rp = 100;
    const asc = n.points.Asc.lon;
    const ang = (lon) => (180 + (lon - asc)) * Math.PI / 180;
    const pt = (lon, r) => [cx + r * Math.cos(ang(lon)), cy - r * Math.sin(ang(lon))];
    let s = `<svg class="wheel" viewBox="0 0 360 360" role="img" aria-label="Nativní horoskop">`;
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="var(--wheel-bg)" stroke="var(--gold2)"/><circle cx="${cx}" cy="${cy}" r="${Rz}" fill="none" stroke="var(--line2)"/><circle cx="${cx}" cy="${cy}" r="${Rh}" fill="none" stroke="var(--line)"/>`;
    for (let i = 0; i < 12; i++) {
      const [x1, y1] = pt(i * 30, Rz), [x2, y2] = pt(i * 30, R); s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--line2)"/>`;
      const [gx, gy] = pt(i * 30 + 15, (R + Rz) / 2); s += `<text x="${gx}" y="${gy + 5}" text-anchor="middle" font-size="14" fill="var(--gold)" font-family="serif">${K.SIGN_GLYPH[i]}</text>`;
    }
    for (let h = 1; h <= 12; h++) {
      const [x1, y1] = pt(n.cusps[h], Rz), [x2, y2] = pt(n.cusps[h], h === 1 || h === 7 || h === 4 || h === 10 ? 20 : Rh);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${h === 1 || h === 10 ? 'var(--gold)' : 'var(--line2)'}" stroke-width="${h === 1 || h === 10 ? 1.5 : 1}"/>`;
      const next = n.cusps[h === 12 ? 1 : h + 1]; const mid = n.cusps[h] + K.norm(next - n.cusps[h]) / 2; const [hx, hy] = pt(mid, Rh - 12);
      s += `<text x="${hx}" y="${hy + 3}" text-anchor="middle" font-size="9" fill="var(--muted)">${h}</text>`;
    }
    const keys = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Node'];
    const placed = keys.map(k => ({ k, lon: n.points[k].lon, disp: n.points[k].lon })).sort((a, b) => a.lon - b.lon);
    for (let iter = 0; iter < 12; iter++) for (let i = 0; i < placed.length; i++) { const a = placed[i], b = placed[(i + 1) % placed.length]; const d = K.norm(b.disp - a.disp); if (d < 8 && d >= 0) { a.disp = K.norm(a.disp - (8 - d) / 2); b.disp = K.norm(b.disp + (8 - d) / 2); } }
    for (const p of placed) {
      const [x, y] = pt(p.disp, Rp + 22), [tx, ty] = pt(p.lon, Rz), [lx, ly] = pt(p.lon, Rz - 8);
      s += `<line x1="${tx}" y1="${ty}" x2="${lx}" y2="${ly}" stroke="var(--gold)" stroke-width="1"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" fill="var(--text)" font-family="serif">${K.BODY_GLYPH[p.k]}</text>`;
      const [dx, dy] = pt(p.disp, Rp + 2); s += `<text x="${dx}" y="${dy + 3}" text-anchor="middle" font-size="8" fill="var(--muted)">${Math.floor(K.degInSign(p.lon))}°</text>`;
    }
    for (const st of n.stars.filter(x => x.mine)) { const [x, y] = pt(st.lon, R + 0), [x2, y2] = pt(st.lon, R - 6); s += `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="var(--gold)" stroke-width="2"><title>${esc(st.name)}</title></line>`; }
    const [ax, ay] = pt(asc, R + 4); s += `<text x="${ax - 14}" y="${ay + 4}" font-size="10" fill="var(--gold)">Asc</text>`;
    const [mx, my] = pt(n.points.MC.lon, R + 4); s += `<text x="${mx}" y="${my - 4}" text-anchor="middle" font-size="10" fill="var(--gold)">MC</text>`;
    s += '</svg>';
    return s;
  }

  // ===================== NASTAVENÍ =====================
  function renderSettings() {
    const v = $('#view-nastaveni');
    if (S.guide) { v.innerHTML = guideHTML(); return; }
    const p = activeProfile();
    const opts = profiles.map(x => `<option value="${x.id}" ${x.id === activeId ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    const kpToday = S.kpMap[TODAY_KEY] || null;
    const kpWord = (k) => k >= 6 ? 'geomagnetická bouře' : k >= 5 ? 'slabá bouře' : k >= 4 ? 'neklidno' : 'klidno';
    const kpSrc = (x) => x.source === 'observed' ? 'naměřeno' : x.source === 'forecast' ? 'předpověď' : '27denní výhled';
    const kpNow = kpToday ? `<div class="kpnow"><b>Dnes Kp ${kpToday.kp}</b> · ${kpWord(kpToday.kp)} <small>(${kpSrc(kpToday)})</small></div>` : '';
    const kpDays = Object.keys(S.kpMap).length;
    const kpTxt = S.kpUpdated ? `${kpNow}<div class="small">výhled na ${kpDays} dní · aktualizováno ${K.fmtDateCz(new Date(S.kpUpdated), TZ)} ${K.fmtTime(new Date(S.kpUpdated), TZ)}</div>` : '<div class="small">zatím staženo nic — stáhne se při připojení</div>';
    v.innerHTML = `
      <div class="h2">Profil</div>
      ${profiles.length > 1 ? `<div class="row"><select class="btn profsel" id="profileSelect" aria-label="Aktivní profil">${opts}</select><button type="button" class="btn ghost" data-act="deleteProfile">Smazat</button></div>` : ''}
      <p class="note" style="margin:-2px 0 8px">Kompas je pro jednoho — tvou mapu. Další lidi přidáš v O tobě → Vztahy, bez omezení.</p>
      <form class="form card" id="profileForm" onsubmit="return false">
        <label class="wide">Jméno<input name="name" value="${esc(p.name)}"></label>
        <label>Datum narození<input name="date" type="date" value="${p.y}-${pad(p.m)}-${pad(p.d)}"></label>
        <label>Čas narození<input name="time" type="time" value="${pad(p.hh)}:${pad(p.mm)}"></label>
        <label class="wide">Místo<input name="place" value="${esc(p.place)}"></label>
        <label>Šířka (N)<input name="lat" type="number" step="0.0001" value="${p.lat}"></label>
        <label>Délka (E)<input name="lon" type="number" step="0.0001" value="${p.lon}"></label>
        <div class="wide row"><button type="button" class="btn primary" data-act="saveProfile">Uložit a přepočítat nativ</button></div>
        <p class="note wide">Čas je v tehdy platném místním čase (letní/zimní se dopočítá podle zóny Europe/Prague). Souřadnice: Kroměříž 49,2979 / 17,3931 · Zlín 49,2265 / 17,6666 · Brno 49,1951 / 16,6068 · Praha 50,0755 / 14,4378.</p>
      </form>
      <div class="h2">Kde právě jsi</div>
      <form class="form card" id="locForm" onsubmit="return false">
        <div class="wide row" style="gap:6px">${PLACES.map((pl, i) => `<button type="button" class="chip ${settings.loc.name === pl.name ? 'on' : ''}" data-act="pickPlace" data-i="${i}">${esc(pl.name)}</button>`).join('')}</div>
        <div class="wide row" style="margin-top:2px"><button type="button" class="btn primary" data-act="locate">Zjistit moji polohu</button></div>
        <label class="wide">Název<input name="lname" value="${esc(settings.loc.name)}"></label>
        <label>Šířka (N)<input name="llat" type="number" step="0.0001" value="${settings.loc.lat}"></label>
        <label>Délka (E)<input name="llon" type="number" step="0.0001" value="${settings.loc.lon}"></label>
        <label>Nadm. výška (m)<input name="lalt" type="number" value="${settings.loc.alt}"></label>
        <div class="wide row"><button type="button" class="btn" data-act="saveLoc">Uložit místo</button></div>
        <p class="note wide">Podle tohoto místa se počítá východ a západ Slunce a Luny, planetární hodiny, lunární den, viditelnost zatmění a úkazů, heliakické východy tvých hvězd a přepínání oblohy podle denní doby. Polohy planet, aspekty a tranzity k nativu na místě nezávisí — ty jsou stejné pro celou Zemi. Místo narození v profilu neměň, to je snímek nebe nad místem, kde jsi se narodil.</p>
        <p class="note wide">Časy se zobrazují v českém čase (Europe/Prague) i pro vzdálená místa.</p>
      </form>
      <div class="h2">Obloha</div>
      <div class="card">
        <div class="row" style="gap:6px" id="themeRow">
          ${['auto', 'day', 'night'].map(t => `<button type="button" class="chip ${settings.theme === t ? 'on' : ''}" data-act="pickTheme" data-t="${t}">${t === 'auto' ? 'podle denní doby' : THEMES[t]}</button>`).join('')}
        </div>
        ${settings.theme === 'auto' ? '' : `<div class="row" style="gap:6px;margin-top:8px">
          ${[['stay', 'nechat napořád'], ['once', 'do nejbližší změny']].map(([h, lbl]) => `<button type="button" class="chip ${(settings.themeHold || 'stay') === h ? 'on' : ''}" data-act="pickHold" data-h="${h}">${lbl}</button>`).join('')}
        </div>`}
        <label class="row" style="gap:8px;margin-top:10px;font-size:var(--fs-m);cursor:pointer"><input type="checkbox" data-act="toggleClouds" ${settings.clouds === false ? '' : 'checked'}> Mraky ve světlých paletách</label>
        <div class="row" style="gap:6px;margin-top:10px">
          <button type="button" class="chip ${settings.bg !== 'plain' ? 'on' : ''}" data-act="pickBg" data-b="photo">s obrazem nebe</button>
          <button type="button" class="chip ${settings.bg === 'plain' ? 'on' : ''}" data-act="pickBg" data-b="plain">jen barvy</button>
        </div>
        <p class="note">Na automatiku se obloha mění podle skutečného východu a západu Slunce v ${esc(settings.loc.name)} — od svítání do soumraku denní, jinak noční. Teď je ${THEMES[applyTheme()]}.${settings.theme === 'auto' ? '' : (settings.themeHold === 'once' ? ' Ruční volba se sama vrátí do automatiky při nejbližším východu nebo západu Slunce.' : ' Ruční volba drží, dokud ji nezměníš.')}</p>
      </div>
      <div class="h2">Pravidla barvení dne</div>
      <form class="form card" id="rulesForm" onsubmit="return false">
        <label>Harmonický od<input name="harm" type="number" step="0.5" value="${settings.rules.harm}"></label>
        <label>Napjatý od<input name="tense" type="number" step="0.5" value="${settings.rules.tense}"></label>
        <label>Luna bez kurzu – hodin v aktivní části dne (8–22), aby srazila skóre<input name="voc" type="number" step="1" value="${settings.rules.vocHours}"></label>
        <label>Orbis pro tvé hvězdy (°)<input name="starOrb" type="number" step="0.5" value="${settings.rules.starOrb}"></label>
        <label class="wide" style="flex-direction:row;align-items:center;gap:10px;text-transform:none;letter-spacing:0;font-size:var(--fs-m);color:var(--text)"><input type="checkbox" data-act="toggleOrg" ${settings.organs === false ? '' : 'checked'}> Orgánové hodiny v dnešku</label>
        <label class="wide" style="flex-direction:row;align-items:center;gap:10px;text-transform:none;letter-spacing:0;font-size:var(--fs-m);color:var(--text)"><input type="checkbox" data-act="toggleNum" ${settings.numerology === false ? '' : 'checked'}> Numerologie (životní číslo, osobní rok a den)</label>
        <div class="wide row"><button type="button" class="btn" data-act="saveRules">Uložit pravidla</button></div>
        <details class="expl"><summary>Co ta čísla znamenají? (polopatě)</summary><div class="card">
          <p><b>Jak appka barví dny.</b> Každý den se podívá, jak putující Luna svítí na tvou osobní mapu. Když ladí, den dostává plusové body; když dře, minusové. Součet je skóre dne — vidíš ho v detailu dne.</p>
          <p><b>Harmonický od / Napjatý od</b> — odkdy se den barví. S hodnotami 2 a −2 se zlatě obarví den, který nasbírá aspoň 2 body, červeně den s −2 a míň. Zbytek zůstane bez barvy. Chceš míň barevných dnů (jen ty opravdu výrazné)? Zvětši čísla na 3 a −3. Chceš jich víc? Zmenši na 1 a −1.</p>
          <p><b>Luna bez kurzu</b> — pár hodin před tím, než Luna přejde do dalšího znamení, „nikam nemíří" — tradičně se nehodí začínat nové věci. Číslo 6 znamená: aby to dnu srazilo skóre, musí tenhle stav zabrat aspoň 6 hodin z bdělého dne (8–22). Krátká chvilka, nebo když to proběhne v noci, ti den nepokazí.</p>
          <p><b>Orbis pro tvé hvězdy</b> — jak přesně musí planeta stát na některé z tvých hvězd, aby den dostal značku ✦. 1° = přísné, takové dny jsou vzácné a silné. 2° = volnější, bude jich víc.</p>
          <p>Nevíš-li, nech to, jak to je — výchozí hodnoty jsou vyladěný střed.</p>
        </div></details>
        <details class="expl"><summary>Přesné váhy (pro zvídavé)</summary><div class="card"><p>Trigon +1, sextil +0,5, kvadratura/opozice −1, konjunkce podle planety (Venuše, Jupiter, Slunce +1 · Mars, Saturn, Pluto −1 · Uran, Neptun −0,5). Násobí se váhou bodu (Slunce, Luna, Asc, MC ×2). Luna přesné aspekty ±0,25, živel Luny +0,5, Merkur retro −0,5, Kp ≤ 3 +0,5, Kp 5 −1, Kp ≥ 6 −2. Jupiter až Pluto tvoří pozadí období, barvu dne neurčují.</p></div></details>
      </form>
      <div class="h2">Kosmické počasí</div>
      <div class="card">
        ${kpTxt}
        ${S.kpError ? `<div class="small tone-tense">${esc(S.kpError)}</div><p class="note">Pokud prohlížeč blokuje přímé stažení (CORS), aplikace zkouší záložní cestu <span class="mono">/api/noaa</span> – na Vercelu je součástí balíčku.</p>` : ''}
        <label class="kptoggle"><input type="checkbox" data-act="toggleKp" ${settings.showKp ? 'checked' : ''}> Započítávat do barvy dne</label>
        <p class="note">Kp je míra neklidu zemského magnetického pole na stupnici 0–9. Slunce se otočí jednou za 27 dní, a tak se aktivní oblasti vracejí v tomto rytmu — proto výhled sahá 27 dní dopředu. Klidné dny (Kp do 3) dnu maličko přidají, bouře (Kp 5 a víc) uberou; s vypnutým zaškrtnutím bouře jen uvidíš v detailu dne. Data poskytuje NOAA SWPC, appka je obnovuje sama každé tři hodiny.</p>
        <div class="row" style="margin-top:8px"><button type="button" class="btn ghost small" data-act="refreshKp">Obnovit teď</button></div>
      </div>
      <div class="h2">Komety a vlastní úkazy</div>
      <form class="card" id="cometsForm" onsubmit="return false"><textarea class="mono" style="width:100%;min-height:90px;font-size:var(--fs-s);background:var(--field);color:var(--text);border:1px solid var(--line2);border-radius:9px;padding:9px" placeholder="2026-10-20 | Kometa C/2025 A6 (Lemmon) | nejjasnější, večer nízko na západě">${esc(settings.comets)}</textarea><div class="row" style="margin-top:8px"><button type="button" class="btn" data-act="saveComets">Uložit seznam</button></div><p class="note">Jeden úkaz na řádek: datum | název | poznámka. Zobrazí se v Úkazech i v detailu dne.</p></form>
      <div class="h2">Významné dny</div>
      <div class="card">
        ${sdAll().length ? `<ul class="sdlist">${sdAll().sort((a, b) => (+a.m) - (+b.m) || (+a.d) - (+b.d)).map(x => `<li><span>${SD_EMO[x.t] || '✦'} <b>${esc(x.name)}</b> · ${x.d}. ${K.MONTH_GEN[x.m - 1]}${x.y ? ' ' + x.y : ''}${x.r === 0 ? ' · jen jednou' : ''}</span><button type="button" class="chip small" data-act="sdDel" data-id="${x.id}">×</button></li>`).join('')}</ul>` : ''}
        <form class="form" onsubmit="return false">
          <label class="wide">Jméno / název<input id="sdName" placeholder="Martina, výročí Oázy…"></label>
          <label>Datum<input id="sdDate" type="date"></label>
          <label>Typ<select id="sdType"><option value="narozeniny">🎂 narozeniny</option><option value="vyroci">💍 výročí</option><option value="jine">✦ jiné</option></select></label>
          <label>Opakování<select id="sdRep"><option value="rok">každý rok</option><option value="once">jen jednou</option></select></label>
          <div class="wide row"><button type="button" class="btn primary" data-act="sdAdd">Přidat den</button></div>
          <p class="note wide">Významné dny se ráno ukážou zlatě v kartě Dnes (u narozenin s věkem, pokud vyplníš rok) a v mřížce mají značku. Opakují se každý rok.</p>
        </form>
      </div>
      <div class="h2">Google kalendář</div>
      <div class="card">
        <form class="form" onsubmit="return false">
          <label class="wide">Tajná iCal adresa<input id="icsUrl" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value="${esc(store.get('kairos_ics', ''))}"></label>
          <div class="wide row"><button type="button" class="btn primary" data-act="icsSave">Uložit a načíst</button>${store.get('kairos_ics', '') ? `<button type="button" class="btn ghost" data-act="icsOff">Odpojit</button>` : ''}</div>
          <p class="note wide">Kde ji najdeš: Google Kalendář na počítači → ⚙︎ Nastavení → vlevo vyber svůj kalendář → <b>Integrovat kalendář</b> → <b>Tajná adresa ve formátu iCal</b> → zkopíruj. Události se pak ukazují v detailu dne${gEv() ? ` · naposledy načteno ${new Date(gEv().when).toLocaleString('cs-CZ')}, ${(gEv().ev || []).length} událostí` : ''}. Adresa je soukromá — appka ji drží jen v tomto zařízení a čte přes vlastní server Oázy.</p>
        </form>
      </div>
      <div class="h2">Záloha a přenos dat</div>
      <div class="card">
        <div class="row"><button type="button" class="btn" data-act="bkExport">Stáhnout kompletní zálohu</button><label class="btn ghost" style="cursor:pointer">Obnovit ze zálohy<input type="file" id="bkFile" accept="application/json,.json" hidden></label></div>
        <p class="note">Záloha obsahuje všechno: profily, diář, plány, nastavení, osoby pro srovnání i fotky a hlasové poznámky. Při výměně telefonu: tady stáhni soubor, pošli si ho do nového zařízení (mail, Disk…) a tam ho načti přes „Obnovit ze zálohy“. Obnova přepíše stávající data v appce.</p>
      </div>
      <div class="h2">Cyklus</div>
      <div class="card">
        <div class="row" style="margin-bottom:8px"><button type="button" class="chip ${cycOn() ? 'on' : ''}" data-act="cycToggle">${cycOn() ? '✓ zapnuto' : 'zapnout sledování cyklu'}</button></div>
        <p class="note" style="margin:0">Ženský cyklus jako vlastní rytmus vedle oblohy. V Diáři ťukneš u dne „tímto dnem začala menstruace“ a Kompas z tvých zápisů spočítá den cyklu a fázi — reflektivní, dynamickou, expresivní, kreativní. Vše zůstává jen v tomto zařízení. Slouží k orientaci v rytmu, ne k plánování ani k vyloučení otěhotnění.</p>
      </div>
      <div class="h2">Podněty</div>
      <div class="card">
        <p class="note" style="margin-top:0">Co ti v Kompasu chybí, co se ti líbí, na co jsi narazil — každá zpráva pomáhá. Napiš pár vět a odešli; otevře se tvůj e-mail s připravenou zprávou.</p>
        <div class="row" style="gap:6px;margin-bottom:8px">
          ${['nápad', 'chyba', 'jiné'].map(k => `<button type="button" class="chip ${(S.fbKind || 'nápad') === k ? 'on' : ''}" data-act="fbKind" data-k="${k}">${k}</button>`).join('')}
        </div>
        <label class="wide" style="display:block"><textarea id="fbText" rows="4" placeholder="Sem napiš, co máš na srdci…" style="width:100%"></textarea></label>
        <div class="row" style="margin-top:8px"><button type="button" class="btn primary" data-act="fbSend">Odeslat</button><button type="button" class="btn ghost" data-act="fbCopy">Zkopírovat text</button></div>
      </div>
      <div class="h2">Aplikace</div>
      <div class="card">
      <div class="row" style="gap:14px;flex-wrap:wrap;margin-bottom:12px">
        <label class="setsel">Jazyk rozhraní<select class="btn" data-act="setLang"><option value="cs" ${(settings.lang || 'cs') === 'cs' ? 'selected' : ''}>čeština</option><option value="sk" ${settings.lang === 'sk' ? 'selected' : ''}>slovenčina</option></select></label>
        <label class="setsel">Svátky a jmeniny<select class="btn" data-act="setCountry"><option value="both" ${(settings.country || 'both') === 'both' ? 'selected' : ''}>Česko i Slovensko</option><option value="cz" ${settings.country === 'cz' ? 'selected' : ''}>Česko</option><option value="sk" ${settings.country === 'sk' ? 'selected' : ''}>Slovensko</option></select></label>
      </div>
      <div class="row"><button type="button" class="btn" data-act="guide">Průvodce Kompasem</button><button type="button" class="btn" data-act="install">Přidat na plochu</button><button type="button" class="btn" data-act="shareApp">Sdílet Kompas</button><button type="button" class="btn ghost" data-act="clearCache">Vymazat mezipaměť</button></div>
      <p class="note" style="margin-top:8px">Sdílení pošle odkaz na Kompas — druhý si ho otevře v prohlížeči a může si ho přidat na plochu stejně jako ty. Tvá data zůstávají jen u tebe; každý začíná se svým nativem.</p>
      <p class="note" data-act="verTap" style="cursor:default">Nebeský kompas ${VERSION}${store.get('kairos_plus', false) ? ' · plná verze' : ''} · výpočty astronomy-engine 2.1 (geocentrické, tropické, domy Placidus) · stálice z J2000 s precesí · časová zóna Europe/Prague · vše běží v prohlížeči, data zůstávají v tomto zařízení.</p>
      <p class="note">Jazyk aplikace je záměrně „tohle je ve hře, tohoto si všímej“. Žádná barva dne není předpověď a nerozhoduje za tebe.</p></div>`;
    const sel = $('#profileSelect', v); if (sel) sel.addEventListener('change', () => actions.switchProfile(sel));
  }
  function saveProfileForm() {
    const f = $('#profileForm');
    const date = $('[name=date]', f).value, time = $('[name=time]', f).value;
    if (!date || !time) { toast('Vyplň datum i čas.'); return; }
    const [y, m, d] = date.split('-').map(Number), [hh, mm] = time.split(':').map(Number);
    const p = activeProfile();
    Object.assign(p, { name: $('[name=name]', f).value.trim() || 'profil', y, m, d, hh, mm, place: $('[name=place]', f).value.trim(), lat: +$('[name=lat]', f).value, lon: +$('[name=lon]', f).value, tz: TZ });
    persistProfiles(); computeNatal(); renderSettings(); toast('Nativ přepočítán.');
  }

  // ===================== obloha podle denní doby =====================
  // Zatím jen den a noc. Palety pro rozednívání a stmívání zůstávají v CSS —
  // až je budeme chtít, stačí je vrátit sem a do themeForNow.
  const THEMES = { day: 'den', night: 'noc' };
  const THEME_META = { day: '#0A4FA8', night: '#040A18' };
  function themeForNow(dt) {
    dt = dt || new Date();
    try {
      const p = K.tzParts(dt, TZ);
      const ph = K.planetaryHours(p.y, p.m, p.d, observer(), TZ);
      if (!ph) return 'night';
      const t = dt.getTime(), sr = ph.sunrise.getTime(), ss = ph.sunset.getTime();
      // dnešní východ a západ si zapamatovat pro úvodní skript, ať appka naskočí rovnou ve správném režimu
      try { const k = K.isoDate(p.y, p.m, p.d); if (themeForNow._k !== k) { themeForNow._k = k; localStorage.setItem('kairos_sun', JSON.stringify({ k, sr, ss })); } } catch (e) { }
      if (t >= sr - 40 * 60000 && t < ss + 40 * 60000) return 'day';
      return 'night';
    } catch (e) { return 'night'; }
  }
  function applyTheme() {
    document.documentElement.dataset.bg = settings.bg === 'plain' ? 'plain' : 'photo';
    // ruční volba nastavená jen „do nejbližší změny" se sama vrátí do automatiky,
    // jakmile se obloha přirozeně přehoupne (východ nebo západ Slunce)
    if (settings.theme !== 'auto' && settings.themeHold === 'once' && settings.themeMark
        && themeForNow() !== settings.themeMark) {
      settings.theme = 'auto'; settings.themeMark = null; persistSettings();
    }
    const want = settings.theme === 'auto' ? themeForNow() : settings.theme;
    if (document.documentElement.dataset.theme !== want) {
      document.documentElement.dataset.theme = want;
      const mt = document.querySelector('meta[name=theme-color]');
      if (mt) mt.setAttribute('content', THEME_META[want] || '#111832');
    }
    return want;
  }

  // mraky pro světlé oblohy – široké pásy oparu, ne kaňky
  function drawClouds() {
    const svg = document.getElementById('clouds');
    if (!svg) return;
    if (settings.clouds === false) { svg.innerHTML = ''; return; }
    const W = 1000, H = 1600;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    let seed = 19800903, rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let g = '<defs><filter id="cb" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="26"/></filter></defs><g filter="url(#cb)">';
    // pásy: nahoře řídké, u obzoru hustší – jako vrstevnatá oblačnost
    const bands = [0.10, 0.24, 0.40, 0.56, 0.70, 0.80, 0.88, 0.94];
    bands.forEach((by, i) => {
      const near = i / (bands.length - 1);
      const count = 2 + Math.round(near * 3);
      for (let j = 0; j < count; j++) {
        const cx = (0.08 + rnd() * 0.84) * W;
        const cy = (by + (rnd() - 0.5) * 0.035) * H;
        const rx = (110 + rnd() * 230) * (0.6 + near * 0.9);
        const ry = (12 + rnd() * 20) * (0.7 + near * 0.6);
        const o = (0.07 + near * 0.13 + rnd() * 0.05).toFixed(3);
        g += `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${rx.toFixed(0)}" ry="${ry.toFixed(0)}" fill="#fff" opacity="${o}"/>`;
      }
    });
    svg.innerHTML = g + '</g>';
  }

  // hvězdné pozadí – deterministické, jemné
  function drawStars() {
    const svg = document.getElementById('stars');
    if (!svg) return;
    const W = 1000, H = 1600;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    let seed = 20260903, rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let g = '';
    for (let i = 0; i < 260; i++) {
      const x = (rnd() * W).toFixed(1), yy = (rnd() * H).toFixed(1), r = (rnd() * rnd() * 1.7 + 0.35).toFixed(2), o = (0.18 + rnd() * 0.55).toFixed(2);
      const gold = rnd() > 0.88;
      g += `<circle cx="${x}" cy="${yy}" r="${r}" fill="${gold ? 'var(--gold)' : 'var(--text)'}" opacity="${o}"/>`;
    }
    // pár jasnějších s jemnou září
    for (let i = 0; i < 7; i++) {
      const x = (rnd() * W).toFixed(1), yy = (rnd() * H * 0.7).toFixed(1);
      g += `<circle cx="${x}" cy="${yy}" r="${(2 + rnd()).toFixed(1)}" fill="var(--gold)" opacity=".55"/><circle cx="${x}" cy="${yy}" r="9" fill="var(--gold)" opacity=".07"/>`;
    }
    svg.innerHTML = g;
  }

  // ===================== start =====================
  applyTheme();
  // obloha se přehoupne sama, i když appka zůstane otevřená přes východ nebo západ Slunce
  setInterval(() => { try { applyTheme(); } catch (e) { } }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { try { applyTheme(); } catch (e) { } } });
  computeNatal();
  setInterval(applyTheme, 240000);
  showTab(['kalendar', 'ukazy', 'diar', 'nativ', 'nastaveni'].includes(store.get('kairos_tab', 'kalendar')) ? store.get('kairos_tab', 'kalendar') : 'kalendar');
  setTimeout(reconcileMedia, 1200);
  setTimeout(() => { const w = wxGet(); if (!w || Date.now() - w.when > 30 * 60 * 1000) wxRefresh(); }, 800);
  setInterval(() => { const el = $('#tatvaLine'); if (el) { const h = tattvaHTML(); if (h) el.innerHTML = h; } const eo = $('#orgLine'); if (eo) { const g = orgHTML(); if (g) eo.innerHTML = g; } }, 30000);
  setTimeout(() => { const c = gEv(); if (store.get('kairos_ics', '') && (!c || Date.now() - c.when > 6 * 3600 * 1000)) icsRefresh(true); }, 2500);
  loadKp(false);
  (() => { const sp = $('#splash'); if (!sp) return; const off = () => { sp.classList.add('done'); setTimeout(() => sp.remove(), 650); };
    requestAnimationFrame(() => setTimeout(off, 1200)); setTimeout(off, 4000); })();
  document.addEventListener('change', (e) => {
    { const s = e.target && e.target.closest && e.target.closest('select[data-act]'); if (s && actions[s.dataset.act]) { actions[s.dataset.act](s, e); return; } }
    if (e.target && e.target.id === 'bkFile' && e.target.files && e.target.files[0]) {
      const file = e.target.files[0]; e.target.value = '';
      const fr = new FileReader();
      fr.onload = async () => {
        try {
          const data = JSON.parse(fr.result);
          if (!data || data.app !== 'kairos' || !data.ls) { toast('Tohle není záloha Nebeského kompasu.'); return; }
          if (!confirm(`Obnovit zálohu z ${data.when ? data.when.slice(0, 10) : '?'}? Přepíše stávající data v appce.`)) return;
          for (const [k, v] of Object.entries(data.ls)) localStorage.setItem(k, v);
          const db = await MDB.open();
          if (db && data.media && data.media.length) {
            for (const m of data.media) {
              try { const blob = await (await fetch(m.d)).blob(); await MDB.put(m.id, blob); } catch (err) { }
            }
          }
          toast('Záloha obnovena — appka se znovu načte.');
          setTimeout(() => location.reload(), 900);
        } catch (err) { toast('Soubor se nepodařilo přečíst.'); }
      };
      fr.readAsText(file);
      return;
    }
    if (e.target && e.target.classList && e.target.classList.contains('jphoto') && e.target.files && e.target.files[0]) {
      const key = e.target.dataset.k, file = e.target.files[0];
      const img = new Image();
      img.onload = async () => {
        const MAX = 1400;
        const sc = Math.min(1, MAX / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(async (blob) => {
          URL.revokeObjectURL(img.src);
          if (!blob) { toast('Fotku se nepodařilo zpracovat.'); return; }
          const id = 'i' + Date.now().toString(36);
          if (await MDB.put(id, blob)) {
            const en = jGet(key) || {};
            jSet(key, { media: [...(en.media || []), { id, t: 'i' }] });
            toast('Fotka uložena ke dni.');
          } else toast('Uložení se nepovedlo — úložiště nemusí být dostupné.');
          if (S.tab === 'diar') renderJournal(); else renderCalendar();
        }, 'image/jpeg', 0.82);
      };
      img.onerror = () => toast('Tenhle soubor nejde načíst.');
      img.src = URL.createObjectURL(file);
      e.target.value = '';
      return;
    }
    if (e.target && e.target.id === 'elekCustom') {
      let n = Math.round(+e.target.value || 0);
      if (!n) return;
      n = Math.max(7, Math.min(400, n));
      S.elek.span = n; electRun(); renderCalendar();
      return;
    }
    if (e.target && e.target.id === 'jFile' && e.target.files && e.target.files[0]) {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const data = JSON.parse(fr.result);
          const ent = data.entries || data;
          let added = 0;
          for (const k of Object.keys(ent)) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) { const cur = journal[k]; if (!cur || !cur.note) { journal[k] = ent[k]; added++; } }
          store.set('kairos_journal', journal);
          if (data.plan) { for (const k of Object.keys(data.plan)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && !plan[k]) plan[k] = data.plan[k]; pSave(); }
          let pl = 0;
          if (data.plan) for (const k of Object.keys(data.plan)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && !plan[k]) { plan[k] = data.plan[k]; pl++; }
          pSave();
          toast('Načteno ' + added + ' zápisů' + (pl ? ' a ' + pl + ' dnů plánu' : '') + '.');
          renderJournal();
        } catch (err) { toast('Soubor se nepodařilo přečíst.'); }
      };
      fr.readAsText(e.target.files[0]);
      e.target.value = '';
    }
  });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; });
  function noNatalHTML(what) {
    return `<div class="card nonatal">
      <div class="h3" style="margin-top:0">Začni datem narození</div>
      <p>Kompas počítá ${what} z tvé osobní mapy — potřebuje datum, čas a místo, kde ses narodil. Zabere to minutu a všechno zůstává jen v tomto zařízení.</p>
      <div class="row"><button type="button" class="btn" data-act="goNatal">Zadat narození</button><button type="button" class="btn ghost" data-act="goGuide">Co Kompas umí</button></div>
    </div>`;
  }
  function renderCalendar() { renderCalendarRaw(); setTimeout(() => jMediaHydrate(), 30); }
  document.addEventListener('wheel', (e) => {
    const st = e.target.closest && e.target.closest('.strip-wrap .ahead');
    if (st && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { st.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { const q = K.tzParts(new Date(), TZ); if (K.isoDate(q.y, q.m, q.d) !== TODAY_KEY) location.reload(); else if (S.tab === 'kalendar') renderCalendar(); } });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    let swReg = null;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => { swReg = reg; reg.update(); }).catch(() => { });
    let hadCtrl = !!navigator.serviceWorker.controller, reloaded = false;
    const bootT = Date.now();
    const goNew = () => { reloaded = true; try { sessionStorage.setItem('kNoSp', '1'); } catch (e) { } location.reload(); };
    const showUp = () => { const b = $('#upbar'); if (b) b.classList.add('on'); };
    $('#upGo').addEventListener('click', goNew);
    $('#upX').addEventListener('click', () => $('#upbar').classList.remove('on'));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadCtrl && !reloaded) {
        if (Date.now() - bootT < 4000) goNew();
        else showUp();
      }
      hadCtrl = true;
    });
    // při návratu do appky se podívat po nové verzi (nejvýš jednou za 10 minut)
    let lastUp = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && swReg && Date.now() - lastUp > 10 * 60 * 1000) { lastUp = Date.now(); swReg.update().catch(() => { }); }
    });
  }
  window.KAIROS = { K, S, settings, profiles };
})();

