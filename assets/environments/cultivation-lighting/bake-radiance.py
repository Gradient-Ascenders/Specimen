"""Bounded offline transport from the actual runtime's static render surfaces.

Use --background --factory-startup --threads 2. This script creates no Blender
objects, touches no editable scenes and never invokes Cycles or a live capture.
Two fixed-light states, validity-weighted SH volumes and local RGBE reflections
are generated together from the same BVH. Moving assemblies remain runtime lit.
"""
import gzip
import hashlib
import json
import math
import os
import struct
import time
import sys
if sys.platform == 'win32':
    # Bound this background process, never the open Windows Blender GUI. A
    # failed allocation stops this bake instead of exhausting the WSL host.
    import ctypes
    from ctypes import wintypes
    class BasicLimit(ctypes.Structure):
        _fields_ = [('process_time', ctypes.c_int64), ('job_time', ctypes.c_int64), ('flags', wintypes.DWORD),
                    ('minimum', ctypes.c_size_t), ('maximum', ctypes.c_size_t), ('processes', wintypes.DWORD),
                    ('affinity', ctypes.c_size_t), ('priority', wintypes.DWORD), ('scheduling', wintypes.DWORD)]
    class Counters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_uint64) for name in ('reads', 'writes', 'other', 'read_bytes', 'write_bytes', 'other_bytes')]
    class ExtendedLimit(ctypes.Structure):
        _fields_ = [('basic', BasicLimit), ('io', Counters), ('process_memory', ctypes.c_size_t),
                    ('job_memory', ctypes.c_size_t), ('peak_process', ctypes.c_size_t), ('peak_job', ctypes.c_size_t)]
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateJobObjectW.restype = wintypes.HANDLE
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    BAKE_JOB = kernel.CreateJobObjectW(None, None)
    limit = ExtendedLimit(); limit.basic.flags = 0x100; limit.process_memory = 1536*1024*1024
    if not BAKE_JOB or not kernel.SetInformationJobObject(BAKE_JOB, 9, ctypes.byref(limit), ctypes.sizeof(limit)) or not kernel.AssignProcessToJobObject(BAKE_JOB, kernel.GetCurrentProcess()):
        raise RuntimeError('Could not establish the background bake memory limit.')
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
START = time.time()
raw_input = open(os.path.join(HERE, 'bake-input.json'), 'rb').read()
SPEC = json.loads(raw_input)
if hashlib.sha256(open(__file__, 'rb').read()).hexdigest() != SPEC['sources']['generatorSha256']:
    raise RuntimeError('Regenerate the lighting inputs first.')
raw = gzip.decompress(open(os.path.normpath(os.path.join(HERE, SPEC['geometryFile'])), 'rb').read())
if hashlib.sha256(raw).hexdigest() != SPEC['geometrySha256']:
    raise RuntimeError('Stale static geometry bank.')
records = np.frombuffer(raw, dtype='<f4').reshape((-1, 15))
unique, inverse = np.unique(records[:, :9].reshape((-1, 3)), axis=0, return_inverse=True)
positions = unique.tolist()
triangles = inverse.reshape((-1, 3)).tolist()
BVH = BVHTree.FromPolygons(positions, triangles, all_triangles=True, epsilon=.0001)
COLOUR = np.clip(records[:, 9:12], 0, 1)
EMISSION = records[:, 12:15]
del positions, triangles, unique, inverse
print('Static BVH:', len(records), 'triangles; two lighting states.', flush=True)

TINTS = SPEC['zoneTints']
LIGHTS = []
for spec in SPEC['lights']:
    light = dict(spec)
    light['p'] = Vector(spec['position'])
    if 'target' in spec:
        light['axis'] = (Vector(spec['target']) - light['p']).normalized()
        light['outer'] = math.cos(spec['angle'])
        light['inner'] = math.cos(spec['angle'] * (1-spec['penumbra']))
    LIGHTS.append(light)

def smooth(a, b, x):
    t = min(1., max(0., (x-a)/max(1e-7, b-a)))
    return t*t*(3-2*t)

