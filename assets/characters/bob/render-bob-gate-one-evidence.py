"""Render deterministic neutral-geometry evidence for Bob's Gate 1 review.

Run from the repository root after generating the source asset:
  blender --background assets/characters/bob/bob-gate-one.blend --python \
    assets/characters/bob/render-bob-gate-one-evidence.py
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT_DIRECTORY = Path(__file__).resolve().parents[3]
OUTPUT_DIRECTORY = ROOT_DIRECTORY / "docs" / "evidence" / "issue-150" / "gate-1"
OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)

ROOT_NAME = "Bob-Gate-One"
BODY_NAME = "Bob-Body"
EYE_NAMES = ("Bob-Eye-Left", "Bob-Eye-Right")


def runtime_to_blender(vector: tuple[float, float, float]) -> Vector:
    x, y, z = vector
    return Vector((x, -z, y))


def look_at(camera: bpy.types.Object, target_runtime: tuple[float, float, float]) -> None:
    direction = runtime_to_blender(target_runtime) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def set_root_orientation(up_runtime: tuple[float, float, float]) -> None:
    root = bpy.data.objects[ROOT_NAME]
    source_up = runtime_to_blender((0.0, 1.0, 0.0))
    target_up = runtime_to_blender(up_runtime)
    root.rotation_mode = "QUATERNION"
    root.rotation_quaternion = source_up.rotation_difference(target_up)


def set_camera(
    camera_runtime: tuple[float, float, float],
    target_runtime: tuple[float, float, float] = (0.0, -0.05, 0.0),
    focal_length_millimetres: float = 70.0,
) -> None:
    camera = bpy.context.scene.camera
    camera.location = runtime_to_blender(camera_runtime)
    camera.data.lens = focal_length_millimetres
    look_at(camera, target_runtime)


def set_wire_visible(visible: bool) -> None:
    for name in (BODY_NAME, *EYE_NAMES):
        obj = bpy.data.objects[name]
        obj.show_wire = visible
        obj.show_all_edges = visible


def create_wire_overlay() -> list[bpy.types.Object]:
    material = bpy.data.materials.new("Bob-Topology-Wire")
    material.diffuse_color = (0.018, 0.028, 0.038, 1.0)
    overlays: list[bpy.types.Object] = []
    for name in (BODY_NAME, *EYE_NAMES):
        source = bpy.data.objects[name]
        mesh = source.data.copy()
        mesh.materials.clear()
        mesh.materials.append(material)
        overlay = bpy.data.objects.new(f"{name}-Topology-Wire", mesh)
        overlay.parent = source.parent
        bpy.context.scene.collection.objects.link(overlay)
        modifier = overlay.modifiers.new("Topology Wire", "WIREFRAME")
        modifier.thickness = 0.00125
        modifier.use_even_offset = True
        modifier.use_relative_offset = False
        modifier.use_replace = True
        overlays.append(overlay)
    return overlays


def render(name: str) -> None:
    scene = bpy.context.scene
    scene.render.filepath = str(OUTPUT_DIRECTORY / f"{name}.png")
    bpy.ops.render.render(write_still=True)


def create_collider_overlay() -> list[bpy.types.Object]:
    material = bpy.data.materials.new("Bob-Collider-Overlay")
    material.diffuse_color = (0.9, 0.13, 0.08, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = material.diffuse_color
    principled.inputs["Emission Color"].default_value = (0.45, 0.015, 0.005, 1.0)
    principled.inputs["Emission Strength"].default_value = 1.0

    circles: list[bpy.types.Object] = []
    for index, rotation in enumerate(((0, 0, 0), (math.pi / 2, 0, 0), (0, math.pi / 2, 0))):
        curve = bpy.data.curves.new(f"Bob-Collider-Circle-{index}", "CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = 0.004
        curve.bevel_resolution = 2
        spline = curve.splines.new("POLY")
        segments = 96
        spline.points.add(segments)
        for point_index in range(segments + 1):
            angle = math.tau * point_index / segments
            spline.points[point_index].co = (
                0.45 * math.cos(angle),
                0.45 * math.sin(angle),
                0.0,
                1.0,
            )
        curve.materials.append(material)
        circle = bpy.data.objects.new(f"Bob-Collider-Circle-{index}", curve)
        circle.rotation_euler = rotation
        bpy.context.scene.collection.objects.link(circle)
        circles.append(circle)
    return circles


def remove_objects(objects: list[bpy.types.Object]) -> None:
    for obj in objects:
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data:
            bpy.data.curves.remove(data)


def remove_wire_overlay(objects: list[bpy.types.Object]) -> None:
    for obj in objects:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.meshes.remove(mesh)


def prepare_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "BOTH"
    scene.display.shading.curvature_ridge_factor = 1.25
    scene.display.shading.curvature_valley_factor = 1.1
    scene.display.shading.show_specular_highlight = False
    scene.display.shading.background_type = "VIEWPORT"
    scene.display.shading.background_color = (0.055, 0.065, 0.075)

    camera_data = bpy.data.cameras.new("Bob-Gate-One-Evidence-Camera")
    camera = bpy.data.objects.new("Bob-Gate-One-Evidence-Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera


def main() -> None:
    prepare_scene()
    set_wire_visible(False)
    set_root_orientation((0.0, 1.0, 0.0))

    for name, camera, target in (
        ("front", (0.0, 0.0, -2.6), (0.0, -0.05, 0.0)),
        ("side", (2.6, 0.0, 0.0), (0.0, -0.05, 0.0)),
        ("back", (0.0, 0.0, 2.6), (0.0, -0.05, 0.0)),
        ("three-quarter", (1.9, 0.65, -2.2), (0.0, -0.06, 0.0)),
        ("top-oblique-contact", (1.7, 1.75, -2.15), (0.0, -0.20, 0.0)),
    ):
        set_camera(camera, target)
        render(name)

    set_root_orientation((1.0, 0.0, 0.0))
    set_camera((2.5, 0.15, -1.9), (0.0, 0.0, 0.0))
    render("wall-oriented")

    set_root_orientation((0.0, 1.0, 0.0))
    collider = create_collider_overlay()
    set_camera((1.9, 0.65, -2.2), (0.0, -0.06, 0.0))
    render("collider-overlay")
    remove_objects(collider)

    wire_overlay = create_wire_overlay()
    set_camera((1.9, 0.65, -2.2), (0.0, -0.06, 0.0))
    render("wireframe-full-body")
    set_camera((0.0, 0.03, -1.35), (0.0, 0.015, -0.2), 85.0)
    render("wireframe-eye-seat")
    set_camera((1.15, -1.35, -1.5), (0.0, -0.32, 0.0), 65.0)
    render("wireframe-underside")
    remove_wire_overlay(wire_overlay)


if __name__ == "__main__":
    main()
