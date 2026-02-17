// High-performance canvas particle system for Tetris
// Supports thousands of particles at 60fps using Canvas2D with additive blending

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  sizeEnd: number;
  color: string;
  r: number;
  g: number;
  b: number;
  alpha: number;
  alphaDecay: number;
  gravity: number;
  drag: number;
  rotation: number;
  rotationSpeed: number;
  shape: 'circle' | 'square' | 'spark' | 'star' | 'ring';
  glow: number;        // glow radius multiplier
  pulse: number;       // pulse frequency (0 = no pulse)
  turbulence: number;  // random motion each frame
}

export type ParticlePreset =
  | 'lineClear'
  | 'hardDrop'
  | 'pieceLock'
  | 'tetris'     // 4-line clear
  | 'combo'
  | 'ambient'
  | 'gameOver'
  | 'levelUp';

interface EmitConfig {
  x: number;
  y: number;
  count: number;
  preset: ParticlePreset;
  color?: string;
  spread?: number;   // angular spread in radians
  direction?: number; // base angle in radians
  intensity?: number; // multiplier for velocity/count
}

// Parse hex color to RGB
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

// Lerp utility
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Random range
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Random from array
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Preset factories ──────────────────────────────────────────────

function createLineClearParticle(x: number, y: number, color: string): Partial<Particle> {
  const [r, g, b] = hexToRgb(color);
  const angle = rand(0, Math.PI * 2);
  const speed = rand(1.5, 6);
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - rand(0.5, 2),
    life: 0, maxLife: rand(40, 80),
    size: rand(2, 5), sizeEnd: 0,
    r, g, b, alpha: 1, alphaDecay: 0,
    gravity: 0.04,
    drag: 0.98,
    rotation: rand(0, Math.PI * 2),
    rotationSpeed: rand(-0.15, 0.15),
    shape: pick(['circle', 'square', 'spark']),
    glow: 1.5,
    pulse: 0,
    turbulence: 0.3,
    color,
  };
}

function createTetrisParticle(x: number, y: number, color: string): Partial<Particle> {
  const [r, g, b] = hexToRgb(color);
  const angle = rand(0, Math.PI * 2);
  const speed = rand(3, 10);
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - rand(1, 4),
    life: 0, maxLife: rand(60, 120),
    size: rand(3, 8), sizeEnd: 0,
    r, g, b, alpha: 1, alphaDecay: 0,
    gravity: 0.03,
    drag: 0.97,
    rotation: rand(0, Math.PI * 2),
    rotationSpeed: rand(-0.2, 0.2),
    shape: pick(['circle', 'star', 'spark', 'ring']),
    glow: 2.5,
    pulse: rand(0, 0.1),
    turbulence: 0.5,
    color,
  };
}

function createHardDropParticle(x: number, y: number, color: string): Partial<Particle> {
  const [r, g, b] = hexToRgb(color);
  const angle = rand(-Math.PI * 0.8, -Math.PI * 0.2); // upward fan
  const speed = rand(2, 7);
  return {
    x: x + rand(-3, 3), y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0, maxLife: rand(25, 55),
    size: rand(1.5, 4), sizeEnd: 0.5,
    r, g, b, alpha: 1, alphaDecay: 0,
    gravity: 0.08,
    drag: 0.96,
    rotation: 0,
    rotationSpeed: rand(-0.1, 0.1),
    shape: pick(['spark', 'circle']),
    glow: 1.2,
    pulse: 0,
    turbulence: 0.2,
    color,
  };
}

function createPieceLockParticle(x: number, y: number, color: string): Partial<Particle> {
  const [r, g, b] = hexToRgb(color);
  const angle = rand(0, Math.PI * 2);
  const speed = rand(0.3, 1.5);
  return {
    x: x + rand(-2, 2), y: y + rand(-2, 2),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - rand(0.2, 0.8),
    life: 0, maxLife: rand(15, 35),
    size: rand(1, 2.5), sizeEnd: 0,
    r, g, b, alpha: 0.8, alphaDecay: 0,
    gravity: 0.01,
    drag: 0.99,
    rotation: 0,
    rotationSpeed: 0,
    shape: pick(['circle', 'spark']),
    glow: 0.8,
    pulse: 0,
    turbulence: 0.1,
    color,
  };
}

