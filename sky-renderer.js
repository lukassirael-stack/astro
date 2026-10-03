/* Nebeský kompas — nebeská sféra ve WebGL 1.
 * Žádné CDN, žádné náhodné „hvězdy“: body a jejich barvy pocházejí ze SKY_DATA.
 * Katalog obsahuje směry, ne vzdálenosti; kamera se proto otáčí v počátku sféry.
 * Mléčná dráha je výtvarná aproximace galaktické roviny, ne vědecká fotografie.
 * Copyright (c) 2026 Oáza Adamanthea. */
(function () {
  'use strict';
  const VERTEX_SKY = `
    attribute vec2 aPosition;
    varying mediump vec2 vPosition;
    void main() { vPosition = aPosition; gl_Position = vec4(aPosition, 0.0, 1.0); }
  `;
  const FRAGMENT_SKY = `
    precision highp float;
    varying mediump vec2 vPosition;
    uniform vec3 uForward, uRight, uUp;
    uniform mat3 uEqToEnu;
    uniform vec2 uTan;
    uniform float uArt, uDay, uCamera, uTime;
    float hash(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.13, 0.41, 0.73));
      p *= 10.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 p) {
      vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
                     mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                     mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
    }
    float clouds(vec3 p) {
      float n=0.0, a=0.52;
      for (int i=0; i<4; i++) { n += a*noise(p); p=p*2.07+vec3(4.1,9.3,2.8); a*=0.5; }
      return n;
    }
    void main() {
      vec3 ray = normalize(uForward+vPosition.x*uTan.x*uRight+vPosition.y*uTan.y*uUp);
      vec3 eq = vec3(dot(ray,uEqToEnu[0]),dot(ray,uEqToEnu[1]),dot(ray,uEqToEnu[2]));
      // IAU/J2000 galaktická rovina. Nepohybuje se vůči katalogovým hvězdám.
      vec3 pole=vec3(-0.867666149,-0.198076374,0.455983776);
      vec3 center=vec3(-0.054875560,-0.873437090,-0.483835015);
      float latitude=abs(dot(eq,pole));
      float band=exp(-latitude*latitude*36.0);
      float inner=exp(-latitude*latitude*170.0);
      float core=pow(max(0.0,dot(eq,center)),12.0);
      float structure=clouds(eq*15.0);
      float detail=clouds(eq*58.0);
      float lanes=smoothstep(0.33,0.71,clouds(eq*25.0+vec3(7.2,2.4,5.9)));
      float dust=band*(0.16+structure*0.9)*(0.28+detail*0.85)*(1.0-lanes*0.73);
      float arc=band*inner*pow(max(detail,0.0),2.0);
      float horizon=exp(-abs(ray.z)*9.0);
      float height=clamp(ray.z*0.5+0.5,0.0,1.0);
      vec3 color=mix(vec3(0.018,0.050,0.090),vec3(0.006,0.017,0.039),height);
      float night=1.0-uDay*0.92;
      vec3 tint=mix(vec3(0.13,0.24,0.35),vec3(0.37,0.30,0.23),core*0.7);
      color+=(dust*tint*0.82+arc*vec3(0.25,0.28,0.37))*night*mix(0.42,1.75,uArt);
      // Světelný závoj pouze v režimu Prostor, ukotvený na sféře, ne na displeji.
      float veil=pow(max(clouds(eq*4.0+vec3(1.3,6.7,2.4))-0.28,0.0),2.0);
      color+=veil*vec3(0.017,0.085,0.13)*uArt*night*(0.96+0.04*sin(uTime*0.10));
      color+=horizon*vec3(0.015,0.044,0.050)*night;
      color=mix(color,color+vec3(0.065,0.17,0.28)*(0.35+horizon*0.65),uDay);
      float above=smoothstep(-0.018,0.008,ray.z);
      vec3 ground=vec3(0.003,0.010,0.017)+vec3(0.003,0.012,0.014)*exp(ray.z*18.0);
      color=mix(ground,color,above);
      float vignette=1.0-0.12*pow(clamp(length(vPosition)*0.65,0.0,1.0),2.0);
      gl_FragColor=vec4(color*vignette,uCamera>0.5 ? 0.0 : 1.0);
    }
  `;
  const VERTEX_STARS = `
    attribute vec3 aDirection, aColor;
    attribute float aMagnitude;
    uniform mat3 uEqToEnu;
    uniform vec3 uForward, uRight, uUp;
    uniform vec2 uTan;
    uniform float uDpr, uZoom, uLimit, uDay, uCamera, uTime, uMaxPoint;
    varying mediump vec3 vColor;
    varying mediump float vSize, vCore, vAlpha, vMagnitude;
    void main() {
      vec3 v=uEqToEnu*aDirection;
      float depth=dot(v,uForward);
      gl_Position=vec4(dot(v,uRight)/uTan.x,dot(v,uUp)/uTan.y,0.0,depth);
      if(depth<0.04) gl_Position=vec4(2.0,2.0,2.0,1.0);
      // velikost a jas podle hvězdné velikosti: jasné hvězdy výrazně větší, slabé drobné a tlumené
      vCore=clamp(0.60+pow(2.512,-aMagnitude*0.5)*1.6,0.62,4.2)*sqrt(uZoom);
      vSize=min(uMaxPoint,max(8.0,vCore*16.0)*uDpr);
      gl_PointSize=vSize;
      vSize/=uDpr;
      vColor=aColor;
      vMagnitude=aMagnitude;
      float visible=1.0-smoothstep(uLimit-0.4,uLimit+0.15,aMagnitude);
      float twinkle=0.98+0.02*sin(uTime*(0.60+fract(aMagnitude)*0.15)+aDirection.x*50.0);
      float above=mix(0.07,1.0,smoothstep(-0.012,0.03,v.z));
      float bright=clamp(pow(2.512,(3.0-aMagnitude)*0.32),0.40,1.0);
      vAlpha=visible*above*twinkle*bright*(1.0-uDay*0.7);
    }
  `;
  const FRAGMENT_STARS = `
    precision mediump float;
    varying mediump vec3 vColor;
    varying mediump float vSize, vCore, vAlpha, vMagnitude;
    void main() {
      vec2 p=(gl_PointCoord-0.5)*vSize;
      float d=length(p), q=d/max(vCore,0.1);
      float core=exp(-q*q*2.4);
      float glow=exp(-q*q*0.13)*0.12*clamp(pow(2.512,(1.5-vMagnitude)*0.6),0.2,3.0);
      float flare=0.0;
      if(vMagnitude<1.6) {
        flare=(exp(-abs(p.x)*8.0)*exp(-abs(p.y)/max(1.0,vCore*2.6))+
               exp(-abs(p.y)*8.0)*exp(-abs(p.x)/max(1.0,vCore*2.6)))*0.10;
      }
      float a=(core+glow+flare)*vAlpha;
      if(a<0.001) discard;
      gl_FragColor=vec4(mix(vColor,vec3(1.0),core*0.6),a);
    }
  `;
  const VERTEX_LINES = `
    attribute vec3 aDirection;
    uniform vec3 uForward, uRight, uUp;
    uniform vec2 uTan;
    varying mediump float vAltitude;
    void main() {
      float depth=dot(aDirection,uForward);
      gl_Position=vec4(dot(aDirection,uRight)/uTan.x,dot(aDirection,uUp)/uTan.y,0.0,depth);
      vAltitude=aDirection.z;
    }
  `;
  const FRAGMENT_LINES = `
    precision mediump float;
    uniform vec4 uColor;
    varying mediump float vAltitude;
    void main() { gl_FragColor=vec4(uColor.rgb,uColor.a*mix(0.15,1.0,smoothstep(-0.02,0.03,vAltitude))); }
  `;

  class SkyRenderer {
    constructor(canvas, data, color) {
      this.canvas=canvas; this.data=data; this.color=color; this.buffers=[]; this.programs=[];
      this.gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
      if (!this.gl) throw new Error('WebGL není dostupné.');
      this.onLost=(e)=>{e.preventDefault();this.lost=true;};
      this.onRestored=()=>{try{this.init();this.lost=false;}catch(e){this.lost=true;}};
      canvas.addEventListener('webglcontextlost',this.onLost);
      canvas.addEventListener('webglcontextrestored',this.onRestored);
      this.init();
    }
    compile(type,source) {
      const g=this.gl, s=g.createShader(type);
      // Některé starší telefony nemají highp ve fragment shaderu.
      if(type===g.FRAGMENT_SHADER && !g.getShaderPrecisionFormat(g.FRAGMENT_SHADER,g.HIGH_FLOAT).precision) source=source.replace('precision highp float','precision mediump float');
      g.shaderSource(s,source);g.compileShader(s);
      if(!g.getShaderParameter(s,g.COMPILE_STATUS)){const log=g.getShaderInfoLog(s);g.deleteShader(s);throw new Error(log);}
      return s;
    }
    program(vs,fs) {
      const g=this.gl,p=g.createProgram(),v=this.compile(g.VERTEX_SHADER,vs),f=this.compile(g.FRAGMENT_SHADER,fs);
      g.attachShader(p,v);g.attachShader(p,f);g.linkProgram(p);g.deleteShader(v);g.deleteShader(f);
      if(!g.getProgramParameter(p,g.LINK_STATUS)){const log=g.getProgramInfoLog(p);g.deleteProgram(p);throw new Error(log);}
      this.programs.push(p);return {p,uniforms:new Map(),attributes:new Map()};
    }
    buffer(array) {
      const g=this.gl,b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array(array),g.STATIC_DRAW);this.buffers.push(b);return b;
    }
    init() {
      this.buffers=[];this.programs=[];
      const g=this.gl;
      this.sky=this.program(VERTEX_SKY,FRAGMENT_SKY);this.stars=this.program(VERTEX_STARS,FRAGMENT_STARS);this.lines=this.program(VERTEX_LINES,FRAGMENT_LINES);
      this.quad=this.buffer([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);
      const points=[];
      for(const s of this.data.stars) points.push(...s.q,...this.color(Number.isFinite(s.bv)?s.bv:0.6).map(c=>c/255),s.mag);
      this.starBuffer=this.buffer(points);this.lineBuffer=this.buffer([]);this.calcAt=0;
      this.maxPoint=g.getParameter(g.ALIASED_POINT_SIZE_RANGE)[1];
      g.disable(g.DEPTH_TEST);g.disable(g.CULL_FACE);g.clearColor(0,0,0,0);
    }
    uniform(program,name,value) {
      const g=this.gl;
      if(!program.uniforms.has(name)) program.uniforms.set(name,g.getUniformLocation(program.p,name));
      const loc=program.uniforms.get(name);if(loc==null)return;
      if(typeof value==='number')g.uniform1f(loc,value);
      else if(value.length===9)g.uniformMatrix3fv(loc,false,value);
      else if(value.length===4)g.uniform4fv(loc,value);
      else if(value.length===3)g.uniform3fv(loc,value);
      else g.uniform2fv(loc,value);
    }
    attribute(program,name,buffer,size,stride=0,offset=0) {
      const g=this.gl;
      if(!program.attributes.has(name))program.attributes.set(name,g.getAttribLocation(program.p,name));
      const a=program.attributes.get(name);if(a<0)return;
      g.bindBuffer(g.ARRAY_BUFFER,buffer);g.enableVertexAttribArray(a);g.vertexAttribPointer(a,size,g.FLOAT,false,stride,offset);
    }
    use(program,state,basis,W,H,dpr) {
      const g=this.gl;g.useProgram(program.p);
      const ty=Math.tan(state.fov*Math.PI/360);
      this.uniform(program,'uTan',[ty*W/H,ty]);
      this.uniform(program,'uForward',basis.f);this.uniform(program,'uRight',basis.r);this.uniform(program,'uUp',basis.u);
      this.uniform(program,'uEqToEnu',state.eqToEnu);
      this.uniform(program,'uDpr',dpr);
    }
    updateLines(state) {
      const points=[];
      // Krátké úseky na velké kružnici, nikoli přímé spojnice na ploše monitoru.
      for(const l of state.data.lines){
        const n=Math.max(1,Math.ceil(Math.acos(Math.min(1,Math.max(-1,l.a.reduce((s,v,i)=>s+v*l.b[i],0))))/(Math.PI/90)));
        const at=(t)=>{const v=l.a.map((x,i)=>x*(1-t)+l.b[i]*t),d=Math.hypot(...v);return v.map(x=>x/d);};
        for(let i=0;i<n;i++)points.push(...at(i/n),...at((i+1)/n));
      }
      const g=this.gl;g.bindBuffer(g.ARRAY_BUFFER,this.lineBuffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(points),g.DYNAMIC_DRAW);
      this.lineCount=points.length/3;this.calcAt=state.lastCalc;
    }
    render(state,basis,W,H,dpr,time) {
      if(this.lost||!W||!H)return false;
      const g=this.gl;
      const scale=Math.min(dpr,1.5),w=Math.round(W*scale),h=Math.round(H*scale);
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
      g.viewport(0,0,w,h);g.clear(g.COLOR_BUFFER_BIT);g.disable(g.BLEND);
      this.use(this.sky,state,basis,W,H,scale);this.attribute(this.sky,'aPosition',this.quad,2);
      const art=state.scene==='space'?1:0;
      const day=state.red||art?0:Math.min(0.60,Math.max(0,(state.sunAlt+12)/18)*0.60);
      const t=state.reducedMotion?0:time/1000;
      for(const [n,v] of Object.entries({uArt:art,uDay:day,uCamera:state.cam?1:0,uTime:t}))this.uniform(this.sky,n,v);
      g.drawArrays(g.TRIANGLES,0,6);
      g.enable(g.BLEND);g.blendFunc(g.SRC_ALPHA,g.ONE);
      this.use(this.stars,state,basis,W,H,scale);
      this.attribute(this.stars,'aDirection',this.starBuffer,3,28,0);this.attribute(this.stars,'aColor',this.starBuffer,3,28,12);this.attribute(this.stars,'aMagnitude',this.starBuffer,1,28,24);
      const zoom=Math.min(4,Math.max(0.6,70/state.fov));
      const limit=Math.min(6.5,Math.max(2,(art?6.0:4.8)+1.2*Math.log2(zoom)-(state.cam?0.7:0)-day*3));
      for(const [n,v] of Object.entries({uZoom:zoom,uLimit:limit,uDay:day,uCamera:state.cam?1:0,uTime:t,uMaxPoint:this.maxPoint}))this.uniform(this.stars,n,v);
      g.drawArrays(g.POINTS,0,this.data.stars.length);
      if(state.showLines){
        if(this.calcAt!==state.lastCalc)this.updateLines(state);
        this.use(this.lines,state,basis,W,H,scale);this.attribute(this.lines,'aDirection',this.lineBuffer,3);
        this.uniform(this.lines,'uColor',state.cam?[0.78,0.84,1,0.55]:art?[0.55,0.69,0.89,0.25]:[0.55,0.68,0.98,0.42]);
        g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);g.drawArrays(g.LINES,0,this.lineCount);
      }
      return true;
    }
    dispose() {
      this.canvas.removeEventListener('webglcontextlost',this.onLost);this.canvas.removeEventListener('webglcontextrestored',this.onRestored);
      const g=this.gl;for(const b of this.buffers)g.deleteBuffer(b);for(const p of this.programs)g.deleteProgram(p);
      this.buffers=[];this.programs=[];this.lost=true;
      const lose=g.getExtension('WEBGL_lose_context');if(lose)lose.loseContext();
    }
  }
  window.KompasSkyRenderer={create(canvas,data,color){try{return new SkyRenderer(canvas,data,color);}catch(e){console.warn('Nebeská sféra: přecházím na 2D mapu.',e.message);return null;}}};
})();
