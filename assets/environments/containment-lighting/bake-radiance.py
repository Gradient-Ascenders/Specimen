"""Offline one-bounce diffuse irradiance and room reflection bake.

Run with Blender --background --factory-startup --python <this file>.
Uses the exported architecture and runtime fixture parameters, not editable
user .blend files. Blender's BVH performs all visibility queries. A fixed
Fibonacci sphere projects diffuse irradiance into four L1 SH polynomials.
No light transport, mesh scans or cubemap captures happen during gameplay.
"""
import bpy
import gzip
import hashlib
import json
import math
import os
import struct
import time
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
START = time.time()
with open(os.path.join(HERE, 'bake-input.json'), 'rb') as stream:
    input_bytes = stream.read()
SPEC = json.loads(input_bytes)
if hashlib.sha256(open(__file__, 'rb').read()).hexdigest() != SPEC['generatorSha256']:
    raise RuntimeError('Regenerate bake-input.json before baking.')

FINISHES = {
    'Ivory': ((.88, .86, .79), 0), 'Cool': ((.43, .53, .55), 0),
    'Resin': ((.43, .50, .51), 0), 'Island': ((.57, .62, .61), 0),
    'Graphite': ((.028, .043, .052), 0), 'Alloy': ((.14, .18, .19), 0),
    'Light': ((.76, .86, .88), 3.5), 'Screen': ((.055, .23, .25), .7),
    'Amber': ((.52, .28, .06), 0), 'Sticky': ((.18, .35, .31), 0),
    'Worn': ((.45, .50, .48), 0), 'Status': ((.08, .38, .34), 1),
}

# Import only the stable architecture. The live GUI and its unsaved scenes are
# untouched. GLTF's Y-up coordinates are restored after Blender's Z-up import.
vertices, triangles, albedos, emissions = [], [], [], []
for source in SPEC['sources']:
    path = os.path.normpath(os.path.join(HERE, '..', source['file']))
    if hashlib.sha256(open(path, 'rb').read()).hexdigest() != source['sha256']:
        raise RuntimeError('Stale source: ' + source['file'])
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = set(bpy.data.objects) - before
    anchors = {obj for obj in imported if obj.name in source['anchors']}
    def static_member(obj):
        while obj:
            if obj in anchors:
                return True
            obj = obj.parent
        return False
    for obj in imported:
        if obj.type != 'MESH' or not static_member(obj):
            continue
        finish = obj.name.rsplit('_', 1)[-1].split('.')[0]
        if finish in ('Glass', 'Security'):
            continue
        colour, emission = FINISHES.get(finish, ((.22, .29, .30), 0))
        mesh = obj.data
        mesh.calc_loop_triangles()
        start = len(vertices)
        for vertex in mesh.vertices:
            p = obj.matrix_world @ vertex.co
            vertices.append((p.x, p.z, -p.y))
        for triangle in mesh.loop_triangles:
            triangles.append(tuple(start + i for i in triangle.vertices))
            albedos.append(colour)
            emissions.append(tuple(v * emission for v in colour))
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)

BVH = BVHTree.FromPolygons(vertices, triangles, all_triangles=True, epsilon=.0001)
COLOURS = np.asarray(albedos)
EMISSION = np.asarray(emissions)
print('Static bake triangles:', len(triangles), flush=True)
del vertices, triangles, albedos, emissions

LIGHTS = []
for light in SPEC['lights']:
    item = dict(light)
    item['p'] = Vector(light['position'])
    item['rgb'] = np.asarray(light['colour']) * light['intensity']
    if 'target' in light:
        item['axis'] = (Vector(light['target']) - item['p']).normalized()
        item['outer'] = math.cos(light['angle'])
        item['inner'] = math.cos(light['angle'] * (1 - light['penumbra']))
    LIGHTS.append(item)

def smooth(a, b, x):
    t = min(1, max(0, (x - a) / max(1e-8, b - a)))
    return t * t * (3 - 2 * t)

def surface_light(point, normal, room):
    result = np.zeros(3)
    origin = point + normal * .035
    for light in LIGHTS:
        if light['room'] != room:
            continue
        delta = light['p'] - origin
        distance = delta.length
        if distance >= light['range'] or distance < .04:
            continue
        direction = delta / distance
        cosine = max(0, normal.dot(direction))
        if cosine <= 0:
            continue
        cone = smooth(light['outer'], light['inner'], -direction.dot(light['axis'])) if 'axis' in light else 1
        if cone <= 0:
            continue
        hit = BVH.ray_cast(origin, direction, max(.001, distance - .18))
        if hit[0] is not None:
            continue
        attenuation = (1 - (distance / light['range']) ** 4) ** 2 / max(distance * distance, .01)
        result += light['rgb'] * cosine * attenuation * cone
    return result

def trace(origin, direction, room, grids=None):
    point, normal, face, distance = BVH.ray_cast(origin, direction, 160)
    # The animated acid material is a stable area emitter for indirect light.
    # Its gameplay surface and animated normals remain owned by the game.
    if room == 3 and direction.y < -.001:
        acid_t = (6.94 - origin.y) / direction.y
        if acid_t > .02 and (point is None or acid_t < distance):
            acid = origin + direction * acid_t
            if -19.4 < acid.x < 19.4 and 50 < acid.z < 77.6:
                return np.asarray((.075, .22, .009))
    if point is None:
        return np.zeros(3)
    if normal.dot(direction) > 0:
        normal = -normal
    energy = surface_light(point, normal, room)
    if grids is not None:
        energy += interpolate(grids[room - 1], SPEC['layout'][room - 1], point + normal * .22, normal)
        # Low-frequency foundation, matching the game's restrained ambient fill.
        sky = (.13, .17, .19) if room != 4 else (.065, .075, .08)
        energy += np.asarray(sky) * (.35 + .65 * max(0, normal.y))
    return COLOURS[face] * energy / math.pi + EMISSION[face]

