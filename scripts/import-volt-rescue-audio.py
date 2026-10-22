#!/usr/bin/env python3
"""Reuse the Cultivation import pipeline for the five supplied rescue recordings."""
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
CLIPS = {
    'cultivation-volt-cell-open-01': ('volt-cell-open.wav', .065),
    'cultivation-cover-break-free-01': ('cover-break-free.wav', .065),
    'cultivation-cover-drone-impact-01': ('cover-drone-impact.wav', .085),
    'cultivation-volt-drone-hijack-01': ('drone-hijack.wav', .07),
    'cultivation-duct-floor-strain-01': ('duct-floor-strain.wav', .06),
}

if __name__ == '__main__':
    importer = runpy.run_path(str(ROOT / 'scripts/import-cultivation-sentry-audio.py'))
    importer['main'](source=ROOT / 'volt-rescue-sounds.tar', clips=CLIPS, report='volt-rescue-audio-import.json')
