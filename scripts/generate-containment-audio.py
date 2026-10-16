#!/usr/bin/env python3
"""Original Containment audio sketch. Requires numpy and soundfile (Vorbis).

Run from any directory: python3 scripts/generate-containment-audio.py
No samples, external music, or generation services are used. All loop events
and delay tails wrap onto the timeline rather than fading to silence each lap.
"""
from pathlib import Path
import json

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/assets/audio/containment"
RATE = 32000
TAU = 2 * np.pi
RNG = np.random.default_rng(1847)


def timeline(seconds):
    return np.arange(round(seconds * RATE)) / RATE


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def circular_add(track, sound, start, pan=0):
    # Equal-power stereo; wrap the release and reflections across the seam.
    stereo = sound[:, None] * np.array([
        np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    ])
    offset = round(start * RATE) % len(track)
    first = min(len(stereo), len(track) - offset)
    track[offset:offset + first] += stereo[:first]
    if first < len(stereo):
        track[:len(stereo) - first] += stereo[first:]


def envelope(t, attack, release):
    return (1 - np.exp(-t / attack)) * np.exp(-t / release)


def periodic_noise(seconds, low, high):
    # Spectral shaping produces band-limited noise with a periodic boundary.
    n = round(seconds * RATE)
    bins = np.fft.rfftfreq(n, 1 / RATE)
    shape = (1 - np.exp(-(bins / low) ** 4)) * np.exp(-(bins / high) ** 2)
    spectrum = (RNG.normal(size=len(bins)) + 1j * RNG.normal(size=len(bins))) * shape
    spectrum[0] = 0
    noise = np.fft.irfft(spectrum, n)
    return noise / np.std(noise)


