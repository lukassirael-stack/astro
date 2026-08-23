// Záložní proxy pro data NOAA SWPC (když prohlížeč zablokuje přímé stažení kvůli CORS).
// Volá se jako /api/noaa?src=kp | kpf | outlook
const SRC = {
  kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  kpf: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
  outlook: 'https://services.swpc.noaa.gov/text/27-day-outlook.txt',
};
module.exports = async (req, res) => {
  const url = SRC[(req.query && req.query.src) || ''];
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!url) { res.status(400).send('unknown src'); return; }
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'kairos.oaza-adamanthea.cz (Kairos PWA)' } });
    const text = await r.text();
    res.setHeader('Content-Type', url.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(r.ok ? 200 : r.status).send(text);
  } catch (e) {
    res.status(502).send('NOAA nedostupné: ' + (e && e.message));
  }
};
