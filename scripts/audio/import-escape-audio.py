#!/usr/bin/env python3
"""Import the supplied assets/audio/escape/escape-sounds.tar with NumPy/SoundFile, retaining original WAVs."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/audio/escape/escape-sounds.tar'
OUTPUT = ROOT / 'public/assets/audio/escape'
# Source, trailing trim, circular overlap, target RMS.
CLIPS = {
    'escape-power-down-01': ('power-down.wav', 0, 0, .075),
    'escape-cell-hatch-open-01': ('cell-hatch-open.wav', 0, 0, .065),
    'escape-drone-scan-01': ('drone-scan.wav', 0, 0, .055),
    'escape-scan-result-01': ('scan-result.wav', .7, 0, .065),
    'escape-termination-warning-01': ('termination-warning.wav', 0, 0, .065),
    'escape-drone-strain-loop-01': ('drone-strain.wav', 0, .08, .045),
    'escape-projectile-metal-impact-01': ('projectile-impact.wav', 0, 0, .065),
    'escape-drone-destruction-01': ('drone-destruction.wav', 0, 0, .085),
    'escape-shaft-fall-01': ('shaft-fall.wav', 0, 0, .055),
}


def main():
    members = {}
    with tarfile.open(SOURCE) as archive:
        for member in archive.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or not member.isfile() or member.name in members:
                raise ValueError(f'Unexpected archive member: {member.name}')
            members[member.name] = archive.extractfile(member).read()
    if set(members) != {clip[0] for clip in CLIPS.values()}:
        raise ValueError('Expected the nine selected escape recordings')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    inventory, sources = [], []
    for sound, (name, end, overlap, target) in CLIPS.items():
        original, rate = sf.read(io.BytesIO(members[name]), always_2d=True)
        if rate != 48000 or not np.isfinite(original).all():
            raise ValueError(f'Invalid source audio: {name}')
        mono = original.mean(axis=1)[:len(original)-round(end*rate)].copy()
        mono -= mono.mean()
        if overlap:
            edge = round(overlap*rate)
            blend = np.linspace(0, 1, edge)
            mono = np.concatenate((mono[edge:-edge], mono[-edge:]*(1-blend)+mono[:edge]*blend))
        rms = float(np.sqrt(np.mean(mono**2)))
        gain = min(4, target/max(rms, 1e-9), .7/max(float(np.abs(mono).max()), 1e-9))
        mono *= gain
        if not overlap:
            edge = round(.002*rate)
            mono[:edge] *= np.linspace(0, 1, edge)
            mono[-edge:] *= np.linspace(1, 0, edge)
        path = OUTPUT / f'{sound}.ogg'
        sf.write(path, mono, rate, format='OGG', subtype='VORBIS')
        decoded, rate = sf.read(path)
        peak = float(np.abs(decoded).max())
        if not np.isfinite(decoded).all() or peak >= .95:
            raise ValueError(f'Invalid encoded audio: {sound}')
        inventory.append({'id': sound, 'path': str(path.relative_to(ROOT/'public')),
                          'durationSeconds': round(len(decoded)/rate, 6), 'sampleRate': rate,
                          'channels': 1, 'peak': round(peak, 5), 'loop': bool(overlap)})
        sources.append({'id': sound, 'source': name, 'sourceSha256': hashlib.sha256(members[name]).hexdigest(),
                        'sourceDurationSeconds': round(len(original)/rate, 6), 'sourceChannels': original.shape[1],
                        'trimEndSeconds': end, 'circularOverlapSeconds': overlap,
                        'gain': round(gain, 6), 'rms': round(float(np.sqrt(np.mean(decoded**2))), 6)})
        print(f'{sound}: {len(decoded)/rate:.3f}s, peak {peak:.3f}')
    inventory_path = ROOT/'assets/audio/manifests/gameplay-audio-inventory.json'
    others = [row for row in json.loads(inventory_path.read_text()) if row['id'] not in CLIPS]
    inventory_path.write_text(json.dumps(sorted(others+inventory, key=lambda row: row['id']), indent=2)+'\n')
    (ROOT/'assets/audio/manifests/escape-audio-import.json').write_text(json.dumps({
        'archive': str(SOURCE.relative_to(ROOT)), 'archiveSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'processing': 'Mono averaging, DC removal, gain with peak headroom, 2 ms one-shot fades, 80 ms circular strain-loop overlap. Scan-result silent tail trimmed. OGG Vorbis.',
        'clips': sources,
    }, indent=2)+'\n')


if __name__ == '__main__':
    main()
