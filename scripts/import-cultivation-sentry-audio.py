#!/usr/bin/env python3
"""Prepare the requester-supplied sentry WAVs; retain the original archive."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'cultivation-sentry-sounds.tar'
OUTPUT = ROOT / 'public/assets/audio/cultivation'
CLIPS = {
    'cultivation-sentry-shove-01': ('sentry-shove.wav', .075),
    'cultivation-sentry-topple-01': ('sentry-topple.wav', .06),
    'cultivation-sentry-acid-splash-01': ('sentry-acid-splash.wav', .075),
}


def main(source=SOURCE, clips=CLIPS, report='cultivation-sentry-audio-import.json', output=OUTPUT, max_gain=4):
    members = {}
    if source.suffix.lower() == '.wav':
        members[source.name] = source.read_bytes()
    else:
        with tarfile.open(source) as archive:
            for member in archive.getmembers():
                path = PurePosixPath(member.name)
                if path.is_absolute() or '..' in path.parts or not member.isfile() or member.name in members:
                    raise ValueError(f'Unexpected archive member: {member.name}')
                members[member.name] = archive.extractfile(member).read()
    if set(members) != {clip[0] for clip in clips.values()}:
        raise ValueError(f'Expected the {len(clips)} selected recordings')
    output.mkdir(parents=True, exist_ok=True)
    inventory, sources = [], []
    for sound, (name, target) in clips.items():
        original, rate = sf.read(io.BytesIO(members[name]), always_2d=True)
        if rate != 48000 or not len(original) or not np.isfinite(original).all():
            raise ValueError(f'Invalid source audio: {name}')
        mono = original.mean(axis=1)
        mono -= mono.mean()
        gain = min(max_gain, target / max(float(np.sqrt(np.mean(mono**2))), 1e-9),
                   .7 / max(float(np.abs(mono).max()), 1e-9))
        mono *= gain
        edge = min(round(.002 * rate), len(mono) // 2)
        mono[:edge] *= np.linspace(0, 1, edge)
        mono[-edge:] *= np.linspace(1, 0, edge)
        path = output / f'{sound}.ogg'
        sf.write(path, mono, rate, format='OGG', subtype='VORBIS')
        decoded, rate = sf.read(path)
        peak = float(np.abs(decoded).max())
        if not np.isfinite(decoded).all() or peak >= .95:
            raise ValueError(f'Invalid encoded audio: {sound}')
        inventory.append({'id': sound, 'path': str(path.relative_to(ROOT / 'public')),
                          'durationSeconds': round(len(decoded) / rate, 6), 'sampleRate': rate,
                          'channels': 1, 'peak': round(peak, 5), 'loop': False})
        sources.append({'id': sound, 'source': name, 'sourceSha256': hashlib.sha256(members[name]).hexdigest(),
                        'sourceDurationSeconds': round(len(original) / rate, 6), 'sourceChannels': original.shape[1],
                        'gain': round(gain, 6), 'rms': round(float(np.sqrt(np.mean(decoded**2))), 6)})
        print(f'{sound}: {len(decoded) / rate:.3f}s, peak {peak:.3f}')
    inventory_path = ROOT / 'docs/assets/gameplay-audio-inventory.json'
    others = [row for row in json.loads(inventory_path.read_text()) if row['id'] not in clips]
    inventory_path.write_text(json.dumps(sorted(others + inventory, key=lambda row: row['id']), indent=2) + '\n')
    source_kind = 'sourceFile' if source.suffix.lower() == '.wav' else 'archive'
    (ROOT / 'docs/assets' / report).write_text(json.dumps({
        source_kind: str(source.relative_to(ROOT)), source_kind + 'Sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'processing': 'Mono averaging, DC removal, gain with peak headroom, 2 ms fades, OGG Vorbis. No trimming or looping.',
        'clips': sources,
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