function createComboParticle(x: number, y: number, color: string): Partial<Particle> {
  const [r, g, b] = hexToRgb(color);
  const angle = rand(0, Math.PI * 2);
  const speed = rand(2, 8);
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - rand(1, 3),
    life: 0, maxLife: rand(50, 100),
    size: rand(2, 6), sizeEnd: 0,
    r, g, b, alpha: 1, alphaDecay: 0,
    gravity: 0.02,
    drag: 0.975,
    rotation: rand(0, Math.PI * 2),
    rotationSpeed: rand(-0.2, 0.2),
    shape: pick(['star', 'ring', 'circle', 'spark']),
    glow: 2,
    pulse: rand(0.05, 0.15),
    turbulence: 0.6,
    color,
  };
}

function createAmbientParticle(x: number, y: number, _color: string): Partial<Particle> {
  const ambientColors = ['#ffffff', '#d4a44c', '#00d4d4', '#9b59b6'];
  const c = pick(ambientColors);
  const [r, g, b] = hexToRgb(c);
  return {
    x: x + rand(-10, 10), y: y + rand(-10, 10),
    vx: rand(-0.15, 0.15),
    vy: rand(-0.4, -0.1),
    life: 0, maxLife: rand(80, 200),
    size: rand(0.5, 1.5), sizeEnd: 0,
    r, g, b, alpha: 0.3, alphaDecay: 0,
    gravity: -0.005,
    drag: 0.999,
    rotation: 0,
    rotationSpeed: 0,
    shape: 'circle',
    glow: 0.5,
    pulse: rand(0.02, 0.06),
    turbulence: 0.15,
    color: c,
  };
}

function createGameOverParticle(x: number, y: number, _color: string): Partial<Particle> {
  const colors = ['#e74c3c', '#ff6b6b', '#ff4444', '#cc0000', '#ff8888'];
  const c = pick(colors);
  const [r, g, b] = hexToRgb(c);
  const angle = rand(-Math.PI, 0); // upward
  const speed = rand(1, 5);
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0, maxLife: rand(60, 140),
    size: rand(2, 6), sizeEnd: 0,
    r, g, b, alpha: 1, alphaDecay: 0,
    gravity: 0.05,
    drag: 0.98,
    rotation: rand(0, Math.PI * 2),
    rotationSpeed: rand(-0.1, 0.1),
    shape: pick(['circle', 'square', 'spark']),
    glow: 1.5,
    pulse: 0,
    turbulence: 0.4,
    color: c,
  };
}

function createLevelUpParticle(x: number, y: number, _color: string): Partial<Particle> {
  const colors = ['#ffd700', '#ffec80', '#d4a44c', '#ffe066', '#fff'];
  const c = pick(colors);
  const [r, g, b] = hexToRgb(c);
  const angle = rand(0, Math.PI * 2);
  const speed = rand(1, 6);
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - rand(0.5, 2),
    life: 0, maxLife: rand(50, 100),
    size: rand(2, 5), sizeEnd: 0,
    r, g, b, alpha: 1, alphaDecay: 0,
    gravity: 0.02,
    drag: 0.98,
    rotation: rand(0, Math.PI * 2),
    rotationSpeed: rand(-0.15, 0.15),
    shape: pick(['star', 'circle', 'ring']),
    glow: 2,
    pulse: rand(0.05, 0.1),
    turbulence: 0.3,
    color: c,
  };
}

const PRESET_FACTORIES: Record<ParticlePreset, (x: number, y: number, color: string) => Partial<Particle>> = {
  lineClear: createLineClearParticle,
  hardDrop: createHardDropParticle,
  pieceLock: createPieceLockParticle,
  tetris: createTetrisParticle,
  combo: createComboParticle,
  ambient: createAmbientParticle,
  gameOver: createGameOverParticle,
  levelUp: createLevelUpParticle,
};

// ── Particle Engine ───────────────────────────────────────────────

const MAX_PARTICLES = 4000;

export class ParticleEngine {
  private particles: Particle[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animFrame: number = 0;
  private running = false;
  private _screenShake = 0;
  private _shakeIntensity = 0;

  // Screen shake state (exposed for the board renderer)
  get shakeX(): number {
    if (this._screenShake <= 0) return 0;
    return (Math.random() - 0.5) * this._shakeIntensity * (this._screenShake / 15);
  }
  get shakeY(): number {
    if (this._screenShake <= 0) return 0;
    return (Math.random() - 0.5) * this._shakeIntensity * (this._screenShake / 15);
  }

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    if (!this.running) {
      this.running = true;
      this.loop();
    }
  }

