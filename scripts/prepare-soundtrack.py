#!/usr/bin/env python3
"""Reproduce Specimen's four normalized and loop-edited OGG soundtracks.

All sources are fetched from their selected OpenGameArt pages and SHA-256
verified before processing. No pitch, tempo, EQ or dynamics processing.
"""
from array import array
import hashlib
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.request

OUTPUT = Path(__file__).resolve().parents[1] / "public/assets/audio/music"
BASE = "https://opengameart.org/sites/default/files/"
# Destination, original filename, SHA-256, Hz, gain dB, trim start/end, seam blend, microfade
TRACKS = (
    ("00-intro-osmotic-memory.ogg", "osmotic_memory.flac",
     "9267f15f4be7f2ba30a6fdd14822f279e8e3296b7fe79f55867a56309e381dc8",
     48000, -2.59, 0, 195, 8, 0),
    ("01-containment-thought-loop.ogg", "thought_loop_-_g2tm.flac",
     "93e1c80ba5a19909a4c7547b011f543f2f527a84419d51f04d85f5550f3d3173",
     44100, 13.64, None, None, 0, .012),
    ("02-cultivation-unsolved-investigation.ogg", "Unsolved-Investigation-isaiah658.wav",
     "47c7db1ed04ba0e4ea62d2543aca3f961694bc0feca1b79126bef3f691371042",
     44100, .05, None, None, 0, 0),
    ("03-blackout-searching.ogg", "Searching.ogg",
     "add2ee7931fd0c53f2804220e7355b10b38dbf5ab2b4dfdd415b61d8e14e51c8",
     44100, -6.40, 1, 99, 6, 0),
)

def run(*cmd):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout

def download(filename, digest, directory):
    dest = directory / filename
    req = urllib.request.Request(BASE + filename, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as response, dest.open("wb") as output:
        shutil.copyfileobj(response, output)
    with dest.open("rb") as data:
        observed = hashlib.file_digest(data, "sha256").hexdigest()
    if observed != digest:
        raise ValueError(f"SHA-256 mismatch for {filename}: {observed}")
    return dest

def decode(path, rate):
    pcm = run("ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
              "-i", str(path), "-vn", "-f", "f32le", "-acodec", "pcm_f32le",
              "-ar", str(rate), "-ac", "2", "-")
    samples = array("f")
    samples.frombytes(pcm)
    return samples

def edit_loop(samples, rate, begin_s, end_s, fade_s, micro_s):
    channels = 2
    if fade_s:
        begin, end, fade = (round(s * rate) for s in (begin_s, end_s, fade_s))
        if len(samples) // channels < end:
            raise ValueError("Source shorter than expected loop trim")
        # Rotate the music's end into its beginning. The join is made inside
        # the fade window, retaining the unmodified middle of the recording.
        out = array("f")
        for i in range(fade):
            t = i / (fade - 1)
            for ch in range(channels):
                tail = samples[(end - fade + i) * channels + ch]
                head = samples[(begin + i) * channels + ch]
                out.append(tail * (1 - t) + head * t)
        out.extend(samples[(begin + fade) * channels:(end - fade) * channels])
        return out
    if micro_s:
        fade = round(micro_s * rate)
        frames = len(samples) // channels
        for i in range(fade):
            multiplier = .5 - .5 * math.cos(math.pi * i / max(1, fade - 1))
            for ch in range(channels):
                samples[i * channels + ch] *= multiplier
                samples[(frames - 1 - i) * channels + ch] *= multiplier
    return samples

def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="specimen-music-") as folder:
        folder = Path(folder)
        for dest, filename, sha, rate, gain, start, end, crossfade, microfade in TRACKS:
            source = download(filename, sha, folder)
            samples = edit_loop(decode(source, rate), rate, start, end, crossfade, microfade)
            raw = folder / "audio.f32"
            with raw.open("wb") as stream:
                samples.tofile(stream)
            run("ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "f32le", "-ar", str(rate), "-ac", "2", "-i", str(raw),
                "-af", f"volume={gain}dB", "-c:a", "libvorbis", "-q:a", "8", str(OUTPUT / dest))
            print(f"Created {dest}: {round(len(samples) / (rate * 2), 2)} seconds")

if __name__ == "__main__":
    main()
