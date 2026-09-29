/* Hvězdné nebe teď — obloha v reálném čase podle polohy a natočení telefonu.
   Data oblohy: sky-data.js (d3-celestial, BSD-3-Clause). Výpočty: astronomy-engine. */
(function () {
  'use strict';
  const A = window.Astronomy;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const $ = (s, r) => (r || document).querySelector(s);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const enuFromAzAlt = (az, alt) => [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
  const azAltFromEnu = (v) => [Math.atan2(v[0], v[1]), Math.asin(clamp(v[2], -1, 1))];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const BODIES = [
    ['Sun', 'Slunce', '#FFD86B'], ['Moon', 'Luna', '#F4F1E6'], ['Mercury', 'Merkur', '#C9C2B6'], ['Venus', 'Venuše', '#FFF4D6'],
    ['Mars', 'Mars', '#FF8A5C'], ['Jupiter', 'Jupiter', '#F2D9AE'], ['Saturn', 'Saturn', '#EAD28E'], ['Uranus', 'Uran', '#A8E6E8'],
    ['Neptune', 'Neptun', '#8FB2FF'], ['Pluto', 'Pluto', '#C8A98E'],
  ];
  const SIGNS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
  const SIGN_LOC = ['v Beranu', 'v Býku', 'v Blížencích', 'v Raku', 've Lvu', 'v Panně', 've Vahách', 've Štíru', 've Střelci', 'v Kozorohu', 've Vodnáři', 'v Rybách'];
  const MTYPE = { s: 'spirální galaxie', e: 'eliptická galaxie', i: 'nepravidelná galaxie', oc: 'otevřená hvězdokupa', gc: 'kulová hvězdokupa', pn: 'planetární mlhovina', en: 'emisní mlhovina', rn: 'reflexní mlhovina', snr: 'pozůstatek supernovy', sfr: 'oblast zrodu hvězd', pos: 'skupina hvězd' };
  const DIRS = [['S', 0], ['SV', 45], ['V', 90], ['JV', 135], ['J', 180], ['JZ', 225], ['Z', 270], ['SZ', 315]];

  // barva hvězdy podle indexu B−V
  function bvColor(bv) {
    const t = clamp(bv, -0.4, 2.0);
    const stops = [[-0.4, [155, 176, 255]], [0.0, [202, 215, 255]], [0.3, [248, 247, 255]], [0.6, [255, 244, 232]], [1.0, [255, 221, 180]], [1.5, [255, 189, 111]], [2.0, [255, 150, 90]]];
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; const k = (t - a) / (b - a); return ca.map((c, j) => Math.round(c + (cb[j] - c) * k)); }
    return stops[stops.length - 1][1];
  }
  function sprite(rgb, soft) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const [r, gg, b] = rgb;
    if (soft) { gr.addColorStop(0, `rgba(${r},${gg},${b},0.9)`); gr.addColorStop(0.4, `rgba(${r},${gg},${b},0.35)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`); }
    else { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.32, `rgba(${r},${gg},${b},0.9)`); gr.addColorStop(0.55, `rgba(${r},${gg},${b},0.25)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`); }
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
  }

  let st = null;

  function css() {
    if ($('#skyCss')) return;
    const s = document.createElement('style'); s.id = 'skyCss';
    s.textContent = `
#sky{position:fixed;inset:0;z-index:9000;background:#02040c;color:#EAF0FF;font-family:inherit;touch-action:none;overscroll-behavior:none;user-select:none;-webkit-user-select:none}
#sky video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.9}
#sky canvas{position:absolute;inset:0;width:100%;height:100%}
#sky.red{filter:grayscale(1) sepia(1) saturate(3.2) hue-rotate(182deg) brightness(.78) contrast(1.12)}
#sky .skbar{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:6px;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 14px;background:linear-gradient(rgba(2,4,12,.94),rgba(2,4,12,.85) 70%,rgba(2,4,12,0))}
#sky .skt{flex:1;min-width:0}
#sky .skt b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--display,Georgia,serif);font-size:17px;font-weight:500;color:#F3D384;letter-spacing:.02em}
#sky .skt small{display:block;font-size:12px;color:#B9C6E4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#sky .skb{flex:none;width:36px;height:36px;border-radius:50%;border:1px solid rgba(243,211,132,.45);background:rgba(10,20,44,.6);color:#F3D384;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
#sky .skb.on{background:rgba(243,211,132,.25);border-color:#F3D384}
#sky .skfoot{position:absolute;left:0;right:0;bottom:0;padding:18px 10px calc(env(safe-area-inset-bottom,0px) + 12px);background:linear-gradient(rgba(2,4,12,0),rgba(2,4,12,.9) 28%,rgba(2,4,12,.96))}
#sky .skchips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
#sky .skchips::-webkit-scrollbar{display:none}
#sky .skchip{flex:none;padding:7px 12px;border-radius:999px;border:1px solid rgba(185,198,228,.35);background:rgba(10,20,44,.6);color:#EAF0FF;font:inherit;font-size:13px;cursor:pointer}
#sky .skchip.on{border-color:#F3D384;color:#F3D384;background:rgba(243,211,132,.15)}
#sky .skhint{margin:8px 4px 0;font-size:12.5px;line-height:1.45;color:#B9C6E4;text-align:center}
#sky .skhint button{font:inherit;color:#F3D384;background:none;border:0;text-decoration:underline;cursor:pointer;padding:0}
#sky .skcard{position:absolute;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 104px);max-width:460px;margin:0 auto;padding:14px 16px;border-radius:16px;border:1px solid rgba(243,211,132,.4);background:rgba(8,16,38,.92);box-shadow:0 10px 40px rgba(0,0,0,.5)}
#sky .skcard b{display:block;font-family:var(--display,Georgia,serif);font-size:20px;font-weight:500;color:#F3D384}
#sky .skcard p{margin:6px 0 0;font-size:13.5px;line-height:1.5;color:#DCE4F6}
#sky .skcard .x{position:absolute;right:10px;top:8px;background:none;border:0;color:#B9C6E4;font-size:22px;cursor:pointer}
#sky .skchip.find{border-color:rgba(243,211,132,.6);color:#F3D384}
#sky .sksearch{position:absolute;left:10px;right:10px;top:calc(env(safe-area-inset-top,0px) + 64px);max-width:520px;margin:0 auto;padding:10px;border-radius:16px;border:1px solid rgba(243,211,132,.45);background:rgba(6,12,30,.96);box-shadow:0 12px 40px rgba(0,0,0,.55);touch-action:auto}
#sky .skin{display:flex;gap:8px;align-items:center}
#sky .sksearch input{flex:1;min-width:0;padding:11px 14px;border-radius:12px;border:1px solid rgba(185,198,228,.35);background:rgba(255,255,255,.06);color:#fff;font:inherit;font-size:16px;user-select:text;-webkit-user-select:text}
#sky .skres{touch-action:pan-y;display:flex;flex-direction:column;gap:2px;margin-top:6px;max-height:52vh;overflow-y:auto}
#sky .skr{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:10px;border:0;background:transparent;color:#EAF0FF;font:inherit;text-align:left;cursor:pointer}
#sky .skr:active,#sky .skr:hover{background:rgba(243,211,132,.12)}
#sky .skr b{font-weight:600;font-size:15px}
#sky .skr small{flex:none;font-size:12px;color:#9FB0D6}
#sky .skempty{margin:8px 6px;font-size:13px;color:#B9C6E4}
#sky .skcal{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border:1.5px solid rgba(243,211,132,.9);border-radius:50%;pointer-events:none}
#sky .skcal::before,#sky .skcal::after{content:'';position:absolute;background:rgba(243,211,132,.9)}
#sky .skcal::before{left:50%;top:-10px;bottom:-10px;width:1.5px;margin-left:-.75px}
#sky .skcal::after{top:50%;left:-10px;right:-10px;height:1.5px;margin-top:-.75px}
`;
    document.head.appendChild(s);
  }

  function prepare() {
    const D = window.SKY_DATA;
    const stars = D.stars.map(([ra, dec, mag, bv]) => ({ q: vecEq(ra, dec), mag, bv }));
    const cols = {};
    for (const s of stars) { const k = Math.round(clamp(s.bv, -0.4, 2) * 5) / 5; s.ck = k; if (!cols[k]) cols[k] = sprite(bvColor(k)); }
    const names = {}; for (const i in D.names) names[i] = D.names[i];
    const cons = D.cons.map(([id, name, ra, dec, rank]) => ({ id, name, q: vecEq(ra, dec), rank: +rank }));
    const lines = []; for (const id in D.lines) for (const seg of D.lines[id]) { const pts = seg.map(([ra, dec]) => vecEq(ra, dec)); for (let i = 1; i < pts.length; i++) lines.push([pts[i - 1], pts[i]]); }
    const mes = D.mes.map(([id, ra, dec, type, mag, cz]) => ({ id, q: vecEq(ra, dec), type, mag, cz }));
    const mw = D.mw.map(([ra, dec, l]) => ({ q: vecEq(ra, dec), l }));
    const conName = {}; for (const c of cons) conName[c.id] = c.name;
    return { stars, cols, names, cons, lines, mes, mw, conName, mwSprite: sprite([170, 190, 255], true), glow: {} };
  }
  function vecEq(raDeg, decDeg) { const r = raDeg * D2R, d = decDeg * D2R; return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)]; }

  // ---------- čas a poloha: přepočet do obzorníkových souřadnic ----------
  function recompute() {
    const t = new Date(); st.now = t;
    const time = A.MakeTime(t); const obs = new A.Observer(st.loc.lat, st.loc.lon, st.loc.alt || 0);
    const R = A.Rotation_EQJ_HOR(time, obs).rot;
    const toEnu = (q) => { const nx = R[0][0] * q[0] + R[1][0] * q[1] + R[2][0] * q[2], ny = R[0][1] * q[0] + R[1][1] * q[1] + R[2][1] * q[2], nz = R[0][2] * q[0] + R[1][2] * q[1] + R[2][2] * q[2]; return [-ny, nx, nz]; };
    const S = st.data;
    for (const s of S.stars) s.v = toEnu(s.q);
    for (const c of S.cons) c.v = toEnu(c.q);
    for (const l of S.lines) { l.a = toEnu(l[0]); l.b = toEnu(l[1]); }
    for (const m of S.mes) m.v = toEnu(m.q);
    for (const m of S.mw) m.v = toEnu(m.q);
    // ekliptika a znamení
    const RE = A.Rotation_ECL_HOR(time, obs).rot;
    const eclEnu = (lonDeg) => { const l = lonDeg * D2R, q = [Math.cos(l), Math.sin(l), 0]; const nx = RE[0][0] * q[0] + RE[1][0] * q[1] + RE[2][0] * q[2], ny = RE[0][1] * q[0] + RE[1][1] * q[1] + RE[2][1] * q[2], nz = RE[0][2] * q[0] + RE[1][2] * q[1] + RE[2][2] * q[2]; return [-ny, nx, nz]; };
    st.ecl = []; for (let l = 0; l <= 360; l += 3) st.ecl.push(eclEnu(l));
    st.signs = SIGNS.map((g, i) => ({ g, v: eclEnu(i * 30 + 15) }));
    // planety, Slunce, Luna
    st.bodies = BODIES.map(([id, cz, col]) => {
      try {
        const eq = A.Equator(id, time, obs, true, true); const hor = A.Horizon(time, obs, eq.ra, eq.dec, 'normal');
        const v = enuFromAzAlt(hor.azimuth * D2R, hor.altitude * D2R);
        let mag = null; try { mag = A.Illumination(id, time).mag; } catch (e) { }
        const elon = A.EclipticLongitude ? (() => { try { return id === 'Moon' ? A.EclipticGeoMoon(time).lon : A.Ecliptic(A.GeoVector(id, time, true)).elon; } catch (e) { return null; } })() : null;
        return { id, cz, col, v, mag, dist: eq.dist, alt: hor.altitude, elon };
      } catch (e) { return null; }
    }).filter(Boolean);
    try { st.moonPhase = A.MoonPhase(time); st.moonFrac = A.Illumination('Moon', time).phase_fraction; } catch (e) { }
    const sun = st.bodies.find(b => b.id === 'Sun'); st.sunAlt = sun ? sun.alt : -30;
    st.lastCalc = Date.now();
  }

  // ---------- natočení telefonu ----------
  function rotMatrix(a, b, g) {
    const x = b * D2R, y = g * D2R, z = a * D2R;
    const cX = Math.cos(x), cY = Math.cos(y), cZ = Math.cos(z), sX = Math.sin(x), sY = Math.sin(y), sZ = Math.sin(z);
    return [[cZ * cY - sZ * sX * sY, -cX * sZ, cY * sZ * sX + cZ * sY], [cY * sZ + cZ * sX * sY, cZ * cX, sZ * sY - cZ * cY * sX], [-cX * sY, sX, cX * cY]];
  }
  function onOrient(e) {
    if (!st || e.alpha == null || e.beta == null) return;
    if (e.type === 'deviceorientation' && st.absEvents && e.webkitCompassHeading == null) return;
    if (e.type === 'deviceorientationabsolute') st.absEvents = true;
    let alpha = e.alpha;
    if (e.webkitCompassHeading != null && !isNaN(e.webkitCompassHeading)) {
      let off = (360 - e.webkitCompassHeading) - e.alpha; off = ((off % 360) + 540) % 360 - 180;
      st.iosOff = st.iosOff == null ? off : st.iosOff + 0.1 * ((((off - st.iosOff) % 360) + 540) % 360 - 180);
      alpha = e.alpha + st.iosOff;
    } else if (e.type === 'deviceorientation' && !e.absolute) { st.relOnly = true; }
    const M = rotMatrix(alpha, e.beta, e.gamma || 0);
    let r = [M[0][0], M[1][0], M[2][0]], u = [M[0][1], M[1][1], M[2][1]]; const f = [-M[0][2], -M[1][2], -M[2][2]];
    const ang = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * D2R;
    if (ang) { const c = Math.cos(ang), s = Math.sin(ang); const u2 = [u[0] * c + r[0] * s, u[1] * c + r[1] * s, u[2] * c + r[2] * s]; const r2 = [r[0] * c - u[0] * s, r[1] * c - u[1] * s, r[2] * c - u[2] * s]; u = u2; r = r2; }
    st.sensorAt = Date.now();
    if (st.mode !== 'sensor') { if (st.mode === 'auto') { st.mode = 'sensor'; updUi(); } else return; }
    const k = st.smoothF == null ? 1 : 0.22;
    st.smoothF = st.smoothF ? norm(st.smoothF.map((x, i) => x + (f[i] - x) * k)) : f;
    st.smoothU = st.smoothU ? norm(st.smoothU.map((x, i) => x + (u[i] - x) * k)) : u;
  }
  function magDecl(lat, lon) { return (lat > 34 && lat < 72 && lon > -12 && lon < 42) ? 0.3 * lon - 0.5 : 0; } // hrubý odhad deklinace pro Evropu

  function viewBasis() {
    let f, u;
    if (st.mode === 'sensor' && st.smoothF) {
      const rot = (st.azOff + magDecl(st.loc.lat, st.loc.lon)) * D2R; const c = Math.cos(rot), s = Math.sin(rot);
      const rz = (v) => [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]];
      f = rz(st.smoothF); u = rz(st.smoothU);
    } else {
      f = enuFromAzAlt(st.vAz, st.vAlt);
      const up = [0, 0, 1]; let r0 = cross(f, up); if (Math.hypot(...r0) < 1e-6) r0 = [1, 0, 0]; r0 = norm(r0); u = norm(cross(r0, f));
    }
    const r = norm(cross(f, u)); u = norm(cross(r, f));
    return { f, u, r };
  }

  // ---------- kreslení ----------
  function draw() {
    if (!st) return;
    st.raf = requestAnimationFrame(draw);
    if (Date.now() - st.lastCalc > 4000) recompute();
    const cv = st.cv, g = st.g, W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { f, u, r } = viewBasis(); st.basis = { f, u, r };
    const fov = st.fov * D2R; const fp = (H / 2) / Math.tan(fov / 2); // svislé zorné pole
    const cx = W / 2, cy = H / 2; const cosLim = Math.cos(Math.min(1.45, Math.atan(Math.hypot(W, H) / 2 / fp) + 0.05));
    const P = (v) => { const z = dot(v, f); if (z < 0.05) return null; return [cx + dot(v, r) / z * fp, cy - dot(v, u) / z * fp, z]; };
    const onScreen = (p, m) => p && p[0] > -m && p[0] < W + m && p[1] > -m && p[1] < H + m;
    st.P = P; st.hits = []; const LB = [];
    const topSafe = ($('#sky .skbar') || {}).offsetHeight || 64, botSafe = H - (($('#sky .skfoot') || {}).offsetHeight || 110);
    // pozadí
    g.globalCompositeOperation = 'source-over';
    if (st.cam) g.clearRect(0, 0, W, H);
    else {
      const day = st.red ? 0 : clamp((st.sunAlt + 12) / 18, 0, 1) * 0.55;
      const zen = P([0, 0, 1]); const gy = zen ? zen[1] : cy - H;
      const grd = g.createLinearGradient(0, gy, 0, gy + H * 1.6);
      grd.addColorStop(0, st.red ? '#000' : day > 0 ? `rgb(${Math.round(3 + 30 * day)},${Math.round(6 + 60 * day)},${Math.round(26 + 110 * day)})` : '#03061a');
      grd.addColorStop(1, st.red ? '#050000' : day > 0 ? `rgb(${Math.round(11 + 40 * day)},${Math.round(22 + 80 * day)},${Math.round(56 + 120 * day)})` : '#0b1638');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    }
    // zem pod obzorem
    {
      const a0 = azAltFromEnu(f)[0] * R2D + 180; const hp = []; for (let a = a0; a <= a0 + 360; a += 2) { const p = P(enuFromAzAlt(a * D2R, 0)); if (p && onScreen(p, W)) hp.push(p); else if (hp.length) break; }
      g.fillStyle = st.cam ? 'rgba(2,6,14,.18)' : st.red ? 'rgba(0,0,0,.7)' : 'rgba(3,8,18,.62)';
      if (hp.length >= 2) {
        const a = hp[0], b = hp[hp.length - 1]; let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const [caz] = azAltFromEnu(f); const gp = P(enuFromAzAlt(caz, -25 * D2R)) || [cx, H * 2];
        let nx = -dy, ny = dx; if ((gp[0] - a[0]) * nx + (gp[1] - a[1]) * ny < 0) { nx = -nx; ny = -ny; }
        const F = 4000; g.beginPath(); g.moveTo(a[0] - dx * F, a[1] - dy * F); for (const p of hp) g.lineTo(p[0], p[1]); g.lineTo(b[0] + dx * F, b[1] + dy * F); g.lineTo(b[0] + dx * F + nx * F, b[1] + dy * F + ny * F); g.lineTo(a[0] - dx * F + nx * F, a[1] - dy * F + ny * F); g.closePath(); g.fill();
      } else if (f[2] < 0) g.fillRect(0, 0, W, H);
    }
    const dim = st.cam || st.red ? 1 : 1 - clamp((st.sunAlt + 8) / 14, 0, 0.6);
    const zoom = clamp(70 / st.fov, 0.6, 4);
    // Mléčná dráha
    if (!st.cam || st.sunAlt < -6) {
      g.globalCompositeOperation = 'lighter';
      const sz = 3.6 * D2R * fp;
      for (const m of st.data.mw) { if (dot(m.v, f) < cosLim) continue; const p = P(m.v); if (!onScreen(p, sz)) continue; const below = m.v[2] < 0 ? 0.35 : 1; g.globalAlpha = (0.022 + 0.02 * m.l) * dim * below; g.drawImage(st.data.mwSprite, p[0] - sz, p[1] - sz, sz * 2, sz * 2); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // čáry souhvězdí
    if (st.showLines) {
      g.lineWidth = 1; g.strokeStyle = `rgba(150,178,255,${st.cam ? 0.55 : 0.34})`; g.beginPath();
      for (const l of st.data.lines) { if (dot(l.a, f) < cosLim - 0.3) continue; const a = P(l.a), b = P(l.b); if (!a || !b) continue; if (!onScreen(a, W) && !onScreen(b, W)) continue; const sh = 0.12 / (1 + 0 * a[2]); const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; const k = Math.min(6, L * sh); g.moveTo(a[0] + dx / L * k, a[1] + dy / L * k); g.lineTo(b[0] - dx / L * k, b[1] - dy / L * k); }
      g.stroke();
    }
    // ekliptika
    g.setLineDash([5, 6]); g.strokeStyle = 'rgba(243,211,132,.55)'; g.lineWidth = 1.2; g.beginPath(); let pen = false;
    for (const v of st.ecl) { const p = P(v); if (!p) { pen = false; continue; } if (pen) g.lineTo(p[0], p[1]); else { g.moveTo(p[0], p[1]); pen = true; } }
    g.stroke(); g.setLineDash([]);
    g.font = '600 15px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(243,211,132,.8)';
    for (const s of st.signs) { const p = P(s.v); if (onScreen(p, 0)) LB.push({ t: s.g + '\uFE0E', x: p[0], y: p[1] - 13, font: '600 16px system-ui,sans-serif', col: '#F3D384', al: 'center', pr: 55 }); }
    // obzor
    g.strokeStyle = 'rgba(126,232,196,.7)'; g.lineWidth = 1.5; g.beginPath(); pen = false;
    for (let a = 0; a <= 360; a += 2) { const p = P(enuFromAzAlt(a * D2R, 0)); if (!p) { pen = false; continue; } if (pen) g.lineTo(p[0], p[1]); else { g.moveTo(p[0], p[1]); pen = true; } }
    g.stroke();
    g.font = '700 14px system-ui,sans-serif'; g.fillStyle = '#7EE8C4';
    for (const [lab, a] of DIRS) { const p = P(enuFromAzAlt(a * D2R, 0)); if (onScreen(p, 0)) LB.push({ t: lab, x: p[0], y: p[1] + 15, font: '700 15px system-ui,sans-serif', col: '#7EE8C4', al: 'center', pr: 90 }); }
    const nad = P([0, 0, 1]); if (onScreen(nad, 0)) LB.push({ t: 'zenit', x: nad[0], y: nad[1] + 12, font: '12px system-ui,sans-serif', col: '#B9C6E4', al: 'center', pr: 10 });
    // názvy souhvězdí
    g.font = `500 ${Math.round(11 + 1.5 * zoom)}px system-ui,sans-serif`; g.fillStyle = `rgba(170,190,255,${st.cam ? 0.8 : 0.55})`;
    for (const c of st.data.cons) { if (c.rank > (st.fov < 45 ? 3 : 2)) continue; const p = P(c.v); if (!onScreen(p, 0)) continue; LB.push({ t: c.name.toUpperCase(), x: p[0], y: p[1], font: `600 ${Math.round(11 + 1.5 * zoom)}px system-ui,sans-serif`, col: '#AFC3FF', al: 'center', pr: 45, alts: [0, 18, -18, 34] }); st.hits.push({ p, k: 'con', o: c, w: 0.6 }); }
    // hvězdy
    const magLim = clamp(4.6 + 1.6 * Math.log2(zoom) + (st.cam ? -0.6 : 0) - (1 - dim) * 3, 2, 6.5);
    for (let i = 0; i < st.data.stars.length; i++) {
      const s = st.data.stars[i]; if (s.mag > magLim) break; if (dot(s.v, f) < cosLim) continue; const p = P(s.v); if (!onScreen(p, 4)) continue;
      const rad = clamp((magLim + 1.5 - s.mag) * 2.3 * Math.sqrt(zoom), 2.4, 34); const below = s.v[2] < 0 ? 0.3 : 1;
      g.globalAlpha = clamp(0.5 + (magLim - s.mag) * 0.25, 0.5, 1) * below * (0.6 + 0.4 * dim);
      g.drawImage(st.data.cols[s.ck], p[0] - rad, p[1] - rad, rad * 2, rad * 2);
      st.hits.push({ p, k: 'star', o: s, i, w: s.mag < 2 ? 2 : 1 });
    }
    g.globalAlpha = 1;
    // jména hvězd
    g.font = `${Math.round(12 + zoom)}px system-ui,sans-serif`; g.textAlign = 'left'; g.fillStyle = 'rgba(234,240,255,.82)';
    for (const i in st.data.names) { const s = st.data.stars[i]; if (s.mag > (st.fov < 40 ? 3.6 : st.fov < 70 ? 2.2 : 1.6)) continue; const p = P(s.v); if (!onScreen(p, 0)) continue; LB.push({ t: st.data.names[i][0], x: p[0] + 8, y: p[1] - 8, font: `500 ${Math.round(13 + zoom)}px system-ui,sans-serif`, col: '#F2F5FF', al: 'left', pr: 80 - s.mag * 5 }); }
    // Messier
    g.textAlign = 'left';
    for (const m of st.data.mes) {
      if (m.mag > (st.fov < 40 ? 9.5 : st.fov < 70 ? 7 : 5.5)) continue; const p = P(m.v); if (!onScreen(p, 0)) continue;
      const gal = 'sei'.includes(m.type) && m.type.length === 1, clu = m.type === 'oc' || m.type === 'gc';
      g.strokeStyle = gal ? 'rgba(255,170,220,.85)' : clu ? 'rgba(255,230,150,.85)' : 'rgba(150,230,255,.85)'; g.lineWidth = 1.2; g.beginPath();
      if (gal) g.ellipse(p[0], p[1], 8, 4, -0.5, 0, Math.PI * 2); else if (clu) { g.setLineDash([2, 2]); g.arc(p[0], p[1], 6, 0, Math.PI * 2); } else g.rect(p[0] - 5, p[1] - 5, 10, 10);
      g.stroke(); g.setLineDash([]);
      LB.push({ t: m.cz && st.fov < 70 ? `${m.id} · ${m.cz}` : m.id, x: p[0] + 10, y: p[1], font: '500 12px system-ui,sans-serif', col: '#E4E9F8', al: 'left', pr: 35 - m.mag });
      st.hits.push({ p, k: 'mes', o: m, w: 1.5 });
    }
    // planety, Slunce, Luna
    for (const b of st.bodies) {
      const p = P(b.v); if (!onScreen(p, 30)) continue; const below = b.v[2] < 0 ? 0.45 : 1;
      if (b.id === 'Sun') { const R = 26; const gl = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], R * 3); gl.addColorStop(0, 'rgba(255,240,190,1)'); gl.addColorStop(0.25, 'rgba(255,216,107,.8)'); gl.addColorStop(1, 'rgba(255,216,107,0)'); g.globalAlpha = below; g.fillStyle = gl; g.beginPath(); g.arc(p[0], p[1], R * 3, 0, Math.PI * 2); g.fill(); }
      else if (b.id === 'Moon') { drawMoon(g, p, 13 * Math.sqrt(zoom), below); }
      else { const R = clamp(6 - (b.mag == null ? 5 : b.mag) * 0.7, 2.5, 7) * Math.sqrt(zoom); const gl = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], R * 3.2); gl.addColorStop(0, b.col); gl.addColorStop(0.3, b.col + 'AA'); gl.addColorStop(1, b.col + '00'); g.globalAlpha = below; g.fillStyle = gl; g.beginPath(); g.arc(p[0], p[1], R * 3.2, 0, Math.PI * 2); g.fill(); g.fillStyle = b.col; g.beginPath(); g.arc(p[0], p[1], R, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1; LB.push({ t: b.cz, x: p[0] + 14, y: p[1] - 13, font: '700 15px system-ui,sans-serif', col: b.col, al: 'left', pr: 100, force: true });
      st.hits.push({ p, k: 'body', o: b, w: 3 });
    }
    // popisky: nejdůležitější první, žádné překryvy, tmavý obrys pro čitelnost
    LB.sort((a, b) => b.pr - a.pr); const boxes = []; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const l of LB) {
      g.font = l.font; const w = g.measureText(l.t).width, h = parseInt(l.font.match(/(\d+)px/)[1], 10) + 2;
      const x0 = l.al === 'center' ? l.x - w / 2 : l.x; let bx = null;
      for (const dy of (l.alts || [0])) {
        const c = [x0 - 3, l.y + dy - h / 2 - 2, x0 + w + 3, l.y + dy + h / 2 + 2];
        if (!l.force && (c[1] < topSafe || c[3] > botSafe || c[0] < 2 || c[2] > W - 2)) continue;
        if (!l.force && boxes.some(b => c[0] < b[2] && c[2] > b[0] && c[1] < b[3] && c[3] > b[1])) continue;
        bx = c; l.y += dy; break;
      }
      if (!bx) continue;
      boxes.push(bx); g.textAlign = l.al;
      g.lineWidth = 4; g.strokeStyle = 'rgba(2,6,20,.82)'; g.strokeText(l.t, l.x, l.y); g.fillStyle = l.col; g.fillText(l.t, l.x, l.y);
    }
    // cíl mimo obrazovku: šipka na okraji
    const tb = targetObj();
    if (tb) {
      const p = P(tb.v); const inside = onScreen(p, -30);
      if (!inside) {
        let dx = dot(tb.v, r), dy = -dot(tb.v, u); if (dot(tb.v, f) < 0 && Math.hypot(dx, dy) < 0.15) { dx = 0; dy = 1; }
        const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const m = 46, t = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (botSafe - topSafe) / 2 / Math.abs(dy || 1e-6) - m); const my = (topSafe + botSafe) / 2; const ax = cx + dx * t, ay = my + dy * t;
        const pulse = 1 + 0.12 * Math.sin(Date.now() / 220);
        g.save(); g.translate(ax, ay); g.rotate(Math.atan2(dy, dx)); g.scale(pulse, pulse); g.shadowColor = 'rgba(243,211,132,.8)'; g.shadowBlur = 14; g.fillStyle = '#F3D384'; g.beginPath(); g.moveTo(22, 0); g.lineTo(-10, -14); g.lineTo(-3, 0); g.lineTo(-10, 14); g.closePath(); g.fill(); g.restore();
        const lab = tb.name + (tb.v[2] < 0 ? ' (pod obzorem)' : '');
        g.font = '700 14px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 4; g.strokeStyle = 'rgba(2,6,20,.85)'; g.strokeText(lab, clamp(ax - dx * 38, 70, W - 70), ay - dy * 38); g.fillStyle = '#F3D384'; g.fillText(lab, clamp(ax - dx * 38, 70, W - 70), ay - dy * 38);
        st.onTarget = false;
      } else {
        const R = 24 + 4 * Math.sin(Date.now() / 260); g.strokeStyle = '#F3D384'; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], R, 0, Math.PI * 2); g.stroke();
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.moveTo(p[0] + Math.cos(a) * (R + 4), p[1] + Math.sin(a) * (R + 4)); g.lineTo(p[0] + Math.cos(a) * (R + 12), p[1] + Math.sin(a) * (R + 12)); g.stroke(); }
        const centered = Math.hypot(p[0] - cx, p[1] - (topSafe + botSafe) / 2) < 60;
        if (centered && !st.onTarget && st.mode === 'sensor' && navigator.vibrate) { try { navigator.vibrate(35); } catch (e) { } }
        st.onTarget = centered;
      }
    }
    // zaměřovač pro kalibraci
    const cal = $('#sky .skcal'); if (cal) cal.style.display = st.calib ? '' : 'none';
    if (Date.now() - (st.clockAt || 0) > 20000) { st.clockAt = Date.now(); updHead(); }
  }
  function drawMoon(g, p, R, alpha) {
    const fr = st.moonFrac == null ? 0.5 : st.moonFrac; const waxing = (st.moonPhase || 0) < 180;
    g.save(); g.globalAlpha = alpha;
    const gl = g.createRadialGradient(p[0], p[1], R * 0.8, p[0], p[1], R * 3); gl.addColorStop(0, 'rgba(244,241,230,.35)'); gl.addColorStop(1, 'rgba(244,241,230,0)'); g.fillStyle = gl; g.beginPath(); g.arc(p[0], p[1], R * 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(60,66,90,.9)'; g.beginPath(); g.arc(p[0], p[1], R, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#F4F1E6'; g.beginPath();
    const s = waxing ? 1 : -1; const k = 1 - 2 * fr; // terminátor
    g.arc(p[0], p[1], R, -Math.PI / 2, Math.PI / 2, s < 0);
    g.ellipse(p[0], p[1], Math.abs(k) * R, R, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === (s > 0) ? true : false);
    g.fill(); g.restore();
  }

  // ---------- cíl a vyhledávání ----------
  const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function targetObj() {
    const t = st && st.target; if (!t) return null; const D = st.data;
    if (t.k === 'body') { const b = st.bodies.find(x => x.id === t.id); return b && { v: b.v, name: b.cz, h: { k: 'body', o: b } }; }
    if (t.k === 'star') { const o = D.stars[t.i]; return o && o.v && { v: o.v, name: (D.names[t.i] || ['Hvězda'])[0], h: { k: 'star', o, i: t.i } }; }
    if (t.k === 'con') { const o = D.cons.find(x => x.id === t.id); return o && { v: o.v, name: o.name, h: { k: 'con', o } }; }
    if (t.k === 'mes') { const o = D.mes.find(x => x.id === t.id); return o && { v: o.v, name: o.cz ? `${o.id} · ${o.cz}` : o.id, h: { k: 'mes', o } }; }
    return null;
  }
  function buildIndex() {
    const D = st.data, out = [];
    for (const [id, cz] of BODIES) out.push({ n: cz, sub: id === 'Sun' ? 'hvězda' : id === 'Moon' ? 'Měsíc' : 'planeta', t: { k: 'body', id } });
    for (const i in D.names) out.push({ n: D.names[i][0], sub: `hvězda${D.conName[D.names[i][1]] ? ' · ' + D.conName[D.names[i][1]] : ''}`, t: { k: 'star', i: +i } });
    for (const c of D.cons) out.push({ n: c.name, sub: 'souhvězdí', t: { k: 'con', id: c.id } });
    for (const m of D.mes) out.push({ n: m.cz ? `${m.id} · ${m.cz}` : m.id, sub: MTYPE[m.type] || 'objekt', t: { k: 'mes', id: m.id } });
    for (const e of out) e.f = fold(e.n);
    return out;
  }
  function search(q) {
    const f = fold(q); if (!f) return [];
    const idx = st.index || (st.index = buildIndex());
    const res = [];
    for (const e of idx) { const words = e.f.split(/[\s·]+/); const sc = e.f.startsWith(f) ? 3 : words.some(w => w.startsWith(f)) ? 2 : e.f.includes(f) ? 1 : 0; if (sc) res.push([sc, e]); }
    return res.sort((a, b) => b[0] - a[0] || a[1].n.length - b[1].n.length).slice(0, 8).map(x => x[1]);
  }
  function setTarget(t) {
    st.target = t; const tb = targetObj(); card(null);
    if (tb) {
      if (st.mode !== 'sensor') { const [az, alt] = azAltFromEnu(tb.v); st.vAz = az; st.vAlt = clamp(alt, -0.3, 1.5); if (t.k === 'con' && st.fov < 60) st.fov = 70; }
      info(tb.h);
    }
    updUi();
  }
  function searchOpen(on) {
    const box = $('#sky .sksearch'); if (!box) return; box.style.display = on ? '' : 'none';
    if (on) { const inp = $('input', box); inp.value = ''; $('.skres', box).innerHTML = ''; setTimeout(() => inp.focus(), 30); }
  }
  function searchPaint(q) {
    const list = search(q); const box = $('#sky .skres'); if (!box) return;
    box.innerHTML = list.length ? list.map((e, k) => `<button class="skr" data-sk="pick" data-k="${k}"><b>${esc(e.n)}</b><small>${esc(e.sub)}</small></button>`).join('') : (fold(q) ? '<p class="skempty">Zkus jiný název — třeba Vega, Orion, Andromeda nebo M42.</p>' : '');
    st.results = list;
  }

  // ---------- rozhraní ----------
  function fmtTime(d) { return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }); }
  function updHead() { const h = $('#sky .skt small'); if (h) h.textContent = `${st.now.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })} ${fmtTime(st.now)} · ${st.loc.name || 'tvá poloha'}${st.gps ? ' · GPS' : ''}`; }
  function updUi() {
    const box = $('#sky'); if (!box) return;
    box.classList.toggle('red', !!st.red);
    for (const [act, on] of [['cam', st.cam], ['red', st.red], ['lines', st.showLines], ['calib', st.calib]]) { const b = $(`#sky [data-sk="${act}"]`); if (b) b.classList.toggle('on', !!on); }
    const hint = $('#sky .skhint');
    if (hint) {
      if (st.calib) hint.innerHTML = 'Namiř zaměřovač na Lunu, jasnou planetu nebo hvězdu a klepni na <button data-sk="calibOk">srovnat</button>.';
      else if (st.needPerm) hint.innerHTML = '<button data-sk="perm">Povolit pohybové senzory</button> — pak stačí namířit telefon na oblohu.';
      else if (st.mode === 'sensor') hint.textContent = st.sunAlt > -6 ? 'Je den — hvězdy svítí dál, jen je Slunce přezáří. Mapa ukazuje, co nad tebou právě je.' : 'Namiř telefon na oblohu. Klepnutím na objekt se dozvíš víc.';
      else hint.innerHTML = 'Posouvej oblohu prstem, dvěma prsty přibližuj. ' + (st.sensorOk ? '<button data-sk="sensor">Řídit telefonem</button>' : '');
    }
    for (const c of document.querySelectorAll('#sky .skchip[data-t]')) c.classList.toggle('on', !!(st.target && st.target.k === 'body' && st.target.id === c.dataset.t));
  }
  function card(html) { const c = $('#sky .skcard'); if (!c) return; if (!html) { c.style.display = 'none'; return; } c.innerHTML = `<button class="x" data-sk="cardx" aria-label="Zavřít">×</button>${html}`; c.style.display = ''; }
  function signOf(lon) { return lon == null ? '' : SIGN_LOC[Math.floor((((lon % 360) + 360) % 360) / 30)]; }
  function riseSet(id) {
    try {
      const obs = new A.Observer(st.loc.lat, st.loc.lon, st.loc.alt || 0); const t0 = A.MakeTime(new Date(Date.now() - 12 * 3600e3));
      const rise = A.SearchRiseSet(id, obs, +1, t0, 2), set = A.SearchRiseSet(id, obs, -1, t0, 2);
      const pick = (x) => x ? x.date : null; return [pick(rise), pick(set)];
    } catch (e) { return [null, null]; }
  }
  function info(h) {
    const o = h.o; const [az, alt] = azAltFromEnu(o.v); const dir = DIRS[Math.round(((az * R2D + 360) % 360) / 45) % 8][0];
    const pos = `${alt >= 0 ? `${Math.round(alt * R2D)}° nad obzorem` : `${Math.round(-alt * R2D)}° pod obzorem`}, směr ${dir}`;
    if (h.k === 'body') {
      const [ri, se] = riseSet(o.id); const rs = [ri && `vychází ${fmtTime(ri)}`, se && `zapadá ${fmtTime(se)}`].filter(Boolean).join(' · ');
      const dist = o.id === 'Moon' ? `${Math.round(o.dist * 149597.87) * 1000} km` : `${o.dist.toFixed(2)} AU (${Math.round(o.dist * 8.317)} světelných minut)`;
      const extra = o.id === 'Moon' && st.moonFrac != null ? ` · osvětlení ${Math.round(st.moonFrac * 100)} %` : '';
      card(`<b>${esc(o.cz)} ${esc(signOf(o.elon))}</b><p>${pos}${o.mag != null && o.id !== 'Sun' ? ` · jasnost ${o.mag.toFixed(1)} mag` : ''}${extra}</p><p>Vzdálenost ${dist}${rs ? `<br>${rs}` : ''}</p>`);
    } else if (h.k === 'star') {
      const nm = st.data.names[h.i]; const con = nm && st.data.conName[nm[1]];
      card(`<b>${esc(nm ? nm[0] : 'Hvězda')}</b><p>${pos} · jasnost ${o.mag.toFixed(1)} mag${con ? ` · souhvězdí ${esc(con)}` : ''}</p><p>${o.bv < 0 ? 'Horká modrobílá hvězda.' : o.bv < 0.5 ? 'Bílá hvězda.' : o.bv < 1 ? 'Žlutá hvězda, příbuzná našemu Slunci.' : o.bv < 1.5 ? 'Oranžová hvězda.' : 'Chladná červená hvězda.'}</p>`);
    } else if (h.k === 'mes') {
      card(`<b>${esc(o.id)}${o.cz ? ` · ${esc(o.cz)}` : ''}</b><p>${esc(MTYPE[o.type] || 'objekt hlubokého vesmíru')} · jasnost ${o.mag} mag</p><p>${pos}${o.mag > 6 ? ' · dalekohled nebo triedr ho ukáže' : ' · za tmavé noci i pouhým okem'}</p>`);
    } else if (h.k === 'con') card(`<b>${esc(o.name)}</b><p>souhvězdí · ${pos}</p>`);
  }
  function tapAt(x, y) {
    if (st.calib) return;
    let best = null, bd = 34;
    for (const h of st.hits || []) { const d = Math.hypot(h.p[0] - x, h.p[1] - y) / (h.w || 1); if (d < bd) { bd = d; best = h; } }
    if (best) info(best); else card(null);
  }
  function calibrate() {
    const { f } = st.basis; let best = null, bd = 0.97; // do ~14°
    const cands = st.bodies.filter(b => b.id !== 'Sun' || st.sunAlt > 0).map(b => b.v).concat(st.data.stars.filter(s => s.mag < 1.6).map(s => s.v));
    for (const v of cands) { const d = dot(v, f); if (d > bd) { bd = d; best = v; } }
    if (!best) { st.toast('Namiř zaměřovač blíž k Luně, planetě nebo jasné hvězdě.'); return; }
    const [az1] = azAltFromEnu(best), [az0] = azAltFromEnu(f);
    let d = (az1 - az0) * R2D; d = ((d % 360) + 540) % 360 - 180;
    st.azOff += d; st.calib = false; updUi(); st.toast(`Srovnáno o ${Math.round(Math.abs(d))}°.`);
  }

  async function askPerm() {
    try { const r = await DeviceOrientationEvent.requestPermission(); if (r === 'granted') { st.needPerm = false; st.mode = 'auto'; bindSensors(); } } catch (e) { }
    updUi();
  }
  function bindSensors() {
    if (st.bound) return; st.bound = true;
    if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOrient);
    window.addEventListener('deviceorientation', onOrient);
    setTimeout(() => { if (st && !st.sensorAt && st.mode === 'auto') { st.mode = 'drag'; updUi(); } else if (st) { st.sensorOk = !!st.sensorAt; } }, 1600);
  }
  async function camToggle() {
    if (st.cam) { stopCam(); st.cam = false; st.fov = 70; updUi(); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      st.stream = s; const v = $('#sky video'); v.srcObject = s; v.style.display = ''; await v.play().catch(() => { });
      st.cam = true; st.fov = 62; st.red = false; updUi();
    } catch (e) { st.toast('Kameru se nepodařilo zapnout — obloha jede dál na tmavém pozadí.'); }
  }
  function stopCam() { if (st && st.stream) { st.stream.getTracks().forEach(t => t.stop()); st.stream = null; } const v = $('#sky video'); if (v) { v.srcObject = null; v.style.display = 'none'; } }

  function close(fromPop) {
    if (!st) return;
    cancelAnimationFrame(st.raf); stopCam();
    window.removeEventListener('deviceorientationabsolute', onOrient); window.removeEventListener('deviceorientation', onOrient);
    window.removeEventListener('popstate', st.onPop);
    const box = $('#sky'); if (box) box.remove();
    document.documentElement.style.overflow = st.prevOverflow || '';
    st = null;
    if (!fromPop && history.state && history.state.sky) history.back();
  }

  function open(opts) {
    if (st) return;
    if (!window.SKY_DATA || !A) return;
    css();
    const box = document.createElement('div'); box.id = 'sky';
    box.innerHTML = `<video playsinline muted style="display:none"></video><canvas></canvas><div class="skcal" style="display:none"></div>
      <div class="skbar"><button class="skb" data-sk="close" aria-label="Zavřít">×</button><div class="skt"><b>Hvězdné nebe teď</b><small></small></div>
        <button class="skb" data-sk="cam" aria-label="Kamera" title="Kamera">◉</button><button class="skb" data-sk="lines" aria-label="Čáry souhvězdí" title="Čáry souhvězdí">✧</button><button class="skb" data-sk="red" aria-label="Noční tmavý režim" title="Noční tmavý režim">◐</button><button class="skb" data-sk="calib" aria-label="Srovnat směr" title="Srovnat směr">⌖</button></div>
      <div class="skcard" style="display:none"></div>
      <div class="sksearch" style="display:none"><div class="skin"><input type="search" placeholder="Hvězda, souhvězdí, planeta, galaxie…" autocomplete="off" enterkeyhint="search"><button class="skb" data-sk="findx" aria-label="Zavřít hledání">×</button></div><div class="skres"></div></div>
      <div class="skfoot"><div class="skchips"><button class="skchip find" data-sk="find">⌕ Hledat</button>${BODIES.filter(b => b[0] !== 'Pluto').map(([id, cz]) => `<button class="skchip" data-sk="target" data-t="${id}">${cz}</button>`).join('')}</div><p class="skhint"></p></div>`;
    document.body.appendChild(box);
    st = { loc: { lat: +opts.lat, lon: +opts.lon, alt: +opts.alt || 0, name: opts.name || '' }, data: window.__skyPrepared || (window.__skyPrepared = prepare()),
      cv: $('canvas', box), fov: 70, vAz: 180 * D2R, vAlt: 26 * D2R, azOff: 0, mode: 'auto', showLines: true, toast: opts.toast || ((m) => console.log(m)), prevOverflow: document.documentElement.style.overflow };
    st.g = st.cv.getContext('2d');
    document.documentElement.style.overflow = 'hidden';
    recompute(); updHead();
    // senzory: iPhone chce povolení klepnutím
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') { st.needPerm = true; st.mode = 'drag'; }
    else if ('DeviceOrientationEvent' in window) bindSensors(); else st.mode = 'drag';
    // přesná poloha z GPS
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => { if (!st) return; st.loc.lat = p.coords.latitude; st.loc.lon = p.coords.longitude; if (p.coords.altitude) st.loc.alt = p.coords.altitude; st.gps = true; recompute(); updHead(); }, () => { }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    // ovládání
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sk]'); if (!b) return; const a = b.dataset.sk; e.stopPropagation();
      if (a === 'close') close(); else if (a === 'cam') camToggle(); else if (a === 'red') { st.red = !st.red; updUi(); }
      else if (a === 'lines') { st.showLines = !st.showLines; updUi(); }
      else if (a === 'calib') { if (st.mode !== 'sensor') { st.toast('Srovnání funguje, když obloze vládne telefon.'); return; } st.calib = !st.calib; card(null); updUi(); }
      else if (a === 'calibOk') calibrate();
      else if (a === 'perm') askPerm();
      else if (a === 'sensor') { st.mode = 'sensor'; st.smoothF = null; updUi(); }
      else if (a === 'cardx') card(null);
      else if (a === 'target') { const id = b.dataset.t; if (st.target && st.target.k === 'body' && st.target.id === id) { st.target = null; card(null); updUi(); } else setTarget({ k: 'body', id }); }
      else if (a === 'find') { card(null); searchOpen(true); }
      else if (a === 'findx') searchOpen(false);
      else if (a === 'pick') { const e = (st.results || [])[+b.dataset.k]; if (e) { searchOpen(false); setTarget(e.t); } }
    });
    // posun prstem, přiblížení
    const pts = new Map(); let pinch0 = null, moved = false, down = null;
    st.cv.addEventListener('pointerdown', (e) => { st.cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = false; down = [e.clientX, e.clientY]; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = [Math.hypot(a[0] - b[0], a[1] - b[1]), st.fov]; } });
    st.cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); st.fov = clamp(pinch0[1] * pinch0[0] / (d || 1), 15, 110); moved = true; return; }
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1]; if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) moved = true;
      if (st.mode === 'sensor') return;
      const k = (st.fov * D2R) / st.cv.clientHeight; st.vAz -= dx * k / Math.max(0.2, Math.cos(st.vAlt)); st.vAlt = clamp(st.vAlt + dy * k, -0.5, 1.55);
    });
    const up = (e) => { if (pts.has(e.pointerId)) { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; if (!moved && e.type === 'pointerup') { const rc = st.cv.getBoundingClientRect(); tapAt(e.clientX - rc.left, e.clientY - rc.top); } } };
    st.cv.addEventListener('pointerup', up); st.cv.addEventListener('pointercancel', up);
    st.cv.addEventListener('wheel', (e) => { e.preventDefault(); st.fov = clamp(st.fov * (e.deltaY > 0 ? 1.1 : 0.9), 15, 110); }, { passive: false });
    // tlačítko Zpět v telefonu zavře oblohu
    st.onPop = () => close(true); history.pushState({ sky: 1 }, ''); window.addEventListener('popstate', st.onPop);
    if (opts.target) st.target = typeof opts.target === 'string' ? { k: 'body', id: opts.target } : opts.target;
    const inp = $('#sky .sksearch input'); inp.addEventListener('input', () => searchPaint(inp.value)); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && st.results && st.results[0]) { searchOpen(false); setTarget(st.results[0].t); } });
    updUi(); draw();
  }

  window.SkyNow = { open, close };
})();
