#!/usr/bin/env python3
"""Synthesises the reel's 30 s soundtrack (128 BPM, A minor) to out/soundtrack.wav.

Every hit sits on the same bar/beat grid as src/lib.js, so cuts, flashes and
drops line up with the picture. Needs numpy and scipy.
"""

from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
BPM = 128
BEAT = 60 / BPM
BAR = BEAT * 4
DUR = BAR * 16
N = int(DUR * SR)
rng = np.random.default_rng(128)


def at(bar, beats=0.0):
    return bar * BAR + beats * BEAT


def hz(note):
    """MIDI note number to frequency."""
    return 440.0 * 2 ** ((note - 69) / 12)


A1, C2, F1, G1 = 33, 36, 29, 31


class Bus:
    def __init__(self):
        self.buf = np.zeros((N, 2))

    def add(self, sig, t0, gain=1.0, pan=0.0):
        i = int(round(t0 * SR))
        if i >= N:
            return
        if i < 0:
            sig = sig[-i:]
            i = 0
        sig = sig[: N - i]
        left = np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
        right = np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        if sig.ndim == 1:
            self.buf[i : i + len(sig), 0] += sig * gain * left
            self.buf[i : i + len(sig), 1] += sig * gain * right
        else:
            self.buf[i : i + len(sig)] += sig * gain


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def noise(dur):
    return rng.uniform(-1, 1, int(dur * SR))


def filt(x, kind, freq, order=2):
    sos = signal.butter(order, freq, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def saw(freq, t):
    return 2 * ((freq * t) % 1.0) - 1


def env(t, attack, decay):
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def sweep_filter(x, kind, f0, f1, block=512):
    """Block-wise filter whose cutoff glides exponentially from f0 to f1."""
    out = np.zeros_like(x)
    zi = None
    blocks = int(np.ceil(len(x) / block))
    for b in range(blocks):
        f = f0 * (f1 / f0) ** (b / max(1, blocks - 1))
        sos = signal.butter(2, f, btype=kind, fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        seg = x[b * block : (b + 1) * block]
        out[b * block : (b + 1) * block], zi = signal.sosfilt(sos, seg, zi=zi)
    return out


# Instruments ----------------------------------------------------------------

def kick(hard=1.0):
    t = tt(0.55)
    phase = 2 * np.pi * np.cumsum(46 + 120 * hard * np.exp(-t * 30)) / SR
    body = np.sin(phase) * np.exp(-t * 6.5)
    click = filt(noise(0.006), "highpass", 2500) * 0.6
    body[: len(click)] += click
    return np.tanh(body * 1.6)


def clap():
    out = np.zeros(int(0.35 * SR))
    for k, d in enumerate([0, 0.011, 0.023]):
        n = filt(noise(0.3), "bandpass", [900, 3200]) * np.exp(-tt(0.3) / (0.012 if k < 2 else 0.09))
        i = int(d * SR)
        out[i : i + len(n)] += n[: len(out) - i]
    return out


def snare():
    t = tt(0.22)
    return filt(noise(0.22), "bandpass", [1400, 7000]) * np.exp(-t / 0.05) + np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.04) * 0.5


def hat(open_=False):
    d = 0.3 if open_ else 0.05
    return filt(noise(d), "highpass", 7500) * np.exp(-tt(d) / (0.09 if open_ else 0.014))


def pluck(note, dur=0.3, bright=4000):
    t = tt(dur)
    f = hz(note)
    x = (saw(f, t) + saw(f * 1.004, t)) * 0.5
    return filt(x * env(t, 0.002, dur / 3.5), "lowpass", bright)


def bell(note, dur=2.5):
    t = tt(dur)
    f = hz(note)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t * 3)
    return np.sin(2 * np.pi * f * t + mod) * env(t, 0.003, dur / 4)


def pad(notes, dur, cutoff=1400):
    t = tt(dur)
    x = np.zeros((len(t), 2))
    for n in notes:
        for k, det in enumerate([-0.07, 0.0, 0.07]):
            f = hz(n + det)
            ph = rng.uniform()
            x[:, k % 2] += saw(f, t + ph / f)
            x[:, (k + 1) % 2] += saw(f, t + ph / f) * 0.4
    x = filt(x, "lowpass", cutoff)
    shape = np.minimum(1, t / 0.25) * np.minimum(1, (dur - t) / 0.3)
    return x * shape[:, None] / (len(notes) * 3)


def sub(note, dur):
    t = tt(dur)
    x = np.sin(2 * np.pi * hz(note) * t) + 0.25 * np.sin(4 * np.pi * hz(note) * t)
    return np.tanh(1.5 * x * np.minimum(1, t / 0.005) * np.minimum(1, (dur - t) / 0.02))


