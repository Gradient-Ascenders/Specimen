"""Generate Bob's Gate 1 neutral Blender source and runtime GLB.

Run from the repository root:
  blender --background --factory-startup --python \
    assets/characters/bob/generate-bob-gate-one.py

The generated .blend is an inspection artifact. This script remains the
reproducible source of truth for every accepted geometry edit.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_PATH = Path(__file__).resolve()
ASSET_DIRECTORY = SCRIPT_PATH.parent
BLEND_PATH = ASSET_DIRECTORY / "bob-gate-one.blend"
GLB_PATH = ASSET_DIRECTORY / "bob-gate-one.glb"
REPORT_PATH = ASSET_DIRECTORY / "bob-gate-one.validation.json"

ROOT_NAME = "Bob-Gate-One"
BODY_NAME = "Bob-Body"
LEFT_EYE_NAME = "Bob-Eye-Left"
RIGHT_EYE_NAME = "Bob-Eye-Right"

BODY_GRID_STEPS = 14
EYE_SEGMENTS = 28
EYE_RINGS = 5

WIDTH_METRES = 1.0
HEIGHT_METRES = 0.8
DEPTH_METRES = 0.9
BOTTOM_Y_METRES = -0.45
TOP_Y_METRES = 0.35
VERTICAL_PROFILE_EXPONENT = 1.15
BODY_RADIAL_EXPONENT = 0.72
BODY_LOWER_MASS_BIAS = 0.16
BODY_ORGANIC_PRIMARY = 0.004
BODY_ORGANIC_SECONDARY = 0.002

EYE_CENTRE_X_METRES = 0.205
EYE_CENTRE_Y_METRES = -0.065
EYE_RADIUS_X_METRES = 0.080
EYE_RADIUS_Y_METRES = 0.139
EYE_SURFACE_GAP_METRES = 0.004
EYE_LENS_DEPTH_METRES = 0.030


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras,
                       bpy.data.lights):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def create_material(
    name: str,
    colour: tuple[float, float, float, float],
    *,
    roughness: float = 0.88,
    coat_weight: float = 0.0,
):
    material = bpy.data.materials.new(name)
    material.diffuse_color = colour
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = colour
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = 0.0
    if coat := principled.inputs.get("Coat Weight"):
        coat.default_value = coat_weight
    return material


def body_y(theta: float) -> float:
    vertical_unit = (math.cos(theta) + 1.0) * 0.5
    return BOTTOM_Y_METRES + HEIGHT_METRES * (
        vertical_unit ** VERTICAL_PROFILE_EXPONENT
    )


def runtime_to_blender(vertex: tuple[float, float, float]):
    """Map runtime +Y-up/-Z-front coordinates into Blender's +Z-up space."""
    x, y, z = vertex
    return (x, -z, y)


def blender_to_runtime(vertex) -> tuple[float, float, float]:
    return (vertex.x, vertex.z, -vertex.y)


def spherify_cube_point(point: tuple[int, int, int]) -> tuple[float, float, float]:
    x = point[0] / BODY_GRID_STEPS
    y = point[1] / BODY_GRID_STEPS
    z = point[2] / BODY_GRID_STEPS
    x_squared, y_squared, z_squared = x * x, y * y, z * z
    return (
        x * math.sqrt(1.0 - y_squared / 2.0 - z_squared / 2.0 + y_squared * z_squared / 3.0),
        y * math.sqrt(1.0 - z_squared / 2.0 - x_squared / 2.0 + z_squared * x_squared / 3.0),
        z * math.sqrt(1.0 - x_squared / 2.0 - y_squared / 2.0 + x_squared * y_squared / 3.0),
    )


def map_body_direction(direction: tuple[float, float, float]):
    x, y, z = direction
    theta = math.acos(max(-1.0, min(1.0, y)))
    vertical_unit = (y + 1.0) * 0.5
    sphere_radius = math.sqrt(x * x + z * z)
    if sphere_radius <= 1e-8:
        return runtime_to_blender((0.0, body_y(theta), 0.0))
    angle = math.atan2(z, x)
    radial = sphere_radius ** BODY_RADIAL_EXPONENT
    lower_mass = 1.0 + BODY_LOWER_MASS_BIAS * (0.5 - vertical_unit)
    organic = 1.0 + (
        BODY_ORGANIC_PRIMARY * math.sin(3.0 * angle + 0.55)
        + BODY_ORGANIC_SECONDARY * math.sin(5.0 * angle - 0.2)
    ) * math.sin(math.pi * vertical_unit) ** 2
    return runtime_to_blender((
        WIDTH_METRES * 0.5 * radial * lower_mass * organic * math.cos(angle),
        body_y(theta),
        DEPTH_METRES * 0.5 * radial * lower_mass * organic * math.sin(angle),
    ))


