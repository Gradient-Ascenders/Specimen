#!/usr/bin/env python3
"""Import the requester-selected polish pack. Requires NumPy and SoundFile.

Run: python3 scripts/audio/import-polish-audio.py
The supplied WAV archive remains unchanged and outside the production assets.
"""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/audio/polish/interaction-sounds.tar'
OUTPUT = ROOT / 'public/assets/audio/polish'
# Source, start/end in seconds, circular overlap, target RMS.
# The generated lift/laser pairs have no silent separator: split their actual
# startup/sustain and brake/power-down regions rather than using the prompt times.
CLIPS = {
    'world-button-press-01': ('button-press.wav', 0, .2, 0, .075),
    'world-button-release-01': ('button-press.wav', 1.25, 1.5, 0, .055),
    'world-lever-lock-01': ('lever-lock.wav', 0, 1.6, 0, .09),
    'world-lift-start-01': ('lift-start-stop.wav', 0, 1.6, 0, .065),
    'world-lift-stop-01': ('lift-start-stop.wav', 1.63, 3.08, 0, .085),
    'world-laser-on-01': ('laser-on-off.wav', .08, 1.2, 0, .065),
    'world-laser-off-01': ('laser-on-off.wav', 1.2, 1.9, 0, .065),
    'world-vent-break-01': ('vent-break.wav', 0, 1, 0, .09),
    'world-containment-alarm-loop-01': ('alarm-loop.wav', 0, 5, .02, .065),
    'ui-confirm-01': ('ui-confirm.wav', 0, .3, 0, .065),
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
        raise ValueError('Archive does not match the seven selected polish recordings')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    inventory, sources = [], []
    for sound, (name, start, end, overlap, target_rms) in CLIPS.items():
        original, rate = sf.read(io.BytesIO(members[name]), always_2d=True)
        if rate != 48000 or not np.isfinite(original).all() or round(end*rate) > len(original):
            raise ValueError(f'Unexpected or invalid source audio: {name}')
        mono = original.mean(axis=1)[round(start*rate):round(end*rate)].copy()
        mono -= mono.mean()
        if overlap:
            edge = round(overlap*rate)
            blend = np.linspace(0, 1, edge)
            mono = np.concatenate((mono[edge:-edge], mono[-edge:]*(1-blend) + mono[:edge]*blend))
        rms = float(np.sqrt(np.mean(mono**2)))
        gain = min(target_rms/max(rms, 1e-9), .7/max(float(np.abs(mono).max()), 1e-9))
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
        inventory.append({'id': sound, 'path': str(path.relative_to(ROOT / 'public')),
                          'durationSeconds': round(len(decoded)/rate, 6), 'sampleRate': rate,
                          'channels': 1, 'peak': round(peak, 5), 'loop': bool(overlap)})
        sources.append({'id': sound, 'source': name, 'sourceSha256': hashlib.sha256(members[name]).hexdigest(),
                        'sourceDurationSeconds': round(len(original)/rate, 6), 'sourceChannels': original.shape[1],
                        'trimStartSeconds': start, 'trimEndSeconds': round(len(original)/rate-end, 6),
                        'circularOverlapSeconds': overlap, 'gain': round(gain, 6),
                        'rms': round(float(np.sqrt(np.mean(decoded**2))), 6)})
        print(f'{sound}.ogg: {len(decoded)/rate:.3f}s, peak {peak:.3f}')
    inventory_path = ROOT / 'assets/audio/manifests/gameplay-audio-inventory.json'
    others = [row for row in json.loads(inventory_path.read_text()) if row['id'] not in CLIPS]
    inventory_path.write_text(json.dumps(sorted(others+inventory, key=lambda row: row['id']), indent=2)+'\n')
    (ROOT / 'assets/audio/manifests/polish-audio-import.json').write_text(json.dumps({
        'archive': str(SOURCE.relative_to(ROOT)), 'archiveSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'processing': 'Stereo average to mono, DC removal, documented pair splits, gain with peak headroom, 2 ms one-shot fades; 20 ms circular overlap for the alarm; OGG Vorbis.',
        'clips': sources,
    }, indent=2)+'\n')


if __name__ == '__main__':
    main()
