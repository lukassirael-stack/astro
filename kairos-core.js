/* ============================================================
   KAIROS – výpočetní jádro (astronomie + astrologická pravidla)
   Čistě funkční modul nad knihovnou astronomy-engine (MIT).
   Stejný soubor běží v Node (testy) i v prohlížeči (inline).
   ============================================================ */
function createKairosEngine(A) {
  'use strict';

  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const norm = (x) => ((x % 360) + 360) % 360;
  const diff = (a, b) => { let d = norm(a - b); return d > 180 ? d - 360 : d; }; // signed a-b in (-180,180]

  // ---------- názvosloví ----------
  const SIGNS = ['Beran', 'Býk', 'Blíženci', 'Rak', 'Lev', 'Panna', 'Váhy', 'Štír', 'Střelec', 'Kozoroh', 'Vodnář', 'Ryby'];
  const SIGN_GLYPH = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
  const SIGN_LOC = ['Beranu', 'Býku', 'Blížencích', 'Raku', 'Lvu', 'Panně', 'Vahách', 'Štíru', 'Střelci', 'Kozorohu', 'Vodnáři', 'Rybách'];
  const SIGN_LOC_V = SIGN_LOC.map((s, i) => ([4, 6, 7, 8, 10].includes(i) ? 've ' : 'v ') + s);
  const SIGN_GEN = ['Berana', 'Býka', 'Blíženců', 'Raka', 'Lva', 'Panny', 'Vah', 'Štíra', 'Střelce', 'Kozoroha', 'Vodnáře', 'Ryb'];
  const ELEMENT = ['oheň', 'země', 'vzduch', 'voda', 'oheň', 'země', 'vzduch', 'voda', 'oheň', 'země', 'vzduch', 'voda'];
  const FRIENDLY = { 'oheň': ['oheň', 'vzduch'], 'vzduch': ['vzduch', 'oheň'], 'země': ['země', 'voda'], 'voda': ['voda', 'země'] };

  const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  const PLANETS_NO_MOON = BODIES.filter(b => b !== 'Moon');
  const BODY_CZ = { Sun: 'Slunce', Moon: 'Luna', Mercury: 'Merkur', Venus: 'Venuše', Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturn', Uranus: 'Uran', Neptune: 'Neptun', Pluto: 'Pluto', Node: 'Uzel', Asc: 'Ascendent', MC: 'MC' };
  const BODY_GLYPH = { Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇', Node: '☊', Asc: 'Asc', MC: 'MC' };
  // 2. pád / 4. pád pro texty typu "trigon tvého Slunce"
  const BODY_GEN = { Sun: 'Slunce', Moon: 'Luny', Mercury: 'Merkuru', Venus: 'Venuše', Mars: 'Marsu', Jupiter: 'Jupiteru', Saturn: 'Saturnu', Uranus: 'Uranu', Neptune: 'Neptunu', Pluto: 'Pluta', Asc: 'Ascendentu', MC: 'MC', Node: 'Uzlu' };

  const ASPECTS = [
    { key: 'conj', angle: 0, glyph: '☌', cz: 'konjunkce', kind: 'neutral' },
    { key: 'sextile', angle: 60, glyph: '⚹', cz: 'sextil', kind: 'harm' },
    { key: 'square', angle: 90, glyph: '□', cz: 'kvadratura', kind: 'tense' },
    { key: 'trine', angle: 120, glyph: '△', cz: 'trigon', kind: 'harm' },
    { key: 'opposition', angle: 180, glyph: '☍', cz: 'opozice', kind: 'tense' },
  ];

  // ---------- stálice: hvězdy systémů z Hvězdného kvízu + královské hvězdy ----------
  // RA/Dec J2000 (stupně), vzdálenost ve světelných letech, av = arcus visionis (°) pro heliakický východ
  const STARS = [
    { id: 'alcyone', name: 'Plejády (Alcyone)', system: 'Plejády', ra: 56.8711, dec: 24.1051, ly: 440, mag: 2.9, av: 11 },
    { id: 'hyades', name: 'Hyády (střed kupy)', system: 'Hyády', ra: 66.75, dec: 15.87, ly: 153, mag: 3.5, av: 12 },
    { id: 'aldebaran', name: 'Aldebaran', system: 'Aldebaran', ra: 68.9802, dec: 16.5093, ly: 65, mag: 0.9, av: 9, royal: true },
    { id: 'rigel', name: 'Rigel', system: 'Orion', ra: 78.6345, dec: -8.2016, ly: 860, mag: 0.1, av: 9 },
    { id: 'bellatrix', name: 'Bellatrix', system: 'Orion', ra: 81.2828, dec: 6.3497, ly: 250, mag: 1.6, av: 10 },
    { id: 'mintaka', name: 'Mintaka', system: 'Orion', ra: 83.0017, dec: -0.2991, ly: 1200, mag: 2.2, av: 11 },
    { id: 'betelgeuse', name: 'Betelgeuse', system: 'Betelgeuse', ra: 88.7929, dec: 7.4071, ly: 550, mag: 0.5, av: 9 },
    { id: 'sirius', name: 'Sirius', system: 'Sirius', ra: 101.2872, dec: -16.7161, ly: 8.6, mag: -1.5, av: 8 },
    { id: 'procyon', name: 'Procyon', system: 'Procyon', ra: 114.8255, dec: 5.2250, ly: 11.5, mag: 0.4, av: 9 },
    { id: 'regulus', name: 'Regulus', system: 'Královská hvězda', ra: 152.0930, dec: 11.9672, ly: 79, mag: 1.4, av: 10, royal: true },
    { id: 'arcturus', name: 'Arcturus', system: 'Arcturus', ra: 213.9153, dec: 19.1824, ly: 37, mag: -0.05, av: 8 },
    { id: 'hadar', name: 'Hadar', system: 'Hadar', ra: 210.9558, dec: -60.3730, ly: 390, mag: 0.6, av: 9 },
    { id: 'alphacen', name: 'Alfa Centauri', system: 'Alfa Centauri', ra: 219.9021, dec: -60.8340, ly: 4.4, mag: -0.3, av: 8 },
    { id: 'antares', name: 'Antares', system: 'Antares', ra: 247.3519, dec: -26.4320, ly: 550, mag: 1.0, av: 9, royal: true },
    { id: 'vega', name: 'Vega', system: 'Lyra', ra: 279.2347, dec: 38.7837, ly: 25, mag: 0.0, av: 8 },
    { id: 'sheliak', name: 'Sheliak', system: 'Sheliak', ra: 282.5200, dec: 33.3627, ly: 960, mag: 3.5, av: 12 },
    { id: 'fomalhaut', name: 'Fomalhaut', system: 'Fomalhaut', ra: 344.4127, dec: -29.6222, ly: 25, mag: 1.2, av: 10, royal: true },
    { id: 'andromeda', name: 'Andromeda (galaxie M31)', system: 'Andromeda', ra: 10.6847, dec: 41.2692, ly: 2500000, mag: 3.4, av: 14 },
    { id: 'schedar', name: 'Schedar (Kassiopea)', system: 'Kassiopea', ra: 10.1268, dec: 56.5373, ly: 228, mag: 2.2, av: 11 },
    { id: 'polaris', name: 'Polárka', system: 'Polárka', ra: 37.9545, dec: 89.2641, ly: 430, mag: 2.0, av: 11 },
    { id: 'tauceti', name: 'Tau Ceti', system: 'Tau Ceti', ra: 26.0170, dec: -15.9375, ly: 11.9, mag: 3.5, av: 12 },
    { id: 'zetaret', name: 'Zeta Reticuli', system: 'Zeta Reticuli', ra: 49.5534, dec: -62.5064, ly: 39, mag: 5.2, av: 14 },
  ];

  const METEOR_SHOWERS = [
    { name: 'Kvadrantidy', month: 1, day: 3, zhr: 120 },
    { name: 'Lyridy', month: 4, day: 22, zhr: 18 },
    { name: 'Eta Aquaridy', month: 5, day: 6, zhr: 50 },
    { name: 'Delta Aquaridy', month: 7, day: 30, zhr: 25 },
    { name: 'Perseidy', month: 8, day: 12, zhr: 100 },
    { name: 'Drakonidy', month: 10, day: 8, zhr: 10 },
    { name: 'Orionidy', month: 10, day: 21, zhr: 20 },
    { name: 'Tauridy', month: 11, day: 5, zhr: 5 },
    { name: 'Leonidy', month: 11, day: 17, zhr: 15 },
    { name: 'Geminidy', month: 12, day: 14, zhr: 150 },
    { name: 'Ursidy', month: 12, day: 22, zhr: 10 },
  ];

  const CHALDEAN = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];
  const DAY_RULER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']; // index = getDay (0 = neděle)
  const WEEKDAY_CZ = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
  const MONTH_CZ = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  const MONTH_GEN = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];

  // ---------- čas a časová zóna ----------
  const TZ = 'Europe/Prague';
  const _fmtCache = {};
  function tzParts(date, tz) {
    tz = tz || TZ;
    let f = _fmtCache[tz];
    if (!f) {
      f = _fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
    }
    const p = {};
    for (const x of f.formatToParts(date)) p[x.type] = x.value;
    const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
    return { y: +p.year, m: +p.month, d: +p.day, hh: p.hour === '24' ? 0 : +p.hour, mm: +p.minute, ss: +p.second, wd };
  }
  function tzOffsetMin(date, tz) {
    const p = tzParts(date, tz);
    const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
    return Math.round((asUTC - date.getTime()) / 60000);
  }
  // místní čas -> Date (UTC instant)
  function localToDate(y, m, d, hh, mm, tz) {
    hh = hh || 0; mm = mm || 0;
    let guess = Date.UTC(y, m - 1, d, hh, mm, 0);
    let off = tzOffsetMin(new Date(guess), tz);
    let utc = guess - off * 60000;
    const off2 = tzOffsetMin(new Date(utc), tz);
    if (off2 !== off) utc = guess - off2 * 60000;
    return new Date(utc);
  }
  const dayStart = (y, m, d, tz) => localToDate(y, m, d, 0, 0, tz);
  const addDays = (date, n) => new Date(date.getTime() + n * 86400000);
  const T = (date) => A.MakeTime(date);
  const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  function dateKey(date, tz) { const p = tzParts(date, tz); return isoDate(p.y, p.m, p.d); }
  function fmtTime(date, tz) { const p = tzParts(date, tz); return `${p.hh}:${String(p.mm).padStart(2, '0')}`; }
  function fmtDateCz(date, tz) { const p = tzParts(date, tz); return `${p.d}. ${p.m}. ${p.y}`; }
  function fmtDateLong(date, tz) { const p = tzParts(date, tz); return `${WEEKDAY_CZ[p.wd]} ${p.d}. ${MONTH_GEN[p.m - 1]} ${p.y}`; }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  // ---------- polohy ----------
  function lonOf(body, time) {
    if (body === 'Sun') return A.SunPosition(time).elon;
    if (body === 'Moon') return A.EclipticGeoMoon(time).lon;
    return A.Ecliptic(A.GeoVector(body, time, true)).elon;
  }
  function meanNode(time) {
    const Tc = (time.tt) / 36525.0; // TT dny od J2000
    let om = 125.0445479 - 1934.1362891 * Tc + 0.0020754 * Tc * Tc + Tc * Tc * Tc / 467441 - Tc * Tc * Tc * Tc / 60616000;
    return norm(om);
  }
  // polohy všech těles v daný okamžik + rychlost (°/den) + retrogradita
  function positions(date) {
    const t = T(date), t1 = T(new Date(date.getTime() + 86400000));
    const out = {};
    for (const b of BODIES) {
      const l0 = lonOf(b, t), l1 = lonOf(b, t1);
      const sp = diff(l1, l0);
      out[b] = { lon: l0, speed: sp, retro: sp < 0 && b !== 'Sun' && b !== 'Moon' };
    }
    out.Node = { lon: meanNode(t), speed: -0.053, retro: true };
    return out;
  }
  const signOf = (lon) => Math.floor(norm(lon) / 30);
  const degInSign = (lon) => norm(lon) - signOf(lon) * 30;
  function fmtLon(lon, withSign = true) {
    const s = signOf(lon), d = degInSign(lon);
    const dd = Math.floor(d), mm = Math.floor((d - dd) * 60);
    return `${dd}°${String(mm).padStart(2, '0')}′` + (withSign ? ` ${SIGN_GLYPH[s]}` : '');
  }
  function fmtLonText(lon) { const s = signOf(lon), d = degInSign(lon); return `${Math.floor(d)}°${String(Math.floor((d - Math.floor(d)) * 60)).padStart(2, '0')}′ ${SIGNS[s]}`; }

  // ---------- stálice ----------
  function starLonLat(star, time) {
    const v = A.VectorFromSphere(new A.Spherical(star.dec, star.ra, 1), time);
    const ect = A.RotateVector(A.Rotation_EQJ_ECT(time), v);
    const s = A.SphereFromVector(ect);
    return { lon: norm(s.lon), lat: s.lat };
  }
  const SLOT = 'Star1';
  function defineStar(star) { A.DefineStar(SLOT, star.ra / 15, star.dec, star.ly); return SLOT; }

  // ---------- Asc, MC, domy (Placidus) ----------
  function ascMC(time, lat, lon) {
    const gst = A.SiderealTime(time); // hodiny
    const ramc = norm((gst + lon / 15) * 15);
    const eps = A.e_tilt(time).tobl;
    const r = ramc * DEG, e = eps * DEG, f = lat * DEG;
    const mc = norm(Math.atan2(Math.sin(r), Math.cos(r) * Math.cos(e)) * RAD);
    const asc = norm(Math.atan2(Math.cos(r), -(Math.sin(r) * Math.cos(e) + Math.tan(f) * Math.sin(e))) * RAD);
    return { ramc, eps, mc, asc, lst: norm(ramc) / 15 };
  }
  function placidus(ramc, lat, eps) {
    const f = lat * DEG, e = eps * DEG;
    const raToLon = (ra) => norm(Math.atan2(Math.sin(ra * DEG), Math.cos(ra * DEG) * Math.cos(e)) * RAD);
    const semiArc = (ra) => { // denní půloblouk bodu ekliptiky s danou RA
      const tanDec = Math.tan(e) * Math.sin(ra * DEG);
      let c = -Math.tan(f) * tanDec;
      c = Math.max(-1, Math.min(1, c));
      return Math.acos(c) * RAD;
    };
    const solve = (start, fn) => { let ra = start; for (let i = 0; i < 40; i++) ra = fn(ra); return ra; };
    const ra11 = solve(ramc + 30, ra => ramc + semiArc(ra) / 3);
    const ra12 = solve(ramc + 60, ra => ramc + 2 * semiArc(ra) / 3);
    const ra2 = solve(ramc + 120, ra => ramc + 60 + 2 * semiArc(ra) / 3);
    const ra3 = solve(ramc + 150, ra => ramc + 120 + semiArc(ra) / 3);
    const c = new Array(13);
    c[10] = raToLon(ramc); c[11] = raToLon(ra11); c[12] = raToLon(ra12);
    c[2] = raToLon(ra2); c[3] = raToLon(ra3);
    c[4] = norm(c[10] + 180); c[5] = norm(c[11] + 180); c[6] = norm(c[12] + 180);
    c[8] = norm(c[2] + 180); c[9] = norm(c[3] + 180);
    return c; // c[1] a c[7] doplní volající (Asc/Desc)
  }
  function houseOf(lon, cusps) {
    for (let h = 1; h <= 12; h++) {
      const a = cusps[h], b = cusps[h === 12 ? 1 : h + 1];
      const span = norm(b - a), x = norm(lon - a);
      if (x < span) return h;
    }
    return 12;
  }

  // ---------- aspekty ----------
  function aspectBetween(lonA, lonB, orbs) {
    const d = Math.abs(diff(lonA, lonB));
    let best = null;
    for (const asp of ASPECTS) {
      const orb = Math.abs(d - asp.angle);
      const maxOrb = orbs[asp.key] != null ? orbs[asp.key] : orbs.default;
      if (orb <= maxOrb && (!best || orb < best.orb)) best = { ...asp, orb, sep: d };
    }
    return best;
  }

  // ---------- nativ ----------
  function natalChart(profile, nowDate) {
    const date = localToDate(profile.y, profile.m, profile.d, profile.hh, profile.mm, profile.tz || TZ);
    const time = T(date);
    const nowTime = T(nowDate || new Date());
    const observer = new A.Observer(profile.lat, profile.lon, profile.alt || 200);
    const pos = positions(date);
    const ang = ascMC(time, profile.lat, profile.lon);
    const cusps = placidus(ang.ramc, profile.lat, ang.eps);
    cusps[1] = ang.asc; cusps[7] = norm(ang.asc + 180);
    const points = {};
    for (const b of BODIES) points[b] = { lon: pos[b].lon, retro: pos[b].retro, speed: pos[b].speed, house: houseOf(pos[b].lon, cusps) };
    points.Node = { lon: pos.Node.lon, retro: true, house: houseOf(pos.Node.lon, cusps) };
    points.Asc = { lon: ang.asc, house: 1 };
    points.MC = { lon: ang.mc, house: 10 };
    // stálice v nativu
    const stars = STARS.map(st => {
      const ll = starLonLat(st, time);
      const conj = [];
      for (const k of ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Asc', 'MC']) {
        const o = Math.abs(diff(ll.lon, points[k].lon));
        if (o <= 1.0) conj.push({ point: k, orb: o });
      }
      return { ...st, lon: ll.lon, lat: ll.lat, lonNow: starLonLat(st, nowTime).lon, house: houseOf(ll.lon, cusps), conj, angles: [], parans: [] };
    });
    // hvězdy na úhlech v okamžiku narození + parany dne narození
    const latR = profile.lat * DEG;
    const hourAngleInfo = (body, t) => {
      const eq = A.Equator(body, t, observer, true, true);
      const ha = norm((A.SiderealTime(t) + profile.lon / 15 - eq.ra) * 15); // 0..360, stupně
      let c = -Math.tan(latR) * Math.tan(eq.dec * DEG);
      const riseHA = (c >= -1 && c <= 1) ? Math.acos(c) * RAD : null; // null = cirkumpolární / nikdy nevychází
      return { ha, riseHA, dec: eq.dec };
    };
    const angleHits = (info, orb) => {
      const hits = [];
      const d0 = Math.abs(diff(info.ha, 0)); if (d0 <= orb) hits.push({ angle: 'kulminuje', orb: d0 });
      const d180 = Math.abs(diff(info.ha, 180)); if (d180 <= orb) hits.push({ angle: 'antikulminuje', orb: d180 });
      if (info.riseHA != null) {
        const dr = Math.abs(diff(info.ha, -info.riseHA)); if (dr <= orb) hits.push({ angle: 'vychází', orb: dr });
        const ds = Math.abs(diff(info.ha, info.riseHA)); if (ds <= orb) hits.push({ angle: 'zapadá', orb: ds });
      }
      return hits;
    };
    const ORB_ANGLE = 1.0, ORB_PARAN = 1.0;
    const dStart = dayStart(profile.y, profile.m, profile.d, profile.tz || TZ);
    const tStart = T(dStart);
    for (const st of stars) {
      const body = defineStar(st);
      const info = hourAngleInfo(body, time);
      st.neverRises = info.riseHA == null && info.dec < 0;
      st.circumpolar = info.riseHA == null && info.dec > 0;
      st.angles = angleHits(info, ORB_ANGLE);
      // parany: 4 úhly hvězdy během dne narození
      const events = [];
      const up = A.SearchHourAngle(body, observer, 0, tStart, +1); if (up && up.time.date < addDays(dStart, 1)) events.push({ angle: 'kulminuje', time: up.time });
      const low = A.SearchHourAngle(body, observer, 12, tStart, +1); if (low && low.time.date < addDays(dStart, 1)) events.push({ angle: 'antikulminuje', time: low.time });
      if (info.riseHA != null) {
        const r = A.SearchAltitude(body, observer, +1, tStart, 1, 0); if (r) events.push({ angle: 'vychází', time: r });
        const s = A.SearchAltitude(body, observer, -1, tStart, 1, 0); if (s) events.push({ angle: 'zapadá', time: s });
      }
      for (const ev of events) {
        for (const pb of BODIES) {
          const pinfo = hourAngleInfo(pb, ev.time);
          for (const h of angleHits(pinfo, ORB_PARAN)) st.parans.push({ starAngle: ev.angle, planet: pb, planetAngle: h.angle, orb: h.orb, time: ev.time.date });
        }
      }
    }
    const LIGHTS = ['Sun', 'Moon'];
    for (const st of stars) {
      st.strength = 0;
      if (st.conj.length) st.strength += 3;
      if (st.angles.length) st.strength += 3;
      for (const p of st.parans) st.strength += LIGHTS.includes(p.planet) ? 2 : 1;
      st.mine = st.conj.length > 0 || st.angles.length > 0 || st.parans.some(p => LIGHTS.includes(p.planet));
    }
    return { profile, date, points, cusps, ang, stars, sunSign: signOf(pos.Sun.lon), moonSign: signOf(pos.Moon.lon) };
  }

  // ---------- kořeny / hledání okamžiků ----------
  function bisect(fn, t0, t1, iters = 30) {
    let a = t0, b = t1, fa = fn(a);
    for (let i = 0; i < iters; i++) {
      const m = (a + b) / 2, fm = fn(m);
      if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
      if (b - a < 1000) break;
    }
    return (a + b) / 2;
  }

  // hodinová mřížka poloh pro interval [t0,t1] (ms) – sdílená pro VoC, aspekty Luny, ingresy
  function hourGrid(t0ms, t1ms, bodies, stepH = 1) {
    const rows = [];
    const step = stepH * 3600000;
    for (let ms = t0ms; ms <= t1ms + 1; ms += step) {
      const t = T(new Date(ms));
      const r = { ms };
      for (const b of bodies) r[b] = lonOf(b, t);
      rows.push(r);
    }
    return rows;
  }

  // přesné aspekty Luny k cílům (konstanty nebo funkce času) v intervalu
  // targets: [{key, lon:number | fn(ms)->lon, aspects?:[keys]}]
  function moonAspectEvents(grid, targets, aspectKeys) {
    const out = [];
    const aspects = ASPECTS.filter(a => !aspectKeys || aspectKeys.includes(a.key));
    for (const tg of targets) {
      const tl = (ms, row) => typeof tg.lon === 'function' ? tg.lon(ms, row) : tg.lon;
      for (const asp of aspects) {
        const angles = asp.angle === 0 || asp.angle === 180 ? [asp.angle] : [asp.angle, -asp.angle];
        for (const ang of angles) {
          const f = (ms, row) => diff(row ? row.Moon : lonOf('Moon', T(new Date(ms))), tl(ms, row) + ang);
          for (let i = 1; i < grid.length; i++) {
            const fa = f(grid[i - 1].ms, grid[i - 1]), fb = f(grid[i].ms, grid[i]);
            if (Math.abs(fa) < 90 && Math.abs(fb) < 90 && (fa < 0) !== (fb < 0) && fa <= 0) {
              // Luna se pohybuje dopředu: crossing z negativního na pozitivní
              const ms = bisect((x) => f(x, null), grid[i - 1].ms, grid[i].ms);
              out.push({ ms, target: tg.key, aspect: asp.key, glyph: asp.glyph, cz: asp.cz, kind: asp.kind });
            }
          }
        }
      }
    }
    out.sort((a, b) => a.ms - b.ms);
    return out;
  }

  // ingresy (změna znamení) těles v mřížce
  function ingressEvents(grid, bodies) {
    const out = [];
    for (const b of bodies) {
      for (let i = 1; i < grid.length; i++) {
        const s0 = signOf(grid[i - 1][b]), s1 = signOf(grid[i][b]);
        if (s0 !== s1) {
          const target = s1 === (s0 + 1) % 12 ? s1 * 30 : s0 * 30; // dopředu nebo (retro) zpět
          const ms = bisect((x) => diff(lonOf(b, T(new Date(x))), target), grid[i - 1].ms, grid[i].ms);
          out.push({ ms, body: b, from: s0, to: s1, retro: s1 !== (s0 + 1) % 12 });
        }
      }
    }
    out.sort((a, b) => a.ms - b.ms);
    return out;
  }

  // měsíční kontext: mřížka, ingresy Luny, aspekty Luny k planetám, VoC
  const _ctxCache = {};
  function monthContext(y, m, tz) {
    const key = `${y}-${m}`;
    if (_ctxCache[key]) return _ctxCache[key];
    const t0 = dayStart(y, m, 1, tz).getTime() - 3 * 86400000;
    const t1 = dayStart(y, m, daysInMonth(y, m), tz).getTime() + 4 * 86400000;
    const grid = hourGrid(t0, t1, BODIES);
    const moonIngress = ingressEvents(grid, ['Moon']);
    const planetTargets = PLANETS_NO_MOON.map(b => ({ key: b, lon: (ms, row) => row ? row[b] : lonOf(b, T(new Date(ms))) }));
    const moonAspects = moonAspectEvents(grid, planetTargets);
    // VoC: od posledního aspektu v každém úseku znamení po ingres
    const voc = [];
    for (const ing of moonIngress) {
      const last = moonAspects.filter(a => a.ms < ing.ms).pop();
      const prevIng = moonIngress.filter(x => x.ms < ing.ms).pop();
      const from = last && (!prevIng || last.ms > prevIng.ms) ? last.ms : (prevIng ? prevIng.ms : null);
      if (from != null) voc.push({ from, to: ing.ms, lastAspect: last && (!prevIng || last.ms > prevIng.ms) ? last : null, toSign: ing.to });
    }
    const ctx = { y, m, grid, moonIngress, moonAspects, voc, t0, t1 };
    _ctxCache[key] = ctx;
    return ctx;
  }

  // ---------- Luna: fáze, lunární den ----------
  function moonQuartersBetween(d0, d1) {
    const out = [];
    let mq = A.SearchMoonQuarter(T(d0));
    while (mq && mq.time.date < d1) {
      out.push({ quarter: mq.quarter, date: mq.time.date });
      mq = A.NextMoonQuarter(mq);
    }
    return out;
  }
  function lastNewMoonBefore(date) {
    let t = A.SearchMoonPhase(0, T(addDays(date, -31)), 33);
    let found = t;
    while (t && t.date <= date) { found = t; t = A.SearchMoonPhase(0, T(addDays(t.date, 1)), 33); }
    return found ? found.date : null;
  }
  function lunarDay(date, observer) {
    const nm = lastNewMoonBefore(date);
    if (!nm) return null;
    let count = 1, t = T(nm), rises = [];
    for (let i = 0; i < 32; i++) {
      const r = A.SearchRiseSet('Moon', observer, +1, t, 2);
      if (!r || r.date > date) break;
      count++; rises.push(r.date); t = T(new Date(r.date.getTime() + 60000));
    }
    return { day: count, since: rises.length ? rises[rises.length - 1] : nm, newMoon: nm };
  }

  // ---------- planetární hodiny ----------
  function planetaryHours(y, m, d, observer, tz) {
    const ds = dayStart(y, m, d, tz);
    const sr = A.SearchRiseSet('Sun', observer, +1, T(ds), 1);
    const ss = A.SearchRiseSet('Sun', observer, -1, T(ds), 1);
    if (!sr || !ss) return null;
    const nextSr = A.SearchRiseSet('Sun', observer, +1, T(new Date(sr.date.getTime() + 60000)), 2);
    const sunrise = sr.date, sunset = ss.date, nextSunrise = nextSr.date;
    const wd = tzParts(sunrise, tz).wd;
    const ruler = DAY_RULER[wd];
    let idx = CHALDEAN.indexOf(ruler);
    const hours = [];
    const dayLen = (sunset - sunrise) / 12, nightLen = (nextSunrise - sunset) / 12;
    for (let i = 0; i < 24; i++) {
      const start = i < 12 ? new Date(sunrise.getTime() + i * dayLen) : new Date(sunset.getTime() + (i - 12) * nightLen);
      const end = i < 12 ? new Date(sunrise.getTime() + (i + 1) * dayLen) : new Date(sunset.getTime() + (i - 11) * nightLen);
      hours.push({ n: i + 1, ruler: CHALDEAN[(idx + i) % 7], start, end, night: i >= 12 });
    }
    return { sunrise, sunset, nextSunrise, ruler, hours };
  }

  // ---------- skóre dne ----------
  const DEFAULT_RULES = {
    orbs: { default: 3, sextile: 2 },
    pointWeight: { Sun: 2, Moon: 2, Asc: 2, MC: 2, default: 1 },
    aspectWeight: { trine: 1, sextile: 0.5, square: -1, opposition: -1 },
    conjWeight: { Sun: 1, Moon: 0.5, Mercury: 0, Venus: 1, Mars: -1, Jupiter: 1, Saturn: -1, Uranus: -0.5, Neptune: -0.5, Pluto: -1 },
    moonAspect: 0.25, moonCap: 1,
    moonElement: 0.5,
    vocPenalty: -1, vocHours: 6,
    mercuryRetro: -0.5,
    kp: { calm: 0.5, g1: -1, g2: -2 },
    thresholds: { harm: 2, tense: -2 },
    starOrb: 1, starOrbPhase: 2,
  };

  function dayAnalysis(y, m, d, natal, observer, tz, kpForDay, rules) {
    rules = rules || DEFAULT_RULES;
    const ds = dayStart(y, m, d, tz);
    const dayEnd = (() => { const p = tzParts(addDays(ds, 1.5), tz); return dayStart(p.y, p.m, p.d, tz); })();
    const noon = new Date(ds.getTime() + (dayEnd.getTime() - ds.getTime()) / 2);
    const pos = positions(noon);
    const reasons = [];
    let score = 0, backgroundScore = 0;
    const SLOW = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    const W = (k) => rules.pointWeight[k] != null ? rules.pointWeight[k] : rules.pointWeight.default;
    const NATAL_KEYS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Asc', 'MC'];

    // tranzity (bez Luny) v poledne
    const transits = [];
    for (const tb of PLANETS_NO_MOON) {
      for (const nk of NATAL_KEYS) {
        const asp = aspectBetween(pos[tb].lon, natal.points[nk].lon, rules.orbs);
        if (!asp) continue;
        const pos2 = lonOf(tb, T(new Date(noon.getTime() + 86400000)));
        const orbNext = Math.abs(Math.abs(diff(pos2, natal.points[nk].lon)) - asp.angle);
        const applying = orbNext < asp.orb;
        let w = asp.key === 'conj' ? rules.conjWeight[tb] : rules.aspectWeight[asp.key];
        w = w * W(nk) * (asp.orb <= 1.5 ? 1 : 0.5);
        const slow = SLOW.includes(tb);
        transits.push({ transit: tb, natal: nk, ...asp, applying, weight: w, retro: pos[tb].retro, slow });
        if (slow) backgroundScore += w; else score += w;
      }
    }
    transits.sort((a, b) => a.orb - b.orb);
    const background = transits.filter(t => t.slow), fast = transits.filter(t => !t.slow);

    // Luna: přesné aspekty k nativu během dne
    const ctx = monthContext(y, m, tz);
    const grid = ctx.grid.filter(r => r.ms >= ds.getTime() - 3600000 && r.ms <= dayEnd.getTime() + 3600000);
    const natalTargets = NATAL_KEYS.map(k => ({ key: k, lon: natal.points[k].lon }));
    const moonToNatal = moonAspectEvents(grid, natalTargets).filter(e => e.ms >= ds.getTime() && e.ms < dayEnd.getTime());
    let moonScore = 0;
    for (const e of moonToNatal) {
      const h = tzParts(new Date(e.ms), tz).hh;
      const awake = h >= 6 && h < 23;
      let w = e.kind === 'harm' ? rules.moonAspect : e.kind === 'tense' ? -rules.moonAspect : (e.target === 'Sun' || e.target === 'Moon' ? rules.moonAspect : 0);
      if (!awake) w *= 0.5;
      e.weight = w; moonScore += w;
    }
    moonScore = Math.max(-rules.moonCap, Math.min(rules.moonCap, moonScore));
    score += moonScore;

    // Luna: znamení, živel, fáze
    const moonSign = signOf(pos.Moon.lon);
    const moonEl = ELEMENT[moonSign], sunEl = ELEMENT[natal.sunSign];
    const elementHarmony = FRIENDLY[sunEl].includes(moonEl);
    if (elementHarmony) { score += rules.moonElement; reasons.push({ kind: 'harm', text: `Luna ${SIGN_LOC_V[moonSign]} – živel ${moonEl} ladí s tvým Sluncem (${sunEl})`, w: rules.moonElement }); }
    const phaseAngle = A.MoonPhase(T(noon));
    const illum = A.Illumination('Moon', T(noon)).phase_fraction;

    // VoC v rámci dne
    const vocToday = ctx.voc.filter(v => v.to > ds.getTime() && v.from < dayEnd.getTime()).map(v => ({ ...v, fromClip: Math.max(v.from, ds.getTime()), toClip: Math.min(v.to, dayEnd.getTime()) }));
    let vocAwake = 0;
    for (const v of vocToday) {
      const a = Math.max(v.fromClip, ds.getTime() + 8 * 3600000), b = Math.min(v.toClip, ds.getTime() + 22 * 3600000);
      if (b > a) vocAwake += (b - a) / 3600000;
    }
    if (vocAwake >= rules.vocHours) { score += rules.vocPenalty; reasons.push({ kind: 'tense', text: `Luna bez kurzu ${Math.round(vocAwake)} h z aktivní části dne`, w: rules.vocPenalty }); }

    // Merkur retro
    if (pos.Mercury.retro) { score += rules.mercuryRetro; reasons.push({ kind: 'tense', text: 'Merkur retrográdní – komunikace, technika, smlouvy s rezervou', w: rules.mercuryRetro }); }

    // Kp
    let kpInfo = null;
    if (kpForDay != null) {
      const kp = kpForDay.kp;
      let w = 0, txt = '';
      if (kp >= 6) { w = rules.kp.g2; txt = `Geomagnetická bouře (Kp ${kp}, G${Math.min(5, kp - 4)})`; }
      else if (kp >= 5) { w = rules.kp.g1; txt = `Slabá geomagnetická bouře (Kp ${kp}, G1)`; }
      else if (kp <= 3) { w = rules.kp.calm; txt = `Klidné kosmické počasí (Kp ${kp})`; }
      else txt = `Neklidné kosmické počasí (Kp ${kp})`;
      score += w;
      kpInfo = { ...kpForDay, weight: w, text: txt };
      if (w !== 0) reasons.push({ kind: w > 0 ? 'harm' : 'tense', text: txt + (kpForDay.source !== 'observed' ? ' – ' + (kpForDay.source === 'forecast' ? 'předpověď' : '27denní výhled') : ''), w });
    }

    // rezonance s "tvými" hvězdami
    const myStars = natal.stars.filter(s => s.mine);
    const resonance = [];
    for (const st of myStars) {
      for (const b of ['Sun', 'Venus', 'Mercury', 'Mars']) {
        const o = Math.abs(diff(pos[b].lon, st.lonNow));
        if (o <= rules.starOrb) resonance.push({ star: st, body: b, orb: o, text: `${BODY_CZ[b]} na tvé hvězdě ${st.name}` });
      }
    }
    const starTargets = myStars.map(s => ({ key: s.id, lon: s.lonNow }));
    const moonOnStars = moonAspectEvents(grid, starTargets, ['conj']).filter(e => e.ms >= ds.getTime() && e.ms < dayEnd.getTime());
    for (const e of moonOnStars) { const st = myStars.find(s => s.id === e.target); resonance.push({ star: st, body: 'Moon', ms: e.ms, text: `Luna přechází přes ${st.name} (${fmtTime(new Date(e.ms), tz)})` }); }
    // novoluní / úplněk dne u hvězdy
    const quarters = moonQuartersBetween(ds, dayEnd);
    for (const q of quarters) {
      if (q.quarter === 0 || q.quarter === 2) {
        const ml = lonOf('Moon', T(q.date));
        for (const st of myStars) { const o = Math.abs(diff(ml, st.lonNow)); if (o <= rules.starOrbPhase) resonance.push({ star: st, body: 'Moon', phase: q.quarter, text: `${q.quarter === 0 ? 'Novoluní' : 'Úplněk'} na hvězdě ${st.name}` }); }
      }
    }

    // poměr skóre -> barva
    const color = score >= rules.thresholds.harm ? 'harm' : score <= rules.thresholds.tense ? 'tense' : 'neutral';
    return {
      y, m, d, dayStart: ds, dayEnd, noon, pos, transits, background, fast, backgroundScore: Math.round(backgroundScore * 100) / 100, moonToNatal, moonScore, moonSign, illum, phaseAngle, elementHarmony,
      voc: vocToday, vocAwake, quarters, kp: kpInfo, resonance, reasons, score: Math.round(score * 100) / 100, color,
      mercuryRetro: pos.Mercury.retro,
    };
  }

  // ---------- úkazy ----------
  function moonAltitude(date, observer) {
    const eq = A.Equator('Moon', T(date), observer, true, true);
    return A.Horizon(T(date), observer, eq.ra, eq.dec, 'normal').altitude;
  }
  function sunAltitude(date, observer) {
    const eq = A.Equator('Sun', T(date), observer, true, true);
    return A.Horizon(T(date), observer, eq.ra, eq.dec, 'normal').altitude;
  }
  const KM_AU = 149597870.7;

  function skyEvents(d0, d1, observer, natal, tz) {
    const ev = [];
    const push = (date, cat, title, note, extra) => ev.push({ date, cat, title, note: note || '', ...(extra || {}) });
    // fáze Luny
    for (const q of moonQuartersBetween(d0, d1)) {
      const names = ['Novoluní', 'První čtvrt', 'Úplněk', 'Poslední čtvrt'];
      const ml = lonOf('Moon', T(q.date));
      let note = `Luna ${fmtLonText(ml)}`;
      let extra = { quarter: q.quarter };
      if (q.quarter === 0 || q.quarter === 2) {
        const distKm = A.EclipticGeoMoon(T(q.date)).dist * KM_AU;
        if (distKm < 360000) { note += ` · superúplněk (${Math.round(distKm / 1000)} tis. km)`; extra.special = 'super'; }
        else if (distKm > 405000) { note += ` · mikroúplněk (${Math.round(distKm / 1000)} tis. km)`; extra.special = 'micro'; }
        if (natal) for (const st of natal.stars.filter(s => s.mine)) { const o = Math.abs(diff(ml, st.lonNow)); if (o <= 2) { note += ` · ✦ na tvé hvězdě ${st.name}`; extra.resonance = true; } }
      }
      try {
        if (q.quarter === 0 || q.quarter === 2) {
          const ap = A.SearchLunarApsis(T(new Date(q.date.getTime() - 2 * 86400000)));
          if (ap && Math.abs(ap.time.date - q.date) < 36 * 3600000) { if (ap.kind === 0) note += q.quarter === 2 ? ' · superúplněk (Luna blízko perigea)' : ' · Luna blízko perigea, silnější příliv'; else if (q.quarter === 2) note += ' · mikroúplněk (Luna blízko apogea)'; }
        }
      } catch (e) { }
      push(q.date, 'luna', names[q.quarter], note, extra);
    }
    // zatmění Luny
    let le = A.SearchLunarEclipse(T(d0));
    while (le && le.peak.date < d1) {
      const kind = { penumbral: 'polostínové', partial: 'částečné', total: 'úplné' }[le.kind] || le.kind;
      const altPeak = moonAltitude(le.peak.date, observer);
      const t0 = new Date(le.peak.date.getTime() - (le.sd_partial || le.sd_penum) * 60000);
      const t1 = new Date(le.peak.date.getTime() + (le.sd_partial || le.sd_penum) * 60000);
      const alt0 = moonAltitude(t0, observer), alt1 = moonAltitude(t1, observer);
      let vis;
      if (altPeak > 0 && alt0 > 0 && alt1 > 0) vis = 'od nás viditelné v celém průběhu';
      else if (altPeak > 0) vis = 'od nás viditelné částečně (Luna u obzoru)';
      else if (alt0 > 0 || alt1 > 0) vis = 'od nás jen okraj úkazu při východu/západu Luny';
      else vis = 'od nás neviditelné (Luna pod obzorem)';
      push(le.peak.date, 'zatmeni', `${kind.charAt(0).toUpperCase() + kind.slice(1)} zatmění Luny`, `maximum ${fmtTime(le.peak.date, tz)} · ${vis} · výška Luny v maximu ${Math.round(altPeak)}°` + (le.obscuration ? ` · zakryto ${Math.round(le.obscuration * 100)} %` : ''), { eclipse: true, altPeak });
      le = A.NextLunarEclipse(le.peak);
    }
    // zatmění Slunce (místní)
    try {
      let se = A.SearchLocalSolarEclipse(T(d0), observer);
      while (se && se.peak.time.date < d1) {
        const kind = { partial: 'částečné', annular: 'prstencové', total: 'úplné' }[se.kind] || se.kind;
        const alt = se.peak.altitude;
        const note = `maximum ${fmtTime(se.peak.time.date, tz)} · zakryto ${Math.round(se.obscuration * 100)} % · výška Slunce ${Math.round(alt)}°` + (alt < 0 ? ' (Slunce pod obzorem)' : '') + ` · od ${fmtTime(se.partial_begin.time.date, tz)} do ${fmtTime(se.partial_end.time.date, tz)}`;
        push(se.peak.time.date, 'zatmeni', `${kind.charAt(0).toUpperCase() + kind.slice(1)} zatmění Slunce nad tebou`, note, { eclipse: true });
        se = A.NextLocalSolarEclipse(se.peak.time, observer);
      }
    } catch (e) { /* žádné další */ }
    // rovnodennosti, slunovraty
    for (let yy = tzParts(d0, tz).y; yy <= tzParts(d1, tz).y; yy++) {
      const s = A.Seasons(yy);
      const list = [[s.mar_equinox, 'Jarní rovnodennost', 'Slunce vstupuje do Berana · začátek astrologického roku'], [s.jun_solstice, 'Letní slunovrat', 'Slunce vstupuje do Raka · nejdelší den'], [s.sep_equinox, 'Podzimní rovnodennost', 'Slunce vstupuje do Vah'], [s.dec_solstice, 'Zimní slunovrat', 'Slunce vstupuje do Kozoroha · nejdelší noc']];
      for (const [t, title, note] of list) if (t.date >= d0 && t.date < d1) push(t.date, 'slunce', title, note);
    }
    // ---------- osobní cykly: návraty Slunce, Luny, Jupitera a Saturnu na nativní polohu ----------
    if (natal && natal.points) {
      const natLon = (b) => natal.points[b] ? natal.points[b].lon : null;
      const dist = (x, y) => ((x - y + 540) % 360) - 180;
      // obecné hledání návratu: hrubý krok, pak půlení
      const findReturn = (body, target, from, to, stepDays) => {
        const out = [];
        let t0 = from.getTime(); let d0v = dist(lonOf(body, T(new Date(t0))), target);
        while (t0 < to.getTime()) {
          const t1 = Math.min(t0 + stepDays * 86400000, to.getTime()); const d1v = dist(lonOf(body, T(new Date(t1))), target);
          // průchod oběma směry (přímý i zpětný pohyb) — Saturn i Jupiter se přes nativní stupeň často vracejí třikrát
          if (d0v * d1v < 0 && Math.abs(d1v - d0v) < 180) {
            let lo = t0, hi = t1, slo = d0v;
            for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; const dm = dist(lonOf(body, T(new Date(mid))), target); if ((dm < 0) === (slo < 0)) { lo = mid; slo = dm; } else hi = mid; }
            out.push(new Date((lo + hi) / 2));
          }
          t0 = t1; d0v = d1v;
        }
        return out;
      };
      const sunL = natLon('Sun'), moonL = natLon('Moon'), jupL = natLon('Jupiter'), satL = natLon('Saturn');
      if (sunL != null) for (const t of findReturn('Sun', sunL, d0, d1, 1)) push(t, 'osobni', 'Sluneční návrat', `Slunce se vrací na ${fmtLonText(sunL)} · začátek tvého osobního roku`, { personal: 'sun' });
      if (moonL != null) for (const t of findReturn('Moon', moonL, d0, d1, 0.25)) push(t, 'osobni', 'Lunární návrat', `Luna se vrací na ${fmtLonText(moonL)} · tichý osobní nov`, { personal: 'moon' });
      if (jupL != null) for (const t of findReturn('Jupiter', jupL, d0, d1, 5)) push(t, 'osobni', 'Jupiterův návrat', `Jupiter se vrací na ${fmtLonText(jupL)} · jednou za 12 let`, { personal: 'jupiter' });
      if (satL != null) for (const t of findReturn('Saturn', satL, d0, d1, 5)) push(t, 'osobni', 'Saturnův návrat', `Saturn se vrací na ${fmtLonText(satL)} · jednou za 29 let`, { personal: 'saturn' });
    }
    // Kolo roku: čtyři mezidny přesně v 15° pevných znamení (astronomicky, ne podle data)
    {
      const gates = [[315, 'Imbolc', 'Slunce v 15° Vodnáře · brána ke světlu, první náznak jara'], [45, 'Beltain', 'Slunce v 15° Býka · brána léta, vrchol rozkvětu'], [135, 'Lughnasad', 'Slunce v 15° Lva · brána sklizně, první plody'], [225, 'Samhain', 'Slunce v 15° Štíra · brána zimy, čas předků a ticha']];
      for (const [lon, title, note] of gates) {
        let t = A.SearchSunLongitude(lon, T(new Date(d0.getTime() - 86400000)), 400);
        while (t && t.date < d1) { if (t.date >= d0) push(t.date, 'slunce', title, note, { wheel: true }); t = A.SearchSunLongitude(lon, T(new Date(t.date.getTime() + 300 * 86400000)), 400); }
      }
    }
    // Luna nejblíž a nejdál: perigeum a apogeum
    try {
      let ap = A.SearchLunarApsis(T(d0));
      while (ap && ap.time.date < d1) {
        const peri = ap.kind === 0;
        const km = Math.round(ap.dist_km / 1000) * 1000;
        push(ap.time.date, 'luna', peri ? 'Luna v perigeu' : 'Luna v apogeu', `${peri ? 'nejblíž Zemi' : 'nejdál od Země'} · ${km.toLocaleString('cs-CZ')} km`, { apsis: peri ? 'peri' : 'apo' });
        ap = A.NextLunarApsis(ap);
      }
    } catch (e) { }
    // opozice vnějších planet, elongace a konjunkce vnitřních
    for (const b of ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
      let t = A.SearchRelativeLongitude(b, 180, T(d0));
      while (t && t.date < d1) { push(t.date, 'planety', `${BODY_CZ[b]} v opozici se Sluncem`, `${BODY_CZ[b]} je nejblíž Zemi, viditelný celou noc · ${fmtLonText(lonOf(b, t))}`); t = A.SearchRelativeLongitude(b, 180, T(addDays(t.date, 30))); }
    }
    for (const b of ['Mercury', 'Venus']) {
      let e = A.SearchMaxElongation(b, T(d0));
      while (e && e.time.date < d1) { push(e.time.date, 'planety', `${BODY_CZ[b]} – největší ${e.visibility === 'morning' ? 'ranní' : 'večerní'} elongace`, `${Math.round(e.elongation)}° od Slunce · ${e.visibility === 'morning' ? 'jitřenka před svítáním' : 'večernice po západu Slunce'}`); e = A.SearchMaxElongation(b, T(addDays(e.time.date, 10))); }
      let c = A.SearchRelativeLongitude(b, 0, T(d0));
      while (c && c.date < d1) { push(c.date, 'planety', `${BODY_CZ[b]} v dolní konjunkci se Sluncem`, `${BODY_CZ[b]} prochází mezi Zemí a Sluncem · přechod z večerní na ranní oblohu`); c = A.SearchRelativeLongitude(b, 0, T(addDays(c.date, 30))); }
    }
    // stacionární body (retrogradita) a ingresy planet – denní mřížka
    const dgrid = hourGrid(d0.getTime(), d1.getTime(), PLANETS_NO_MOON, 24);
    for (const b of PLANETS_NO_MOON) {
      if (b === 'Sun') continue;
      for (let i = 1; i < dgrid.length - 1; i++) {
        const v0 = diff(dgrid[i][b], dgrid[i - 1][b]), v1 = diff(dgrid[i + 1][b], dgrid[i][b]);
        if ((v0 < 0) !== (v1 < 0)) {
          const ms = bisect((x) => diff(lonOf(b, T(new Date(x + 43200000))), lonOf(b, T(new Date(x - 43200000)))), dgrid[i - 1].ms, dgrid[i + 1].ms);
          const retroNow = v1 < 0;
          push(new Date(ms), 'planety', `${BODY_CZ[b]} ${retroNow ? 'se obrací do retrogradity' : 'se vrací do přímého pohybu'}`, `${fmtLonText(lonOf(b, T(new Date(ms))))}`, { station: true, retro: retroNow });
        }
      }
    }
    for (const ing of ingressEvents(dgrid, PLANETS_NO_MOON)) {
      if (ing.body === 'Sun' && ing.to % 3 === 0) continue; // rovnodennosti a slunovraty už jsou
      const slow = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'].includes(ing.body);
      push(new Date(ing.ms), 'planety', `${BODY_CZ[ing.body]} vstupuje do ${SIGN_GEN[ing.to]}`, `${ing.retro ? 'retrográdně zpět: ' : ''}${SIGNS[ing.from]} → ${SIGNS[ing.to]}` + (slow ? ' · pomalá planeta, mění se ráz celého období' : ''), { ingress: true, slow, body: ing.body, toSign: ing.to });
    }
    // Slunce, Venuše, Merkur, Mars na tvých hvězdách
    if (natal) {
      const mine = natal.stars.filter(s => s.mine || s.strength > 0);
      for (const b of ['Sun', 'Venus', 'Mercury', 'Mars']) {
        for (let i = 1; i < dgrid.length; i++) {
          for (const st of mine) {
            const a = diff(dgrid[i - 1][b], st.lonNow), c = diff(dgrid[i][b], st.lonNow);
            if (Math.abs(a) < 20 && Math.abs(c) < 20 && (a < 0) !== (c < 0)) {
              const ms = bisect((x) => diff(lonOf(b, T(new Date(x))), st.lonNow), dgrid[i - 1].ms, dgrid[i].ms);
              if (b === 'Sun' || b === 'Venus' || st.mine) push(new Date(ms), 'hvezdy', `${BODY_CZ[b]} na ${st.mine ? 'tvé ' : ''}hvězdě ${st.name}`, `${fmtLonText(st.lonNow)} · ${st.mine ? 'hlavní' : 'vedlejší'} hvězda tvého nativu` + (b === 'Sun' ? ' · den v roce, kdy Slunce rozsvěcí tuto hvězdu' : ''), { star: st.id, body: b, resonance: true });
            }
          }
        }
      }
    }
    // těsné konjunkce planet (viditelné) a Luny s planetami
    const NE = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
    const sep = (a, b, t) => A.AngleBetween(A.GeoVector(a, t, true), A.GeoVector(b, t, true));
    const step = 6 * 3600000;
    const samples = [];
    for (let ms = d0.getTime(); ms <= d1.getTime(); ms += step) {
      const t = T(new Date(ms)); const row = { ms, t };
      for (let i = 0; i < NE.length; i++) for (let j = i + 1; j < NE.length; j++) row[NE[i] + NE[j]] = sep(NE[i], NE[j], t);
      for (const b of NE) row['Moon' + b] = sep('Moon', b, t);
      samples.push(row);
    }
    const minima = (key, thr, refineFn) => {
      for (let i = 1; i < samples.length - 1; i++) {
        if (samples[i][key] < thr && samples[i][key] <= samples[i - 1][key] && samples[i][key] <= samples[i + 1][key]) {
          // zjemnění po 10 min
          let best = { ms: samples[i].ms, v: samples[i][key] };
          for (let ms = samples[i - 1].ms; ms <= samples[i + 1].ms; ms += 600000) { const v = refineFn(T(new Date(ms))); if (v < best.v) best = { ms, v }; }
          refineFn.out(best);
        }
      }
    };
    for (let i = 0; i < NE.length; i++) for (let j = i + 1; j < NE.length; j++) {
      const a = NE[i], b = NE[j];
      const fn = (t) => sep(a, b, t); fn.out = (best) => {
        const t = T(new Date(best.ms));
        const elong = A.AngleBetween(A.GeoVector('Sun', t, true), A.GeoVector(a, t, true));
        push(new Date(best.ms), 'planety', `Konjunkce ${BODY_CZ[a]} a ${BODY_CZ[b]}`, `vzdálenost ${best.v.toFixed(1)}° · ${elong < 15 ? 'blízko Slunce, prakticky nepozorovatelné' : elong < 30 ? 'nízko v soumraku' : 'dobře pozorovatelné'}`, { conj: [a, b], sep: best.v });
      };
      minima(a + b, 2.5, fn);
    }
    for (const b of NE) {
      const fn = (t) => sep('Moon', b, t); fn.out = (best) => {
        const alt = moonAltitude(new Date(best.ms), observer);
        push(new Date(best.ms), 'luna', `Luna u ${BODY_GEN[b]}`, `vzdálenost ${best.v.toFixed(1)}°` + (best.v < 0.6 ? ' · možný zákryt, ověř v astro aplikaci' : '') + ` · ${alt > 0 ? 'Luna nad obzorem' : 'Luna pod obzorem (u nás nepozorovatelné)'}`, { conj: ['Moon', b], sep: best.v });
      };
      minima('Moon' + b, 1.5, fn);
    }
    // meteorické roje
    for (let yy = tzParts(d0, tz).y; yy <= tzParts(d1, tz).y; yy++) {
      for (const s of METEOR_SHOWERS) {
        const peak = localToDate(yy, s.month, s.day, 23, 0, tz);
        if (peak >= d0 && peak < d1) {
          const il = A.Illumination('Moon', T(peak)).phase_fraction;
          push(peak, 'roje', `${s.name} – maximum roje`, `až ${s.zhr} meteorů/h v ideálních podmínkách · Luna osvětlena z ${Math.round(il * 100)} %${il > 0.7 ? ' – měsíční svit ruší' : il < 0.3 ? ' – dobré podmínky' : ''}`, { zhr: s.zhr });
        }
      }
    }
    // přechody Merkuru/Venuše přes Slunce (vzácné)
    for (const b of ['Mercury', 'Venus']) {
      try { const tr = A.SearchTransit(b, T(d0)); if (tr && tr.peak.date < d1) push(tr.peak.date, 'planety', `Přechod ${BODY_GEN[b]} přes sluneční kotouč`, `vzácný úkaz · maximum ${fmtTime(tr.peak.date, tz)}`); } catch (e) { }
    }
    ev.sort((a, b) => a.date - b.date);
    return ev;
  }

  // heliakický východ hvězdy v daném roce (první ranní viditelnost)
  function heliacalRising(star, year, observer, tz) {
    if (star.dec > 30 || star.dec < -(90 - Math.abs(observer.latitude)) + 0.5) return null; // (téměř) cirkumpolární / nevychází
    const body = defineStar(star);
    const visibleOn = (dayDate) => {
      const r = A.SearchRiseSet(body, observer, +1, T(dayDate), 1);
      if (!r) return null;
      return sunAltitude(r.date, observer) <= -star.av;
    };
    // hrubé vzorkování po 5 dnech, hledáme přechod neviditelné -> viditelné
    let prev = null, prevDate = null;
    for (let doy = 0; doy <= 370; doy += 5) {
      const dd = addDays(dayStart(year, 1, 1, tz), doy);
      const v = visibleOn(dd);
      if (v === null) continue;
      if (prev === false && v === true) {
        // zjemni po dnech
        for (let k = 1; k <= 5; k++) { const d2 = addDays(prevDate, k); if (visibleOn(d2)) return d2; }
        return dd;
      }
      prev = v; prevDate = dd;
    }
    return null;
  }

  // ---------- efemeridy ----------
  function ephemerisMonth(y, m, tz) {
    const rows = [];
    const n = daysInMonth(y, m);
    for (let d = 1; d <= n; d++) {
      const ds = dayStart(y, m, d, tz);
      const pos = positions(ds);
      rows.push({ d, date: ds, pos });
    }
    return rows;
  }

  // ---------- NOAA parsování ----------
  function parseKpJson(json) {
    // [["time_tag","Kp",...],[...]] nebo [["time_tag","kp","observed","noaa_scale"],...]
    if (!Array.isArray(json) || json.length < 2) return [];
    const head = json[0].map(h => String(h).toLowerCase());
    const ti = head.indexOf('time_tag'), ki = head.findIndex(h => h === 'kp' || h === 'kp_index' || h.startsWith('kp'));
    const oi = head.indexOf('observed');
    const out = [];
    for (let i = 1; i < json.length; i++) {
      const r = json[i];
      const kp = parseFloat(r[ki]); if (isNaN(kp)) continue;
      out.push({ time: new Date(String(r[ti]).replace(' ', 'T') + (String(r[ti]).endsWith('Z') ? '' : 'Z')), kp, status: oi >= 0 ? String(r[oi]) : 'observed' });
    }
    return out;
  }
  function parseOutlook(text) {
    const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
    const out = [];
    for (const line of String(text).split('\n')) {
      const mt = line.match(/^(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d+)\s+(\d+)\s+(\d+)/);
      if (mt) out.push({ key: isoDate(+mt[1], MON[mt[2]], +mt[3]), flux: +mt[4], a: +mt[5], kp: +mt[6] });
    }
    return out;
  }
  // sloučení do mapy den -> {kp, source}
  function mergeKp(observed, forecast, outlook, tz) {
    const map = {};
    for (const row of outlook || []) map[row.key] = { kp: row.kp, source: 'outlook' };
    for (const r of forecast || []) {
      const k = dateKey(r.time, tz); const src = r.status === 'observed' ? 'observed' : r.status === 'estimated' ? 'observed' : 'forecast';
      const cur = map[k];
      if (!cur || cur.source === 'outlook' || (cur.source === src && r.kp > cur.kp) || (cur.source === 'forecast' && src === 'observed')) map[k] = { kp: Math.round(r.kp * 10) / 10, source: src };
      else if (cur.source === src) cur.kp = Math.max(cur.kp, Math.round(r.kp * 10) / 10);
    }
    for (const r of observed || []) {
      const k = dateKey(r.time, tz);
      const cur = map[k];
      if (!cur || cur.source !== 'observed') map[k] = { kp: Math.round(r.kp * 10) / 10, source: 'observed' };
      else cur.kp = Math.max(cur.kp, Math.round(r.kp * 10) / 10);
    }
    return map;
  }

  return {
    SIGNS, SIGN_GLYPH, SIGN_LOC, SIGN_LOC_V, SIGN_GEN, ELEMENT, BODIES, PLANETS_NO_MOON, BODY_CZ, BODY_GLYPH, BODY_GEN, ASPECTS, STARS, METEOR_SHOWERS, CHALDEAN, DAY_RULER, WEEKDAY_CZ, MONTH_CZ, MONTH_GEN, TZ, DEFAULT_RULES,
    norm, diff, tzParts, tzOffsetMin, localToDate, dayStart, addDays, dateKey, fmtTime, fmtDateCz, fmtDateLong, daysInMonth, isoDate,
    lonOf, meanNode, positions, signOf, degInSign, fmtLon, fmtLonText, starLonLat, ascMC, placidus, houseOf, aspectBetween,
    natalChart, monthContext, moonQuartersBetween, lunarDay, planetaryHours, dayAnalysis, skyEvents, heliacalRising, ephemerisMonth,
    parseKpJson, parseOutlook, mergeKp, moonAltitude, sunAltitude, bisect, hourGrid, moonAspectEvents, ingressEvents,
    clearCache: () => { for (const k in _ctxCache) delete _ctxCache[k]; },
  };
}
if (typeof module !== 'undefined') module.exports = createKairosEngine;

