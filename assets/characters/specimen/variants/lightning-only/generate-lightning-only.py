"""Derive a separate lightning-only asset without rewriting the source model.

blender --background --factory-startup --disable-autoexec --python this_file.py
Append -- --render for front and three-quarter Cycles evidence.
"""

from array import array
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy

DIRECTORY = Path(__file__).resolve().parent
BASE_DIRECTORY = DIRECTORY.parent.parent
SOURCE = BASE_DIRECTORY / 'specimen.blend'
BLEND = DIRECTORY / 'specimen-lightning-only.blend'
GLB = DIRECTORY / 'specimen-lightning-only.glb'
REMOVED = ('Specimen-Acid-Core', 'Specimen-Aqua-Currents')
RETAINED = ('Specimen-Body', 'Specimen-Eye-Left', 'Specimen-Eye-Right', 'Specimen-Electric-Veins')


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mesh_signature(obj):
    """Check authored positions, indices, colour, morphs and material regions."""
    mesh = obj.data
    digest = hashlib.sha256()
    def attribute(collection, property_name, count, kind='f'):
        values = array(kind, [0]) * count
        collection.foreach_get(property_name, values)
        digest.update(values.tobytes())
    attribute(mesh.vertices, 'co', len(mesh.vertices) * 3)
    attribute(mesh.loops, 'vertex_index', len(mesh.loops), 'i')
    attribute(mesh.polygons, 'loop_total', len(mesh.polygons), 'i')
    attribute(mesh.polygons, 'material_index', len(mesh.polygons), 'i')
    for color in mesh.color_attributes:
        digest.update(f'{color.name}:{color.domain}:{color.data_type}'.encode())
        attribute(color.data, 'color', len(color.data) * 4)
    morphs = []
    for key in mesh.shape_keys.key_blocks if mesh.shape_keys else []:
        morphs.append(key.name)
        digest.update(key.name.encode())
        attribute(key.data, 'co', len(key.data) * 3)
    materials = [material.name for material in mesh.materials]
    digest.update(json.dumps(materials).encode())
    digest.update(json.dumps([list(row) for row in obj.matrix_local]).encode())
    mesh.calc_loop_triangles()
    return {'sha256': digest.hexdigest(), 'vertices': len(mesh.vertices),
            'triangles': len(mesh.loop_triangles), 'morphs': morphs, 'materials': materials}


def main():
    assert bpy.app.background, 'Run independently of the live Blender GUI'
    source_hash = file_hash(SOURCE)
    original_glb_hash = file_hash(BASE_DIRECTORY / 'specimen.glb')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    scene.frame_set(1)
    before = {name: mesh_signature(bpy.data.objects[name]) for name in RETAINED}
    root = bpy.data.objects['The Specimen']
    source_asset = root['asset']
    for name in REMOVED:
        obj = bpy.data.objects[name]
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    root['asset'] = 'specimen-lightning-only-v1'
    root['variant_of'] = source_asset
    root['variant'] = 'Body, eyes and lightning; no aqua ribbons or acid core'
    scene.name = 'The Specimen - Lightning Only'
    assert before == {name: mesh_signature(bpy.data.objects[name]) for name in RETAINED}

    # Reuse the established exporter fix for zero-based clips and resting
    # golden emission. Importing the module does not run its main generator.
    spec = importlib.util.spec_from_file_location('specimen_export_helpers', BASE_DIRECTORY / 'generate-specimen.py')
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for name in ('The Specimen', *RETAINED):
        bpy.data.objects[name].select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects['Specimen-Body']
    bpy.ops.export_scene.gltf(
        filepath=str(GLB), export_format='GLB', use_selection=True,
        export_yup=True, export_animations=True, export_animation_mode='NLA_TRACKS',
        export_pointer_animation=True, export_anim_slide_to_zero=False,
        export_frame_range=False, export_morph=True, export_morph_normal=True,
        export_morph_animation=True, export_cameras=False, export_lights=False,
        export_apply=False, export_extras=True, export_all_vertex_colors=True,
    )
    helpers.rebase_clip_times(GLB)
    scene.frame_set(1)
    assert before == {name: mesh_signature(bpy.data.objects[name]) for name in RETAINED}
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

    if '--render' in sys.argv:
        camera = scene.camera
        original_camera = (camera.location.copy(), camera.rotation_euler.copy())
        resolution = (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage)
        scene.render.resolution_x = 800
        scene.render.resolution_y = 880
        scene.render.resolution_percentage = 100
        try:
            preferences = bpy.context.preferences.addons['cycles'].preferences
            preferences.compute_device_type = 'OPTIX'
            preferences.refresh_devices()
            devices = [device for device in preferences.devices if device.type == 'OPTIX']
            if devices:
                for device in preferences.devices:
                    device.use = device.type == 'OPTIX'
                scene.cycles.device = 'GPU'
        except (TypeError, RuntimeError):
            scene.cycles.device = 'CPU'
        print('LIGHTNING_ONLY_RENDER_DEVICE', scene.cycles.device, flush=True)
        for name, position in [('front', (0, 8, 1.2)), ('three-quarter', (7.5, 6.8, 1.6))]:
            camera.location = position
            helpers.model.aim(camera, helpers.model.VIEW_TARGET)
            scene.render.filepath = str(DIRECTORY / 'evidence' / f'{name}.png')
            bpy.ops.render.render(write_still=True)
        camera.location, camera.rotation_euler = original_camera
        scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = resolution

    assert file_hash(SOURCE) == source_hash, 'Original Blender model changed'
    assert file_hash(BASE_DIRECTORY / 'specimen.glb') == original_glb_hash, 'Original GLB changed'
    report = {'asset': root['asset'], 'variant_of': source_asset,
              'source_blend_sha256': source_hash, 'source_glb_sha256': original_glb_hash,
              'blender_version': bpy.app.version_string, 'removed_objects': list(REMOVED),
              'retained_meshes': before, 'retained_geometry_and_morphs_unchanged': True,
              'total_triangles': sum(mesh['triangles'] for mesh in before.values()),
              'blend_sha256': file_hash(BLEND), 'glb_sha256': file_hash(GLB),
              'original_files_unchanged': True}
    (DIRECTORY / 'specimen-lightning-only.validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print('LIGHTNING_ONLY_VALIDATION', json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
