#!/usr/bin/env python3
"""Prepare the four requester-selected ElevenLabs world interaction recordings (numpy/soundfile).

Usage: python3 scripts/audio/import-world-audio.py [path/to/world-interaction-sounds.tar]
The original archive is retained outside the production directory.
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
SOURCE = ROOT / 'assets/audio/world/world-interaction-sounds.tar'
OUTPUT = ROOT / 'public/assets/audio/world'
# source, leading/trailing trim, circular overlap (seconds)
CLIPS = {
    'world-door-movement-loop-01': ('door-movement.wav', 0, 1.12, 0.08),
    'world-door-stop-01': ('door-movement.wav', 0.9, 0, 0),
    'world-machinery-loop-01': ('machinery-loop.wav', 0, 0, 0.12),
    'world-laser-loop-01': ('laser-hum-loop.wav', 0, 0, 0.12),
    'world-activation-01': ('mechanical-activation.wav', 0.16, 0.57, 0),
    'world-release-01': ('mechanical-activation.wav', 0.53, 0.15, 0),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', nargs='?', type=Path, default=SOURCE)
    args = parser.parse_args()
    with tarfile.open(args.archive) as archive:
        members = {}
        for member in archive.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or not member.isfile() or member.name in members:
                raise ValueError(f'Unexpected archive member: {member.name}')
            members[member.name] = archive.extractfile(member).read()
    if set(members) != {clip[0] for clip in CLIPS.values()}:
        raise ValueError('Archive does not match the selected four-recording world pack')
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    if args.archive.resolve() != SOURCE.resolve():
        shutil.copyfile(args.archive, SOURCE)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    inventory, sources = [], []
    for sound, (name, start, end, overlap) in CLIPS.items():
        original, rate = sf.read(io.BytesIO(members[name]), always_2d=True)
        if rate != 48000 or not np.isfinite(original).all():
            raise ValueError(f'Unexpected or invalid source audio: {name}')
        mono = original.mean(axis=1)[round(start*rate):len(original)-round(end*rate)].copy()
        mono -= mono.mean()
        if overlap:
            # Circular overlap: end joins the beginning without a silent gap.
            edge = round(overlap*rate)
            blend = np.linspace(0, 1, edge)
            mono = np.concatenate((mono[edge:-edge], mono[-edge:]*(1-blend) + mono[:edge]*blend))
        rms = float(np.sqrt(np.mean(mono**2)))
        gain = min(3.0, (0.035 if overlap else 0.065)/max(rms, 1e-9), 0.75/max(float(np.abs(mono).max()), 1e-9))
        mono *= gain
        if not overlap:
            edge = round(0.002*rate)
            mono[:edge] *= np.linspace(0, 1, edge)
            mono[-edge:] *= np.linspace(1, 0, edge)
        path = OUTPUT / f'{sound}.ogg'
        sf.write(path, mono, rate, format='OGG', subtype='VORBIS')
        decoded, rate = sf.read(path)
        peak = float(np.abs(decoded).max())
        if not np.isfinite(decoded).all() or peak >= 0.95:
            raise ValueError(f'Invalid encoded audio: {sound}')
        inventory.append({'id': sound, 'path': str(path.relative_to(ROOT / 'public')),
                          'durationSeconds': round(len(decoded)/rate, 6), 'sampleRate': rate,
                          'channels': 1, 'peak': round(peak, 5), 'loop': bool(overlap)})
        sources.append({'id': sound, 'source': name, 'sourceSha256': hashlib.sha256(members[name]).hexdigest(),
                        'sourceDurationSeconds': round(len(original)/rate, 6), 'sourceChannels': original.shape[1],
                        'trimStartSeconds': start, 'trimEndSeconds': end, 'circularOverlapSeconds': overlap,
                        'gain': round(gain, 6), 'rms': round(float(np.sqrt(np.mean(decoded**2))), 6)})
        print(f'{name} -> {sound}.ogg: {len(decoded)/rate:.3f}s, peak {peak:.3f}')
    inventory_path = ROOT / 'assets/audio/manifests/gameplay-audio-inventory.json'
    previous = json.loads(inventory_path.read_text())
    # Environment effects also use world- IDs; this importer owns only CLIPS.
    others = [row for row in previous if row['id'] not in CLIPS]
    inventory_path.write_text(json.dumps(sorted(others+inventory, key=lambda row: row['id']), indent=2)+'\n')
    (ROOT / 'assets/audio/manifests/world-audio-import.json').write_text(json.dumps({
        'archive': str(SOURCE.relative_to(ROOT)), 'archiveSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'processing': 'Stereo average to mono, DC removal, documented trims, circular overlaps for loops; gain only, 2 ms one-shot edge fades, OGG Vorbis.',
        'clips': sources,
    }, indent=2)+'\n')


if __name__ == '__main__':
    main()
