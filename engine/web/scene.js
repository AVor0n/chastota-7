// Scene renderer: one WebGL canvas that shows the current pencil drawing, cross-fades from the previous one,
// moves the camera slowly (diafilm pans, focus) and adds light code effects named by @anim in the script.

const SCENE_VS = `attribute vec2 a; varying vec2 vUv; void main(){ vUv = vec2(a.x*.5+.5, .5-a.y*.5); gl_Position = vec4(a,0.,1.); }`;
const SCENE_FS = `precision highp float;
varying vec2 vUv;
uniform sampler2D uImg, uPrev, uMask;
uniform float uT, uMix, uBlack, uFlash, uStill, uHasMask;
uniform vec4 uView, uPrevView;          // xy: image uv at screen centre, zw: visible part of the image
uniform vec2 uRes;                      // image size in px (the drawing, 9:16)
uniform vec3 uFire, uLamp;              // x, y in uv, z on/off
uniform vec2 uWater;                    // y line, on
uniform vec4 uDustRect;                 // x0, y0, x1, y1 in uv: where dust motes float
uniform vec4 uWaterRect;                // x0, y0, x1, y1 in uv: where the water ripples
uniform vec3 uBeacon;                   // x, y in uv, brightness 0..1 (red light of the lighthouse)
uniform float uFog, uStars, uWind, uDust, uFlies, uRain, uGlitch;
uniform vec2 uShake;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.03; a *= .5; } return v; }
float lum(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
vec2 toImg(vec2 s, vec4 v){ return v.xy + (s - .5)*v.zw; }

void main(){
  float t = uT;
  vec2 s = vUv + uShake;
  vec2 uv = toImg(s, uView);
  vec2 p = uv*uRes;                      // image pixels
  vec2 off = vec2(0.);
  vec3 m = uHasMask > .5 ? texture2D(uMask, uv).rgb : vec3(0.);
  float gust = .6 + .4*sin(t*.37) + .25*sin(t*.91 + 1.3);

  // water: below the line (or the red mask channel)
  vec4 wq = uWaterRect*vec4(uRes, uRes);
  float wr = uHasMask > .5 ? m.r : uWater.y*smoothstep(wq.y - 6., wq.y + 18., p.y)*smoothstep(wq.w + 6., wq.w - 18., p.y)*smoothstep(wq.x - 10., wq.x + 24., p.x)*smoothstep(wq.z + 10., wq.z - 24., p.x);
  float rip = sin(p.y*.85 - t*1.8 + noise(vec2(p.x*.012, p.y*.05 + t*.25))*5.);
  off.x += wr*(rip*1.1 + (noise(vec2(p.x*.02 - t*.45, p.y*.12)) - .5)*2.);
  off.y += wr*sin(p.x*.045 + t*1.3 + p.y*.2)*.4;

  // fire: heat shimmer rising above the point (or the green mask channel)
  vec2 fp = uFire.xy*uRes;
  vec2 fd = (p - fp)/vec2(.07*uRes.x, .1*uRes.x);
  float flameZone = uHasMask > .5 ? m.g : uFire.z*exp(-dot(fd - vec2(0., -.6), fd - vec2(0., -.6))*.9);
  float up = t*2.8;
  float n1 = fbm(vec2(p.x*.035, p.y*.028 + up)), n2 = fbm(vec2(p.x*.03 + 7.3, p.y*.035 + up*1.2));
  off += flameZone*vec2((n1 - .5)*7., (n2 - .5)*5.);

  // wind: boughs and grass near the edges sway (or the blue mask channel)
  float edge = uHasMask > .5 ? m.b : uWind*(pow(abs(uv.x - .5)*2., 2.5)*(1. - smoothstep(.55, .9, uv.y)) + smoothstep(.9, 1., uv.y)*.6);
  off.x += edge*(sin(t*1.05 + p.y*.006) + .45*sin(t*2.3 + p.y*.013) + (noise(vec2(p.x*.05 + t*1.5, p.y*.05)) - .5))*3.*gust;
  off.y += edge*cos(t*.7 + p.x*.01)*1.2;

  // glitch: torn horizontal bands in bursts
  float gb = 0.;
  if (uGlitch > .5) {
    float burst = step(.82, noise(vec2(t*1.3, 2.)));
    float band = step(.7, hash(vec2(floor(p.y/14.), floor(t*12.))));
    gb = burst*band;
    off.x += gb*(hash(vec2(floor(p.y/14.), floor(t*30.))) - .5)*60.;
  }

  vec3 c = texture2D(uImg, (p + off*(1. - uStill))/uRes).rgb;
  vec3 paper = vec3(.97,.94,.87);
  float L = lum(c);

  if (uStill < .5) {
    // fire light: flicker on bright strokes, warm halo, sparks
    if (uFire.z > .5 || uLamp.z > .5) {
      float fl = .85 + .15*noise(vec2(t*7., 1.)) + .08*sin(t*13.) + .05*sin(t*23.7);
      vec2 lp = uFire.z > .5 ? fp : uLamp.xy*uRes;
      float rad = (uFire.z > .5 ? .2 : .13)*uRes.x;
      vec2 dg = (p - lp)*vec2(1., 1.2);
      float glow = exp(-dot(dg,dg)/(2.*rad*rad));
      c += vec3(1.,.88,.7)*glow*(fl - .84)*.38;
      c += glow*smoothstep(.55,.9,L)*(fl - .9)*.6;
    }
    if (uFire.z > .5) {
      for (int i = 0; i < 12; i++){
        float fi = float(i);
        float per = 2. + hash(vec2(fi,3.1))*1.8;
        float tt = t/per + hash(vec2(fi,7.7));
        float k = fract(tt), cyc = floor(tt);
        float hx = hash(vec2(fi, cyc));
        vec2 sp = fp + vec2((hx - .5)*.07*uRes.x + sin(k*6. + fi)*.017*uRes.x*k, -.03*uRes.x - k*(.19 + hx*.18)*uRes.x);
        vec2 d = p - sp;
        c = mix(c, paper, (1. - k)*smoothstep(0., .08, k)*exp(-dot(d,d)/2.6)*.95);
      }
    }
    // glints on water
    c += paper*wr*pow(noise(vec2(p.x*.12, p.y*.5 - t*.9 + sin(p.x*.05)*2.)), 6.)*.5;

    // stars: small bright dots in a dark sky twinkle
    if (uStars > .5 && uv.y < .55) {
      vec2 px = 3./uRes;
      float around = (lum(texture2D(uImg, uv + vec2(px.x,0.)).rgb) + lum(texture2D(uImg, uv - vec2(px.x,0.)).rgb) + lum(texture2D(uImg, uv + vec2(0.,px.y)).rgb) + lum(texture2D(uImg, uv - vec2(0.,px.y)).rgb))*.25;
      float star = smoothstep(.12, .3, L - around)*smoothstep(.6, .3, around);
      float h = hash(floor(p/4.));
      float tw = .5 + .5*sin(t*(.9 + h*1.8) + h*40.);
      c = mix(c, c*.55, star*(1. - tw*tw)*.8);
      c += paper*star*tw*tw*.25;
    }

    // fog drifting in bands
    if (uFog > 0.) {
      float f = fbm(vec2(p.x*.004 - t*.03, p.y*.012 + t*.008))*.6 + fbm(vec2(p.x*.008 + t*.045, p.y*.02))*.4;
      float h = smoothstep(.2, .55, uv.y)*(1. - smoothstep(.85, 1., uv.y)) + .25;
      c = mix(c, vec3(.86,.84,.79), smoothstep(.38, .78, f)*h*.32*uFog);
    }

    // dust motes in the light
    if (uDust > .5) {
      // a narrow box (dust rect=...) gets bigger, brighter motes; the full frame stays as before
      vec2 dsz = uDustRect.zw - uDustRect.xy; float dk = 1. - dsz.x*dsz.y;
      for (int i = 0; i < 18; i++){
        float fi = float(i);
        vec2 base = vec2(hash(vec2(fi,1.3)), hash(vec2(fi,8.1)));
        vec2 q = fract(base + vec2(sin(t*.07 + fi)*.03 + t*.004*(hash(vec2(fi,2.)) - .5), -t*.006*(.5 + hash(vec2(fi,4.)))));
        vec2 mp = (uDustRect.xy + q*(uDustRect.zw - uDustRect.xy))*uRes;
        vec2 d = p - mp;
        float tw = (.5 + .5*sin(t*(.8 + hash(vec2(fi,6.))) + fi))*smoothstep(0., .12, q.y)*smoothstep(1., .88, q.y);
        c = mix(c, paper, exp(-dot(d,d)/((3. + 5.*hash(vec2(fi,9.)))*(1. + 3.*dk)))*(.55 + .3*dk)*tw);
      }
    }

    // fireflies, lower half
    if (uFlies > .5) {
      for (int i = 0; i < 9; i++){
        float fi = float(i);
        vec2 base = vec2(.06 + hash(vec2(fi,1.7))*.88, .55 + hash(vec2(fi,4.2))*.35)*uRes;
        vec2 ff = base + vec2(sin(t*(.21 + hash(vec2(fi,9.))*.2) + fi*2.)*.06*uRes.x, cos(t*(.17 + hash(vec2(fi,5.))*.15) + fi)*.02*uRes.y);
        float blink = pow(max(0., sin(t*(.6 + hash(vec2(fi,2.))*.5) + fi*1.9)), 5.);
        vec2 d = p - ff; float d2 = dot(d,d);
        c = mix(c, paper, blink*(exp(-d2/3.)*.95 + exp(-d2/60.)*.25));
      }
    }

    // rain: thin slanted pencil strokes
    if (uRain > .5) {
      vec2 rp = vec2(p.x + p.y*.18, p.y);
      float col = floor(rp.x/9.);
      float sp = 900. + hash(vec2(col,1.))*500.;
      float y = fract((rp.y + t*sp + hash(vec2(col,2.))*3000.)/260.);
      float streak = smoothstep(.0, .02, y)*smoothstep(.12, .02, y)*smoothstep(1.4, .2, abs(fract(rp.x/9.) - .5)*9.);
      c = mix(c*.94, paper*.9, streak*.35);
    }

    if (uGlitch > .5) c = mix(c, vec3(step(.5, hash(p + t))), gb*.15);

    // the lighthouse light: the only red in the frame, glowing up and fading
    if (uBeacon.z > .001) {
      vec2 bd = (p - uBeacon.xy*uRes)/uRes.x;
      float r2 = dot(bd, bd);
      vec3 red = vec3(.69,.16,.12);
      c = mix(c, red, uBeacon.z*(exp(-r2/.00004)*.95 + exp(-r2/.0009)*.35));
      c += vec3(.9,.25,.15)*uBeacon.z*exp(-r2/.012)*.12;
    }

    // diafilm: paper grain and a faint projector flicker
    float fr = floor(t*9.);
    c *= 1. + (hash(floor(p/2.) + fr) - .5)*.045;
    c *= .985 + .015*noise(vec2(t*2.3, 0.));
  }

  // previous drawing for the cross-fade
  if (uMix < 1.) {
    vec3 pc = texture2D(uPrev, toImg(s, uPrevView)).rgb;
    c = mix(pc, c, uMix);
  }
  // vignette like a frame on the wall
  vec2 vq = vUv - .5;
  c *= 1. - dot(vq*vec2(.9, .7), vq*vec2(.9, .7))*.55;
  c = mix(c, vec3(.043,.039,.031), uBlack);
  c = mix(c, vec3(1.), uFlash);
  gl_FragColor = vec4(c, 1.);
}`;

