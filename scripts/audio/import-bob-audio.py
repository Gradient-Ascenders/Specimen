#!/usr/bin/env python3
"""Prepare the requester-selected ElevenLabs Bob pack. Requires numpy/soundfile.

Usage: python3 scripts/audio/import-bob-audio.py [path/to/bob-sounds.tar]
The original archive is preserved under assets/audio/bob, outside production.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/audio/bob/bob-sounds.tar"
OUTPUT = ROOT / "public/assets/audio/bob"
# Strong jump/landing downloads contain an earlier, separate preparation sound.
# Start just ahead of their main release/contact so feedback follows physics.
CLIPS = {
    "bob-contact-01": ("1-soft-body-contact.wav", 0.0),
    "bob-jump-01": ("2-normal-jump.wav", 0.0),
    "bob-charged-jump-01": ("3-powerful-jump.wav", 0.58),
    "bob-land-soft-01": ("soft-landing.wav", 0.065),
    "bob-land-hard-01": ("hard-fall.wav", 0.30),
    "bob-detach-01": ("detach.ogg", 0.0),
    "bob-fall-01": ("death.wav", 0.0),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", nargs="?", type=Path, default=SOURCE)
    args = parser.parse_args()
    with tarfile.open(args.archive) as archive:
        members = {}
        for member in archive.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or not member.isfile():
                raise ValueError(f"Unexpected archive member: {member.name}")
            if member.name in members:
                raise ValueError(f"Duplicate archive member: {member.name}")
            members[member.name] = archive.extractfile(member).read()
    if set(members) != {source for source, _ in CLIPS.values()}:
        raise ValueError("Archive does not match the selected seven-clip Bob pack")

    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    if args.archive.resolve() != SOURCE.resolve():
        shutil.copyfile(args.archive, SOURCE)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    inventory = []
    sources = []
    for sound, (name, start_seconds) in CLIPS.items():
        original, rate = sf.read(io.BytesIO(members[name]), always_2d=True)
        if rate != 48000 or not np.isfinite(original).all():
            raise ValueError(f"Unexpected or invalid source audio: {name}")
        mono = original.mean(axis=1)[round(start_seconds * rate):].copy()
        mono -= mono.mean()
        # Correct level differences without compression, synthesis or denoising.
        rms = float(np.sqrt(np.mean(mono ** 2)))
        gain = min(3.0, 0.065 / max(rms, 1e-9), 0.75 / max(float(np.abs(mono).max()), 1e-9))
        mono *= gain
        edge = round(0.002 * rate)
        mono[:edge] *= np.linspace(0, 1, edge)
        mono[-edge:] *= np.linspace(1, 0, edge)
        path = OUTPUT / f"{sound}.ogg"
        sf.write(path, mono, rate, format="OGG", subtype="VORBIS")
        decoded, rate = sf.read(path)
        peak = float(np.max(np.abs(decoded)))
        if not np.isfinite(decoded).all() or peak >= 0.95:
            raise ValueError(f"Invalid encoded audio: {sound}")
        inventory.append({"id": sound, "path": str(path.relative_to(ROOT / "public")),
                          "durationSeconds": round(len(decoded) / rate, 6),
                          "sampleRate": rate, "channels": 1, "peak": round(peak, 5), "loop": False})
        sources.append({"id": sound, "source": name, "sourceSha256": hashlib.sha256(members[name]).hexdigest(),
                        "sourceDurationSeconds": round(len(original) / rate, 6),
                        "sourceChannels": original.shape[1], "trimStartSeconds": start_seconds,
                        "gain": round(gain, 6), "rms": round(float(np.sqrt(np.mean(decoded ** 2))), 6)})
        print(f"{name} -> {sound}.ogg: {len(decoded) / rate:.3f}s, peak {peak:.3f}")

    for old in ("bob-bounce-01", "bob-charge-loop-01", "bob-impact-01", "bob-movement-loop-01",
                "bob-respawn-01", "bob-slip-01", "bob-squish-01", "bob-stick-01",
                "bob-wall-crawl-loop-01", "bob-wall-step-01"):
        (OUTPUT / f"{old}.ogg").unlink(missing_ok=True)
    inventory_path = ROOT / "assets/audio/manifests/gameplay-audio-inventory.json"
    others = [row for row in json.loads(inventory_path.read_text()) if not row["id"].startswith("bob-")]
    inventory_path.write_text(json.dumps(sorted(inventory + others, key=lambda row: row["id"]), indent=2) + "\n")
    (ROOT / "assets/audio/manifests/bob-audio-import.json").write_text(json.dumps({
        "archive": str(SOURCE.relative_to(ROOT)),
        "archiveSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "processing": "Stereo average to mono, documented onset trims, gain only, 2 ms edge fades, OGG Vorbis.",
        "clips": sources,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