def interpolate(grid, layout, point, normal):
    size = np.asarray(layout['grid'])
    uv = np.clip((np.asarray(point) - layout['min']) / (np.asarray(layout['max']) - layout['min']), 0, 1) * (size - 1)
    lo = np.floor(uv).astype(int)
    hi = np.minimum(lo + 1, size - 1)
    f = uv - lo
    value = np.zeros((4, 3))
    for z in (0, 1):
        for y in (0, 1):
            for x in (0, 1):
                w = (f[0] if x else 1 - f[0]) * (f[1] if y else 1 - f[1]) * (f[2] if z else 1 - f[2])
                value += grid[hi[2] if z else lo[2], hi[1] if y else lo[1], hi[0] if x else lo[0]] * w
    return np.maximum(0, value[0] + value[1] * normal.x + value[2] * normal.y + value[3] * normal.z)

directions = []
for i in range(SPEC['rays']):
    y = 1 - 2 * (i + .5) / SPEC['rays']
    r, theta = math.sqrt(1 - y * y), i * math.pi * (3 - math.sqrt(5))
    directions.append(Vector((math.cos(theta) * r, y, math.sin(theta) * r)))
DIRECTIONS = np.asarray(directions)
grids = []
for layout in SPEC['layout']:
    nx, ny, nz = layout['grid']
    grid = np.zeros((nz, ny, nx, 4, 3), dtype=np.float32)
    for z in range(nz):
        for y in range(ny):
            for x in range(nx):
                unit = np.asarray((x / (nx - 1), y / (ny - 1), z / (nz - 1)))
                position = np.asarray(layout['min']) + unit * (np.asarray(layout['max']) - layout['min'])
                position = np.clip(position, np.asarray(layout['min']) + .18, np.asarray(layout['max']) - .18)
                origin = Vector(position)
                radiance = np.asarray([trace(origin, d, layout['room']) for d in directions])
                # Cosine-convolved L1 SH, already scaled into a polynomial.
                grid[z, y, x, 0] = radiance.mean(axis=0) * math.pi
                for axis in range(3):
                    grid[z, y, x, axis + 1] = (radiance * DIRECTIONS[:, axis:axis + 1]).mean(axis=0) * (2 * math.pi)
        print('Room', layout['room'], 'probe slice', z + 1, '/', nz, flush=True)
    # Clamp truncation ringing: negative irradiance must not darken a material.
    # The shader also clamps the final reconstructed irradiance to zero.
    grids.append(grid)

width, height, depth = SPEC['atlas']
atlas = np.zeros((depth, height, width, 4), dtype='<f2')
offset, probe_count = 0, 0
for grid, layout in zip(grids, SPEC['layout']):
    nx, ny, nz = layout['grid']
    probe_count += nx * ny * nz
    # One duplicated border slice per coefficient prevents interpolation
    # between SH bands and between rooms in the packed 3D texture.
    for coefficient in range(4):
        band = grid[:, :, :, coefficient, :]
        padded = np.pad(band, ((1, 1), (0, height - ny), (0, width - nx), (0, 0)), mode='edge')
        atlas[offset:offset + nz + 2, :, :, :3] = padded
        atlas[offset:offset + nz + 2, :, :, 3] = 1
        offset += nz + 2

capture_width, capture_height = SPEC['captureSize']
captures = []
for layout in SPEC['layout']:
    origin = Vector(layout['capture'])
    pixels = np.zeros((capture_height, capture_width, 4), dtype=np.uint8)
    for y in range(capture_height):
        # EquirectangularReflectionMapping: bottom row points towards -Y.
        latitude = math.pi * ((y + .5) / capture_height - .5)
        for x in range(capture_width):
            phi = 2 * math.pi * ((x + .5) / capture_width - .5)
            d = Vector((math.cos(latitude) * math.cos(phi), math.sin(latitude), math.cos(latitude) * math.sin(phi)))
            colour = np.maximum(0, trace(origin, d, layout['room'], grids))
            peak = float(colour.max())
            if peak > 1e-8:
                exponent = math.ceil(math.log2(peak))
                pixels[y, x, :3] = np.clip(colour * 256 / (2 ** exponent), 0, 255).astype(np.uint8)
                pixels[y, x, 3] = exponent + 128
    captures.append(pixels.tobytes())
    print('Captured actual room', layout['room'], 'architecture.', flush=True)

metadata = {'inputSha256': hashlib.sha256(input_bytes).hexdigest(), 'probes': probe_count,
            'atlas': SPEC['atlas'], 'captureSize': SPEC['captureSize'], 'rays': SPEC['rays'],
            'transport': 'static single diffuse bounce; cosine-convolved L1 SH; RGBE room captures'}
encoded = json.dumps(metadata, separators=(',', ':')).encode()
header = SPEC['version'].encode() + struct.pack('<I', len(encoded)) + encoded
header += b'\0' * (-len(header) % 4)
payload = header + atlas.tobytes() + b''.join(captures)
with open(os.path.join(HERE, 'radiance.bin'), 'wb') as stream:
    stream.write(gzip.compress(payload, compresslevel=9, mtime=0))
print('Baked', probe_count, 'probes;', len(payload), 'unpacked bytes;', round(time.time() - START, 2), 'seconds.', flush=True)
