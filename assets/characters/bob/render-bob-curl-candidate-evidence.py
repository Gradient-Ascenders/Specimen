"""Render neutral Gate 1 evidence and an exact front projection overlay.

Run after generate-bob-curl-candidate.py:
  blender --background assets/characters/bob/bob-curl-candidate.blend \
    --python assets/characters/bob/render-bob-curl-candidate-evidence.py

Default output is the current front/side pass. Append `-- --overlay` to include
the reference overlay; `--output docs/evidence/issue-150/<folder>` selects its
destination. The overlay uses exported geometry without warping the reference.
"""
from pathlib import Path
import argparse
import sys

import bpy
import numpy as np
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument('--output',default='docs/evidence/issue-150/curl-candidate-v3')
parser.add_argument('--overlay',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUTPUT=ROOT/args.output
REFERENCE=ROOT/'docs/evidence/issue-150/curl-candidate-v2/reference-front.png'
scene=bpy.context.scene


def runtime_vector(point):
    x,y,z=point
    return Vector((x,-z,y))


def camera_at(position,target,orthographic):
    camera=scene.camera
    camera.location=runtime_vector(position)
    direction=runtime_vector(target)-camera.location
    camera.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'
    camera.data.ortho_scale=orthographic


def render(name,width=1000,height=1000):
    scene.render.resolution_x=width
    scene.render.resolution_y=height
    scene.render.filepath=str(OUTPUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)


def contour(mask):
    eroded=mask.copy()
    eroded[1:] &= mask[:-1]
    eroded[:-1] &= mask[1:]
    eroded[:,1:] &= mask[:,:-1]
    eroded[:,:-1] &= mask[:,1:]
    boundary=mask & ~eroded
    expanded=boundary.copy()
    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
        expanded |= np.roll(boundary,(dy,dx),(0,1))
    return expanded


def render_overlay():
    # Same uniform scale and contact anchor used when authoring the contours.
    centre_x=(617-627)/692
    centre_y=-0.45+(955-627)/692
    camera_at((centre_x,centre_y,-3),(centre_x,centre_y,0),1254/692)
    scene.render.film_transparent=True
    scene.display.shading.light='FLAT'
    scene.display.shading.color_type='SINGLE'
    scene.display.shading.single_color=(1,1,1)
    scene.display.shading.show_shadows=False
    scene.display.shading.show_cavity=False
    body=bpy.data.objects['Bob-Body']
    eyes=[bpy.data.objects[name] for name in ('Bob-Eye-Left','Bob-Eye-Right')]
    outlines=[]
    for group in ('body','eyes'):
        body.hide_render=group!='body'
        for eye in eyes:
            eye.hide_render=group!='eyes'
        render('_'+group+'-mask',1254,1254)
        path=OUTPUT/('_'+group+'-mask.png')
        image=bpy.data.images.load(str(path),check_existing=False)
        pixels=np.array(image.pixels[:],dtype=np.float32).reshape(1254,1254,4)
        outlines.append(contour(pixels[:,:,3]>0.5))
        bpy.data.images.remove(image)
        path.unlink()
    reference=bpy.data.images.load(str(REFERENCE),check_existing=False)
    overlay=reference.copy()
    pixels=np.array(reference.pixels[:],dtype=np.float32).reshape(1254,1254,4)
    pixels[outlines[0]|outlines[1]]=(0.90,0.005,0.35,1)
    overlay.pixels.foreach_set(pixels.ravel())
    overlay.filepath_raw=str(OUTPUT/'front-overlay.png')
    overlay.file_format='PNG'
    overlay.save()
    body.hide_render=False
    for eye in eyes:
        eye.hide_render=False


def main():
    OUTPUT.mkdir(parents=True,exist_ok=True)
    # Reload the exported GLB, so evidence covers the artifact under review.
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/characters/bob/bob-curl-candidate.glb'))
    scene.render.engine='BLENDER_WORKBENCH'
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=False
    scene.display.shading.light='STUDIO'
    scene.display.shading.studio_light='paint.sl'
    scene.display.shading.color_type='MATERIAL'
    scene.display.shading.show_shadows=True
    scene.display.shading.show_cavity=False
    scene.display.shading.show_specular_highlight=False
    scene.display.shading.background_type='VIEWPORT'
    scene.display.shading.background_color=(0.055,0.065,0.075)
    camera_data=bpy.data.cameras.new('Bob-Gate-One-Review-Camera')
    camera=bpy.data.objects.new('Bob-Gate-One-Review-Camera',camera_data)
    scene.collection.objects.link(camera)
    scene.camera=camera
    camera_at((0,0.035,-3),(0,0.035,0),1.22)
    render('front-orthographic')
    camera_at((3,0.035,0),(0,0.035,0),1.22)
    render('side-orthographic')
    # gameplay-camera.png is captured from preview.html, which imports the
    # real CameraRig. Do not overwrite that browser evidence with a render.
    if args.overlay:
        render_overlay()


if __name__=='__main__':
    main()
