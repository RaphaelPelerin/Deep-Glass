var DeepSky=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});var t=Object.defineProperty,n=(e,t,n)=>()=>{if(n)throw n[0];try{return e&&(t=e(e=0)),t}catch(e){throw n=[e],e}},r=(e,n)=>{let r={};for(var i in e)t(r,i,{get:e[i],enumerable:!0});return n||t(r,Symbol.toStringTag,{value:`Module`}),r},i=`"use strict";(()=>{var $=\`
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
\`,O=\`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec4 uFrame;      // xy: resolution, z: animation time, w: clock (s)
uniform vec4 uPointer;    // xy: light position (0..1, y up), z: dark mix, w: last sweep (clock)
uniform vec4 uRipples[4]; // xy: center (0..1), z: start (clock), w: strength
uniform vec4 uMix;        // nebula, aurora, rays, glow intensities
uniform vec4 uFx;         // lens, grain, vignette, shimmer
uniform vec4 uShape;      // nebula scale, aurora offset, rays spread, intro duration
uniform vec3 uBg;
uniform vec3 uNeb0;
uniform vec3 uNeb1;
uniform vec3 uNeb2;
uniform vec3 uNeb3;
uniform vec3 uAur0;
uniform vec3 uAur1;
uniform vec3 uRays;
uniform vec3 uGlow;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.03 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 res = uFrame.xy;
  float t = uFrame.z;
  float clock = uFrame.w;
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // shockwaves: expanding rings that bend everything behind them
  float ring = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 rp = uRipples[i];
    float age = clock - rp.z;
    if (rp.w > 0.0 && age > 0.0 && age < 3.0) {
      vec2 dv = p - (rp.xy - 0.5) * vec2(aspect, 1.0);
      float d = length(dv);
      float w = d - age * 0.85;
      float k = exp(-w * w * 380.0) * (1.0 - age / 3.0) * rp.w;
      ring += k;
      p += dv / (d + 1e-4) * k * 0.035;
    }
  }

  // roaming light (follows the cursor) with a subtle magnifying lens
  vec2 md = p - (uPointer.xy - 0.5) * vec2(aspect, 1.0);
  float ml = exp(-dot(md, md) * 7.0);
  p -= md * 0.08 * ml * uFx.x;

  // nebula
  float neb = 0.0;
  vec3 nebCol = uNeb0;
  if (uMix.x > 0.0) {
    vec2 np = p * uShape.x;
    vec2 q = vec2(fbm(np * 1.3 + vec2(0.0, t * 0.035)),
                  fbm(np * 1.3 + vec2(5.2, -t * 0.03)));
    vec2 r = vec2(fbm(np * 1.7 + 3.0 * q + vec2(1.7, 9.2) + t * 0.045),
                  fbm(np * 1.7 + 3.0 * q + vec2(8.3, 2.8) - t * 0.04));
    neb = smoothstep(0.26, 0.92, fbm(np * 1.5 + 3.2 * r));
    nebCol = mix(uNeb0, uNeb1, clamp(q.x * 1.7 - 0.2, 0.0, 1.0));
    nebCol = mix(nebCol, uNeb2, clamp(r.y * r.y * 2.0, 0.0, 1.0));
    nebCol = mix(nebCol, uNeb3, clamp(r.x * r.x * r.x * 2.2, 0.0, 1.0) * 0.55);
    // slow drift of the palette towards warm highlights
    nebCol = mix(nebCol, nebCol.brg * vec3(1.1, 0.95, 0.6), uFx.w * (0.5 + 0.5 * sin(t * 0.045)));
  }

  // aurora: waving curtains with a sharp lower edge and vertical streaks
  float aur = 0.0;
  vec3 aurCol = vec3(0.0);
  if (uMix.y > 0.0) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float yc = uShape.y + fi * 0.1
        + 0.07 * sin(p.x * (1.4 + fi * 0.6) + t * (0.22 + fi * 0.07) + fi * 2.1)
        + 0.03 * sin(p.x * 5.3 - t * 0.41 + fi * 1.3)
        + 0.015 * sin(p.x * 11.0 + t * 0.9 + fi);
      float dy = p.y - yc;
      float band = exp(-max(dy, 0.0) * 7.0) * exp(-max(-dy, 0.0) * 30.0);
      float streak = 0.45 + 0.55 * noise(vec2(p.x * 24.0 + fi * 17.0 + t * 0.15, t * 0.5 + fi));
      float a = band * streak * (1.0 - fi * 0.22);
      aur += a;
      aurCol += a * mix(uAur0, uAur1, clamp(dy * 5.0 + fi * 0.25, 0.0, 1.0));
    }
  }

  // light beams from a slowly swaying source above the screen
  float rays = 0.0;
  if (uMix.z > 0.0) {
    vec2 sv = p - vec2(0.45 * sin(t * 0.06), 0.95);
    float ang = atan(sv.x, -sv.y);
    float s = uShape.z;
    rays = pow(0.5 + 0.5 * sin(ang * 11.0 * s + t * 0.3), 7.0)
      + 0.7 * pow(0.5 + 0.5 * sin(ang * 6.0 * s - t * 0.2 + 1.3), 9.0)
      + 0.5 * pow(0.5 + 0.5 * sin(ang * 19.0 * s + t * 0.45 + 2.1), 12.0);
    rays *= exp(-length(sv) * 0.9) * smoothstep(1.3, 0.2, abs(ang));
  }

  // diagonal light sweep (pulse)
  float sweep = 0.0;
  float pa = clock - uPointer.w;
  if (uPointer.w > 0.0 && pa > 0.0 && pa < 1.6) {
    float x = uv.x + (uv.y - 0.5) * 0.35;
    sweep = exp(-pow((x - (pa * 1.1 - 0.2)) * 7.0, 2.0)) * (1.0 - pa / 1.6);
  }

  float intro = uShape.w > 0.0 ? smoothstep(0.0, uShape.w, clock) : 1.0;

  // dark theme: additive light over a deep background
  vec3 dark = uBg;
  dark += nebCol * neb * 0.75 * uMix.x;
  dark += aurCol * 0.45 * uMix.y;
  dark += uRays * rays * 0.17 * uMix.z;
  dark += uGlow * ml * (0.14 + neb * 0.45) * uMix.w;
  dark += uGlow * (ring * 0.35 + sweep * 0.12);
  dark = mix(uBg, dark, intro);
  dark *= 1.0 - uFx.z * dot(uv - 0.5, uv - 0.5);

  // light theme: soft pastel tints over a bright background
  vec3 light = uBg;
  light = mix(light, mix(nebCol, uBg, 0.45), neb * 0.3 * uMix.x);
  light = mix(light, mix(aurCol / max(aur, 1e-3), uBg, 0.5), clamp(aur, 0.0, 1.0) * 0.28 * uMix.y);
  light = mix(light, mix(uRays, uBg, 0.5),
    clamp(rays * 0.25 * uMix.z + ml * 0.22 * uMix.w + ring * 0.2 + sweep * 0.15, 0.0, 1.0));
  light = mix(uBg, light, intro);

  vec3 col = mix(light, dark, uPointer.z);
  col += (hash(gl_FragCoord.xy + fract(clock * 7.0) * 113.0) - 0.5) * uFx.y;
  gl_FragColor = vec4(col, 1.0);
}
\`;var _=["uFrame","uPointer","uRipples","uMix","uFx","uShape","uBg","uNeb0","uNeb1","uNeb2","uNeb3","uAur0","uAur1","uRays","uGlow"],W=2.2,U=typeof requestAnimationFrame=="function"?n=>requestAnimationFrame(n):n=>setTimeout(n,16),q=typeof cancelAnimationFrame=="function"?n=>cancelAnimationFrame(n):n=>clearTimeout(n);function G(n,t,e){try{return n.getContext(t,e)}catch{return null}}function j(n,t){if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(n,t);let e=document.createElement("canvas");return e.width=n,e.height=t,e}var C=n=>\`\${Math.round(n[0]*255)},\${Math.round(n[1]*255)},\${Math.round(n[2]*255)}\`;function H(n,t,e){let i=(s,r)=>[s[0]+(r[0]-s[0])*e,s[1]+(r[1]-s[1])*e,s[2]+(r[2]-s[2])*e];return{background:i(n.background,t.background),nebula:[i(n.nebula[0],t.nebula[0]),i(n.nebula[1],t.nebula[1]),i(n.nebula[2],t.nebula[2]),i(n.nebula[3],t.nebula[3])],aurora:[i(n.aurora[0],t.aurora[0]),i(n.aurora[1],t.aurora[1])],rays:i(n.rays,t.rays),glow:i(n.glow,t.glow),stars:[i(n.stars[0],t.stars[0]),i(n.stars[1],t.stars[1]),i(n.stars[2],t.stars[2])],spotlight:[i(n.spotlight[0],t.spotlight[0]),i(n.spotlight[1],t.spotlight[1])],lines:i(n.lines,t.lines),meteor:i(n.meteor,t.meteor),grid:[...i([n.grid[0],n.grid[1],n.grid[2]],[t.grid[0],t.grid[1],t.grid[2]]),n.grid[3]+(t.grid[3]-n.grid[3])*e]}}var I=class{constructor(t,e,i,s){this.glCanvas=t;this.fxCanvas=e;this.emit=i;this.cfg=s.config,this.dark=s.dark,this.darkMix=s.dark?1:0,this.palette=s.dark?s.config.palettes.dark:s.config.palettes.light,this.animated=s.animated,this.stats=s.stats,this.glScale=s.config.scale,this.glStep=1/(s.config.fps+1),s.config.intro&&(this.ripples.set([.5,.8,.35,1],0),this.nextRipple=1),this.initGl()||this.fail(),this.ctx=G(e,"2d")}glCanvas;fxCanvas;emit;gl=null;off=null;view=null;u={};ctx;cfg;dark;darkMix;palette;paletteMix=-1;animated;visible=!0;sized=!1;running=!1;rafId=0;t0=performance.now();time=0;last=0;lastGl=-1;lastFx=-1;glStep;glScale;busyUntil=0;lastPointer=-99;w=1;h=1;dpr=1;spotAlpha=0;mouse={x:.5,y:.6,tx:.5,ty:.6,px:-9999,py:-9999,sx:-9999,sy:-9999,inside:!1};ripples=new Float32Array(16);nextRipple=0;sweepAt=0;stars=[];meteors=[];rings=[];near=[];nextMeteor=2;sprites=[];spriteKey="";frameTimes=0;frameCount=0;adaptAt=0;stats;statsAt=0;statFx=0;statGl=0;readySent=!1;models=null;modelDpr=1;handle(t){switch(t.type){case"config":this.setConfig(t.config);break;case"resize":this.resize(t.w,t.h,t.dpr);break;case"pointer":this.pointer(t.x,t.y,t.inside);break;case"click":this.click(t.x,t.y,t.effect??this.cfg.click);break;case"pulse":this.sweepAt=this.now();break;case"theme":if(this.dark===t.dark)break;this.dark=t.dark,this.running||this.renderStatic();break;case"animated":this.animated=t.on,this.sync();break;case"visible":this.visible=t.on,this.sync();break;case"busy":this.busyUntil=this.now()+2;break;case"stats":this.stats=t.on;break;case"modelData":this.models?.load(t.key,t.asset);break;case"modelPlaces":this.placeModels(t.places);break}}placeModels(t){this.cfg.models=this.cfg.models.map((e,i)=>{let[s,r,l]=t.slice(i*3,i*3+3);return Number.isFinite(s)?{...e,x:s,y:r,size:l}:e}),this.models?.place(this.cfg.models),this.running||this.renderStatic()}attachModels(t){this.models?.destroy(),this.models=t,t.onChange=()=>{this.running||this.renderStatic()},t.configure(this.cfg.models),t.resize(this.w,this.h,this.modelDpr),this.lastGl=-1,this.running||this.renderStatic()}destroy(){this.models?.destroy(),this.models=null,this.stop(),this.gl?.getExtension("WEBGL_lose_context")?.loseContext(),this.gl=null}now(){return(performance.now()-this.t0)/1e3}fail(){this.gl=null,this.emit({type:"glFailed"})}markReady(){this.readySent||(this.readySent=!0,this.emit({type:"ready"}))}initGl(){let t={alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1},e=null;if(typeof OffscreenCanvas<"u"){let r=new OffscreenCanvas(1,1);e=G(r,"webgl",t);let l=e?G(this.glCanvas,"bitmaprenderer"):null;e&&l?(this.off=r,this.view=l):e=null}if(e??=G(this.glCanvas,"webgl",t),!e||!this.setupProgram(e))return!1;let i=e,s=this.off??this.glCanvas;return s.addEventListener("webglcontextlost",r=>{r.preventDefault(),this.gl=null}),s.addEventListener("webglcontextrestored",()=>{this.setupProgram(i)?this.gl=i:this.fail()}),this.gl=e,!0}setupProgram(t){let e=(u,f)=>{let c=t.createShader(u);return c?(t.shaderSource(c,f),t.compileShader(c),t.getShaderParameter(c,t.COMPILE_STATUS)?c:(t.isContextLost()||console.warn("[deep-sky]",t.getShaderInfoLog(c)),null)):null},i=e(t.VERTEX_SHADER,$),s=e(t.FRAGMENT_SHADER,O),r=t.createProgram();if(!i||!s||!r)return!1;if(t.attachShader(r,i),t.attachShader(r,s),t.linkProgram(r),!t.getProgramParameter(r,t.LINK_STATUS))return t.isContextLost()||console.warn("[deep-sky]",t.getProgramInfoLog(r)),!1;t.useProgram(r),t.bindBuffer(t.ARRAY_BUFFER,t.createBuffer()),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW);let l=t.getAttribLocation(r,"aPos");t.enableVertexAttribArray(l),t.vertexAttribPointer(l,2,t.FLOAT,!1,0,0);for(let u of _)this.u[u]=t.getUniformLocation(r,u);return!0}shaderPalette(){if(this.paletteMix!==this.darkMix){let{dark:t,light:e}=this.cfg.palettes;this.palette=this.darkMix>=1?t:this.darkMix<=0?e:H(e,t,this.darkMix),this.paletteMix=this.darkMix}return this.palette}renderGl(t){let e=this.gl;if(!e)return;let{u:i,cfg:s,mouse:r}=this,l=this.shaderPalette(),u=e.drawingBufferWidth,f=e.drawingBufferHeight;e.viewport(0,0,u,f),e.uniform4f(i.uFrame,u,f,this.time,t),e.uniform4f(i.uPointer,r.x,r.y,this.darkMix,this.sweepAt),e.uniform4fv(i.uRipples,this.ripples),e.uniform4f(i.uMix,s.nebula,s.aurora,s.rays,s.glow),e.uniform4f(i.uFx,s.lens,s.grain,s.vignette,s.shimmer),e.uniform4f(i.uShape,s.nebulaScale,s.auroraPosition-.5,s.raysSpread,s.intro?W:0),e.uniform3fv(i.uBg,l.background),e.uniform3fv(i.uNeb0,l.nebula[0]),e.uniform3fv(i.uNeb1,l.nebula[1]),e.uniform3fv(i.uNeb2,l.nebula[2]),e.uniform3fv(i.uNeb3,l.nebula[3]),e.uniform3fv(i.uAur0,l.aurora[0]),e.uniform3fv(i.uAur1,l.aurora[1]),e.uniform3fv(i.uRays,l.rays),e.uniform3fv(i.uGlow,l.glow),e.drawArrays(e.TRIANGLES,0,3);let c=this.models?.active?this.models:null;if(this.off&&this.view){let b=this.off.transferToImageBitmap();c?.backdrop(b),this.view.transferFromImageBitmap(b)}else c?.backdrop(this.glCanvas);this.statGl++,this.markReady()}sync(){this.animated&&this.visible?this.start():(this.stop(),this.animated||this.renderStatic())}start(){if(this.running||!this.sized||!this.animated||!this.visible)return;this.running=!0,this.last=this.now(),this.statsAt=this.last,this.statFx=0,this.statGl=0,this.adaptAt=this.last+3;let t=()=>{if(!this.running)return;this.rafId=U(t);let e=this.now(),i=e-this.last;this.last=e,this.time+=Math.min(i,.1)*this.cfg.speed;let s=e<this.busyUntil,r=e-this.lastPointer<5,l=this.cfg.grid>0&&this.cfg.gridSpeed>0||!!this.models?.active,u=!s&&(r||l||this.cfg.fps>45)?1/62:1/31;if(e-this.lastFx>=u){let f=Math.min(.05,Math.max(.001,e-this.lastFx))*60;this.lastFx=e,this.step(f),this.renderFx(e,f),this.renderModels(e)}e-this.lastGl>=(s?1/12:this.glStep)&&(this.lastGl=e,this.renderGl(e)),this.adapt(e,i),this.report(e)};this.rafId=U(t)}stop(){this.running=!1,q(this.rafId)}renderStatic(){if(!this.sized)return;this.darkMix=this.dark?1:0,this.mouse.x=.5,this.mouse.y=.6,this.spotAlpha=0;let t=this.now()+100;this.renderGl(t),this.renderFx(t,0),this.renderModels(t)}renderModels(t){let e=this.models;if(!e?.active)return;let i=this.mouse;e.render({time:this.time,clock:t,light:[i.x,i.y],ripples:this.ripples,sweepAt:this.sweepAt,palette:this.shaderPalette(),dark:this.darkMix,glow:this.cfg.glow,animated:this.running})}step(t){let e=this.mouse;e.inside||(e.tx=.5+.32*Math.sin(this.time*.11),e.ty=.62+.18*Math.sin(this.time*.17+1));let i=1-Math.pow(.93,t);e.x+=(e.tx-e.x)*i,e.y+=(e.ty-e.y)*i;let s=this.dark?1:0;this.darkMix+=(s-this.darkMix)*(1-Math.pow(.9,t)),Math.abs(s-this.darkMix)<.002&&(this.darkMix=s)}adapt(t,e){if(!this.cfg.adaptive||(e<.25&&(this.frameTimes+=e,this.frameCount++),t-this.adaptAt<1.5))return;let i=this.frameCount,s=i?this.frameTimes/i:0;this.frameTimes=0,this.frameCount=0,this.adaptAt=t,!(i<20||s<=1/40)&&(this.models?.active&&this.modelDpr>1.01?(this.modelDpr=Math.max(1,this.modelDpr*.75),this.models.resize(this.w,this.h,this.modelDpr)):this.glScale>this.cfg.minScale+.01?(this.glScale=Math.max(this.cfg.minScale,this.glScale*.7),this.applySize()):this.glStep<1/15&&(this.glStep+=1/60))}report(t){if(!this.stats)return;let e=t-this.statsAt;e<1||(this.emit({type:"stats",fps:Math.round(this.statFx/e),shaderFps:Math.round(this.statGl/e),scale:Math.round(this.glScale*100)/100,particles:this.stars.length}),this.statsAt=t,this.statFx=0,this.statGl=0)}setConfig(t){let e=this.cfg;this.cfg=t,this.paletteMix=-1;let i=s=>JSON.stringify([s.palettes.dark.stars,s.palettes.dark.meteor,s.palettes.light.stars,s.palettes.light.meteor]);i(t)!==i(e)&&(this.spriteKey=""),(t.scale!==e.scale||t.minScale!==e.minScale)&&(this.glScale=t.scale,this.sized&&this.applySize()),t.fps!==e.fps&&(this.glStep=1/(t.fps+1)),t.meteors!==e.meteors&&(this.nextMeteor=this.time+.5),this.models?.configure(t.models),this.sized&&this.fitStars(),this.running||this.renderStatic()}resize(t,e,i){let s=Math.max(1,t)/this.w,r=Math.max(1,e)/this.h;if(this.w=Math.max(1,t),this.h=Math.max(1,e),this.dpr=i,this.modelDpr=i,this.applySize(),this.sized)for(let l of this.stars)l.x*=s,l.y*=r;this.fitStars(),this.sized?this.running||this.renderStatic():(this.sized=!0,this.sync())}applySize(){let t=Math.max(1,Math.round(this.w*this.glScale)),e=Math.max(1,Math.round(this.h*this.glScale));this.glCanvas.width=t,this.glCanvas.height=e,this.off&&(this.off.width=t,this.off.height=e),this.fxCanvas.width=Math.max(1,Math.round(this.w*this.dpr)),this.fxCanvas.height=Math.max(1,Math.round(this.h*this.dpr)),this.ctx?.setTransform(this.dpr,0,0,this.dpr,0,0),this.models?.resize(this.w,this.h,this.modelDpr)}pointer(t,e,i){let s=this.mouse;s.inside=i,i&&(s.sx<-1e3&&(s.sx=t,s.sy=e),s.px=t,s.py=e,s.tx=t/this.w,s.ty=1-e/this.h,this.lastPointer=this.now())}click(t,e,i){if(!this.running||i==="none")return;let s=this.now(),r=i==="shockwave";this.rings.length<24&&this.rings.push({x:t,y:e,start:s,strong:r}),r&&this.ripples.set([t/this.w,1-e/this.h,s,1],this.nextRipple++%4*4);let l=r?260:160,u=r?6:2.2;for(let f of this.stars){let c=f.x-t,b=f.y-e,M=Math.sqrt(c*c+b*b)||1;if(M>l)continue;let y=(1-M/l)*u;f.ix+=c/M*y,f.iy+=b/M*y}}fitStars(){let t=Math.min(220,Math.max(70,this.w*this.h/8e3)),e=Math.round(t*this.cfg.stars);for(;this.stars.length<e;)this.stars.push(this.newStar(!0));this.stars.length>e&&(this.stars.length=e)}newStar(t){let e=.15+Math.pow(Math.random(),1.5)*.85;return{x:Math.random()*this.w,y:t?Math.random()*this.h:this.h+10,z:e,vx:(Math.random()-.5)*.1*e,vy:-(.05+Math.random()*.25)*e,ix:0,iy:0,size:.5+e*1.6,phase:Math.random()*Math.PI*2,tint:Math.floor(Math.random()*3)}}buildSprites(t,e){this.sprites=[...t.stars,t.meteor].map(i=>{let s=j(64,64),r=G(s,"2d");if(r){let l=C(i),u=r.createRadialGradient(32,32,0,32,32,32);u.addColorStop(0,\`rgba(\${l},1)\`),u.addColorStop(.12,\`rgba(\${l},0.85)\`),u.addColorStop(.35,\`rgba(\${l},0.2)\`),u.addColorStop(1,\`rgba(\${l},0)\`),r.fillStyle=u,r.fillRect(0,0,64,64)}return s}),this.spriteKey=e}renderGrid(t,e){let i=this.cfg,{w:s,h:r}=this,[l,u,f,c]=e.grid,b=\`\${Math.round(l*255)},\${Math.round(u*255)},\${Math.round(f*255)}\`,M=c*i.grid;if(M<=0)return;let y=i.gridSize,E=i.gridTilt*Math.PI/180,T=Math.sin(E),L=Math.cos(E),S=700,v=i.gridHeight*r*.8,P=h=>S/(S+h*T),F=h=>r-h*L*P(h),k=F(v);if(r-k<1)return;let o=t.createLinearGradient(0,r,0,k);for(let h=0;h<=8;h++){let g=v*h/8;o.addColorStop((r-F(g))/(r-k),\`rgba(\${b},\${M*(1-h/8)})\`)}let a=P(v);t.globalAlpha=1,t.fillStyle=o,t.beginPath();let p=Math.ceil(s/y);for(let h=-p;h<=p;h++){let g=h*y,d=s/2+g,m=s/2+g*a;Math.max(d,m)<-1||Math.min(d,m)>s+1||(t.moveTo(d-.5,r),t.lineTo(d+.5,r),t.lineTo(m+.5*a,k),t.lineTo(m-.5*a,k),t.closePath())}t.fill();let x=this.time*26.67*i.gridSpeed%y;for(let h=(y-x)%y;h<v;h+=y){let g=P(h),d=L*g*g,m=d*y,w=M*(1-h/v)*Math.min(1,d)*Math.min(1,m/4);if(w<.002)continue;t.fillStyle=\`rgba(\${b},\${w})\`;let z=Math.max(1,d);t.fillRect(0,F(h)-z/2,s,z)}}renderFx(t,e){let i=this.ctx;if(!i)return;let s=this.cfg,r=this.darkMix>.5,l=r?s.palettes.dark:s.palettes.light,u=r?"dark":"light";this.spriteKey!==u&&this.buildSprites(l,u),i.clearRect(0,0,this.w,this.h),i.globalCompositeOperation="source-over",s.grid>0&&this.renderGrid(i,l),i.globalCompositeOperation=r?"lighter":"source-over";let f=r?1:.55,c=this.mouse;if(e>0){let o=c.inside&&s.spotlight>0?1:0;this.spotAlpha+=(o-this.spotAlpha)*(1-Math.pow(.85,e));let a=1-Math.pow(.55,e);c.sx+=(c.px-c.sx)*a,c.sy+=(c.py-c.sy)*a}if(this.spotAlpha>.01&&s.spotlight>0){let o=this.spotAlpha*s.spotlight,a=s.spotlightRadius,[p,x]=l.spotlight,h=i.createRadialGradient(c.sx,c.sy,0,c.sx,c.sy,a);h.addColorStop(0,\`rgba(\${C(p)},\${(r?.45:.3)*o})\`),h.addColorStop(r?.35:.4,\`rgba(\${C(x)},\${(r?.16:.1)*o})\`),h.addColorStop(1,\`rgba(\${C(x)},0)\`),i.globalAlpha=1,i.fillStyle=h,i.fillRect(c.sx-a,c.sy-a,a*2,a*2)}let b=46*s.parallax,M=(c.x-.5)*-b,y=(c.y-.5)*b,E=Math.pow(.94,e),T=e*s.starSpeed*s.speed,L=c.inside&&e>0&&s.field>0,S=s.fieldRadius,v=this.near;v.length=0;let P=5*s.starSize,F=s.twinkle*.45;for(let o of this.stars){let a=o.x+M*o.z,p=o.y+y*o.z;if(L){let m=a-c.px,w=p-c.py,z=m*m+w*w;if(z<S*S){let A=Math.sqrt(z)||1,D=(1-A/S)*o.z*e*s.field;o.ix+=(-w/A*.32+m/A*.1)*D,o.iy+=(m/A*.32+w/A*.1)*D,s.constellations&&v.push({x:a,y:p,d:A})}}o.ix*=E,o.iy*=E,o.x+=o.vx*T+o.ix*e,o.y+=o.vy*T+o.iy*e,(o.y<-20||o.y>this.h+20||o.x<-40||o.x>this.w+40)&&Object.assign(o,this.newStar(!1));let x=1-F*(1-Math.sin(this.time*(1.2+o.z*1.5)+o.phase)),h=o.size*P,g=(.2+.8*o.z)*x*f,d=this.sprites[o.tint];if(i.globalAlpha=g,i.drawImage(d,a-h,p-h,h*2,h*2),s.flares&&o.z>.88){let m=h*1.8*x;i.globalAlpha=g*.55,i.drawImage(d,a-m,p-.6,m*2,1.2),i.drawImage(d,a-.6,p-m,1.2,m*2)}}if(v.length){let o=s.linkDistance;i.lineWidth=.8,i.strokeStyle=\`rgb(\${C(l.lines)})\`;for(let a=0;a<v.length;a++){let p=v[a],x=1-p.d/S;i.globalAlpha=x*.35*f,i.beginPath(),i.moveTo(p.x,p.y),i.lineTo(c.px,c.py),i.stroke();for(let h=a+1;h<v.length;h++){let g=v[h],d=p.x-g.x,m=p.y-g.y,w=Math.sqrt(d*d+m*m);w>o||(i.globalAlpha=(1-w/o)*x*.7*f,i.beginPath(),i.moveTo(p.x,p.y),i.lineTo(g.x,g.y),i.stroke())}}}if(e>0&&s.meteors>0&&this.time>this.nextMeteor){this.nextMeteor=this.time+(2.5+Math.random()*4.5)/s.meteors;let o=Math.random()<.5?1:-1,a=(.35+Math.random()*.35)*Math.PI*.5,p=9+Math.random()*7;this.meteors.push({x:this.w*(.15+Math.random()*.7),y:this.h*Math.random()*.35,vx:Math.cos(a)*p*o,vy:Math.sin(a)*p,life:1,len:140+Math.random()*180})}let k=e*Math.max(0,s.speed);for(let o=this.meteors.length-1;o>=0;o--){let a=this.meteors[o];if(a.x+=a.vx*k,a.y+=a.vy*k,a.life-=.013*k,a.life<=0){this.meteors.splice(o,1);continue}let p=Math.hypot(a.vx,a.vy),x=a.x-a.vx/p*a.len,h=a.y-a.vy/p*a.len,g=C(l.meteor),d=i.createLinearGradient(x,h,a.x,a.y);d.addColorStop(0,\`rgba(\${g},0)\`),d.addColorStop(1,\`rgba(\${g},\${.9*a.life})\`),i.globalAlpha=f,i.strokeStyle=d,i.lineWidth=1.6,i.beginPath(),i.moveTo(x,h),i.lineTo(a.x,a.y),i.stroke(),i.globalAlpha=a.life*f,i.drawImage(this.sprites[3],a.x-9,a.y-9,18,18)}for(let o=this.rings.length-1;o>=0;o--){let a=this.rings[o],p=(t-a.start)/(a.strong?1.1:.9);if(p>=1||p<0){this.rings.splice(o,1);continue}i.strokeStyle=\`rgb(\${C(l.lines)})\`,i.globalAlpha=(1-p)*(a.strong?.5:.35)*f,i.lineWidth=(a.strong?1.8:1.2)*(1-p)+.3,i.beginPath(),i.arc(a.x,a.y,(1-Math.pow(1-p,3))*(a.strong?190:110),0,Math.PI*2),i.stroke()}i.globalAlpha=1,i.globalCompositeOperation="source-over",this.statFx++,this.markReady()}};var R=self,N=null,B=n=>R.postMessage(n);R.addEventListener("message",({data:n})=>{if(n.type==="init")N=new I(n.gl,n.fx,B,n);else if(n.type==="modelsInit")try{let t=URL.createObjectURL(new Blob([n.code],{type:"text/javascript"}));if(R.importScripts(t),URL.revokeObjectURL(t),!R.deepSkyModels)throw new Error("the 3D layer did not load");N?.attachModels(R.deepSkyModels(n.canvas,B))}catch(t){B({type:"modelError",key:"*",message:\`3D layer: \${t instanceof Error?t.message:t}\`})}else N?.handle(n)});R.postMessage({type:"boot"});})();
`;let a=/* @__PURE__ */ new Map,o,s=e=>Math.min(1,Math.max(0,e));function c(e){let t=String(e).trim(),n=a.get(t);return n||(n=u(t)??d(t)??f(t)??[1,0,1,1],a.set(t,n)),n}function l(e,t=1){let[n,r,i,a]=c(e),o=e=>Math.round(e*255);return`rgba(${o(n)}, ${o(r)}, ${o(i)}, ${+(a*t).toFixed(3)})`}function u(e){let t=/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(e);if(!t)return null;let n=t[1];n.length<=4&&(n=[...n].map(e=>e+e).join(``));let r=e=>parseInt(n.slice(e,e+2),16)/255;return[r(0),r(2),r(4),n.length===8?r(6):1]}function d(e){let t=/^rgba?\((.*)\)$/i.exec(e);if(!t)return null;let n=t[1].split(/[\s,/]+/).filter(Boolean);if(n.length<3||n.length>4)return null;let r=(e,t)=>{let n=Number(e.endsWith(`%`)?e.slice(0,-1):e);return e.endsWith(`%`)?n/100:n/t},i=[r(n[0],255),r(n[1],255),r(n[2],255),n[3]===void 0?1:r(n[3],1)];return i.some(e=>!Number.isFinite(e))?null:i.map(s)}function f(e){if(o===void 0){o=null;try{o=(typeof OffscreenCanvas<`u`?new OffscreenCanvas(1,1):typeof document<`u`?Object.assign(document.createElement(`canvas`),{width:1,height:1}):null)?.getContext(`2d`,{willReadFrequently:!0})??null}catch{o=null}}if(!o)return null;o.fillStyle=`#000`,o.fillStyle=e;let t=o.fillStyle;if(o.fillStyle=`#fff`,o.fillStyle=e,t!==o.fillStyle)return null;o.clearRect(0,0,1,1),o.fillRect(0,0,1,1);let n=o.getImageData(0,0,1,1).data;return[n[0]/255,n[1]/255,n[2]/255,n[3]/255]}let p=[`auto`,`chrome`,`glass`,`hologram`,`iridescent`,`wire`,`nebula`],m=[`orb`,`knot`,`torus`,`crystal`,`gem`,`planet`,`cube`],h={cosmos:{palette:{dark:{background:`#030409`,nebula:[`#3d178c`,`#0a47bf`,`#009ea8`,`#d92e9e`],aurora:[`#1affb8`,`#9e52ff`],rays:`#8cb8ff`,glow:`#6cbcff`,stars:[`#aadcff`,`#c8aaff`,`#ffffff`],spotlight:[`#82c3ff`,`#9678ff`],lines:`#96beff`,meteor:`#ffffff`,grid:`rgba(96, 165, 250, 0.14)`},light:{background:`#fbfcfe`,nebula:[`#3d178c`,`#0a47bf`,`#009ea8`,`#d92e9e`],aurora:[`#1affb8`,`#9e52ff`],rays:`#8cb8ff`,glow:`#6cbcff`,stars:[`#465ac8`,`#7850c8`,`#2878a0`],spotlight:[`#6366f1`,`#38bdf8`],lines:`#4f46e5`,meteor:`#4f46e5`,grid:`rgba(70, 100, 200, 0.16)`}}},aurora:{palette:{dark:{background:`#02070d`,nebula:[`#0a2342`,`#0d4a5e`,`#11a39a`,`#3b2a87`],aurora:[`#3dffa6`,`#8f5bff`],rays:`#a6ecff`,glow:`#5effcf`,stars:[`#d4f7ff`,`#b8ffe6`,`#ffffff`],spotlight:[`#5effcf`,`#5b7cff`],lines:`#8affd6`,meteor:`#eafff9`,grid:`rgba(61, 255, 166, 0.12)`},light:{background:`#f5fbf9`,nebula:[`#0a2342`,`#0d4a5e`,`#11a39a`,`#3b2a87`],aurora:[`#10c98a`,`#7c4dff`],rays:`#79d4e8`,glow:`#2fd3a3`,stars:[`#0f766e`,`#4f46e5`,`#0e7490`],spotlight:[`#14b8a6`,`#6366f1`],lines:`#0d9488`,meteor:`#0f766e`,grid:`rgba(13, 148, 136, 0.16)`}},nebula:{intensity:.7},aurora:{intensity:2,position:.64},rays:{intensity:.5},meteors:{frequency:1.5},grid:!1},ember:{palette:{dark:{background:`#0b0504`,nebula:[`#4a1208`,`#a8380c`,`#ffad42`,`#d62a5e`],aurora:[`#ff9a3d`,`#ff3d77`],rays:`#ffc590`,glow:`#ffa05a`,stars:[`#ffd8b0`,`#ffb3c6`,`#fff4e6`],spotlight:[`#ffab66`,`#ff4f7b`],lines:`#ffc49a`,meteor:`#fff1df`,grid:`rgba(255, 140, 80, 0.14)`},light:{background:`#fffaf5`,nebula:[`#4a1208`,`#a8380c`,`#ffad42`,`#d62a5e`],aurora:[`#ff9a3d`,`#ff3d77`],rays:`#ffb36b`,glow:`#ff9a52`,stars:[`#c2410c`,`#be123c`,`#b45309`],spotlight:[`#f97316`,`#f43f5e`],lines:`#ea580c`,meteor:`#c2410c`,grid:`rgba(234, 88, 12, 0.14)`}},nebula:{intensity:1.05,shimmer:.08},aurora:{intensity:.55,position:.78},rays:{intensity:1.35},meteors:{frequency:.8}},abyss:{palette:{dark:{background:`#01060a`,nebula:[`#04223f`,`#05558a`,`#00c3ff`,`#078c86`],aurora:[`#00ffd1`,`#0077ff`],rays:`#8ae2ff`,glow:`#4cc9ff`,stars:[`#9ae6ff`,`#7cf3e2`,`#e9fbff`],spotlight:[`#4cc9ff`,`#2f6bff`],lines:`#8fe3ff`,meteor:`#e6fbff`,grid:`rgba(56, 189, 248, 0.12)`},light:{background:`#f3fafd`,nebula:[`#04223f`,`#05558a`,`#00c3ff`,`#078c86`],aurora:[`#00ffd1`,`#0077ff`],rays:`#5cc8ef`,glow:`#38bdf8`,stars:[`#0369a1`,`#0f766e`,`#1d4ed8`],spotlight:[`#0ea5e9`,`#2563eb`],lines:`#0284c7`,meteor:`#0369a1`,grid:`rgba(2, 132, 199, 0.15)`}},nebula:{intensity:.9,scale:.85},aurora:{intensity:.4,position:.82},rays:{intensity:1.9,spread:.8},stars:{speed:1.6,flares:!1},meteors:!1,grid:!1},synthwave:{palette:{dark:{background:`#080214`,nebula:[`#2a0b4f`,`#5b14b0`,`#ff2fb0`,`#ff7a3d`],aurora:[`#ff3cac`,`#7b4dff`],rays:`#ff9be0`,glow:`#ff5fc8`,stars:[`#ffb8f0`,`#b9c6ff`,`#ffffff`],spotlight:[`#ff5fc8`,`#7a5cff`],lines:`#ff9ee5`,meteor:`#ffe3f7`,grid:`rgba(255, 70, 200, 0.45)`},light:{background:`#fff6fc`,nebula:[`#2a0b4f`,`#5b14b0`,`#ff2fb0`,`#ff7a3d`],aurora:[`#ff3cac`,`#7b4dff`],rays:`#ff8ad0`,glow:`#f05fd0`,stars:[`#c026d3`,`#7c3aed`,`#db2777`],spotlight:[`#d946ef`,`#8b5cf6`],lines:`#c026d3`,meteor:`#a21caf`,grid:`rgba(192, 38, 211, 0.24)`}},nebula:{intensity:.9,shimmer:.12},aurora:{intensity:.45},rays:{intensity:.75},meteors:{frequency:1.3},grid:{size:56,speed:1.7,height:.58,tilt:72,opacity:1}},graphite:{palette:{dark:{background:`#060607`,nebula:[`#18181d`,`#2c2c35`,`#7a7a8c`,`#4b4b58`],aurora:[`#dadae6`,`#8c8c9e`],rays:`#e8e8f2`,glow:`#ffffff`,stars:[`#ffffff`,`#d7d7e2`,`#a9a9ba`],spotlight:[`#ffffff`,`#9c9cb0`],lines:`#e2e2ec`,meteor:`#ffffff`,grid:`rgba(255, 255, 255, 0.07)`},light:{background:`#fafafa`,nebula:[`#18181d`,`#2c2c35`,`#7a7a8c`,`#4b4b58`],aurora:[`#dadae6`,`#8c8c9e`],rays:`#d4d4dc`,glow:`#c8c8d4`,stars:[`#18181b`,`#3f3f46`,`#52525b`],spotlight:[`#71717a`,`#a1a1aa`],lines:`#3f3f46`,meteor:`#27272a`,grid:`rgba(24, 24, 27, 0.08)`}},nebula:{intensity:1.1,shimmer:0},aurora:{intensity:.35},rays:{intensity:.8},meteors:{frequency:.6},grid:!1},daybreak:{theme:`light`,palette:{dark:{background:`#0b0612`,nebula:[`#4c1d95`,`#1e40af`,`#0e7490`,`#be185d`],aurora:[`#34d399`,`#a78bfa`],rays:`#fcd34d`,glow:`#f9a8d4`,stars:[`#fde68a`,`#f9a8d4`,`#ffffff`],spotlight:[`#fbbf24`,`#f472b6`],lines:`#fcd34d`,meteor:`#fff7e6`,grid:`rgba(251, 191, 36, 0.12)`},light:{background:`#fdf9f5`,nebula:[`#7c3aed`,`#2563eb`,`#06b6d4`,`#f472b6`],aurora:[`#34d399`,`#a78bfa`],rays:`#fbbf24`,glow:`#f472b6`,stars:[`#7c3aed`,`#db2777`,`#0891b2`],spotlight:[`#a855f7`,`#f472b6`],lines:`#9333ea`,meteor:`#7c3aed`,grid:`rgba(147, 51, 234, 0.12)`}},nebula:{intensity:1.2},aurora:{intensity:1.2},rays:{intensity:1.6},grid:!1}},g=Object.keys(h),_=`a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable]:not([contenteditable="false"]), [data-deep-sky-ignore]`,v={low:{scale:.35,minScale:.2,fps:24,maxDpr:1,adaptive:!0},medium:{scale:.5,minScale:.2,fps:30,maxDpr:1.5,adaptive:!0},high:{scale:.75,minScale:.3,fps:60,maxDpr:2,adaptive:!0},ultra:{scale:1,minScale:.4,fps:60,maxDpr:2,adaptive:!1}},y={theme:`dark`,speed:1,animate:`auto`,intro:!0,nebula:{enabled:!0,intensity:1,scale:1,shimmer:.22},aurora:{enabled:!0,intensity:1,position:.7},rays:{enabled:!0,intensity:1,spread:1},glow:{enabled:!0,intensity:1,lens:1},stars:{enabled:!0,density:1,size:1,twinkle:1,parallax:1,flares:!0,speed:1},meteors:{enabled:!0,frequency:1},grid:{enabled:!0,size:64,speed:1,height:.55,tilt:64,opacity:.9},cursor:{enabled:!0,spotlight:1,spotlightRadius:280,field:1,fieldRadius:170,constellations:!0,linkDistance:105},click:`shockwave`,clickIgnore:_,grain:.02,vignette:.6,models:[],quality:`medium`,worker:!0,zIndex:-1,pauseWhenHidden:!0,yieldToPage:!0},b={material:`auto`,color:null,anchor:null,x:.5,y:.5,size:.5,rotation:[0,0,0],spin:18,float:1,follow:.35,react:1,morph:0,glow:1,rays:.6,opacity:1,reveal:1};function x(e){return e?(Array.isArray(e)?e:[e]).map(e=>typeof e==`string`?{src:e}:e).filter(e=>e&&e.src!==void 0&&e.src!==null&&e.src!==``).map(e=>{let t={...b,...T(e),src:e.src};return t.rotation=[0,1,2].map(t=>e.rotation?.[t]??0),t}):[]}let S=/* @__PURE__ */ new WeakMap,C=1;function ee(e){if(e instanceof ArrayBuffer){let t=S.get(e);return t===void 0&&S.set(e,t=C++),`buf:${t}`}let t=String(e);return m.includes(t)?`shape:${t}`:`url:${t}`}let w=e=>Object.prototype.toString.call(e)===`[object Object]`;function T(e){let t={};if(e)for(let[n,r]of Object.entries(e))r!==void 0&&(t[n]=r);return t}function E(e,...t){let n={...e};for(let e of t)e!==void 0&&(typeof e==`boolean`?n.enabled=e:(Object.assign(n,T(e)),e.enabled===void 0&&(n.enabled=!0)));return n}function te(e,t){let n=Object.fromEntries(Object.entries(e).map(([e,t])=>[e,Array.isArray(t)?[...t]:t]));for(let[e,r]of Object.entries(T(t))){let t=n[e];n[e]=Array.isArray(t)&&Array.isArray(r)?t.map((e,t)=>r[t]??e):r}return n}function ne(e){return e&&typeof e==`object`?e:e&&h[e]||h.cosmos}function re(e={}){let t=ne(e.preset),n=e.quality??t.quality??y.quality;return{preset:typeof e.preset==`object`?void 0:e.preset&&h[e.preset]?e.preset:`cosmos`,theme:e.theme??t.theme??y.theme,palette:{dark:te(t.palette.dark,e.palette?.dark),light:te(t.palette.light,e.palette?.light)},speed:e.speed??t.speed??y.speed,animate:e.animate??t.animate??y.animate,intro:e.intro??t.intro??y.intro,nebula:E({...y.nebula},t.nebula,e.nebula),aurora:E({...y.aurora},t.aurora,e.aurora),rays:E({...y.rays},t.rays,e.rays),glow:E({...y.glow},t.glow,e.glow),stars:E({...y.stars},t.stars,e.stars),meteors:E({...y.meteors},t.meteors,e.meteors),grid:E({...y.grid},t.grid,e.grid),cursor:E({...y.cursor},t.cursor,e.cursor),click:e.click??t.click??y.click,clickIgnore:e.clickIgnore??t.clickIgnore??y.clickIgnore,grain:e.grain??t.grain??y.grain,vignette:e.vignette??t.vignette??y.vignette,models:x(e.models??t.models),quality:typeof n==`string`?{...v[n]??v.medium}:{...v.medium,...T(n)},worker:e.worker??y.worker,fixed:e.fixed??t.fixed,zIndex:e.zIndex??t.zIndex??y.zIndex,pauseWhenHidden:e.pauseWhenHidden??t.pauseWhenHidden??y.pauseWhenHidden,yieldToPage:e.yieldToPage??t.yieldToPage??y.yieldToPage}}function ie(e,t){let n={...e};for(let[e,r]of Object.entries(t)){if(r===void 0)continue;let t=n[e];if(e===`palette`&&w(t)&&w(r)){let i=t,a=r;n[e]={dark:{...i.dark,...a.dark},light:{...i.light,...a.light}}}else n[e]=e!==`preset`&&w(t)&&w(r)?{...t,...r}:r}return n}let D=(e,t,n)=>Number.isFinite(e)?Math.min(n,Math.max(t,e)):t;function ae(e,t,n){return[D((e.left+n.x*e.width-t.left)/t.width,-2,3),D((e.top+n.y*e.height-t.top)/t.height,-2,3),e.width&&e.height?D(n.size*e.height/t.height,.01,4):0]}let O=e=>{let[t,n,r]=c(e);return[t,n,r]};function k(e){return{background:O(e.background),nebula:[O(e.nebula[0]),O(e.nebula[1]),O(e.nebula[2]),O(e.nebula[3])],aurora:[O(e.aurora[0]),O(e.aurora[1])],rays:O(e.rays),glow:O(e.glow),stars:[O(e.stars[0]),O(e.stars[1]),O(e.stars[2])],spotlight:[O(e.spotlight[0]),O(e.spotlight[1])],lines:O(e.lines),meteor:O(e.meteor),grid:c(e.grid)}}function oe(e){let t=(e,t)=>e?t:0;return{palettes:{dark:k(e.palette.dark),light:k(e.palette.light)},speed:D(e.speed,0,10),intro:e.intro,nebula:t(e.nebula.enabled,D(e.nebula.intensity,0,4)),nebulaScale:D(e.nebula.scale,.1,10),shimmer:D(e.nebula.shimmer,0,1),aurora:t(e.aurora.enabled,D(e.aurora.intensity,0,4)),auroraPosition:D(e.aurora.position,-.2,1.2),rays:t(e.rays.enabled,D(e.rays.intensity,0,4)),raysSpread:D(e.rays.spread,.1,5),glow:t(e.glow.enabled,D(e.glow.intensity,0,4)),lens:t(e.glow.enabled,D(e.glow.lens,0,4)),grain:D(e.grain,0,.3),vignette:D(e.vignette,0,1.5),stars:t(e.stars.enabled,D(e.stars.density,0,4)),starSize:D(e.stars.size,.1,5),twinkle:D(e.stars.twinkle,0,1),parallax:D(e.stars.parallax,0,5),flares:e.stars.flares,starSpeed:D(e.stars.speed,0,10),meteors:t(e.meteors.enabled,D(e.meteors.frequency,0,10)),spotlight:t(e.cursor.enabled,D(e.cursor.spotlight,0,3)),spotlightRadius:D(e.cursor.spotlightRadius,20,2e3),field:t(e.cursor.enabled,D(e.cursor.field,0,5)),fieldRadius:D(e.cursor.fieldRadius,20,1e3),constellations:e.cursor.enabled&&e.cursor.constellations,linkDistance:D(e.cursor.linkDistance,10,500),grid:t(e.grid.enabled,D(e.grid.opacity,0,1)),gridSize:D(e.grid.size,8,400),gridSpeed:D(e.grid.speed,0,10),gridHeight:D(e.grid.height,.05,1),gridTilt:D(e.grid.tilt,0,85),models:e.models.map(e=>({key:ee(e.src),material:Math.max(0,p.indexOf(e.material)),color:e.color?O(e.color):null,x:D(e.x,-1,2),y:D(e.y,-1,2),size:D(e.size,.01,4),rotation:e.rotation.map(e=>D(e,-36e3,36e3)*Math.PI/180),spin:D(e.spin,-3600,3600)*Math.PI/180,float:D(e.float,0,5),follow:D(e.follow,0,2),react:D(e.react,0,5),morph:D(e.morph,0,2),glow:D(e.glow,0,3),rays:D(e.rays,0,3),opacity:D(e.opacity,0,1),reveal:D(e.reveal,0,1)})),click:e.click,scale:D(e.quality.scale,.1,2),minScale:D(Math.min(e.quality.minScale,e.quality.scale),.05,2),fps:D(e.quality.fps,1,240),adaptive:e.quality.adaptive}}var se=/* @__PURE__ */ r({loadAsset:()=>ce});async function A(e){let t;try{t=await fetch(e)}catch{throw Error(`could not download ${e} (network error, or the server does not allow CORS)`)}if(!t.ok)throw Error(`${t.status} ${t.statusText} for ${e}`);return t}async function ce(e,t){let n=t,r;e instanceof ArrayBuffer?r=e.slice(0):(n=new URL(String(e),t).href,r=await(await A(n)).arrayBuffer());let i,a=null,o=new DataView(r),s=e=>new TextDecoder().decode(e);if(r.byteLength>=12&&o.getUint32(0,!0)===j)for(let e=12;e+8<=r.byteLength;){let t=o.getUint32(e,!0),n=o.getUint32(e+4,!0),c=r.slice(e+8,e+8+t);n===M?i=JSON.parse(s(c)):n===le&&!a&&(a=c),e+=8+t}else try{i=JSON.parse(s(r))}catch{}if(!i||typeof i.asset!=`object`)throw Error(`not a glTF or GLB file`);let c=i,l=await Promise.all((c.buffers??[]).map(async e=>e.uri===void 0?a??new ArrayBuffer(e.byteLength??0):(await A(new URL(e.uri,n).href)).arrayBuffer())),u=await Promise.all((c.images??[]).map(async e=>{try{if(e.uri!==void 0){let t=await(await A(new URL(e.uri,n).href)).blob();return{data:await t.arrayBuffer(),type:e.mimeType??t.type??`image/png`}}let t=c.bufferViews[e.bufferView],r=t.byteOffset??0;return{data:l[t.buffer].slice(r,r+t.byteLength),type:e.mimeType??`image/png`}}catch{return null}})),d=[.../* @__PURE__ */ new Set([...l,...u.flatMap(e=>e?[e.data]:[])])];return{asset:{gltf:i,buffers:l,images:u},transfer:d}}var j,M,le,ue=n((()=>{j=1179937895,M=1313821514,le=5130562})),N,de=n((()=>{N=`"use strict";(()=>{var I=()=>({base:[1,1,1,1],metallic:1,roughness:1,emissive:[0,0,0],baseTex:-1,mrTex:-1,normalTex:-1,emissiveTex:-1,occlusionTex:-1,alphaMode:0,alphaCutoff:.5}),Me=()=>({...I(),metallic:1,roughness:.12}),F=Math.PI*2;function W(s,t,e,r){return{positions:new Float32Array(s),normals:new Float32Array(t),uvs:e&&new Float32Array(e),colors:null,indices:r&&new Uint32Array(r),material:Me()}}function O(s,t,e){let r=[],o=[],n=[],a=[];for(let l=0;l<=t;l++)for(let i=0;i<=s;i++){let c=e(i/s,l/t);r.push(c[0],c[1],c[2]),o.push(c[3],c[4],c[5]),n.push(i/s,l/t)}for(let l=0;l<t;l++)for(let i=0;i<s;i++){let c=l*(s+1)+i,u=c+s+1;a.push(c,c+1,u,c+1,u+1,u)}return we(W(r,o,n,a))}function we(s){let{positions:t,normals:e,indices:r}=s;if(!r)return s;for(let o=0;o<r.length;o+=3){let[n,a,l]=[r[o]*3,r[o+1]*3,r[o+2]*3],i=t[a]-t[n],c=t[a+1]-t[n+1],u=t[a+2]-t[n+2],f=t[l]-t[n],h=t[l+1]-t[n+1],m=t[l+2]-t[n+2],v=c*m-u*h,g=u*f-i*m,p=i*h-c*f;v*(e[n]+e[a]+e[l])+g*(e[n+1]+e[a+1]+e[l+1])+p*(e[n+2]+e[a+2]+e[l+2])<0&&(r[o+1]=l/3,r[o+2]=a/3)}return s}function q(s,t){let e=[],r=[],o=[0,1,2].map(n=>s.reduce((a,l)=>a+l[n],0)/s.length);for(let[n,a,l]of t){let[i,c,u]=[s[n],s[a],s[l]],f=[c[0]-i[0],c[1]-i[1],c[2]-i[2]],h=[u[0]-i[0],u[1]-i[1],u[2]-i[2]],m=[f[1]*h[2]-f[2]*h[1],f[2]*h[0]-f[0]*h[2],f[0]*h[1]-f[1]*h[0]],v=[0,1,2].map(p=>(i[p]+c[p]+u[p])/3-o[p]);m[0]*v[0]+m[1]*v[1]+m[2]*v[2]<0&&([a,l]=[l,a],[c,u]=[u,c],m=m.map(p=>-p));let g=Math.hypot(m[0],m[1],m[2])||1;for(let p of[i,c,u])e.push(p[0],p[1],p[2]),r.push(m[0]/g,m[1]/g,m[2]/g)}return W(e,r,null,null)}function C(s,t=96,e=64){return O(t,e,(r,o)=>{let n=r*F,a=o*Math.PI,l=Math.sin(a)*Math.cos(n),i=Math.cos(a),c=Math.sin(a)*Math.sin(n);return[l*s,i*s,c*s,l,i,c]})}function Ae(s,t,e){return O(e?32:128,e?12:48,(r,o)=>{let n=r*F,a=o*F,l=Math.cos(a)*Math.cos(n),i=Math.cos(a)*Math.sin(n),c=Math.sin(a);return[s*Math.cos(n)+t*l,s*Math.sin(n)+t*i,t*c,l,i,c]})}function Re(s){let r=n=>{let a=.5*(2+Math.cos(3*n));return[a*Math.cos(2*n),a*Math.sin(2*n),.5*Math.sin(3*n)]};return O(s?128:320,s?8:40,(n,a)=>{let l=n*F,i=r(l),c=r(l+.01),u=[c[0]-i[0],c[1]-i[1],c[2]-i[2]],f=[c[0]+i[0],c[1]+i[1],c[2]+i[2]],h=[u[1]*f[2]-u[2]*f[1],u[2]*f[0]-u[0]*f[2],u[0]*f[1]-u[1]*f[0]];f=[h[1]*u[2]-h[2]*u[1],h[2]*u[0]-h[0]*u[2],h[0]*u[1]-h[1]*u[0]];let m=Math.hypot(h[0],h[1],h[2]),v=Math.hypot(f[0],f[1],f[2]),g=-Math.cos(a*F),p=Math.sin(a*F),d=[0,1,2].map(x=>g*f[x]/v+p*h[x]/m);return[i[0]+.26*d[0],i[1]+.26*d[1],i[2]+.26*d[2],d[0],d[1],d[2]]})}function Fe(){let s=[[0,1.05,0],[0,-.7,0]];for(let e=0;e<2;e++)for(let r=0;r<6;r++){let o=r/6*F+e*.08,n=.36+e*.02;s.push([Math.cos(o)*n,e?-.3:.42,Math.sin(o)*n])}let t=[];for(let e=0;e<6;e++){let r=(e+1)%6,[o,n,a,l]=[2+e,2+r,8+e,8+r];t.push([0,o,n],[o,a,n],[n,a,l],[1,l,a])}return q(s,t)}function _e(){let s=(1+Math.sqrt(5))/2,t=[[-1,s,0],[1,s,0],[-1,-s,0],[1,-s,0],[0,-1,s],[0,1,s],[0,-1,-s],[0,1,-s],[s,0,-1],[s,0,1],[-s,0,-1],[-s,0,1]];return q(t,[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]])}function Ne(){let s=[];for(let e=0;e<8;e++)s.push([e&1?.5:-.5,e&2?.5:-.5,e&4?.5:-.5]);return q(s,[[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]].flatMap(([e,r,o,n])=>[[e,r,o],[e,o,n]]))}function De(s,t,e){return O(e?48:160,e?2:1,(r,o)=>{let n=r*F,a=s+(t-s)*o;return[Math.cos(n)*a,0,Math.sin(n)*a,0,1,0]})}function Ue(s){let t=[],e=[],r=[],o=[];for(let n of s){let a=t.length/3;if(t.push(...n.positions),e.push(...n.normals),n.uvs)r.push(...n.uvs);else for(let l=0;l<n.positions.length/3;l++)r.push(0,0);if(n.indices)for(let l of n.indices)o.push(l+a);else for(let l=0;l<n.positions.length/3;l++)o.push(l+a)}return W(t,e,r,o)}function Pe(s,t){let e=Math.cos(t),r=Math.sin(t);for(let o of[s.positions,s.normals])for(let n=0;n<o.length;n+=3){let a=o[n],l=o[n+1];o[n]=a*e-l*r,o[n+1]=a*r+l*e}return s}function j(s,t=!1){switch(s){case"knot":return[Re(t)];case"torus":return[Ae(.36,.15,t)];case"crystal":return[Fe()];case"gem":return[_e()];case"planet":return[Pe(Ue([t?C(.42,20,12):C(.42),De(.56,.86,t)]),.38)];case"cube":return[Ne()];default:return[t?C(.5,22,14):C(.5)]}}function ee(s,t){let e=new Float32Array(s.length),r=t?t.length:s.length/3;for(let o=0;o<r;o+=3){let[n,a,l]=t?[t[o],t[o+1],t[o+2]]:[o,o+1,o+2],i=s,c=i[a*3]-i[n*3],u=i[a*3+1]-i[n*3+1],f=i[a*3+2]-i[n*3+2],h=i[l*3]-i[n*3],m=i[l*3+1]-i[n*3+1],v=i[l*3+2]-i[n*3+2],g=u*v-f*m,p=f*h-c*v,d=c*m-u*h;for(let x of[n,a,l])e[x*3]+=g,e[x*3+1]+=p,e[x*3+2]+=d}for(let o=0;o<e.length;o+=3){let n=Math.hypot(e[o],e[o+1],e[o+2])||1;e[o]/=n,e[o+1]/=n,e[o+2]/=n}return e}function L(s){let t=[1/0,1/0,1/0],e=[-1/0,-1/0,-1/0];for(let n of s){let a=n.positions;for(let l=0;l<a.length;l+=3)for(let i=0;i<3;i++)a[l+i]<t[i]&&(t[i]=a[l+i]),a[l+i]>e[i]&&(e[i]=a[l+i])}if(!isFinite(t[0]))return;let r=[0,1,2].map(n=>(t[n]+e[n])/2),o=1/(Math.max(e[0]-t[0],e[1]-t[1],e[2]-t[2])||1);for(let n of s){let a=n.positions;for(let l=0;l<a.length;l+=3)for(let i=0;i<3;i++)a[l+i]=(a[l+i]-r[i])*o}}function B(s){let t=s.indices?s.indices.length:s.positions.length/3,e=n=>s.indices?s.indices[n]:n,r=(n,a)=>{let l=new Float32Array(t*a);for(let i=0;i<t;i++){let c=e(i);for(let u=0;u<a;u++)l[i*a+u]=n[c*a+u]}return l},o=new Float32Array(t*3);for(let n=0;n<t;n++)o[n*3+n%3]=1;return{positions:r(s.positions,3),normals:r(s.normals,3),uvs:s.uvs&&r(s.uvs,2),colors:s.colors&&r(s.colors,4),bary:o,count:t}}var Q=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);function te(s,t,e,r){let o=1/Math.tan(s/2),n=1/(e-r),a=new Float32Array(16);return a[0]=o/t,a[5]=o,a[10]=(r+e)*n,a[11]=-1,a[14]=2*r*e*n,a}function re(s,t){let e=new Float32Array(16);for(let r=0;r<4;r++)for(let o=0;o<4;o++){let n=0;for(let a=0;a<4;a++)n+=s[a*4+o]*t[r*4+a];e[r*4+o]=n}return e}function V(s,t,e){let[r,o,n,a]=s,l=r+r,i=o+o,c=n+n,u=r*l,f=r*i,h=r*c,m=o*i,v=o*c,g=n*c,p=a*l,d=a*i,x=a*c;return new Float32Array([(1-(m+g))*e[0],(f+x)*e[0],(h-d)*e[0],0,(f-x)*e[1],(1-(u+g))*e[1],(v+p)*e[1],0,(h+d)*e[2],(v-p)*e[2],(1-(u+m))*e[2],0,t[0],t[1],t[2],1])}function z(s){let[t,e,r,,o,n,a,,l,i,c]=s,u=n*c-a*i,f=-(o*c-a*l),h=o*i-n*l,v=1/(t*u+e*f+r*h||1);return new Float32Array([u*v,f*v,h*v,-(e*c-r*i)*v,(t*c-r*l)*v,-(t*i-e*l)*v,(e*a-r*n)*v,-(t*a-r*o)*v,(t*n-e*o)*v])}function N(s,t){let[e,r,o,n]=s,[a,l,i,c]=t;return[n*a+e*c+r*i-o*l,n*l-e*i+r*c+o*a,n*i+e*l-r*a+o*c,n*c-e*a-r*l-o*i]}function Le(s){let t=Math.hypot(s[0],s[1],s[2],s[3])||1;return[s[0]/t,s[1]/t,s[2]/t,s[3]/t]}function G(s,t){let e=Math.sin(t/2);return[s[0]*e,s[1]*e,s[2]*e,Math.cos(t/2)]}function K(s,t,e){return N(G([0,0,1],e),N(G([0,1,0],t),G([1,0,0],s)))}function oe(s,t,e){let r=Math.hypot(t[0],t[1],t[2]);if(r<1e-6)return s;let o=[t[0]/r,t[1]/r,t[2]/r];return Le(N(G(o,r*e),s))}var ae={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},Be={5120:[1,(s,t)=>s.getInt8(t),127],5121:[1,(s,t)=>s.getUint8(t),255],5122:[2,(s,t)=>s.getInt16(t,!0),32767],5123:[2,(s,t)=>s.getUint16(t,!0),65535],5125:[4,(s,t)=>s.getUint32(t,!0),1],5126:[4,(s,t)=>s.getFloat32(t,!0),1]},ke=["KHR_materials_emissive_strength","KHR_texture_transform","KHR_materials_unlit"];function k(s,t,e,r){let o=s.accessors?.[e];if(!o)throw new Error(\`invalid glTF: accessor \${e} is missing\`);let n=ae[o.type]??1,a=new r(o.count*n),l=Be[o.componentType];if(o.bufferView===void 0||!l)return a;let[i,c,u]=l,f=s.bufferViews?.[o.bufferView],h=f&&t[f.buffer];if(!h)throw new Error(\`invalid glTF: no data for accessor \${e}\`);let m=new DataView(h),v=f.byteStride||n*i,g=(f.byteOffset??0)+(o.byteOffset??0),p=o.normalized&&a instanceof Float32Array?u:1;for(let d=0;d<o.count;d++){let x=g+d*v;for(let M=0;M<n;M++){let w=c(m,x+M*i);a[d*n+M]=p===1?w:Math.max(w/p,-1)}}return a}function ne(s,t){let e=I(),r=t===void 0?null:s.materials?.[t];if(!r)return e;let o=r.pbrMetallicRoughness??{},n=u=>{let f=u&&s.textures?.[u.index],h=f?.source??f?.extensions?.EXT_texture_webp?.source;return typeof h=="number"?h:-1};if(o.baseColorFactor){let[u,f,h,m]=o.baseColorFactor;e.base=[u,f,h,m]}e.metallic=o.metallicFactor??1,e.roughness=o.roughnessFactor??1;let a=r.extensions?.KHR_materials_emissive_strength?.emissiveStrength??1,[l,i,c]=r.emissiveFactor??[0,0,0];return e.emissive=[l*a,i*a,c*a],e.baseTex=n(o.baseColorTexture),e.mrTex=n(o.metallicRoughnessTexture),e.normalTex=n(r.normalTexture),e.emissiveTex=n(r.emissiveTexture),e.occlusionTex=n(r.occlusionTexture),e.emissiveTex>=0&&e.emissive.every(u=>u===0)&&(e.emissive=[a,a,a]),e.alphaMode=r.alphaMode==="MASK"?1:r.alphaMode==="BLEND"?2:0,e.alphaCutoff=r.alphaCutoff??.5,r.extensions?.KHR_materials_unlit&&(e.metallic=0,e.roughness=1),e}function se(s,t,e,r){if((e.mode??4)!==4||e.attributes?.POSITION===void 0)return null;let o=e.attributes,n=k(s,t,o.POSITION,Float32Array),a=e.indices===void 0?null:k(s,t,e.indices,Uint32Array),l=o.NORMAL===void 0?null:k(s,t,o.NORMAL,Float32Array),i=o.TEXCOORD_0===void 0?null:k(s,t,o.TEXCOORD_0,Float32Array),c=null;if(o.COLOR_0!==void 0){let m=k(s,t,o.COLOR_0,Float32Array),v=ae[s.accessors[o.COLOR_0].type];c=new Float32Array(m.length/v*4).fill(1);for(let g=0;g<m.length/v;g++)for(let p=0;p<v;p++)c[g*4+p]=m[g*v+p]}let u=r;for(let m=0;m<n.length;m+=3){let[v,g,p]=[n[m],n[m+1],n[m+2]];n[m]=u[0]*v+u[4]*g+u[8]*p+u[12],n[m+1]=u[1]*v+u[5]*g+u[9]*p+u[13],n[m+2]=u[2]*v+u[6]*g+u[10]*p+u[14]}let f=z(u);if(f[0]*(f[4]*f[8]-f[5]*f[7])-f[3]*(f[1]*f[8]-f[2]*f[7])+f[6]*(f[1]*f[5]-f[2]*f[4])<0){a??=Uint32Array.from({length:n.length/3},(m,v)=>v);for(let m=0;m+2<a.length;m+=3)[a[m+1],a[m+2]]=[a[m+2],a[m+1]]}if(l)for(let m=0;m<l.length;m+=3){let[v,g,p]=[l[m],l[m+1],l[m+2]],d=f[0]*v+f[3]*g+f[6]*p,x=f[1]*v+f[4]*g+f[7]*p,M=f[2]*v+f[5]*g+f[8]*p,w=Math.hypot(d,x,M)||1;l[m]=d/w,l[m+1]=x/w,l[m+2]=M/w}else{let m=B({positions:n,normals:n,uvs:i,colors:c,indices:a,material:I()});return{positions:m.positions,normals:ee(m.positions,null),uvs:m.uvs,colors:m.colors,indices:null,material:ne(s,e.material)}}return{positions:n,normals:l,uvs:i,colors:c,indices:a,material:ne(s,e.material)}}function Se(s){return s.matrix?Float32Array.from(s.matrix):V(s.rotation??[0,0,0,1],s.translation??[0,0,0],s.scale??[1,1,1])}function ie(s){let t=s.gltf,e=(t.extensionsRequired??[]).filter(a=>!ke.includes(a));if(e.length)throw new Error(\`unsupported glTF extension \${e.join(", ")} (export without compression)\`);let r=[],o=(a,l,i)=>{let c=t.nodes?.[a];if(!c||i>64)return;let u=re(l,Se(c));for(let f of t.meshes?.[c.mesh]?.primitives??[]){let h=se(t,s.buffers,f,u);h&&r.push(h)}for(let f of c.children??[])o(f,u,i+1)},n=t.scenes?.[t.scene??0];if(n)for(let a of n.nodes??[])o(a,Q(),0);else for(let a of t.meshes??[])for(let l of a.primitives??[]){let i=se(t,s.buffers,l,Q());i&&r.push(i)}if(!r.length)throw new Error("no triangles in this glTF file");return L(r),r}var le=\`
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
\`,ce=\`#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec4 aColor;
layout(location = 4) in vec3 aBary;

uniform mat4 uProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform vec4 uScreen;      // width, height, time, clock
uniform vec4 uRipples[4];  // x, y (0..1, y up), start, strength
uniform vec4 uFx;          // appear, morph, react, glitch

out vec3 vPos;
out vec3 vNormal;
out vec2 vUv;
out vec4 vColor;
out vec3 vBary;
out vec3 vObj;
\${le}
// liquid surface: the mesh breathes along its normals
vec3 morph(vec3 p, vec3 n) {
  float t = uScreen.z;
  float k = noise3(p * 2.4 + vec3(0.0, t * 0.5, t * 0.3)) * 0.65 + noise3(p * 5.1 - t * 0.4) * 0.35;
  return p + n * (k - 0.45) * 0.3 * uFx.y;
}

void main() {
  vec3 p = aPos;
  vec3 n = aNormal;
  if (uFx.y > 0.0) {
    vec3 q = morph(p, n);
    // normal of the moved surface, from two neighbours
    vec3 t = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
    vec3 b = cross(n, t);
    vec3 n2 = cross(morph(p + t * 0.01, n) - q, morph(p + b * 0.01, n) - q);
    n = length(n2) > 0.0 ? normalize(n2) : n;
    p = q;
  }

  // shockwaves from the sky: a bulge rides the ring across the model
  vec4 clip = uProj * (uModel * vec4(p, 1.0));
  float aspect = uScreen.x / uScreen.y;
  vec2 sp = clip.xy / clip.w * 0.5 * vec2(aspect, 1.0);
  float push = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 rp = uRipples[i];
    float age = uScreen.w - rp.z;
    if (rp.w > 0.0 && age > 0.0 && age < 3.0) {
      float w = length(sp - (rp.xy - 0.5) * vec2(aspect, 1.0)) - age * 0.85;
      push += exp(-w * w * 90.0) * (1.0 - age / 3.0) * rp.w;
    }
  }
  p += n * push * 0.08 * uFx.z;

  // hologram: slices jump sideways now and then
  if (uFx.w > 0.0) {
    float slice = floor(p.y * 22.0);
    float tick = floor(uScreen.w * 14.0);
    float g = step(0.94 - uFx.w * 0.2, hash3(vec3(slice, tick, 1.0)));
    p.x += g * (hash3(vec3(slice, tick, 7.0)) - 0.5) * 0.12 * uFx.w;
  }

  vec4 view = uModel * vec4(p, 1.0);
  vPos = view.xyz;
  vNormal = uNormalMat * n;
  vUv = aUv;
  vColor = aColor;
  vBary = aBary;
  vObj = aPos;
  gl_Position = uProj * view;
}
\`,ue=\`#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNormal;
in vec2 vUv;
in vec4 vColor;
in vec3 vBary;
in vec3 vObj;
out vec4 outColor;

uniform vec4 uScreen;      // width, height, time, clock
uniform vec4 uRipples[4];
uniform vec4 uLights;      // sweep start, dark mix, roaming light, rim lights
uniform vec4 uMat;         // material, metallic, roughness, opacity
uniform vec4 uBase;        // base color (decoded), alpha
uniform vec4 uEmissive;    // emissive (decoded), alpha cutoff (< 0: none)
uniform vec4 uFx;          // appear, morph, react, glitch
uniform vec4 uTex;         // has base color, metal-rough, normal, emissive maps
uniform float uHasOcc;
uniform vec3 uLightPos;    // roaming light, view space
uniform vec3 uBg;
uniform vec3 uNeb0;
uniform vec3 uNeb1;
uniform vec3 uNeb2;
uniform vec3 uNeb3;
uniform vec3 uAur0;
uniform vec3 uAur1;
uniform vec3 uGlow;
uniform sampler2D uBackdrop;
uniform sampler2D uBaseTex;
uniform sampler2D uMrTex;
uniform sampler2D uNormalTex;
uniform sampler2D uEmissiveTex;
uniform sampler2D uOccTex;
\${le}
float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p = p * 2.03 + vec3(3.1, 1.7, 4.3);
    a *= 0.5;
  }
  return v;
}

/** the sky behind the model, blurred by roughness (the frame is stored top row first) */
vec3 backdrop(vec2 uv, float lod) {
  uv = clamp(uv, 0.002, 0.998);
  vec3 c = textureLod(uBackdrop, vec2(uv.x, 1.0 - uv.y), lod).rgb;
  return c * c;
}

/** what a mirror sees: the sky around, plus soft studio lights tinted by the palette */
vec3 env(vec3 r, float rough) {
  float t = uScreen.z;
  vec2 uv = gl_FragCoord.xy / uScreen.xy + r.xy * 0.22;
  vec3 c = backdrop(uv, 1.0 + rough * 6.0) * mix(0.9, 1.5, uLights.y);
  float up = r.y * 0.5 + 0.5;
  c += mix(uNeb0, uNeb2, smoothstep(0.15, 0.95, up)) * 0.22;
  // a dark floor below the horizon gives metals their contrast
  c *= mix(0.25, 1.0, smoothstep(-0.55, 0.05, r.y));
  float soft = mix(1.0, 0.35, rough);
  float top = smoothstep(0.7, 0.7 + 0.12 / soft, r.y);
  float ang = atan(r.x, -r.z);
  float horizon = exp(-pow((r.y - 0.02) * 14.0 * soft, 2.0)) * (0.5 + 0.5 * sin(ang * 3.0 + t * 0.25));
  float left = smoothstep(-0.72, -0.86, r.x) * smoothstep(-0.1, 0.3, r.y);
  float right = smoothstep(0.72, 0.86, r.x) * smoothstep(0.5, 0.0, r.y);
  c += mix(uGlow, vec3(1.0), 0.5) * top * 1.7 * soft;
  c += mix(uAur0, uAur1, 0.5 + 0.5 * sin(ang * 2.0 - t * 0.2)) * horizon * 1.5;
  c += (uAur0 * left + uAur1 * right) * 1.4 * soft;
  return c;
}

vec3 brdf(vec3 N, vec3 V, vec3 L, vec3 albedo, float metal, float rough, vec3 f0) {
  float NoL = dot(N, L);
  if (NoL <= 0.0) return vec3(0.0);
  vec3 H = normalize(L + V);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float NoV = max(dot(N, V), 1e-3);
  float a = rough * rough;
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * d * d);
  float k = a * 0.5 + 0.0001;
  float G = 0.25 / ((NoV * (1.0 - k) + k) * (NoL * (1.0 - k) + k));
  vec3 F = f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
  return ((1.0 - F) * (1.0 - metal) * albedo / 3.14159 + F * min(D * G, 60.0)) * NoL;
}

/** the roaming light, two aurora rim lights behind, a soft key from above, and a rim glow */
vec3 lights(vec3 N, vec3 V, vec3 albedo, float metal, float rough, vec3 f0) {
  vec3 toL = uLightPos - vPos;
  float d2 = dot(toL, toL);
  vec3 c = brdf(N, V, toL * inversesqrt(d2), albedo, metal, rough, f0) * uGlow * uLights.z * 10.0 / (1.0 + d2 * 0.35);
  c += brdf(N, V, normalize(vec3(-0.8, 0.35, -0.5)), albedo, metal, rough, f0) * uAur0 * uLights.w * 2.2;
  c += brdf(N, V, normalize(vec3(0.85, 0.5, -0.35)), albedo, metal, rough, f0) * uAur1 * uLights.w * 2.2;
  c += brdf(N, V, normalize(vec3(0.2, 1.0, 0.45)), albedo, metal, rough, f0) * mix(uNeb2, vec3(1.0), 0.3) * 0.9;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  c += mix(uAur0, uAur1, N.x * 0.5 + 0.5) * rim * uLights.w * 0.8;
  return c;
}

/** normal maps without tangents: the frame comes from screen-space derivatives */
vec3 perturb(vec3 N, vec3 p, vec2 uv, vec3 m) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return normalize(mat3(T * inv, B * inv, N) * (m * 2.0 - 1.0));
}

void main() {
  float t = uScreen.z;
  float clock = uScreen.w;
  vec2 suv = gl_FragCoord.xy / uScreen.xy;
  float aspect = uScreen.x / uScreen.y;
  int mode = int(uMat.x + 0.5);

  // materialize: a noise front builds the model, with a burning edge
  float dn = noise3(vObj * 6.0) * 0.7 + noise3(vObj * 15.0) * 0.3;
  float ap = uFx.x * 1.3 - 0.15;
  if (dn > ap) discard;
  float edge = uFx.x < 1.0 ? 1.0 - smoothstep(0.0, 0.06, ap - dn) : 0.0;

  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vPos);

  vec4 base = uBase * vColor;
  if (uTex.x > 0.5) {
    vec4 tb = texture(uBaseTex, vUv);
    base *= vec4(tb.rgb * tb.rgb, tb.a);
  }
  if (uEmissive.w >= 0.0 && base.a < uEmissive.w) discard;
  if (uTex.z > 0.5) N = perturb(N, vPos, vUv, texture(uNormalTex, vUv).xyz);
  float NoV = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - NoV, 5.0);
  vec3 R = reflect(-V, N);

  vec3 col;
  float alpha = base.a;
  bool emissive = false;

  if (mode == 2) {
    // glass: the sky behind, bent per channel (dispersion), and reflections on top
    vec3 tr = refract(-V, N, 0.67);
    vec2 off = tr.xy * (0.05 + 0.12 * (1.0 - NoV));
    vec3 refr = vec3(
      backdrop(suv + off * 0.82, 0.6).r,
      backdrop(suv + off, 0.6).g,
      backdrop(suv + off * 1.18, 0.6).b);
    float F = 0.04 + 0.96 * fres;
    col = refr * base.rgb * mix(1.15, 1.6, uLights.y) * (1.0 - F) + env(R, 0.04) * F;
    col += lights(N, V, vec3(0.0), 0.0, 0.05, vec3(0.04));
    col += base.rgb * mix(uAur0, uAur1, N.y * 0.5 + 0.5) * pow(1.0 - NoV, 2.0) * 0.6;
    alpha = 1.0;
  } else if (mode == 3) {
    // hologram: fresnel shell, scanlines, a scanning band and some flicker
    vec3 hc = uBase.r < 0.0 ? mix(uAur0, uAur1, smoothstep(-0.5, 0.5, vObj.y)) : base.rgb;
    float rim = pow(1.0 - NoV, 3.0);
    float lines = smoothstep(0.35, 0.95, 0.5 + 0.5 * sin(gl_FragCoord.y * 0.85 - t * 10.0));
    float band = pow(0.5 + 0.5 * sin(suv.y * 7.0 - t * 2.2), 16.0);
    float flick = 0.82 + 0.18 * hash3(vec3(floor(clock * 24.0), 0.0, 3.0));
    col = hc * (0.03 + rim * 1.7 + lines * rim * 0.5 + lines * 0.05 + band * 0.45) * flick * (gl_FrontFacing ? 1.0 : 0.35);
    alpha = clamp(0.02 + rim * 0.3, 0.0, 0.5);
    emissive = true;
  } else if (mode == 5) {
    // neon wireframe: glowing edges, brighter corners, a faint fill
    float e = min(min(vBary.x, vBary.y), vBary.z);
    float fw = max(fwidth(e), 1e-4);
    float line = 1.0 - smoothstep(fw * 0.5, fw * 1.7, e);
    float corner = smoothstep(0.9, 1.0, max(max(vBary.x, vBary.y), vBary.z));
    float face = gl_FrontFacing ? 1.0 : 0.4;
    col = base.rgb * (line * 2.3 + corner * 2.2 + 0.04 + pow(1.0 - NoV, 3.0) * 0.3) * face;
    alpha = clamp(line * 0.85 + 0.07, 0.0, 1.0);
    emissive = true;
  } else if (mode == 6) {
    // nebula: the sky's own clouds, folded inside the model, under a glossy coat
    vec3 p = vObj * 2.3;
    vec3 q = vec3(fbm3(p + vec3(0.0, t * 0.07, 0.0)), fbm3(p + vec3(5.2, 1.3, -t * 0.05)), fbm3(p + vec3(1.7, 9.2, 4.1)));
    float n = fbm3(p + 2.6 * q);
    vec3 nc = mix(uNeb0, uNeb1, clamp(q.x * 1.7 - 0.2, 0.0, 1.0));
    nc = mix(nc, uNeb2, clamp(n * n * 2.0, 0.0, 1.0));
    nc = mix(nc, uNeb3, clamp(q.z * q.z * q.z * 2.2, 0.0, 1.0) * 0.6);
    float dens = smoothstep(0.28, 0.85, n);
    // the palette is dark on purpose (it is a background): lift it, inside the model it glows
    nc = mix(nc, sqrt(nc), 0.45);
    col = nc * base.rgb * (0.05 + dens * dens * 2.4);
    // stars: one point in a few cells of a 3D grid, where the surface passes close to it
    vec3 sp3 = vObj * 26.0;
    vec3 cell = floor(sp3);
    vec3 at = vec3(hash3(cell + 1.0), hash3(cell + 2.0), hash3(cell + 5.0)) * 0.6 + 0.2;
    float star = step(0.9, hash3(cell)) * smoothstep(0.16, 0.0, length(fract(sp3) - at));
    col += star * (0.6 + 0.4 * sin(t * 3.0 + hash3(cell + 3.0) * 30.0)) * 3.0 * (1.0 - dens);
    float F = 0.04 + 0.96 * fres;
    col = col * (1.0 - F) + env(R, 0.06) * F;
    col += lights(N, V, vec3(0.0), 0.0, 0.07, vec3(0.04));
    alpha = 1.0;
  } else {
    // physically based: the file's materials, chrome, or a thin-film coat
    float metal = uMat.y;
    float rough = uMat.z;
    if (uTex.y > 0.5) {
      vec4 mr = texture(uMrTex, vUv);
      rough *= mr.g;
      metal *= mr.b;
    }
    rough = clamp(rough, 0.03, 1.0);
    vec3 albedo = base.rgb;
    vec3 f0 = mix(vec3(0.04), albedo, metal);
    if (mode == 4) {
      float th = noise3(vObj * 3.0 + t * 0.08);
      vec3 film = 0.5 + 0.5 * cos(6.2832 * (NoV * 1.5 + th * 0.9 + vec3(0.0, 0.33, 0.67)));
      f0 = mix(f0, film * film, 0.92);
    }
    vec3 F = f0 + (max(vec3(1.0 - rough), f0) - f0) * fres;
    vec3 kd = (1.0 - F) * (1.0 - metal) * albedo;
    vec3 amb = mix(uNeb0, uNeb2, N.y * 0.5 + 0.5) * 0.7 + uBg * 0.4;
    float occ = uHasOcc > 0.5 ? texture(uOccTex, vUv).r : 1.0;
    col = (kd * amb + env(R, rough) * F) * occ;
    col += lights(N, V, albedo, metal, rough, f0);
    vec3 em = uEmissive.rgb;
    if (uTex.w > 0.5) {
      vec3 te = texture(uEmissiveTex, vUv).rgb;
      em *= te * te;
    }
    col += em;
  }

  // the sky's events light the model too: shockwave rings, light sweeps
  vec2 sp = (suv - 0.5) * vec2(aspect, 1.0);
  float ring = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 rp = uRipples[i];
    float age = clock - rp.z;
    if (rp.w > 0.0 && age > 0.0 && age < 3.0) {
      float w = length(sp - (rp.xy - 0.5) * vec2(aspect, 1.0)) - age * 0.85;
      ring += exp(-w * w * 380.0) * (1.0 - age / 3.0) * rp.w;
    }
  }
  float sweep = 0.0;
  float pa = clock - uLights.x;
  if (uLights.x > 0.0 && pa > 0.0 && pa < 1.6) {
    float x = suv.x + (suv.y - 0.5) * 0.35;
    sweep = exp(-pow((x - (pa * 1.1 - 0.2)) * 7.0, 2.0)) * (1.0 - pa / 1.6);
  }
  col += uGlow * (ring * 3.5 * (0.5 + uFx.z) + sweep * 2.0 + edge * 7.0);

  float o = uMat.w;
  if (emissive) {
    // premultiplied, with light beyond the coverage: adds up like light
    outColor = vec4(col * o, max(alpha, edge) * o);
  } else {
    outColor = vec4(col * alpha * o, alpha * o);
  }
}
\`,X=\`#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
\`,fe=\`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb
    + texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb
    + texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb
    + texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  outColor = vec4(c * smoothstep(0.8, 2.2, l), 1.0);
}
\`,me=\`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.227027;
  c += (texture(uTex, vUv + uDir * 1.3846).rgb + texture(uTex, vUv - uDir * 1.3846).rgb) * 0.316216;
  c += (texture(uTex, vUv + uDir * 3.2308).rgb + texture(uTex, vUv - uDir * 3.2308).rgb) * 0.070270;
  outColor = vec4(c, 1.0);
}
\`,he=\`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBloomWide;
uniform vec4 uPost;   // bloom, shafts, exposure
uniform vec2 uLight;  // roaming light, uv
void main() {
  vec4 s = texture(uScene, vUv);
  vec3 b = texture(uBloom, vUv).rgb + texture(uBloomWide, vUv).rgb * 1.6;
  vec3 shafts = vec3(0.0);
  if (uPost.y > 0.0) {
    vec2 dir = (vUv - uLight) * (0.6 / 32.0);
    vec2 p = vUv;
    float w = 1.0;
    for (int i = 0; i < 32; i++) {
      p -= dir;
      shafts += texture(uBloomWide, p).rgb * w;
      w *= 0.92;
    }
    shafts *= 0.065;
  }
  vec3 c = s.rgb + b * uPost.x + shafts * uPost.y;
  c = vec3(1.0) - exp(-c * uPost.z);
  outColor = vec4(sqrt(c), s.a);
}
\`;var be=30*Math.PI/180,pe=Math.tan(be/2),J=8,ve=J-2.6,Ce=1.8,Ie=.8,E={auto:0,chrome:1,glass:2,hologram:3,iridescent:4,wire:5,nebula:6},_=s=>[s[0]*s[0],s[1]*s[1],s[2]*s[2]];function Y(s,t,e){try{return s.getContext(t,e)}catch{return null}}var H=class{constructor(t,e){this.canvas=t;this.emit=e;this.init()||this.fail("WebGL 2 is not available for the 3D layer")}canvas;emit;gl=null;off=null;view=null;scene;bright;blur;composite;white=null;sky=null;empty=null;hdr=!1;parallel=null;linked=!1;targets=null;failed=!1;assets=new Map;instances=[];leaving=[];seen=new Map;w=1;h=1;dpr=1;last=NaN;drawn=!1;onChange;get active(){return this.failed?!1:[...this.instances,...this.leaving].some(t=>t.appear>0||t.cfg.reveal>0)}fail(t){this.failed=!0,this.gl=null,this.emit({type:"modelError",key:"*",message:t})}init(){let t={alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1},e=null;if(typeof OffscreenCanvas<"u"){let o=new OffscreenCanvas(1,1);e=Y(o,"webgl2",t);let n=e?Y(this.canvas,"bitmaprenderer"):null;e&&n?(this.off=o,this.view=n):e=null}if(e??=Y(this.canvas,"webgl2",t),!e)return!1;let r=this.off??this.canvas;return r.addEventListener("webglcontextlost",o=>{o.preventDefault(),this.gl=null}),r.addEventListener("webglcontextrestored",()=>{this.gl=e,this.targets=null;for(let o of this.assets.values())if(!(typeof o!="object"||o instanceof Error)){o.textures=null;for(let n of[...o.prims,...o.lowPoly??[]])n.geo=n.wire=null}this.setup()||this.fail("the 3D layer could not restart")}),this.gl=e,this.setup()}program(t,e){let r=this.gl,o=(i,c)=>{let u=r.createShader(i);return r.shaderSource(u,c),r.compileShader(u),u},n=r.createProgram(),a=[o(r.VERTEX_SHADER,t),o(r.FRAGMENT_SHADER,e)];for(let i of a)r.attachShader(n,i);r.linkProgram(n);let l=new Map;return{p:n,shaders:a,u:i=>(l.has(i)||l.set(i,r.getUniformLocation(n,i)),l.get(i))}}compiled(){if(this.linked)return!0;let t=this.gl,e=[this.scene,this.bright,this.blur,this.composite],r=this.parallel;if(r&&!e.every(({p:o})=>t.getProgramParameter(o,r.COMPLETION_STATUS_KHR)))return!1;for(let{p:o,shaders:n}of e){if(t.getProgramParameter(o,t.LINK_STATUS)||t.isContextLost())continue;let a=n.map(l=>t.getShaderInfoLog(l)).join(\`
\`)||t.getProgramInfoLog(o);return console.warn("[deep-sky]",a),this.fail("the 3D shaders did not compile"),!1}return t.useProgram(this.scene.p),["uBackdrop","uBaseTex","uMrTex","uNormalTex","uEmissiveTex","uOccTex"].forEach((o,n)=>t.uniform1i(this.scene.u(o),n)),t.useProgram(this.composite.p),["uScene","uBloom","uBloomWide"].forEach((o,n)=>t.uniform1i(this.composite.u(o),n)),this.linked=!0,!0}setup(){let t=this.gl;this.parallel=t.getExtension("KHR_parallel_shader_compile"),this.linked=!1,this.scene=this.program(ce,ue),this.bright=this.program(X,fe),this.blur=this.program(X,me),this.composite=this.program(X,he);let e=r=>{let o=t.createTexture();return t.bindTexture(t.TEXTURE_2D,o),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,1,1,0,t.RGBA,t.UNSIGNED_BYTE,new Uint8Array(r)),o};return this.white=e([255,255,255,255]),this.sky=e([8,10,24,255]),this.empty=t.createVertexArray(),this.hdr=!!(t.getExtension("EXT_color_buffer_float")??t.getExtension("EXT_color_buffer_half_float")),!0}place(t){this.instances.forEach((e,r)=>{t[r]?.key===e.cfg.key&&(e.cfg=t[r])})}configure(t){let e=this.instances;this.instances=t.map((r,o)=>{let n=e[o];return n&&n.cfg.key===r.key?(n.cfg=r,e[o]=null,n):{cfg:r,q:[0,0,0,1],w:[0,0,0],yaw:0,pitch:0,pop:0,popV:0,appear:0,phase:Math.random()*10,hits:[]}});for(let r of e)r&&r.appear>0&&this.leaving.push({...r,cfg:{...r.cfg,reveal:0}});for(let{key:r}of t){if(!r.startsWith("shape:")||this.assets.has(r))continue;let o=j(r.slice(6));L(o),this.assets.set(r,{prims:o.map(n=>({mesh:n,geo:null,wire:null})),images:[],textures:null,shape:r.slice(6),lowPoly:null})}this.warm()}mode(t,e){return t.cfg.material===E.auto&&e.shape?E.chrome:t.cfg.material}prims(t,e){if(e!==E.wire||!t.shape)return t.prims;if(!t.lowPoly){let r=j(t.shape,!0);L(r),t.lowPoly=r.map(o=>({mesh:o,geo:null,wire:null}))}return t.lowPoly}warm(){if(this.gl){this.parallel||this.compiled();for(let t of this.instances){let e=this.ready(t.cfg.key);if(!e)continue;this.textures(e);let r=this.mode(t,e);for(let o of this.prims(e,r))r===E.wire?o.wire??=this.upload(B(o.mesh)):o.geo??=this.upload(o.mesh)}}}load(t,e){if(this.assets.has(t))return;this.assets.set(t,"loading");let r;try{r=ie(e)}catch(o){let n=o instanceof Error?o:new Error(String(o));this.assets.set(t,n),this.emit({type:"modelError",key:t,message:n.message});return}Promise.all(e.images.map(o=>o&&typeof createImageBitmap=="function"?createImageBitmap(new Blob([o.data],{type:o.type}),{premultiplyAlpha:"none",colorSpaceConversion:"none"}).catch(()=>null):null)).then(o=>{this.assets.set(t,{prims:r.map(n=>({mesh:n,geo:null,wire:null})),images:o,textures:null,shape:null,lowPoly:null}),this.warm(),this.onChange?.()})}resize(t,e,r){this.w=Math.max(1,t),this.h=Math.max(1,e),this.dpr=r}backdrop(t){let e=this.gl;!e||!this.active||(e.bindTexture(e.TEXTURE_2D,this.sky),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,t),e.generateMipmap(e.TEXTURE_2D),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE))}destroy(){this.gl?.getExtension("WEBGL_lose_context")?.loseContext(),this.gl=null,this.failed=!0}upload(t){let e=this.gl,r=e.createVertexArray();e.bindVertexArray(r);let o=(n,a,l)=>{a&&(e.bindBuffer(e.ARRAY_BUFFER,e.createBuffer()),e.bufferData(e.ARRAY_BUFFER,a,e.STATIC_DRAW),e.enableVertexAttribArray(n),e.vertexAttribPointer(n,l,e.FLOAT,!1,0,0))};return o(0,t.positions,3),o(1,t.normals,3),o(2,t.uvs,2),o(3,t.colors,4),o(4,t.bary,3),t.indices&&(e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,e.createBuffer()),e.bufferData(e.ELEMENT_ARRAY_BUFFER,t.indices,e.STATIC_DRAW)),e.bindVertexArray(null),{vao:r,count:t.indices?t.indices.length:t.positions.length/3,indexed:!!t.indices}}textures(t){if(t.textures)return t.textures;let e=this.gl,r=e.getExtension("EXT_texture_filter_anisotropic");return t.textures=t.images.map(o=>{if(!o)return null;let n=e.createTexture();return e.bindTexture(e.TEXTURE_2D,n),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,o),e.generateMipmap(e.TEXTURE_2D),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR_MIPMAP_LINEAR),r&&e.texParameterf(e.TEXTURE_2D,r.TEXTURE_MAX_ANISOTROPY_EXT,8),n}),t.textures}renderTargets(t,e){let r=this.gl,o=this.targets;if(o&&o.w===t&&o.h===e)return o;if(o){r.deleteFramebuffer(o.msaa);for(let a of o.buffers)r.deleteRenderbuffer(a);for(let a of[o.scene,...o.bloom,...o.wide])r.deleteTexture(a.tex),r.deleteFramebuffer(a.fb);this.targets=null}let n=a=>{let l=a?r.RGBA16F:r.RGBA8,i=Math.min(4,r.getParameter(r.MAX_SAMPLES)),c=r.createFramebuffer();r.bindFramebuffer(r.FRAMEBUFFER,c);let u=r.createRenderbuffer();r.bindRenderbuffer(r.RENDERBUFFER,u),r.renderbufferStorageMultisample(r.RENDERBUFFER,i,l,t,e),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,u);let f=r.createRenderbuffer();r.bindRenderbuffer(r.RENDERBUFFER,f),r.renderbufferStorageMultisample(r.RENDERBUFFER,i,r.DEPTH_COMPONENT24,t,e),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.DEPTH_ATTACHMENT,r.RENDERBUFFER,f);let h=r.checkFramebufferStatus(r.FRAMEBUFFER)===r.FRAMEBUFFER_COMPLETE,m=(p,d)=>{let x=r.createTexture();r.bindTexture(r.TEXTURE_2D,x),r.texImage2D(r.TEXTURE_2D,0,l,p,d,0,r.RGBA,a?r.HALF_FLOAT:r.UNSIGNED_BYTE,null),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE);let M=r.createFramebuffer();return r.bindFramebuffer(r.FRAMEBUFFER,M),r.framebufferTexture2D(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,x,0),h&&=r.checkFramebufferStatus(r.FRAMEBUFFER)===r.FRAMEBUFFER_COMPLETE,{tex:x,fb:M,w:p,h:d}},v=p=>[Math.max(1,Math.round(t/p)),Math.max(1,Math.round(e/p))],g={w:t,h:e,msaa:c,buffers:[u,f],scene:m(t,e),bloom:[m(...v(4)),m(...v(4))],wide:[m(...v(8)),m(...v(8))]};return r.bindFramebuffer(r.FRAMEBUFFER,null),h?g:null};return this.targets=this.hdr&&n(!0)||n(!1),!this.targets&&this.hdr&&(this.hdr=!1),this.targets}ready(t){let e=this.assets.get(t);return e&&typeof e=="object"&&!(e instanceof Error)?e:null}shockwaves(t,e){let r=t.ripples;for(let o=0;o<4;o++){let[n,a,l,i]=[r[o*4],r[o*4+1],r[o*4+2],r[o*4+3]];if(!(i<=0||this.seen.has(l))){this.seen.set(l,t.clock);for(let c of this.instances){let u=(c.cfg.x-n)*e,f=1-c.cfg.y-a,h=Math.hypot(u,f)||.001,m=c.cfg.react*i*Math.max(.15,1-h*.9);c.hits.push({at:l+h/.85,axis:[-f/h,u/h,0],force:m})}}}for(let[o,n]of this.seen)t.clock-n>5&&this.seen.delete(o)}step(t,e,r){let o=t.cfg;for(let l=t.hits.length-1;l>=0;l--){let i=t.hits[l];if(!(e.clock<i.at)){t.hits.splice(l,1);for(let c=0;c<3;c++)t.w[c]+=i.axis[c]*i.force*3.4;t.popV+=i.force*2.2}}t.q=oe(t.q,[t.w[0],t.w[1]+o.spin,t.w[2]],r);let n=Math.exp(-r*1.3);for(let l=0;l<3;l++)t.w[l]*=n;t.popV+=(-t.pop*70-t.popV*6)*r,t.pop+=t.popV*r;let a=1-Math.exp(-r*3);t.yaw+=((e.light[0]-o.x)*o.follow*1.2-t.yaw)*a,t.pitch+=((1-o.y-e.light[1])*o.follow*.9-t.pitch)*a}render(t){let e=this.gl;if(!e||this.failed)return;let r=Math.max(1,Math.round(this.w*this.dpr)),o=Math.max(1,Math.round(this.h*this.dpr)),n=this.off??this.canvas;if((n.width!==r||n.height!==o)&&(n.width=r,n.height=o,this.off&&(this.canvas.width=r,this.canvas.height=o)),!this.compiled())return;let a=this.w/this.h,l=Number.isNaN(this.last)?0:Math.min(.1,Math.max(0,t.clock-this.last));this.last=t.clock,this.shockwaves(t,a);for(let b of[...this.instances,...this.leaving]){if(!this.ready(b.cfg.key))continue;t.animated&&this.step(b,t,l);let T=b.cfg.reveal,y=Math.min(l,1/30);b.appear=t.animated?b.appear<T?Math.min(T,b.appear+y/Ce):Math.max(T,b.appear-y/Ie):T}this.leaving=this.leaving.filter(b=>b.appear>0);let i=[...this.instances,...this.leaving].filter(b=>b.appear>.001&&b.cfg.size>0&&this.ready(b.cfg.key));if(!i.length){this.drawn&&(e.bindFramebuffer(e.FRAMEBUFFER,null),e.viewport(0,0,r,o),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),this.present(),this.drawn=!1);return}let c=this.renderTargets(r,o);if(!c){this.fail("the 3D layer has no usable render target");return}let u=this.scene,f=t.palette;e.bindFramebuffer(e.FRAMEBUFFER,c.msaa),e.viewport(0,0,r,o),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),e.enable(e.DEPTH_TEST),e.depthFunc(e.LEQUAL),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.useProgram(u.p),e.uniformMatrix4fv(u.u("uProj"),!1,te(be,a,.1,50)),e.uniform4f(u.u("uScreen"),r,o,t.time,t.clock),e.uniform4fv(u.u("uRipples"),t.ripples),e.uniform4f(u.u("uLights"),t.sweepAt,t.dark,t.glow,1);let h=pe*ve;e.uniform3f(u.u("uLightPos"),(t.light[0]*2-1)*h*a,(t.light[1]*2-1)*h,-ve),e.uniform3fv(u.u("uBg"),_(f.background)),f.nebula.forEach((b,T)=>e.uniform3fv(u.u(\`uNeb\${T}\`),_(b))),e.uniform3fv(u.u("uAur0"),_(f.aurora[0])),e.uniform3fv(u.u("uAur1"),_(f.aurora[1])),e.uniform3fv(u.u("uGlow"),_(f.glow)),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.sky);let m=pe*J,v=0,g=0,p=[];for(let b of i){let T=this.ready(b.cfg.key),y=b.cfg,U=b.appear,S=y.size*2*m*(1+b.pop*.12),ge=t.animated?Math.sin(t.time*.9+b.phase)*.035*y.float*S:0,de=t.animated?Math.sin(t.time*.6+b.phase)*.07*y.float:0,xe=N(K(b.pitch,b.yaw,de),N(b.q,K(y.rotation[0],y.rotation[1],y.rotation[2]))),ye=V(xe,[(y.x*2-1)*m*a,(1-2*y.y)*m+ge,-J],[S,S,S]);v=Math.max(v,y.glow),g=Math.max(g,y.rays);let P=this.mode(b,T),Te=this.textures(T);for(let $ of this.prims(T,P)){let Z=()=>this.drawPrim($,b,P,ye,U,Te,t),Ee=$.mesh.material;P===E.hologram||P===E.wire||y.opacity<1||P===E.auto&&Ee.alphaMode===2?p.push(Z):Z()}}e.depthMask(!1);for(let b of p)b();e.depthMask(!0),e.bindVertexArray(null),e.disable(e.DEPTH_TEST),e.disable(e.BLEND),e.bindFramebuffer(e.READ_FRAMEBUFFER,c.msaa),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,c.scene.fb),e.blitFramebuffer(0,0,r,o,0,0,r,o,e.COLOR_BUFFER_BIT,e.NEAREST);let d=(b,T,y,U)=>{e.bindFramebuffer(e.FRAMEBUFFER,y?y.fb:null),e.viewport(0,0,y?y.w:r,y?y.h:o),e.useProgram(b.p),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,T.tex),U(),e.bindVertexArray(this.empty),e.drawArrays(e.TRIANGLES,0,3)},[x,M]=c.bloom,[w,A]=c.wide;d(this.bright,c.scene,x,()=>e.uniform2f(this.bright.u("uTexel"),1/r,1/o));let R=(b,T,y,U)=>d(this.blur,b,T,()=>e.uniform2f(this.blur.u("uDir"),y/b.w,U/b.h));R(x,M,1,0),R(M,x,0,1),R(x,A,2,0),R(A,w,0,1),R(w,A,1.5,0),R(A,w,0,1.5);let D=.35+.65*t.dark;d(this.composite,c.scene,null,()=>{let b=this.composite.u;e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,x.tex),e.activeTexture(e.TEXTURE2),e.bindTexture(e.TEXTURE_2D,w.tex),e.uniform4f(b("uPost"),v*D,g*D,1,0),e.uniform2f(b("uLight"),t.light[0],t.light[1])}),this.present(),this.drawn=!0}drawPrim(t,e,r,o,n,a,l){let i=this.gl,c=this.scene,u=e.cfg,f=t.mesh.material,h=[...f.base],m=f.metallic,v=f.roughness,g=[0,0,0,-1],p=u.color&&_(u.color),d=[!1,!1,!0,!1];switch(r){case E.auto:p&&(h=[h[0]*p[0],h[1]*p[1],h[2]*p[2],h[3]]),g=[...f.emissive,f.alphaMode===1?f.alphaCutoff:-1],d=[!0,!0,!0,!0];break;case E.chrome:h=[...p??[.92,.93,.96],1],m=1,v=.06;break;case E.iridescent:h=[...p??[.7,.7,.75],1],m=1,v=.16;break;case E.hologram:h=p?[...p,1]:[-1,-1,-1,1],d=[!1,!1,!1,!1];break;case E.wire:h=[...p??_(l.palette.grid),1],d=[!1,!1,!1,!1];break;default:h=[...p??[1,1,1],1],d=[!1,!1,r!==E.glass,!1]}let x=(R,D,b)=>{let T=b&&D>=0?a[D]:null;return i.activeTexture(i.TEXTURE0+R),i.bindTexture(i.TEXTURE_2D,T??this.white),T?1:0},M=[x(1,f.baseTex,d[0]),x(2,f.mrTex,d[1]),x(3,f.normalTex,d[2]),x(4,f.emissiveTex,d[3])],w=x(5,f.occlusionTex,r===E.auto);i.uniformMatrix4fv(c.u("uModel"),!1,o),i.uniformMatrix3fv(c.u("uNormalMat"),!1,z(o)),i.uniform4f(c.u("uMat"),r,m,v,u.opacity),i.uniform4fv(c.u("uBase"),h),i.uniform4fv(c.u("uEmissive"),g),i.uniform4f(c.u("uFx"),n,u.morph,u.react,r===E.hologram?.5:0),i.uniform4fv(c.u("uTex"),M),i.uniform1f(c.u("uHasOcc"),w);let A;r===E.wire?(t.wire??=this.upload(B(t.mesh)),A=t.wire):(t.geo??=this.upload(t.mesh),A=t.geo,i.vertexAttrib3f(4,1,1,1)),i.bindVertexArray(A.vao),t.mesh.uvs||i.vertexAttrib2f(2,0,0),t.mesh.colors||i.vertexAttrib4f(3,1,1,1,1),A.indexed?i.drawElements(i.TRIANGLES,A.count,i.UNSIGNED_INT,0):i.drawArrays(i.TRIANGLES,0,A.count)}present(){this.off&&this.view&&this.view.transferFromImageBitmap(this.off.transferToImageBitmap())}};self.deepSkyModels=(s,t)=>new H(s,t);})();
`})),fe=/* @__PURE__ */ r({modelsWorker:()=>N}),pe=n((()=>{de()})),P,me,he=n((()=>{P=`
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`,me=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec4 uFrame;      // xy: resolution, z: animation time, w: clock (s)
uniform vec4 uPointer;    // xy: light position (0..1, y up), z: dark mix, w: last sweep (clock)
uniform vec4 uRipples[4]; // xy: center (0..1), z: start (clock), w: strength
uniform vec4 uMix;        // nebula, aurora, rays, glow intensities
uniform vec4 uFx;         // lens, grain, vignette, shimmer
uniform vec4 uShape;      // nebula scale, aurora offset, rays spread, intro duration
uniform vec3 uBg;
uniform vec3 uNeb0;
uniform vec3 uNeb1;
uniform vec3 uNeb2;
uniform vec3 uNeb3;
uniform vec3 uAur0;
uniform vec3 uAur1;
uniform vec3 uRays;
uniform vec3 uGlow;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.03 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 res = uFrame.xy;
  float t = uFrame.z;
  float clock = uFrame.w;
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // shockwaves: expanding rings that bend everything behind them
  float ring = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 rp = uRipples[i];
    float age = clock - rp.z;
    if (rp.w > 0.0 && age > 0.0 && age < 3.0) {
      vec2 dv = p - (rp.xy - 0.5) * vec2(aspect, 1.0);
      float d = length(dv);
      float w = d - age * 0.85;
      float k = exp(-w * w * 380.0) * (1.0 - age / 3.0) * rp.w;
      ring += k;
      p += dv / (d + 1e-4) * k * 0.035;
    }
  }

  // roaming light (follows the cursor) with a subtle magnifying lens
  vec2 md = p - (uPointer.xy - 0.5) * vec2(aspect, 1.0);
  float ml = exp(-dot(md, md) * 7.0);
  p -= md * 0.08 * ml * uFx.x;

  // nebula
  float neb = 0.0;
  vec3 nebCol = uNeb0;
  if (uMix.x > 0.0) {
    vec2 np = p * uShape.x;
    vec2 q = vec2(fbm(np * 1.3 + vec2(0.0, t * 0.035)),
                  fbm(np * 1.3 + vec2(5.2, -t * 0.03)));
    vec2 r = vec2(fbm(np * 1.7 + 3.0 * q + vec2(1.7, 9.2) + t * 0.045),
                  fbm(np * 1.7 + 3.0 * q + vec2(8.3, 2.8) - t * 0.04));
    neb = smoothstep(0.26, 0.92, fbm(np * 1.5 + 3.2 * r));
    nebCol = mix(uNeb0, uNeb1, clamp(q.x * 1.7 - 0.2, 0.0, 1.0));
    nebCol = mix(nebCol, uNeb2, clamp(r.y * r.y * 2.0, 0.0, 1.0));
    nebCol = mix(nebCol, uNeb3, clamp(r.x * r.x * r.x * 2.2, 0.0, 1.0) * 0.55);
    // slow drift of the palette towards warm highlights
    nebCol = mix(nebCol, nebCol.brg * vec3(1.1, 0.95, 0.6), uFx.w * (0.5 + 0.5 * sin(t * 0.045)));
  }

  // aurora: waving curtains with a sharp lower edge and vertical streaks
  float aur = 0.0;
  vec3 aurCol = vec3(0.0);
  if (uMix.y > 0.0) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float yc = uShape.y + fi * 0.1
        + 0.07 * sin(p.x * (1.4 + fi * 0.6) + t * (0.22 + fi * 0.07) + fi * 2.1)
        + 0.03 * sin(p.x * 5.3 - t * 0.41 + fi * 1.3)
        + 0.015 * sin(p.x * 11.0 + t * 0.9 + fi);
      float dy = p.y - yc;
      float band = exp(-max(dy, 0.0) * 7.0) * exp(-max(-dy, 0.0) * 30.0);
      float streak = 0.45 + 0.55 * noise(vec2(p.x * 24.0 + fi * 17.0 + t * 0.15, t * 0.5 + fi));
      float a = band * streak * (1.0 - fi * 0.22);
      aur += a;
      aurCol += a * mix(uAur0, uAur1, clamp(dy * 5.0 + fi * 0.25, 0.0, 1.0));
    }
  }

  // light beams from a slowly swaying source above the screen
  float rays = 0.0;
  if (uMix.z > 0.0) {
    vec2 sv = p - vec2(0.45 * sin(t * 0.06), 0.95);
    float ang = atan(sv.x, -sv.y);
    float s = uShape.z;
    rays = pow(0.5 + 0.5 * sin(ang * 11.0 * s + t * 0.3), 7.0)
      + 0.7 * pow(0.5 + 0.5 * sin(ang * 6.0 * s - t * 0.2 + 1.3), 9.0)
      + 0.5 * pow(0.5 + 0.5 * sin(ang * 19.0 * s + t * 0.45 + 2.1), 12.0);
    rays *= exp(-length(sv) * 0.9) * smoothstep(1.3, 0.2, abs(ang));
  }

  // diagonal light sweep (pulse)
  float sweep = 0.0;
  float pa = clock - uPointer.w;
  if (uPointer.w > 0.0 && pa > 0.0 && pa < 1.6) {
    float x = uv.x + (uv.y - 0.5) * 0.35;
    sweep = exp(-pow((x - (pa * 1.1 - 0.2)) * 7.0, 2.0)) * (1.0 - pa / 1.6);
  }

  float intro = uShape.w > 0.0 ? smoothstep(0.0, uShape.w, clock) : 1.0;

  // dark theme: additive light over a deep background
  vec3 dark = uBg;
  dark += nebCol * neb * 0.75 * uMix.x;
  dark += aurCol * 0.45 * uMix.y;
  dark += uRays * rays * 0.17 * uMix.z;
  dark += uGlow * ml * (0.14 + neb * 0.45) * uMix.w;
  dark += uGlow * (ring * 0.35 + sweep * 0.12);
  dark = mix(uBg, dark, intro);
  dark *= 1.0 - uFx.z * dot(uv - 0.5, uv - 0.5);

  // light theme: soft pastel tints over a bright background
  vec3 light = uBg;
  light = mix(light, mix(nebCol, uBg, 0.45), neb * 0.3 * uMix.x);
  light = mix(light, mix(aurCol / max(aur, 1e-3), uBg, 0.5), clamp(aur, 0.0, 1.0) * 0.28 * uMix.y);
  light = mix(light, mix(uRays, uBg, 0.5),
    clamp(rays * 0.25 * uMix.z + ml * 0.22 * uMix.w + ring * 0.2 + sweep * 0.15, 0.0, 1.0));
  light = mix(uBg, light, intro);

  vec3 col = mix(light, dark, uPointer.z);
  col += (hash(gl_FragCoord.xy + fract(clock * 7.0) * 113.0) - 0.5) * uFx.y;
  gl_FragColor = vec4(col, 1.0);
}
`})),ge=/* @__PURE__ */ r({Engine:()=>ye});function F(e,t,n){try{return e.getContext(t,n)}catch{return null}}function _e(e,t){if(typeof OffscreenCanvas<`u`)return new OffscreenCanvas(e,t);let n=document.createElement(`canvas`);return n.width=e,n.height=t,n}function I(e,t,n){let r=(e,t)=>[e[0]+(t[0]-e[0])*n,e[1]+(t[1]-e[1])*n,e[2]+(t[2]-e[2])*n];return{background:r(e.background,t.background),nebula:[r(e.nebula[0],t.nebula[0]),r(e.nebula[1],t.nebula[1]),r(e.nebula[2],t.nebula[2]),r(e.nebula[3],t.nebula[3])],aurora:[r(e.aurora[0],t.aurora[0]),r(e.aurora[1],t.aurora[1])],rays:r(e.rays,t.rays),glow:r(e.glow,t.glow),stars:[r(e.stars[0],t.stars[0]),r(e.stars[1],t.stars[1]),r(e.stars[2],t.stars[2])],spotlight:[r(e.spotlight[0],t.spotlight[0]),r(e.spotlight[1],t.spotlight[1])],lines:r(e.lines,t.lines),meteor:r(e.meteor,t.meteor),grid:[...r([e.grid[0],e.grid[1],e.grid[2]],[t.grid[0],t.grid[1],t.grid[2]]),e.grid[3]+(t.grid[3]-e.grid[3])*n]}}var L,ve,R,z,B,ye,be=n((()=>{he(),L=[`uFrame`,`uPointer`,`uRipples`,`uMix`,`uFx`,`uShape`,`uBg`,`uNeb0`,`uNeb1`,`uNeb2`,`uNeb3`,`uAur0`,`uAur1`,`uRays`,`uGlow`],ve=2.2,R=typeof requestAnimationFrame==`function`?e=>requestAnimationFrame(e):e=>setTimeout(e,16),z=typeof cancelAnimationFrame==`function`?e=>cancelAnimationFrame(e):e=>clearTimeout(e),B=e=>`${Math.round(e[0]*255)},${Math.round(e[1]*255)},${Math.round(e[2]*255)}`,ye=class{glCanvas;fxCanvas;emit;gl=null;off=null;view=null;u={};ctx;cfg;dark;darkMix;palette;paletteMix=-1;animated;visible=!0;sized=!1;running=!1;rafId=0;t0=performance.now();time=0;last=0;lastGl=-1;lastFx=-1;glStep;glScale;busyUntil=0;lastPointer=-99;w=1;h=1;dpr=1;spotAlpha=0;mouse={x:.5,y:.6,tx:.5,ty:.6,px:-9999,py:-9999,sx:-9999,sy:-9999,inside:!1};ripples=/* @__PURE__ */ new Float32Array(16);nextRipple=0;sweepAt=0;stars=[];meteors=[];rings=[];near=[];nextMeteor=2;sprites=[];spriteKey=``;frameTimes=0;frameCount=0;adaptAt=0;stats;statsAt=0;statFx=0;statGl=0;readySent=!1;models=null;modelDpr=1;constructor(e,t,n,r){this.glCanvas=e,this.fxCanvas=t,this.emit=n,this.cfg=r.config,this.dark=r.dark,this.darkMix=+!!r.dark,this.palette=r.dark?r.config.palettes.dark:r.config.palettes.light,this.animated=r.animated,this.stats=r.stats,this.glScale=r.config.scale,this.glStep=1/(r.config.fps+1),r.config.intro&&(this.ripples.set([.5,.8,.35,1],0),this.nextRipple=1),this.initGl()||this.fail(),this.ctx=F(t,`2d`)}handle(e){switch(e.type){case`config`:this.setConfig(e.config);break;case`resize`:this.resize(e.w,e.h,e.dpr);break;case`pointer`:this.pointer(e.x,e.y,e.inside);break;case`click`:this.click(e.x,e.y,e.effect??this.cfg.click);break;case`pulse`:this.sweepAt=this.now();break;case`theme`:if(this.dark===e.dark)break;this.dark=e.dark,this.running||this.renderStatic();break;case`animated`:this.animated=e.on,this.sync();break;case`visible`:this.visible=e.on,this.sync();break;case`busy`:this.busyUntil=this.now()+2;break;case`stats`:this.stats=e.on;break;case`modelData`:this.models?.load(e.key,e.asset);break;case`modelPlaces`:this.placeModels(e.places)}}placeModels(e){this.cfg.models=this.cfg.models.map((t,n)=>{let[r,i,a]=e.slice(n*3,n*3+3);return Number.isFinite(r)?{...t,x:r,y:i,size:a}:t}),this.models?.place(this.cfg.models),this.running||this.renderStatic()}attachModels(e){this.models?.destroy(),this.models=e,e.onChange=()=>{this.running||this.renderStatic()},e.configure(this.cfg.models),e.resize(this.w,this.h,this.modelDpr),this.lastGl=-1,this.running||this.renderStatic()}destroy(){this.models?.destroy(),this.models=null,this.stop(),this.gl?.getExtension(`WEBGL_lose_context`)?.loseContext(),this.gl=null}now(){return(performance.now()-this.t0)/1e3}fail(){this.gl=null,this.emit({type:`glFailed`})}markReady(){this.readySent||(this.readySent=!0,this.emit({type:`ready`}))}initGl(){let e={alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1},t=null;if(typeof OffscreenCanvas<`u`){let n=new OffscreenCanvas(1,1);t=F(n,`webgl`,e);let r=t?F(this.glCanvas,`bitmaprenderer`):null;t&&r?(this.off=n,this.view=r):t=null}if(t??=F(this.glCanvas,`webgl`,e),!t||!this.setupProgram(t))return!1;let n=t,r=this.off??this.glCanvas;return r.addEventListener(`webglcontextlost`,e=>{e.preventDefault(),this.gl=null}),r.addEventListener(`webglcontextrestored`,()=>{this.setupProgram(n)?this.gl=n:this.fail()}),this.gl=t,!0}setupProgram(e){let t=(t,n)=>{let r=e.createShader(t);return r?(e.shaderSource(r,n),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS)?r:(e.isContextLost()||console.warn(`[deep-sky]`,e.getShaderInfoLog(r)),null)):null},n=t(e.VERTEX_SHADER,P),r=t(e.FRAGMENT_SHADER,me),i=e.createProgram();if(!n||!r||!i)return!1;if(e.attachShader(i,n),e.attachShader(i,r),e.linkProgram(i),!e.getProgramParameter(i,e.LINK_STATUS))return e.isContextLost()||console.warn(`[deep-sky]`,e.getProgramInfoLog(i)),!1;e.useProgram(i),e.bindBuffer(e.ARRAY_BUFFER,e.createBuffer()),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW);let a=e.getAttribLocation(i,`aPos`);e.enableVertexAttribArray(a),e.vertexAttribPointer(a,2,e.FLOAT,!1,0,0);for(let t of L)this.u[t]=e.getUniformLocation(i,t);return!0}shaderPalette(){if(this.paletteMix!==this.darkMix){let{dark:e,light:t}=this.cfg.palettes;this.palette=this.darkMix>=1?e:this.darkMix<=0?t:I(t,e,this.darkMix),this.paletteMix=this.darkMix}return this.palette}renderGl(e){let t=this.gl;if(!t)return;let{u:n,cfg:r,mouse:i}=this,a=this.shaderPalette(),o=t.drawingBufferWidth,s=t.drawingBufferHeight;t.viewport(0,0,o,s),t.uniform4f(n.uFrame,o,s,this.time,e),t.uniform4f(n.uPointer,i.x,i.y,this.darkMix,this.sweepAt),t.uniform4fv(n.uRipples,this.ripples),t.uniform4f(n.uMix,r.nebula,r.aurora,r.rays,r.glow),t.uniform4f(n.uFx,r.lens,r.grain,r.vignette,r.shimmer),t.uniform4f(n.uShape,r.nebulaScale,r.auroraPosition-.5,r.raysSpread,r.intro?ve:0),t.uniform3fv(n.uBg,a.background),t.uniform3fv(n.uNeb0,a.nebula[0]),t.uniform3fv(n.uNeb1,a.nebula[1]),t.uniform3fv(n.uNeb2,a.nebula[2]),t.uniform3fv(n.uNeb3,a.nebula[3]),t.uniform3fv(n.uAur0,a.aurora[0]),t.uniform3fv(n.uAur1,a.aurora[1]),t.uniform3fv(n.uRays,a.rays),t.uniform3fv(n.uGlow,a.glow),t.drawArrays(t.TRIANGLES,0,3);let c=this.models?.active?this.models:null;if(this.off&&this.view){let e=this.off.transferToImageBitmap();c?.backdrop(e),this.view.transferFromImageBitmap(e)}else c?.backdrop(this.glCanvas);this.statGl++,this.markReady()}sync(){this.animated&&this.visible?this.start():(this.stop(),this.animated||this.renderStatic())}start(){if(this.running||!this.sized||!this.animated||!this.visible)return;this.running=!0,this.last=this.now(),this.statsAt=this.last,this.statFx=0,this.statGl=0,this.adaptAt=this.last+3;let e=()=>{if(!this.running)return;this.rafId=R(e);let t=this.now(),n=t-this.last;this.last=t,this.time+=Math.min(n,.1)*this.cfg.speed;let r=t<this.busyUntil,i=t-this.lastPointer<5,a=this.cfg.grid>0&&this.cfg.gridSpeed>0||!!this.models?.active,o=!r&&(i||a||this.cfg.fps>45)?1/62:1/31;if(t-this.lastFx>=o){let e=Math.min(.05,Math.max(.001,t-this.lastFx))*60;this.lastFx=t,this.step(e),this.renderFx(t,e),this.renderModels(t)}t-this.lastGl>=(r?1/12:this.glStep)&&(this.lastGl=t,this.renderGl(t)),this.adapt(t,n),this.report(t)};this.rafId=R(e)}stop(){this.running=!1,z(this.rafId)}renderStatic(){if(!this.sized)return;this.darkMix=+!!this.dark,this.mouse.x=.5,this.mouse.y=.6,this.spotAlpha=0;let e=this.now()+100;this.renderGl(e),this.renderFx(e,0),this.renderModels(e)}renderModels(e){let t=this.models;if(!t?.active)return;let n=this.mouse;t.render({time:this.time,clock:e,light:[n.x,n.y],ripples:this.ripples,sweepAt:this.sweepAt,palette:this.shaderPalette(),dark:this.darkMix,glow:this.cfg.glow,animated:this.running})}step(e){let t=this.mouse;t.inside||(t.tx=.5+.32*Math.sin(this.time*.11),t.ty=.62+.18*Math.sin(this.time*.17+1));let n=1-.93**e;t.x+=(t.tx-t.x)*n,t.y+=(t.ty-t.y)*n;let r=+!!this.dark;this.darkMix+=(r-this.darkMix)*(1-.9**e),Math.abs(r-this.darkMix)<.002&&(this.darkMix=r)}adapt(e,t){if(!this.cfg.adaptive||(t<.25&&(this.frameTimes+=t,this.frameCount++),e-this.adaptAt<1.5))return;let n=this.frameCount,r=n?this.frameTimes/n:0;this.frameTimes=0,this.frameCount=0,this.adaptAt=e,!(n<20||r<=1/40)&&(this.models?.active&&this.modelDpr>1.01?(this.modelDpr=Math.max(1,this.modelDpr*.75),this.models.resize(this.w,this.h,this.modelDpr)):this.glScale>this.cfg.minScale+.01?(this.glScale=Math.max(this.cfg.minScale,this.glScale*.7),this.applySize()):this.glStep<1/15&&(this.glStep+=1/60))}report(e){if(!this.stats)return;let t=e-this.statsAt;t<1||(this.emit({type:`stats`,fps:Math.round(this.statFx/t),shaderFps:Math.round(this.statGl/t),scale:Math.round(this.glScale*100)/100,particles:this.stars.length}),this.statsAt=e,this.statFx=0,this.statGl=0)}setConfig(e){let t=this.cfg;this.cfg=e,this.paletteMix=-1;let n=e=>JSON.stringify([e.palettes.dark.stars,e.palettes.dark.meteor,e.palettes.light.stars,e.palettes.light.meteor]);n(e)!==n(t)&&(this.spriteKey=``),(e.scale!==t.scale||e.minScale!==t.minScale)&&(this.glScale=e.scale,this.sized&&this.applySize()),e.fps!==t.fps&&(this.glStep=1/(e.fps+1)),e.meteors!==t.meteors&&(this.nextMeteor=this.time+.5),this.models?.configure(e.models),this.sized&&this.fitStars(),this.running||this.renderStatic()}resize(e,t,n){let r=Math.max(1,e)/this.w,i=Math.max(1,t)/this.h;if(this.w=Math.max(1,e),this.h=Math.max(1,t),this.dpr=n,this.modelDpr=n,this.applySize(),this.sized)for(let e of this.stars)e.x*=r,e.y*=i;this.fitStars(),this.sized?this.running||this.renderStatic():(this.sized=!0,this.sync())}applySize(){let e=Math.max(1,Math.round(this.w*this.glScale)),t=Math.max(1,Math.round(this.h*this.glScale));this.glCanvas.width=e,this.glCanvas.height=t,this.off&&(this.off.width=e,this.off.height=t),this.fxCanvas.width=Math.max(1,Math.round(this.w*this.dpr)),this.fxCanvas.height=Math.max(1,Math.round(this.h*this.dpr)),this.ctx?.setTransform(this.dpr,0,0,this.dpr,0,0),this.models?.resize(this.w,this.h,this.modelDpr)}pointer(e,t,n){let r=this.mouse;r.inside=n,n&&(r.sx<-1e3&&(r.sx=e,r.sy=t),r.px=e,r.py=t,r.tx=e/this.w,r.ty=1-t/this.h,this.lastPointer=this.now())}click(e,t,n){if(!this.running||n===`none`)return;let r=this.now(),i=n===`shockwave`;this.rings.length<24&&this.rings.push({x:e,y:t,start:r,strong:i}),i&&this.ripples.set([e/this.w,1-t/this.h,r,1],this.nextRipple++%4*4);let a=i?260:160,o=i?6:2.2;for(let n of this.stars){let r=n.x-e,i=n.y-t,s=Math.sqrt(r*r+i*i)||1;if(s>a)continue;let c=(1-s/a)*o;n.ix+=r/s*c,n.iy+=i/s*c}}fitStars(){let e=Math.min(220,Math.max(70,this.w*this.h/8e3)),t=Math.round(e*this.cfg.stars);for(;this.stars.length<t;)this.stars.push(this.newStar(!0));this.stars.length>t&&(this.stars.length=t)}newStar(e){let t=.15+Math.random()**1.5*.85;return{x:Math.random()*this.w,y:e?Math.random()*this.h:this.h+10,z:t,vx:(Math.random()-.5)*.1*t,vy:-(.05+Math.random()*.25)*t,ix:0,iy:0,size:.5+t*1.6,phase:Math.random()*Math.PI*2,tint:Math.floor(Math.random()*3)}}buildSprites(e,t){this.sprites=[...e.stars,e.meteor].map(e=>{let t=_e(64,64),n=F(t,`2d`);if(n){let t=B(e),r=n.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,`rgba(${t},1)`),r.addColorStop(.12,`rgba(${t},0.85)`),r.addColorStop(.35,`rgba(${t},0.2)`),r.addColorStop(1,`rgba(${t},0)`),n.fillStyle=r,n.fillRect(0,0,64,64)}return t}),this.spriteKey=t}renderGrid(e,t){let n=this.cfg,{w:r,h:i}=this,[a,o,s,c]=t.grid,l=`${Math.round(a*255)},${Math.round(o*255)},${Math.round(s*255)}`,u=c*n.grid;if(u<=0)return;let d=n.gridSize,f=n.gridTilt*Math.PI/180,p=Math.sin(f),m=Math.cos(f),h=n.gridHeight*i*.8,g=e=>700/(700+e*p),_=e=>i-e*m*g(e),v=_(h);if(i-v<1)return;let y=e.createLinearGradient(0,i,0,v);for(let e=0;e<=8;e++){let t=h*e/8;y.addColorStop((i-_(t))/(i-v),`rgba(${l},${u*(1-e/8)})`)}let b=g(h);e.globalAlpha=1,e.fillStyle=y,e.beginPath();let x=Math.ceil(r/d);for(let t=-x;t<=x;t++){let n=t*d,a=r/2+n,o=r/2+n*b;Math.max(a,o)<-1||Math.min(a,o)>r+1||(e.moveTo(a-.5,i),e.lineTo(a+.5,i),e.lineTo(o+.5*b,v),e.lineTo(o-.5*b,v),e.closePath())}e.fill();let S=this.time*26.67*n.gridSpeed%d;for(let t=(d-S)%d;t<h;t+=d){let n=g(t),i=m*n*n,a=i*d,o=u*(1-t/h)*Math.min(1,i)*Math.min(1,a/4);if(o<.002)continue;e.fillStyle=`rgba(${l},${o})`;let s=Math.max(1,i);e.fillRect(0,_(t)-s/2,r,s)}}renderFx(e,t){let n=this.ctx;if(!n)return;let r=this.cfg,i=this.darkMix>.5,a=i?r.palettes.dark:r.palettes.light,o=i?`dark`:`light`;this.spriteKey!==o&&this.buildSprites(a,o),n.clearRect(0,0,this.w,this.h),n.globalCompositeOperation=`source-over`,r.grid>0&&this.renderGrid(n,a),n.globalCompositeOperation=i?`lighter`:`source-over`;let s=i?1:.55,c=this.mouse;if(t>0){let e=c.inside&&r.spotlight>0?1:0;this.spotAlpha+=(e-this.spotAlpha)*(1-.85**t);let n=1-.55**t;c.sx+=(c.px-c.sx)*n,c.sy+=(c.py-c.sy)*n}if(this.spotAlpha>.01&&r.spotlight>0){let e=this.spotAlpha*r.spotlight,t=r.spotlightRadius,[o,s]=a.spotlight,l=n.createRadialGradient(c.sx,c.sy,0,c.sx,c.sy,t);l.addColorStop(0,`rgba(${B(o)},${(i?.45:.3)*e})`),l.addColorStop(i?.35:.4,`rgba(${B(s)},${(i?.16:.1)*e})`),l.addColorStop(1,`rgba(${B(s)},0)`),n.globalAlpha=1,n.fillStyle=l,n.fillRect(c.sx-t,c.sy-t,t*2,t*2)}let l=46*r.parallax,u=(c.x-.5)*-l,d=(c.y-.5)*l,f=.94**t,p=t*r.starSpeed*r.speed,m=c.inside&&t>0&&r.field>0,h=r.fieldRadius,g=this.near;g.length=0;let _=5*r.starSize,v=r.twinkle*.45;for(let e of this.stars){let i=e.x+u*e.z,a=e.y+d*e.z;if(m){let n=i-c.px,o=a-c.py,s=n*n+o*o;if(s<h*h){let c=Math.sqrt(s)||1,l=(1-c/h)*e.z*t*r.field;e.ix+=(-o/c*.32+n/c*.1)*l,e.iy+=(n/c*.32+o/c*.1)*l,r.constellations&&g.push({x:i,y:a,d:c})}}e.ix*=f,e.iy*=f,e.x+=e.vx*p+e.ix*t,e.y+=e.vy*p+e.iy*t,(e.y<-20||e.y>this.h+20||e.x<-40||e.x>this.w+40)&&Object.assign(e,this.newStar(!1));let o=1-v*(1-Math.sin(this.time*(1.2+e.z*1.5)+e.phase)),l=e.size*_,y=(.2+.8*e.z)*o*s,b=this.sprites[e.tint];if(n.globalAlpha=y,n.drawImage(b,i-l,a-l,l*2,l*2),r.flares&&e.z>.88){let e=l*1.8*o;n.globalAlpha=y*.55,n.drawImage(b,i-e,a-.6,e*2,1.2),n.drawImage(b,i-.6,a-e,1.2,e*2)}}if(g.length){let e=r.linkDistance;n.lineWidth=.8,n.strokeStyle=`rgb(${B(a.lines)})`;for(let t=0;t<g.length;t++){let r=g[t],i=1-r.d/h;n.globalAlpha=i*.35*s,n.beginPath(),n.moveTo(r.x,r.y),n.lineTo(c.px,c.py),n.stroke();for(let a=t+1;a<g.length;a++){let t=g[a],o=r.x-t.x,c=r.y-t.y,l=Math.sqrt(o*o+c*c);l>e||(n.globalAlpha=(1-l/e)*i*.7*s,n.beginPath(),n.moveTo(r.x,r.y),n.lineTo(t.x,t.y),n.stroke())}}}if(t>0&&r.meteors>0&&this.time>this.nextMeteor){this.nextMeteor=this.time+(2.5+Math.random()*4.5)/r.meteors;let e=Math.random()<.5?1:-1,t=(.35+Math.random()*.35)*Math.PI*.5,n=9+Math.random()*7;this.meteors.push({x:this.w*(.15+Math.random()*.7),y:this.h*Math.random()*.35,vx:Math.cos(t)*n*e,vy:Math.sin(t)*n,life:1,len:140+Math.random()*180})}let y=t*Math.max(0,r.speed);for(let e=this.meteors.length-1;e>=0;e--){let t=this.meteors[e];if(t.x+=t.vx*y,t.y+=t.vy*y,t.life-=.013*y,t.life<=0){this.meteors.splice(e,1);continue}let r=Math.hypot(t.vx,t.vy),i=t.x-t.vx/r*t.len,o=t.y-t.vy/r*t.len,c=B(a.meteor),l=n.createLinearGradient(i,o,t.x,t.y);l.addColorStop(0,`rgba(${c},0)`),l.addColorStop(1,`rgba(${c},${.9*t.life})`),n.globalAlpha=s,n.strokeStyle=l,n.lineWidth=1.6,n.beginPath(),n.moveTo(i,o),n.lineTo(t.x,t.y),n.stroke(),n.globalAlpha=t.life*s,n.drawImage(this.sprites[3],t.x-9,t.y-9,18,18)}for(let t=this.rings.length-1;t>=0;t--){let r=this.rings[t],i=(e-r.start)/(r.strong?1.1:.9);i>=1||i<0?this.rings.splice(t,1):(n.strokeStyle=`rgb(${B(a.lines)})`,n.globalAlpha=(1-i)*(r.strong?.5:.35)*s,n.lineWidth=(r.strong?1.8:1.2)*(1-i)+.3,n.beginPath(),n.arc(r.x,r.y,(1-(1-i)**3)*(r.strong?190:110),0,Math.PI*2),n.stroke())}n.globalAlpha=1,n.globalCompositeOperation=`source-over`,this.statFx++,this.markReady()}}}));function V(e,t,n,r){return{positions:new Float32Array(e),normals:new Float32Array(t),uvs:n&&new Float32Array(n),colors:null,indices:r&&new Uint32Array(r),material:Me()}}function H(e,t,n){let r=[],i=[],a=[],o=[];for(let o=0;o<=t;o++)for(let s=0;s<=e;s++){let c=n(s/e,o/t);r.push(c[0],c[1],c[2]),i.push(c[3],c[4],c[5]),a.push(s/e,o/t)}for(let n=0;n<t;n++)for(let t=0;t<e;t++){let r=n*(e+1)+t,i=r+e+1;o.push(r,r+1,i,r+1,i+1,i)}return xe(V(r,i,a,o))}function xe(e){let{positions:t,normals:n,indices:r}=e;if(!r)return e;for(let e=0;e<r.length;e+=3){let[i,a,o]=[r[e]*3,r[e+1]*3,r[e+2]*3],s=t[a]-t[i],c=t[a+1]-t[i+1],l=t[a+2]-t[i+2],u=t[o]-t[i],d=t[o+1]-t[i+1],f=t[o+2]-t[i+2],p=c*f-l*d,m=l*u-s*f,h=s*d-c*u;p*(n[i]+n[a]+n[o])+m*(n[i+1]+n[a+1]+n[o+1])+h*(n[i+2]+n[a+2]+n[o+2])<0&&(r[e+1]=o/3,r[e+2]=a/3)}return e}function Se(e,t){let n=[],r=[],i=[0,1,2].map(t=>e.reduce((e,n)=>e+n[t],0)/e.length);for(let[a,o,s]of t){let[t,c,l]=[e[a],e[o],e[s]],u=[c[0]-t[0],c[1]-t[1],c[2]-t[2]],d=[l[0]-t[0],l[1]-t[1],l[2]-t[2]],f=[u[1]*d[2]-u[2]*d[1],u[2]*d[0]-u[0]*d[2],u[0]*d[1]-u[1]*d[0]],p=[0,1,2].map(e=>(t[e]+c[e]+l[e])/3-i[e]);f[0]*p[0]+f[1]*p[1]+f[2]*p[2]<0&&([o,s]=[s,o],[c,l]=[l,c],f=f.map(e=>-e));let m=Math.hypot(f[0],f[1],f[2])||1;for(let e of[t,c,l])n.push(e[0],e[1],e[2]),r.push(f[0]/m,f[1]/m,f[2]/m)}return V(n,r,null,null)}function U(e,t=96,n=64){return H(t,n,(t,n)=>{let r=t*J,i=n*Math.PI,a=Math.sin(i)*Math.cos(r),o=Math.cos(i),s=Math.sin(i)*Math.sin(r);return[a*e,o*e,s*e,a,o,s]})}function Ce(e,t,n){return H(n?32:128,n?12:48,(n,r)=>{let i=n*J,a=r*J,o=Math.cos(a)*Math.cos(i),s=Math.cos(a)*Math.sin(i),c=Math.sin(a);return[e*Math.cos(i)+t*o,e*Math.sin(i)+t*s,t*c,o,s,c]})}function we(e){let t=e=>{let t=.5*(2+Math.cos(3*e));return[t*Math.cos(2*e),t*Math.sin(2*e),.5*Math.sin(3*e)]},n=.26;return H(e?128:320,e?8:40,(e,r)=>{let i=e*J,a=t(i),o=t(i+.01),s=[o[0]-a[0],o[1]-a[1],o[2]-a[2]],c=[o[0]+a[0],o[1]+a[1],o[2]+a[2]],l=[s[1]*c[2]-s[2]*c[1],s[2]*c[0]-s[0]*c[2],s[0]*c[1]-s[1]*c[0]];c=[l[1]*s[2]-l[2]*s[1],l[2]*s[0]-l[0]*s[2],l[0]*s[1]-l[1]*s[0]];let u=Math.hypot(l[0],l[1],l[2]),d=Math.hypot(c[0],c[1],c[2]),f=-Math.cos(r*J),p=Math.sin(r*J),m=[0,1,2].map(e=>f*c[e]/d+p*l[e]/u);return[a[0]+n*m[0],a[1]+n*m[1],a[2]+n*m[2],m[0],m[1],m[2]]})}function Te(){let e=[[0,1.05,0],[0,-.7,0]];for(let t=0;t<2;t++)for(let n=0;n<6;n++){let r=n/6*J+t*.08,i=.36+t*.02;e.push([Math.cos(r)*i,t?-.3:.42,Math.sin(r)*i])}let t=[];for(let e=0;e<6;e++){let n=(e+1)%6,[r,i,a,o]=[2+e,2+n,8+e,8+n];t.push([0,r,i],[r,a,i],[i,a,o],[1,o,a])}return Se(e,t)}function W(){let e=(1+Math.sqrt(5))/2;return Se([[-1,e,0],[1,e,0],[-1,-e,0],[1,-e,0],[0,-1,e],[0,1,e],[0,-1,-e],[0,1,-e],[e,0,-1],[e,0,1],[-e,0,-1],[-e,0,1]],[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]])}function Ee(){let e=[];for(let t=0;t<8;t++)e.push([t&1?.5:-.5,t&2?.5:-.5,t&4?.5:-.5]);return Se(e,[[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]].flatMap(([e,t,n,r])=>[[e,t,n],[e,n,r]]))}function De(e,t,n){return H(n?48:160,n?2:1,(n,r)=>{let i=n*J,a=e+(t-e)*r;return[Math.cos(i)*a,0,Math.sin(i)*a,0,1,0]})}function Oe(e){let t=[],n=[],r=[],i=[];for(let a of e){let e=t.length/3;if(t.push(...a.positions),n.push(...a.normals),a.uvs)r.push(...a.uvs);else for(let e=0;e<a.positions.length/3;e++)r.push(0,0);if(a.indices)for(let t of a.indices)i.push(t+e);else for(let t=0;t<a.positions.length/3;t++)i.push(t+e)}return V(t,n,r,i)}function G(e,t){let n=Math.cos(t),r=Math.sin(t);for(let t of[e.positions,e.normals])for(let e=0;e<t.length;e+=3){let i=t[e],a=t[e+1];t[e]=i*n-a*r,t[e+1]=i*r+a*n}return e}function ke(e,t=!1){switch(e){case`knot`:return[we(t)];case`torus`:return[Ce(.36,.15,t)];case`crystal`:return[Te()];case`gem`:return[W()];case`planet`:return[G(Oe([t?U(.42,20,12):U(.42),De(.56,.86,t)]),.38)];case`cube`:return[Ee()];default:return[t?U(.5,22,14):U(.5)]}}function Ae(e,t){let n=new Float32Array(e.length),r=t?t.length:e.length/3;for(let i=0;i<r;i+=3){let[r,a,o]=t?[t[i],t[i+1],t[i+2]]:[i,i+1,i+2],s=e,c=s[a*3]-s[r*3],l=s[a*3+1]-s[r*3+1],u=s[a*3+2]-s[r*3+2],d=s[o*3]-s[r*3],f=s[o*3+1]-s[r*3+1],p=s[o*3+2]-s[r*3+2],m=l*p-u*f,h=u*d-c*p,g=c*f-l*d;for(let e of[r,a,o])n[e*3]+=m,n[e*3+1]+=h,n[e*3+2]+=g}for(let e=0;e<n.length;e+=3){let t=Math.hypot(n[e],n[e+1],n[e+2])||1;n[e]/=t,n[e+1]/=t,n[e+2]/=t}return n}function K(e){let t=[1/0,1/0,1/0],n=[-1/0,-1/0,-1/0];for(let r of e){let e=r.positions;for(let r=0;r<e.length;r+=3)for(let i=0;i<3;i++)e[r+i]<t[i]&&(t[i]=e[r+i]),e[r+i]>n[i]&&(n[i]=e[r+i])}if(!isFinite(t[0]))return;let r=[0,1,2].map(e=>(t[e]+n[e])/2),i=1/(Math.max(n[0]-t[0],n[1]-t[1],n[2]-t[2])||1);for(let t of e){let e=t.positions;for(let t=0;t<e.length;t+=3)for(let n=0;n<3;n++)e[t+n]=(e[t+n]-r[n])*i}}function je(e){let t=e.indices?e.indices.length:e.positions.length/3,n=t=>e.indices?e.indices[t]:t,r=(e,r)=>{let i=new Float32Array(t*r);for(let a=0;a<t;a++){let t=n(a);for(let n=0;n<r;n++)i[a*r+n]=e[t*r+n]}return i},i=new Float32Array(t*3);for(let e=0;e<t;e++)i[e*3+e%3]=1;return{positions:r(e.positions,3),normals:r(e.normals,3),uvs:e.uvs&&r(e.uvs,2),colors:e.colors&&r(e.colors,4),bary:i,count:t}}var q,Me,J,Ne=n((()=>{q=()=>({base:[1,1,1,1],metallic:1,roughness:1,emissive:[0,0,0],baseTex:-1,mrTex:-1,normalTex:-1,emissiveTex:-1,occlusionTex:-1,alphaMode:0,alphaCutoff:.5}),Me=()=>({...q(),metallic:1,roughness:.12}),J=Math.PI*2}));function Pe(e,t,n,r){let i=1/Math.tan(e/2),a=1/(n-r),o=/* @__PURE__ */ new Float32Array(16);return o[0]=i/t,o[5]=i,o[10]=(r+n)*a,o[11]=-1,o[14]=2*r*n*a,o}function Fe(e,t){let n=/* @__PURE__ */ new Float32Array(16);for(let r=0;r<4;r++)for(let i=0;i<4;i++){let a=0;for(let n=0;n<4;n++)a+=e[n*4+i]*t[r*4+n];n[r*4+i]=a}return n}function Ie(e,t,n){let[r,i,a,o]=e,s=r+r,c=i+i,l=a+a,u=r*s,d=r*c,f=r*l,p=i*c,m=i*l,h=a*l,g=o*s,_=o*c,v=o*l;return new Float32Array([(1-(p+h))*n[0],(d+v)*n[0],(f-_)*n[0],0,(d-v)*n[1],(1-(u+h))*n[1],(m+g)*n[1],0,(f+_)*n[2],(m-g)*n[2],(1-(u+p))*n[2],0,t[0],t[1],t[2],1])}function Le(e){let[t,n,r,,i,a,o,,s,c,l]=e,u=a*l-o*c,d=-(i*l-o*s),f=i*c-a*s,p=1/(t*u+n*d+r*f||1);return new Float32Array([u*p,d*p,f*p,-(n*l-r*c)*p,(t*l-r*s)*p,-(t*c-n*s)*p,(n*o-r*a)*p,-(t*o-r*i)*p,(t*a-n*i)*p])}function Y(e,t){let[n,r,i,a]=e,[o,s,c,l]=t;return[a*o+n*l+r*c-i*s,a*s-n*c+r*l+i*o,a*c+n*s-r*o+i*l,a*l-n*o-r*s-i*c]}function Re(e){let t=Math.hypot(e[0],e[1],e[2],e[3])||1;return[e[0]/t,e[1]/t,e[2]/t,e[3]/t]}function ze(e,t){let n=Math.sin(t/2);return[e[0]*n,e[1]*n,e[2]*n,Math.cos(t/2)]}function X(e,t,n){return Y(ze([0,0,1],n),Y(ze([0,1,0],t),ze([1,0,0],e)))}function Be(e,t,n){let r=Math.hypot(t[0],t[1],t[2]);return r<1e-6?e:Re(Y(ze([t[0]/r,t[1]/r,t[2]/r],r*n),e))}var Ve,He=n((()=>{Ve=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}));function Z(e,t,n,r){let i=e.accessors?.[n];if(!i)throw Error(`invalid glTF: accessor ${n} is missing`);let a=qe[i.type]??1,o=new r(i.count*a),s=Je[i.componentType];if(i.bufferView===void 0||!s)return o;let[c,l,u]=s,d=e.bufferViews?.[i.bufferView],f=d&&t[d.buffer];if(!f)throw Error(`invalid glTF: no data for accessor ${n}`);let p=new DataView(f),m=d.byteStride||a*c,h=(d.byteOffset??0)+(i.byteOffset??0),g=i.normalized&&o instanceof Float32Array?u:1;for(let e=0;e<i.count;e++){let t=h+e*m;for(let n=0;n<a;n++){let r=l(p,t+n*c);o[e*a+n]=g===1?r:Math.max(r/g,-1)}}return o}function Ue(e,t){let n=q(),r=t===void 0?null:e.materials?.[t];if(!r)return n;let i=r.pbrMetallicRoughness??{},a=t=>{let n=t&&e.textures?.[t.index],r=n?.source??n?.extensions?.EXT_texture_webp?.source;return typeof r==`number`?r:-1};if(i.baseColorFactor){let[e,t,r,a]=i.baseColorFactor;n.base=[e,t,r,a]}n.metallic=i.metallicFactor??1,n.roughness=i.roughnessFactor??1;let o=r.extensions?.KHR_materials_emissive_strength?.emissiveStrength??1,[s,c,l]=r.emissiveFactor??[0,0,0];return n.emissive=[s*o,c*o,l*o],n.baseTex=a(i.baseColorTexture),n.mrTex=a(i.metallicRoughnessTexture),n.normalTex=a(r.normalTexture),n.emissiveTex=a(r.emissiveTexture),n.occlusionTex=a(r.occlusionTexture),n.emissiveTex>=0&&n.emissive.every(e=>e===0)&&(n.emissive=[o,o,o]),n.alphaMode=r.alphaMode===`MASK`?1:r.alphaMode===`BLEND`?2:0,n.alphaCutoff=r.alphaCutoff??.5,r.extensions?.KHR_materials_unlit&&(n.metallic=0,n.roughness=1),n}function We(e,t,n,r){if((n.mode??4)!==4||n.attributes?.POSITION===void 0)return null;let i=n.attributes,a=Z(e,t,i.POSITION,Float32Array),o=n.indices===void 0?null:Z(e,t,n.indices,Uint32Array),s=i.NORMAL===void 0?null:Z(e,t,i.NORMAL,Float32Array),c=i.TEXCOORD_0===void 0?null:Z(e,t,i.TEXCOORD_0,Float32Array),l=null;if(i.COLOR_0!==void 0){let n=Z(e,t,i.COLOR_0,Float32Array),r=qe[e.accessors[i.COLOR_0].type];l=new Float32Array(n.length/r*4).fill(1);for(let e=0;e<n.length/r;e++)for(let t=0;t<r;t++)l[e*4+t]=n[e*r+t]}let u=r;for(let e=0;e<a.length;e+=3){let[t,n,r]=[a[e],a[e+1],a[e+2]];a[e]=u[0]*t+u[4]*n+u[8]*r+u[12],a[e+1]=u[1]*t+u[5]*n+u[9]*r+u[13],a[e+2]=u[2]*t+u[6]*n+u[10]*r+u[14]}let d=Le(u);if(d[0]*(d[4]*d[8]-d[5]*d[7])-d[3]*(d[1]*d[8]-d[2]*d[7])+d[6]*(d[1]*d[5]-d[2]*d[4])<0){o??=Uint32Array.from({length:a.length/3},(e,t)=>t);for(let e=0;e+2<o.length;e+=3)[o[e+1],o[e+2]]=[o[e+2],o[e+1]]}if(s)for(let e=0;e<s.length;e+=3){let[t,n,r]=[s[e],s[e+1],s[e+2]],i=d[0]*t+d[3]*n+d[6]*r,a=d[1]*t+d[4]*n+d[7]*r,o=d[2]*t+d[5]*n+d[8]*r,c=Math.hypot(i,a,o)||1;s[e]=i/c,s[e+1]=a/c,s[e+2]=o/c}else{let t=je({positions:a,normals:a,uvs:c,colors:l,indices:o,material:q()});return{positions:t.positions,normals:Ae(t.positions,null),uvs:t.uvs,colors:t.colors,indices:null,material:Ue(e,n.material)}}return{positions:a,normals:s,uvs:c,colors:l,indices:o,material:Ue(e,n.material)}}function Ge(e){return e.matrix?Float32Array.from(e.matrix):Ie(e.rotation??[0,0,0,1],e.translation??[0,0,0],e.scale??[1,1,1])}function Ke(e){let t=e.gltf,n=(t.extensionsRequired??[]).filter(e=>!Ye.includes(e));if(n.length)throw Error(`unsupported glTF extension ${n.join(`, `)} (export without compression)`);let r=[],i=(n,a,o)=>{let s=t.nodes?.[n];if(!s||o>64)return;let c=Fe(a,Ge(s));for(let n of t.meshes?.[s.mesh]?.primitives??[]){let i=We(t,e.buffers,n,c);i&&r.push(i)}for(let e of s.children??[])i(e,c,o+1)},a=t.scenes?.[t.scene??0];if(a)for(let e of a.nodes??[])i(e,Ve(),0);else for(let n of t.meshes??[])for(let i of n.primitives??[]){let n=We(t,e.buffers,i,Ve());n&&r.push(n)}if(!r.length)throw Error(`no triangles in this glTF file`);return K(r),r}var qe,Je,Ye,Xe=n((()=>{Ne(),He(),qe={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},Je={5120:[1,(e,t)=>e.getInt8(t),127],5121:[1,(e,t)=>e.getUint8(t),255],5122:[2,(e,t)=>e.getInt16(t,!0),32767],5123:[2,(e,t)=>e.getUint16(t,!0),65535],5125:[4,(e,t)=>e.getUint32(t,!0),1],5126:[4,(e,t)=>e.getFloat32(t,!0),1]},Ye=[`KHR_materials_emissive_strength`,`KHR_texture_transform`,`KHR_materials_unlit`]})),Ze,Qe,$e,et,tt,nt,rt,it=n((()=>{Ze=`
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
`,Qe=`#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec4 aColor;
layout(location = 4) in vec3 aBary;