def normalise_body_bounds(
    vertices: list[tuple[float, float, float]],
) -> list[tuple[float, float, float]]:
    runtime_vertices = [
        [blender_x, blender_z, -blender_y]
        for blender_x, blender_y, blender_z in vertices
    ]
    minimum_x = min(vertex[0] for vertex in runtime_vertices)
    maximum_x = max(vertex[0] for vertex in runtime_vertices)
    minimum_z = min(vertex[2] for vertex in runtime_vertices)
    maximum_z = max(vertex[2] for vertex in runtime_vertices)
    for vertex in runtime_vertices:
        vertex[0] = -WIDTH_METRES * 0.5 + (
            (vertex[0] - minimum_x) * WIDTH_METRES / (maximum_x - minimum_x)
        )
        vertex[2] = -DEPTH_METRES * 0.5 + (
            (vertex[2] - minimum_z) * DEPTH_METRES / (maximum_z - minimum_z)
        )
    return [runtime_to_blender(tuple(vertex)) for vertex in runtime_vertices]


def create_body(material) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    vertex_indices: dict[tuple[int, int, int], int] = {}

    def vertex_index(point: tuple[int, int, int]) -> int:
        existing = vertex_indices.get(point)
        if existing is not None:
            return existing
        index = len(vertices)
        vertex_indices[point] = index
        vertices.append(map_body_direction(spherify_cube_point(point)))
        return index

    # Each pair is oriented so its first basis cross its second points out of
    # the cube. Shared integer coordinates weld all six faces without a seam.
    face_frames = (
        ((1, 0, 0), (0, 1, 0), (0, 0, 1)),
        ((-1, 0, 0), (0, 1, 0), (0, 0, -1)),
        ((0, 1, 0), (0, 0, 1), (1, 0, 0)),
        ((0, -1, 0), (0, 0, 1), (-1, 0, 0)),
        ((0, 0, 1), (1, 0, 0), (0, 1, 0)),
        ((0, 0, -1), (1, 0, 0), (0, -1, 0)),
    )

    def cube_point(normal, u_axis, v_axis, u: int, v: int):
        return tuple(
            normal[axis] * BODY_GRID_STEPS + u_axis[axis] * u + v_axis[axis] * v
            for axis in range(3)
        )

    for normal, u_axis, v_axis in face_frames:
        for u_index in range(BODY_GRID_STEPS):
            u0 = -BODY_GRID_STEPS + 2 * u_index
            u1 = u0 + 2
            for v_index in range(BODY_GRID_STEPS):
                v0 = -BODY_GRID_STEPS + 2 * v_index
                v1 = v0 + 2
                faces.append(tuple(vertex_index(cube_point(normal, u_axis, v_axis, u, v)) for u, v in (
                    (u0, v0),
                    (u1, v0),
                    (u1, v1),
                    (u0, v1),
                )))

    vertices = normalise_body_bounds(vertices)

    mesh = bpy.data.meshes.new(f"{BODY_NAME}-Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.validate(verbose=True)
    mesh.update(calc_edges=True)

    body = bpy.data.objects.new(BODY_NAME, mesh)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return body


def front_surface_z(body: bpy.types.Object, x: float, y: float) -> float:
    hit, location, _normal, _face = body.ray_cast(
        Vector((x, 1.0, y)),
        Vector((0.0, -1.0, 0.0)),
        distance=2.0,
    )
    if not hit:
        raise RuntimeError(f"Eye sample did not hit Bob's front surface: {(x, y)}")
    return -location.y


def create_eye(
    name: str,
    centre_x: float,
    material,
    body: bpy.types.Object,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = [runtime_to_blender((
        centre_x,
        EYE_CENTRE_Y_METRES,
        front_surface_z(body, centre_x, EYE_CENTRE_Y_METRES)
        - EYE_SURFACE_GAP_METRES
        - EYE_LENS_DEPTH_METRES,
    ))]
    faces: list[tuple[int, ...]] = []

    for ring in range(1, EYE_RINGS + 1):
        radial = ring / EYE_RINGS
        for segment in range(EYE_SEGMENTS):
            angle = math.tau * segment / EYE_SEGMENTS
            x = centre_x + EYE_RADIUS_X_METRES * radial * math.cos(angle)
            y = (
                EYE_CENTRE_Y_METRES
                + EYE_RADIUS_Y_METRES * radial * math.sin(angle)
            )
            depth = EYE_SURFACE_GAP_METRES + EYE_LENS_DEPTH_METRES * (
                1.0 - radial * radial
            ) ** 1.35
            vertices.append(runtime_to_blender(
                (x, y, front_surface_z(body, x, y) - depth)
            ))

    first_ring = 1
    for segment in range(EYE_SEGMENTS):
        current = first_ring + segment
        following = first_ring + (segment + 1) % EYE_SEGMENTS
        faces.append((0, following, current))

    for ring in range(EYE_RINGS - 1):
        current_ring = 1 + ring * EYE_SEGMENTS
        next_ring = current_ring + EYE_SEGMENTS
        for segment in range(EYE_SEGMENTS):
            following = (segment + 1) % EYE_SEGMENTS
            faces.append((
                current_ring + segment,
                current_ring + following,
                next_ring + following,
                next_ring + segment,
            ))

    mesh = bpy.data.meshes.new(f"{name}-Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.validate(verbose=True)
    mesh.update(calc_edges=True)
    eye = bpy.data.objects.new(name, mesh)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return eye


def triangle_count(mesh: bpy.types.Mesh) -> int:
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def connected_component_count(mesh: bpy.types.Mesh) -> int:
    adjacency: dict[int, set[int]] = {index: set() for index in range(len(mesh.vertices))}
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacency[a].add(b)
        adjacency[b].add(a)
    remaining = set(adjacency)
    components = 0
    while remaining:
        components += 1
        pending = [remaining.pop()]
        while pending:
            for neighbour in adjacency[pending.pop()]:
                if neighbour in remaining:
                    remaining.remove(neighbour)
                    pending.append(neighbour)
    return components


def body_manifold_edge_count(mesh: bpy.types.Mesh) -> int:
    counts: dict[tuple[int, int], int] = {}
    for polygon in mesh.polygons:
        vertices = list(polygon.vertices)
        for index, first in enumerate(vertices):
            second = vertices[(index + 1) % len(vertices)]
            edge = tuple(sorted((first, second)))
            counts[edge] = counts.get(edge, 0) + 1
    return sum(count != 2 for count in counts.values())


def validate_source(body: bpy.types.Object, eyes: list[bpy.types.Object]) -> dict:
    body_triangles = triangle_count(body.data)
    eye_triangles = sum(triangle_count(eye.data) for eye in eyes)
    vertices = [
        blender_to_runtime(body.matrix_world @ vertex.co)
        for vertex in body.data.vertices
    ]
    minimum = tuple(round(min(vertex[axis] for vertex in vertices), 6) for axis in range(3))
    maximum = tuple(round(max(vertex[axis] for vertex in vertices), 6) for axis in range(3))
    dimensions = tuple(round(maximum[axis] - minimum[axis], 6) for axis in range(3))

    assert dimensions == (1.0, 0.8, 0.9), dimensions
    assert minimum == (-0.5, -0.45, -0.45), minimum
    assert maximum == (0.5, 0.35, 0.45), maximum
    assert 2_000 <= body_triangles <= 3_500, body_triangles
    assert eye_triangles <= 600, eye_triangles
    assert body_triangles + eye_triangles <= 4_100
    assert body_manifold_edge_count(body.data) == 0
    assert connected_component_count(body.data) == 1
    assert all(tuple(obj.location) == (0.0, 0.0, 0.0) for obj in [body, *eyes])
    assert all(tuple(obj.rotation_euler) == (0.0, 0.0, 0.0) for obj in [body, *eyes])
    assert all(tuple(obj.scale) == (1.0, 1.0, 1.0) for obj in [body, *eyes])

    return {
        "gate": 1,
        "root": ROOT_NAME,
        "meshes": [BODY_NAME, LEFT_EYE_NAME, RIGHT_EYE_NAME],
        "body_dimensions_metres": dimensions,
        "body_bounds_metres": {"minimum": minimum, "maximum": maximum},
        "body_vertices": len(body.data.vertices),
        "body_triangles": body_triangles,
        "eye_triangles_combined": eye_triangles,
        "total_triangles": body_triangles + eye_triangles,
        "body_connected_components": connected_component_count(body.data),
        "body_non_manifold_edges": body_manifold_edge_count(body.data),
        "armatures": 0,
        "morph_targets": 0,
        "animations": 0,
        "materials": ["Bob-Neutral-Body", "Bob-Neutral-Eyes"],
        "generator_sha256": hashlib.sha256(SCRIPT_PATH.read_bytes()).hexdigest(),
    }


def build() -> None:
    clear_scene()
    bpy.context.preferences.filepaths.save_version = 0
    body_material = create_material("Bob-Neutral-Body", (0.48, 0.51, 0.53, 1.0))
    eye_material = create_material(
        "Bob-Neutral-Eyes",
        (0.025, 0.035, 0.045, 1.0),
        roughness=0.20,
        coat_weight=0.28,
    )

    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.001
    bpy.context.scene.collection.objects.link(root)

    body = create_body(body_material)
    bpy.context.scene.collection.objects.link(body)
    body.parent = root
    left_eye = create_eye(
        LEFT_EYE_NAME,
        -EYE_CENTRE_X_METRES,
        eye_material,
        body,
    )
    right_eye = create_eye(
        RIGHT_EYE_NAME,
        EYE_CENTRE_X_METRES,
        eye_material,
        body,
    )
    eyes = [left_eye, right_eye]
    for child in eyes:
        bpy.context.scene.collection.objects.link(child)
        child.parent = root

    root["contract"] = "bob-gate-one-neutral-v1"
    root["local_up"] = "+Y"
    root["local_forward"] = "-Z"
    root["collider_radius_metres"] = 0.45
    body["watertight"] = True
    body["connected_components"] = 1
    body["resting_contact_y_metres"] = BOTTOM_Y_METRES

    report = validate_source(body, eyes)
    bpy.context.scene["bob_gate"] = 1
    bpy.context.scene["bob_generator"] = SCRIPT_PATH.name
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_attributes=False,
        export_extras=True,
    )
    report["glb_sha256"] = hashlib.sha256(GLB_PATH.read_bytes()).hexdigest()
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    build()