  detach() {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
  }

  resize(width: number, height: number) {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx?.scale(dpr, dpr);
  }

  emit(config: EmitConfig) {
    const factory = PRESET_FACTORIES[config.preset];
    if (!factory) return;

    const count = Math.min(
      Math.floor(config.count * (config.intensity || 1)),
      MAX_PARTICLES - this.particles.length,
    );

    const color = config.color || '#ffffff';

    for (let i = 0; i < count; i++) {
      const p = factory(config.x, config.y, color) as Particle;
      // Apply spread/direction overrides
      if (config.direction !== undefined && config.spread !== undefined) {
        const angle = config.direction + rand(-config.spread / 2, config.spread / 2);
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
      }
      this.particles.push(p);
    }
  }

  shake(frames: number, intensity: number) {
    this._screenShake = Math.max(this._screenShake, frames);
    this._shakeIntensity = Math.max(this._shakeIntensity, intensity);
  }

  get particleCount() {
    return this.particles.length;
  }

  private loop = () => {
    if (!this.running) return;
    this.update();
    this.draw();
    this.animFrame = requestAnimationFrame(this.loop);
  };

  private update() {
    // Decrement screen shake
    if (this._screenShake > 0) {
      this._screenShake--;
      if (this._screenShake <= 0) {
        this._shakeIntensity = 0;
      }
    }

    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life++;
      if (p.life >= p.maxLife) continue;

      // Physics
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;

      // Turbulence
      if (p.turbulence > 0) {
        p.vx += (Math.random() - 0.5) * p.turbulence;
        p.vy += (Math.random() - 0.5) * p.turbulence;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      alive.push(p);
    }
    this.particles = alive;
  }

  private draw() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const w = canvas.style.width ? parseInt(canvas.style.width) : canvas.width;
    const h = canvas.style.height ? parseInt(canvas.style.height) : canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Use additive blending for glow effect
    ctx.globalCompositeOperation = 'lighter';

    for (const p of this.particles) {
      const t = p.life / p.maxLife; // 0..1 normalized lifetime
      const alpha = p.alpha * (1 - t * t); // quadratic fade
      const size = lerp(p.size, p.sizeEnd, t);

      if (alpha <= 0.01 || size <= 0.1) continue;

      // Pulse
      const pulseAlpha = p.pulse > 0
        ? alpha * (0.7 + 0.3 * Math.sin(p.life * p.pulse * Math.PI * 2))
        : alpha;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = pulseAlpha;

      // Glow layer (larger, dimmer)
      if (p.glow > 0) {
        const glowSize = size * p.glow * 2;
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
        gradient.addColorStop(0, `rgba(${p.r},${p.g},${p.b},${pulseAlpha * 0.3})`);
        gradient.addColorStop(1, `rgba(${p.r},${p.g},${p.b},0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(-glowSize, -glowSize, glowSize * 2, glowSize * 2);
      }

      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${pulseAlpha})`;

      switch (p.shape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'square':
          ctx.fillRect(-size, -size, size * 2, size * 2);
          break;

        case 'spark': {
          // Elongated spark aligned to velocity direction
          const len = size * 3;
          ctx.beginPath();
          ctx.moveTo(-len, 0);
          ctx.lineTo(0, -size * 0.4);
          ctx.lineTo(len, 0);
          ctx.lineTo(0, size * 0.4);
          ctx.closePath();
          ctx.fill();
          break;
        }

        case 'star': {
          const spikes = 4;
          const outerR = size;
          const innerR = size * 0.4;
          ctx.beginPath();
          for (let i = 0; i < spikes * 2; i++) {
            const angle = (i * Math.PI) / spikes - Math.PI / 2;
            const r = i % 2 === 0 ? outerR : innerR;
            if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          }
          ctx.closePath();
          ctx.fill();
          break;
        }

        case 'ring': {
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.lineWidth = size * 0.3;
          ctx.strokeStyle = `rgba(${p.r},${p.g},${p.b},${pulseAlpha})`;
          ctx.stroke();
          break;
        }
      }

      ctx.restore();
    }

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

// Singleton instance
export const particleEngine = new ParticleEngine();