/* ============================================================
   KAIROS – textová vrstva
   Převádí spočítanou strukturu dne na věcné české věty.
   Vrstva 1 (obecná) nezávisí na nativu – stejná pro všechny.
   Vrstva 2 (osobní) pracuje s tranzity k nativu.
   Jazyk popisuje terén, nerozhoduje za člověka.
   ============================================================ */
function createKairosTexts(K) {
  'use strict';

  // --- Slunce ve znamení: tón období ---
  const SUN_TONE = [
    'nové začátky, odvaha a chuť jednat', 'stabilita, tělo, peníze a to, co má skutečnou hodnotu', 'komunikace, nové informace, lidé a pohyb', 'domov, rodina, blízkost a pocit bezpečí',
    'tvořivost, radost, sebevyjádření a chuť být vidět', 'pořádek, praktické věci, zdraví a každodenní fungování', 'vztahy, spolupráce a hledání rovnováhy', 'hloubka, pravda, pouštění starého a proměna',
    'nové obzory, plány a hledání smyslu', 'práce, odpovědnost a dlouhodobé cíle', 'svoboda, nové nápady, změny a lidé kolem nás', 'zklidnění, citlivost, intuice a větší potřeba být sám se sebou'
  ];

  // --- Luna: živel dne ---
  const MOON_EL = {
    'oheň': { lede: 'dnes tě to táhne do akce', go: 'pohyb, sport, rozhodování, nové začátky', cost: 'čekání a pomalé tempo' },
    'země': { lede: 'dnes se vyplatí držet při zemi', go: 'praktické věci, úklid, peníze, péče o tělo a dobré jídlo', cost: 'rychlé změny a improvizace' },
    'vzduch': { lede: 'hlava jede rychleji a chce komunikovat', go: 'domluvy, psaní, telefonáty, učení a nové nápady', cost: 'udržet pozornost u jedné věci' },
    'voda': { lede: 'dnes víc vnímáš sebe i svoje pocity', go: 'odpočinek, blízkost, terapie, tvoření a čas pro sebe', cost: 'tvrdá jednání a rozhodování čistě hlavou' },
  };
  // --- Luna ve znamení: krátká charakteristika ---
  const MOON_SIGN = [
    'chce jednat hned a udělat první krok', 'chce klid, pohodlí a nikam nespěchat', 'je zvědavá, živá a snadno přeskakuje od jednoho k druhému', 'je citlivější a táhne ji to k domovu a blízkým',
    'chce tvořit, zářit a být vidět', 'chce mít jasno, pořádek a věci dotažené', 'hledá klid, rovnováhu a společnou řeč', 'prožívá věci intenzivněji a jde pod povrch',
    'chce prostor, pohyb a něco nového', 'soustředí se na výsledek a na to, co je potřeba udělat', 'potřebuje volnost, odstup a vlastní prostor', 'je vnímavější, zasněná a potřebuje víc klidu'
  ];

  // --- fáze ---
  function phaseText(ph) {
    if (ph < 15 || ph > 345) return { name: 'novoluní', go: 'čas pro nový záměr a klidný začátek' };
    if (ph < 90) return { name: 'dorůstající srpek', go: 'čas začít a postupně přidávat' };
    if (ph < 105) return { name: 'první čtvrt', go: 'čas překonat první překážky a pokračovat' };
    if (ph < 175) return { name: 'dorůstající Luna', go: 'čas věci rozvíjet, dotahovat a ukázat světu' };
    if (ph < 195) return { name: 'úplněk', go: 'věci vrcholí a jsou víc vidět i cítit' };
    if (ph < 270) return { name: 'couvající Luna', go: 'čas sklízet výsledky, dokončovat a uzavírat' };
    if (ph < 285) return { name: 'poslední čtvrt', go: 'čas pustit to, co už ti neslouží' };
    return { name: 'couvající srpek', go: 'čas zpomalit, uklidit si a nabrat síly před novým začátkem' };
  }

  // --- co která planeta v dobrém aspektu přináší / v napjatém stojí ---
  const GO = {
    Sun: 'víc jasno, jistota a chuť ukázat se', Mercury: 'snazší domluva, psaní a komunikace', Venus: 'větší lehkost ve vztazích a příjemnější atmosféra',
    Mars: 'víc energie a odvahy něco udělat', Jupiter: 'větší optimismus, důvěra a chuť rozšířit obzory', Saturn: 'trpělivost, disciplína a schopnost něco dotáhnout',
    Uranus: 'nové nápady a jiný pohled na věc', Neptune: 'silnější intuice, fantazie a citlivost', Pluto: 'odvaha jít do hloubky a něco skutečně změnit', Moon: 'větší citová pohoda a vnitřní soulad',
  };
  const COST = {
    Sun: 'větší potřeba prosadit si svoje', Mercury: 'nedorozumění, zbrklost a unáhlená slova', Venus: 'snaha vyhovět i tam, kde už ti to není příjemné',
    Mars: 'spěch, podráždění a větší sklon ke konfliktu', Jupiter: 'přehánění a sliby větší, než je reálné', Saturn: 'pocit tíhy, pochybnosti a pomalejší tempo',
    Uranus: 'neklid, změny plánů a překvapení', Neptune: 'nejasnosti, únava a horší odhad situace', Pluto: 'silný tlak a potřeba mít věci pod kontrolou', Moon: 'větší citlivost a proměnlivá nálada',
  };
  const CONJ = {
    Sun: 'tohle téma je dnes hodně vidět', Mercury: 'hlava jede naplno a je toho hodně k řešení nebo říkání', Venus: 'víc jemnosti, blízkosti a příjemné energie',
    Mars: 'silný příval energie a potřeba jednat', Jupiter: 'věci se zvětšují a otevírají nové možnosti', Saturn: 'tohle téma chce brát vážně a postavit na pevných základech',
    Uranus: 'něco se může pohnout nečekaným směrem', Neptune: 'hranice jsou méně jasné a víc pracuje intuice', Pluto: 'tohle téma jde opravdu do hloubky', Moon: 'silnější emoce a citlivější prožívání',
  };
  // --- oblast, které se tranzit dotýká ---
  const DOMAIN = {
    Sun: 'sebevědomí a směr', Moon: 'pocity a vnitřní pohoda', Mercury: 'myšlení a komunikace',
    Venus: 'vztahy a peníze', Mars: 'energie a schopnost jednat', Jupiter: 'plány, růst a důvěra',
    Saturn: 'povinnosti a dlouhodobé věci', Uranus: 'svoboda a změny', Neptune: 'intuice, sny a vnitřní svět',
    Pluto: 'hluboké změny a téma kontroly', Asc: 'jak působíš na okolí', MC: 'práce, směřování a veřejná role',
  };

  const NATAL_LOC = { Sun: 'tvé Slunce', Moon: 'tvou Lunu', Mercury: 'tvůj Merkur', Venus: 'tvou Venuši', Mars: 'tvůj Mars', Jupiter: 'tvůj Jupiter', Saturn: 'tvůj Saturn', Uranus: 'tvůj Uran', Neptune: 'tvůj Neptun', Pluto: 'tvé Pluto', Asc: 'tvůj Ascendent', MC: 'tvé MC' };

  const strip = (s) => s.charAt(0).toLowerCase() + s.slice(1);

  const DAY_READ = [
    [["Dnes je do věcí chuť pustit se rovnou, bez dlouhých příprav. Co se odloží na potom, ztratí půl své síly — a naopak i malý první krok dnes otevře dveře. Občas se přitom šlápne vedle; nevadí, dá se to zítra srovnat. Dopoledne má nejvíc tahu.","den chuti, odvahy a začátků"],["Dnes je znát, kde se dlouho tlačilo silou. Věci, které stály na samém úsilí, si říkají o jiný přístup — někdy stačí přestat tlačit a ono se to pohne samo. Je to den spíš na dokončení než na rozjezd. K večeru se napětí uvolní.","den doražení a uvolnění sevření"]],
    [["Dnes je dobré držet se toho, co se dá chytit rukama. Věci jdou pomaleji, ale to, co se dnes udělá, drží. Chuť na dobré jídlo, pohodlí a klid je větší než obvykle a není důvod jí odporovat. Odpoledne bývá nejpříjemnější část dne.","den těla, klidu a pevných věcí"],["Dnes se ukáže, čeho je doma i v hlavě víc, než je třeba. Je to den na dojídání, dokončování a uklízení — nic velkého se nezačíná, zato se hodně dozavírá. Tělo si říká o pomalejší tempo. Podvečer bývá měkčí než zbytek dne.","den zjednodušení a spotřebování"]],
    [["Dnes je vzduch plný nápadů a informací a všechno se rychle propojuje. Je to den, kdy se dobře domlouvá, píše a zjišťuje. Občas se toho nabere víc, než kolik se dá zpracovat — stačí si vybrat dvě věci a ty dotáhnout. Dopoledne je nejrychlejší.","den nápadů, hovorů a spojení"],["Dnes se hlavou honí víc věcí, než kolik jich stihne dosednout. Není to den na nové sliby — spíš na dořečení toho, co zůstalo viset v půli věty. Rozhovory jdou snadno a ledacos se vyjasní samo, jen tím, že se to konečně vysloví. Podvečer bývá klidnější než zbytek dne.","den dořečení a vyjasnění"]],
    [["Dnes je blízko k domovu a k lidem, se kterými je člověku dobře. Věci se dělají líp v malém kruhu než na veřejnosti, a co se dnes zaseje v rodině, drží dlouho. Nálada kolísá po vlnách, ale žádná netrvá dlouho. Večer je nejteplejší část dne.","den domova, péče a blízkosti"],["Dnes se ozývá to, co se dlouho drželo uvnitř. Je to den, kdy se dobře odpouští — sobě i druhým — a kdy je v pořádku ubrat a být chvíli sám se sebou. Staré vzpomínky chodí blíž než jindy. K večeru se to usadí.","den měkkosti, odpuštění a klidu"]],
    [["Dnes je chuť být vidět a dělat věci naplno. Co se dnes začne s radostí, má tah — a bývá znát i na lidech kolem. Občas se do toho přimíchá potřeba mít pravdu; když se povolí, zbyde jen ta radost. Odpoledne a večer je den nejštědřejší.","den odvahy, tvoření a velkorysosti"],["Dnes je dobré ukázat to, co už je hotové, místo slibování dalšího. Uznání a poděkování mají dnes velkou váhu — vyslovené i přijaté. Chuť po pozornosti může být větší než obvykle a stačí ji vzít na vědomí. Podvečer bývá vřelý.","den vděčnosti a doznění"]],
    [["Dnes se dobře třídí, opravuje a dává do pořádku. Drobnosti, na které jindy nezbývá čas, jdou dnes samy od ruky a je z nich vidět víc, než by se čekalo. Kritického oka je víc než obvykle; hodí se ho obrátit spíš na věci než na lidi. Dopoledne je nejsoustředěnější.","den pořádku, práce a detailů"],["Dnes se ukazuje, co už je hotové a co se jen zbytečně přepilovává. Je to den na dodělání rozdělaného a na vyřazení toho, co se přežilo. Tělo si říká o obyčejnou péči — jídlo, spánek, pohyb. Podvečer je klidnější.","den dokončení a úlevy"]],
    [["Dnes se lépe hledá společná řeč a věci se dají srovnat po dobrém. Je to den na domluvu, na krásu kolem sebe a na to, co se dělá ve dvou. Rozhodování může trvat déle, než by se chtělo — a je v pořádku dát mu čas. Odpoledne bývá nejsmířlivější.","den souladu, dohody a krásy"],["Dnes je znát, kde se ustupovalo víc, než bylo zdravé. Je to den, kdy se dobře narovnává, co se dlouho drželo v rovnováze jen naoko. Věci se dají doříct v klidu, bez zvedání hlasu. K večeru se atmosféra pročistí.","den narovnání a upřímnosti"]],
    [["Dnes jde všechno do hloubky a povrchní věci nebaví. Je to den, kdy se dá dostat na dřeň — v práci, ve vztahu i sám u sebe — a kdy se pozná, co je opravdové. Emoce jsou silnější než obvykle a chtějí spíš prožít než vysvětlit. Večer je nejsilnější.","den hloubky, pravdy a proměny"],["Dnes se dobře pouští to, co už dlouho tíží. Je to den, kdy se ledacos uzavírá samo, jen tím, že se to přestane držet. Věci vyplouvají na povrch bez ptaní. K ránu bývá nejtíž, večer nejvolněji.","den puštění a očisty"]],
    [["Dnes je chuť po dálce, po smyslu a po něčem větším, než je běžný den. Věci se dobře plánují a učí, cizí i nové jde snadno pod kůži. Slibuje se přitom lehčeji, než se stíhá — a to je v pořádku, když se to ví. Odpoledne je nejotevřenější.","den rozhledu, důvěry a cesty"],["Dnes je dobré vrátit se k tomu, co se kdysi začalo a nedokončilo. Ukazuje se, co z velkých plánů má opravdu smysl a co byl jen zápal. Nadhled přichází snadno, stačí o krok ustoupit. K večeru se ujasní směr.","den nadhledu a návratů"]],
    [["Dnes se dobře staví to, co má vydržet. Věci jdou pomaleji, ale drží tvar — a co se dnes rozhodne, ponese se dál. Zodpovědnosti je víc než chuti, a přesto se to dá unést. Dopoledne má nejpevnější krok.","den práce, řádu a základů"],["Dnes je znát tíha toho, co se dlouho nese. Je to den, kdy se dobře přiznává, že něco už dosloužilo, a kdy se dá odložit povinnost, která se nabalila sama od sebe. Míň věcí, víc pozornosti. K večeru se uleví.","den odložení a poctivého účtu"]],
    [["Dnes se dobře dělá věc jinak, než jak se dělala vždycky. Nápady přicházejí zboku a často od lidí, kteří s tím zdánlivě nemají nic společného. Zavedené postupy dnes drhnou — a je to spíš pozvání než potíž. Odpoledne je nejnápaditější.","den svobody, nápadů a přátel"],["Dnes se ukazuje, co se dělá jen ze zvyku. Je to den na vyřazení věcí, které už nikomu neslouží, a na zjednodušení kolem sebe. Mezi lidmi se dýchá líp než o samotě. Podvečer bývá nejvolnější.","den zjednodušení a vzduchu"]],
    [["Dnes je hranic míň než obvykle a věci se prolínají. Cit, hudba, obrazy a sny jdou dnes blíž než rozum a leccos se pochopí bez vysvětlování. Na přesnost a tvrdé jednání je to den slabší — a to je v pořádku. Podvečer je nejjemnější.","den citu, tvoření a splývání"],["Dnes se dobře odpouští a pouští. Je to den, kdy se dá odpočívat bez výčitek a kdy je únava spíš informací než chybou. Věci, které se zdály neřešitelné, se rozpustí samy. K ránu bývá mlhavo, večer se pročistí.","den odpočinku, odpuštění a ztišení"]]
  ];
  const DAY_READ_SP = {
    nov: ["Dnes je ticho na začátku. Nic ještě není vidět, a přesto se rozhoduje, čemu dát v příštích týdnech místo. Je to den spíš na rozvahu než na rozjezd — co se dnes tiše nastaví, ponese se dlouho. Odpoledne se myšlenky usadí a bývá jasněji, o co vlastně jde.", "den ticha, záměru a základů"],
    uplnek: ["Dnes se víc ozývá to, co cítíme. Některé věci už nejdou obejít rozumem ani odložit na později — chtějí být vyslovené, dožité nebo jednoduše puštěné. Ráno může být ještě trochu sevřené, po druhé se prostor začne otevírat a věci půjdou snáz.", "den citu, uvolnění a dozrávání"],
    tense: ["Dnes jde všechno o něco pomaleji a je cítit odpor — jako když se kráčí do kopce. Není to den, kdy by se dalo hodně stihnout, spíš den, kdy obstojí to, co má pevný základ. Míň věcí, víc pozornosti. K večeru tlak povolí a bývá vidět, že se toho zvládlo víc, než se zdálo.", "den pomalého kroku a pevných věcí"],
    harm: ["Dnes věci plynou snáz, než bývá zvykem — domluvy sedají, cesty se zkracují a leccos vyjde jakoby mimochodem. Je to den, kdy se vyplatí požádat o to, co se dlouho odkládalo. Dopoledne otevírá, odpoledne dotahuje.", "den plynutí a otevřených dveří"],
    zatmeni: ["Dnes se děje víc, než je vidět. Zatmění bývá cítit několik dní kolem sebe a věci, které se dnes hnou, se často doceňují až s odstupem. Je to den spíš na vnímání než na velká rozhodnutí. Klidnější bývá večer.", "den obratu a tiché změny"]
  };
  function dayReading(da, ctxEvents) {
    const pa = da.phaseAngle, ev = ctxEvents || [];
    const sign = K.SIGN_LOC_V[da.moonSign];
    const ph = phaseText(pa).name.replace(' Luna', '');
    let t, sig, head;
    if (ev.find(e => e.cat === 'zatmeni')) { [t, sig] = DAY_READ_SP.zatmeni; head = `Zatmění · ${sign}`; }
    else if (pa < 18 || pa > 342) { [t, sig] = DAY_READ_SP.nov; head = `Nov ${sign}`; }
    else if (Math.abs(pa - 180) < 18) { [t, sig] = DAY_READ_SP.uplnek; head = `Úplněk ${sign}`; }
    else if (da.color === 'tense' && da.score <= -4) { [t, sig] = DAY_READ_SP.tense; head = `Luna ${sign}`; }
    else if (da.color === 'harm' && da.score >= 4) { [t, sig] = DAY_READ_SP.harm; head = `Luna ${sign}`; }
    else { const p = DAY_READ[da.moonSign][pa < 180 ? 0 : 1]; t = p[0]; sig = p[1]; head = `${ph.charAt(0).toUpperCase() + ph.slice(1)} Luna ${sign}`; }
    return { text: t, sign: `${head} · ${sig}` };
  }

  // ============ VRSTVA 1 – obecná věta o dni ============
  function dayLede(da, ctxEvents) {
    const el = K.ELEMENT[da.moonSign];
    const ph = phaseText(da.phaseAngle);
    const big = (ctxEvents || []).find(e => e.cat === 'zatmeni') || (ctxEvents || []).find(e => e.quarter === 0 || e.quarter === 2) || (ctxEvents || []).find(e => e.cat === 'slunce');
    let s = `Luna ${K.SIGN_LOC_V[da.moonSign]}, ${ph.name} — ${MOON_EL[el].lede}.`;
    if (big) {
      if (big.cat === 'zatmeni') s += ` Dnes ${strip(big.title)} — zatmění bývá cítit několik dní kolem.`;
      else if (big.quarter === 0) s += ' Novoluní: dobrý den vyslovit záměr, ne ho hned tlačit.';
      else if (big.quarter === 2) s += ' Úplněk: věci jsou vidět naostro, včetně toho, co jsi přehlížel.';
      else s += ` ${big.title}: ${strip(big.note || '')}`;
    }
    return s;
  }

  // ============ VRSTVA 1 – obecné body ============
  function generalItems(da, ctxEvents, rules) {
    const go = [], cost = [];
    const el = K.ELEMENT[da.moonSign];
    const ph = phaseText(da.phaseAngle);
    go.push({ icon: '☽', text: MOON_EL[el].go, note: `Luna ${K.SIGN_LOC_V[da.moonSign]} — ${MOON_SIGN[da.moonSign]}` });
    go.push({ icon: '○', text: ph.go, note: `${ph.name}, ${Math.round(da.illum * 100)} % osvětlení` });
    cost.push({ icon: '≈', text: MOON_EL[el].cost, note: `dnešní živel je ${el}, tohle jde proti němu` });
    for (const v of da.voc) {
      const konec = v.toClip === da.dayEnd.getTime() ? 'půlnoci' : K.fmtTime(new Date(v.toClip), TZfrom(da));
      cost.push({ icon: '◷', text: `od ${K.fmtTime(new Date(v.fromClip), TZfrom(da))} do ${konec} je lepší nic důležitého nerozjíždět`, note: 'Luna je bez kurzu — nové věci se mohou hůř chytat, ale na dokončování, běžné věci a odpočinek je to dobrý čas.' });
    }
    if (da.mercuryRetro) cost.push({ icon: '☿', text: 'buď pečlivější u smluv, důležitých zpráv a nákupů techniky', note: 'Merkur je retrográdní — víc se hodí vracet k rozdělaným věcem, opravovat a kontrolovat než bezhlavě rozjíždět nové.' });
    if (da.kp && da.kp.kp >= 5) cost.push({ icon: '≋', text: 'můžeš být citlivější, hůř spát nebo cítit větší neklid', note: 'geomagnetická aktivita je zvýšená a citlivější lidé ji někdy vnímají' });
    if (da.kp && da.kp.kp <= 3) go.push({ icon: '≋', text: 'dnes je geomagnetická aktivita klidná', note: `Kp ${da.kp.kp} — bez výraznějšího rušení` });
    for (const e of (ctxEvents || [])) {
      if (e.cat === 'roje') go.push({ icon: '✷', text: 'vyjít se večer podívat na nebe', note: `${e.title} — ${e.note}` });
      if (e.ingress && e.slow) go.push({ icon: '✧', text: 'všímat si, co se v tomhle tématu mění', note: `${e.title} — ${e.note}` });
    }
    return { go, cost };
  }
  function TZfrom() { return 'Europe/Prague'; }

  // ============ VRSTVA 2 – osobní body ============
  function personalItems(da, rules) {
    const goM = {}, costM = {};
    const add = (map, transit, phrase, nk, applying) => {
      const k = transit + '|' + phrase;
      if (!map[k]) map[k] = { text: phrase, transit, doms: [], applying };
      const dom = DOMAIN[nk];
      if (map[k].doms.indexOf(dom) < 0) map[k].doms.push(dom);
      if (applying) map[k].applying = true;
    };
    for (const t of da.fast) {
      if (t.key === 'conj') add(t.weight >= 0 ? goM : costM, t.transit, CONJ[t.transit], t.natal, t.applying);
      else if (t.kind === 'harm') add(goM, t.transit, GO[t.transit], t.natal, t.applying);
      else add(costM, t.transit, COST[t.transit], t.natal, t.applying);
    }
    const finish = (map) => Object.keys(map).map(k => {
      const it = map[k];
      const GLYPH = { Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇' };
      return { icon: GLYPH[it.transit] || '✧', text: it.text, note: `${K.BODY_CZ[it.transit]} · ${it.doms.slice(0, 3).join(', ')} · ${it.applying ? 'sílí' : 'odeznívá'}`, n: it.doms.length };
    }).sort((a, b) => b.n - a.n).slice(0, 4);
    const go = finish(goM), cost = finish(costM);
    if (da.elementHarmony) go.push({ icon: '≈', text: 'dnešní nálada ti obecně sedí', note: `živel Luny (${K.ELEMENT[da.moonSign]}) ladí s tvým Sluncem` });
    for (const r of da.resonance) go.push({ icon: '✦', text: r.text, note: 'tvá hvězda — dny, kdy se jí něco dotkne, stojí za pozornost', star: true });
    const t2 = (list) => list.map(e => K.fmtTime(new Date(e.ms), 'Europe/Prague')).join(', ');
    const hm = da.moonToNatal.filter(e => e.kind === 'harm'), tm = da.moonToNatal.filter(e => e.kind === 'tense');
    if (hm.length) go.push({ icon: '◷', text: 'vstřícné chvíle: ' + t2(hm), note: 'Luna se dotkne tvých bodů v dobrém úhlu' });
    if (tm.length) cost.push({ icon: '◷', text: 'citlivější chvíle: ' + t2(tm), note: 'krátké, do hodiny je po tom — nerozhoduj zrovna tehdy' });
    return { go, cost };
  }

  // ============ okna dne ============
  const HOUR_USE = {
    Mercury: 'hodí se na maily, hovory, jednání a domluvy', Venus: 'hodí se na vztahy, setkání, odpočinek a příjemné věci', Jupiter: 'hodí se na důležitá rozhodnutí, plánování a nové kroky',
    Sun: 'hodí se na věci, ve kterých chceš být vidět a prosadit se', Moon: 'hodí se na domov, péči, odpočinek a čas pro sebe', Mars: 'hodí se na pohyb, výkon a věci, které potřebují razanci',
    Saturn: 'hodí se na povinnosti, úklid, administrativu a dokončování',
  };
  function windows(da, ph, tz) {
    if (!ph) return [];
    const out = [];
    const inVoc = (t) => da.voc.some(v => t >= v.fromClip && t < v.toClip);
    const day = ph.hours.filter(h => !h.night && h.end > da.dayStart && h.start < da.dayEnd);
    for (const ruler of ['Jupiter', 'Venus', 'Mercury', 'Sun']) {
      const h = day.find(x => x.ruler === ruler && !inVoc(x.start.getTime()));
      if (h) out.push({ ruler, from: h.start, to: h.end, use: HOUR_USE[ruler] });
      if (out.length >= 3) break;
    }
    out.sort((a, b) => a.from - b.from);
    return out;
  }

  // ============ shrnutí pro mřížku a přehled dnů ============
  function dayWord(da) {
    if (da.color === 'harm') return da.score >= 4 ? 'příznivý den' : 'vlídný den';
    if (da.color === 'tense') return da.score <= -4 ? 'náročný den' : 'pomalejší den';
    return 'klidný den';
  }

  // ============ časová osa dne ============
  // Sloučí východy/západy, fáze, aspekty Luny, Lunu bez kurzu a dobrá okna do jednoho čitelného seznamu.
  function timeline(da, ph, wins, ld, moonrise, moonset, dayEv, tz) {
    const E = [];
    const at = (date, icon, text, note, kind) => E.push({ ms: (date instanceof Date ? date : new Date(date)).getTime(), icon, text, note: note || '', kind: kind || '' });
    if (ph) {
      at(ph.sunrise, '☉', 'Východ Slunce', ph.ruler ? `vládce dne ${K.BODY_CZ[ph.ruler]}` : '');
      const svet = Math.round((ph.sunset - ph.sunrise) / 60000);
      at(ph.sunset, '☉', 'Západ Slunce', `den má ${Math.floor(svet / 60)} h ${svet % 60} min světla`);
    }
    if (moonrise && moonrise.date >= da.dayStart && moonrise.date < da.dayEnd) at(moonrise.date, '☽', 'Východ Luny', '');
    if (moonset && moonset.date >= da.dayStart && moonset.date < da.dayEnd) at(moonset.date, '☽', 'Západ Luny', '');
    for (const q of da.quarters) {
      const nm = ['Novoluní', 'První čtvrt', 'Úplněk', 'Poslední čtvrt'][q.quarter];
      const nt = q.quarter === 0 ? 'dobrý okamžik vyslovit záměr' : q.quarter === 2 ? 'věci jsou vidět naostro' : q.quarter === 1 ? 'čas přitlačit přes první překážku' : 'čas pustit, co doslouží';
      at(q.date, q.quarter === 0 ? '●' : q.quarter === 2 ? '○' : '◐', nm, nt);
    }
    for (const w of wins || []) at(w.from, '◇', `${K.fmtTime(w.from, tz)}–${K.fmtTime(w.to, tz)} · ${w.use}`, `hodina ${K.BODY_GEN[w.ruler]}`, 'harm');
    for (const e of da.moonToNatal) {
      const t = e.kind === 'harm' ? 'Vstřícná chvíle' : e.kind === 'tense' ? 'Citlivější chvíle' : 'Luna se dotkne tvého bodu';
      const n = e.kind === 'harm' ? `Luna v dobrém úhlu na ${NATAL_LOC[e.target]} — pár desítek minut, dá se využít` : e.kind === 'tense' ? `Luna v napjatém úhlu na ${NATAL_LOC[e.target]} — krátké, nerozhoduj zrovna teď` : `Luna přechází přes ${NATAL_LOC[e.target]}`;
      at(e.ms, e.kind === 'harm' ? '✦' : e.kind === 'tense' ? '△' : '○', t, n, e.kind);
    }
    for (const r of da.resonance) if (r.ms) at(r.ms, '✦', r.text, 'tvá hvězda', 'harm');
    for (const v of da.voc) {
      if (v.fromClip > da.dayStart.getTime()) at(v.fromClip, '∅', 'Luna bez kurzu', `až do ${v.toClip >= da.dayEnd.getTime() ? 'půlnoci' : K.fmtTime(new Date(v.toClip), tz)} nic nového nezačínej — dokončování a odpočinek jdou naopak dobře`, 'tense');
      if (v.toClip < da.dayEnd.getTime()) at(v.toClip, '→', `Luna vstupuje do ${K.SIGN_GEN[v.toSign]}`, 'nálada dne se přelaďuje');
    }
    for (const e of (dayEv || [])) {
      if (e.quarter != null) continue;
      at(e.date, e.cat === 'zatmeni' ? '◉' : e.cat === 'roje' ? '☄' : '✧', e.title, e.note, e.cat === 'zatmeni' ? 'tense' : '');
    }
    E.sort((a, b) => a.ms - b.ms);
    return E;
  }

  return { SUN_TONE, MOON_EL, MOON_SIGN, GO, COST, CONJ, DOMAIN, HOUR_USE, phaseText, dayLede, dayReading, generalItems, personalItems, windows, dayWord, timeline };
}
if (typeof module !== 'undefined') module.exports = createKairosTexts;

