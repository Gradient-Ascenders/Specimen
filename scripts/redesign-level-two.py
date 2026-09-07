"""Refresh redesigned Blender snapshots from the current game export.

First: node scripts/export-level-two-blender.ts '../Levels/Level 2/Blender/Current'
Then: blender --background --python scripts/redesign-level-two.py -- <Blender-folder>
Saves RoomN-Redesign.blend; original RoomN.blend snapshots are preserved.
"""
import os
import runpy
import sys

folder = sys.argv[sys.argv.index('--') + 1]
script = os.path.join(os.path.dirname(__file__), 'build-room-blend.py')
for room in (2, 3):
    sys.argv = [script, '--', os.path.join(folder, 'Current', f'Room{room}.scene.json'),
                os.path.join(folder, f'Room{room}-Redesign.blend')]
    runpy.run_path(script, run_name='__main__')
