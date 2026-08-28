// Proxy pro tajnou iCal adresu Google kalendáře (prohlížeč ji přímo stáhnout nesmí kvůli CORS).
// Volá se jako /api/ics?url=<https adresa basic.ics z calendar.google.com>
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  let url = (req.query && req.query.url) || '';
  if (url.startsWith('webcal://')) url = 'https://' + url.slice(9);
  let host = '';
  try { host = new URL(url).hostname; } catch (e) { }
  if (!/^https:\/\//.test(url) || !/(^|\.)calendar\.google\.com$/.test(host)) {
    res.status(400).send('povolena je jen adresa z calendar.google.com'); return;
  }
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'NebeskyKompas/1.0' } });
    if (!r.ok) { res.status(502).send('upstream ' + r.status); return; }
    const text = await r.text();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).send(text);
  } catch (e) {
    res.status(502).send('fetch failed');
  }
};
