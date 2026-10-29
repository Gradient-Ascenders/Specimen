#!/usr/bin/env python3
"""Import the requester-selected First sunlight WAVs using the shared pipeline."""
from pathlib import Path
import json
import runpy

ROOT = Path(__file__).resolve().parents[2]
CLIPS = {
    'ending-boss-strain-loop-01': ('damaged-boss-machinery.wav', .045, True, None, False),
    'ending-specimen-charge-01': ('specimen-charging-beam.wav', .075, False, 9.45, False),
    'ending-specimen-beam-loop-01': ('specimen-continuous-beam.wav', .06, True, None, False),
    # This supplied two-second recording has an impact and decaying tail.
    # The sustained collision instead aliases the existing boss beam recording.
    'ending-beam-collision-impact-01': ('beam-deadlock.wav', .09, False, None, True),
    'ending-energy-overload-rise-01': ('energy-overload.wav', .075, False, 5, False),
    'ending-slime-separate-01': ('slime-separate.wav', .085, False, None, True),
    'ending-boss-wreck-fall-01': ('boss-wreck.wav', .075, False, None, False),
    'ending-structural-rumble-loop-01': ('structural-rumble.wav', .04, True, None, False),
    'ending-debris-impact-01': ('ending-debris-impact.wav', .065, False, None, True),
    'ending-girder-crash-01': ('ending-girder.wav', .09, False, None, True),
    'ending-projectile-flyby-01': ('ending-projectile-flyby.wav', .065, False, None, True),
    'ending-goop-hit-01': ('ending-goop-hit.wav', .085, False, None, True),
    'ending-collapse-blast-01': ('ending-collapse-blast.wav', .095, False, None, True),
    'ending-outdoor-ambience-loop-01': ('outdoor-ambience-loop.wav', .035, True, None, False),
}

if __name__ == '__main__':
    importer = runpy.run_path(str(ROOT / 'scripts/audio/import-boss-audio.py'))
    importer['main'](source=ROOT / 'assets/audio/ending/ending-sounds.tar', clips=CLIPS,
                     output=ROOT / 'public/assets/audio/ending', report='ending-audio-import.json')
    report_path = ROOT / 'assets/audio/manifests/ending-audio-import.json'
    report = json.loads(report_path.read_text())
    report['reusedRecordings'] = [{
        'id': 'ending-beam-collision-loop-01',
        'sourceRuntimeId': 'boss-beam-sustain-loop-01',
        'playbackRate': .72,
        'reason': 'No sustained collision recording supplied; beam-deadlock.wav is a two-second impact with a decaying tail.',
    }]
    report_path.write_text(json.dumps(report, indent=2) + '\n')