def score():
    track = np.zeros((64 * RATE, 2))
    # Sixteen bars at 60 BPM. D minor/add9 -> Bbmaj7 -> Fadd9 -> Csus2.
    chords = [(50, 57, 60, 64), (46, 53, 57, 60),
              (41, 53, 57, 67), (48, 55, 62, 67)]
    for bar, chord in enumerate(chords):
        t = timeline(23)
        window = np.sin(np.pi * np.minimum(t / 4, 1) / 2) ** 2
        window *= np.cos(np.pi * np.clip((t - 15) / 8, 0, 1) / 2) ** 2
        for index, note in enumerate(chord):
            f = hz(note)
            tone = (np.sin(TAU * f * t + 0.09 * np.sin(TAU * 0.13 * t))
                    + 0.32 * np.sin(TAU * f * 1.0016 * t + 0.7)
                    + 0.09 * np.sin(TAU * f * 2 * t))
            circular_add(track, tone * window * 0.046, bar * 16, (index - 1.5) * 0.4)
    # A small motif with generous space, softened bell partials and reflections.
    melody = [(2, 74), (5.5, 69), (10, 76), (13, 77), (20, 74),
              (26.5, 72), (34, 69), (39, 72), (45, 76), (51, 74), (58, 69)]
    t = timeline(6)
    for index, (start, note) in enumerate(melody):
        f = hz(note)
        note_audio = (np.sin(TAU * f * t + 0.35 * np.sin(TAU * f * 2 * t) * np.exp(-t / 0.6))
                      + 0.13 * np.sin(TAU * f * 3 * t) * np.exp(-t / 0.9))
        note_audio *= envelope(t, 0.014, 1.3) * 0.07
        note_audio *= np.clip((6 - t) / 0.4, 0, 1)
        pan = (-1 if index % 2 else 1) * 0.25
        circular_add(track, note_audio, start, pan)
        for delay, level in [(0.43, 0.27), (0.89, 0.14), (1.37, 0.07)]:
            circular_add(track, note_audio * level, start + delay, -pan)
    # Muted low pulses avoid a continuous percussion loop while giving motion.
    t = timeline(1.5)
    for beat in range(0, 64, 2):
        f = hz(chords[beat // 16][0] - 12)
        pulse = np.sin(TAU * f * t + 0.8 * (1 - np.exp(-t * 12)))
        pulse *= envelope(t, 0.018, 0.25) * (0.055 if beat % 4 == 0 else 0.025)
        pulse *= np.clip((1.5 - t) / 0.2, 0, 1)
        circular_add(track, pulse, beat)
    return track


def air():
    t = timeline(16)
    return np.column_stack([
        periodic_noise(16, 95, 1150) * (0.085 + 0.014 * np.sin(TAU * t / 16)),
        periodic_noise(16, 95, 1150) * (0.085 + 0.014 * np.cos(TAU * t / 16))
    ])


def machine():
    t = timeline(12)
    hum = (0.12 * np.sin(TAU * 60 * t) + 0.045 * np.sin(TAU * 120 * t)
           + 0.018 * np.sin(TAU * 181 * t))
    return hum * (0.8 + 0.15 * np.sin(TAU * t / 6)) + periodic_noise(12, 180, 650) * 0.025


def checkpoint():
    t = timeline(1.6)
    result = np.zeros(len(t))
    for start, note, gain in [(0, 74, 0.24), (0.13, 81, 0.17), (0.27, 88, 0.09)]:
        local = np.maximum(0, t - start)
        tone = np.sin(TAU * hz(note) * local) + 0.1 * np.sin(TAU * hz(note) * 2 * local)
        result += tone * envelope(local, 0.004, 0.26) * gain
    return result


def laser(power_on):
    t = timeline(0.42 if power_on else 0.3)
    frequency = (160 + 1100 * (1 - np.exp(-t * 30))) if power_on else (100 + 900 * np.exp(-t * 18))
    phase = TAU * np.cumsum(frequency) / RATE
    body = np.sin(phase + 0.9 * np.sin(phase * 2.01) * np.exp(-t * 16))
    noise = periodic_noise(len(t) / RATE, 600, 4000)
    return (body * 0.3 + noise * 0.055 * np.exp(-t * 35)) * envelope(t, 0.002, 0.065)


def switch():
    t = timeline(0.18)
    return (np.sin(TAU * 740 * t) * 0.14 + np.sin(TAU * 1110 * t) * 0.05
            + periodic_noise(0.18, 1200, 4500) * 0.045) * envelope(t, 0.001, 0.024)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    inventory = []
    sounds = {"containment-score": score(), "lab-air-loop": air(),
              "lab-machine-loop": machine(), "lab-checkpoint": checkpoint(),
              "lab-laser-on": laser(True), "lab-laser-off": laser(False),
              "lab-switch": switch()}
    for name, signal in sounds.items():
        loop = name.endswith("loop") or name == "containment-score"
        signal -= np.mean(signal, axis=0)
        if not loop:
            # Silence at both ends prevents discontinuities in short one-shots.
            edge = min(round(RATE * 0.004), len(signal) // 2)
            signal[:edge] *= np.linspace(0, 1, edge)
            signal[-edge:] *= np.linspace(1, 0, edge)
        peak = np.max(np.abs(signal))
        if peak > 0.7:
            signal *= 0.7 / peak
        path = OUTPUT / f"{name}.ogg"
        sf.write(path, signal, RATE, format="OGG", subtype="VORBIS")
        decoded, rate = sf.read(path, always_2d=True)
        assert np.isfinite(decoded).all() and np.max(np.abs(decoded)) < 0.95
        inventory.append({"id": name, "path": str(path.relative_to(ROOT / "public")),
                          "durationSeconds": len(decoded) / rate, "sampleRate": rate,
                          "channels": decoded.shape[1], "peak": round(float(np.max(np.abs(decoded))), 5),
                          "rms": round(float(np.sqrt(np.mean(decoded ** 2))), 5),
                          "loop": loop, "bytes": path.stat().st_size,
                          "boundaryStep": round(float(np.max(np.abs(decoded[0] - decoded[-1]))), 5)})
        print(f"{name}: {len(decoded) / rate:.2f}s, {path.stat().st_size:,} bytes")
    (ROOT / "docs/assets/containment-audio-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")


if __name__ == "__main__":
    main()