def direct(point, normal, zone):
    energy = np.zeros((2, 3))
    origin = point + normal*.04
    tint = np.asarray(TINTS[zone])
    for light in LIGHTS:
        delta = light['p'] - origin
        distance = delta.length
        if distance >= light['range'] or distance < .05:
            continue
        direction = delta/distance
        cosine = max(0., normal.dot(direction))
        if cosine <= 0:
            continue
        cone = smooth(light['outer'], light['inner'], -direction.dot(light['axis'])) if 'axis' in light else 1.
        if cone <= 0 or BVH.ray_cast(origin, direction, max(.001, distance-.16))[0] is not None:
            continue
        attenuation = (1-(distance/light['range'])**4)**2 / max(distance**light['decay'], .01)
        radiance = np.asarray(light['colour'])*light['intensity']*attenuation*cosine*cone
        if 'acid-reflected-light' in light['name']:
            energy += radiance
        else:
            energy[0] += radiance*tint
            energy[1] += radiance*np.asarray((1., .53, .19))*.34
    return energy

def interpolate(grid, layout, p, n):
    size = np.asarray(layout['grid'])
    uv = np.clip((np.asarray(p)-layout['min'])/(np.asarray(layout['max'])-layout['min']), 0, 1)*(size-1)
    lo = np.floor(uv).astype(int)
    hi = np.minimum(lo+1, size-1)
    f = uv-lo
    value = np.zeros((2, 4, 3))
    validity = 0.
    for z in (0, 1):
        for y in (0, 1):
            for x in (0, 1):
                w = (f[0] if x else 1-f[0])*(f[1] if y else 1-f[1])*(f[2] if z else 1-f[2])
                v = grid[hi[2] if z else lo[2], hi[1] if y else lo[1], hi[0] if x else lo[0]]
                value += v[:, :, :3]*w
                validity += v[0, 0, 3]*w
    if validity < .02:
        return np.zeros((2, 3))
    value /= validity
    return np.maximum(0, value[:, 0]+value[:, 1]*n.x+value[:, 2]*n.y+value[:, 3]*n.z)

def trace(origin, direction, zone, grids=None):
    p, n, face, distance = BVH.ray_cast(origin, direction, 180)
    for liquid in SPEC['liquids']:
        if direction.y >= -.001:
            continue
        t = (liquid['max'][1]-origin.y)/direction.y
        if t > .025 and (p is None or t < distance):
            q = origin+direction*t
            if liquid['min'][0] < q.x < liquid['max'][0] and liquid['min'][2] < q.z < liquid['max'][2]:
                return np.tile(liquid['colour'], (2, 1)), False, t
    if p is None:
        return np.zeros((2, 3)), False, 180.
    back = n.dot(direction) > 0
    if back:
        n = -n
    energy = direct(p, n, zone)
    if grids is not None:
        energy += interpolate(grids[zone], SPEC['layout'][zone], p+n*.18, n)
        energy[0] += np.asarray((.08, .09, .09))*(.3+.7*max(0, n.y))
        energy[1] += np.asarray((.025, .021, .016))*(.3+.7*max(0, n.y))
    emission = np.stack((EMISSION[face], EMISSION[face]*np.asarray((1., .6, .25))*.4))
    return np.minimum(8., COLOUR[face]*energy/math.pi+emission), back, distance

directions = []
for i in range(SPEC['rays']):
    y = 1-2*(i+.5)/SPEC['rays']
    r, theta = math.sqrt(1-y*y), i*math.pi*(3-math.sqrt(5))
    directions.append(Vector((math.cos(theta)*r, y, math.sin(theta)*r)))
