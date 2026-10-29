#!/usr/bin/env python3
"""Import the selected ElevenLabs boss pack (requires numpy and soundfile)."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/audio/boss/boss-sounds.tar'
OUTPUT = ROOT / 'public/assets/audio/boss'
# Runtime ID: original filename, target RMS, loop, fitted duration, trim onset.
# Fitting uses resampling: these mechanical/electrical cues follow the existing
# simulation windows, without changing combat or cinematic timing.
CLIPS = {
    'boss-hover-loop-01': ('boss-hover.wav', .045, True, None, False),
    'boss-emergence-01': ('boss-emergence.wav', .085, False, 6, False),
    'boss-cannon-spin-up-01': ('boss-cannon-spin-up.wav', .075, False, 1.1, False),
    'boss-cannon-volley-01': ('boss-cannon-volly.wav', .085, False, None, True),
    'boss-orb-charge-01': ('boss-orb-charge.wav', .075, False, 1.35, False),
    'boss-orb-launch-01': ('orb-launch.wav', .085, False, None, True),
    'boss-orb-burst-01': ('orb-burst.wav', .085, False, None, True),
    'boss-beam-charge-01': ('beam-charge-warning.wav', .075, False, 2.6, False),
    'boss-beam-ignite-01': ('beam-ignition.wav', .085, False, None, True),
    'boss-beam-sustain-loop-01': ('beam-sustain.wav', .055, True, None, False),
    'boss-beam-shutdown-01': ('beam-shutdown.wav', .075, False, None, True),
    'boss-shield-activate-01': ('shield-activation.wav', .075, False, 1.35, True),
    'boss-shield-regeneration-loop-01': ('shield-and-regeneration-hum.wav', .04, True, None, False),
    'boss-shield-collapse-01': ('shield-collapse.wav', .085, False, None, True),
    'boss-drone-deploy-01': ('drone-wave-deployment.wav', .075, False, None, True),
    'boss-ram-windup-01': ('ram-warning.wav', .08, False, 2.1, False),
    'boss-ram-rush-01': ('ram-rush.wav', .085, False, 1.05, True),
    'boss-ram-impact-01': ('ram-collision.wav', .10, False, None, True),
    'boss-cover-break-01': ('cover-destruction.wav', .085, False, None, True),
    'boss-core-hit-01': ('exposed-core-hit-stagger.wav', .085, False, None, True),
    'boss-hit-blocked-01': ('blocked-hit.wav', .065, False, None, True),
    'boss-phase-two-overload-01': ('phase-two-breakdown.wav', .085, False, 5, False),
    'boss-reactor-failure-01': ('boss-reactor-failure.wav', .085, False, 3.8, False),
    'boss-final-explosion-01': ('final-explosion.wav', .11, False, None, True),
    'specimen-damage-01': ('player-damage.wav', .085, False, None, True),
    'specimen-dash-01': ('specimen-dash.wav', .075, False, None, True),
    'boss-health-pickup-01': ('health-pickup.wav', .075, False, None, True),
}


def main(source=SOURCE, clips=CLIPS, output=OUTPUT, report='boss-audio-import.json', maximum_durations=None):
    members = {}
    with tarfile.open(source) as archive:
        for member in archive:
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or not member.isfile() or member.name in members:
                raise ValueError(f'Unexpected archive member: {member.name}')
            members[member.name] = archive.extractfile(member).read()
    if set(members) != {clip[0] for clip in clips.values()}:
        raise ValueError(f'Expected the {len(clips)} selected recordings')
    output.mkdir(parents=True, exist_ok=True)
    inventory, sources = [], []
    for sound, (name, target, loop, fit, trim) in clips.items():
        original, rate = sf.read(io.BytesIO(members[name]), always_2d=True)
        if rate != 48000 or not len(original) or not np.isfinite(original).all():
            raise ValueError(f'Invalid source audio: {name}')
        mono = original.mean(axis=1)
        mono -= mono.mean()
        start = 0
        if trim:
            # Remove only near-silence before transient effects, keeping a 5 ms lead.
            active = np.flatnonzero(np.abs(mono) > max(.001, float(np.abs(mono).max()) * .02))
            if len(active):
                start = max(0, int(active[0]) - round(.005 * rate))
                mono = mono[start:]
        end = 0
        maximum = (maximum_durations or {}).get(sound)
        if maximum and len(mono) > round(maximum * rate):
            end = len(mono) - round(maximum * rate)
            mono = mono[:-end]
        if fit:
            mono = np.interp(np.linspace(0, len(mono) - 1, round(fit * rate)), np.arange(len(mono)), mono)
        overlap = .1 if loop else 0
        if loop:
            edge = round(overlap * rate)
            blend = np.linspace(0, 1, edge)
            mono = np.concatenate((mono[edge:-edge], mono[-edge:] * (1-blend) + mono[:edge] * blend))
        gain = min(6, target / max(float(np.sqrt(np.mean(mono**2))), 1e-9),
                   .7 / max(float(np.abs(mono).max()), 1e-9))
        mono *= gain
        if not loop:
            edge = min(round(.002 * rate), len(mono) // 2)
            mono[:edge] *= np.linspace(0, 1, edge)
            mono[-edge:] *= np.linspace(1, 0, edge)
        path = output / f'{sound}.ogg'
        sf.write(path, mono, rate, format='OGG', subtype='VORBIS')
        decoded, _ = sf.read(path)
        peak = float(np.abs(decoded).max())
        if not np.isfinite(decoded).all() or peak >= .95:
            raise ValueError(f'Invalid encoded audio: {sound}')
        inventory.append({'id': sound, 'path': str(path.relative_to(ROOT / 'public')),
                          'durationSeconds': round(len(decoded) / rate, 6), 'sampleRate': rate,
                          'channels': 1, 'peak': round(peak, 5), 'loop': loop})
        sources.append({'id': sound, 'source': name, 'sourceSha256': hashlib.sha256(members[name]).hexdigest(),
                        'sourceDurationSeconds': round(len(original) / rate, 6), 'sourceChannels': original.shape[1],
                        'trimStartSeconds': round(start / rate, 6), 'trimEndSeconds': round(end / rate, 6), 'fittedDurationSeconds': fit,
                        'circularOverlapSeconds': overlap, 'gain': round(gain, 6),
                        'rms': round(float(np.sqrt(np.mean(decoded**2))), 6)})
        print(f'{sound}: {len(original)/rate:.3f}s -> {len(decoded)/rate:.3f}s, peak {peak:.3f}')
    inventory_path = ROOT / 'assets/audio/manifests/gameplay-audio-inventory.json'
    others = [row for row in json.loads(inventory_path.read_text()) if row['id'] not in clips]
    inventory_path.write_text(json.dumps(sorted(others + inventory, key=lambda row: row['id']), indent=2) + '\n')
    (ROOT / 'assets/audio/manifests' / report).write_text(json.dumps({
        'archive': str(source.relative_to(ROOT)), 'archiveSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'processing': 'Mono averaging, DC removal, documented onset/tail trims and duration fitting by resampling; '
                      '100 ms circular overlaps for loops; gain with peak headroom, 2 ms one-shot fades, OGG Vorbis.',
        'clips': sources,
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
