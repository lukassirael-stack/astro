// Přiblížit — jak planeta (nebo Luna) vypadá dnes v dalekohledu.
// Kreslí kouli s reálnou mapou povrchu (NASA, volné dílo; Luna z three.js / NASA), osvětlenou ze skutečného
// směru Slunce, s pólem natočeným tak, jak ho z Země vidíme (sever nahoře, východ vlevo jako na obloze),
// se skutečnou fází, zdánlivou velikostí, u Saturnu s prstenci v aktuálním náklonu a u Jupiteru
// se čtyřmi velkými měsíci v poloze pro daný okamžik (astronomy-engine JupiterMoons).
// window.PlanetView.open({ id, time, toast }) — id = Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune|Moon
(function () {
  'use strict';
  const A = window.Astronomy;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI, AU_KM = 149597870.7;
  // poloměr (rovníkový, polární km), pól RA/Dec (°), otáčení W0 + rychlost (°/den) — IAU 2015, J2000
  const P = {
    Moon: { cz: 'Luna', re: 1737.4, rp: 1737.4, ra: 266.86, dec: 65.64, w0: 38.32, wd: 13.17635815, tex: 'tex-moon.webp', color: [0.86, 0.85, 0.82] },
    Mercury: { cz: 'Merkur', re: 2439.7, rp: 2439.7, ra: 281.01, dec: 61.45, w0: 329.55, wd: 6.1385, tex: 'tex-mercury.webp', color: [0.72, 0.70, 0.66] },
    Venus: { cz: 'Venuše', re: 6051.8, rp: 6051.8, ra: 272.76, dec: 67.16, w0: 160.20, wd: -1.4813, tex: null, color: [0.97, 0.93, 0.82] },
    Mars: { cz: 'Mars', re: 3396.2, rp: 3376.2, ra: 317.68, dec: 52.89, w0: 176.63, wd: 350.89198, tex: 'tex-mars.webp', color: [0.80, 0.50, 0.30] },
    Jupiter: { cz: 'Jupiter', re: 71492, rp: 66854, ra: 268.06, dec: 64.50, w0: 284.95, wd: 870.536, tex: 'tex-jupiter.webp', color: [0.85, 0.75, 0.60] },
    Saturn: { cz: 'Saturn', re: 60268, rp: 54364, ra: 40.59, dec: 83.54, w0: 38.90, wd: 810.7939, tex: 'tex-saturn.webp', color: [0.90, 0.82, 0.60], ring: true },
    Uranus: { cz: 'Uran', re: 25559, rp: 24973, ra: 257.31, dec: -15.18, w0: 203.81, wd: -501.16, tex: null, color: [0.62, 0.85, 0.90] },
    Neptune: { cz: 'Neptun', re: 24764, rp: 24341, ra: 299.36, dec: 43.46, w0: 253.18, wd: 536.3128, tex: 'tex-neptune.webp', color: [0.35, 0.50, 0.95] },
  };
  const MOONS = [['io', 'Io', 1821.6, [0.95, 0.90, 0.60]], ['europa', 'Europa', 1560.8, [0.90, 0.88, 0.82]], ['ganymede', 'Ganymed', 2634.1, [0.70, 0.66, 0.60]], ['callisto', 'Callisto', 2410.3, [0.50, 0.46, 0.42]]];
  const VEC = {
    norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; },
    cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
    dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    rot(v, axis, ang) { // Rodrigues
      const c = Math.cos(ang), s = Math.sin(ang), k = axis, d = VEC.dot(k, v), kx = VEC.cross(k, v);
      return [v[0] * c + kx[0] * s + k[0] * d * (1 - c), v[1] * c + kx[1] * s + k[1] * d * (1 - c), v[2] * c + kx[2] * s + k[2] * d * (1 - c)];
    },
  };
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CSS = `
#pview{position:fixed;inset:0;z-index:9500;background:#02050c;color:#EAF0FF;font-family:var(--sans,system-ui,sans-serif);display:flex;flex-direction:column;overflow:hidden}
#pview .pvbar{display:flex;align-items:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 8px}
#pview .pvx{width:40px;height:40px;border-radius:50%;border:1px solid rgba(243,211,132,.5);background:rgba(7,21,37,.7);color:#F3D384;font-size:22px;cursor:pointer;flex:none}
#pview .pvt b{display:block;font-family:var(--display,Georgia,serif);font-size:24px;font-weight:500;color:#F3D384;line-height:1.1}
#pview .pvt small{display:block;font-size:12px;color:#9FB0D6;margin-top:2px}
#pview .pveye{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:6px 16px}
#pview canvas{width:min(92vw,62vh,520px);height:min(92vw,62vh,520px);border-radius:50%;box-shadow:0 0 0 1px rgba(243,211,132,.35),0 0 60px rgba(60,90,160,.25),inset 0 0 80px rgba(0,0,0,.8);background:#000;touch-action:none}
#pview .pvinfo{padding:6px 18px calc(env(safe-area-inset-bottom,0px) + 18px);max-width:560px;margin:0 auto;width:100%}
#pview .pvinfo p{margin:4px 0;font-size:13.5px;line-height:1.5;color:#DCE4F6}
#pview .pvinfo p.k{color:#F3D384;font-size:12px;letter-spacing:.04em}
#pview .pvmoons{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
#pview .pvmoons span{font-size:12px;color:#B9C6E4;border:1px solid rgba(185,198,228,.25);border-radius:999px;padding:3px 9px}
#pview .pvnote{font-size:11.5px;color:#7F93BD;margin-top:8px}
`;

  // ---------- geometrie koule ----------
  function sphereMesh(nLat, nLon) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nLat; i++) {
      const phi = Math.PI / 2 - Math.PI * i / nLat; // +90 .. -90
      for (let j = 0; j <= nLon; j++) {
        const lam = 2 * Math.PI * j / nLon; // 0..2π
        pos.push(Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi));
        uv.push(j / nLon, i / nLat);
      }
    }
    for (let i = 0; i < nLat; i++) for (let j = 0; j < nLon; j++) {
      const a = i * (nLon + 1) + j, b = a + nLon + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return { pos: new Float32Array(pos), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
  }
  function ringMesh(r0, r1, n) {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= n; j++) {
      const t = 2 * Math.PI * j / n, c = Math.cos(t), s = Math.sin(t);
      pos.push(r0 * c, r0 * s, 0, r1 * c, r1 * s, 0); uv.push(0, 0, 1, 0);
    }
    for (let j = 0; j < n; j++) { const a = 2 * j; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    return { pos: new Float32Array(pos), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
  }

  const VS = `attribute vec3 aPos; attribute vec2 aUv; uniform mat3 uModel; uniform vec3 uFlat; uniform float uScale; uniform vec2 uOff;
    varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    void main(){ vec3 p = uModel * (aPos * uFlat); vP = p; vN = normalize(uModel * (aPos / uFlat)); vUv = aUv;
      gl_Position = vec4(p.xy * uScale + uOff, -p.z * 0.001, 1.0); }`;
  const FS_BODY = `precision mediump float; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    uniform sampler2D uTex; uniform float uHasTex; uniform vec3 uColor; uniform vec3 uLight; uniform float uGlow;
    void main(){ vec3 base = uHasTex > 0.5 ? texture2D(uTex, vUv).rgb : uColor;
      float d = dot(normalize(vN), uLight); float lit = smoothstep(-0.06, 0.12, d) * (0.25 + 0.75 * max(d, 0.0));
      lit = max(lit, 0.05); // popelavý svit
      vec3 c = base * lit; if (uGlow > 0.5) { float lim = pow(1.0 - abs(normalize(vN).z), 2.0); c += base * lim * 0.15; }
      gl_FragColor = vec4(c, 1.0); }`;
  // prstence Saturnu: barva a průhlednost podle poloměru (v poloměrech planety), stín planety
  const FS_RING = `precision mediump float; varying vec2 vUv; varying vec3 vP; uniform vec3 uLight; uniform vec3 uRingN; uniform vec2 uR;
    float band(float r, float a, float b, float s){ return smoothstep(a - s, a + s, r) * (1.0 - smoothstep(b - s, b + s, r)); }
    void main(){ float r = mix(uR.x, uR.y, vUv.x);
      float aC = band(r, 1.24, 1.525, 0.01) * 0.30; float aB = band(r, 1.525, 1.95, 0.008) * (0.95 - 0.25 * smoothstep(1.7, 1.95, r));
      float aA = band(r, 2.03, 2.27, 0.008) * 0.62 * (1.0 - 0.8 * band(r, 2.212, 2.222, 0.003)); float aCas = band(r, 1.95, 2.03, 0.006) * 0.08;
      float a = aC + aB + aA + aCas; if (a < 0.01) discard;
      vec3 col = mix(vec3(0.62, 0.58, 0.50), vec3(0.93, 0.88, 0.75), aB + aA * 0.8);
      float lit = abs(dot(uRingN, uLight)); lit = 0.15 + 0.85 * lit;
      float pl = dot(vP, uLight); float dd = dot(vP, vP) - pl * pl; float sh = (pl < 0.0 && dd < 1.0) ? 0.08 : 1.0;
      gl_FragColor = vec4(col * lit * sh, a); }`;

  function glProgram(gl, vs, fs) {
    const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p;
  }
  function buf(gl, data, target) { const b = gl.createBuffer(); gl.bindBuffer(target || gl.ARRAY_BUFFER, b); gl.bufferData(target || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }

  // ---------- astronomie: orientace, osvětlení, velikost ----------
  function geometry(id, date) {
    const t = A.MakeTime(date), p = P[id];
    const gv = A.GeoVector(id, t, true), sv = A.GeoVector('Sun', t, true);
    const pv = [gv.x, gv.y, gv.z], sun = [sv.x, sv.y, sv.z];
    const f = VEC.norm(pv);                     // směr k planetě (do obrazovky)
    const e = VEC.norm(VEC.cross([0, 0, 1], f)); // východ na obloze
    const n = VEC.cross(f, e);                  // sever na obloze
    const cam = (v) => [-VEC.dot(v, e), VEC.dot(v, n), -VEC.dot(v, f)]; // x doprava = západ, y nahoru = sever, z k pozorovateli
    const L = cam(VEC.norm(VEC.sub(sun, pv)));
    const pole = VEC.norm([Math.cos(p.dec * D2R) * Math.cos(p.ra * D2R), Math.cos(p.dec * D2R) * Math.sin(p.ra * D2R), Math.sin(p.dec * D2R)]);
    const node = VEC.norm(VEC.cross([0, 0, 1], pole));
    const d = (t.tt || t.ut) ; // dny od J2000
    const W = ((p.w0 + p.wd * d) % 360) * D2R;
    const mx = VEC.rot(node, pole, W), mz = pole, my = VEC.cross(mz, mx);
    const M = [cam(mx), cam(my), cam(mz)]; // sloupce modelové matice v kameře
    const dist = Math.hypot(pv[0], pv[1], pv[2]);
    const diamArc = 2 * Math.atan(p.re / (dist * AU_KM)) * R2D * 3600; // úhlové vteřiny
    let frac = 1, mag = null; try { const il = A.Illumination(id, t); frac = il.phase_fraction; mag = il.mag; } catch (e) { }
    let moons = null;
    if (id === 'Jupiter' && A.JupiterMoons) {
      try { const jm = A.JupiterMoons(t); moons = MOONS.map(([k, cz, rkm, col]) => { const s = jm[k]; const c = cam([s.x, s.y, s.z]); const rj = p.re / AU_KM; return { cz, col, r: rkm / p.re, x: c[0] / rj, y: c[1] / rj, z: c[2] / rj }; }); } catch (e) { }
    }
    return { M, L, flat: [1, 1, p.rp / p.re], dist, diamArc, frac, mag, moons, ringTilt: Math.asin(Math.abs(cam(pole)[2])) * R2D, elong: null };
  }

  // ---------- vykreslení ----------
  let st = null;
  function render() {
    if (!st) return; const { gl, g } = st, W = st.canvas.width;
    gl.viewport(0, 0, W, W); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    let ext = st.p.ring ? 2.27 : 1; if (g.moons) ext = Math.max(ext, Math.min(7, Math.max(...g.moons.map(m => Math.abs(m.x) * 1.08))));
    const scale = (0.84 / ext) * st.zoom;
    const Mf = new Float32Array([g.M[0][0], g.M[0][1], g.M[0][2], g.M[1][0], g.M[1][1], g.M[1][2], g.M[2][0], g.M[2][1], g.M[2][2]]);
    // planeta
    const pr = st.progBody; gl.useProgram(pr);
    gl.uniformMatrix3fv(gl.getUniformLocation(pr, 'uModel'), false, Mf);
    gl.uniform3fv(gl.getUniformLocation(pr, 'uFlat'), g.flat); gl.uniform1f(gl.getUniformLocation(pr, 'uScale'), scale); gl.uniform2f(gl.getUniformLocation(pr, 'uOff'), 0, 0);
    gl.uniform3fv(gl.getUniformLocation(pr, 'uLight'), g.L); gl.uniform3fv(gl.getUniformLocation(pr, 'uColor'), st.p.color);
    gl.uniform1f(gl.getUniformLocation(pr, 'uHasTex'), st.tex ? 1 : 0); gl.uniform1f(gl.getUniformLocation(pr, 'uGlow'), st.id === 'Venus' || st.id === 'Uranus' ? 1 : 0);
    if (st.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, st.tex); gl.uniform1i(gl.getUniformLocation(pr, 'uTex'), 0); }
    const bind = (mesh) => { gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb); const ap = gl.getAttribLocation(pr, 'aPos'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.ub); const au = gl.getAttribLocation(pr, 'aUv'); gl.enableVertexAttribArray(au); gl.vertexAttribPointer(au, 2, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); };
    bind(st.sphere); gl.drawElements(gl.TRIANGLES, st.sphere.n, gl.UNSIGNED_SHORT, 0);
    // měsíce Jupiteru (malé koule bez textury)
    if (g.moons) for (const m of g.moons) {
      if (Math.hypot(m.x, m.y) < 1 && m.z < 0) continue; // za planetou
      gl.uniform3fv(gl.getUniformLocation(pr, 'uFlat'), [1, 1, 1]); gl.uniform1f(gl.getUniformLocation(pr, 'uHasTex'), 0); gl.uniform1f(gl.getUniformLocation(pr, 'uGlow'), 0);
      gl.uniform3fv(gl.getUniformLocation(pr, 'uColor'), m.col);
      gl.uniform1f(gl.getUniformLocation(pr, 'uScale'), Math.max(scale * m.r, 0.013)); gl.uniform2f(gl.getUniformLocation(pr, 'uOff'), m.x * scale, m.y * scale);
      const front = Math.hypot(m.x, m.y) < 1.05 && m.z > 0; if (front) gl.disable(gl.DEPTH_TEST);
      gl.drawElements(gl.TRIANGLES, st.sphere.n, gl.UNSIGNED_SHORT, 0); if (front) gl.enable(gl.DEPTH_TEST);
    }
    // prstence
    if (st.p.ring) {
      const pq = st.progRing; gl.useProgram(pq); gl.disable(gl.CULL_FACE); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix3fv(gl.getUniformLocation(pq, 'uModel'), false, Mf); gl.uniform3fv(gl.getUniformLocation(pq, 'uFlat'), [1, 1, 1]);
      gl.uniform1f(gl.getUniformLocation(pq, 'uScale'), scale); gl.uniform2f(gl.getUniformLocation(pq, 'uOff'), 0, 0);
      gl.uniform3fv(gl.getUniformLocation(pq, 'uLight'), g.L); gl.uniform3fv(gl.getUniformLocation(pq, 'uRingN'), g.M[2]); gl.uniform2f(gl.getUniformLocation(pq, 'uR'), 1.2, 2.3);
      gl.bindBuffer(gl.ARRAY_BUFFER, st.ring.vb); let ap = gl.getAttribLocation(pq, 'aPos'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, st.ring.ub); const au = gl.getAttribLocation(pq, 'aUv'); gl.enableVertexAttribArray(au); gl.vertexAttribPointer(au, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, st.ring.ib); gl.drawElements(gl.TRIANGLES, st.ring.n, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }
  function mesh(gl, m) { return { vb: buf(gl, m.pos), ub: buf(gl, m.uv), ib: buf(gl, m.idx, gl.ELEMENT_ARRAY_BUFFER), n: m.idx.length }; }

  function infoHTML(id, g) {
    const p = P[id]; const out = [];
    const dia = g.diamArc >= 60 ? `${(g.diamArc / 60).toFixed(1)}′` : `${g.diamArc.toFixed(1)}″`;
    const zv = Math.round(1800 / g.diamArc / 5) * 5;
    out.push(`<p class="k">Zdánlivý průměr ${dia}${g.diamArc < 600 ? ` · při zvětšení ${zv}× vypadá jako Luna pouhým okem` : ''}</p>`);
    const dist = id === 'Moon' ? `${Math.round(g.dist * AU_KM).toLocaleString('cs-CZ')} km` : `${g.dist.toFixed(2)} AU · světlo letí ${Math.round(g.dist * 8.317)} min`;
    out.push(`<p>Vzdálenost ${dist}${g.mag != null ? ` · jasnost ${g.mag.toFixed(1)} mag` : ''}${id === 'Venus' || id === 'Mercury' || id === 'Moon' || id === 'Mars' ? ` · osvětleno ${Math.round(g.frac * 100)} %` : ''}</p>`);
    if (id === 'Saturn') out.push(`<p>Prstence jsou natočené ${g.ringTilt.toFixed(1)}° ${g.ringTilt < 3 ? '— skoro z hrany, tenká čára; v dalších letech se zase otevřou' : g.ringTilt < 10 ? '— úzce otevřené' : '— pěkně otevřené'}. Jsou vidět i malým dalekohledem od 30× výš.</p>`);
    if (id === 'Jupiter' && g.moons) {
      out.push(`<p class="pvnote">Zorné pole je nastavené tak, aby byly vidět i měsíce. Dvěma prsty planetu přiblížíš.</p>`);
      const ms = g.moons.slice().sort((a, b) => a.x - b.x).map(m => `<span>${esc(m.cz)} ${Math.abs(m.x) < 1 && Math.abs(m.y) < 1 ? (m.z < 0 ? '(za planetou)' : '(před planetou)') : Math.abs(m.x) > 7 ? '(dál, mimo zorné pole)' : ''}</span>`).join('');
      out.push(`<p>Čtyři velké měsíce zleva doprava (západ je vpravo, jako na obloze):</p><div class="pvmoons">${ms}</div><p class="pvnote">Pásy ukáže dalekohled od 50×, měsíce i triedr. Velká rudá skvrna se otáčí s planetou, tady je v poloze podle mapy, bez zaručené shody s dnešní polohou.</p>`);
    }
    if (id === 'Venus') out.push(`<p>Venuše je zahalená mraky, v dalekohledu je vidět jen jasný kotouč s fází, jako malá Luna. Fázi ukáže už dalekohled od 30×.</p>`);
    if (id === 'Mercury') out.push(`<p>Merkur je blízko Slunce a nízko nad obzorem; fázi ukáže dalekohled od 80×. Povrch připomíná Lunu, proto je tu znázorněný měsíčním reliéfem.</p>`);
    if (id === 'Mars') out.push(`<p>${g.diamArc > 14 ? 'Mars je teď velký: dalekohled od 100× ukáže polární čepičku a tmavé plochy.' : g.diamArc > 8 ? 'Mars je střední velikosti; dalekohled od 150× ukáže čepičku a náznak tmavých ploch.' : 'Mars je teď daleko a malý; v dalekohledu je to oranžový kotouček, podrobnosti chtějí velké přístroje.'}</p>`);
    if (id === 'Uranus' || id === 'Neptune') out.push(`<p>${p.cz} je malý ${id === 'Uranus' ? 'zelenomodrý' : 'modrý'} kotouček; triedr ho ukáže jako hvězdu, dalekohled od 150× jako kotouček. Barva je skutečná, podrobnosti povrchu ukázaly jen sondy.</p>`);
    if (id === 'Moon') out.push(`<p>Natočení a librace jsou pro dnešek: někdy je vidět víc od jednoho okraje. Terminátor (hranice světla a stínu) je nejlepší místo pro krátery.</p>`);
    out.push(`<p class="pvnote">Sever je nahoře, východ vlevo, jako při pohledu na oblohu. V převracejícím dalekohledu je obraz vzhůru nohama. Mapy povrchu: NASA (volné dílo).</p>`);
    return out.join('');
  }

  function open(opts) {
    const id = opts.id; const p = P[id]; if (!p || !A) return;
    close();
    const date = opts.time || new Date();
    let g; try { g = geometry(id, date); } catch (e) { if (opts.toast) opts.toast('Přiblížení se nepodařilo spočítat.'); return; }
    const style = document.createElement('style'); style.id = 'pviewcss'; style.textContent = CSS; document.head.appendChild(style);
    const box = document.createElement('div'); box.id = 'pview';
    const dt = date.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
    box.innerHTML = `<div class="pvbar"><button class="pvx" data-pv="close" aria-label="Zavřít">×</button><div class="pvt"><b>${esc(p.cz)} v dalekohledu</b><small>${esc(dt)} · skutečné natočení, osvětlení a fáze</small></div></div>
      <div class="pveye"><canvas width="900" height="900" aria-label="${esc(p.cz)} zblízka"></canvas></div><div class="pvinfo">${infoHTML(id, g)}</div>`;
    document.body.appendChild(box);
    const canvas = $('canvas', box); const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) { box.querySelector('.pveye').innerHTML = '<p style="color:#9FB0D6;padding:30px;text-align:center">Tohle zařízení 3D obraz nenabízí. Údaje níž platí.</p>'; st = { box, style }; return; }
    try {
      st = { id, p, g, box, style, canvas, gl, zoom: 1, progBody: glProgram(gl, VS, FS_BODY), progRing: glProgram(gl, VS, FS_RING), sphere: mesh(gl, sphereMesh(64, 128)), ring: p.ring ? mesh(gl, ringMesh(1.2, 2.3, 180)) : null, tex: null };
    } catch (e) { console.error(e); if (opts.toast) opts.toast('3D obraz se nepodařilo spustit.'); close(); return; }
    render();
    if (p.tex) {
      const img = new Image(); img.onload = () => { if (!st || st.id !== id) return; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); st.tex = t; render(); };
      img.src = p.tex + '?v=1';
    }
    // přiblížení kolečkem / dvěma prsty
    let pinch = null;
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); st.zoom = Math.min(3, Math.max(0.5, st.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); render(); }, { passive: false });
    canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), z: st.zoom }; }, { passive: true });
    canvas.addEventListener('touchmove', (e) => { if (pinch && e.touches.length === 2) { e.preventDefault(); const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); st.zoom = Math.min(3, Math.max(0.5, pinch.z * d / pinch.d)); render(); } }, { passive: false });
    canvas.addEventListener('touchend', () => { pinch = null; });
    box.addEventListener('click', (e) => { if (e.target.closest('[data-pv="close"]')) close(); });
    st.onKey = (e) => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', st.onKey);
  }
  function close() {
    if (!st) return; const s = st; st = null;
    if (s.onKey) document.removeEventListener('keydown', s.onKey);
    if (s.box) s.box.remove(); if (s.style) s.style.remove();
  }
  window.PlanetView = { open, close, bodies: Object.keys(P) };
})();