def riser(dur, f0=300, f1=9000):
    x = sweep_filter(noise(dur), "lowpass", f0, f1)
    t = tt(dur)
    tone = np.sin(2 * np.pi * np.cumsum(180 * (6 ** (t / dur))) / SR) * 0.25
    return (x + tone) * (t / dur) ** 2.2


def whoosh(dur=0.5):
    t = tt(dur)
    x = sweep_filter(noise(dur), "lowpass", 400, 7000)
    return x * np.sin(np.pi * t / dur) ** 2


def boom(dur=2.2):
    t = tt(dur)
    phase = 2 * np.pi * np.cumsum(30 + 90 * np.exp(-t * 5)) / SR
    return np.tanh(2.2 * np.sin(phase) * np.exp(-t * 1.6))


def crash(dur=2.5):
    t = tt(dur)
    return filt(noise(dur), "highpass", 3000) * np.exp(-t / 0.7)


def blip(note):
    t = tt(0.07)
    sq = np.sign(np.sin(2 * np.pi * hz(note) * t))
    return np.round(sq * env(t, 0.001, 0.03) * 6) / 6


def reverb(x, seconds=2.6, damp=4500):
    t = tt(seconds)
    ir = np.stack([filt(noise(seconds), "lowpass", damp) * np.exp(-t * 6.9 / seconds) for _ in range(2)], axis=1)
    ir[: int(0.012 * SR)] = 0
    ir /= np.sqrt((ir**2).sum(axis=0))
    return np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:N] for c in range(2)], axis=1) * 0.6


def duck(times, depth=0.7, release=0.16):
    g = np.ones(N)
    for t0 in times:
        i = int(t0 * SR)
        k = tt(0.6)
        g[i : i + len(k)] = np.minimum(g[i : i + len(k)], 1 - depth * np.exp(-k / release)[: max(0, N - i)])
    return g[:, None]


# Arrangement ------------------------------------------------------------------

DROP, WALL, LOOP, END = at(4), at(12), at(13), at(14)
CHORDS = [  # pad voicing, bass root
    ([57, 60, 64, 67], A1),  # Am7
    ([53, 57, 60, 64], F1),  # Fmaj7
    ([55, 60, 64, 71], C2),  # Cmaj7
    ([55, 59, 62, 69], G1),  # Gadd9
]

drums, music, fx, verb = Bus(), Bus(), Bus(), Bus()
kicks = []

# Intro: drone, crackle and one music-box note per word.
music.add(pad([45, 52], at(4) - 0.05, cutoff=500), 0, 0.22)
for k in range(60):
    tc = rng.uniform(0.3, at(4))
    fx.add(filt(noise(0.004), "bandpass", [2000, 6000]), tc, rng.uniform(0.05, 0.18), rng.uniform(-0.6, 0.6))
for k, note in enumerate([69, 72, 76, 79, 81]):
    n = bell(note, 2.2) * 0.5
    n[: int(0.5 * SR)] += pluck(note, 0.5, 2500) * 0.3
    music.add(n, at(0, k + 1), 0.32, (k - 2) * 0.2)
    verb.add(n, at(0, k + 1), 0.35)
fx.add(bell(93, 1.2), at(1, 1) + 0.34, 0.12)

# Burnout: pulse, ticking hats, hits on every word, stutters, riser into the drop.
for b in range(8):
    tb = at(2, b)
    kicks.append(tb)
    drums.add(kick(0.6), tb, 0.55)
for s in range(16 * 2):
    ts = at(2) + s * BEAT / 4
    if ts < at(3, 3):
        drums.add(hat(), ts, 0.12 if s % 2 else 0.2, 0.3)
for s in range(16):
    music.add(sub(A1, BEAT / 2 * 0.8), at(2) + s * BEAT / 2, 0.28)
for k, tw_ in enumerate([at(2, 0), at(2, 1), at(2, 2), at(2, 3), at(3, 0), at(3, 0.5)]):
    fx.add(filt(noise(0.12), "bandpass", [300, 2500]) * np.exp(-tt(0.12) / 0.03), tw_, 0.35)
    drums.add(snare(), tw_, 0.25)
for k, tr in enumerate([at(3, 1), at(3, 1.5), at(3, 2), at(3, 2.25), at(3, 2.5), at(3, 2.75)]):
    fx.add(blip(76 + k * 2), tr, 0.16, 0.4 if k % 2 else -0.4)
fx.add(riser(at(4) - at(2, 2)), at(2, 2), 0.32)
rev = crash(1.2)[::-1] * 0.8
fx.add(rev, DROP - len(rev) / SR, 0.35)

# The drop.
fx.add(boom(), DROP, 0.9)
fx.add(crash(3.0), DROP, 0.45)
verb.add(crash(1.0), DROP, 0.5)
stab = pad([57, 60, 64, 71, 76], 1.6, cutoff=5000)
music.add(stab, DROP, 0.9)
verb.add(stab, DROP, 0.6)