class SceneView {
  constructor(canvas, { assetUrl, reduce }) {
    this.canvas = canvas; this.assetUrl = assetUrl; this.reduce = reduce;
    this.cache = new Map(); this.t0 = performance.now();
    this.cur = null; this.prev = null; this.mixFrom = 0; this.mixDur = 0;
    this.black = { v: 1, from: 1, to: 1, t0: 0, dur: 1 };
    this.flash = 0; this.shakeUntil = 0; this.fx = {}; this.paused = false;
    this.cam = { x: .5, y: .5, z: 1 }; this.camAnim = null; this.panAnim = null;
    this.init();
  }

  init() {
    const gl = this.gl = this.canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: false });
    if (!gl) { this.fallback = true; return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
    const prog = this.prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, SCENE_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, SCENE_FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ["uImg","uPrev","uMask","uT","uMix","uBlack","uFlash","uStill","uHasMask","uView","uPrevView","uRes","uFire","uLamp","uWater","uWaterRect","uDustRect","uBeacon","uFog","uStars","uWind","uDust","uFlies","uRain","uGlitch","uShake"]) this.u[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(this.u.uImg, 0); gl.uniform1i(this.u.uPrev, 1); gl.uniform1i(this.u.uMask, 2);
    this.blankTex = this.texFrom(null);
    this.canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); this.lost = true; });
    this.canvas.addEventListener("webglcontextrestored", () => { this.cache.clear(); this.lost = false; this.init(); if (this.cur) this.show(this.cur.id, "cut"); });
  }

  texFrom(img) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (img) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([11, 10, 8]));
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  // a stand-in drawing while the real picture does not exist yet
  placeholder(id) {
    const c = document.createElement("canvas"); c.width = 540; c.height = 960;
    const g = c.getContext("2d");
    g.fillStyle = "#d9d0bd"; g.fillRect(0, 0, 540, 960);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(60,52,40,${Math.random() * .08})`; g.fillRect(Math.random() * 540, Math.random() * 960, 1.5, 1.5); }
    g.strokeStyle = "rgba(40,34,26,.5)"; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) { g.beginPath(); const y = 520 + i * 11; g.moveTo(0, y + Math.random() * 6); g.lineTo(540, y + Math.random() * 6); g.stroke(); }
    g.fillStyle = "#2a241c"; g.font = "600 40px Caveat, cursive"; g.textAlign = "center";
    g.fillText("картинка", 270, 300); g.fillText(id, 270, 350);
    return c;
  }

  load(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const p = (async () => {
      const A = (typeof STORY !== "undefined" && STORY.assets) || null;
      const img = A && !A.scenes.includes(id) ? this.placeholder(id) : await loadImage(this.assetUrl(`scenes/${id}.jpg`)).catch(() => this.placeholder(id));
      const mask = A && !A.masks.includes(id) ? null : await loadImage(this.assetUrl(`scenes/${id}.mask.png`)).catch(() => null);
      if (this.fallback) return { id, img, mask: null, w: img.width, h: img.height };
      return { id, img, tex: this.texFrom(img), mask: mask ? this.texFrom(mask) : null, w: img.width, h: img.height };
    })();
    this.cache.set(id, p);
    return p;
  }
  preload(ids) { ids.forEach(id => this.load(id)); }

  now() { return (performance.now() - this.t0) / 1000; }

  async show(id, how = "fade") {
    // a later show() wins even if its picture loads first
    const my = this.showSeq = (this.showSeq || 0) + 1;
    this.loading = true;
    const entry = await this.load(id);
    if (my !== this.showSeq) return;
    this.loading = false;
    if (this.cur && this.cur.id === id && this.black.to === 0) return;
    this.prev = this.black.v > .5 ? null : this.cur;
    this.prevCam = { ...this.cam };
    this.cur = entry;
    this.cam = { x: .5, y: .5, z: 1 }; this.camAnim = null; this.panAnim = null;
    this.mixFrom = this.now(); this.mixDur = how === "cut" || !this.prev ? 0 : how === "slow" ? 3 : 1.2;
    if (this.black.to !== 0) this.fadeBlack(0, how === "cut" ? 0 : how === "slow" ? 2.4 : 1);
    if (this.fallback) this.canvas.style.backgroundImage = `url(${entry.img.src || entry.img.toDataURL()})`;
  }
  // a crossfade or a fade to/from black is still running
  busy() { const t = this.now(); return this.loading || (this.mixDur && t - this.mixFrom < this.mixDur) || (this.black && this.black.v !== this.black.to); }
  toBlack(dur = 1) { this.showSeq = (this.showSeq || 0) + 1; this.loading = false; this.fadeBlack(1, dur); this.fx = {}; this.panAnim = null; }
  fadeBlack(to, dur) { this.black = { v: this.black.v, from: this.black.v, to, t0: this.now(), dur: Math.max(dur, .001) }; }
  setFx(list) {
    const fx = {};
    for (const f of list || []) fx[f.kind] = f;
    this.fx = fx;
  }
  doFlash() { this.flash = 1; }
  doShake() { this.shakeUntil = this.now() + .5; }
  pan(dir, sec) {
    if (!dir) { this.panAnim = null; return; }
    const d = .1;
    const map = { left: [[.5 + d, .5], [.5 - d, .5], 1.25, 1.25], right: [[.5 - d, .5], [.5 + d, .5], 1.25, 1.25], up: [[.5, .5 + d], [.5, .5 - d], 1.2, 1.2], down: [[.5, .5 - d], [.5, .5 + d], 1.2, 1.2], in: [[.5, .5], [.5, .5], 1, 1.25], out: [[.5, .5], [.5, .5], 1.25, 1] };
    const [a, b, z0, z1] = map[dir];
    this.panAnim = { a, b, z0, z1, t0: this.now(), dur: sec || 24 };
  }
  focus(f) {
    const from = { ...this.cam };
    const to = f ? { x: f.x / 100, y: f.y / 100, z: f.zoom } : { x: .5, y: .5, z: 1 };
    this.panAnim = null;
    this.camAnim = { from, to, t0: this.now(), dur: 2.6 };
  }

  // visible part of the image for a camera, cover-fitted to the canvas, clamped inside the drawing
  viewFor(entry, cam, W, H) {
    if (!entry) return [.5, .5, 1, 1];
    const k = Math.max(W / entry.w, H / entry.h);
    const breathe = this.reduce || this.fx.still ? 1 : 1.025 + .012 * Math.sin(this.now() * .22);
    const z = cam.z * breathe;
    const fx = W / (entry.w * k) / z, fy = H / (entry.h * k) / z;
    const cx = Math.min(1 - fx / 2, Math.max(fx / 2, cam.x)), cy = Math.min(1 - fy / 2, Math.max(fy / 2, cam.y));
    return [cx, cy, fx, fy];
  }

  frame() {
    const gl = this.gl;
    if (!gl || this.lost || !this.cur) return;
    const t = this.now(), ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    if (this.panAnim) {
      const P = this.panAnim, k = ease(Math.min(1, (t - P.t0) / P.dur));
      this.cam = { x: P.a[0] + (P.b[0] - P.a[0]) * k, y: P.a[1] + (P.b[1] - P.a[1]) * k, z: P.z0 + (P.z1 - P.z0) * k };
    } else if (this.camAnim) {
      const A = this.camAnim, k = ease(Math.min(1, (t - A.t0) / A.dur));
      this.cam = { x: A.from.x + (A.to.x - A.from.x) * k, y: A.from.y + (A.to.y - A.from.y) * k, z: A.from.z + (A.to.z - A.from.z) * k };
      if (k >= 1) this.camAnim = null;
    }
    const B = this.black; B.v = B.from + (B.to - B.from) * Math.min(1, (t - B.t0) / B.dur);
    this.flash *= .86; if (this.flash < .01) this.flash = 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = Math.round(this.canvas.clientWidth * dpr), H = Math.round(this.canvas.clientHeight * dpr);
    if (!W || !H) return;
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    gl.viewport(0, 0, W, H);
    const u = this.u, fx = this.fx, cur = this.cur, prev = this.prev;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prev ? prev.tex : this.blankTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, cur.mask || this.blankTex);
    const mix = this.mixDur ? Math.min(1, (t - this.mixFrom) / this.mixDur) : 1;
    gl.uniform1f(u.uT, this.reduce ? 0 : t);
    gl.uniform1f(u.uMix, prev ? mix : 1);
    gl.uniform1f(u.uBlack, B.v); gl.uniform1f(u.uFlash, this.flash);
    gl.uniform1f(u.uStill, fx.still || this.reduce ? 1 : 0);
    gl.uniform1f(u.uHasMask, cur.mask ? 1 : 0);
    gl.uniform4fv(u.uView, this.viewFor(cur, this.cam, W, H));
    gl.uniform4fv(u.uPrevView, this.viewFor(prev, this.prevCam || this.cam, W, H));
    gl.uniform2f(u.uRes, cur.w, cur.h);
    gl.uniform3f(u.uFire, fx.fire ? fx.fire.x / 100 : 0, fx.fire ? fx.fire.y / 100 : 0, fx.fire ? 1 : 0);
    gl.uniform3f(u.uLamp, fx.lamp ? fx.lamp.x / 100 : 0, fx.lamp ? fx.lamp.y / 100 : 0, fx.lamp ? 1 : 0);
    const W2 = fx.water;
    gl.uniform2f(u.uWater, 0, W2 ? 1 : 0);
    if (W2) {
      const r = W2.rect ? [W2.rect[0], W2.rect[1], W2.rect[0] + W2.rect[2], W2.rect[1] + W2.rect[3]] : [W2.x0 != null ? W2.x0 : -10, W2.below, W2.x1 != null ? W2.x1 : 110, 110];
      gl.uniform4f(u.uWaterRect, r[0] / 100, r[1] / 100, r[2] / 100, r[3] / 100);
    }
    const B2 = fx.beacon;
    gl.uniform3f(u.uBeacon, B2 ? B2.x / 100 : 0, B2 ? B2.y / 100 : 0, B2 && !fx.still ? beaconLevel(t, B2.morse) : 0);
    gl.uniform1f(u.uFog, fx.fog ? (fx.fog.level === "dense" ? 2 : fx.fog.level === "light" ? .6 : 1) : 0);
    gl.uniform1f(u.uStars, fx.stars ? 1 : 0); gl.uniform1f(u.uWind, fx.wind ? 1 : 0); gl.uniform1f(u.uDust, fx.dust ? 1 : 0);
    const D2 = fx.dust && fx.dust.rect;
    gl.uniform4f(u.uDustRect, D2 ? D2[0] / 100 : 0, D2 ? D2[1] / 100 : 0, D2 ? (D2[0] + D2[2]) / 100 : 1, D2 ? (D2[1] + D2[3]) / 100 : 1);
    gl.uniform1f(u.uFlies, fx.fireflies ? 1 : 0); gl.uniform1f(u.uRain, fx.rain ? 1 : 0); gl.uniform1f(u.uGlitch, fx.glitch ? 1 : 0);
    const sh = t < this.shakeUntil ? (this.shakeUntil - t) * .02 : 0;
    gl.uniform2f(u.uShake, sh * Math.sin(t * 90), sh * Math.cos(t * 73));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (mix >= 1 && prev) this.prev = null;
  }
}

// brightness of the lighthouse light: a slow swell every ~3.5 s, or "7" in Morse (--...) when asked
function beaconLevel(t, morse) {
  if (!morse) {
    const k = t % 3.6;
    return k < 1.1 ? Math.sin(k / 1.1 * Math.PI / 2) ** 2 : k < 1.5 ? 1 : k < 2.6 ? Math.cos((k - 1.5) / 1.1 * Math.PI / 2) ** 2 : 0;
  }
  const seq = [.75, .25, .75, .25, .22, .25, .22, .25, .22, .25, .22, 1.8]; // on/off pairs, last is the pause
  const total = seq.reduce((a, b) => a + b, 0);
  let k = t % total, on = true;
  for (const d of seq) { if (k < d) { const e = Math.min(k, d - k, .08) / .08; return on ? Math.min(1, e) : 0; } k -= d; on = !on; }
  return 0;
}

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.decoding = "async"; i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
