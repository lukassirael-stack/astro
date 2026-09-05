// Komety automaticky: seznam pozorovatelných komet z Minor Planet Center (dráhové prvky),
// hrubý odhad jasnosti, a pro ty jasné efemeridy z JPL Horizons (RA/Dec, jasnost, elongace)
// na 120 dní dopředu. Výsledek se drží v cache 6 hodin. Volá se jako /api/comets
const MPC = 'https://minorplanetcenter.net/iau/Ephemerides/Comets/Soft00Cmt.txt';
const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const DAYS = 120, MAX_MAG = 9.5, MAX_COMETS = 12;

function jd(y, m, d) { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045 - 0.5; }
// heliocentrická vzdálenost z prvků (elipsa, parabola, hyperbola)
function helioR(q, e, Tjd, tjd) {
  const k = 0.01720209895; const dt = tjd - Tjd;
  if (Math.abs(e - 1) < 1e-6) { // parabola (Barker)
    const W = 1.5 * k * dt / Math.sqrt(2 * q * q * q); const s = Math.cbrt(W + Math.sqrt(W * W + 1)); const tanv2 = s - 1 / s; return q * (1 + tanv2 * tanv2);
  }
  if (e < 1) {
    const a = q / (1 - e); const n = k / Math.pow(a, 1.5); let M = n * dt; M = M % (2 * Math.PI); let E = M; for (let i = 0; i < 60; i++) { const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-10) break; } return a * (1 - e * Math.cos(E));
  }
  const a = q / (e - 1); const n = k / Math.pow(a, 1.5); const M = n * dt; let H = Math.sign(M) * Math.log(2 * Math.abs(M) / e + 1.8); for (let i = 0; i < 60; i++) { const dH = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1); H -= dH; if (Math.abs(dH) < 1e-10) break; } return a * (e * Math.cosh(H) - 1);
}
function parseMPC(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (line.length < 100) continue;
    try {
      const num = line.slice(0, 4).trim(), type = line[4], prov = line.slice(5, 12).trim();
      const py = +line.slice(14, 18), pm = +line.slice(19, 21), pd = +line.slice(22, 29);
      const q = +line.slice(30, 39), e = +line.slice(40, 48);
      const H = +line.slice(91, 95), G = +line.slice(96, 100);
      const name = line.slice(102, 158).trim();
      if (!q || isNaN(py)) continue;
      // rozbalení označení: K23A030 -> 2023 A3 (C=století, YY, půlměsíc, číslo, fragment)
      let des;
      if (num) des = `${num}${type}`;
      else { const cent = { I: 18, J: 19, K: 20 }[prov[0]] || 20; const yr = cent * 100 + parseInt(prov.slice(1, 3), 10); const half = prov[3]; const nn = prov.slice(4, 6); const n = /^\d+$/.test(nn) ? parseInt(nn, 10) : (nn.charCodeAt(0) - 55) * 10 + parseInt(nn[1], 10); des = `${type}/${yr} ${half}${n}`; }
      out.push({ des, name, q, e, T: jd(py, pm, Math.floor(pd)) + (pd % 1), H: isNaN(H) ? 12 : H, G: isNaN(G) ? 4 : G });
    } catch (e) { }
  }
  return out;
}
async function horizons(des, start, stop) {
  const cmd = `'DES=${des};CAP;NOFRAG'`;
  const u = `${HORIZONS}?format=json&COMMAND=${encodeURIComponent(cmd)}&OBJ_DATA=NO&MAKE_EPHEM=YES&EPHEM_TYPE=OBSERVER&CENTER='500@399'&START_TIME='${start}'&STOP_TIME='${stop}'&STEP_SIZE='1 d'&QUANTITIES='1,9,23'&CSV_FORMAT=YES&ANG_FORMAT=DEG`;
  const r = await fetch(u); if (!r.ok) return null; const j = await r.json(); const res = j.result || '';
  const i = res.indexOf('$$SOE'), k = res.indexOf('$$EOE'); if (i < 0 || k < 0) return null;
  const rows = [];
  for (const line of res.slice(i + 5, k).trim().split('\n')) {
    const c = line.split(',').map(s => s.trim()); if (c.length < 8) continue;
    const date = c[0]; const ra = +c[3], dec = +c[4]; const mag = +c[5] || +c[6]; const elong = +c[7];
    if (isNaN(ra) || isNaN(dec)) continue;
    rows.push({ d: date.slice(0, 11).trim(), ra, dec, mag: isNaN(mag) ? null : +mag.toFixed(1), el: isNaN(elong) ? null : Math.round(elong) });
  }
  return rows;
}
let cache = { t: 0, data: null };
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
  try {
    if (cache.data && Date.now() - cache.t < 6 * 3600 * 1000) { res.status(200).send(JSON.stringify(cache.data)); return; }
    const txt = await (await fetch(MPC, { headers: { 'User-Agent': 'Nebesky kompas (oaza-adamanthea.cz)' } })).text();
    const all = parseMPC(txt);
    const now = new Date(); const tj = jd(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
    const cands = all.map(c => { try { const r = helioR(c.q, c.e, c.T, tj); const delta = Math.max(0.2, r - 0.8); const m = c.H + 5 * Math.log10(delta) + 2.5 * c.G * Math.log10(r); return { ...c, r: +r.toFixed(2), mEst: +m.toFixed(1) }; } catch (e) { return null; } })
      .filter(c => c && c.mEst <= MAX_MAG + 1.5).sort((a, b) => a.mEst - b.mEst).slice(0, MAX_COMETS);
    const start = now.toISOString().slice(0, 10), stop = new Date(now.getTime() + DAYS * 86400000).toISOString().slice(0, 10);
    const comets = [];
    for (const c of cands) { try { const eph = await horizons(c.des, start, stop); if (eph && eph.length) comets.push({ des: c.des, name: c.name, eph }); } catch (e) { } }
    cache = { t: Date.now(), data: { when: Date.now(), comets } };
    res.status(200).send(JSON.stringify(cache.data));
  } catch (e) { res.status(502).send(JSON.stringify({ error: 'komety nedostupné: ' + (e && e.message) })); }
};
