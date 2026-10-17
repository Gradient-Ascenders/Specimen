#!/usr/bin/env python3
"""Import requester-selected environment WAVs and reuse Goop for drone dissolution.

Usage: python3 scripts/import-environment-audio.py [environment-sounds.tar]
Requires NumPy and SoundFile. Original archives stay outside public/.
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

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/audio/environment/environment-sounds.tar'
GOOP = ROOT / 'assets/audio/goop/goop-sounds.tar'
OUTPUT = ROOT / 'public/assets/audio/environment'
# source, start, end (absolute seconds), circular overlap, target RMS
CLIPS = {
    'world-platform-fall-01': ('platform-falling.wav', 0, .80, 0, .065),
    'world-platform-land-01': ('platform-landing.wav', 0, .80, 0, .10),
    'world-drone-flight-loop-01': ('drone-flight-loop.wav', 0, 4, .12, .045),
    'world-platform-hover-loop-01': ('platform-hover-loop.wav', 0, 4, .16, .035),
    # The recording contains many ticks. Keep just its first isolated click.
    'world-sign-tick-01': ('sign-text-tick.wav', .043, .085, 0, .045),
}


def read_archive(path):
    result = {}
    with tarfile.open(path) as archive:
        for member in archive.getmembers():
            name = PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or not member.isfile() or member.name in result:
                raise ValueError(f'Unexpected archive member: {member.name}')
            result[member.name] = archive.extractfile(member).read()
    return result


def segment(members, name, start, end):
    data, rate = sf.read(io.BytesIO(members[name]), always_2d=True)
    if rate != 48000 or not np.isfinite(data).all() or end > len(data)/rate:
        raise ValueError(f'Invalid source: {name}')
    mono = data[round(start*rate):round(end*rate)].mean(axis=1).copy()
    mono -= mono.mean()
    return mono


def balance(mono, target):
    rms = float(np.sqrt(np.mean(mono**2)))
    gain = min(3., target/max(rms, 1e-9), .75/max(float(np.abs(mono).max()), 1e-9))
    return mono*gain, gain


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', nargs='?', type=Path, default=SOURCE)
    args = parser.parse_args()
    members = read_archive(args.archive)
    if set(members) != {clip[0] for clip in CLIPS.values()}:
        raise ValueError('Expected exactly the five selected environment WAVs')
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    if args.archive.resolve() != SOURCE.resolve():
        shutil.copyfile(args.archive, SOURCE)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    inventory, edits = [], []

    def write(sound, mono, loop, metadata):
        if not loop:
            edge = 96  # 2 ms edge fades
            mono[:edge] *= np.linspace(0, 1, edge)
            mono[-edge:] *= np.linspace(1, 0, edge)
        path = OUTPUT / f'{sound}.ogg'
        sf.write(path, mono, 48000, format='OGG', subtype='VORBIS')
        decoded, rate = sf.read(path)
        peak = float(np.abs(decoded).max())
        if not np.isfinite(decoded).all() or peak >= .95:
            raise ValueError(f'Invalid encoded audio: {sound}')
        inventory.append({'id': sound, 'path': str(path.relative_to(ROOT/'public')),
                          'durationSeconds': round(len(decoded)/rate, 6), 'sampleRate': rate,
                          'channels': 1, 'peak': round(peak, 5), 'loop': loop})
        edits.append({'id': sound, **metadata, 'rms': round(float(np.sqrt(np.mean(decoded**2))), 6)})
        print(f'{sound}: {len(decoded)/rate:.3f}s, peak {peak:.3f}')

    for sound, (name, start, end, overlap, target) in CLIPS.items():
        mono = segment(members, name, start, end)
        if overlap:
            edge = round(overlap*48000)
            blend = np.linspace(0, 1, edge)
            mono = np.concatenate((mono[edge:-edge], mono[-edge:]*(1-blend)+mono[:edge]*blend))
        mono, gain = balance(mono, target)
        write(sound, mono, bool(overlap), {'source': name, 'sourceSha256': hashlib.sha256(members[name]).hexdigest(),
              'startSeconds': start, 'endSeconds': end, 'circularOverlapSeconds': overlap, 'gain': round(gain, 6)})

    # Approved reuse: a short active reaction flows into its familiar completion.
    goop = read_archive(GOOP)
    names = ['active-dissoloution.wav', 'dissolution-completed.wav']
    active, active_gain = balance(segment(goop, names[0], 0, .55), .065)
    complete, complete_gain = balance(segment(goop, names[1], 0, .80), .08)
    edge = round(.04*48000)
    blend = np.linspace(0, 1, edge)
    mono = np.concatenate((active[:-edge], active[-edge:]*(1-blend)+complete[:edge]*blend, complete[edge:]))
    write('world-drone-dissolve-01', mono, False, {
        'archive': str(GOOP.relative_to(ROOT)), 'archiveSha256': hashlib.sha256(GOOP.read_bytes()).hexdigest(),
        'sources': [{'source': name, 'sourceSha256': hashlib.sha256(goop[name]).hexdigest(),
                     'startSeconds': 0, 'endSeconds': end, 'gain': round(gain, 6)}
                    for name, end, gain in zip(names, [.55, .80], [active_gain, complete_gain])],
        'crossfadeSeconds': .04,
    })
    inventory_path = ROOT/'docs/assets/gameplay-audio-inventory.json'
    previous = json.loads(inventory_path.read_text())
    ids = {row['id'] for row in inventory}
    inventory_path.write_text(json.dumps(sorted([row for row in previous if row['id'] not in ids]+inventory,
                                               key=lambda row: row['id']), indent=2)+'\n')
    (ROOT/'docs/assets/environment-audio-import.json').write_text(json.dumps({
        'archive': str(SOURCE.relative_to(ROOT)), 'archiveSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'processing': 'Stereo average to mono, DC removal, source edits, circular overlaps for loops; gain only, 2 ms one-shot edge fades, OGG Vorbis. Drone dissolution reuses original Goop WAVs with a 40 ms crossfade.',
        'clips': edits,
    }, indent=2)+'\n')


if __name__ == '__main__':
    main()