uniform mat4 uProj;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform vec4 uScreen;      // width, height, time, clock
uniform vec4 uRipples[4];  // x, y (0..1, y up), start, strength
uniform vec4 uFx;          // appear, morph, react, glitch

out vec3 vPos;
out vec3 vNormal;
out vec2 vUv;
out vec4 vColor;
out vec3 vBary;
out vec3 vObj;
${Ze}
// liquid surface: the mesh breathes along its normals
vec3 morph(vec3 p, vec3 n) {
  float t = uScreen.z;
  float k = noise3(p * 2.4 + vec3(0.0, t * 0.5, t * 0.3)) * 0.65 + noise3(p * 5.1 - t * 0.4) * 0.35;
  return p + n * (k - 0.45) * 0.3 * uFx.y;
}

void main() {
  vec3 p = aPos;
  vec3 n = aNormal;
  if (uFx.y > 0.0) {
    vec3 q = morph(p, n);
    // normal of the moved surface, from two neighbours
    vec3 t = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
    vec3 b = cross(n, t);
    vec3 n2 = cross(morph(p + t * 0.01, n) - q, morph(p + b * 0.01, n) - q);
    n = length(n2) > 0.0 ? normalize(n2) : n;
    p = q;
  }

  // shockwaves from the sky: a bulge rides the ring across the model
  vec4 clip = uProj * (uModel * vec4(p, 1.0));
  float aspect = uScreen.x / uScreen.y;
  vec2 sp = clip.xy / clip.w * 0.5 * vec2(aspect, 1.0);
  float push = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 rp = uRipples[i];
    float age = uScreen.w - rp.z;
    if (rp.w > 0.0 && age > 0.0 && age < 3.0) {
      float w = length(sp - (rp.xy - 0.5) * vec2(aspect, 1.0)) - age * 0.85;
      push += exp(-w * w * 90.0) * (1.0 - age / 3.0) * rp.w;
    }
  }
  p += n * push * 0.08 * uFx.z;

  // hologram: slices jump sideways now and then
  if (uFx.w > 0.0) {
    float slice = floor(p.y * 22.0);
    float tick = floor(uScreen.w * 14.0);
    float g = step(0.94 - uFx.w * 0.2, hash3(vec3(slice, tick, 1.0)));
    p.x += g * (hash3(vec3(slice, tick, 7.0)) - 0.5) * 0.12 * uFx.w;
  }

  vec4 view = uModel * vec4(p, 1.0);
  vPos = view.xyz;
  vNormal = uNormalMat * n;
  vUv = aUv;
  vColor = aColor;
  vBary = aBary;
  vObj = aPos;
  gl_Position = uProj * view;
}
`,$e=`#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNormal;
in vec2 vUv;
in vec4 vColor;
in vec3 vBary;
in vec3 vObj;
out vec4 outColor;

