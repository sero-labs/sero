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
    if (!/^[0-9a-fA-F]{6}$/.test(rgb2)) {
      throw new Error(`hex: '${rgb2}' is not a 6-digit hex colour`);
    }
    if (typeof alpha !== "number" || !(alpha >= 0 && alpha <= 1)) {
      throw new Error(
        `hex: alpha must be between 0 and 1, not ${alpha}. Writing '.map(hex)' passes the array index as the alpha \u2014 write .map((c) => hex(c)) instead.`
      );
    }
    const n = parseInt(rgb2, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, alpha];
  }
  function sameColor(a, b) {
    return Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4 && Math.abs(a[2] - b[2]) < 1e-4;
  }
  function darkened(c, amount) {
    return [c[0] * (1 - amount), c[1] * (1 - amount), c[2] * (1 - amount), c[3]];
  }
  var MAX_IMG_PIXELS = 1 << 24;
  var allocationBudget = Infinity;
  var allocatedPixels = 0;
  var Img = class _Img {
    w;
    h;
    data;
    constructor(w, h) {
      this.w = Math.max(1, Math.ceil(w));
      this.h = Math.max(1, Math.ceil(h));
      if (this.w * this.h > MAX_IMG_PIXELS) {
        throw new Error(
          `Img: refusing a ${this.w} x ${this.h} canvas \u2014 beyond any legitimate bake or review image.`
        );
      }
      allocatedPixels += this.w * this.h;
      if (allocatedPixels > allocationBudget) {
        throw new Error(
          "Img: the allocation budget for this bake is spent \u2014 far more canvas than any character needs. Paint each part once and let the engine own the frames."
        );
      }
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

  // ../src/guard.ts
  function fail(helper, problem, signature) {
    throw new Error(`${helper}: ${problem}. ${signature}`);
  }
  function describe(value) {
    if (Array.isArray(value)) return `an array of ${value.length}`;
    if (value === null) return "null";
    if (typeof value === "number" && !Number.isFinite(value)) return String(value);
    return typeof value;
  }
  function assertNumber(value, what, helper, signature) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(helper, `${what} must be a finite number, not ${describe(value)}`, signature);
    }
    return value;
  }
  function assertVec(value, what, helper, signature) {
    if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "number" || typeof value[1] !== "number" || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) {
      fail(helper, `${what} must be a point [x, y], not ${describe(value)}`, signature);
    }
    return value;
  }
  function assertColor(value, what, helper, signature) {
    if (!Array.isArray(value) || value.length !== 4 || value.some((c) => typeof c !== "number" || !Number.isFinite(c))) {
      fail(
        helper,
        `${what} must be a colour [r, g, b, a] from hex('4e5f78'), not ${describe(value)}`,
        signature
      );
    }
    return value;
  }
  function assertPoints(value, what, helper, signature) {
    if (!Array.isArray(value)) {
      fail(helper, `${what} must be an array of [x, y] points, not ${describe(value)}`, signature);
    }
    if (value.length < 2) {
      fail(helper, `${what} needs at least two points, got ${value.length}`, signature);
    }
    value.forEach((point, i) => assertVec(point, `${what}[${i}]`, helper, signature));
    return value;
  }
  function assertWidths(value, what, helper, signature) {
    if (typeof value === "number") {
      fail(
        helper,
        `${what} must be an ARRAY of half-widths, one per point \u2014 [${value}, ${value}] for a uniform line, not the bare number ${value}`,
        signature
      );
    }
    if (!Array.isArray(value) || value.length === 0) {
      fail(helper, `${what} must be a non-empty array of half-widths, not ${describe(value)}`, signature);
    }
    value.forEach((w, i) => assertNumber(w, `${what}[${i}]`, helper, signature));
    return value;
  }

  // ../src/paint.ts
  var SS_PER_PIXEL = 4;
  var SIG = {
    capsule: "capsule(p0, p1, r0, r1, colour) \u2014 two points, two half-widths, one colour.",
    disc: "disc(centre, r, colour).",
    polygon: "polygon(points, colour) \u2014 three or more points, one colour.",
    // Both name the chain-painter call order: passing the Paint where the points
    // belong is the mistake that once drew a whole part as nothing.
    stroke: "stroke(points, widths, colour) \u2014 points and a per-point width ARRAY. A chain painter is called as painter(paint, points): the canvas first, the simulated points second.",
    ribbon: "ribbon(points, w0, w1, colour) \u2014 points, then the two end half-widths. A chain painter is called as painter(paint, points): the canvas first, the simulated points second.",
    tintToward: "tintToward(dir, colour, depth) \u2014 a direction, a colour, a depth in px.",
    occludeAbove: "occludeAbove(atY, depth, amount) \u2014 three numbers; amount is 0..1, not a colour.",
    image: "image(src, at, scale?) \u2014 an Img of pixels, where its top-left goes in bone-local space, and whole supersampled px per source pixel (4 by default)."
  };
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
      assertVec(p0, "p0", "capsule", SIG.capsule);
      assertVec(p1, "p1", "capsule", SIG.capsule);
      assertNumber(r0, "r0", "capsule", SIG.capsule);
      assertNumber(r1, "r1", "capsule", SIG.capsule);
      assertColor(c, "colour", "capsule", SIG.capsule);
      this.fillCapsule(p0, p1, r0, r1, c);
    }
    /** The unchecked capsule the other helpers fill through, once their own
     * arguments are validated — guards belong at the author's call, not in an
     * inner loop. */
    fillCapsule(p0, p1, r0, r1, c) {
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
      assertVec(center, "centre", "disc", SIG.disc);
      assertNumber(r, "r", "disc", SIG.disc);
      assertColor(c, "colour", "disc", SIG.disc);
      this.fillCapsule(center, center, r, r, c);
    }
    /**
     * A filled polygon — the shape tool capsules cannot be: a helmet's flat
     * crown and angled brow, a shield's kite, a blade's taper. Even-odd fill of
     * the closed path through `points`; concave outlines and notches are fine.
     */
    polygon(points, c) {
      assertPoints(points, "points", "polygon", SIG.polygon);
      if (points.length < 3) {
        throw new Error(`polygon: needs at least three points, got ${points.length}. ${SIG.polygon}`);
      }
      assertColor(c, "colour", "polygon", SIG.polygon);
      const img = this.img;
      const xs = points.map((p) => p[0] + this.origin[0]);
      const ys = points.map((p) => p[1] + this.origin[1]);
      const y0 = Math.max(0, Math.floor(Math.min(...ys)));
      const y1 = Math.min(img.h - 1, Math.ceil(Math.max(...ys)));
      const n = points.length;
      const crossings = [];
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        crossings.length = 0;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          if (ys[i] > py !== ys[j] > py) {
            crossings.push(xs[i] + (py - ys[i]) / (ys[j] - ys[i]) * (xs[j] - xs[i]));
          }
        }
        crossings.sort((a, b) => a - b);
        for (let k = 0; k + 1 < crossings.length; k += 2) {
          const xa = Math.max(0, Math.round(crossings[k]));
          const xb = Math.min(img.w - 1, Math.round(crossings[k + 1]) - 1);
          for (let x = xa; x <= xb; x++) img.set(x, y, c);
        }
      }
    }
    /** Polyline stroke with a per-point half-width profile. */
    stroke(points, widths, c) {
      assertPoints(points, "points", "stroke", SIG.stroke);
      assertWidths(widths, "widths", "stroke", SIG.stroke);
      assertColor(c, "colour", "stroke", SIG.stroke);
      for (let i = 0; i < points.length - 1; i++) {
        const w0 = widths[Math.min(i, widths.length - 1)];
        const w1 = widths[Math.min(i + 1, widths.length - 1)];
        this.fillCapsule(points[i], points[i + 1], w0, w1, c);
      }
    }
    /** A stroke tapering linearly from w0 to w1 — the shape of a chain. */
    ribbon(points, w0, w1, c) {
      assertPoints(points, "points", "ribbon", SIG.ribbon);
      assertNumber(w0, "w0", "ribbon", SIG.ribbon);
      assertNumber(w1, "w1", "ribbon", SIG.ribbon);
      assertColor(c, "colour", "ribbon", SIG.ribbon);
      const n = points.length;
      for (let i = 0; i < n - 1; i++) {
        const t0 = i / (n - 1);
        const t1 = (i + 1) / (n - 1);
        this.fillCapsule(points[i], points[i + 1], lerp(w0, w1, t0), lerp(w0, w1, t1), c);
      }
    }
    /**
     * Recolor pixels within `depth` of the silhouette edge on the side the
     * shape faces `dir` — lit and shaded sides, or a rim at a shallow depth.
     */
    tintToward(dir, c, depth) {
      assertVec(dir, "dir", "tintToward", SIG.tintToward);
      assertColor(c, "colour", "tintToward", SIG.tintToward);
      assertNumber(depth, "depth", "tintToward", SIG.tintToward);
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
    /**
     * Stamp ready-made pixels into this part, `scale` supersampled px per source
     * pixel, with `at` naming where the source's TOP-LEFT sits in bone-local
     * space.
     *
     * The other helpers describe a shape and let the grade make the pixels. This
     * one carries pixels somebody else already decided — artwork cut from a
     * reference, a tile, a stamp — and it exists because describing a shape in
     * coordinates is a poor way to draw. A character can mix the two freely: a
     * bitmap torso under a procedural cloak is one parts list.
     *
     * Every colour stamped must be in the part's declared ramp, exactly as if it
     * had been painted; the ramp law does not bend for borrowed pixels, and the
     * 'ramp' audit will say so if it is broken. Fully transparent source pixels
     * are skipped, so a cut-out keeps its silhouette.
     */
    image(src, at, scale = SS_PER_PIXEL) {
      assertVec(at, "at", "image", SIG.image);
      assertNumber(scale, "scale", "image", SIG.image);
      if (!(src instanceof Img)) {
        throw new Error(`image: src must be an Img of pixels to stamp. ${SIG.image}`);
      }
      if (!Number.isInteger(scale) || scale < 1) {
        throw new Error(`image: scale must be a whole number of supersampled px per source pixel, not ${scale}. ${SIG.image}`);
      }
      const img = this.img;
      const ox = at[0] + this.origin[0];
      const oy = at[1] + this.origin[1];
      for (let sy = 0; sy < src.h; sy++) {
        for (let sx = 0; sx < src.w; sx++) {
          const c = src.get(sx, sy);
          if (c[3] < 0.5) continue;
          const x0 = Math.round(ox + sx * scale);
          const y0 = Math.round(oy + sy * scale);
          for (let dy = 0; dy < scale; dy++) {
            const y = y0 + dy;
            if (y < 0 || y >= img.h) continue;
            for (let dx = 0; dx < scale; dx++) {
              const x = x0 + dx;
              if (x < 0 || x >= img.w) continue;
              img.set(x, y, c);
            }
          }
        }
      }
    }
    /** Darken toward local y = atY on the joint side — sells the joint. */
    occludeAbove(atY, depth, amount) {
      assertNumber(atY, "atY", "occludeAbove", SIG.occludeAbove);
      assertNumber(depth, "depth", "occludeAbove", SIG.occludeAbove);
      assertNumber(amount, "amount", "occludeAbove", SIG.occludeAbove);
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
  function assertClipTiming(clip) {
    if (!Number.isFinite(clip.cycle) || clip.cycle <= 0) {
      throw new Error(`bake: clip '${clip.name}' needs a finite positive cycle, got ${clip.cycle}`);
    }
    if (!Number.isFinite(clip.bakeFps) || clip.bakeFps <= 0 || clip.bakeFps > SIM_FPS) {
      throw new Error(
        `bake: clip '${clip.name}' needs a bakeFps in (0, ${SIM_FPS}], got ${clip.bakeFps}`
      );
    }
  }
  function simulateChains(skel, clip, nFrames) {
    assertClipTiming(clip);
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
  function bake(skel, parts, clip, w1x, h1x, cfg, shadow, ss = SS) {
    assertClipTiming(clip);
    const n = Math.max(1, Math.round(clip.cycle * clip.bakeFps));
    const chainFrames = simulateChains(skel, clip, n);
    const out = [];
    for (let f = 0; f < n; f++) {
      const t = f / clip.bakeFps;
      const pose = clip.poseAt(t, skel);
      const chains = /* @__PURE__ */ new Map();
      for (const [name, frames] of chainFrames) chains.set(name, frames[f]);
      out.push(renderPose(skel, parts, pose, w1x, h1x, cfg, shadow, chains, clip.zOffsets(t), ss));
    }
    return out;
  }
  function renderPose(skel, parts, pose, w1x, h1x, cfg, shadow, chains = /* @__PURE__ */ new Map(), z = /* @__PURE__ */ new Map(), ss = SS) {
    if (!Number.isInteger(ss) || ss < 1 || ss > 16) {
      throw new Error(`compositor: superSample must be a whole number from 1 to 16, not ${ss}`);
    }
    const w = w1x * ss;
    const h = h1x * ss;
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
        splat(big, owner, i, chainPaint(part, pts), { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, false);
      } else {
        const xf = xfs.get(part.bone);
        if (xf === void 0) {
          throw new Error(`compositor: part '${part.name}' binds unknown bone '${part.bone}'`);
        }
        splat(big, owner, i, part.paint, xf, part.crisp === true);
      }
    }
    const body = grade(big, owner, parts, w1x, h1x, cfg, ss);
    if (cfg.outline !== false) outline(body, cfg.ink);
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
  function splat(big, owner, index, paint, xf, crisp) {
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
        const c = crisp ? nearest(src, sx, sy) : bilinear(src, sx, sy);
        if (c[3] < 0.02) continue;
        big.blend(x, y, c);
        if (c[3] > 0.5) owner[y * big.w + x] = index;
      }
    }
  }
  function nearest(src, sx, sy) {
    const x = Math.round(sx);
    const y = Math.round(sy);
    if (!src.inside(x, y)) return [0, 0, 0, 0];
    return src.get(x, y);
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
  function grade(big, owner, parts, w1x, h1x, cfg, ss) {
    const out = new Img(w1x, h1x);
    for (let cy = 0; cy < h1x; cy++) {
      for (let cx = 0; cx < w1x; cx++) {
        let aSum = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        const votes = /* @__PURE__ */ new Map();
        const hot = /* @__PURE__ */ new Map();
        for (let oy = 0; oy < ss; oy++) {
          for (let ox = 0; ox < ss; ox++) {
            const x = cx * ss + ox;
            const y = cy * ss + oy;
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
        if (aSum / (ss * ss) < COVER || votes.size === 0) continue;
        let hotBest = -1;
        let hotN = 0;
        for (const [e, n] of hot) {
          if (n > hotN) {
            hotN = n;
            hotBest = e;
          }
        }
        if (hotBest >= 0 && hotN >= Math.max(1, Math.round(ss * ss / 4))) {
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
        const winner = parts[best];
        if ("crisp" in winner && winner.crisp === true) {
          out.set(cx, cy, modal(big, owner, best, cx, cy, ss));
          continue;
        }
        const mean = [r / aSum, g / aSum, b / aSum, 1];
        out.set(cx, cy, quantize(mean, winner.ramp));
      }
    }
    if (cfg.despeckle !== false) despeckle(out, cfg.emissiveLone);
    return out;
  }
  function modal(big, owner, part, cx, cy, ss) {
    const seen = [];
    for (let oy = 0; oy < ss; oy++) {
      for (let ox = 0; ox < ss; ox++) {
        const x = cx * ss + ox;
        const y = cy * ss + oy;
        if (owner[y * big.w + x] !== part) continue;
        const c = big.get(x, y);
        const found = seen.find((entry) => sameColor(entry.c, c));
        if (found === void 0) seen.push({ c, n: 1 });
        else found.n++;
      }
    }
    let best = seen[0]?.c ?? [0, 0, 0, 1];
    let bestN = 0;
    for (const entry of seen) {
      if (entry.n > bestN) {
        bestN = entry.n;
        best = entry.c;
      }
    }
    return [best[0], best[1], best[2], 1];
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
  var GRADE_SIG = "grade: { ink, shadow, emissiveLone } \u2014 two colours from hex() and an array of colours.";
  var SHADOW_SIG = "shadow: { x, y, rx, ry } \u2014 the ground ellipse, in 1x canvas pixels.";
  function assertGradeAndShadow(grade2, shadow) {
    assertColor(grade2?.ink, "grade.ink", "character", GRADE_SIG);
    assertColor(grade2.shadow, "grade.shadow", "character", GRADE_SIG);
    if (!Array.isArray(grade2.emissiveLone)) {
      throw new Error(`character: grade.emissiveLone must be an array (empty is fine). ${GRADE_SIG}`);
    }
    grade2.emissiveLone.forEach((c, i) => assertColor(c, `grade.emissiveLone[${i}]`, "character", GRADE_SIG));
    if (shadow === void 0) return;
    for (const field of ["x", "y", "rx", "ry"]) {
      assertNumber(shadow[field], `shadow.${field}`, "character", SHADOW_SIG);
    }
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
    assertClipTiming(clip);
    assertGradeAndShadow(spec.grade, spec.shadow);
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
      spec.shadow,
      spec.superSample
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
     * non-looping clip holds on its last frame. Arithmetic, not a drain loop:
     * a bad fps or dt skips the advance instead of spinning forever. */
    advance(dt) {
      const n = this.clip.frames.length;
      const spf = 1 / this.clip.fps;
      if (!this.playing || n === 0 || !(spf > 0) || !Number.isFinite(dt) || dt <= 0) {
        return this.frame;
      }
      this.accum += dt;
      const steps = Math.floor(this.accum / spf);
      if (steps <= 0) return this.frame;
      this.accum -= steps * spf;
      if (this.clip.loop) {
        this.frame = (this.frame + steps) % n;
      } else {
        this.frame = Math.min(this.frame + steps, n - 1);
        if (this.frame === n - 1) this.accum = 0;
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
  var DEFAULT_MIN_FILL = 0.75;
  function auditClip(spec, baked2) {
    const clip = spec.clips.get(baked2.name);
    if (clip === void 0) {
      throw new Error(`audit: character has no clip '${baked2.name}'`);
    }
    const src = clip.mirrorOf !== "" ? spec.clips.get(clip.mirrorOf) : clip;
    const checks = [];
    const add2 = (id, ok, pass, fail2) => {
      checks.push({ id, ok, text: ok ? pass : fail2 });
    };
    const frames = baked2.frames;
    if (frames.length === 0) {
      const check = { id: "valid", ok: false, text: "no frames baked" };
      return { clip: baked2.name, frames: 0, checks: [check], failed: 1, info: [] };
    }
    const offSize = frames.filter((f) => f.w !== spec.canvasW || f.h !== spec.canvasH).length;
    if (offSize > 0) {
      const check = {
        id: "valid",
        ok: false,
        text: `${offSize} frame(s) are not the declared ${spec.canvasW}x${spec.canvasH} canvas`
      };
      return { clip: baked2.name, frames: frames.length, checks: [check], failed: 1, info: [] };
    }
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
    let flying = 0;
    let tallest = 0;
    let widestAtTallest = 0;
    const feetRows = [];
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
      feetRows.push(s.feet);
      if (s.bbox !== null) {
        const height = s.bbox.y1 - s.bbox.y0 + 1;
        if (height > tallest) {
          tallest = height;
          widestAtTallest = s.bbox.x1 - s.bbox.x0 + 1;
        }
      }
      const feetD = s.feet - spec.groundRow;
      if (feetD > 1) footSunk++;
      if (Math.abs(feetD) <= 1) grounded++;
      if (feetD < -1) flying++;
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
        footSunk === 0 && grounded > 0 && flying > 0,
        `airborne: no sink, ${grounded} frame(s) grounded, ${flying} frame(s) in flight`,
        footSunk > 0 ? `${footSunk} frame(s) sink below the ground row (measured feet rows ${Math.min(...feetRows)}..${Math.max(...feetRows)}, ground row ${spec.groundRow})` : grounded === 0 ? `no frame touches the ground \u2014 the clip floats (measured feet rows ${Math.min(...feetRows)}..${Math.max(...feetRows)}, ground row ${spec.groundRow})` : "declared airborne but no frame ever leaves the ground"
      );
    } else {
      add2(
        "baseline",
        footSunk === 0 && grounded === frames.length,
        "feet stay within 1 px of the ground row in every frame",
        `feet leave the ground row on ${Math.max(footSunk, frames.length - grounded)} frame(s): measured feet rows ${Math.min(...feetRows)}..${Math.max(...feetRows)}, declared ground row ${spec.groundRow}`
      );
    }
    add2(
      "edge",
      edgeBad === 0,
      "no fill pixel on the top/left/right canvas boundary",
      `fill on the canvas boundary in ${edgeBad} frame(s) \u2014 the shape reads as cropped`
    );
    const minFill = spec.minFill ?? DEFAULT_MIN_FILL;
    const fill = tallest / spec.canvasH;
    add2(
      "fill",
      fill >= minFill,
      `the figure spans ${tallest} of ${spec.canvasH} rows (${(fill * 100).toFixed(0)}%, floor ${(minFill * 100).toFixed(0)}%)`,
      `the figure spans only ${tallest} of ${spec.canvasH} rows (${(fill * 100).toFixed(0)}%, floor ${(minFill * 100).toFixed(0)}%) \u2014 it is drawn too small to read. Move the root down, lengthen the bones and paint bigger; do not shrink the canvas`
    );
    add2(
      "speckle",
      spec.grade.despeckle === false || speckles === 0,
      spec.grade.despeckle === false ? `not checked: this character declares grade.despeckle false, so its ${speckles} lone pixel(s) are its own artwork` : "no lone pixel survived the grade",
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
    info.push(
      `silhouette at its tallest: ${widestAtTallest} x ${tallest} px (width ${(widestAtTallest / Math.max(1, tallest)).toFixed(2)} of height)`
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

  // knight.ts
  var CANVAS_W = 64;
  var CANVAS_H = 80;
  var GROUND_Y = 288;
  var GROUND_ROW = 74;
  var CRIMSON = {
    steelLight: hex("d8dbe2"),
    steel: hex("9298a6"),
    steelDark: hex("505666"),
    clothLight: hex("ed6a62"),
    cloth: hex("b93644"),
    clothDark: hex("6f2433")
  };
  var AZURE = {
    steelLight: hex("e0e4df"),
    steel: hex("99a6a1"),
    steelDark: hex("53615f"),
    clothLight: hex("71b9e8"),
    cloth: hex("397fb7"),
    clothDark: hex("234b78")
  };
  var INK = hex("171522");
  var MAIL_LIGHT = hex("aab0bc");
  var MAIL = hex("737b8a");
  var MAIL_DARK = hex("414754");
  var LEATHER = hex("684735");
  var LEATHER_DARK = hex("412d27");
  var BLADE_GLEAM = hex("f4f1d7");
  var SHADOW = [0.03, 0.02, 0.08, 0.45];
  var DEFAULT_DIALS = { stride: 52, swordArc: 105 };
  function buildCharacter(livery = CRIMSON, dials2 = DEFAULT_DIALS) {
    const S = new Skeleton();
    S.rootPos = [96, 196];
    S.bone("pelvis", "", [0, 0], 0, 0);
    S.bone("thigh_near", "pelvis", [9, 2], 0, 48);
    S.bone("shin_near", "thigh_near", S.tip(), 0, 48);
    S.bone("foot_near", "shin_near", S.tip(), 90, 15);
    S.bone("thigh_far", "pelvis", [-9, 4], 0, 48);
    S.bone("shin_far", "thigh_far", S.tip(), 0, 48);
    S.bone("foot_far", "shin_far", S.tip(), 90, 15);
    S.bone("spine", "pelvis", [0, -3], 178, 36);
    S.bone("chest", "spine", S.tip(), 0, 38);
    S.bone("head", "chest", S.tip(), 2, 48);
    S.bone("upper_arm_far", "chest", [18, 29], 180, 29);
    S.bone("forearm_far", "upper_arm_far", S.tip(), -8, 27);
    S.bone("upper_arm_near", "chest", [-20, 29], -160, 29);
    S.bone("forearm_near", "upper_arm_near", S.tip(), 40, 27);
    S.bone("sword", "forearm_near", S.tip(), 87, 72);
    const steel = [livery.steelLight, livery.steel, livery.steelDark];
    const mail = [MAIL_LIGHT, MAIL, MAIL_DARK];
    const cloth = [livery.clothLight, livery.cloth, livery.clothDark];
    const blade = [BLADE_GLEAM, livery.steelLight, livery.steel, livery.steelDark, LEATHER, LEATHER_DARK];
    const parts = [
      { name: "cape", bone: "spine", ramp: cloth, paint: cape(livery) },
      { name: "upper_arm_far", bone: "upper_arm_far", ramp: steel, paint: upperArm(livery, true) },
      { name: "forearm_far", bone: "forearm_far", ramp: [...steel, ...mail], paint: forearm(livery, true) },
      { name: "thigh_far", bone: "thigh_far", ramp: mail, paint: thigh(livery, true) },
      { name: "shin_far", bone: "shin_far", ramp: [...mail, ...steel], paint: shin(livery, true) },
      { name: "foot_far", bone: "foot_far", ramp: steel, paint: foot(livery, true) },
      { name: "torso", bone: "spine", ramp: [...mail, ...cloth, LEATHER, LEATHER_DARK], paint: torso(livery) },
      { name: "chest", bone: "chest", ramp: [...steel, ...cloth], paint: chest(livery) },
      { name: "head", bone: "head", ramp: [...steel, ...cloth, INK], paint: head(livery) },
      { name: "thigh_near", bone: "thigh_near", ramp: mail, paint: thigh(livery, false) },
      { name: "shin_near", bone: "shin_near", ramp: [...mail, ...steel], paint: shin(livery, false) },
      { name: "foot_near", bone: "foot_near", ramp: steel, paint: foot(livery, false) },
      { name: "upper_arm_near", bone: "upper_arm_near", ramp: steel, paint: upperArm(livery, false) },
      { name: "forearm_near", bone: "forearm_near", ramp: [...steel, ...mail, LEATHER], paint: forearm(livery, false) },
      { name: "sword", bone: "sword", ramp: blade, paint: sword(livery) }
    ];
    const clips = /* @__PURE__ */ new Map();
    clips.set("idle", idle());
    clips.set("walk", walk(dials2));
    clips.set("slash", slash(dials2));
    clips.set("walk_west", Motion.mirror("walk_west", "walk", clips.get("walk")));
    const restPose = () => {
      const pose = { deg: {} };
      S.solveChain(pose, "thigh_near", "shin_near", [108, GROUND_Y], 1, "foot_near", 90);
      S.solveChain(pose, "thigh_far", "shin_far", [84, GROUND_Y], 1, "foot_far", 88);
      return pose;
    };
    return {
      canvasW: CANVAS_W,
      canvasH: CANVAS_H,
      groundRow: GROUND_ROW,
      skeleton: S,
      parts,
      clips,
      grade: { ink: INK, shadow: SHADOW, emissiveLone: [] },
      shadow: { x: 25, y: 78, rx: 14, ry: 2 },
      restPose
    };
  }
  function thigh(livery, far) {
    const p = new Paint({ x: -14, y: -7, w: 28, h: 62 });
    p.capsule([0, 2], [0, 46], 10, 8, far ? MAIL_DARK : MAIL);
    if (!far) p.tintToward([-1, -0.4], MAIL_LIGHT, 3);
    p.occludeAbove(6, 8, 0.25);
    return p;
  }
  function shin(livery, far) {
    const p = new Paint({ x: -15, y: -6, w: 30, h: 62 });
    p.capsule([0, 0], [0, 29], 8, 7, far ? MAIL_DARK : MAIL);
    p.polygon([[-9, 25], [9, 25], [11, 46], [6, 50], [-7, 50], [-10, 44]], far ? livery.steelDark : livery.steel);
    if (!far) p.tintToward([-1, -0.4], livery.steelLight, 3);
    return p;
  }
  function foot(livery, far) {
    const p = new Paint({ x: -14, y: -9, w: 28, h: 34 });
    p.polygon([[-7, -4], [7, -4], [8, 12], [3, 16], [-7, 15], [-9, 6]], far ? livery.steelDark : livery.steel);
    if (!far) p.tintToward([1, -0.3], livery.steelLight, 2.5);
    return p;
  }
  function cape(livery) {
    const p = new Paint({ x: -26, y: -8, w: 52, h: 62 });
    p.polygon([[9, 4], [18, 11], [16, 49], [5, 43], [-8, 51], [-13, 12]], livery.clothDark);
    p.tintToward([0.8, 0.4], livery.cloth, 4);
    return p;
  }
  function torso(livery) {
    const p = new Paint({ x: -24, y: -8, w: 48, h: 58 });
    p.capsule([0, 3], [0, 39], 13, 12, MAIL);
    p.polygon([[-11, 8], [11, 8], [9, 40], [0, 45], [-10, 40]], livery.cloth);
    p.polygon([[-12, 8], [12, 8], [12, 14], [-12, 14]], LEATHER_DARK);
    p.disc([0, 11], 4, LEATHER);
    p.tintToward([0.8, 0.4], livery.clothLight, 3);
    p.tintToward([-0.8, -0.4], livery.clothDark, 3);
    return p;
  }
  function chest(livery) {
    const p = new Paint({ x: -35, y: -8, w: 70, h: 56 });
    p.polygon([[-18, 2], [18, 2], [23, 12], [19, 34], [11, 40], [-12, 40], [-20, 32], [-23, 12]], livery.steel);
    p.polygon([[-6, 5], [7, 5], [7, 35], [0, 39], [-7, 34]], livery.cloth);
    p.disc([-23, 27], 10, livery.steelDark);
    p.disc([23, 27], 10, livery.steelDark);
    p.tintToward([0.9, 0.5], livery.steelLight, 4);
    p.tintToward([-0.8, -0.5], livery.steelDark, 3);
    p.occludeAbove(5, 8, 0.2);
    return p;
  }
  function head(livery) {
    const p = new Paint({ x: -34, y: -5, w: 68, h: 68 });
    p.capsule([0, -2], [0, 18], 8, 9, livery.steelDark);
    p.polygon([[-24, 12], [18, 12], [25, 23], [23, 43], [14, 51], [-12, 54], [-24, 45], [-28, 26]], livery.steel);
    p.polygon([[-28, 27], [6, 29], [7, 39], [-27, 37]], livery.steelDark);
    p.polygon([[-23, 31], [-5, 32], [-6, 35], [-24, 34]], INK);
    p.polygon([[-17, 38], [-10, 38], [-12, 18], [-17, 20]], livery.steelLight);
    p.polygon([[1, 50], [8, 60], [16, 56], [13, 47]], livery.cloth);
    p.tintToward([0.8, 0.7], livery.steelLight, 3);
    p.tintToward([0, -1], livery.steelDark, 2.5);
    return p;
  }
  function upperArm(livery, far) {
    const p = new Paint({ x: -14, y: -7, w: 28, h: 44 });
    p.disc([0, 2], 11, far ? livery.steelDark : livery.steel);
    p.capsule([0, 5], [0, 29], 8, 6, far ? livery.steelDark : livery.steel);
    if (!far) p.tintToward([-1, -0.3], livery.steelLight, 3);
    p.occludeAbove(5, 7, 0.2);
    return p;
  }
  function forearm(livery, far) {
    const p = new Paint({ x: -13, y: -6, w: 26, h: 44 });
    p.capsule([0, 0], [0, 23], 7, 5.5, far ? MAIL_DARK : MAIL);
    p.polygon([[-8, 9], [8, 9], [7, 25], [-6, 27], [-9, 20]], far ? livery.steelDark : livery.steel);
    p.disc([0, 27], 6, far ? MAIL_DARK : LEATHER);
    if (!far) p.tintToward([-1, -0.3], livery.steelLight, 2.5);
    return p;
  }
  function sword(livery) {
    const p = new Paint({ x: -18, y: -14, w: 36, h: 94 });
    p.disc([0, -8], 6, livery.steelDark);
    p.capsule([0, -7], [0, 10], 4.5, 4.5, LEATHER);
    p.capsule([-15, 11], [15, 11], 4, 4, livery.steelDark);
    p.polygon([[-5, 11], [5, 11], [4, 62], [0, 74], [-4, 62]], livery.steelLight);
    p.polygon([[-5, 11], [0, 12], [0, 68], [-4, 62]], livery.steel);
    p.tintToward([1, -0.2], BLADE_GLEAM, 2.5);
    return p;
  }
  function plantFeet(c) {
    c.plant("thigh_near", "shin_near", "foot_near", { 0: [108, GROUND_Y, 90] });
    c.plant("thigh_far", "shin_far", "foot_far", { 0: [84, GROUND_Y, 88] });
  }
  function idle() {
    const c = new Motion("idle", 1.8);
    c.bakeFps = 12;
    plantFeet(c);
    c.key("root_y", { 0: 0, 0.9: -2 });
    c.key("spine", { 0: -1, 0.9: 1 });
    c.key("head", { 0.2: 1.5, 1.1: -1.5 });
    c.key("upper_arm_near", { 0: -2, 0.9: 2 });
    c.key("forearm_near", { 0: 2, 0.9: -2 });
    c.key("sword", { 0: -1.5, 0.9: 1.5 });
    return c;
  }
  function walk(dials2) {
    const c = new Motion("walk", 0.8);
    c.bakeFps = 15;
    c.gait("thigh_near", "shin_near", "foot_near", dials2.stride, 18, 0, GROUND_Y, 6, 0.65);
    c.gait("thigh_far", "shin_far", "foot_far", dials2.stride, 18, 0.5, GROUND_Y, -6, 0.65);
    c.key("root_y", { 0: 2, 0.2: -2, 0.4: 2, 0.6: -2 });
    c.key("spine", { 0: -3, 0.4: 3 });
    c.key("head", { 0: 2, 0.4: -2 });
    c.key("upper_arm_far", { 0: 14, 0.4: -14 });
    c.key("forearm_far", { 0: 10, 0.4: 18 });
    c.key("upper_arm_near", { 0: -5, 0.4: 5 });
    c.key("forearm_near", { 0: 3, 0.4: -3 });
    c.key("sword", { 0: -3, 0.4: 3 });
    return c;
  }
  function slash(dials2) {
    const c = new Motion("slash", 1.15, false);
    c.bakeFps = 15;
    c.wobbleBudget = 4.5;
    plantFeet(c);
    c.key("root_x", { 0: 0, 0.2: -3, 0.48: 6, 0.78: 1, 1.15: 0 }, "outBack");
    c.key("root_y", { 0: 0, 0.2: 3, 0.48: -2, 0.78: 1, 1.15: 0 });
    c.key("spine", { 0: 0, 0.2: 10, 0.48: -12, 0.78: 4, 1.15: 0 }, "outBack");
    c.key("head", { 0: 0, 0.2: -5, 0.48: 7, 1.15: 0 });
    c.key("upper_arm_near", { 0: 0, 0.2: -24, 0.48: 35, 0.78: 12, 1.15: 0 }, "outBack");
    c.key("forearm_near", { 0: 0, 0.2: -18, 0.48: 20, 0.78: 8, 1.15: 0 });
    c.key("sword", { 0: 0, 0.2: dials2.swordArc * 0.25, 0.48: -dials2.swordArc, 0.78: -20, 1.15: 0 }, "outBack");
    c.key("upper_arm_far", { 0: 0, 0.2: 8, 0.48: -12, 1.15: 0 });
    return c;
  }

  // scout.ts
  var CANVAS_W2 = 64;
  var CANVAS_H2 = 80;
  var GROUND_Y2 = 296;
  var GROUND_ROW2 = 75;
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
  var INK2 = hex("151221");
  var SKIN = hex("e8b48c");
  var SKIN_SHADE = hex("c08b62");
  var BOOT_LIGHT = hex("8a6f52");
  var BOOT = hex("63503c");
  var BOOT_DARK = hex("443528");
  var EYE = hex("59f2e0");
  var EYE_CORE = hex("eafffb");
  var SHADOW2 = [0.03, 0.02, 0.1, 0.45];
  var DEFAULT_DIALS2 = { stride: 88, runWind: -2200 };
  function buildCharacter2(theme = DUSK, dials2 = DEFAULT_DIALS2) {
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
    const suit = [theme.suitLight, theme.suit, theme.suitDark];
    const boots = [BOOT_LIGHT, BOOT, BOOT_DARK];
    const scarfRamp = [theme.scarfLight, theme.scarf, theme.scarfDark];
    const parts = [
      {
        name: "scarf",
        chain: "scarf",
        ramp: scarfRamp,
        painter: (p, pts) => {
          p.ribbon(pts, 7, 2.8, theme.scarf);
          p.tintToward([-0.4, -1], theme.scarfLight, 2.2);
          p.tintToward([0.4, 1], theme.scarfDark, 2.2);
        }
      },
      { name: "upper_arm_far", bone: "upper_arm_far", ramp: suit, paint: upperArm2(theme, true) },
      { name: "forearm_far", bone: "forearm_far", ramp: [...suit, SKIN, SKIN_SHADE], paint: forearm2(theme, true) },
      { name: "thigh_far", bone: "thigh_far", ramp: suit, paint: thigh2(theme, true) },
      { name: "shin_far", bone: "shin_far", ramp: [...suit, ...boots], paint: shin2(theme, true) },
      { name: "foot_far", bone: "foot_far", ramp: boots, paint: foot2(true) },
      { name: "torso", bone: "spine", ramp: [...suit, BOOT_DARK], paint: torso2(theme) },
      { name: "chest", bone: "chest", ramp: suit, paint: chest2(theme) },
      { name: "head", bone: "head", ramp: [...suit, SKIN, SKIN_SHADE, EYE, EYE_CORE], paint: head2(theme) },
      { name: "thigh_near", bone: "thigh_near", ramp: suit, paint: thigh2(theme, false) },
      { name: "shin_near", bone: "shin_near", ramp: [...suit, ...boots], paint: shin2(theme, false) },
      { name: "foot_near", bone: "foot_near", ramp: boots, paint: foot2(false) },
      { name: "upper_arm_near", bone: "upper_arm_near", ramp: suit, paint: upperArm2(theme, false) },
      { name: "forearm_near", bone: "forearm_near", ramp: [...suit, SKIN, SKIN_SHADE], paint: forearm2(theme, false) }
    ];
    const clips = /* @__PURE__ */ new Map();
    clips.set("idle", idle2(dials2));
    clips.set("run", run(dials2));
    clips.set("jump", jump(dials2));
    clips.set("run_west", Motion.mirror("run_west", "run", clips.get("run")));
    const restPose = () => {
      const pose = { deg: {} };
      S.solveChain(pose, "thigh_near", "shin_near", [140, GROUND_Y2], 1, "foot_near", 90);
      S.solveChain(pose, "thigh_far", "shin_far", [116, GROUND_Y2], 1, "foot_far", 88);
      return pose;
    };
    return {
      canvasW: CANVAS_W2,
      canvasH: CANVAS_H2,
      groundRow: GROUND_ROW2,
      // Below the 0.75 the fill gate now asks of a new character, and honestly
      // so: Scout was drawn in the spike before any size guidance existed and
      // leaves 23 rows of air above its hood. Its geometry is frozen by the
      // golden frames, so it declares what it measures rather than pretending.
      // A character authored today should not copy this number.
      minFill: 0.65,
      skeleton: S,
      parts,
      clips,
      grade: { ink: INK2, shadow: SHADOW2, emissiveLone: [EYE, EYE_CORE] },
      shadow: { x: 32, y: 78, rx: 13, ry: 2 },
      restPose
    };
  }
  function thigh2(theme, far) {
    const p = new Paint({ x: -14, y: -6, w: 28, h: 52 });
    p.capsule([0, 2], [0, 40], 10, 8, far ? theme.suitDark : theme.suit);
    if (!far) {
      p.tintToward([-1, -0.4], theme.suitLight, 3.5);
      p.tintToward([1, 0.4], theme.suitDark, 3);
    }
    p.occludeAbove(6, 8, 0.25);
    return p;
  }
  function shin2(theme, far) {
    const p = new Paint({ x: -12, y: -4, w: 24, h: 50 });
    p.capsule([0, 0], [0, 26], 8, 6.5, far ? theme.suitDark : theme.suit);
    p.capsule([0, 24], [0, 40], 7, 6, far ? BOOT_DARK : BOOT);
    if (!far) {
      p.tintToward([-1, -0.4], theme.suitLight, 2.5);
      p.tintToward([1, 0.5], theme.suitDark, 2.5);
    }
    return p;
  }
  function foot2(far) {
    const p = new Paint({ x: -12, y: -8, w: 24, h: 28 });
    p.capsule([2, -2], [0, 11], 6, 4.5, far ? BOOT_DARK : BOOT);
    if (!far) p.tintToward([1, -0.3], BOOT_LIGHT, 2);
    return p;
  }
  function torso2(theme) {
    const p = new Paint({ x: -20, y: -8, w: 40, h: 58 });
    p.capsule([0, 4], [0, 42], 11.5, 13, theme.suit);
    p.capsule([-10, 9], [10, 9], 3.5, 3.5, BOOT_DARK);
    p.tintToward([0.8, 0.5], theme.suitLight, 3);
    p.tintToward([-0.7, -0.5], theme.suitDark, 3);
    return p;
  }
  function chest2(theme) {
    const p = new Paint({ x: -20, y: -6, w: 40, h: 48 });
    p.capsule([0, 0], [0, 34], 13, 10.5, theme.suit);
    p.tintToward([0.7, 0.7], theme.suitLight, 4);
    p.tintToward([-0.5, -0.8], theme.suitDark, 3.5);
    p.occludeAbove(4, 8, 0.2);
    return p;
  }
  function head2(theme) {
    const p = new Paint({ x: -26, y: -4, w: 52, h: 52 });
    p.disc([1, 25], 19, theme.suit);
    p.disc([-9, 24], 11, SKIN);
    p.tintToward([-0.9, -0.4], SKIN_SHADE, 2.5);
    p.disc([-12, 27], 2.8, EYE);
    p.disc([-13, 28], 1.2, EYE_CORE);
    p.tintToward([0.6, 0.8], theme.suitLight, 3.5);
    p.tintToward([0, -1], theme.suitDark, 2.5);
    return p;
  }
  function upperArm2(theme, far) {
    const p = new Paint({ x: -11, y: -6, w: 22, h: 42 });
    p.capsule([0, 0], [0, 30], 7, 6, far ? theme.suitDark : theme.suit);
    if (!far) p.tintToward([-1, -0.3], theme.suitLight, 2.5);
    p.occludeAbove(4, 7, 0.25);
    return p;
  }
  function forearm2(theme, far) {
    const p = new Paint({ x: -10, y: -4, w: 20, h: 40 });
    p.capsule([0, 0], [0, 24], 6, 5, far ? theme.suitDark : theme.suit);
    p.disc([0, 27], 5, far ? SKIN_SHADE : SKIN);
    if (!far) p.tintToward([-1, -0.3], theme.suitLight, 2);
    return p;
  }
  function idle2(dials2) {
    const c = new Motion("idle", 1.6);
    c.bakeFps = 12;
    c.wind = [-150 + dials2.runWind * 0.4, 0];
    c.plant("thigh_near", "shin_near", "foot_near", { 0: [140, GROUND_Y2, 90] });
    c.plant("thigh_far", "shin_far", "foot_far", { 0: [116, GROUND_Y2, 88] });
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
    c.gait("thigh_near", "shin_near", "foot_near", dials2.stride, 40, 0, GROUND_Y2, 6, 0.4);
    c.gait("thigh_far", "shin_far", "foot_far", dials2.stride, 40, 0.5, GROUND_Y2, -6, 0.4);
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
      0: [140, GROUND_Y2, 90],
      0.15: [140, 296, 70],
      0.3: [136, 250, 55],
      0.45: [138, 236, 50],
      0.6: [142, 262, 70],
      0.72: [140, 296, 90],
      0.9: [140, GROUND_Y2, 90]
    });
    c.plant("thigh_far", "shin_far", "foot_far", {
      0: [116, GROUND_Y2, 88],
      0.15: [116, 296, 70],
      0.3: [114, 252, 55],
      0.45: [110, 240, 50],
      0.6: [112, 264, 70],
      0.72: [116, 296, 88],
      0.9: [116, GROUND_Y2, 88]
    });
    c.key("spine", { 0: 0, 0.15: -10, 0.3: 6, 0.45: 4, 0.6: -4, 0.72: -8, 0.9: 0 });
    c.key("head", { 0: 0, 0.15: 6, 0.3: -4, 0.6: 2, 0.72: 5, 0.9: 0 });
    c.key("upper_arm_near", { 0: 5, 0.15: -35, 0.3: 55, 0.45: 80, 0.6: 40, 0.72: -10, 0.9: 5 });
    c.key("forearm_near", { 0: 10, 0.15: 25, 0.3: 45, 0.45: 40, 0.6: 28, 0.72: 15, 0.9: 10 });
    c.key("upper_arm_far", { 0: -5, 0.15: -42, 0.3: 40, 0.45: 62, 0.6: 28, 0.72: -15, 0.9: -5 });
    c.key("forearm_far", { 0: 10, 0.15: 20, 0.3: 40, 0.45: 35, 0.6: 22, 0.72: 10, 0.9: 10 });
    return c;
  }

  // rivet.ts
  var CANVAS_W3 = 64;
  var CANVAS_H3 = 80;
  var GROUND_Y3 = 288;
  var GROUND_ROW3 = 76;
  var RUST = {
    shellLight: hex("cfd6dd"),
    shell: hex("8d99a6"),
    shellDark: hex("4c5866"),
    trimLight: hex("ffb45e"),
    trim: hex("d97b2c"),
    trimDark: hex("8a4715")
  };
  var MOSS = {
    shellLight: hex("c8d6c4"),
    shell: hex("7f9480"),
    shellDark: hex("42544a"),
    trimLight: hex("9be9ff"),
    trim: hex("3fb8e0"),
    trimDark: hex("1e6a8c")
  };
  var INK3 = hex("14161f");
  var IRON_LIGHT = hex("8b95a4");
  var IRON = hex("5c6673");
  var IRON_DARK = hex("373f4d");
  var OPTIC = hex("65f7c8");
  var OPTIC_CORE = hex("e9fff8");
  var SHADOW3 = [0.03, 0.03, 0.09, 0.45];
  var DEFAULT_DIALS3 = { stride: 46, antennaWind: -520 };
  function buildCharacter3(finish = RUST, dials2 = DEFAULT_DIALS3) {
    const S = new Skeleton();
    S.rootPos = [128, 196];
    S.bone("pelvis", "", [0, 0], 0, 0);
    S.bone("thigh_near", "pelvis", [17, 4], 0, 46);
    S.bone("shin_near", "thigh_near", S.tip(), 0, 46);
    S.bone("foot_near", "shin_near", S.tip(), 90, 16);
    S.bone("thigh_far", "pelvis", [-17, 6], 0, 46);
    S.bone("shin_far", "thigh_far", S.tip(), 0, 46);
    S.bone("foot_far", "shin_far", S.tip(), 90, 16);
    S.bone("spine", "pelvis", [0, -4], 178, 34);
    S.bone("chest", "spine", S.tip(), 0, 44);
    S.bone("head", "chest", S.tip(), 2, 54);
    S.bone("upper_arm_near", "chest", [-30, 40], 186, 34);
    S.bone("forearm_near", "upper_arm_near", S.tip(), -6, 30);
    S.bone("upper_arm_far", "chest", [30, 38], 190, 34);
    S.bone("forearm_far", "upper_arm_far", S.tip(), -4, 30);
    S.chain("antenna", "head", [6, 52], 3, 9, [-260, 0], 300, 0.9, 0.5, 0.74, [0, 1]);
    const shell = [finish.shellLight, finish.shell, finish.shellDark];
    const iron = [IRON_LIGHT, IRON, IRON_DARK];
    const trim = [finish.trimLight, finish.trim, finish.trimDark];
    const parts = [
      { name: "antenna", chain: "antenna", ramp: trim, painter: antenna(finish) },
      { name: "upper_arm_far", bone: "upper_arm_far", ramp: iron, paint: upperArm3(finish, true) },
      { name: "forearm_far", bone: "forearm_far", ramp: [...iron, ...shell], paint: forearm3(finish, true) },
      { name: "thigh_far", bone: "thigh_far", ramp: iron, paint: thigh3(finish, true) },
      { name: "shin_far", bone: "shin_far", ramp: [...iron, ...shell], paint: shin3(finish, true) },
      { name: "foot_far", bone: "foot_far", ramp: [...iron, ...shell], paint: foot3(finish, true) },
      { name: "hips", bone: "spine", ramp: [...iron, ...trim], paint: hips(finish) },
      { name: "chest", bone: "chest", ramp: [...shell, ...iron, ...trim], paint: chest3(finish) },
      { name: "head", bone: "head", ramp: [...shell, ...iron, OPTIC, OPTIC_CORE], paint: head3(finish) },
      { name: "thigh_near", bone: "thigh_near", ramp: iron, paint: thigh3(finish, false) },
      { name: "shin_near", bone: "shin_near", ramp: [...iron, ...shell], paint: shin3(finish, false) },
      { name: "foot_near", bone: "foot_near", ramp: [...iron, ...shell], paint: foot3(finish, false) },
      { name: "upper_arm_near", bone: "upper_arm_near", ramp: iron, paint: upperArm3(finish, false) },
      { name: "forearm_near", bone: "forearm_near", ramp: [...iron, ...shell], paint: forearm3(finish, false) }
    ];
    const clips = /* @__PURE__ */ new Map();
    clips.set("idle", idle3(dials2));
    clips.set("walk", walk2(dials2));
    clips.set("startle", startle(dials2));
    clips.set("walk_west", Motion.mirror("walk_west", "walk", clips.get("walk")));
    const restPose = () => {
      const pose = { deg: {} };
      S.solveChain(pose, "thigh_near", "shin_near", [146, GROUND_Y3], 1, "foot_near", 90);
      S.solveChain(pose, "thigh_far", "shin_far", [110, GROUND_Y3], 1, "foot_far", 88);
      return pose;
    };
    return {
      canvasW: CANVAS_W3,
      canvasH: CANVAS_H3,
      groundRow: GROUND_ROW3,
      skeleton: S,
      parts,
      clips,
      grade: { ink: INK3, shadow: SHADOW3, emissiveLone: [OPTIC, OPTIC_CORE] },
      shadow: { x: 32, y: 78, rx: 14, ry: 2 },
      restPose
    };
  }
  function slab(p, y0, y1, w, bevel, c) {
    p.polygon(
      [
        [-w + bevel, y0],
        [w - bevel, y0],
        [w, y0 + bevel],
        [w, y1 - bevel],
        [w - bevel, y1],
        [-w + bevel, y1],
        [-w, y1 - bevel],
        [-w, y0 + bevel]
      ],
      c
    );
  }
  function thigh3(finish, far) {
    const p = new Paint({ x: -26, y: -8, w: 52, h: 64 });
    slab(p, 2, 46, far ? 13 : 15, 4, far ? IRON_DARK : IRON);
    if (!far) {
      p.tintToward([-1, -0.3], IRON_LIGHT, 6);
      p.tintToward([1, 0.3], IRON_DARK, 5);
    }
    p.disc([0, 3], 11, far ? IRON_DARK : IRON_LIGHT);
    p.occludeAbove(5, 8, 0.25);
    return p;
  }
  function shin3(finish, far) {
    const p = new Paint({ x: -28, y: -8, w: 56, h: 64 });
    slab(p, 0, 32, far ? 11 : 13, 3.5, far ? IRON_DARK : IRON);
    slab(p, 32, 46, far ? 16 : 18, 4.5, far ? finish.shellDark : finish.shell);
    if (!far) {
      p.tintToward([-1, -0.3], IRON_LIGHT, 5);
      p.tintToward([1, 0.4], IRON_DARK, 5);
    }
    p.disc([0, 1], 10, far ? finish.shellDark : finish.shell);
    return p;
  }
  function foot3(finish, far) {
    const p = new Paint({ x: -26, y: -16, w: 52, h: 44 });
    slab(p, -6, 17, 14, 4, far ? finish.shellDark : finish.shell);
    if (!far) p.tintToward([1, -0.3], finish.shell, 3);
    return p;
  }
  function hips(finish) {
    const p = new Paint({ x: -40, y: -10, w: 80, h: 60 });
    slab(p, 0, 34, 17, 5, IRON);
    slab(p, 8, 17, 19, 3, finish.trimDark);
    slab(p, 11, 14, 20, 2, finish.trim);
    p.tintToward([0.9, 0.4], IRON_LIGHT, 5);
    p.tintToward([-0.9, -0.4], IRON_DARK, 4);
    return p;
  }
  function chest3(finish) {
    const p = new Paint({ x: -52, y: -12, w: 104, h: 76 });
    p.polygon(
      [
        [-26, 40],
        [26, 40],
        [26, 26],
        [21, 9],
        [16, 0],
        [-16, 0],
        [-21, 9],
        [-26, 26]
      ],
      finish.shell
    );
    p.polygon([[-36, 41], [-18, 45], [-13, 33], [-28, 28]], finish.shellDark);
    p.polygon([[36, 41], [18, 45], [13, 33], [28, 28]], finish.shellDark);
    slab(p, 13, 30, 15, 4, finish.shellDark);
    slab(p, 16, 27, 10, 2.5, IRON_DARK);
    for (const y of [18, 23]) p.polygon([[-9, y], [9, y], [9, y + 2.5], [-9, y + 2.5]], finish.trim);
    p.tintToward([0.9, 0.5], finish.shellLight, 3);
    p.tintToward([-0.8, -0.5], finish.shellDark, 3);
    p.occludeAbove(4, 8, 0.2);
    return p;
  }
  function head3(finish) {
    const p = new Paint({ x: -44, y: -10, w: 88, h: 72 });
    slab(p, -2, 18, 9, 2, IRON_DARK);
    p.polygon(
      [
        [-26, 14],
        [24, 14],
        [30, 27],
        [24, 50],
        [10, 55],
        [-18, 55],
        [-32, 46],
        [-33, 25]
      ],
      finish.shell
    );
    p.polygon([[-33, 29], [-4, 31], [-4, 42], [-33, 39]], IRON_DARK);
    p.disc([-22, 35], 8, OPTIC);
    p.disc([-25, 36], 3.5, OPTIC_CORE);
    slab(p, 48, 58, 8, 2, IRON);
    p.tintToward([0.8, 0.7], finish.shellLight, 3);
    p.tintToward([0, -1], finish.shellDark, 2.5);
    return p;
  }
  function upperArm3(finish, far) {
    const p = new Paint({ x: -24, y: -8, w: 48, h: 52 });
    slab(p, 0, 34, far ? 11 : 13, 3.5, far ? IRON_DARK : IRON);
    p.disc([0, 1], 10, far ? IRON_DARK : finish.shellDark);
    if (!far) p.tintToward([-1, -0.3], IRON_LIGHT, 4);
    p.occludeAbove(4, 7, 0.25);
    return p;
  }
  function forearm3(finish, far) {
    const p = new Paint({ x: -24, y: -8, w: 48, h: 52 });
    slab(p, 0, 22, far ? 10 : 12, 3.5, far ? IRON_DARK : IRON);
    p.polygon([[-11, 22], [-3.5, 22], [-3.5, 34], [-11, 31]], far ? IRON_DARK : IRON_LIGHT);
    p.polygon([[11, 22], [3.5, 22], [3.5, 34], [11, 31]], far ? IRON_DARK : IRON_LIGHT);
    if (!far) p.tintToward([-1, -0.3], IRON_LIGHT, 4);
    return p;
  }
  function antenna(finish) {
    return (p, pts) => {
      p.ribbon(pts, 9, 6, finish.trimDark);
      p.tintToward([-1, -0.3], finish.trim, 1.5);
      const tip = pts[pts.length - 1];
      p.disc(tip, 8, finish.trim);
      p.disc([tip[0] - 2, tip[1] - 2], 3.5, finish.trimLight);
    };
  }
  function idle3(dials2) {
    const c = new Motion("idle", 2);
    c.bakeFps = 12;
    c.wind = [dials2.antennaWind * 0.25, 0];
    c.plant("thigh_near", "shin_near", "foot_near", { 0: [146, GROUND_Y3, 90] });
    c.plant("thigh_far", "shin_far", "foot_far", { 0: [110, GROUND_Y3, 88] });
    c.key("root_y", { 0: 0, 1: 2 });
    c.key("spine", { 0: 0.8, 1: -0.8 });
    c.key("chest", { 0: -1, 1: 1 });
    c.key("head", { 0.2: -1.5, 1.2: 1.5 });
    c.key("upper_arm_near", { 0: 1.5, 1: -1.5 });
    c.key("forearm_near", { 0: -2, 1: 2 });
    c.key("upper_arm_far", { 0: -1.5, 1: 1.5 });
    c.key("forearm_far", { 0: 2, 1: -2 });
    return c;
  }
  function walk2(dials2) {
    const c = new Motion("walk", 0.9);
    c.bakeFps = 12;
    c.wind = [dials2.antennaWind, 0];
    c.wobbleBudget = 3;
    c.gait("thigh_near", "shin_near", "foot_near", dials2.stride, 16, 0, GROUND_Y3, 18, 0.68);
    c.gait("thigh_far", "shin_far", "foot_far", dials2.stride, 16, 0.5, GROUND_Y3, -18, 0.68);
    c.key("root_y", { 0: 3, 0.225: -1, 0.45: 3, 0.675: -1 });
    c.key("spine", { 0: -3, 0.45: 3 });
    c.key("chest", { 0: 1.5, 0.45: -1.5 });
    c.key("head", { 0: 2, 0.45: -2 });
    c.key("upper_arm_near", { 0: -12, 0.45: 12 });
    c.key("forearm_near", { 0: 8, 0.45: 14 });
    c.key("upper_arm_far", { 0: 12, 0.45: -12 });
    c.key("forearm_far", { 0: 14, 0.45: 8 });
    return c;
  }
  function startle(dials2) {
    const c = new Motion("startle", 1.1, false);
    c.bakeFps = 15;
    c.wobbleBudget = 3.5;
    c.wind = [dials2.antennaWind * 1.1, 0];
    c.plant("thigh_near", "shin_near", "foot_near", {
      0: [146, GROUND_Y3, 90],
      0.12: [149, GROUND_Y3, 90],
      0.45: [143, GROUND_Y3, 90],
      1.1: [146, GROUND_Y3, 90]
    });
    c.plant("thigh_far", "shin_far", "foot_far", {
      0: [110, GROUND_Y3, 88],
      0.12: [106, GROUND_Y3, 88],
      0.45: [113, GROUND_Y3, 88],
      1.1: [110, GROUND_Y3, 88]
    });
    c.key("root_y", { 0: 0, 0.12: -5, 0.4: 3, 0.7: -1, 1.1: 0 }, "outBack");
    c.key("spine", { 0: 0, 0.12: 9, 0.4: -4, 0.7: 2, 1.1: 0 }, "outBack");
    c.key("chest", { 0: 0, 0.12: 7, 0.4: -3, 1.1: 0 });
    c.key("head", { 0: 0, 0.12: -9, 0.4: 5, 0.7: -2, 1.1: 0 });
    c.key("upper_arm_near", { 0: 0, 0.12: -34, 0.4: 12, 0.7: -4, 1.1: 0 });
    c.key("forearm_near", { 0: 0, 0.12: 42, 0.4: 10, 1.1: 0 });
    c.key("upper_arm_far", { 0: 0, 0.12: -28, 0.4: 10, 0.7: -3, 1.1: 0 });
    c.key("forearm_far", { 0: 0, 0.12: 38, 0.4: 8, 1.1: 0 });
    return c;
  }

  // husk.ts
  var CANVAS_W4 = 64;
  var CANVAS_H4 = 80;
  var GROUND_Y4 = 288;
  var GROUND_ROW4 = 73;
  var GRAVE = {
    fleshLight: hex("a9c184"),
    flesh: hex("7c9455"),
    fleshDark: hex("4a5c33"),
    ragLight: hex("9b93a4"),
    rag: hex("6b6474"),
    ragDark: hex("403c4c")
  };
  var DROWNED = {
    fleshLight: hex("9fbcc4"),
    flesh: hex("63868f"),
    fleshDark: hex("3a505a"),
    ragLight: hex("8d9a86"),
    rag: hex("5c6857"),
    ragDark: hex("353d34")
  };
  var INK4 = hex("15111c");
  var BONE_LIGHT = hex("efe6c8");
  var BONE = hex("c9bd98");
  var GORE = hex("7b2331");
  var EYE2 = hex("f7ef7a");
  var EYE_CORE2 = hex("fffce4");
  var SHADOW4 = [0.03, 0.05, 0.03, 0.45];
  var DEFAULT_DIALS4 = { stride: 40, drag: -260 };
  function buildCharacter4(rot = GRAVE, dials2 = DEFAULT_DIALS4) {
    const S = new Skeleton();
    S.rootPos = [98, 192];
    S.bone("pelvis", "", [0, 0], 0, 0);
    S.bone("thigh_near", "pelvis", [10, 4], 0, 52);
    S.bone("shin_near", "thigh_near", S.tip(), 0, 52);
    S.bone("foot_near", "shin_near", S.tip(), 90, 14);
    S.bone("thigh_far", "pelvis", [-10, 6], 0, 52);
    S.bone("shin_far", "thigh_far", S.tip(), 0, 52);
    S.bone("foot_far", "shin_far", S.tip(), 90, 14);
    S.bone("spine", "pelvis", [0, -4], 164, 44);
    S.bone("chest", "spine", S.tip(), 8, 42);
    S.bone("head", "chest", S.tip(), -14, 54);
    S.bone("upper_arm_near", "chest", [-5, 30], -78, 32);
    S.bone("forearm_near", "upper_arm_near", S.tip(), -8, 28);
    S.bone("upper_arm_far", "chest", [5, 27], -56, 32);
    S.bone("forearm_far", "upper_arm_far", S.tip(), -14, 28);
    S.chain("tail", "spine", [10, 2], 7, 11, [dials2.drag, 0], 2600, 0.972, 0.45, 0.06, [0, -1]);
    const flesh = [rot.fleshLight, rot.flesh, rot.fleshDark];
    const rags = [rot.ragLight, rot.rag, rot.ragDark];
    const parts = [
      { name: "upper_arm_far", bone: "upper_arm_far", ramp: rags, paint: upperArm4(rot, true) },
      { name: "forearm_far", bone: "forearm_far", ramp: [...rags, ...flesh], paint: forearm4(rot, true) },
      { name: "thigh_far", bone: "thigh_far", ramp: rags, paint: thigh4(rot, true) },
      { name: "shin_far", bone: "shin_far", ramp: [...rags, ...flesh], paint: shin4(rot, true) },
      { name: "foot_far", bone: "foot_far", ramp: rags, paint: foot4(rot, true) },
      { name: "tail", chain: "tail", ramp: rags, painter: tail(rot) },
      { name: "hips", bone: "spine", ramp: [...rags, ...flesh], paint: hips2(rot) },
      { name: "chest", bone: "chest", ramp: [...rags, ...flesh, BONE, BONE_LIGHT, GORE], paint: chest4(rot) },
      { name: "head", bone: "head", ramp: [...flesh, ...rags, BONE, BONE_LIGHT, GORE, EYE2, EYE_CORE2], paint: head4(rot) },
      { name: "thigh_near", bone: "thigh_near", ramp: rags, paint: thigh4(rot, false) },
      { name: "shin_near", bone: "shin_near", ramp: [...rags, ...flesh], paint: shin4(rot, false) },
      { name: "foot_near", bone: "foot_near", ramp: rags, paint: foot4(rot, false) },
      { name: "upper_arm_near", bone: "upper_arm_near", ramp: rags, paint: upperArm4(rot, false) },
      { name: "forearm_near", bone: "forearm_near", ramp: [...rags, ...flesh, BONE], paint: forearm4(rot, false) }
    ];
    const clips = /* @__PURE__ */ new Map();
    clips.set("idle", idle4(dials2));
    clips.set("shamble", shamble(dials2));
    clips.set("lunge", lunge(dials2));
    clips.set("shamble_west", Motion.mirror("shamble_west", "shamble", clips.get("shamble")));
    const restPose = () => {
      const pose = { deg: {} };
      S.solveChain(pose, "thigh_near", "shin_near", [116, GROUND_Y4], 1, "foot_near", 90);
      S.solveChain(pose, "thigh_far", "shin_far", [80, GROUND_Y4], 1, "foot_far", 86);
      return pose;
    };
    return {
      canvasW: CANVAS_W4,
      canvasH: CANVAS_H4,
      groundRow: GROUND_ROW4,
      skeleton: S,
      parts,
      clips,
      grade: { ink: INK4, shadow: SHADOW4, emissiveLone: [EYE2, EYE_CORE2] },
      shadow: { x: 32, y: 77, rx: 14, ry: 2 },
      restPose
    };
  }
  function thigh4(rot, far) {
    const p = new Paint({ x: -14, y: -6, w: 28, h: 64 });
    p.capsule([0, 2], [0, 50], 9, 7, far ? rot.ragDark : rot.rag);
    if (!far) {
      p.tintToward([-1, -0.4], rot.ragLight, 3);
      p.tintToward([1, 0.4], rot.ragDark, 3);
    }
    p.occludeAbove(6, 8, 0.25);
    return p;
  }
  function shin4(rot, far) {
    const p = new Paint({ x: -14, y: -6, w: 28, h: 64 });
    p.capsule([0, 0], [0, 20], 7.5, 6.5, far ? rot.ragDark : rot.rag);
    p.capsule([0, 18], [0, 46], 6.5, 5.5, far ? rot.fleshDark : rot.flesh);
    if (!far) {
      p.tintToward([-1, -0.4], rot.fleshLight, 2.5);
      p.tintToward([1, 0.5], rot.fleshDark, 2.5);
    }
    return p;
  }
  function foot4(rot, far) {
    const p = new Paint({ x: -14, y: -10, w: 28, h: 32 });
    p.capsule([2, -3], [0, 12], 6, 4.5, far ? rot.ragDark : rot.rag);
    if (!far) p.tintToward([1, -0.3], rot.ragLight, 2);
    return p;
  }
  function hips2(rot) {
    const p = new Paint({ x: -22, y: -10, w: 44, h: 58 });
    p.capsule([0, 2], [1, 38], 11, 12, rot.rag);
    p.capsule([-9, 7], [9, 10], 3.5, 3.5, rot.ragDark);
    p.tintToward([0.8, 0.5], rot.ragLight, 3);
    p.tintToward([-0.7, -0.5], rot.ragDark, 3);
    return p;
  }
  function chest4(rot) {
    const p = new Paint({ x: -24, y: -8, w: 48, h: 56 });
    p.capsule([0, 0], [-2, 36], 12, 11, rot.rag);
    p.disc([-5, 20], 9, GORE);
    p.capsule([-12, 16], [-1, 15], 3, 3, BONE);
    p.capsule([-13, 23], [-2, 22], 3, 3, BONE_LIGHT);
    p.tintToward([0.7, 0.7], rot.ragLight, 3.5);
    p.tintToward([-0.5, -0.8], rot.ragDark, 3);
    p.occludeAbove(4, 8, 0.2);
    return p;
  }
  function head4(rot) {
    const p = new Paint({ x: -30, y: -6, w: 60, h: 62 });
    p.disc([2, 36], 18, rot.flesh);
    p.polygon(
      [
        [-14, 34],
        [-24, 30],
        [-27, 21],
        [-19, 17],
        [-9, 22]
      ],
      rot.fleshDark
    );
    p.capsule([10, 48], [21, 24], 8, 5, rot.ragDark);
    p.capsule([-16, 39], [-5, 41], 2.8, 2.8, rot.fleshDark);
    p.disc([-11, 33], 4.5, BONE_LIGHT);
    p.disc([-12, 33], 2.6, EYE2);
    p.disc([-13, 33], 1.2, EYE_CORE2);
    p.capsule([-20, 25], [-11, 26], 1.8, 1.8, GORE);
    p.tintToward([0.6, 0.8], rot.fleshLight, 3.5);
    p.tintToward([-0.9, -0.5], rot.fleshDark, 3);
    return p;
  }
  function upperArm4(rot, far) {
    const p = new Paint({ x: -12, y: -6, w: 24, h: 44 });
    p.capsule([0, 0], [0, 32], 7, 5.5, far ? rot.ragDark : rot.rag);
    if (!far) p.tintToward([-1, -0.3], rot.ragLight, 2.5);
    p.occludeAbove(4, 7, 0.25);
    return p;
  }
  function forearm4(rot, far) {
    const p = new Paint({ x: -12, y: -6, w: 24, h: 46 });
    p.capsule([0, 0], [0, 12], 6, 5.5, far ? rot.ragDark : rot.rag);
    p.capsule([0, 11], [0, 24], 5.5, 4.5, far ? rot.fleshDark : rot.flesh);
    p.disc([0, 27], 5.5, far ? rot.fleshDark : rot.flesh);
    p.capsule([-3, 28], [-4, 33], 3.4, 3, far ? rot.fleshDark : rot.fleshLight);
    p.capsule([2, 28], [3, 32], 3.4, 3, far ? rot.fleshDark : rot.flesh);
    if (!far) {
      p.tintToward([-1, -0.3], rot.fleshLight, 2);
      p.disc([0, 6], 3, BONE);
    }
    return p;
  }
  function tail(rot) {
    return (p, pts) => {
      p.ribbon(pts, 11, 4, rot.rag);
      p.tintToward([-0.6, -1], rot.ragLight, 2.5);
      p.tintToward([0.6, 1], rot.ragDark, 3);
    };
  }
  function idle4(dials2) {
    const c = new Motion("idle", 2.4);
    c.bakeFps = 12;
    c.wind = [dials2.drag * 0.3, 0];
    c.plant("thigh_near", "shin_near", "foot_near", { 0: [116, GROUND_Y4, 90] });
    c.plant("thigh_far", "shin_far", "foot_far", { 0: [80, GROUND_Y4, 86] });
    c.key("root_y", { 0: 0, 1.2: 2 });
    c.key("spine", { 0: -1.5, 1.2: 1.5 });
    c.key("chest", { 0.2: 2, 1.4: -2 });
    c.key("head", { 0.5: -4, 1.7: 4 });
    c.key("upper_arm_near", { 0: 3, 1.2: -3 });
    c.key("forearm_near", { 0.3: -5, 1.5: 5 });
    c.key("upper_arm_far", { 0: -3, 1.2: 3 });
    c.key("forearm_far", { 0.3: 4, 1.5: -4 });
    return c;
  }
  function shamble(dials2) {
    const c = new Motion("shamble", 1.4);
    c.bakeFps = 12;
    c.wind = [dials2.drag, 0];
    c.gait("thigh_near", "shin_near", "foot_near", dials2.stride, 16, 0, GROUND_Y4, 18, 0.72);
    c.gait("thigh_far", "shin_far", "foot_far", dials2.stride, 4, 0.5, GROUND_Y4, -18, 0.72);
    c.key("root_y", { 0: 4, 0.35: -2, 0.7: 4, 1.05: 1 });
    c.key("spine", { 0: -4, 0.7: 2 });
    c.key("chest", { 0: 3, 0.7: -3 });
    c.key("head", { 0.15: -5, 0.85: 5 });
    c.key("upper_arm_near", { 0: -6, 0.7: 6 });
    c.key("forearm_near", { 0: 5, 0.7: -5 });
    c.key("upper_arm_far", { 0: 5, 0.7: -5 });
    c.key("forearm_far", { 0: -6, 0.7: 6 });
    return c;
  }
  function lunge(dials2) {
    const c = new Motion("lunge", 1.3, false);
    c.bakeFps = 15;
    c.wobbleBudget = 4;
    c.wind = [dials2.drag, 0];
    c.key("wind_x", { 0: dials2.drag, 0.3: -dials2.drag * 4, 0.6: dials2.drag, 1.3: dials2.drag });
    c.plant("thigh_near", "shin_near", "foot_near", {
      0: [116, GROUND_Y4, 90],
      0.18: [110, GROUND_Y4, 90],
      0.42: [142, GROUND_Y4, 96],
      0.9: [138, GROUND_Y4, 94],
      1.3: [116, GROUND_Y4, 90]
    });
    c.plant("thigh_far", "shin_far", "foot_far", {
      0: [80, GROUND_Y4, 86],
      0.18: [76, GROUND_Y4, 86],
      0.42: [82, GROUND_Y4, 80],
      0.9: [82, GROUND_Y4, 82],
      1.3: [80, GROUND_Y4, 86]
    });
    c.key("root_y", { 0: 0, 0.18: 4, 0.42: 8, 0.9: 6, 1.3: 0 }, "outBack");
    c.key("spine", { 0: 0, 0.18: 5, 0.42: -12, 0.9: -9, 1.3: 0 }, "outBack");
    c.key("chest", { 0: 0, 0.18: 4, 0.42: -8, 0.9: -6, 1.3: 0 });
    c.key("head", { 0: 0, 0.18: 6, 0.42: -10, 0.9: -7, 1.3: 0 });
    c.key("upper_arm_near", { 0: 0, 0.18: 10, 0.42: -22, 0.9: -18, 1.3: 0 });
    c.key("forearm_near", { 0: 0, 0.18: 6, 0.42: 12, 0.9: 9, 1.3: 0 });
    c.key("upper_arm_far", { 0: 0, 0.18: 8, 0.42: -16, 0.9: -13, 1.3: 0 });
    c.key("forearm_far", { 0: 0, 0.18: 5, 0.42: 14, 0.9: 11, 1.3: 0 });
    return c;
  }

  // main.ts
  var SCALE = 5;
  var CAST = [
    {
      id: "scout",
      name: "Scout",
      blurb: "Tapered capsules, a verlet scarf, a running gait.",
      canvasW: CANVAS_W2,
      canvasH: CANVAS_H2,
      themes: [
        { label: "dusk", value: DUSK },
        { label: "ember", value: EMBER }
      ],
      dials: [
        { key: "stride", label: "stride", min: 40, max: 130, sign: 1 },
        { key: "runWind", label: "scarf wind", min: 0, max: 12e3, sign: -1 }
      ],
      defaults: { ...DEFAULT_DIALS2 },
      build: (theme, dials2) => buildCharacter2(theme, dials2)
    },
    {
      id: "rivet",
      name: "Rivet",
      blurb: "Flat polygon panels, a stiff antenna, a plod \u2014 and one clip that does not loop.",
      canvasW: CANVAS_W3,
      canvasH: CANVAS_H3,
      themes: [
        { label: "rust", value: RUST },
        { label: "moss", value: MOSS }
      ],
      dials: [
        { key: "stride", label: "stride", min: 20, max: 90, sign: 1 },
        { key: "antennaWind", label: "antenna wind", min: 0, max: 3e3, sign: -1 }
      ],
      defaults: { ...DEFAULT_DIALS3 },
      build: (theme, dials2) => buildCharacter3(theme, dials2)
    },
    {
      id: "vanguard",
      name: "Vanguard",
      blurb: "Plate armour, a guarded walk, and a fully articulated sword slash.",
      canvasW: CANVAS_W,
      canvasH: CANVAS_H,
      themes: [
        { label: "crimson", value: CRIMSON },
        { label: "azure", value: AZURE }
      ],
      dials: [
        { key: "stride", label: "stride", min: 28, max: 76, sign: 1 },
        { key: "swordArc", label: "sword arc", min: 70, max: 120, sign: 1 }
      ],
      defaults: { ...DEFAULT_DIALS },
      build: (theme, dials2) => buildCharacter(theme, dials2)
    },
    {
      id: "husk",
      name: "Husk",
      blurb: "A hunched stack, both arms reaching, a limp, and a rag that hangs rather than streams.",
      canvasW: CANVAS_W4,
      canvasH: CANVAS_H4,
      themes: [
        { label: "grave", value: GRAVE },
        { label: "drowned", value: DROWNED }
      ],
      dials: [
        { key: "stride", label: "stride", min: 16, max: 80, sign: 1 },
        { key: "drag", label: "coat drag", min: 0, max: 2e3, sign: -1 }
      ],
      defaults: { ...DEFAULT_DIALS4 },
      build: (theme, dials2) => buildCharacter4(theme, dials2)
    }
  ];
  var cast = CAST[0];
  var themeIndex = 0;
  var dials = { ...cast.defaults };
  var character = cast.build(cast.themes[0].value, dials);
  var baked = /* @__PURE__ */ new Map();
  var current = [...character.clips.keys()][0];
  var player = new ClipPlayer(getBaked(current));
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
    character = cast.build(cast.themes[themeIndex].value, dials);
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
    const k = SCALE / (character.superSample ?? SS);
    const flip = clip.mirrorOf !== "";
    const fx = (x) => flip ? cast.canvasW * SCALE - x * k : x * k;
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
    document.getElementById("counter").textContent = `${player.frame + 1} / ${entry.frames.length} @ ${entry.fps} fps`;
  }
  function renderStrip() {
    const entry = getBaked(current);
    const strip = document.getElementById("strip");
    const s = 2;
    strip.width = entry.frames.length * (cast.canvasW * s + 2);
    strip.height = cast.canvasH * s;
    const ctx = strip.getContext("2d");
    ctx.clearRect(0, 0, strip.width, strip.height);
    entry.frames.forEach((f, i) => {
      ctx.save();
      ctx.translate(i * (cast.canvasW * s + 2), 0);
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
  function buildClipButtons() {
    const row = document.getElementById("clips");
    row.textContent = "";
    for (const name of character.clips.keys()) {
      const b = document.createElement("button");
      b.dataset.clip = name;
      b.textContent = name.replace(/_/g, " ");
      b.addEventListener("click", () => selectClip(name));
      row.append(b);
    }
  }
  function buildDialSliders() {
    const row = document.getElementById("dials");
    row.textContent = "";
    for (const spec of cast.dials) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      const out = document.createElement("span");
      input.type = "range";
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.value = String(Math.abs(dials[spec.key]));
      out.textContent = input.value;
      input.addEventListener("change", () => {
        dials[spec.key] = Number(input.value) * spec.sign;
        out.textContent = input.value;
        rebuild();
        renderFrame();
      });
      label.append(`${spec.label} `, input, " ", out);
      row.append(label);
    }
  }
  function selectCharacter(member) {
    cast = member;
    themeIndex = 0;
    dials = { ...member.defaults };
    baked.clear();
    character = member.build(member.themes[0].value, dials);
    current = [...character.clips.keys()][0];
    const stage = document.getElementById("stage");
    stage.width = member.canvasW * SCALE;
    stage.height = member.canvasH * SCALE;
    document.getElementById("blurb").textContent = member.blurb;
    document.getElementById("theme").textContent = `Theme: ${member.themes[0].label}`;
    document.getElementById("audit").textContent = "";
    for (const b of document.querySelectorAll("[data-cast]")) {
      b.classList.toggle("on", b.dataset.cast === member.id);
    }
    buildClipButtons();
    buildDialSliders();
    player.set(getBaked(current));
    selectClip(current);
  }
  function wire() {
    const row = document.getElementById("cast");
    for (const member of CAST) {
      const b = document.createElement("button");
      b.dataset.cast = member.id;
      b.textContent = member.name;
      b.addEventListener("click", () => selectCharacter(member));
      row.append(b);
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
    const themeBtn = document.getElementById("theme");
    themeBtn.addEventListener("click", () => {
      themeIndex = (themeIndex + 1) % cast.themes.length;
      themeBtn.textContent = `Theme: ${cast.themes[themeIndex].label}`;
      rebuild();
      renderFrame();
    });
    document.getElementById("run-audit").addEventListener("click", runAudit);
  }
  function start() {
    wire();
    selectCharacter(CAST[0]);
    lastTick = performance.now();
    requestAnimationFrame(tick);
  }
  start();
})();