# Groove: bars 4–11.
for bar in range(4, 12):
    notes, root = CHORDS[bar % 4]
    for b in range(4):
        tb = at(bar, b)
        kicks.append(tb)
        drums.add(kick(), tb, 0.8)
        if b % 2:
            drums.add(clap(), tb, 0.42)
            verb.add(clap(), tb, 0.25)
        drums.add(hat(True), tb + BEAT / 2, 0.1, -0.3)
    for s in range(16):
        drums.add(hat(), at(bar) + s * BEAT / 4, [0.16, 0.06, 0.1, 0.06][s % 4], 0.35)
    for s in range(8):
        n = root + (12 if s % 4 == 3 else 0)
        music.add(sub(n, BEAT / 2 * 0.85), at(bar) + s * BEAT / 2, 0.36)
    p = pad(notes, BAR + 0.05, cutoff=1100 + 200 * (bar - 4))
    music.add(p, at(bar), 0.5)
    verb.add(p, at(bar), 0.18)
    arp = [0, 1, 2, 3, 2, 1, 3, 2]
    for s in range(16):
        n = notes[arp[s % 8]] + 12
        a = pluck(n, 0.22, 3500)
        music.add(a, at(bar) + s * BEAT / 4, 0.1, 0.35 if s % 2 else -0.35)
        for echo in range(1, 3):
            music.add(a, at(bar) + s * BEAT / 4 + echo * BEAT * 0.75, 0.1 * 0.4**echo, -0.5 if echo % 2 else 0.5)
for k in range(6):
    tc = at(6 + k)
    fx.add(whoosh(0.5), tc - 0.42, 0.45, -0.6 + k * 0.24)
    drums.add(kick(1.4), tc, 0.25)
    verb.add(snare(), tc, 0.2)
music.add(riser(1.0, 200, 4000), at(5) - 0.2, 0.12)

# Wall: drums breathe out, a big swell.
fx.add(whoosh(0.8)[::-1], WALL - 0.7, 0.3)
fx.add(boom(1.6), WALL, 0.35)
swell = pad([45, 57, 60, 64, 71], BAR + 0.1, cutoff=2400)
music.add(swell, WALL, 0.7)
verb.add(swell, WALL, 0.35)
for s in range(16):
    notes, _ = CHORDS[0]
    music.add(pluck(notes[s % 4] + 12, 0.25, 3000), WALL + s * BEAT / 4, 0.07, 0.3 if s % 2 else -0.3)

# Loop: a note on each station, a snare roll and riser into the final hit.
for k, note in enumerate([81, 84, 88, 91]):
    b = bell(note, 1.6)
    music.add(b, LOOP + k * BEAT, 0.28, [-0.1, 0.4, 0.1, -0.4][k])
    verb.add(b, LOOP + k * BEAT, 0.3)
    kicks.append(LOOP + k * BEAT)
    drums.add(kick(0.9), LOOP + k * BEAT, 0.7)
roll = [LOOP + i * BEAT / 2 for i in range(4)] + [LOOP + 2 * BEAT + i * BEAT / 4 for i in range(4)] + [LOOP + 3 * BEAT + i * BEAT / 8 for i in range(8)]
for i, tr in enumerate(roll):
    drums.add(snare(), tr, 0.1 + 0.25 * i / len(roll))
fx.add(riser(BAR, 400, 12000), LOOP, 0.35)
music.add(sub(A1, BAR * 0.95), LOOP, 0.25)

# End card.
fx.add(boom(2.8), END, 0.85)
fx.add(crash(3.5), END, 0.35)
final = pad([45, 57, 60, 64, 67, 71], DUR - END, cutoff=2600)
music.add(final, END, 0.75)
verb.add(final, END, 0.35)
for k, note in enumerate([81, 88, 93, 96, 100]):
    b = bell(note, 2.5)
    music.add(b, END + 0.3 + k * BEAT / 2, 0.14, (k - 2) * 0.3)
    verb.add(b, END + 0.3 + k * BEAT / 2, 0.25)
music.add(sub(A1, 2.5), END, 0.35)

# Mix -------------------------------------------------------------------------

side = duck(kicks, 0.65)
mix = drums.buf + music.buf * side + fx.buf + reverb(verb.buf + music.buf * 0.08)
mix = filt(mix, "highpass", 28)
t = np.arange(N) / SR
fade = np.minimum(1, t / 0.08) * np.clip((DUR - t) / 0.45, 0, 1)
mix *= fade[:, None]
mix = np.tanh(mix * 1.1)
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))

out = Path(__file__).parent / "out"
out.mkdir(exist_ok=True)
wavfile.write(out / "soundtrack.wav", SR, (mix * 32767).astype(np.int16))
print(f"Wrote {out / 'soundtrack.wav'} ({DUR:.2f} s)")