uniform vec4 uScreen;      // width, height, time, clock
uniform vec4 uRipples[4];
uniform vec4 uLights;      // sweep start, dark mix, roaming light, rim lights
uniform vec4 uMat;         // material, metallic, roughness, opacity
uniform vec4 uBase;        // base color (decoded), alpha
uniform vec4 uEmissive;    // emissive (decoded), alpha cutoff (< 0: none)
uniform vec4 uFx;          // appear, morph, react, glitch
uniform vec4 uTex;         // has base color, metal-rough, normal, emissive maps
uniform float uHasOcc;
uniform vec3 uLightPos;    // roaming light, view space
uniform vec3 uBg;
uniform vec3 uNeb0;
uniform vec3 uNeb1;
uniform vec3 uNeb2;
uniform vec3 uNeb3;
uniform vec3 uAur0;
uniform vec3 uAur1;
uniform vec3 uGlow;
uniform sampler2D uBackdrop;
uniform sampler2D uBaseTex;
uniform sampler2D uMrTex;
uniform sampler2D uNormalTex;
uniform sampler2D uEmissiveTex;
uniform sampler2D uOccTex;
${Ze}
float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p = p * 2.03 + vec3(3.1, 1.7, 4.3);
    a *= 0.5;
  }
  return v;
}

