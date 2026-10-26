#!/usr/bin/env python3
"""Import the two selected Blackout cinematic packs; reuse Goop's power failure."""
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
CLIPS = {
    'blackout-lift-power-restore-01': ('lift-power-restoration.wav', .07, False, 1.2, False),
    'blackout-lift-start-01': ('lift-break-release-and-start.wav', .075, False, 3, False),
    'blackout-lift-travel-loop-01': ('lift-travel-loop.wav', .035, True, None, False),
    'blackout-lift-stop-01': ('lift-braking-settling.wav', .075, False, 3, False),
    'research-light-rupture-01': ('overhead-light-rapture.wav', .075, False, None, True),
    'research-energy-absorb-01': ('energy-absorption.wav', .065, False, None, True),
    'research-fusion-charge-loop-01': ('fusion-loop.wav', .045, True, None, False),
    'research-slime-fusion-01': ('slime-fusion.wav', .085, False, 3, False),
    'research-fusion-burst-01': ('fusion-burst.wav', .10, False, None, True),
    'specimen-heavy-blast-01': ('heavy-charged-blast.wav', .095, False, None, True),
    'research-door-breach-01': ('reinforced-door-breach.wav', .095, False, None, True),
    'research-glass-shatter-01': ('observation-window-shatter.wav', .085, False, None, True),
    'research-shaft-fall-01': ('fall-through-shaft.wav', .065, False, 3.4, False),
    'research-specimen-land-01': ('specimen-landing .wav', .10, False, None, True),
    'research-pit-unlock-01': ('pit-cover-unlocking.wav', .085, False, .6, True),
    'research-pit-retract-loop-01': ('pit-cover-retraction.wav', .045, True, None, False),
    'research-pit-stop-01': ('pit-cover-end-stop.wav', .095, False, None, True),
}

if __name__ == '__main__':
    importer = runpy.run_path(str(ROOT / 'scripts/import-boss-audio.py'))
    importer['main'](source=ROOT / 'latest-cutcenes.tar', clips=CLIPS,
                     output=ROOT / 'public/assets/audio/blackout', report='blackout-cutscene-audio-import.json',
                     # Preserve the transient's pitch; remove the long generated
                     # tail so frequent absorption hits cannot occupy voices for 2 s.
                     maximum_durations={'research-energy-absorb-01': .5})