direction_array = np.asarray(directions)
grids = []
invalid = 0
for zone, layout in enumerate(SPEC['layout']):
    nx, ny, nz = layout['grid']
    grid = np.zeros((nz, ny, nx, 2, 4, 4), dtype=np.float32)
    for z in range(nz):
        for y in range(ny):
            for x in range(nx):
                p = np.asarray(layout['min'])+np.asarray((x/(nx-1), y/(ny-1), z/(nz-1)))*(np.asarray(layout['max'])-layout['min'])
                p = np.clip(p, np.asarray(layout['min'])+.13, np.asarray(layout['max'])-.13)
                origin = Vector(p)
                results = [trace(origin, d, zone) for d in directions]
                hits = [result for result in results if result[2] < 179]
                back_fraction = sum(result[1] for result in hits)/max(1, len(hits))
                # A probe inside opaque hardware sees mostly back faces. Its
                # contribution and interpolation weight are both suppressed.
                valid = 1.-smooth(.40, .76, back_fraction)
                if min(result[2] for result in results) < .035:
                    valid *= .05
                if valid < .02:
                    invalid += 1
                radiance = np.asarray([result[0] for result in results])
                grid[z, y, x, :, 0, :3] = radiance.mean(axis=0)*math.pi*valid
                for axis in range(3):
                    grid[z, y, x, :, axis+1, :3] = (radiance*direction_array[:, axis, None, None]).mean(axis=0)*2*math.pi*valid
                grid[z, y, x, :, :, 3] = valid
        print(layout['name'], 'slice', z+1, '/', nz, flush=True)
    grids.append(grid)

width, height, depth = SPEC['atlas']
state_depth = depth//2
atlas = np.zeros((depth, height, width, 4), dtype='<f2')
offset = 0
for grid, layout in zip(grids, SPEC['layout']):
    nx, ny, nz = layout['grid']
    for state in range(2):
        for band in range(4):
            values = grid[:, :, :, state, band]
            padded = np.pad(values, ((1, 1), (0, 9-ny), (0, width-nx), (0, 0)), mode='edge')
            atlas[state*state_depth+offset:state*state_depth+offset+nz+2, band*9:(band+1)*9] = padded
    offset += nz+2

capture_width, capture_height = SPEC['captureSize']
captures = [[None]*len(grids) for _ in range(2)]
for zone, layout in enumerate(SPEC['layout']):
    origin = Vector(layout['capture'])
    pixels = np.zeros((2, capture_height, capture_width, 4), dtype=np.uint8)
    for y in range(capture_height):
        latitude = math.pi*((y+.5)/capture_height-.5)
        for x in range(capture_width):
            phi = 2*math.pi*((x+.5)/capture_width-.5)
            d = Vector((math.cos(latitude)*math.cos(phi), math.sin(latitude), math.cos(latitude)*math.sin(phi)))
            radiance = trace(origin, d, zone, grids)[0]
            for state in range(2):
                colour = np.maximum(0, radiance[state])
                peak = float(colour.max())
                if peak > 1e-8:
                    exponent = math.ceil(math.log2(peak))
                    pixels[state, y, x, :3] = np.clip(colour*256/(2**exponent), 0, 255).astype(np.uint8)
                    pixels[state, y, x, 3] = exponent+128
    for state in range(2):
        captures[state][zone] = pixels[state].tobytes()
    print('Captured', layout['name'], 'normal / emergency.', flush=True)

metadata = {'inputSha256': hashlib.sha256(raw_input).hexdigest(), 'atlas': SPEC['atlas'], 'captureSize': SPEC['captureSize'],
            'zones': len(grids), 'states': 2, 'probes': sum(np.prod(p['grid']).item() for p in SPEC['layout']),
            'invalidProbes': invalid, 'transport': 'single diffuse bounce; visibility-weighted L1 SH; two static lighting states'}
encoded = json.dumps(metadata, separators=(',', ':')).encode()
header = SPEC['version'].encode()+struct.pack('<I', len(encoded))+encoded
header += b'\0'*(-len(header)%4)
payload = header+atlas.tobytes()+b''.join(c for state in captures for c in state)
with open(os.path.join(HERE, 'radiance.bin'), 'wb') as stream:
    stream.write(gzip.compress(payload, compresslevel=9, mtime=0))
print('Baked', metadata['probes'], 'probes,', len(grids)*2, 'captures;', len(payload), 'bytes;', round(time.time()-START, 1), 'seconds.', flush=True)