/** the sky behind the model, blurred by roughness (the frame is stored top row first) */
vec3 backdrop(vec2 uv, float lod) {
  uv = clamp(uv, 0.002, 0.998);
  vec3 c = textureLod(uBackdrop, vec2(uv.x, 1.0 - uv.y), lod).rgb;
  return c * c;
}

/** what a mirror sees: the sky around, plus soft studio lights tinted by the palette */
vec3 env(vec3 r, float rough) {
  float t = uScreen.z;
  vec2 uv = gl_FragCoord.xy / uScreen.xy + r.xy * 0.22;
  vec3 c = backdrop(uv, 1.0 + rough * 6.0) * mix(0.9, 1.5, uLights.y);
  float up = r.y * 0.5 + 0.5;
  c += mix(uNeb0, uNeb2, smoothstep(0.15, 0.95, up)) * 0.22;
  // a dark floor below the horizon gives metals their contrast
  c *= mix(0.25, 1.0, smoothstep(-0.55, 0.05, r.y));
  float soft = mix(1.0, 0.35, rough);
  float top = smoothstep(0.7, 0.7 + 0.12 / soft, r.y);
  float ang = atan(r.x, -r.z);
  float horizon = exp(-pow((r.y - 0.02) * 14.0 * soft, 2.0)) * (0.5 + 0.5 * sin(ang * 3.0 + t * 0.25));
  float left = smoothstep(-0.72, -0.86, r.x) * smoothstep(-0.1, 0.3, r.y);
  float right = smoothstep(0.72, 0.86, r.x) * smoothstep(0.5, 0.0, r.y);
  c += mix(uGlow, vec3(1.0), 0.5) * top * 1.7 * soft;
  c += mix(uAur0, uAur1, 0.5 + 0.5 * sin(ang * 2.0 - t * 0.2)) * horizon * 1.5;
  c += (uAur0 * left + uAur1 * right) * 1.4 * soft;
  return c;
}

