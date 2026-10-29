#!/usr/bin/env python3
"""Reuse the audio import pipeline for the supplied vent slide recording."""
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[2]

if __name__ == '__main__':
    importer = runpy.run_path(str(ROOT / 'scripts/audio/import-cultivation-sentry-audio.py'))
    importer['main'](
        source=ROOT / 'assets/audio/blackout/vent-slide.wav',
        clips={'blackout-vent-slime-slide-01': ('vent-slide.wav', .065)},
        report='blackout-arrival-audio-import.json',
        output=ROOT / 'public/assets/audio/blackout',
        # The replacement is unusually quiet; preserve the shared peak cap,
        # but allow it to reach the same mix level as the other recordings.
        max_gain=16,
    )
