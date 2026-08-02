"use strict";
(() => {
  // ../src/vec.ts
  var degToRad = (deg) => deg * Math.PI / 180;
  var radToDeg = (rad) => rad * 180 / Math.PI;
  var sub = (p, q) => [p[0] - q[0], p[1] - q[1]];
  var dot = (p, q) => p[0] * q[0] + p[1] * q[1];
  var len = (p) => Math.hypot(p[0], p[1]);
  var len2 = (p) => p[0] * p[0] + p[1] * p[1];
  function normalize(p) {
    const l = len(p);
    return l < 1e-6 ? [0, 1] : [p[0] / l, p[1] / l];
  }
  var lerp = (a, b, t) => a + (b - a) * t;
  var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  var fposmod = (v, m) => (v % m + m) % m;
  function unit(apiDeg) {
    const r = degToRad(apiDeg);
    return [Math.sin(r), Math.cos(r)];
  }
  function fromRot(apiDeg, origin) {
    const r = -degToRad(apiDeg);
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return { a: cos, b: sin, c: -sin, d: cos, tx: origin[0], ty: origin[1] };
  }
  function mul(A, B) {
    return {
      a: A.a * B.a + A.c * B.b,
      b: A.b * B.a + A.d * B.b,
      c: A.a * B.c + A.c * B.d,
      d: A.b * B.c + A.d * B.d,
      tx: A.a * B.tx + A.c * B.ty + A.tx,
      ty: A.b * B.tx + A.d * B.ty + A.ty
    };
  }
  var apply = (T, p) => [
    T.a * p[0] + T.c * p[1] + T.tx,
    T.b * p[0] + T.d * p[1] + T.ty
  ];
  var basisXform = (T, p) => [
    T.a * p[0] + T.c * p[1],
    T.b * p[0] + T.d * p[1]
  ];
  function inverse(T) {
    return {
      a: T.a,
      b: T.c,
      c: T.b,
      d: T.d,
      tx: -(T.a * T.tx + T.b * T.ty),
      ty: -(T.c * T.tx + T.d * T.ty)
    };
  }

  // ../src/img.ts
  function hex(rgb2, alpha = 1) {
    const n = parseInt(rgb2, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, alpha];
  }
  function sameColor(a, b) {
    return Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4 && Math.abs(a[2] - b[2]) < 1e-4;
  }
  function darkened(c, amount) {
    return [c[0] * (1 - amount), c[1] * (1 - amount), c[2] * (1 - amount), c[3]];
  }
  var Img = class _Img {
    w;
    h;
    data;
    constructor(w, h) {
      this.w = Math.max(1, Math.ceil(w));
      this.h = Math.max(1, Math.ceil(h));
      this.data = new Float32Array(this.w * this.h * 4);
    }
    get(x, y) {
      const i = (y * this.w + x) * 4;
      const d = this.data;
      return [d[i], d[i + 1], d[i + 2], d[i + 3]];
    }
    alpha(x, y) {
      return this.data[(y * this.w + x) * 4 + 3];
    }
    set(x, y, c) {
      const i = (y * this.w + x) * 4;
      const d = this.data;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = c[3];
    }
    inside(x, y) {
      return x >= 0 && y >= 0 && x < this.w && y < this.h;
    }
    /** Source-over blend of `c` onto the pixel. */
    blend(x, y, c) {
      const i = (y * this.w + x) * 4;
      const d = this.data;
      const a = c[3];
      const ia = 1 - a;
      d[i] = c[0] * a + d[i] * ia;
      d[i + 1] = c[1] * a + d[i + 1] * ia;
      d[i + 2] = c[2] * a + d[i + 2] * ia;
      d[i + 3] = a + d[i + 3] * ia;
    }
    /** Blend a whole image over this one at (0,0) — Image.blend_rect. */
    blendImage(src) {
      const w = Math.min(this.w, src.w);
      const h = Math.min(this.h, src.h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = src.get(x, y);
          if (c[3] > 1e-3) this.blend(x, y, c);
        }
      }
    }
    /** The frame as 8-bit RGBA rows — what a canvas ImageData or PNG encoder
     * wants. The engine never draws; callers take these bytes and do. */
    toRGBA8() {
      const out = new Uint8ClampedArray(this.w * this.h * 4);
      for (let i = 0; i < out.length; i++) out[i] = Math.round(this.data[i] * 255);
      return out;
    }
    flippedX() {
      const out = new _Img(this.w, this.h);
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) out.set(this.w - 1 - x, y, this.get(x, y));
      }
      return out;
    }
  };

  // ../src/paint.ts
  var Paint = class {
    img;
    /** Where local (0,0) — the bone joint — sits in img pixels. */
    origin;
    constructor(rect) {
      this.img = new Img(rect.w, rect.h);
      this.origin = [-rect.x, -rect.y];
    }
    /** Tapered capsule from p0 (radius r0) to p1 (radius r1) — the workhorse. */
    capsule(p0, p1, r0, r1, c) {
      const img = this.img;
      const a = [p0[0] + this.origin[0], p0[1] + this.origin[1]];
      const b = [p1[0] + this.origin[0], p1[1] + this.origin[1]];
      const rmax = Math.max(r0, r1);
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - rmax));
      const x1 = Math.min(img.w - 1, Math.ceil(Math.max(a[0], b[0]) + rmax));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - rmax));
      const y1 = Math.min(img.h - 1, Math.ceil(Math.max(a[1], b[1]) + rmax));
      const ab = sub(b, a);
      const l2 = len2(ab);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const p = [x + 0.5, y + 0.5];
          const t = l2 === 0 ? 0 : clamp(dot(sub(p, a), ab) / l2, 0, 1);
          const r = lerp(r0, r1, t);
          const cx = a[0] + ab[0] * t;
          const cy = a[1] + ab[1] * t;
          const dx = p[0] - cx;
          const dy = p[1] - cy;
          if (dx * dx + dy * dy <= r * r) img.set(x, y, c);
        }
      }
    }
    disc(center, r, c) {
      this.capsule(center, center, r, r, c);
    }
    /** Polyline stroke with a per-point half-width profile. */
    stroke(points, widths, c) {
      for (let i = 0; i < points.length - 1; i++) {
        const w0 = widths[Math.min(i, widths.length - 1)];
        const w1 = widths[Math.min(i + 1, widths.length - 1)];
        this.capsule(points[i], points[i + 1], w0, w1, c);
      }
    }
    /** A stroke tapering linearly from w0 to w1 — the shape of a chain. */
    ribbon(points, w0, w1, c) {
      const n = points.length;
      if (n < 2) return;
      for (let i = 0; i < n - 1; i++) {
        const t0 = i / (n - 1);
        const t1 = (i + 1) / (n - 1);
        this.capsule(points[i], points[i + 1], lerp(w0, w1, t0), lerp(w0, w1, t1), c);
      }
    }
    /**
     * Recolor pixels within `depth` of the silhouette edge on the side the
     * shape faces `dir` — lit and shaded sides, or a rim at a shallow depth.
     */
    tintToward(dir, c, depth) {
      const img = this.img;
      const l = Math.hypot(dir[0], dir[1]) || 1;
      const dx = dir[0] / l;
      const dy = dir[1] / l;
      const steps = Math.ceil(depth);
      const hits = [];
      for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) {
          if (img.alpha(x, y) < 0.5) continue;
          for (let k = 1; k <= steps; k++) {
            const qx = Math.floor(x + 0.5 + dx * k);
            const qy = Math.floor(y + 0.5 + dy * k);
            if (!img.inside(qx, qy) || img.alpha(qx, qy) < 0.5) {
              hits.push(y * img.w + x);
              break;
            }
          }
        }
      }
      for (const i of hits) img.set(i % img.w, Math.floor(i / img.w), c);
    }
    /** Darken toward local y = atY on the joint side — sells the joint. */
    occludeAbove(atY, depth, amount) {
      const img = this.img;
      for (let y = 0; y < img.h; y++) {
        const ly = y + 0.5 - this.origin[1];
        if (ly > atY || ly < atY - depth) continue;
        const f = (atY - ly) / depth;
        for (let x = 0; x < img.w; x++) {
          const c = img.get(x, y);
          if (c[3] >= 0.5) img.set(x, y, darkened(c, amount * (1 - f)));
        }
      }
    }
  };

  // ../src/skeleton.ts
  var Skeleton = class {
    bones = /* @__PURE__ */ new Map();
    order = [];
    last = "";
    chains = /* @__PURE__ */ new Map();
    rootPos = [0, 0];
    bone(name, parent, pivot, restDeg, length = 0) {
      if (parent !== "" && !this.bones.has(parent)) {
        throw new Error(`skeleton: bone '${name}' declares unknown parent '${parent}'`);
      }
      this.bones.set(name, { parent, pivot, rest: restDeg, length });
      this.order.push(name);
      this.last = name;
    }
    /** The tip of the most recently declared bone — the natural child pivot. */
    tip() {
      return this.last === "" ? [0, 0] : [0, this.bones.get(this.last).length];
    }
    chain(name, bone, anchor, links, linkLen, wind = [0, 0], gravity = 500, damp = 0.92, windTaper = 0, stiffness = 0, restDir = [0, 1]) {
      if (!this.bones.has(bone)) {
        throw new Error(`skeleton: chain '${name}' anchors to unknown bone '${bone}'`);
      }
      this.chains.set(name, {
        bone,
        anchor,
        links,
        len: linkLen,
        wind,
        gravity,
        damp,
        windTaper,
        stiffness,
        restDir
      });
    }
    hasBone(name) {
      return this.bones.has(name);
    }
    names() {
      return this.order;
    }
    lengthOf(name) {
      return this.bones.get(name).length;
    }
    /** World api angle (degrees, positive = east) of `name` under `pose`. */
    worldDeg(name, pose) {
      let total = 0;
      let n = name;
      while (n !== "") {
        const b = this.bones.get(n);
        total += b.rest + (pose.deg[n] ?? 0);
        n = b.parent;
      }
      return total;
    }
    /** World transform of every bone: bone-local paint space -> ss canvas. */
    transforms(pose) {
      const out = /* @__PURE__ */ new Map();
      const root = pose.root ?? [0, 0];
      for (const n of this.order) {
        const b = this.bones.get(n);
        const localDeg = b.rest + (pose.deg[n] ?? 0);
        const xf = fromRot(localDeg, b.pivot);
        if (b.parent === "") {
          const base = {
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            tx: this.rootPos[0] + root[0],
            ty: this.rootPos[1] + root[1]
          };
          out.set(n, mul(base, xf));
        } else {
          out.set(n, mul(out.get(b.parent), xf));
        }
      }
      return out;
    }
    /**
     * 2-bone IK: rotate upper/lower so the lower's tip reaches `target` (world
     * ss px), writing deltas into `pose`. `bend` +1 bends the joint EAST (a
     * knee), -1 west (an elbow). Optionally aims an end bone at a world angle.
     */
    solveChain(pose, upper, lower, target, bend = 1, endBone = "", endWorldDeg = 0) {
      const xfs = this.transforms(pose);
      const up = xfs.get(upper);
      const hip = [up.tx, up.ty];
      const l1 = this.lengthOf(upper);
      const l2 = this.lengthOf(lower);
      const d = sub(target, hip);
      const distTo = clamp(Math.hypot(d[0], d[1]), Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.5);
      const base = radToDeg(Math.atan2(d[0], d[1]));
      const a1 = radToDeg(
        Math.acos(clamp((l1 * l1 + distTo * distTo - l2 * l2) / (2 * l1 * distTo), -1, 1))
      );
      const upperWorld = base + bend * a1;
      const knee = [
        hip[0] + l1 * unit(upperWorld)[0],
        hip[1] + l1 * unit(upperWorld)[1]
      ];
      const reach = [hip[0] + distTo * unit(base)[0], hip[1] + distTo * unit(base)[1]];
      const lowerWorld = radToDeg(Math.atan2(reach[0] - knee[0], reach[1] - knee[1]));
      const upperBone = this.bones.get(upper);
      const upperParentWorld = this.worldDeg(upper, pose) - (upperBone.rest + (pose.deg[upper] ?? 0));
      pose.deg[upper] = upperWorld - upperParentWorld - upperBone.rest;
      pose.deg[lower] = lowerWorld - upperWorld - this.bones.get(lower).rest;
      if (endBone !== "") {
        pose.deg[endBone] = endWorldDeg - lowerWorld - this.bones.get(endBone).rest;
      }
    }
  };

  // ../src/motion.ts
  var CONTACT = 0.6;
  var Motion = class _Motion {
    name;
    /** Cycle length in seconds. */
    cycle;
    loop;
    /** Loops read best at 12-15 fps; actions on twos at 24 with holds. */
    bakeFps = 15;
    airborne = false;
    /** In-place tolerance: how far (1x px) the silhouette's centroid-x may
     * stray from the clip's own mean before the audit calls it a sideways
     * walk. A deliberate lunge declares a bigger budget. */
    wobbleBudget = 2.5;
    /** Extra wind this clip adds to every verlet chain (ss px/s^2). */
    wind = [0, 0];
    /** Set on a mirror clip: the east clip whose frames this one flips. */
    mirrorOf = "";
    channels = /* @__PURE__ */ new Map();
    gaits = [];
    plants = [];
    constructor(name, cycleSeconds, looping = true) {
      this.name = name;
      this.cycle = cycleSeconds;
      this.loop = looping;
    }
    /** Key one channel: a bone name (delta deg) or "root_x" / "root_y" (ss px). */
    key(channel, keys, ease2 = "sine") {
      const times = Object.keys(keys).map(Number).sort((a, b) => a - b);
      this.channels.set(channel, { times, values: times.map((t) => keys[t]), ease: ease2 });
    }
    /**
     * Author a foot path; IK does the rest. `contact` is the fraction of the
     * cycle the foot is DOWN — it alone decides whether the clip can fly.
     */
    gait(upper, lower, end, stride, lift, phase, groundY, hipX = 0, contact = CONTACT) {
      this.gaits.push({
        upper,
        lower,
        end,
        stride,
        lift,
        phase,
        hipX,
        groundY,
        contact: clamp(contact, 0.05, 0.95)
      });
    }
    /** Per-clip draw-order override; stepped — depth changes are cuts. */
    layer(part, keys, ease2 = "step") {
      this.key("z:" + part, keys, ease2);
    }
    zOffsets(t) {
      const out = /* @__PURE__ */ new Map();
      const u = this.loop ? fposmod(t / this.cycle, 1) : clamp(t / this.cycle, 0, 1);
      for (const name of this.channels.keys()) {
        if (name.startsWith("z:")) out.set(name.slice(2), this.value(name, u));
      }
      return out;
    }
    /**
     * KEYED IK targets for a limb chain — the action-clip tool. `keys` maps
     * seconds to [x, y, endWorldDeg] in ss canvas coordinates.
     */
    plant(upper, lower, end, keys, ease2 = "sine", bend = 1) {
      const kx = {};
      const ky = {};
      const kd = {};
      for (const [t, v] of Object.entries(keys)) {
        kx[Number(t)] = v[0];
        ky[Number(t)] = v[1];
        kd[Number(t)] = v[2];
      }
      this.key("plant_x:" + end, kx, ease2);
      this.key("plant_y:" + end, ky, ease2);
      this.key("plant_d:" + end, kd, ease2);
      this.plants.push({ upper, lower, end, bend });
    }
    /** A west-facing clip: the whole-frame mirror of `srcName`, flipped at bake. */
    static mirror(mirrorName, srcName, template) {
      const m = new _Motion(mirrorName, template.cycle, template.loop);
      m.bakeFps = template.bakeFps;
      m.airborne = template.airborne;
      m.wobbleBudget = template.wobbleBudget;
      m.mirrorOf = srcName;
      return m;
    }
    /** The wind driving the chains at `t` — keyable per axis via wind_x/wind_y. */
    windAt(t) {
      const u = this.loop ? fposmod(t / this.cycle, 1) : clamp(t / this.cycle, 0, 1);
      return [
        this.channels.has("wind_x") ? this.value("wind_x", u) : this.wind[0],
        this.channels.has("wind_y") ? this.value("wind_y", u) : this.wind[1]
      ];
    }
    /** The full pose at `t` seconds, with every gait and plant solved. */
    poseAt(t, skel) {
      const pose = { deg: {} };
      const u = this.loop ? fposmod(t / this.cycle, 1) : clamp(t / this.cycle, 0, 1);
      let rootX = 0;
      let rootY = 0;
      let hasRoot = false;
      for (const name of this.channels.keys()) {
        if (name.startsWith("z:") || name.startsWith("plant_") || name.startsWith("wind_")) {
          continue;
        }
        const v = this.value(name, u);
        if (name === "root_x") {
          rootX = v;
          hasRoot = true;
        } else if (name === "root_y") {
          rootY = v;
          hasRoot = true;
        } else {
          pose.deg[name] = v;
        }
      }
      if (hasRoot) pose.root = [rootX, rootY];
      for (const g of this.gaits) this.solveGait(pose, g, u, skel);
      for (const pl of this.plants) {
        const target = [
          this.value("plant_x:" + pl.end, u),
          this.value("plant_y:" + pl.end, u)
        ];
        skel.solveChain(
          pose,
          pl.upper,
          pl.lower,
          target,
          pl.bend,
          pl.end,
          this.value("plant_d:" + pl.end, u)
        );
      }
      return pose;
    }
    solveGait(pose, g, u, skel) {
      const gu = fposmod(u + g.phase, 1);
      let x = 0;
      let y = g.groundY;
      let toe = 0;
      if (gu < g.contact) {
        const s = gu / g.contact;
        x = lerp(g.stride * 0.5, -g.stride * 0.5, s);
        y -= g.lift * 0.35 * smoothstep(0.7, 1, s);
        toe = lerp(-4, -26, s);
      } else {
        const v = (gu - g.contact) / (1 - g.contact);
        x = lerp(-g.stride * 0.5, g.stride * 0.5, smoothstep(0, 1, v));
        y -= g.lift * Math.max(Math.sin(Math.PI * v), 0.35 * (1 - v));
        toe = -30 * (1 - v) * (1 - v) - 4 * v * v;
      }
      const target = [skel.rootPos[0] + g.hipX + x, y];
      skel.solveChain(pose, g.upper, g.lower, target, 1, g.end, 90 + toe);
    }
    value(channel, u) {
      const ch = this.channels.get(channel);
      const { times, values } = ch;
      if (times.length === 1) return values[0];
      const t = u * this.cycle;
      let i = times.length - 1;
      while (i >= 0 && times[i] > t) i--;
      let t0;
      let v0;
      let t1;
      let v1;
      if (i < 0) {
        if (!this.loop) return values[0];
        t0 = times[times.length - 1] - this.cycle;
        v0 = values[values.length - 1];
        t1 = times[0];
        v1 = values[0];
      } else if (i === times.length - 1) {
        if (!this.loop) return values[i];
        t0 = times[i];
        v0 = values[i];
        t1 = times[0] + this.cycle;
        v1 = values[0];
      } else {
        t0 = times[i];
        v0 = values[i];
        t1 = times[i + 1];
        v1 = values[i + 1];
      }
      const f = t1 === t0 ? 0 : clamp((t - t0) / (t1 - t0), 0, 1);
      return lerp(v0, v1, ease(f, ch.ease));
    }
  };
  function ease(f, kind) {
    switch (kind) {
      case "sine":
        return smoothstep(0, 1, f);
      case "step":
        return f < 1 ? 0 : 1;
      case "outBack": {
        const s = 1.70158;
        const g = f - 1;
        return g * g * ((s + 1) * g + s) + 1;
      }
      default:
        return f;
    }
  }

  // ../src/chains.ts
  var SIM_FPS = 60;
  var WARM_CYCLES = 16;
  function simulateChains(skel, clip, nFrames) {
    const defs = skel.chains;
    const out = /* @__PURE__ */ new Map();
    if (defs.size === 0) return out;
    const dt = 1 / SIM_FPS;
    const warm = clip.loop ? WARM_CYCLES * clip.cycle : 1.5;
    const totalSteps = Math.round((warm + clip.cycle) * SIM_FPS);
    const clipTime = (t) => clip.loop ? fposmod(t, clip.cycle) : Math.min(Math.max(t, 0), clip.cycle);
    const state = /* @__PURE__ */ new Map();
    for (const [name, def] of defs) {
      state.set(name, chainInit(skel, def, clip.poseAt(clipTime(-warm), skel)));
      out.set(name, new Array(nFrames));
    }
    const recordSteps = /* @__PURE__ */ new Map();
    for (let f = 0; f < nFrames; f++) {
      recordSteps.set(Math.round((warm + f / clip.bakeFps) * SIM_FPS), f);
    }
    for (let step = 0; step <= totalSteps; step++) {
      const t = step * dt - warm;
      const pose = clip.poseAt(clipTime(t), skel);
      const xfs = skel.transforms(pose);
      for (const [name, def] of defs) {
        const boneXf = xfs.get(def.bone);
        const anchor = apply(boneXf, def.anchor);
        chainStep(state.get(name), anchor, def, clip.windAt(clipTime(t)), dt, rootDir(boneXf, def));
      }
      const f = recordSteps.get(step);
      if (f !== void 0) {
        for (const name of defs.keys()) {
          out.get(name)[f] = state.get(name).p.map((p) => [p[0], p[1]]);
        }
      }
    }
    return out;
  }
  function rootDir(boneXf, def) {
    const d = basisXform(boneXf, def.restDir);
    return d[0] * d[0] + d[1] * d[1] > 1e-4 ? normalize(d) : [0, 1];
  }
  function chainInit(skel, def, pose) {
    const xfs = skel.transforms(pose);
    const anchor = apply(xfs.get(def.bone), def.anchor);
    const p = [];
    const prev = [];
    for (let i = 0; i <= def.links; i++) {
      const pt = [anchor[0], anchor[1] + i * def.len];
      p.push(pt);
      prev.push(pt);
    }
    return { p, prev };
  }
  function chainStep(st, anchor, def, clipWind, dt, restDir) {
    const { p, prev } = st;
    const links = p.length - 1;
    for (let i = 1; i < p.length; i++) {
      const f = def.windTaper + (1 - def.windTaper) * (i / links);
      const ax = (def.wind[0] + clipWind[0]) * f;
      const ay = def.gravity + (def.wind[1] + clipWind[1]) * f;
      const cur = p[i];
      p[i] = [
        cur[0] + (cur[0] - prev[i][0]) * def.damp + ax * dt * dt,
        cur[1] + (cur[1] - prev[i][1]) * def.damp + ay * dt * dt
      ];
      prev[i] = cur;
    }
    p[0] = anchor;
    prev[0] = anchor;
    for (let iter = 0; iter < 6; iter++) {
      p[0] = anchor;
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i];
        const b = p[i + 1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const d = Math.hypot(dx, dy);
        if (d < 1e-4) continue;
        const diff = (d - def.len) / d;
        if (i === 0) {
          p[i + 1] = [b[0] - dx * diff, b[1] - dy * diff];
        } else {
          p[i] = [a[0] + dx * diff * 0.5, a[1] + dy * diff * 0.5];
          p[i + 1] = [b[0] - dx * diff * 0.5, b[1] - dy * diff * 0.5];
        }
      }
      if (def.stiffness > 0) {
        for (let i = 0; i < p.length - 1; i++) {
          const lead = i === 0 ? restDir : normalize([p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]]);
          const k = def.stiffness * Math.pow(1 - i / links, 2);
          const tx = p[i][0] + lead[0] * def.len;
          const ty = p[i][1] + lead[1] * def.len;
          p[i + 1] = [p[i + 1][0] + (tx - p[i + 1][0]) * k, p[i + 1][1] + (ty - p[i + 1][1]) * k];
        }
      }
    }
  }

  // ../src/compositor.ts
  var SS = 4;
  var COVER = 0.42;
  function bake(skel, parts, clip, w1x, h1x, cfg, shadow) {
    const n = Math.max(1, Math.round(clip.cycle * clip.bakeFps));
    const chainFrames = simulateChains(skel, clip, n);
    const out = [];
    for (let f = 0; f < n; f++) {
      const t = f / clip.bakeFps;
      const pose = clip.poseAt(t, skel);
      const chains = /* @__PURE__ */ new Map();
      for (const [name, frames] of chainFrames) chains.set(name, frames[f]);
      out.push(renderPose(skel, parts, pose, w1x, h1x, cfg, shadow, chains, clip.zOffsets(t)));
    }
    return out;
  }
  function renderPose(skel, parts, pose, w1x, h1x, cfg, shadow, chains = /* @__PURE__ */ new Map(), z = /* @__PURE__ */ new Map()) {
    const w = w1x * SS;
    const h = h1x * SS;
    const big = new Img(w, h);
    const owner = new Int32Array(w * h).fill(-1);
    const xfs = skel.transforms(pose);
    let order = parts.map((_, i) => i);
    if (z.size > 0) {
      order = order.map((i) => [i + (z.get(parts[i].name) ?? 0), i]).sort((a, b) => a[0] - b[0]).map((pair) => pair[1]);
    }
    for (const i of order) {
      const part = parts[i];
      if ("chain" in part) {
        const pts = chains.get(part.chain);
        if (pts === void 0 || pts.length === 0) continue;
        splat(big, owner, i, chainPaint(part, pts), { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
      } else {
        const xf = xfs.get(part.bone);
        if (xf === void 0) {
          throw new Error(`compositor: part '${part.name}' binds unknown bone '${part.bone}'`);
        }
        splat(big, owner, i, part.paint, xf);
      }
    }
    const body = grade(big, owner, parts, w1x, h1x, cfg);
    outline(body, cfg.ink);
    const img = new Img(w1x, h1x);
    if (shadow !== void 0) {
      discEllipse(img, shadow.x, shadow.y, shadow.rx, shadow.ry, cfg.shadow);
    }
    img.blendImage(body);
    return img;
  }
  function discEllipse(img, cx, cy, rx, ry, c) {
    for (let y = Math.max(0, cy - ry); y <= Math.min(img.h - 1, cy + ry); y++) {
      for (let x = Math.max(0, cx - rx); x <= Math.min(img.w - 1, cx + rx); x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / (ry + 1e-3);
        if (nx * nx + ny * ny <= 1) img.blend(x, y, c);
      }
    }
  }
  function chainPaint(part, pts) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of pts) {
      minX = Math.min(minX, pt[0]);
      minY = Math.min(minY, pt[1]);
      maxX = Math.max(maxX, pt[0]);
      maxY = Math.max(maxY, pt[1]);
    }
    const margin = 14;
    const paint = new Paint({
      x: Math.floor(minX - margin),
      y: Math.floor(minY - margin),
      w: Math.ceil(maxX - minX + margin * 2),
      h: Math.ceil(maxY - minY + margin * 2)
    });
    part.painter(paint, pts);
    return paint;
  }
  function splat(big, owner, index, paint, xf) {
    const src = paint.img;
    const sw = src.w;
    const sh = src.h;
    const org = paint.origin;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const corner of [
      [0, 0],
      [sw, 0],
      [0, sh],
      [sw, sh]
    ]) {
      const p = apply(xf, [corner[0] - org[0], corner[1] - org[1]]);
      minX = Math.min(minX, p[0]);
      minY = Math.min(minY, p[1]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
    }
    const x0 = Math.max(0, Math.floor(minX) - 1);
    const y0 = Math.max(0, Math.floor(minY) - 1);
    const x1 = Math.min(big.w - 1, Math.ceil(maxX) + 1);
    const y1 = Math.min(big.h - 1, Math.ceil(maxY) + 1);
    const inv = inverse(xf);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const local = apply(inv, [x + 0.5, y + 0.5]);
        const sx = local[0] + org[0] - 0.5;
        const sy = local[1] + org[1] - 0.5;
        if (sx < -1 || sy < -1 || sx > sw || sy > sh) continue;
        const c = bilinear(src, sx, sy);
        if (c[3] < 0.02) continue;
        big.blend(x, y, c);
        if (c[3] > 0.5) owner[y * big.w + x] = index;
      }
    }
  }
  function bilinear(src, sx, sy) {
    const fx = Math.floor(sx);
    const fy = Math.floor(sy);
    const tx = sx - fx;
    const ty = sy - fy;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let oy = 0; oy < 2; oy++) {
      for (let ox = 0; ox < 2; ox++) {
        const px = fx + ox;
        const py = fy + oy;
        if (!src.inside(px, py)) continue;
        const s = src.get(px, py);
        const w = (ox === 1 ? tx : 1 - tx) * (oy === 1 ? ty : 1 - ty);
        r += s[0] * s[3] * w;
        g += s[1] * s[3] * w;
        b += s[2] * s[3] * w;
        a += s[3] * w;
      }
    }
    if (a > 1e-3) return [r / a, g / a, b / a, a];
    return [0, 0, 0, 0];
  }
  function grade(big, owner, parts, w1x, h1x, cfg) {
    const out = new Img(w1x, h1x);
    for (let cy = 0; cy < h1x; cy++) {
      for (let cx = 0; cx < w1x; cx++) {
        let aSum = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        const votes = /* @__PURE__ */ new Map();
        const hot = /* @__PURE__ */ new Map();
        for (let oy = 0; oy < SS; oy++) {
          for (let ox = 0; ox < SS; ox++) {
            const x = cx * SS + ox;
            const y = cy * SS + oy;
            const c = big.get(x, y);
            aSum += c[3];
            r += c[0] * c[3];
            g += c[1] * c[3];
            b += c[2] * c[3];
            const id = owner[y * big.w + x];
            if (id >= 0) {
              votes.set(id, (votes.get(id) ?? 0) + 1);
              for (let e = 0; e < cfg.emissiveLone.length; e++) {
                if (sameColor(c, cfg.emissiveLone[e])) hot.set(e, (hot.get(e) ?? 0) + 1);
              }
            }
          }
        }
        if (aSum / (SS * SS) < COVER || votes.size === 0) continue;
        let hotBest = -1;
        let hotN = 0;
        for (const [e, n] of hot) {
          if (n > hotN) {
            hotN = n;
            hotBest = e;
          }
        }
        if (hotBest >= 0 && hotN >= 4) {
          out.set(cx, cy, cfg.emissiveLone[hotBest]);
          continue;
        }
        let best = -1;
        let bestN = 0;
        for (const [id, n] of votes) {
          if (n > bestN) {
            bestN = n;
            best = id;
          }
        }
        const mean = [r / aSum, g / aSum, b / aSum, 1];
        out.set(cx, cy, quantize(mean, parts[best].ramp));
      }
    }
    despeckle(out, cfg.emissiveLone);
    return out;
  }
  function quantize(c, ramp) {
    let best = ramp[0];
    let bestD = Infinity;
    for (const rc of ramp) {
      const dr = c[0] - rc[0];
      const dg = c[1] - rc[1];
      const db = c[2] - rc[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        best = rc;
      }
    }
    return best;
  }
  function despeckle(img, keep) {
    for (let pass = 0; pass < 3; pass++) {
      let changed2 = false;
      for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) {
          const c = img.get(x, y);
          if (c[3] < 0.5) continue;
          if (keep.some((k) => sameColor(c, k))) continue;
          const votes = [];
          let same = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (!img.inside(nx, ny)) continue;
              const n = img.get(nx, ny);
              if (n[3] < 0.5) continue;
              if (sameColor(n, c)) {
                same = true;
              } else if (Math.abs(dx) + Math.abs(dy) === 1) {
                const found = votes.find((v) => sameColor(v.c, n));
                if (found) found.n++;
                else votes.push({ c: n, n: 1 });
              }
            }
          }
          if (same) continue;
          let best = null;
          let bestN = 0;
          for (const v of votes) {
            if (v.n > bestN) {
              bestN = v.n;
              best = v.c;
            }
          }
          img.set(x, y, best ?? [0, 0, 0, 0]);
          changed2 = true;
        }
      }
      if (!changed2) break;
    }
  }
  function outline(img, ink) {
    const edge = /* @__PURE__ */ new Set();
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        if (img.alpha(x, y) < 0.5) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (img.inside(nx, ny) && img.alpha(nx, ny) < 0.5) edge.add(ny * img.w + nx);
        }
      }
    }
    for (const i of edge) img.set(i % img.w, Math.floor(i / img.w), ink);
  }

  // ../src/spec.ts
  function colorKey(c) {
    const b = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
    return b(c[0]) + b(c[1]) + b(c[2]);
  }
  function vocabulary(spec) {
    const vocab = /* @__PURE__ */ new Set();
    vocab.add(colorKey(spec.grade.ink));
    for (const c of spec.grade.emissiveLone) vocab.add(colorKey(c));
    for (const part of spec.parts) {
      for (const c of part.ramp) vocab.add(colorKey(c));
    }
    return vocab;
  }
  function bakeClip(spec, name) {
    const clip = spec.clips.get(name);
    if (clip === void 0) {
      throw new Error(`bake: character has no clip '${name}'`);
    }
    if (clip.mirrorOf !== "") {
      const src = bakeClip(spec, clip.mirrorOf);
      return {
        name,
        frames: src.frames.map((f) => f.flippedX()),
        fps: clip.bakeFps,
        loop: clip.loop
      };
    }
    const frames = bake(
      spec.skeleton,
      spec.parts,
      clip,
      spec.canvasW,
      spec.canvasH,
      spec.grade,
      spec.shadow
    );
    return { name, frames, fps: clip.bakeFps, loop: clip.loop };
  }
  function bakeAllClips(spec) {
    const out = /* @__PURE__ */ new Map();
    for (const name of spec.clips.keys()) out.set(name, bakeClip(spec, name));
    return out;
  }

  // ../src/player.ts
  var ClipPlayer = class {
    clip;
    accum = 0;
    /** Current frame index into `clip.frames`. */
    frame = 0;
    playing = true;
    constructor(clip) {
      this.clip = clip;
    }
    /** Swap the playing clip; restarts at frame 0. */
    set(clip) {
      this.clip = clip;
      this.frame = 0;
      this.accum = 0;
    }
    current() {
      return this.clip;
    }
    /** Advance by `dt` seconds; returns the (possibly new) frame index. A
     * non-looping clip holds on its last frame. */
    advance(dt) {
      if (!this.playing || this.clip.frames.length === 0) return this.frame;
      this.accum += dt;
      const spf = 1 / this.clip.fps;
      while (this.accum >= spf) {
        this.accum -= spf;
        if (this.frame + 1 < this.clip.frames.length) {
          this.frame += 1;
        } else if (this.clip.loop) {
          this.frame = 0;
        } else {
          this.accum = 0;
        }
      }
      return this.frame;
    }
  };

  // ../src/metrics.ts
  var OPAQUE = 0.5;
  function islands(img) {
    const { w, h } = img;
    const seen = new Uint8Array(w * h);
    let count = 0;
    const stack = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (seen[i] === 1 || img.alpha(x, y) <= OPAQUE) continue;
        count++;
        seen[i] = 1;
        stack.push(i);
        while (stack.length > 0) {
          const p = stack.pop();
          const px = p % w;
          const py = Math.floor(p / w);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const n = ny * w + nx;
            if (seen[n] === 1 || img.alpha(nx, ny) <= OPAQUE) continue;
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    return count;
  }
  function pocketPx(img) {
    const { w, h } = img;
    const outside = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (outside[i] === 1 || img.alpha(x, y) !== 0) return;
      outside[i] = 1;
      stack.push(i);
    };
    for (let x = 0; x < w; x++) {
      push(x, 0);
      push(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      push(0, y);
      push(w - 1, y);
    }
    while (stack.length > 0) {
      const p = stack.pop();
      const px = p % w;
      const py = Math.floor(p / w);
      push(px + 1, py);
      push(px - 1, py);
      push(px, py + 1);
      push(px, py - 1);
    }
    let sealed = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (img.alpha(x, y) === 0 && outside[y * w + x] === 0) sealed++;
      }
    }
    return sealed;
  }
  function stats(img, ink) {
    const { w, h } = img;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    let count = 0;
    let inkN = 0;
    let sumX = 0;
    const colors = /* @__PURE__ */ new Set();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = img.get(x, y);
        if (c[3] <= OPAQUE) continue;
        count++;
        sumX += x;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
        colors.add(colorKey(c));
        if (sameColor(c, ink)) inkN++;
      }
    }
    return {
      px: count,
      ink: inkN,
      bbox: x1 >= 0 ? { x0, y0, x1, y1 } : null,
      head: x1 >= 0 ? y0 : -1,
      feet: y1,
      cx: count > 0 ? sumX / count : 0,
      colors,
      islands: islands(img)
    };
  }
  function changed(a, b) {
    let n = 0;
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        const ca = a.get(x, y);
        const cb = b.get(x, y);
        if (!sameColor(ca, cb) || Math.abs(ca[3] - cb[3]) >= 1e-4) n++;
      }
    }
    return n;
  }
  function edgeFill(img, ink) {
    const { w, h } = img;
    const isFill = (x, y) => {
      const c = img.get(x, y);
      return c[3] > OPAQUE && !sameColor(c, ink);
    };
    const out = { top: 0, left: 0, right: 0 };
    for (let x = 0; x < w; x++) if (isFill(x, 0)) out.top++;
    for (let y = 0; y < h; y++) {
      if (isFill(0, y)) out.left++;
      if (isFill(w - 1, y)) out.right++;
    }
    return out;
  }
  function specklePx(img, ink, allowed = []) {
    const { w, h } = img;
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = img.get(x, y);
        if (c[3] <= OPAQUE || sameColor(c, ink)) continue;
        let lone = true;
        for (let dy = -1; dy <= 1 && lone; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (!img.inside(nx, ny)) continue;
            if (sameColor(img.get(nx, ny), c)) {
              lone = false;
              break;
            }
          }
        }
        if (!lone) continue;
        if (!allowed.some((a) => sameColor(c, a))) n++;
      }
    }
    return n;
  }
  function offVocabPx(img, vocab) {
    let n = 0;
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const c = img.get(x, y);
        if (c[3] <= OPAQUE) continue;
        if (!vocab.has(colorKey(c))) n++;
      }
    }
    return n;
  }
  function cxWobble(cxs) {
    if (cxs.length === 0) return 0;
    const mean = cxs.reduce((a, b) => a + b, 0) / cxs.length;
    return cxs.reduce((worst, v) => Math.max(worst, Math.abs(v - mean)), 0);
  }

  // ../src/audit.ts
  function auditClip(spec, baked2) {
    const clip = spec.clips.get(baked2.name);
    if (clip === void 0) {
      throw new Error(`audit: character has no clip '${baked2.name}'`);
    }
    const src = clip.mirrorOf !== "" ? spec.clips.get(clip.mirrorOf) : clip;
    const checks = [];
    const add2 = (id, ok, pass, fail) => {
      checks.push({ id, ok, text: ok ? pass : fail });
    };
    const frames = baked2.frames;
    const vocab = vocabulary(spec);
    const ink = spec.grade.ink;
    const lone = spec.grade.emissiveLone;
    const cxs = [];
    let multi = 0;
    let edgeBad = 0;
    let speckles = 0;
    let offRamp = 0;
    let footSunk = 0;
    let grounded = 0;
    const deltas = [];
    for (let f = 0; f < frames.length; f++) {
      const img = frames[f];
      const s = stats(img, ink);
      cxs.push(s.cx);
      if (s.islands !== 1) multi++;
      const e = edgeFill(img, ink);
      if (e.top + e.left + e.right > 0) edgeBad++;
      speckles += specklePx(img, ink, lone);
      offRamp += offVocabPx(img, vocab);
      const feetD = s.feet - spec.groundRow;
      if (feetD > 1) footSunk++;
      if (Math.abs(feetD) <= 1) grounded++;
      if (f > 0) deltas.push(changed(img, frames[f - 1]));
    }
    if (frames.length > 1) {
      const minDelta = Math.min(...deltas);
      add2(
        "distinct",
        minDelta > 0,
        `every frame differs from its predecessor (min ${minDelta} px)`,
        "a frame is identical to the one before it \u2014 a channel resolved to all zeros"
      );
      if (src.loop) {
        const wrap = changed(frames[0], frames[frames.length - 1]);
        const mean = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
        add2(
          "wrap",
          wrap <= Math.max(6, Math.round(mean * 2)),
          `loop wrap ${wrap} px within 2x of the mean inter-frame delta (${mean.toFixed(1)})`,
          `loop wrap ${wrap} px vs mean delta ${mean.toFixed(1)} \u2014 the cycle pops on repeat`
        );
      }
    }
    add2(
      "islands",
      multi === 0,
      "the silhouette is one connected mass in every frame",
      `${multi} frame(s) have a detached piece`
    );
    const wobble = cxWobble(cxs);
    add2(
      "in-place",
      wobble <= src.wobbleBudget,
      `centroid wobble ${wobble.toFixed(2)} px within budget ${src.wobbleBudget.toFixed(1)}`,
      `centroid wobbles ${wobble.toFixed(2)} px around the cycle mean (budget ${src.wobbleBudget.toFixed(1)}) \u2014 the cycle walks itself sideways`
    );
    if (src.airborne) {
      add2(
        "baseline",
        footSunk === 0 && grounded > 0,
        `airborne: no frame sinks below the baseline, ${grounded} frame(s) grounded`,
        footSunk > 0 ? `${footSunk} frame(s) sink below the ground row` : "no frame touches the ground \u2014 the clip floats"
      );
    } else {
      add2(
        "baseline",
        footSunk === 0 && grounded === frames.length,
        "feet stay within 1 px of the ground row in every frame",
        `feet leave the ground row on ${Math.max(footSunk, frames.length - grounded)} frame(s)`
      );
    }
    add2(
      "edge",
      edgeBad === 0,
      "no fill pixel on the top/left/right canvas boundary",
      `fill on the canvas boundary in ${edgeBad} frame(s) \u2014 the shape reads as cropped`
    );
    add2(
      "speckle",
      speckles === 0,
      "no lone pixel survived the grade",
      `${speckles} lone pixel(s) survived the grade`
    );
    add2(
      "ramp",
      offRamp === 0,
      "every colour is in the declared vocabulary",
      `${offRamp} pixel(s) outside the declared vocabulary`
    );
    const info = [];
    let pocketFrames = 0;
    let pocketMax = 0;
    for (const img of frames) {
      const p = pocketPx(img);
      if (p > 0) {
        pocketFrames++;
        pocketMax = Math.max(pocketMax, p);
      }
    }
    info.push(
      `enclosed bare-canvas pockets: ${pocketFrames} frame(s), largest ${pocketMax} px`
    );
    return {
      clip: baked2.name,
      frames: frames.length,
      checks,
      failed: checks.filter((c) => !c.ok).length,
      info
    };
  }
  function auditCharacter(spec) {
    const reports = [];
    for (const baked2 of bakeAllClips(spec).values()) {
      reports.push(auditClip(spec, baked2));
    }
    return reports;
  }

  // ../src/review.ts
  var BG = rgb(0.07, 0.06, 0.16);
  var SIL_FILL = rgb(0.9, 0.93, 1);
  var SIL_BG = rgb(0.1, 0.09, 0.2);
  function rgb(r, g, b) {
    return [r, g, b, 1];
  }

  // scout.ts
  var CANVAS_W = 64;
  var CANVAS_H = 80;
  var GROUND_Y = 296;
  var GROUND_ROW = 75;
  var DUSK = {
    suitLight: hex("7b90a8"),
    suit: hex("4e5f78"),
    suitDark: hex("313d52"),
    scarfLight: hex("ffc95e"),
    scarf: hex("f29a3a"),
    scarfDark: hex("b96a26")
  };
  var EMBER = {
    suitLight: hex("a8837b"),
    suit: hex("784e4e"),
    suitDark: hex("4a2f31"),
    scarfLight: hex("9be9ff"),
    scarf: hex("4fc3e8"),
    scarfDark: hex("2a7fa8")
  };
  var INK = hex("151221");
  var SKIN = hex("e8b48c");
  var SKIN_SHADE = hex("c08b62");
  var BOOT_LIGHT = hex("8a6f52");
  var BOOT = hex("63503c");
  var BOOT_DARK = hex("443528");
  var EYE = hex("59f2e0");
  var EYE_CORE = hex("eafffb");
  var SHADOW = [0.03, 0.02, 0.1, 0.45];
  var DEFAULT_DIALS = { stride: 88, runWind: -2200 };
  function buildCharacter(theme2 = DUSK, dials2 = DEFAULT_DIALS) {
    const S = new Skeleton();
    S.rootPos = [128, 222];
    S.bone("pelvis", "", [0, 0], 0, 0);
    S.bone("thigh_near", "pelvis", [9, 2], 0, 40);
    S.bone("shin_near", "thigh_near", S.tip(), 0, 40);
    S.bone("foot_near", "shin_near", S.tip(), 90, 13);
    S.bone("thigh_far", "pelvis", [-9, 4], 0, 40);
    S.bone("shin_far", "thigh_far", S.tip(), 0, 40);
    S.bone("foot_far", "shin_far", S.tip(), 90, 13);
    S.bone("spine", "pelvis", [0, -2], 172, 44);
    S.bone("chest", "spine", S.tip(), 0, 36);
    S.bone("head", "chest", S.tip(), 6, 44);
    S.bone("upper_arm_near", "chest", [-3, 32], 186, 30);
    S.bone("forearm_near", "upper_arm_near", S.tip(), -8, 26);
    S.bone("upper_arm_far", "chest", [3, 30], 190, 30);
    S.bone("forearm_far", "upper_arm_far", S.tip(), -6, 26);
    S.chain("scarf", "chest", [7, 26], 7, 11, [-850, 0], 3e3, 0.975, 0.15, 0.22, [0.45, -1]);
    const suit = [theme2.suitLight, theme2.suit, theme2.suitDark];
    const boots = [BOOT_LIGHT, BOOT, BOOT_DARK];
    const scarfRamp = [theme2.scarfLight, theme2.scarf, theme2.scarfDark];
    const parts = [
      {
        name: "scarf",
        chain: "scarf",
        ramp: scarfRamp,
        painter: (p, pts) => {
          p.ribbon(pts, 7, 2.8, theme2.scarf);
          p.tintToward([-0.4, -1], theme2.scarfLight, 2.2);
          p.tintToward([0.4, 1], theme2.scarfDark, 2.2);
        }
      },
      { name: "upper_arm_far", bone: "upper_arm_far", ramp: suit, paint: upperArm(theme2, true) },
      { name: "forearm_far", bone: "forearm_far", ramp: [...suit, SKIN, SKIN_SHADE], paint: forearm(theme2, true) },
      { name: "thigh_far", bone: "thigh_far", ramp: suit, paint: thigh(theme2, true) },
      { name: "shin_far", bone: "shin_far", ramp: [...suit, ...boots], paint: shin(theme2, true) },
      { name: "foot_far", bone: "foot_far", ramp: boots, paint: foot(true) },
      { name: "torso", bone: "spine", ramp: [...suit, BOOT_DARK], paint: torso(theme2) },
      { name: "chest", bone: "chest", ramp: suit, paint: chest(theme2) },
      { name: "head", bone: "head", ramp: [...suit, SKIN, SKIN_SHADE, EYE, EYE_CORE], paint: head(theme2) },
      { name: "thigh_near", bone: "thigh_near", ramp: suit, paint: thigh(theme2, false) },
      { name: "shin_near", bone: "shin_near", ramp: [...suit, ...boots], paint: shin(theme2, false) },
      { name: "foot_near", bone: "foot_near", ramp: boots, paint: foot(false) },
      { name: "upper_arm_near", bone: "upper_arm_near", ramp: suit, paint: upperArm(theme2, false) },
      { name: "forearm_near", bone: "forearm_near", ramp: [...suit, SKIN, SKIN_SHADE], paint: forearm(theme2, false) }
    ];
    const clips = /* @__PURE__ */ new Map();
    clips.set("idle", idle(dials2));
    clips.set("run", run(dials2));
    clips.set("jump", jump(dials2));
    clips.set("run_west", Motion.mirror("run_west", "run", clips.get("run")));
    const restPose = () => {
      const pose = { deg: {} };
      S.solveChain(pose, "thigh_near", "shin_near", [140, GROUND_Y], 1, "foot_near", 90);
      S.solveChain(pose, "thigh_far", "shin_far", [116, GROUND_Y], 1, "foot_far", 88);
      return pose;
    };
    return {
      canvasW: CANVAS_W,
      canvasH: CANVAS_H,
      groundRow: GROUND_ROW,
      skeleton: S,
      parts,
      clips,
      grade: { ink: INK, shadow: SHADOW, emissiveLone: [EYE, EYE_CORE] },
      shadow: { x: 32, y: 78, rx: 13, ry: 2 },
      restPose
    };
  }
  function thigh(theme2, far) {
    const p = new Paint({ x: -14, y: -6, w: 28, h: 52 });
    p.capsule([0, 2], [0, 40], 10, 8, far ? theme2.suitDark : theme2.suit);
    if (!far) {
      p.tintToward([-1, -0.4], theme2.suitLight, 3.5);
      p.tintToward([1, 0.4], theme2.suitDark, 3);
    }
    p.occludeAbove(6, 8, 0.25);
    return p;
  }
  function shin(theme2, far) {
    const p = new Paint({ x: -12, y: -4, w: 24, h: 50 });
    p.capsule([0, 0], [0, 26], 8, 6.5, far ? theme2.suitDark : theme2.suit);
    p.capsule([0, 24], [0, 40], 7, 6, far ? BOOT_DARK : BOOT);
    if (!far) {
      p.tintToward([-1, -0.4], theme2.suitLight, 2.5);
      p.tintToward([1, 0.5], theme2.suitDark, 2.5);
    }
    return p;
  }
  function foot(far) {
    const p = new Paint({ x: -12, y: -8, w: 24, h: 28 });
    p.capsule([2, -2], [0, 11], 6, 4.5, far ? BOOT_DARK : BOOT);
    if (!far) p.tintToward([1, -0.3], BOOT_LIGHT, 2);
    return p;
  }
  function torso(theme2) {
    const p = new Paint({ x: -20, y: -8, w: 40, h: 58 });
    p.capsule([0, 4], [0, 42], 11.5, 13, theme2.suit);
    p.capsule([-10, 9], [10, 9], 3.5, 3.5, BOOT_DARK);
    p.tintToward([0.8, 0.5], theme2.suitLight, 3);
    p.tintToward([-0.7, -0.5], theme2.suitDark, 3);
    return p;
  }
  function chest(theme2) {
    const p = new Paint({ x: -20, y: -6, w: 40, h: 48 });
    p.capsule([0, 0], [0, 34], 13, 10.5, theme2.suit);
    p.tintToward([0.7, 0.7], theme2.suitLight, 4);
    p.tintToward([-0.5, -0.8], theme2.suitDark, 3.5);
    p.occludeAbove(4, 8, 0.2);
    return p;
  }
  function head(theme2) {
    const p = new Paint({ x: -26, y: -4, w: 52, h: 52 });
    p.disc([1, 25], 19, theme2.suit);
    p.disc([-9, 24], 11, SKIN);
    p.tintToward([-0.9, -0.4], SKIN_SHADE, 2.5);
    p.disc([-12, 27], 2.8, EYE);
    p.disc([-13, 28], 1.2, EYE_CORE);
    p.tintToward([0.6, 0.8], theme2.suitLight, 3.5);
    p.tintToward([0, -1], theme2.suitDark, 2.5);
    return p;
  }
  function upperArm(theme2, far) {
    const p = new Paint({ x: -11, y: -6, w: 22, h: 42 });
    p.capsule([0, 0], [0, 30], 7, 6, far ? theme2.suitDark : theme2.suit);
    if (!far) p.tintToward([-1, -0.3], theme2.suitLight, 2.5);
    p.occludeAbove(4, 7, 0.25);
    return p;
  }
  function forearm(theme2, far) {
    const p = new Paint({ x: -10, y: -4, w: 20, h: 40 });
    p.capsule([0, 0], [0, 24], 6, 5, far ? theme2.suitDark : theme2.suit);
    p.disc([0, 27], 5, far ? SKIN_SHADE : SKIN);
    if (!far) p.tintToward([-1, -0.3], theme2.suitLight, 2);
    return p;
  }
  function idle(dials2) {
    const c = new Motion("idle", 1.6);
    c.bakeFps = 12;
    c.wind = [-150 + dials2.runWind * 0.4, 0];
    c.plant("thigh_near", "shin_near", "foot_near", { 0: [140, GROUND_Y, 90] });
    c.plant("thigh_far", "shin_far", "foot_far", { 0: [116, GROUND_Y, 88] });
    c.key("root_y", { 0: 1, 0.8: -2 });
    c.key("spine", { 0: -2, 0.8: 1 });
    c.key("chest", { 0: 2, 0.8: -1 });
    c.key("head", { 0.2: 1.5, 1: -2 });
    c.key("upper_arm_near", { 0: 2, 0.8: -2 });
    c.key("forearm_near", { 0: -4, 0.8: 2 });
    c.key("upper_arm_far", { 0: -2, 0.8: 2 });
    c.key("forearm_far", { 0: 2, 0.8: -3 });
    return c;
  }
  function run(dials2) {
    const c = new Motion("run", 0.6);
    c.bakeFps = 15;
    c.wind = [dials2.runWind, 0];
    c.airborne = true;
    c.gait("thigh_near", "shin_near", "foot_near", dials2.stride, 40, 0, GROUND_Y, 6, 0.4);
    c.gait("thigh_far", "shin_far", "foot_far", dials2.stride, 40, 0.5, GROUND_Y, -6, 0.4);
    c.key("root_y", { 0.05: 4, 0.2: -7, 0.35: 4, 0.5: -7 });
    c.key("spine", { 0: -14, 0.15: -17, 0.3: -14, 0.45: -17 });
    c.key("head", { 0: 3, 0.15: 5, 0.3: 3, 0.45: 5 });
    c.key("upper_arm_near", { 0: -32, 0.24: 32 });
    c.key("forearm_near", { 0: 55, 0.24: 78 });
    c.key("upper_arm_far", { 0: 32, 0.24: -32 });
    c.key("forearm_far", { 0: 78, 0.24: 55 });
    return c;
  }
  function jump(dials2) {
    const c = new Motion("jump", 1.2);
    c.bakeFps = 15;
    c.wind = [-400 + dials2.runWind * 0.5, 0];
    c.airborne = true;
    c.key("root_y", {
      0: 0,
      0.15: 14,
      0.3: -34,
      0.45: -46,
      0.6: -20,
      0.72: 10,
      0.9: 2,
      1.05: 0
    });
    c.plant("thigh_near", "shin_near", "foot_near", {
      0: [140, GROUND_Y, 90],
      0.15: [140, 296, 70],
      0.3: [136, 250, 55],
      0.45: [138, 236, 50],
      0.6: [142, 262, 70],
      0.72: [140, 296, 90],
      0.9: [140, GROUND_Y, 90]
    });
    c.plant("thigh_far", "shin_far", "foot_far", {
      0: [116, GROUND_Y, 88],
      0.15: [116, 296, 70],
      0.3: [114, 252, 55],
      0.45: [110, 240, 50],
      0.6: [112, 264, 70],
      0.72: [116, 296, 88],
      0.9: [116, GROUND_Y, 88]
    });
    c.key("spine", { 0: 0, 0.15: -10, 0.3: 6, 0.45: 4, 0.6: -4, 0.72: -8, 0.9: 0 });
    c.key("head", { 0: 0, 0.15: 6, 0.3: -4, 0.6: 2, 0.72: 5, 0.9: 0 });
    c.key("upper_arm_near", { 0: 5, 0.15: -35, 0.3: 55, 0.45: 80, 0.6: 40, 0.72: -10, 0.9: 5 });
    c.key("forearm_near", { 0: 10, 0.15: 25, 0.3: 45, 0.45: 40, 0.6: 28, 0.72: 15, 0.9: 10 });
    c.key("upper_arm_far", { 0: -5, 0.15: -42, 0.3: 40, 0.45: 62, 0.6: 28, 0.72: -15, 0.9: -5 });
    c.key("forearm_far", { 0: 10, 0.15: 20, 0.3: 40, 0.45: 35, 0.6: 22, 0.72: 10, 0.9: 10 });
    return c;
  }

  // main.ts
  var SCALE = 5;
  var character = buildCharacter();
  var theme = DUSK;
  var dials = { ...DEFAULT_DIALS };
  var baked = /* @__PURE__ */ new Map();
  var player = new ClipPlayer(getBaked("run"));
  var current = "run";
  var showBones = false;
  var lastTick = 0;
  function getBaked(name) {
    const cached = baked.get(name);
    if (cached) return cached;
    const t0 = performance.now();
    const clip = bakeClip(character, name);
    const entry = { ...clip, bakeMs: performance.now() - t0 };
    baked.set(name, entry);
    return entry;
  }
  function rebuild() {
    character = buildCharacter(theme, dials);
    baked.clear();
    player.set(getBaked(current));
    renderStrip();
    updateStatus();
  }
  function drawImg(ctx, img, scale) {
    const off = new OffscreenCanvas(img.w, img.h);
    const octx = off.getContext("2d");
    octx.putImageData(new ImageData(img.toRGBA8(), img.w, img.h), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, img.w * scale, img.h * scale);
  }
  function drawBones(ctx) {
    const clip = character.clips.get(current);
    const src = clip.mirrorOf !== "" ? character.clips.get(clip.mirrorOf) : clip;
    const pose = src.poseAt(player.frame / src.bakeFps, character.skeleton);
    const xfs = character.skeleton.transforms(pose);
    const k = SCALE / SS;
    const flip = clip.mirrorOf !== "";
    const fx = (x) => flip ? CANVAS_W * SCALE - x * k : x * k;
    ctx.strokeStyle = "rgba(120, 255, 200, 0.9)";
    ctx.fillStyle = "rgba(120, 255, 200, 0.9)";
    ctx.lineWidth = 1;
    for (const name of character.skeleton.names()) {
      const xf = xfs.get(name);
      const tipLen = character.skeleton.lengthOf(name);
      const tipX = xf.c * tipLen + xf.tx;
      const tipY = xf.d * tipLen + xf.ty;
      ctx.beginPath();
      ctx.moveTo(fx(xf.tx), xf.ty * k);
      ctx.lineTo(fx(tipX), tipY * k);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(fx(xf.tx), xf.ty * k, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function renderFrame() {
    const canvas = document.getElementById("stage");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const entry = getBaked(current);
    drawImg(ctx, entry.frames[player.frame], SCALE);
    if (showBones) drawBones(ctx);
    const counter = document.getElementById("counter");
    counter.textContent = `${player.frame + 1} / ${entry.frames.length} @ ${entry.fps} fps`;
  }
  function renderStrip() {
    const entry = getBaked(current);
    const strip = document.getElementById("strip");
    const s = 2;
    strip.width = entry.frames.length * (CANVAS_W * s + 2);
    strip.height = CANVAS_H * s;
    const ctx = strip.getContext("2d");
    ctx.clearRect(0, 0, strip.width, strip.height);
    entry.frames.forEach((f, i) => {
      ctx.save();
      ctx.translate(i * (CANVAS_W * s + 2), 0);
      drawImg(ctx, f, s);
      ctx.restore();
    });
  }
  function updateStatus() {
    const entry = getBaked(current);
    document.getElementById("status").textContent = `baked ${entry.frames.length} frames in ${entry.bakeMs.toFixed(0)} ms \u2014 deterministic, no model call, no repair`;
  }
  function runAudit() {
    const out = document.getElementById("audit");
    const t0 = performance.now();
    const reports = auditCharacter(character);
    const ms = performance.now() - t0;
    const failed = reports.reduce((n, r) => n + r.failed, 0);
    const lines = reports.map(
      (r) => r.failed === 0 ? `ok    ${r.clip} (${r.frames} frames)` : r.checks.filter((c) => !c.ok).map((c) => `FAIL  ${r.clip}: ${c.id}: ${c.text}`).join("\n")
    );
    out.textContent = `audit: ${failed === 0 ? "all clean" : `${failed} check(s) FAILED`} in ${ms.toFixed(0)} ms
` + lines.join("\n");
  }
  function tick(now) {
    const prev = player.frame;
    player.advance((now - lastTick) / 1e3);
    if (player.frame !== prev || !player.playing) renderFrame();
    lastTick = now;
    requestAnimationFrame(tick);
  }
  function selectClip(name) {
    current = name;
    player.set(getBaked(name));
    for (const b of document.querySelectorAll("[data-clip]")) {
      b.classList.toggle("on", b.dataset.clip === name);
    }
    renderFrame();
    renderStrip();
    updateStatus();
  }
  function wire() {
    for (const b of document.querySelectorAll("[data-clip]")) {
      b.addEventListener("click", () => selectClip(b.dataset.clip));
    }
    const playBtn = document.getElementById("play");
    playBtn.addEventListener("click", () => {
      player.playing = !player.playing;
      playBtn.textContent = player.playing ? "Pause" : "Play";
    });
    const bonesBox = document.getElementById("bones");
    bonesBox.addEventListener("change", () => {
      showBones = bonesBox.checked;
      renderFrame();
    });
    const stride = document.getElementById("stride");
    stride.addEventListener("change", () => {
      dials.stride = Number(stride.value);
      document.getElementById("stride-out").textContent = stride.value;
      rebuild();
      renderFrame();
    });
    const wind = document.getElementById("wind");
    wind.addEventListener("change", () => {
      dials.runWind = -Number(wind.value);
      document.getElementById("wind-out").textContent = wind.value;
      rebuild();
      renderFrame();
    });
    const themeBtn = document.getElementById("theme");
    themeBtn.addEventListener("click", () => {
      theme = theme === DUSK ? EMBER : DUSK;
      themeBtn.textContent = theme === DUSK ? "Theme: dusk" : "Theme: ember";
      rebuild();
      renderFrame();
    });
    document.getElementById("run-audit").addEventListener("click", runAudit);
  }
  function start() {
    const stage = document.getElementById("stage");
    stage.width = CANVAS_W * SCALE;
    stage.height = CANVAS_H * SCALE;
    wire();
    selectClip(current);
    lastTick = performance.now();
    requestAnimationFrame(tick);
  }
  start();
})();