vec3 brdf(vec3 N, vec3 V, vec3 L, vec3 albedo, float metal, float rough, vec3 f0) {
  float NoL = dot(N, L);
  if (NoL <= 0.0) return vec3(0.0);
  vec3 H = normalize(L + V);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float NoV = max(dot(N, V), 1e-3);
  float a = rough * rough;
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * d * d);
  float k = a * 0.5 + 0.0001;
  float G = 0.25 / ((NoV * (1.0 - k) + k) * (NoL * (1.0 - k) + k));
  vec3 F = f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
  return ((1.0 - F) * (1.0 - metal) * albedo / 3.14159 + F * min(D * G, 60.0)) * NoL;
}

/** the roaming light, two aurora rim lights behind, a soft key from above, and a rim glow */
vec3 lights(vec3 N, vec3 V, vec3 albedo, float metal, float rough, vec3 f0) {
  vec3 toL = uLightPos - vPos;
  float d2 = dot(toL, toL);
  vec3 c = brdf(N, V, toL * inversesqrt(d2), albedo, metal, rough, f0) * uGlow * uLights.z * 10.0 / (1.0 + d2 * 0.35);
  c += brdf(N, V, normalize(vec3(-0.8, 0.35, -0.5)), albedo, metal, rough, f0) * uAur0 * uLights.w * 2.2;
  c += brdf(N, V, normalize(vec3(0.85, 0.5, -0.35)), albedo, metal, rough, f0) * uAur1 * uLights.w * 2.2;
  c += brdf(N, V, normalize(vec3(0.2, 1.0, 0.45)), albedo, metal, rough, f0) * mix(uNeb2, vec3(1.0), 0.3) * 0.9;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  c += mix(uAur0, uAur1, N.x * 0.5 + 0.5) * rim * uLights.w * 0.8;
  return c;
}

