// The approved title animation (art/title-final), unchanged: fire, water, stars, breathing, branches over koster.jpg with mask.png.
const TITLE_STARS = [[758,523],[861,524],[639,585],[514,598],[845,623],[417,629],[683,632],[654,648],[917,659],[872,663],[526,666],[614,685],[669,686],[723,697],[878,714],[337,557]];
const TITLE_VS = `attribute vec2 a; varying vec2 vUv; void main(){ vUv = vec2(a.x*.5+.5, .5-a.y*.5); gl_Position = vec4(a,0.,1.); }`;
const TITLE_FS = `precision highp float;
  uniform sampler2D uImg, uMask; uniform float uT; uniform vec2 uStars[16]; varying vec2 vUv;
  const vec2 RES = vec2(941.,1672.);
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.03; a *= .5; } return v; }
  float box(vec2 p, vec4 r, float s){ return smoothstep(r.x - s, r.x + s, p.x)*smoothstep(r.z + s, r.z - s, p.x)*smoothstep(r.y - s, r.y + s, p.y)*smoothstep(r.w + s, r.w - s, p.y); }
  float segDist(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa,ba)/dot(ba,ba), 0., 1.); return length(pa - ba*h); }
  void main(){
    float t = uT; vec2 p = vUv*RES;
    vec3 m = texture2D(uMask, vUv).rgb;
    vec2 off = vec2(0.);
    float gust = .6 + .4*sin(t*.37) + .25*sin(t*.91 + 1.3);

    // lake ripples
    float rip = sin(p.y*.85 - t*1.8 + noise(vec2(p.x*.012, p.y*.05 + t*.25))*5.);
    off.x += m.r*(rip*1.2 + (noise(vec2(p.x*.02 - t*.45, p.y*.12)) - .5)*2.2);
    off.y += m.r*sin(p.x*.045 + t*1.3 + p.y*.2)*.45;
    // campfire: noise flows upward, stronger at the tips
    float up = t*2.8;
    float n1 = fbm(vec2(p.x*.035, p.y*.028 + up));
    float n2 = fbm(vec2(p.x*.03 + 7.3, p.y*.035 + up*1.2));
    float tip = smoothstep(1265., 1150., p.y);
    off += m.g*vec2((n1 - .5)*(3. + 10.*tip), (n2 - .5)*5. + 4.*tip*(n1 - .3));
    // breathing, each kid on its own rhythm, scaled from the log
    float who = p.x < 420. ? 0. : (p.x < 668. ? 1. : 2.);
    float rate = who == 0. ? 1.15 : (who == 1. ? 1.5 : 1.3);
    float br = sin(t*rate + who*2.1);
    float cx = who == 0. ? 215. : (who == 1. ? 572. : 778.);
    float body = m.b*step(900., p.y);
    off.y += body*(p.y - 1385.)*.0075*br;
    off.x += body*(p.x - cx)*.006*br*smoothstep(1360., 1180., p.y);
    // girl's hair in the breeze
    vec2 hd = (p - vec2(808.,1215.))/vec2(78.,118.);
    float hair = smoothstep(1., .55, length(hd))*smoothstep(1115., 1175., p.y);
    off.x += hair*(sin(t*1.7 + p.y*.035) + .6*sin(t*2.9 + p.y*.07))*1.6*gust*smoothstep(1130., 1300., p.y);
    // branches top-left sway
    // left tree branches: whole boughs sway from the trunk, leaves flutter on top
    float bw = m.b*step(p.y, 860.)*smoothstep(35., 120., p.x);
    float reach = clamp((p.x - 40.)/300., 0., 1.4);
    float sway = sin(t*1.05 + p.y*.006) + .45*sin(t*2.3 + p.y*.013 + 1.);
    float flutter = noise(vec2(p.x*.06 + t*1.7, p.y*.06)) - .5;
    off.x += bw*reach*(sway*9.*(.8 + .3*sin(t*.37)) + flutter*4.);
    off.y += bw*reach*(cos(t*.7 + p.x*.01)*4. + flutter*3. - reach*sway*3.);
    // right pine and shore bushes
    float bush = box(p, vec4(30.,890.,170.,1160.), 18.) + box(p, vec4(855.,720.,941.,1260.), 18.);
    float bushTop = bush*smoothstep(1180., 900., p.y);
    off.x += bushTop*(sin(t*1.1 + p.y*.03 + p.x*.01))*2.2*gust;
    // foreground grass, tips move more than roots
    float grass = box(p, vec4(0.,1478.,941.,1672.), 14.)*(1. - box(p, vec4(700.,1490.,905.,1565.), 12.));
    off.x += grass*smoothstep(1672., 1490., p.y)*(sin(t*1.3 + p.x*.025 + noise(vec2(p.x*.01, t*.2))*3.))*2.2*gust;
    // clouds band drifting a little
    float cloud = box(p, vec4(0.,705.,941.,800.), 22.)*smoothstep(45., 70., length(p - vec2(792.,697.)));
    off.x += cloud*sin(t*.12)*5.;

    vec3 c = texture2D(uImg, (p + off)/RES).rgb;
    float lum = dot(c, vec3(.299,.587,.114));
    vec3 paper = vec3(.97,.94,.87);

    // flame brightness + warm light on the kids and the ground
    float fl = .85 + .15*noise(vec2(t*7., 1.)) + .08*sin(t*13.) + .05*sin(t*23.7);
    c += m.g*smoothstep(.55,.9,lum)*(fl - .9)*.9;
    vec2 dg = (p - vec2(440.,1215.))*vec2(1.,1.25);
    float glow = exp(-dot(dg,dg)/(2.*190.*190.));
    c += vec3(1.,.88,.7)*glow*(fl - .84)*.32;
    c += vec3(1.,.9,.75)*m.b*step(900., p.y)*glow*smoothstep(.15,.5,lum)*(fl - .84)*.35;

    // smoke rising from the fire
    float sy = 1150. - p.y;
    float sxc = 440. + sy*.12 + sin(t*.45 + p.y*.012)*14.;
    float sw = 18. + sy*.32;
    float sm = exp(-pow(p.x - sxc, 2.)/(2.*sw*sw))*smoothstep(0., 40., sy)*smoothstep(330., 140., sy);
    float sn = fbm(vec2(p.x*.018 + sin(p.y*.01 + t*.3)*.7, p.y*.011 + t*.38));
    c = mix(c, vec3(.82,.79,.73), sm*smoothstep(.38,.72,sn)*.45);

    // sparks
    for (int i = 0; i < 16; i++){
      float fi = float(i);
      float per = 2.0 + hash(vec2(fi,3.1))*1.8;
      float tt = t/per + hash(vec2(fi,7.7));
      float k = fract(tt), cyc = floor(tt);
      float hx = hash(vec2(fi, cyc));
      vec2 sp = vec2(440. + (hx - .5)*70. + sin(k*6. + fi)*16.*k, 1178. - k*(180. + hx*170.));
      vec2 d = p - sp;
      float a = (1. - k)*smoothstep(0., .08, k);
      c = mix(c, paper, a*exp(-dot(d,d)/2.6)*.95);
    }

    // fireflies along the shore
    for (int i = 0; i < 9; i++){
      float fi = float(i);
      vec2 base = vec2(60. + hash(vec2(fi,1.7))*820., 1090. + hash(vec2(fi,4.2))*110.);
      vec2 fp = base + vec2(sin(t*(.21 + hash(vec2(fi,9.))*.2) + fi*2.)*55., cos(t*(.17 + hash(vec2(fi,5.))*.15) + fi)*22.);
      float blink = pow(max(0., sin(t*(.6 + hash(vec2(fi,2.))*.5) + fi*1.9)), 5.);
      vec2 d = p - fp; float d2 = dot(d,d);
      c = mix(c, paper, blink*(exp(-d2/3.)*.95 + exp(-d2/60.)*.25));
    }

    // stars twinkle
    for (int i = 0; i < 16; i++){
      vec2 dv = p - uStars[i]; float d2 = dot(dv,dv);
      if (d2 > 500.) continue;
      float h = hash(uStars[i]);
      float tw = .5 + .5*sin(t*(.9 + h*1.8) + h*40.); tw *= tw;
      float w = exp(-d2/7.);
      c = mix(c, c*.65, w*(1. - tw)*.8);
      float glint = exp(-abs(dv.x)*1.1)*exp(-abs(dv.y)/6.) + exp(-abs(dv.y)*1.1)*exp(-abs(dv.x)/6.);
      c += paper*(w*.3 + glint*.28)*tw;
    }

    // shooting star every ~11 s
    float per = 11.;
    float cyc = floor(t/per), u = t - cyc*per;
    if (u < 0.9) {
      vec2 s0 = vec2(520. + hash(vec2(cyc,1.))*360., 535. + hash(vec2(cyc,2.))*80.);
      vec2 dir = normalize(vec2(-1., .42));
      vec2 head = s0 + dir*u*380.;
      vec2 tail = head - dir*(150. + 70.*u);
      float d = segDist(p, head, tail);
      float along = clamp(dot(p - tail, dir)/length(head - tail), 0., 1.);
      float fade = smoothstep(0., .1, u)*smoothstep(.9, .55, u);
      c = mix(c, vec3(1.), (exp(-d*d/3.5) + exp(-d*d/40.)*.35)*along*along*fade);
    }

    // moon halo
    float dm = length(p - vec2(792.,697.));
    c += paper*smoothstep(28.,35.,dm)*smoothstep(95.,35.,dm)*(.05 + .035*sin(t*.7));

    // glints on the moon path
    float pm = m.r*smoothstep(740.,770.,p.x)*smoothstep(852.,815.,p.x);
    c += paper*pm*pow(noise(vec2(p.x*.12, p.y*.5 - t*.9 + sin(p.x*.05)*2.)), 5.)*.8;

    // fog drifting over the island
    float band = smoothstep(795.,850.,p.y)*smoothstep(960.,905.,p.y);
    float xm = smoothstep(40.,100.,p.x)*smoothstep(915.,870.,p.x);
    float f = fbm(vec2(p.x*.005 - t*.035, p.y*.018 + t*.01))*.6 + fbm(vec2(p.x*.009 + t*.05, p.y*.03))*.4;
    c = mix(c, vec3(.87,.84,.78), band*xm*smoothstep(.4,.75,f)*.26);

    // radio waves from the antenna, in bursts
    float burst = smoothstep(.0, .25, sin(t*6.2832/14.));
    vec2 rv = p - vec2(382.,1088.);
    float r = length(rv);
    float wave = fract(t/2.8)*85.;
    float reg = step(340.,p.x)*step(p.x,442.)*step(1030.,p.y)*step(p.y,1094.);
    c += paper*reg*burst*smoothstep(.45,.7,lum)*exp(-(r - wave)*(r - wave)/30.)*.7*(1. - wave/85.);

    gl_FragColor = vec4(c, 1.);
  }`;
