/* JFI orb, round 4 (mock-up engine, 26 Sep 2026).
   Same character as the live Strobi orb (a violet-blue sphere with two white pill eyes), made alive:
   - every value (eye shape, gaze, lean, glow) rides a spring, so moods blend instead of snapping
   - the eyes look at what is happening: a tap, the caret, a reply arriving, the card it is helping with
   - moods: idle, happy, curious, thinking, listening, speaking, celebrate, concerned, sleepy, surprised, focused
   - quiet FX that only appear when they mean something: aurora halo (thinking), orbiting motes (working),
     breathing rings (voice), a spark burst (wins), a rim light in the colour of the section it is on
   - flyTo(): moves along an arc with squash and stretch along its velocity, lands with a small overshoot
   Pure DOM + one requestAnimationFrame loop per orb, paused when off screen. Ports 1:1 into JfiStrobiOrb. */
(function () {
  const TAU = Math.PI * 2;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* mood targets. Units are fractions of the orb size. l/r = per-eye; b = bottom curve (1 round, <0 crescent
     = smiling), t = top curve (1 round, lower = flatter lid), tilt in degrees (+ = inner corner down). */
  const MOODS = {
    idle:      { w: .135, h: .25, b: 1, t: 1, tiltL: 0, tiltR: 0, sp: .30, y: -.02, halo: 0, motes: 0, rings: 0, lean: 1, liquid: .5, glow: .35 },
    happy:     { w: .165, h: .25, b: -.42, t: 1, tiltL: -4, tiltR: 4, sp: .31, y: -.03, halo: 0, motes: 0, rings: 0, lean: 1.02, liquid: .8, glow: .5 },
    curious:   { w: .14, h: .27, hR: .2, b: 1, t: 1, tiltL: -6, tiltR: 10, sp: .3, y: -.03, halo: 0, motes: 0, rings: 0, lean: 1.01, liquid: .6, glow: .4, headTilt: 9 },
    thinking:  { w: .13, h: .19, b: .9, t: .8, tiltL: 0, tiltR: 0, sp: .29, y: -.05, halo: 1, motes: 1, rings: 0, lean: 1, liquid: 1.8, glow: .55, gaze: [.55, -.55] },
    focused:   { w: .14, h: .16, b: .9, t: .55, tiltL: 6, tiltR: -6, sp: .3, y: 0, halo: .35, motes: .7, rings: 0, lean: 1.01, liquid: 1.2, glow: .45 },
    listening: { w: .15, h: .29, b: 1, t: 1, tiltL: 0, tiltR: 0, sp: .31, y: -.02, halo: .45, motes: 0, rings: .6, lean: 1.05, liquid: .9, glow: .6 },
    speaking:  { w: .14, h: .24, b: .7, t: 1, tiltL: -2, tiltR: 2, sp: .3, y: -.02, halo: .3, motes: 0, rings: 1, lean: 1.03, liquid: 1.1, glow: .6 },
    celebrate: { w: .175, h: .26, b: -.45, t: 1, tiltL: -8, tiltR: 8, sp: .32, y: -.04, halo: .6, motes: 0, rings: 0, lean: 1.06, liquid: 2, glow: .8 },
    concerned: { w: .135, h: .22, b: .95, t: .42, tiltL: -20, tiltR: 20, sp: .28, y: .02, halo: 0, motes: 0, rings: 0, lean: .98, liquid: .35, glow: .25, gaze: [0, .35] },
    sleepy:    { w: .15, h: .035, b: 1, t: 1, tiltL: 0, tiltR: 0, sp: .3, y: .03, halo: 0, motes: 0, rings: 0, lean: .97, liquid: .2, glow: .15, gaze: [0, .2] },
    surprised: { w: .16, h: .31, b: 1, t: 1, tiltL: 0, tiltR: 0, sp: .31, y: -.04, halo: 0, motes: 0, rings: 0, lean: 1.08, liquid: 1, glow: .6 },
  };
  const KEYS = ["wL", "wR", "hL", "hR", "bL", "bR", "t", "tiltL", "tiltR", "sp", "y", "halo", "motes", "rings", "lean", "liquid", "glow", "headTilt"];
  function flat(m) {
    return { wL: m.w, wR: m.wR ?? m.w, hL: m.h, hR: m.hR ?? m.h, bL: m.b, bR: m.b, t: m.t, tiltL: m.tiltL, tiltR: m.tiltR, sp: m.sp, y: m.y,
      halo: m.halo, motes: m.motes, rings: m.rings, lean: m.lean, liquid: m.liquid, glow: m.glow, headTilt: m.headTilt || 0 };
  }

  /* one eye as two cubic curves: top arc and bottom arc between the side points. b < 0 lifts the bottom
     above the middle, which turns the pill into a ^ crescent (the smile). */
  function eyePath(w, h, b, t) {
    const c = h * 0.667;
    const x = w / 2, ct = -c * t, cb = c * b;
    const r = (n) => n.toFixed(2);
    return `M${r(-x)} 0C${r(-x)} ${r(ct)} ${r(x)} ${r(ct)} ${r(x)} 0C${r(x)} ${r(cb)} ${r(-x)} ${r(cb)} ${r(-x)} 0Z`;
  }

  const CSS = `
.jo{position:absolute;left:0;top:0;width:var(--s);height:var(--s);margin:calc(var(--s)/-2) 0 0 calc(var(--s)/-2);pointer-events:none;will-change:transform}
.jo *{pointer-events:none}
.jo-halo{position:absolute;inset:-26%;border-radius:50%;background:conic-gradient(from var(--ha,0deg),rgba(140,124,246,0) 0deg,rgba(140,124,246,.95) 70deg,rgba(124,199,247,.95) 140deg,rgba(255,154,213,.75) 190deg,rgba(140,124,246,0) 250deg,rgba(124,199,247,.6) 320deg,rgba(140,124,246,0) 360deg);-webkit-mask:radial-gradient(closest-side,transparent 64%,#000 72%,#000 80%,transparent 100%);mask:radial-gradient(closest-side,transparent 64%,#000 72%,#000 80%,transparent 100%);filter:blur(calc(var(--s)*.035));opacity:var(--halo,0)}
.jo-glow{position:absolute;inset:-14%;border-radius:50%;background:radial-gradient(closest-side,var(--rimc,rgba(140,124,246,.55)),transparent 75%);opacity:var(--glow,.3);filter:blur(calc(var(--s)*.06))}
.jo-ring{position:absolute;inset:-4%;border-radius:50%;border:max(1.5px,calc(var(--s)*.018)) solid rgba(140,124,246,.55);opacity:0}
.jo-mote{position:absolute;left:50%;top:50%;width:calc(var(--s)*.055);height:calc(var(--s)*.055);margin:calc(var(--s)*-.0275);border-radius:50%;background:#fff;box-shadow:0 0 calc(var(--s)*.06) rgba(140,124,246,.9);opacity:0}
.jo-body{position:absolute;inset:0;border-radius:50%;overflow:hidden;
  background:radial-gradient(circle at 34% 28%,#c9c0ff 0%,#9a8cf8 34%,#7563ee 62%,#4f5fe0 100%);
  box-shadow:inset 0 calc(var(--s)*-.09) calc(var(--s)*.16) rgba(40,24,140,.42),inset 0 calc(var(--s)*.05) calc(var(--s)*.09) rgba(255,255,255,.45),0 0 0 max(1px,calc(var(--s)*.012)) var(--rimline,rgba(255,255,255,.0)),0 calc(var(--s)*.18) calc(var(--s)*.4) calc(var(--s)*-.2) rgba(60,44,170,.6)}
.jo-liquid{position:absolute;inset:-30%;background:conic-gradient(from 0deg,#8c7cf6,#7cc7f7,#b7a9ff,#5d7cf2,#9ad7ff,#8c7cf6);filter:blur(calc(var(--s)*.12));opacity:.62;mix-blend-mode:soft-light}
.jo-spec{position:absolute;left:18%;top:9%;width:34%;height:22%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.95),rgba(255,255,255,0));transform:rotate(-24deg);filter:blur(calc(var(--s)*.01))}
.jo-svg{position:absolute;inset:0;overflow:visible}
.jo-eye{fill:#fff;filter:drop-shadow(0 0 calc(var(--s)*.02) rgba(255,255,255,.55))}
.jo-spark{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px}
@media (prefers-reduced-motion:reduce){.jo-halo{display:none}}
`;
  let cssDone = false;
  function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); }

  const STAR = '<svg viewBox="0 0 24 24"><path d="M12 0c.9 6.8 4.2 10.4 12 12-7.8 1.6-11.1 5.2-12 12-.9-6.8-4.2-10.4-12-12 7.8-1.6 11.1-5.2 12-12z" fill="currentColor"/></svg>';

  class JfiOrb {
    constructor(host, opts = {}) {
      injectCss();
      this.size = opts.size || 64;
      this.el = document.createElement("div");
      this.el.className = "jo";
      this.el.innerHTML = `<div class="jo-glow"></div><div class="jo-halo"></div><div class="jo-ring"></div><div class="jo-ring"></div>
        <div class="jo-mote"></div><div class="jo-mote"></div><div class="jo-mote"></div>
        <div class="jo-body"><div class="jo-liquid"></div><div class="jo-spec"></div>
        <svg class="jo-svg"><g class="jo-face"><path class="jo-eye"/><path class="jo-eye"/></g></svg></div>`;
      host.appendChild(this.el);
      this.$ = (s) => this.el.querySelectorAll(s);
      this.eyes = this.$(".jo-eye"); this.rings = this.$(".jo-ring"); this.motes = this.$(".jo-mote");
      this.body = this.el.querySelector(".jo-body"); this.liquidEl = this.el.querySelector(".jo-liquid"); this.spec = this.el.querySelector(".jo-spec");
      this.face = this.el.querySelector(".jo-face"); this.svg = this.el.querySelector(".jo-svg");
      this.p = flat(MOODS.idle); this.v = Object.fromEntries(KEYS.map((k) => [k, 0])); this.target = flat(MOODS.idle);
      this.mood = "idle";
      this.g = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };          // gaze, -1..1
      this.pos = { x: opts.x || 0, y: opts.y || 0, s: this.size };     // centre in host coords + visual size
      this.stretch = { a: 0, k: 0 };
      this.bob = { y: 0, vy: 0 };                                       // one-shot nods/bounces
      this.level = 0; this.levelAuto = false; this.blink = { t: -1, next: performance.now() + rnd(1500, 3500) };
      this.lookPoint = null; this.lookUntil = 0; this.nextWander = 0; this.liquidA = rnd(0, 360); this.haloA = 0; this.moteA = 0; this.t0 = performance.now();
      this.wanderScale = opts.wander ?? 1;
      this.setRim(opts.rim || "#8c7cf6");
      this.applyPos();
      this.visible = true;
      if ("IntersectionObserver" in window) new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; }).observe(this.body);
      this.loop = this.loop.bind(this); this.last = performance.now(); requestAnimationFrame(this.loop);
    }

    setMood(name) { if (!MOODS[name]) return; this.mood = name; this.target = flat(MOODS[name]); if (name === "surprised") this.kick(-.06); if (name === "celebrate") { this.kick(-.14); this.burst(14); } return this; }
    /* look at a point in viewport coordinates for ms (0 = until cleared) */
    lookAt(x, y, ms = 1600) { this.lookPoint = { x, y }; this.lookUntil = ms ? performance.now() + ms : Infinity; return this; }
    lookAtEl(el, ms) { const r = el.getBoundingClientRect(); return this.lookAt(r.left + r.width / 2, r.top + r.height / 2, ms); }
    lookDir(x, y, ms = 1400) { this.lookPoint = { dir: [x, y] }; this.lookUntil = ms ? performance.now() + ms : Infinity; return this; }
    clearLook() { this.lookPoint = null; return this; }
    setLevel(v) { this.level = clamp(v, 0, 1); }
    autoLevel(on) { this.levelAuto = on; }
    setRim(c) { this.el.style.setProperty("--rimc", hexA(c, .6)); this.el.style.setProperty("--rimline", hexA(c, .0)); this.rim = c; this.rings.forEach((r) => (r.style.borderColor = hexA(c, .6))); }
    kick(v) { this.bob.vy += v * 60; }                                   // negative = hop up
    nod() { this.kick(.05); setTimeout(() => this.kick(.05), 180); }
    squish() { this.stretch.k = -.16; this.stretch.a = Math.PI / 2; }
    burst(n = 10, colors = ["#ffffff", "#b7a9ff", "#7cc7f7", "#ffd27a"]) {
      if (reduced()) return;
      for (let i = 0; i < n; i++) {
        const s = document.createElement("div"); s.className = "jo-spark"; s.innerHTML = STAR; s.style.color = colors[i % colors.length];
        this.el.appendChild(s);
        const a = (i / n) * TAU + rnd(-.3, .3), d = this.pos.s * rnd(.7, 1.25), sc = rnd(.45, 1.05) * clamp(this.pos.s / 64, .6, 1.6);
        s.animate([{ transform: `translate(0,0) scale(0) rotate(0deg)`, opacity: 1 }, { transform: `translate(${Math.cos(a) * d * .75}px,${Math.sin(a) * d * .75}px) scale(${sc}) rotate(90deg)`, opacity: 1, offset: .55 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(0) rotate(160deg)`, opacity: 0 }],
          { duration: rnd(700, 1100), easing: "cubic-bezier(.2,.7,.2,1)" }).onfinish = () => s.remove();
      }
    }
    /* fly along an arc; size changes on the way; squash/stretch follows the velocity */
    flyTo(x, y, s = this.pos.s, { ms = 620, arc = .22 } = {}) {
      const from = { ...this.pos }; const dx = x - from.x, dy = y - from.y;
      const cx = from.x + dx / 2 - dy * arc, cy = from.y + dy / 2 + dx * arc;   // control point off the chord
      if (reduced()) { this.pos = { x, y, s }; this.applyPos(); return Promise.resolve(); }
      this.lookDir(clamp(dx / 200, -1, 1), clamp(dy / 200, -1, 1), ms);
      return new Promise((res) => {
        const t0 = performance.now(); let px = from.x, py = from.y;
        this.flight = (now) => {
          let u = clamp((now - t0) / ms, 0, 1);
          const e = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;           // easeInOutCubic
          const bx = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * cx + e * e * x;
          const by = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * cy + e * e * y;
          const vx = bx - px, vy = by - py; px = bx; py = by;
          const sp = Math.hypot(vx, vy);
          this.stretch.a = Math.atan2(vy, vx); this.stretch.k = clamp(sp / 60, 0, .22);
          this.pos = { x: bx, y: by, s: from.s + (s - from.s) * e };
          if (u >= 1) { this.flight = null; this.stretch.k = -.1; this.kick(.035); res(); }
        };
      });
    }
    placeAt(x, y, s = this.pos.s) { this.pos = { x, y, s }; this.applyPos(); }
    applyPos() {
      const { x, y, s } = this.pos, k = this.stretch.k, a = this.stretch.a;
      const sc = s / this.size;
      this.el.style.setProperty("--s", this.size + "px");
      this.el.style.transform = `translate(${x}px,${y + this.bob.y * s}px) rotate(${a}rad) scale(${sc * (1 + k)},${sc * (1 - k * .75)}) rotate(${-a}rad)`;
    }

    loop(now) {
      requestAnimationFrame(this.loop);
      const dt = Math.min((now - this.last) / 1000, 1 / 30); this.last = now;
      if (!this.visible && !this.flight) return;
      if (this.flight) this.flight(now); else { this.stretch.k += (0 - this.stretch.k) * Math.min(1, dt * 9); }
      const R = reduced();
      // mood springs (slightly under-damped: a little life on every change)
      const K = 160, D = 2 * Math.sqrt(K) * .78;
      for (const k of KEYS) { const a = (this.target[k] - this.p[k]) * K - this.v[k] * D; this.v[k] += a * dt; this.p[k] += this.v[k] * dt; }
      // gaze target: explicit look > mood gaze > idle wander
      let tx = 0, ty = 0; const g = this.g;
      if (this.lookPoint && now > this.lookUntil) this.lookPoint = null;
      const mg = MOODS[this.mood].gaze;
      if (this.lookPoint) {
        if (this.lookPoint.dir) [tx, ty] = this.lookPoint.dir;
        else { const r = this.body.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const dx = this.lookPoint.x - cx, dy = this.lookPoint.y - cy; const d = Math.hypot(dx, dy) || 1; const m = clamp(d / (r.width * 2.2), 0, 1); tx = dx / d * m; ty = dy / d * m; }
      } else if (mg) { [tx, ty] = mg; tx += Math.sin(now / 900) * .06; }
      else if (!R && this.wanderScale) {
        if (now > this.nextWander) {
          const look = Math.random();
          g.tx = look < .35 ? 0 : rnd(-.75, .75) * this.wanderScale; g.ty = look < .35 ? 0 : rnd(-.45, .5) * this.wanderScale;
          this.nextWander = now + (look < .35 ? rnd(1800, 3400) : rnd(700, 2000));
        }
        tx = g.tx; ty = g.ty;
      }
      if (this.mood === "speaking" || this.mood === "listening") ty += -this.level * .12;
      // saccade spring (fast, crisp)
      const GK = 320, GD = 2 * Math.sqrt(GK) * .9;
      g.vx += ((tx - g.x) * GK - g.vx * GD) * dt; g.vy += ((ty - g.y) * GK - g.vy * GD) * dt; g.x += g.vx * dt; g.y += g.vy * dt;
      // bob spring (hops, nods)
      this.bob.vy += (-this.bob.y * 220 - this.bob.vy * 16) * dt; this.bob.y += this.bob.vy * dt;
      // voice level
      if (this.levelAuto) { const tt = now / 1000; this.level = clamp(.35 + .35 * Math.sin(tt * 7.3) * Math.sin(tt * 2.1) + .25 * Math.sin(tt * 13.7), 0, 1); }
      const lv = this.level;
      // blink (sometimes a double blink)
      let blink = 1;
      if (this.blink.t < 0 && now > this.blink.next && this.mood !== "sleepy") this.blink.t = now;
      if (this.blink.t >= 0) { const u = (now - this.blink.t) / 150; if (u >= 1) { this.blink.t = -1; this.blink.next = now + (Math.random() < .18 ? 180 : rnd(2200, 5600)); } else blink = 1 - Math.sin(Math.PI * u) * .92; }
      // draw
      const S = this.size, p = this.p;
      const breathe = R ? 0 : Math.sin((now - this.t0) / (this.mood === "sleepy" ? 1300 : 700)) * .012;
      const fx = g.x * S * .12, fy = g.y * S * .1;
      const persp = g.x * .22;                                             // 3D: the far eye narrows
      const bobEyes = this.mood === "speaking" ? -lv * S * .02 : 0;
      const eyeY = S / 2 + p.y * S + fy + bobEyes;
      const sp = p.sp * S * (1 - Math.abs(g.x) * .08);
      const hScale = blink * (1 + (this.mood === "listening" ? lv * .12 : 0));
      const L = { x: S / 2 - sp / 2 + fx, w: p.wL * S * (1 + persp), h: Math.max(p.hL * S * hScale, S * .018) };
      const Rr = { x: S / 2 + sp / 2 + fx, w: p.wR * S * (1 - persp), h: Math.max(p.hR * S * hScale, S * .018) };
      this.eyes[0].setAttribute("d", eyePath(L.w, L.h, blink < .6 ? 1 : p.bL, p.t));
      this.eyes[1].setAttribute("d", eyePath(Rr.w, Rr.h, blink < .6 ? 1 : p.bR, p.t));
      this.eyes[0].setAttribute("transform", `translate(${L.x.toFixed(2)} ${eyeY.toFixed(2)}) rotate(${(-p.tiltL).toFixed(2)})`);
      this.eyes[1].setAttribute("transform", `translate(${Rr.x.toFixed(2)} ${eyeY.toFixed(2)}) rotate(${(p.tiltR).toFixed(2)})`);
      this.face.setAttribute("transform", `rotate(${(p.headTilt + g.x * 4).toFixed(2)} ${S / 2} ${S / 2})`);
      this.spec.style.transform = `translate(${(-g.x * S * .05).toFixed(2)}px,${(-g.y * S * .04).toFixed(2)}px) rotate(-24deg)`;
      this.liquidA += dt * 40 * p.liquid; this.liquidEl.style.transform = `rotate(${this.liquidA.toFixed(1)}deg)`;
      this.haloA += dt * 150 * (.4 + p.halo); this.el.style.setProperty("--ha", this.haloA.toFixed(1) + "deg");
      this.el.style.setProperty("--halo", Math.max(0, p.halo).toFixed(3));
      this.el.style.setProperty("--glow", (p.glow + lv * p.rings * .4).toFixed(3));
      this.body.style.transform = `scale(${(p.lean + breathe + lv * p.rings * .04).toFixed(4)})`;
      const rOn = Math.max(0, p.rings);
      this.rings[0].style.opacity = (rOn * (.25 + lv * .7)).toFixed(3); this.rings[0].style.transform = `scale(${(1.04 + lv * .3 * rOn).toFixed(3)})`;
      this.rings[1].style.opacity = (rOn * (.12 + lv * .45)).toFixed(3); this.rings[1].style.transform = `scale(${(1.14 + lv * .55 * rOn).toFixed(3)})`;
      this.moteA += dt * 2.6;
      this.motes.forEach((m, i) => { const a = this.moteA + i * TAU / 3, r = S * .66; m.style.opacity = (Math.max(0, p.motes) * (.55 + .45 * Math.sin(this.moteA * 2 + i))).toFixed(3); m.style.transform = `translate(${(Math.cos(a) * r).toFixed(1)}px,${(Math.sin(a) * r * .9).toFixed(1)}px)`; });
      this.applyPos();
    }
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  JfiOrb.MOODS = Object.keys(MOODS);
  window.JfiOrb = JfiOrb;
})();