/** normal maps without tangents: the frame comes from screen-space derivatives */
vec3 perturb(vec3 N, vec3 p, vec2 uv, vec3 m) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return normalize(mat3(T * inv, B * inv, N) * (m * 2.0 - 1.0));
}

void main() {
  float t = uScreen.z;
  float clock = uScreen.w;
  vec2 suv = gl_FragCoord.xy / uScreen.xy;
  float aspect = uScreen.x / uScreen.y;
  int mode = int(uMat.x + 0.5);

  // materialize: a noise front builds the model, with a burning edge
  float dn = noise3(vObj * 6.0) * 0.7 + noise3(vObj * 15.0) * 0.3;
  float ap = uFx.x * 1.3 - 0.15;
  if (dn > ap) discard;
  float edge = uFx.x < 1.0 ? 1.0 - smoothstep(0.0, 0.06, ap - dn) : 0.0;

  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vPos);

  vec4 base = uBase * vColor;
  if (uTex.x > 0.5) {
    vec4 tb = texture(uBaseTex, vUv);
    base *= vec4(tb.rgb * tb.rgb, tb.a);
  }
  if (uEmissive.w >= 0.0 && base.a < uEmissive.w) discard;
  if (uTex.z > 0.5) N = perturb(N, vPos, vUv, texture(uNormalTex, vUv).xyz);
  float NoV = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - NoV, 5.0);
  vec3 R = reflect(-V, N);

  vec3 col;
  float alpha = base.a;
  bool emissive = false;

  if (mode == 2) {
    // glass: the sky behind, bent per channel (dispersion), and reflections on top
    vec3 tr = refract(-V, N, 0.67);
    vec2 off = tr.xy * (0.05 + 0.12 * (1.0 - NoV));
    vec3 refr = vec3(
      backdrop(suv + off * 0.82, 0.6).r,
      backdrop(suv + off, 0.6).g,
      backdrop(suv + off * 1.18, 0.6).b);
    float F = 0.04 + 0.96 * fres;
    col = refr * base.rgb * mix(1.15, 1.6, uLights.y) * (1.0 - F) + env(R, 0.04) * F;
    col += lights(N, V, vec3(0.0), 0.0, 0.05, vec3(0.04));
    col += base.rgb * mix(uAur0, uAur1, N.y * 0.5 + 0.5) * pow(1.0 - NoV, 2.0) * 0.6;
    alpha = 1.0;
  } else if (mode == 3) {
    // hologram: fresnel shell, scanlines, a scanning band and some flicker
    vec3 hc = uBase.r < 0.0 ? mix(uAur0, uAur1, smoothstep(-0.5, 0.5, vObj.y)) : base.rgb;
    float rim = pow(1.0 - NoV, 3.0);
    float lines = smoothstep(0.35, 0.95, 0.5 + 0.5 * sin(gl_FragCoord.y * 0.85 - t * 10.0));
    float band = pow(0.5 + 0.5 * sin(suv.y * 7.0 - t * 2.2), 16.0);
    float flick = 0.82 + 0.18 * hash3(vec3(floor(clock * 24.0), 0.0, 3.0));
    col = hc * (0.03 + rim * 1.7 + lines * rim * 0.5 + lines * 0.05 + band * 0.45) * flick * (gl_FrontFacing ? 1.0 : 0.35);
    alpha = clamp(0.02 + rim * 0.3, 0.0, 0.5);
    emissive = true;
  } else if (mode == 5) {
    // neon wireframe: glowing edges, brighter corners, a faint fill
    float e = min(min(vBary.x, vBary.y), vBary.z);
    float fw = max(fwidth(e), 1e-4);
    float line = 1.0 - smoothstep(fw * 0.5, fw * 1.7, e);
    float corner = smoothstep(0.9, 1.0, max(max(vBary.x, vBary.y), vBary.z));
    float face = gl_FrontFacing ? 1.0 : 0.4;
    col = base.rgb * (line * 2.3 + corner * 2.2 + 0.04 + pow(1.0 - NoV, 3.0) * 0.3) * face;
    alpha = clamp(line * 0.85 + 0.07, 0.0, 1.0);
    emissive = true;
  } else if (mode == 6) {
    // nebula: the sky's own clouds, folded inside the model, under a glossy coat
    vec3 p = vObj * 2.3;
    vec3 q = vec3(fbm3(p + vec3(0.0, t * 0.07, 0.0)), fbm3(p + vec3(5.2, 1.3, -t * 0.05)), fbm3(p + vec3(1.7, 9.2, 4.1)));
    float n = fbm3(p + 2.6 * q);
    vec3 nc = mix(uNeb0, uNeb1, clamp(q.x * 1.7 - 0.2, 0.0, 1.0));
    nc = mix(nc, uNeb2, clamp(n * n * 2.0, 0.0, 1.0));
    nc = mix(nc, uNeb3, clamp(q.z * q.z * q.z * 2.2, 0.0, 1.0) * 0.6);
    float dens = smoothstep(0.28, 0.85, n);
    // the palette is dark on purpose (it is a background): lift it, inside the model it glows
    nc = mix(nc, sqrt(nc), 0.45);
    col = nc * base.rgb * (0.05 + dens * dens * 2.4);
    // stars: one point in a few cells of a 3D grid, where the surface passes close to it
    vec3 sp3 = vObj * 26.0;
    vec3 cell = floor(sp3);
    vec3 at = vec3(hash3(cell + 1.0), hash3(cell + 2.0), hash3(cell + 5.0)) * 0.6 + 0.2;
    float star = step(0.9, hash3(cell)) * smoothstep(0.16, 0.0, length(fract(sp3) - at));
    col += star * (0.6 + 0.4 * sin(t * 3.0 + hash3(cell + 3.0) * 30.0)) * 3.0 * (1.0 - dens);
    float F = 0.04 + 0.96 * fres;
    col = col * (1.0 - F) + env(R, 0.06) * F;
    col += lights(N, V, vec3(0.0), 0.0, 0.07, vec3(0.04));
    alpha = 1.0;
  } else {
    // physically based: the file's materials, chrome, or a thin-film coat
    float metal = uMat.y;
    float rough = uMat.z;
    if (uTex.y > 0.5) {
      vec4 mr = texture(uMrTex, vUv);
      rough *= mr.g;
      metal *= mr.b;
    }
    rough = clamp(rough, 0.03, 1.0);
    vec3 albedo = base.rgb;
    vec3 f0 = mix(vec3(0.04), albedo, metal);
    if (mode == 4) {
      float th = noise3(vObj * 3.0 + t * 0.08);
      vec3 film = 0.5 + 0.5 * cos(6.2832 * (NoV * 1.5 + th * 0.9 + vec3(0.0, 0.33, 0.67)));
      f0 = mix(f0, film * film, 0.92);
    }
    vec3 F = f0 + (max(vec3(1.0 - rough), f0) - f0) * fres;
    vec3 kd = (1.0 - F) * (1.0 - metal) * albedo;
    vec3 amb = mix(uNeb0, uNeb2, N.y * 0.5 + 0.5) * 0.7 + uBg * 0.4;
    float occ = uHasOcc > 0.5 ? texture(uOccTex, vUv).r : 1.0;
    col = (kd * amb + env(R, rough) * F) * occ;
    col += lights(N, V, albedo, metal, rough, f0);
    vec3 em = uEmissive.rgb;
    if (uTex.w > 0.5) {
      vec3 te = texture(uEmissiveTex, vUv).rgb;
      em *= te * te;
    }
    col += em;
  }

  // the sky's events light the model too: shockwave rings, light sweeps
  vec2 sp = (suv - 0.5) * vec2(aspect, 1.0);
  float ring = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 rp = uRipples[i];
    float age = clock - rp.z;
    if (rp.w > 0.0 && age > 0.0 && age < 3.0) {
      float w = length(sp - (rp.xy - 0.5) * vec2(aspect, 1.0)) - age * 0.85;
      ring += exp(-w * w * 380.0) * (1.0 - age / 3.0) * rp.w;
    }
  }
  float sweep = 0.0;
  float pa = clock - uLights.x;
  if (uLights.x > 0.0 && pa > 0.0 && pa < 1.6) {
    float x = suv.x + (suv.y - 0.5) * 0.35;
    sweep = exp(-pow((x - (pa * 1.1 - 0.2)) * 7.0, 2.0)) * (1.0 - pa / 1.6);
  }
  col += uGlow * (ring * 3.5 * (0.5 + uFx.z) + sweep * 2.0 + edge * 7.0);

  float o = uMat.w;
  if (emissive) {
    // premultiplied, with light beyond the coverage: adds up like light
    outColor = vec4(col * o, max(alpha, edge) * o);
  } else {
    outColor = vec4(col * alpha * o, alpha * o);
  }
}
`,et=`#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`,tt=`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb
    + texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb
    + texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb
    + texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  outColor = vec4(c * smoothstep(0.8, 2.2, l), 1.0);
}
`,nt=`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.227027;
  c += (texture(uTex, vUv + uDir * 1.3846).rgb + texture(uTex, vUv - uDir * 1.3846).rgb) * 0.316216;
  c += (texture(uTex, vUv + uDir * 3.2308).rgb + texture(uTex, vUv - uDir * 3.2308).rgb) * 0.070270;
  outColor = vec4(c, 1.0);
}
`,rt=`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uBloomWide;
uniform vec4 uPost;   // bloom, shafts, exposure
uniform vec2 uLight;  // roaming light, uv
void main() {
  vec4 s = texture(uScene, vUv);
  vec3 b = texture(uBloom, vUv).rgb + texture(uBloomWide, vUv).rgb * 1.6;
  vec3 shafts = vec3(0.0);
  if (uPost.y > 0.0) {
    vec2 dir = (vUv - uLight) * (0.6 / 32.0);
    vec2 p = vUv;
    float w = 1.0;
    for (int i = 0; i < 32; i++) {
      p -= dir;
      shafts += texture(uBloomWide, p).rgb * w;
      w *= 0.92;
    }
    shafts *= 0.065;
  }
  vec3 c = s.rgb + b * uPost.x + shafts * uPost.y;
  c = vec3(1.0) - exp(-c * uPost.z);
  outColor = vec4(sqrt(c), s.a);
}
`})),at=/* @__PURE__ */ r({ModelLayer:()=>pt});function ot(e,t,n){try{return e.getContext(t,n)}catch{return null}}var st,ct,lt,ut,dt,ft,Q,$,pt,mt=n((()=>{Ne(),Xe(),He(),it(),st=30*Math.PI/180,ct=Math.tan(st/2),lt=8,ut=5.4,dt=1.8,ft=.8,Q={auto:0,chrome:1,glass:2,hologram:3,iridescent:4,wire:5,nebula:6},$=e=>[e[0]*e[0],e[1]*e[1],e[2]*e[2]],pt=class{canvas;emit;gl=null;off=null;view=null;scene;bright;blur;composite;white=null;sky=null;empty=null;hdr=!1;parallel=null;linked=!1;targets=null;failed=!1;assets=/* @__PURE__ */ new Map;instances=[];leaving=[];seen=/* @__PURE__ */ new Map;w=1;h=1;dpr=1;last=NaN;drawn=!1;onChange;constructor(e,t){this.canvas=e,this.emit=t,this.init()||this.fail(`WebGL 2 is not available for the 3D layer`)}get active(){return!this.failed&&[...this.instances,...this.leaving].some(e=>e.appear>0||e.cfg.reveal>0)}fail(e){this.failed=!0,this.gl=null,this.emit({type:`modelError`,key:`*`,message:e})}init(){let e={alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1},t=null;if(typeof OffscreenCanvas<`u`){let n=new OffscreenCanvas(1,1);t=ot(n,`webgl2`,e);let r=t?ot(this.canvas,`bitmaprenderer`):null;t&&r?(this.off=n,this.view=r):t=null}if(t??=ot(this.canvas,`webgl2`,e),!t)return!1;let n=this.off??this.canvas;return n.addEventListener(`webglcontextlost`,e=>{e.preventDefault(),this.gl=null}),n.addEventListener(`webglcontextrestored`,()=>{this.gl=t,this.targets=null;for(let e of this.assets.values())if(!(typeof e!=`object`||e instanceof Error)){e.textures=null;for(let t of[...e.prims,...e.lowPoly??[]])t.geo=t.wire=null}this.setup()||this.fail(`the 3D layer could not restart`)}),this.gl=t,this.setup()}program(e,t){let n=this.gl,r=(e,t)=>{let r=n.createShader(e);return n.shaderSource(r,t),n.compileShader(r),r},i=n.createProgram(),a=[r(n.VERTEX_SHADER,e),r(n.FRAGMENT_SHADER,t)];for(let e of a)n.attachShader(i,e);n.linkProgram(i);let o=/* @__PURE__ */ new Map;return{p:i,shaders:a,u:e=>(o.has(e)||o.set(e,n.getUniformLocation(i,e)),o.get(e))}}compiled(){if(this.linked)return!0;let e=this.gl,t=[this.scene,this.bright,this.blur,this.composite],n=this.parallel;if(n&&!t.every(({p:t})=>e.getProgramParameter(t,n.COMPLETION_STATUS_KHR)))return!1;for(let{p:n,shaders:r}of t){if(e.getProgramParameter(n,e.LINK_STATUS)||e.isContextLost())continue;let t=r.map(t=>e.getShaderInfoLog(t)).join(`
`)||e.getProgramInfoLog(n);return console.warn(`[deep-sky]`,t),this.fail(`the 3D shaders did not compile`),!1}return e.useProgram(this.scene.p),[`uBackdrop`,`uBaseTex`,`uMrTex`,`uNormalTex`,`uEmissiveTex`,`uOccTex`].forEach((t,n)=>e.uniform1i(this.scene.u(t),n)),e.useProgram(this.composite.p),[`uScene`,`uBloom`,`uBloomWide`].forEach((t,n)=>e.uniform1i(this.composite.u(t),n)),this.linked=!0,!0}setup(){let e=this.gl;this.parallel=e.getExtension(`KHR_parallel_shader_compile`),this.linked=!1,this.scene=this.program(Qe,$e),this.bright=this.program(et,tt),this.blur=this.program(et,nt),this.composite=this.program(et,rt);let t=t=>{let n=e.createTexture();return e.bindTexture(e.TEXTURE_2D,n),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array(t)),n};return this.white=t([255,255,255,255]),this.sky=t([8,10,24,255]),this.empty=e.createVertexArray(),this.hdr=!!(e.getExtension(`EXT_color_buffer_float`)??e.getExtension(`EXT_color_buffer_half_float`)),!0}place(e){this.instances.forEach((t,n)=>{e[n]?.key===t.cfg.key&&(t.cfg=e[n])})}configure(e){let t=this.instances;this.instances=e.map((e,n)=>{let r=t[n];return r&&r.cfg.key===e.key?(r.cfg=e,t[n]=null,r):{cfg:e,q:[0,0,0,1],w:[0,0,0],yaw:0,pitch:0,pop:0,popV:0,appear:0,phase:Math.random()*10,hits:[]}});for(let e of t)e&&e.appear>0&&this.leaving.push({...e,cfg:{...e.cfg,reveal:0}});for(let{key:t}of e){if(!t.startsWith(`shape:`)||this.assets.has(t))continue;let e=ke(t.slice(6));K(e),this.assets.set(t,{prims:e.map(e=>({mesh:e,geo:null,wire:null})),images:[],textures:null,shape:t.slice(6),lowPoly:null})}this.warm()}mode(e,t){return e.cfg.material===Q.auto&&t.shape?Q.chrome:e.cfg.material}prims(e,t){if(t!==Q.wire||!e.shape)return e.prims;if(!e.lowPoly){let t=ke(e.shape,!0);K(t),e.lowPoly=t.map(e=>({mesh:e,geo:null,wire:null}))}return e.lowPoly}warm(){if(this.gl){this.parallel||this.compiled();for(let e of this.instances){let t=this.ready(e.cfg.key);if(!t)continue;this.textures(t);let n=this.mode(e,t);for(let e of this.prims(t,n))n===Q.wire?e.wire??=this.upload(je(e.mesh)):e.geo??=this.upload(e.mesh)}}}load(e,t){if(this.assets.has(e))return;this.assets.set(e,`loading`);let n;try{n=Ke(t)}catch(t){let n=t instanceof Error?t:Error(String(t));this.assets.set(e,n),this.emit({type:`modelError`,key:e,message:n.message});return}Promise.all(t.images.map(e=>e&&typeof createImageBitmap==`function`?createImageBitmap(new Blob([e.data],{type:e.type}),{premultiplyAlpha:`none`,colorSpaceConversion:`none`}).catch(()=>null):null)).then(t=>{this.assets.set(e,{prims:n.map(e=>({mesh:e,geo:null,wire:null})),images:t,textures:null,shape:null,lowPoly:null}),this.warm(),this.onChange?.()})}resize(e,t,n){this.w=Math.max(1,e),this.h=Math.max(1,t),this.dpr=n}backdrop(e){let t=this.gl;t&&this.active&&(t.bindTexture(t.TEXTURE_2D,this.sky),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,e),t.generateMipmap(t.TEXTURE_2D),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR_MIPMAP_LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE))}destroy(){this.gl?.getExtension(`WEBGL_lose_context`)?.loseContext(),this.gl=null,this.failed=!0}upload(e){let t=this.gl,n=t.createVertexArray();t.bindVertexArray(n);let r=(e,n,r)=>{n&&(t.bindBuffer(t.ARRAY_BUFFER,t.createBuffer()),t.bufferData(t.ARRAY_BUFFER,n,t.STATIC_DRAW),t.enableVertexAttribArray(e),t.vertexAttribPointer(e,r,t.FLOAT,!1,0,0))};return r(0,e.positions,3),r(1,e.normals,3),r(2,e.uvs,2),r(3,e.colors,4),r(4,e.bary,3),e.indices&&(t.bindBuffer(t.ELEMENT_ARRAY_BUFFER,t.createBuffer()),t.bufferData(t.ELEMENT_ARRAY_BUFFER,e.indices,t.STATIC_DRAW)),t.bindVertexArray(null),{vao:n,count:e.indices?e.indices.length:e.positions.length/3,indexed:!!e.indices}}textures(e){if(e.textures)return e.textures;let t=this.gl,n=t.getExtension(`EXT_texture_filter_anisotropic`);return e.textures=e.images.map(e=>{if(!e)return null;let r=t.createTexture();return t.bindTexture(t.TEXTURE_2D,r),t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,e),t.generateMipmap(t.TEXTURE_2D),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR_MIPMAP_LINEAR),n&&t.texParameterf(t.TEXTURE_2D,n.TEXTURE_MAX_ANISOTROPY_EXT,8),r}),e.textures}renderTargets(e,t){let n=this.gl,r=this.targets;if(r&&r.w===e&&r.h===t)return r;if(r){n.deleteFramebuffer(r.msaa);for(let e of r.buffers)n.deleteRenderbuffer(e);for(let e of[r.scene,...r.bloom,...r.wide])n.deleteTexture(e.tex),n.deleteFramebuffer(e.fb);this.targets=null}let i=r=>{let i=r?n.RGBA16F:n.RGBA8,a=Math.min(4,n.getParameter(n.MAX_SAMPLES)),o=n.createFramebuffer();n.bindFramebuffer(n.FRAMEBUFFER,o);let s=n.createRenderbuffer();n.bindRenderbuffer(n.RENDERBUFFER,s),n.renderbufferStorageMultisample(n.RENDERBUFFER,a,i,e,t),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.RENDERBUFFER,s);let c=n.createRenderbuffer();n.bindRenderbuffer(n.RENDERBUFFER,c),n.renderbufferStorageMultisample(n.RENDERBUFFER,a,n.DEPTH_COMPONENT24,e,t),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.DEPTH_ATTACHMENT,n.RENDERBUFFER,c);let l=n.checkFramebufferStatus(n.FRAMEBUFFER)===n.FRAMEBUFFER_COMPLETE,u=(e,t)=>{let a=n.createTexture();n.bindTexture(n.TEXTURE_2D,a),n.texImage2D(n.TEXTURE_2D,0,i,e,t,0,n.RGBA,r?n.HALF_FLOAT:n.UNSIGNED_BYTE,null),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE);let o=n.createFramebuffer();return n.bindFramebuffer(n.FRAMEBUFFER,o),n.framebufferTexture2D(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,a,0),l&&=n.checkFramebufferStatus(n.FRAMEBUFFER)===n.FRAMEBUFFER_COMPLETE,{tex:a,fb:o,w:e,h:t}},d=n=>[Math.max(1,Math.round(e/n)),Math.max(1,Math.round(t/n))],f={w:e,h:t,msaa:o,buffers:[s,c],scene:u(e,t),bloom:[u(...d(4)),u(...d(4))],wide:[u(...d(8)),u(...d(8))]};return n.bindFramebuffer(n.FRAMEBUFFER,null),l?f:null};return this.targets=this.hdr&&i(!0)||i(!1),!this.targets&&this.hdr&&(this.hdr=!1),this.targets}ready(e){let t=this.assets.get(e);return t&&typeof t==`object`&&!(t instanceof Error)?t:null}shockwaves(e,t){let n=e.ripples;for(let r=0;r<4;r++){let[i,a,o,s]=[n[r*4],n[r*4+1],n[r*4+2],n[r*4+3]];if(!(s<=0||this.seen.has(o))){this.seen.set(o,e.clock);for(let e of this.instances){let n=(e.cfg.x-i)*t,r=1-e.cfg.y-a,c=Math.hypot(n,r)||.001,l=e.cfg.react*s*Math.max(.15,1-c*.9);e.hits.push({at:o+c/.85,axis:[-r/c,n/c,0],force:l})}}}for(let[t,n]of this.seen)e.clock-n>5&&this.seen.delete(t)}step(e,t,n){let r=e.cfg;for(let n=e.hits.length-1;n>=0;n--){let r=e.hits[n];if(!(t.clock<r.at)){e.hits.splice(n,1);for(let t=0;t<3;t++)e.w[t]+=r.axis[t]*r.force*3.4;e.popV+=r.force*2.2}}e.q=Be(e.q,[e.w[0],e.w[1]+r.spin,e.w[2]],n);let i=Math.exp(-n*1.3);for(let t=0;t<3;t++)e.w[t]*=i;e.popV+=(-e.pop*70-e.popV*6)*n,e.pop+=e.popV*n;let a=1-Math.exp(-n*3);e.yaw+=((t.light[0]-r.x)*r.follow*1.2-e.yaw)*a,e.pitch+=((1-r.y-t.light[1])*r.follow*.9-e.pitch)*a}render(e){let t=this.gl;if(!t||this.failed)return;let n=Math.max(1,Math.round(this.w*this.dpr)),r=Math.max(1,Math.round(this.h*this.dpr)),i=this.off??this.canvas;if((i.width!==n||i.height!==r)&&(i.width=n,i.height=r,this.off&&(this.canvas.width=n,this.canvas.height=r)),!this.compiled())return;let a=this.w/this.h,o=Number.isNaN(this.last)?0:Math.min(.1,Math.max(0,e.clock-this.last));this.last=e.clock,this.shockwaves(e,a);for(let t of[...this.instances,...this.leaving]){if(!this.ready(t.cfg.key))continue;e.animated&&this.step(t,e,o);let n=t.cfg.reveal,r=Math.min(o,1/30);t.appear=e.animated?t.appear<n?Math.min(n,t.appear+r/dt):Math.max(n,t.appear-r/ft):n}this.leaving=this.leaving.filter(e=>e.appear>0);let s=[...this.instances,...this.leaving].filter(e=>e.appear>.001&&e.cfg.size>0&&this.ready(e.cfg.key));if(!s.length){this.drawn&&=(t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,n,r),t.clearColor(0,0,0,0),t.clear(t.COLOR_BUFFER_BIT),this.present(),!1);return}let c=this.renderTargets(n,r);if(!c){this.fail(`the 3D layer has no usable render target`);return}let l=this.scene,u=e.palette;t.bindFramebuffer(t.FRAMEBUFFER,c.msaa),t.viewport(0,0,n,r),t.clearColor(0,0,0,0),t.clear(t.COLOR_BUFFER_BIT|t.DEPTH_BUFFER_BIT),t.enable(t.DEPTH_TEST),t.depthFunc(t.LEQUAL),t.enable(t.BLEND),t.blendFunc(t.ONE,t.ONE_MINUS_SRC_ALPHA),t.useProgram(l.p),t.uniformMatrix4fv(l.u(`uProj`),!1,Pe(st,a,.1,50)),t.uniform4f(l.u(`uScreen`),n,r,e.time,e.clock),t.uniform4fv(l.u(`uRipples`),e.ripples),t.uniform4f(l.u(`uLights`),e.sweepAt,e.dark,e.glow,1);let d=ct*ut;t.uniform3f(l.u(`uLightPos`),(e.light[0]*2-1)*d*a,(e.light[1]*2-1)*d,-5.4),t.uniform3fv(l.u(`uBg`),$(u.background)),u.nebula.forEach((e,n)=>t.uniform3fv(l.u(`uNeb${n}`),$(e))),t.uniform3fv(l.u(`uAur0`),$(u.aurora[0])),t.uniform3fv(l.u(`uAur1`),$(u.aurora[1])),t.uniform3fv(l.u(`uGlow`),$(u.glow)),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,this.sky);let f=ct*lt,p=0,m=0,h=[];for(let t of s){let n=this.ready(t.cfg.key),r=t.cfg,i=t.appear,o=r.size*2*f*(1+t.pop*.12),s=e.animated?Math.sin(e.time*.9+t.phase)*.035*r.float*o:0,c=e.animated?Math.sin(e.time*.6+t.phase)*.07*r.float:0,l=Ie(Y(X(t.pitch,t.yaw,c),Y(t.q,X(r.rotation[0],r.rotation[1],r.rotation[2]))),[(r.x*2-1)*f*a,(1-2*r.y)*f+s,-8],[o,o,o]);p=Math.max(p,r.glow),m=Math.max(m,r.rays);let u=this.mode(t,n),d=this.textures(n);for(let a of this.prims(n,u)){let n=()=>this.drawPrim(a,t,u,l,i,d,e),o=a.mesh.material;u===Q.hologram||u===Q.wire||r.opacity<1||u===Q.auto&&o.alphaMode===2?h.push(n):n()}}t.depthMask(!1);for(let e of h)e();t.depthMask(!0),t.bindVertexArray(null),t.disable(t.DEPTH_TEST),t.disable(t.BLEND),t.bindFramebuffer(t.READ_FRAMEBUFFER,c.msaa),t.bindFramebuffer(t.DRAW_FRAMEBUFFER,c.scene.fb),t.blitFramebuffer(0,0,n,r,0,0,n,r,t.COLOR_BUFFER_BIT,t.NEAREST);let g=(e,i,a,o)=>{t.bindFramebuffer(t.FRAMEBUFFER,a?a.fb:null),t.viewport(0,0,a?a.w:n,a?a.h:r),t.useProgram(e.p),t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,i.tex),o(),t.bindVertexArray(this.empty),t.drawArrays(t.TRIANGLES,0,3)},[_,v]=c.bloom,[y,b]=c.wide;g(this.bright,c.scene,_,()=>t.uniform2f(this.bright.u(`uTexel`),1/n,1/r));let x=(e,n,r,i)=>g(this.blur,e,n,()=>t.uniform2f(this.blur.u(`uDir`),r/e.w,i/e.h));x(_,v,1,0),x(v,_,0,1),x(_,b,2,0),x(b,y,0,1),x(y,b,1.5,0),x(b,y,0,1.5);let S=.35+.65*e.dark;g(this.composite,c.scene,null,()=>{let n=this.composite.u;t.activeTexture(t.TEXTURE1),t.bindTexture(t.TEXTURE_2D,_.tex),t.activeTexture(t.TEXTURE2),t.bindTexture(t.TEXTURE_2D,y.tex),t.uniform4f(n(`uPost`),p*S,m*S,1,0),t.uniform2f(n(`uLight`),e.light[0],e.light[1])}),this.present(),this.drawn=!0}drawPrim(e,t,n,r,i,a,o){let s=this.gl,c=this.scene,l=t.cfg,u=e.mesh.material,d=[...u.base],f=u.metallic,p=u.roughness,m=[0,0,0,-1],h=l.color&&$(l.color),g=[!1,!1,!0,!1];switch(n){case Q.auto:h&&(d=[d[0]*h[0],d[1]*h[1],d[2]*h[2],d[3]]),m=[...u.emissive,u.alphaMode===1?u.alphaCutoff:-1],g=[!0,!0,!0,!0];break;case Q.chrome:d=[...h??[.92,.93,.96],1],f=1,p=.06;break;case Q.iridescent:d=[...h??[.7,.7,.75],1],f=1,p=.16;break;case Q.hologram:d=h?[...h,1]:[-1,-1,-1,1],g=[!1,!1,!1,!1];break;case Q.wire:d=[...h??$(o.palette.grid),1],g=[!1,!1,!1,!1];break;default:d=[...h??[1,1,1],1],g=[!1,!1,n!==Q.glass,!1]}let _=(e,t,n)=>{let r=n&&t>=0?a[t]:null;return s.activeTexture(s.TEXTURE0+e),s.bindTexture(s.TEXTURE_2D,r??this.white),+!!r},v=[_(1,u.baseTex,g[0]),_(2,u.mrTex,g[1]),_(3,u.normalTex,g[2]),_(4,u.emissiveTex,g[3])],y=_(5,u.occlusionTex,n===Q.auto);s.uniformMatrix4fv(c.u(`uModel`),!1,r),s.uniformMatrix3fv(c.u(`uNormalMat`),!1,Le(r)),s.uniform4f(c.u(`uMat`),n,f,p,l.opacity),s.uniform4fv(c.u(`uBase`),d),s.uniform4fv(c.u(`uEmissive`),m),s.uniform4f(c.u(`uFx`),i,l.morph,l.react,n===Q.hologram?.5:0),s.uniform4fv(c.u(`uTex`),v),s.uniform1f(c.u(`uHasOcc`),y);let b;n===Q.wire?(e.wire??=this.upload(je(e.mesh)),b=e.wire):(e.geo??=this.upload(e.mesh),b=e.geo,s.vertexAttrib3f(4,1,1,1)),s.bindVertexArray(b.vao),e.mesh.uvs||s.vertexAttrib2f(2,0,0),e.mesh.colors||s.vertexAttrib4f(3,1,1,1,1),b.indexed?s.drawElements(s.TRIANGLES,b.count,s.UNSIGNED_INT,0):s.drawArrays(s.TRIANGLES,0,b.count)}present(){this.off&&this.view&&this.view.transferFromImageBitmap(this.off.transferToImageBitmap())}}}));let ht={position:`absolute`,inset:`0`,width:`100%`,height:`100%`,display:`block`};function gt(e,t={}){return _t(e,t,{})}function _t(e,t,n){if(typeof window>`u`)throw Error(`[deep-sky] createDeepSky() needs a browser: call it after mount.`);let r=e.ownerDocument,a=r.defaultView??window,o=e===r.body||e===r.documentElement,s=n.scope===void 0?e:n.scope,c=t,u=re(c),d=[],f=(e,t,n)=>{let r=e.style.getPropertyValue(t),i=e.style.getPropertyPriority(t);e.style.setProperty(t,n),d.push(()=>e.style.setProperty(t,r,i))};if(n.adjust!==!1){let t=a.getComputedStyle(e);!o&&t.position===`static`&&f(e,`position`,`relative`),t.isolation!==`isolate`&&f(e,`isolation`,`isolate`)}let p=(e,t)=>{let n=r.createElement(e);for(let[e,r]of Object.entries(t))n.style.setProperty(e,r);return n},m=()=>p(`canvas`,{...ht,opacity:`0`,transition:u.intro?`opacity 1.2s ease-out`:`none`}),h=p(`div`,{inset:`0`,overflow:`hidden`,"pointer-events":`none`,"user-select":`none`,contain:`strict`,transition:`background-color 0.6s ease`});h.setAttribute(`aria-hidden`,`true`),h.setAttribute(`data-deep-sky`,``);let g=m(),_=p(`canvas`,ht);h.append(g,_),(n.layerParent??(e===r.documentElement?r.body:e)).prepend(h);let v=a.matchMedia(`(prefers-color-scheme: dark)`),y=a.matchMedia(`(prefers-reduced-motion: reduce)`),b=!1,x=!1,S=`pending`,C=null,w=null,T=null,E={left:0,top:0,width:0,height:0},te=!0,ne=r.visibilityState!==`hidden`,D=!1,O=null,k=null,A,ce=new Promise(e=>A=e),j=()=>u.theme===`auto`?v.matches:u.theme===`dark`,M=()=>!b&&(u.animate===`auto`?!y.matches:u.animate!==!1),le=()=>!u.pauseWhenHidden||te&&ne,N=e=>C?.send(e),de=()=>({config:_e(),dark:j(),animated:M(),stats:!!c.onStats}),P=e=>{if(!x){if(e.type===`ready`)g.style.opacity=`1`,A();else if(e.type===`glFailed`)S===`worker`?we(`WebGL is not available in workers`):Te(`WebGL is not available`);else if(e.type===`stats`){let{type:t,...n}=e;c.onStats?.({...n,mode:S})}else e.type===`modelError`&&H(e.key,e.message)}},me=()=>{T&&N({type:`resize`,...T}),N({type:`visible`,on:le()}),L=``,xe()},he=()=>u.models.some(e=>e.anchor),F=()=>(Ee(),u.models.flatMap(e=>{let t=typeof e.anchor==`string`?r.querySelector(e.anchor):e.anchor;return t&&E.width&&E.height?ae(t.getBoundingClientRect(),E,e):[NaN,NaN,NaN]})),_e=()=>{let e=oe(u);if(!he())return e;let t=F();return e.models.forEach((e,n)=>{Number.isFinite(t[n*3])&&([e.x,e.y,e.size]=t.slice(n*3,n*3+3))}),e},I=0,L=``,ve=()=>{if(I=0,x||!he())return;I=a.requestAnimationFrame(ve);let e=F(),t=e.map(e=>e.toFixed(4)).join();t!==L&&(L=t,N({type:`modelPlaces`,places:e}))},R=()=>{!I&&he()&&(I=a.requestAnimationFrame(ve))},z=null,B=null,ye=Promise.resolve(!1),V=/* @__PURE__ */ new Set,H=(e,t)=>{let n=e===`*`?`*`:u.models.find(t=>ee(t.src)===e)?.src??e;console.warn(`[deep-sky] ${n===`*`?`3D layer`:`model ${String(n)}`}: ${t}`),c.onModelError?.(n,t)},xe=async()=>{let e=C;if(!u.models.length||!e||S===`css`)return;if(B!==e){B=e,V.clear();let t=p(`canvas`,ht);z?z.replaceWith(t):h.append(t),z=t,ye=e.attachModels(t).then(()=>!0,e=>(H(`*`,e instanceof Error?e.message:String(e)),!1))}if(!await ye||C!==e||x)return;let t=r.baseURI;for(let n of u.models){let r=ee(n.src);r.startsWith(`shape:`)||V.has(r)||(V.add(r),Promise.resolve().then(()=>(ue(),se)).then(({loadAsset:e})=>e(n.src,t)).then(({asset:t,transfer:n})=>{C===e&&e.send({type:`modelData`,key:r,asset:t},n)}).catch(e=>H(r,e instanceof Error?e.message:String(e))))}},Se=e=>typeof Worker>`u`||typeof OffscreenCanvas>`u`||!(`transferControlToOffscreen`in g)?Promise.resolve(null):new Promise(t=>{let n;try{e===!0?(w=URL.createObjectURL(new Blob([i],{type:`text/javascript`})),n=new Worker(w,{name:`deep-sky`})):n=new Worker(e,{name:`deep-sky`})}catch{t(null);return}let r=e=>{clearTimeout(s),n.removeEventListener(`message`,a),n.removeEventListener(`error`,o),e||n.terminate(),t(e?n:null)},a=e=>{e.data?.type===`boot`&&r(!0)},o=e=>{e.preventDefault(),r(!1)},s=setTimeout(()=>r(!1),5e3);n.addEventListener(`message`,a),n.addEventListener(`error`,o)}),U=async()=>{let e=u.worker===!1?null:await Se(u.worker);if(w&&=(URL.revokeObjectURL(w),null),x){e?.terminate();return}if(!e){u.worker!==!1&&c.onFallback?.(`main-thread`,`Web Workers or OffscreenCanvas are not available`),await Ce();return}let t=g.transferControlToOffscreen(),n=_.transferControlToOffscreen();e.addEventListener(`message`,e=>P(e.data)),e.addEventListener(`error`,()=>we(`the worker crashed`)),C={send:(t,n=[])=>e.postMessage(t,n),attachModels:async t=>{let{modelsWorker:n}=await Promise.resolve().then(()=>(pe(),fe)),r=t.transferControlToOffscreen(),i={type:`modelsInit`,canvas:r,code:n};e.postMessage(i,[r])},destroy:()=>e.terminate()},S=`worker`;let r={type:`init`,gl:t,fx:n,...de()};e.postMessage(r,[t,n]),me()},Ce=async()=>{let{Engine:e}=await Promise.resolve().then(()=>(be(),ge));if(x)return;S=`main-thread`;let t=new e(g,_,P,de());C={send:e=>t.handle(e),attachModels:async e=>{let{ModelLayer:n}=await Promise.resolve().then(()=>(mt(),at));t.attachModels(new n(e,P))},destroy:()=>t.destroy()},me()},we=e=>{if(x||S!==`worker`)return;C?.destroy(),C=null,S=`pending`;let t=m(),n=p(`canvas`,ht);g.replaceWith(t),_.replaceWith(n),g=t,_=n,c.onFallback?.(`main-thread`,e),Ce()},Te=e=>{S!==`css`&&(S=`css`,g.style.display=`none`,O=p(`div`,{position:`absolute`,inset:`-20%`,filter:`blur(40px)`}),h.prepend(O),typeof O.animate==`function`&&(k=O.animate([{transform:`none`},{transform:`translate(6%, 4%) rotate(8deg)`}],{duration:24e3,iterations:1/0,direction:`alternate`,easing:`ease-in-out`})),W(),A(),c.onFallback?.(`css`,e))},W=()=>{let e=j()?u.palette.dark:u.palette.light;if(h.style.position=u.fixed??o?`fixed`:`absolute`,h.style.zIndex=String(u.zIndex),h.style.backgroundColor=e.background,O){let[t,n,r]=e.nebula;O.style.background=`radial-gradient(40% 40% at 20% 15%, ${l(t,.35)}, transparent 70%), radial-gradient(35% 35% at 85% 45%, ${l(n,.3)}, transparent 70%), radial-gradient(35% 35% at 45% 95%, ${l(r,.22)}, transparent 70%)`,M()?k?.play():k?.pause()}},Ee=()=>{let e=h.getBoundingClientRect();E={left:e.left,top:e.top,width:e.width,height:e.height}},De=()=>{Ee();let e=Math.min(u.quality.maxDpr,a.devicePixelRatio||1);T&&T.w===E.width&&T.h===E.height&&T.dpr===e||(T={w:E.width,h:E.height,dpr:e},N({type:`resize`,...T}))},Oe=new ResizeObserver(De);Oe.observe(h);let G=null,ke=()=>{De(),Ae()},Ae=()=>{G?.removeEventListener(`change`,ke),G=a.matchMedia(`(resolution: ${a.devicePixelRatio||1}dppx)`),G.addEventListener(`change`,ke)};Ae();let K=0,je=()=>{K||=a.requestAnimationFrame(()=>{K=0,Ee()})},q=(e,t)=>e>=0&&t>=0&&e<=E.width&&t<=E.height,Me=e=>{if(!u.cursor.enabled)return;let t=e.clientX-E.left,n=e.clientY-E.top,r=q(t,n);r?N({type:`pointer`,x:t,y:n,inside:!0}):D&&N({type:`pointer`,x:0,y:0,inside:!1}),D=r},J=()=>{D&&(D=!1,N({type:`pointer`,x:0,y:0,inside:!1}))},Ne=e=>{e.pointerType===`touch`&&J()},Pe=e=>{try{return!!u.clickIgnore&&!!e.closest(u.clickIgnore)}catch{return!1}},Fe=e=>{if(u.click===`none`||!e.isPrimary||e.button>0)return;let t=e.clientX-E.left,n=e.clientY-E.top;if(!q(t,n))return;let r=e.target;r?.closest&&(Pe(r)||!o&&s&&!s.contains(r))||N({type:`click`,x:t,y:n})},Ie=()=>{N({type:`visible`,on:le()})},Le=typeof IntersectionObserver>`u`?null:new IntersectionObserver(e=>{te=e[e.length-1].isIntersecting,Ie()});Le?.observe(h);let Y=()=>{ne=r.visibilityState!==`hidden`,Ie()},Re=()=>{u.theme===`auto`&&(N({type:`theme`,dark:j()}),W())},ze=()=>{u.animate===`auto`&&(N({type:`animated`,on:M()}),W())},X=null,Be=()=>{if(!u.yieldToPage){X?.disconnect(),X=null;return}if(X||typeof PerformanceObserver>`u`||!PerformanceObserver.supportedEntryTypes?.includes(`longtask`))return;let e=0;X=new PerformanceObserver(()=>{let t=performance.now();t-e<500||(e=t,N({type:`busy`}))}),X.observe({type:`longtask`})},Ve=[[a,`pointermove`,Me,{passive:!0}],[a,`pointerdown`,Fe,{passive:!0}],[a,`pointerup`,Ne,{passive:!0}],[a,`pointercancel`,Ne,{passive:!0}],[a,`blur`,J],[a,`scroll`,je,{passive:!0,capture:!0}],[r.documentElement,`mouseleave`,J],[r,`visibilitychange`,Y],[v,`change`,Re],[y,`change`,ze]];for(let[e,t,n,r]of Ve)e.addEventListener(t,n,r);let He=(e,t=!1)=>{if(x)return;let n=!!c.onStats;c=t?{...e}:ie(c,e),u=re(c),N({type:`config`,config:_e()}),L=``,R(),N({type:`theme`,dark:j()}),N({type:`animated`,on:M()}),N({type:`visible`,on:le()}),!!c.onStats!==n&&N({type:`stats`,on:!!c.onStats}),u.cursor.enabled||J(),Be(),De(),W(),xe()},Z=e=>{b=e,N({type:`animated`,on:M()}),W()};return W(),Be(),R(),U(),{get element(){return h},get mode(){return S},get options(){return c},ready:ce,set:He,pulse:()=>N({type:`pulse`}),burst:(e,t,n)=>N({type:`click`,x:e,y:t,effect:n??(u.click===`ring`?`ring`:`shockwave`)}),play:()=>Z(!1),pause:()=>Z(!0),destroy:()=>{if(!x){x=!0,C?.destroy(),C=null,w&&URL.revokeObjectURL(w),Oe.disconnect(),Le?.disconnect(),X?.disconnect(),G?.removeEventListener(`change`,ke);for(let[e,t,n,r]of Ve)e.removeEventListener(t,n,r);K&&a.cancelAnimationFrame(K),I&&a.cancelAnimationFrame(I),k?.cancel(),h.remove();for(let e of d.reverse())e();A()}}}}let vt=`:host{display:block;position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden}:host([fixed]){position:fixed}`,yt=[`nebula`,`aurora`,`rays`,`glow`,`stars`,`meteors`,`grid`,`cursor`],bt={nebula:`intensity`,aurora:`intensity`,rays:`intensity`,glow:`intensity`,stars:`density`,meteors:`frequency`,grid:`speed`},xt=null;function St(e){try{xt||(xt=new CSSStyleSheet,xt.replaceSync(vt)),e.adoptedStyleSheets=[xt]}catch{let t=document.createElement(`style`);t.textContent=vt,e.append(t)}}let Ct=e=>e===null?void 0:e!==`false`,wt=e=>e===null||e.trim()===``||isNaN(+e)?void 0:+e,Tt=typeof HTMLElement>`u`?class{}:HTMLElement;var Et=class extends Tt{static observedAttributes=[`preset`,`theme`,`speed`,`animate`,`click`,`quality`,`intro`,`worker`,`model`,`model-material`,`model-anchor`,...yt];#e=null;#t={};#n=null;get options(){return this.#t}set options(e){this.#t=e??{},this.#r()}get instance(){return this.#e}connectedCallback(){let e=this.shadowRoot??this.attachShadow({mode:`open`});!e.adoptedStyleSheets?.length&&!e.querySelector(`style`)&&St(e),this.#a(),this.#e=_t(this,this.#i(),{layerParent:e,scope:this.parentElement,adjust:!1})}disconnectedCallback(){this.#e?.destroy(),this.#e=null,this.#n?.(),this.#n=null}attributeChangedCallback(){this.#r()}pulse(){this.#e?.pulse()}burst(e,t,n){this.#e?.burst(e,t,n)}play(){this.#e?.play()}pause(){this.#e?.pause()}#r(){this.#e?.set(this.#i(),!0)}#i(){let e=e=>this.getAttribute(e),t={};e(`preset`)&&(t.preset=e(`preset`)),e(`theme`)&&(t.theme=e(`theme`)),e(`click`)&&(t.click=e(`click`)),e(`quality`)&&(t.quality=e(`quality`)),wt(e(`speed`))!==void 0&&(t.speed=wt(e(`speed`)));let n=e(`animate`);n!==null&&(t.animate=n===`auto`?`auto`:n!==`false`),Ct(e(`intro`))!==void 0&&(t.intro=Ct(e(`intro`))),e(`worker`)===`false`&&(t.worker=!1);for(let n of yt){let r=e(n);if(r===null)continue;let i=wt(r),a=bt[n];t[n]=i!==void 0&&a?{[a]:i}:r!==`false`}let r=e(`model`);return r&&(t.models={src:r,...e(`model-material`)&&{material:e(`model-material`)},...e(`model-anchor`)&&{anchor:e(`model-anchor`)}}),{...t,...this.#t,fixed:!1}}#a(){let e=this.parentElement;if(!e)return;let t=getComputedStyle(e),n=[],r=(t,r)=>{let i=e.style.getPropertyValue(t);e.style.setProperty(t,r),n.push(()=>e.style.setProperty(t,i))};!this.hasAttribute(`fixed`)&&e!==document.body&&t.position===`static`&&r(`position`,`relative`),t.isolation!==`isolate`&&r(`isolation`,`isolate`),this.#n=()=>n.forEach(e=>e())}};function Dt(e=`deep-sky`){typeof customElements>`u`||customElements.get(e)||customElements.define(e,e===`deep-sky`?Et:class extends Et{})}return Dt(),e.DEFAULT_CLICK_IGNORE=_,e.DeepSkyElement=Et,e.createDeepSky=gt,e.defaults=y,e.defineDeepSky=Dt,e.mergeOptions=ie,e.modelDefaults=b,e.modelMaterials=p,e.modelShapes=m,e.normalizeOptions=re,e.presetNames=g,e.presets=h,e.qualities=v,e})({});