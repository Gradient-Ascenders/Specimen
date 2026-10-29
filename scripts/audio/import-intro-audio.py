#!/usr/bin/env python3
"""Prepare the intro and camera-variant archives with NumPy/SoundFile; retain original WAVs unchanged."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/audio/intro/intro-sounds.tar'
CAMERA_SOURCE = ROOT / 'assets/audio/intro/camera-sounds.tar'
OUTPUT = ROOT / 'public/assets/audio/intro'
# Source, leading trim, circular overlap, target RMS. Retain the supplied tails.
CLIPS = {
    'intro-door-open-01': ('intro-door-open.wav', 0, 0, .075),
    'intro-camera-servo-01': ('intro-camera-01.wav', .08, 0, .035),
    'intro-camera-servo-02': ('intro-camera-02.wav', 0, 0, .035),
    'intro-camera-servo-03': ('intro-camera-03.wav', 0, 0, .035),
    'intro-lab-ambience-loop-01': ('intro-lab-ambience.wav', 0, .08, .035),
    'intro-bob-reform-01': ('bob-reform.wav', 0, 0, .055),
    'intro-bob-splat-01': ('gel-splat.wav', 0, 0, .055),
    'intro-egg-break-impact-01': ('egg-break-impact.wav', 0, 0, .075),
    'intro-egg-fall-01': ('egg-falling.wav', 0, 0, .045),
    'intro-pod-lid-raise-01': ('pod-raise.wav', 0, 0, .065),
    'intro-pod-seal-release-01': ('pod-seal-release.wav', 0, 0, .065),
    'intro-egg-crack-01': ('egg-crack.wav', .08, 0, .065),
    'intro-egg-rock-01': ('egg-rock.wav', 0, 0, .055),
    'intro-door-close-01': ('intro-door-close.wav', 0, 0, .075),
}


def main():
    members, origins = {}, {}
    camera_names = {clip[0] for sound, clip in CLIPS.items() if sound.startswith('intro-camera-')}
    original_names = {clip[0] for sound, clip in CLIPS.items() if not sound.startswith('intro-camera-')} | {'camera-movement.wav'}
    for source, expected in [(SOURCE, original_names), (CAMERA_SOURCE, camera_names)]:
        names = set()
        with tarfile.open(source) as archive:
            for member in archive.getmembers():
                path = PurePosixPath(member.name)
                if path.is_absolute() or '..' in path.parts or not member.isfile() or member.name in members:
                    raise ValueError(f'Unexpected archive member: {member.name}')
                members[member.name] = archive.extractfile(member).read()
                origins[member.name] = str(source.relative_to(ROOT))
                names.add(member.name)
        if names != expected:
            raise ValueError(f'Unexpected recording inventory in {source.name}')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    inventory, sources = [], []
    for sound, (name, start, overlap, target) in CLIPS.items():
        original, rate = sf.read(io.BytesIO(members[name]), always_2d=True)
        if rate != 48000 or not np.isfinite(original).all():
            raise ValueError(f'Invalid source audio: {name}')
        mono = original.mean(axis=1)[round(start*rate):].copy()
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
        sources.append({'id': sound, 'source': name, 'sourceArchive': origins[name], 'sourceSha256': hashlib.sha256(members[name]).hexdigest(),
                        'sourceDurationSeconds': round(len(original)/rate, 6), 'sourceChannels': original.shape[1],
                        'trimStartSeconds': start, 'circularOverlapSeconds': overlap,
                        'gain': round(gain, 6), 'rms': round(float(np.sqrt(np.mean(decoded**2))), 6)})
        print(f'{sound}: {len(decoded)/rate:.3f}s, peak {peak:.3f}')
    inventory_path = ROOT/'assets/audio/manifests/gameplay-audio-inventory.json'
    others = [row for row in json.loads(inventory_path.read_text()) if row['id'] not in CLIPS]
    inventory_path.write_text(json.dumps(sorted(others+inventory, key=lambda row: row['id']), indent=2)+'\n')
    (ROOT/'assets/audio/manifests/intro-audio-import.json').write_text(json.dumps({
        'archive': str(SOURCE.relative_to(ROOT)), 'archiveSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'cameraArchive': str(CAMERA_SOURCE.relative_to(ROOT)), 'cameraArchiveSha256': hashlib.sha256(CAMERA_SOURCE.read_bytes()).hexdigest(),
        'processing': 'Mono averaging, DC removal, gain with peak headroom, 2 ms one-shot fades, 80 ms circular ambience overlap; OGG Vorbis. No new recordings or synthesis.',
        'clips': sources,
    }, indent=2)+'\n')


if __name__ == '__main__':
    main()
