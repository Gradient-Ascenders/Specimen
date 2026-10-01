"""Generate the rejected-design revision as an isolated Gate 1 candidate.

Front contours are authored in pixels against the user-supplied front reference
(1254 square, body x=271..963, contact y=955). One connected ring loft carries
both the bottom-heavy body and the curled crown; no intersecting add-on tube.
Run: blender --background --factory-startup --python <this-file>
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import runpy

import bpy

DIRECTORY = Path(__file__).resolve().parent
NEUTRAL_SOURCE = DIRECTORY / 'generate-bob-gate-one.py'
neutral = runpy.run_path(str(NEUTRAL_SOURCE))
BLEND_PATH = DIRECTORY / 'bob-curl-candidate.blend'
GLB_PATH = DIRECTORY / 'bob-curl-candidate.glb'
REPORT_PATH = DIRECTORY / 'bob-curl-candidate.validation.json'
PIXELS_PER_METRE = 692.0
REFERENCE_CENTRE_X = 617.0
REFERENCE_CONTACT_Y = 955.0
SEGMENTS = 32

# Bottom to crown. Each tuple is (reference row, left edge, right edge).
# The widest rings sit just above the sole. The small outward turn between
# rows 810 and 890 is the reference's lower cheek, not an equatorial bulge.
BODY_PROFILE = (
    (955, 390, 844), (952, 347, 887), (946, 323, 913),
    (937, 308, 925), (925, 295, 940), (910, 284, 952),
    (890, 274, 960), (870, 271, 963), (850, 273, 960),
    (830, 278, 953), (810, 287, 944), (790, 295, 937),
    (770, 299, 932), (740, 307, 923), (710, 318, 912),
    (680, 332, 898), (650, 349, 882), (620, 370, 862),
    (600, 386, 846), (580, 406, 828), (560, 429, 806),
    (540, 457, 779), (520, 493, 745), (510, 517, 722),
)

# Paired outer/inner edges of the sprout, continuing directly from the dome.
# This produces a narrow neck, widening soft bend, and a rounded drop-shaped
# end. Depth is rounded independently so the accepted front outline stays fixed.
CURL_PROFILE = (
    ((546, 500), (693, 500)),
    ((574, 482), (651, 484)),
    ((583, 460), (637, 465)),
    ((584, 435), (633, 446)),
    ((587, 406), (638, 426)),
    ((595, 373), (653, 410)),
    ((613, 340), (679, 408)),
    ((641, 309), (706, 422)),
    ((674, 289), (737, 435)),
    ((710, 280), (770, 436)),
    ((750, 282), (799, 425)),
    ((785, 294), (819, 407)),
    ((813, 320), (831, 380)),
    ((828, 343), (834, 368)),
)
CURL_TIP = (834, 356)


def runtime_point(pixel_x, pixel_y, depth=0.0):
    # A camera looking along runtime +Z sees runtime +X on its left.
    return ((REFERENCE_CENTRE_X-pixel_x)/PIXELS_PER_METRE,
            -0.45+(REFERENCE_CONTACT_Y-pixel_y)/PIXELS_PER_METRE, depth)


def catmull(a, b, c, d, t):
    return tuple(0.5*(2*b[i]+(-a[i]+c[i])*t+
                      (2*a[i]-5*b[i]+4*c[i]-d[i])*t*t+
                      (-a[i]+3*b[i]-3*c[i]+d[i])*t*t*t)
                 for i in range(len(a)))


def create_candidate_body(material):
    # Cross-section endpoints lie in the reference plane; the depth axis
    # stays perpendicular to it. Equal ring topology gives a smooth junction.
    rings = []
    for row, left, right in BODY_PROFILE:
        rings.append(((left, row), (right, row), 0.86, 0.0))
    for index in range(len(CURL_PROFILE)-1):
        for t in (0.0, 0.5):
            pair = []
            for side in (0, 1):
                pair.append(catmull(CURL_PROFILE[max(0,index-1)][side],
                                    CURL_PROFILE[index][side],
                                    CURL_PROFILE[index+1][side],
                                    CURL_PROFILE[min(len(CURL_PROFILE)-1,index+2)][side], t))
            # Preserve the body/root ring, then ease into nearly circular
            # antenna sections. Only runtime Z changes: every front X/Y
            # coordinate, the centreline and the existing taper stay fixed.
            depth_blend = min(1.0, (index+t)/2)
            depth_blend = depth_blend*depth_blend*(3-2*depth_blend)
            depth_ratio = 0.86+(1.04-0.86)*depth_blend
            # A gradual forward lean lets the curl retain its character in
            # side view without changing any point in the front projection.
            centre_pixel_x=(pair[0][0]+pair[1][0])/2
            forward=-0.65*(centre_pixel_x-REFERENCE_CENTRE_X)/PIXELS_PER_METRE
            forward*=min(1.0,(index+t)/2)
            rings.append((*pair, depth_ratio, forward))
    last_centre_x=sum(point[0] for point in CURL_PROFILE[-1])/2
    last_forward=-0.65*(last_centre_x-REFERENCE_CENTRE_X)/PIXELS_PER_METRE
    rings.append((*CURL_PROFILE[-1], 1.04, last_forward))
    vertices = [neutral['runtime_to_blender'](runtime_point(617, 955))]
    for left, right, depth_ratio, forward in rings:
        centre = ((left[0]+right[0])/2, (left[1]+right[1])/2)
        radial = ((left[0]-right[0])/2, (left[1]-right[1])/2)
        depth_radius = math.hypot(*radial)/PIXELS_PER_METRE*depth_ratio
        for segment in range(SEGMENTS):
            angle = math.tau*segment/SEGMENTS
            x = centre[0]+radial[0]*math.cos(angle)
            y = centre[1]+radial[1]*math.cos(angle)
            z = forward+depth_radius*math.sin(angle)
            vertices.append(neutral['runtime_to_blender'](runtime_point(x,y,z)))
    tip = len(vertices)
    tip_forward=-0.65*(CURL_TIP[0]-REFERENCE_CENTRE_X)/PIXELS_PER_METRE
    vertices.append(neutral['runtime_to_blender'](runtime_point(*CURL_TIP,tip_forward)))
    faces=[]
    for segment in range(SEGMENTS):
        following=(segment+1)%SEGMENTS
        faces.append((0, 1+segment, 1+following))
        for ring in range(len(rings)-1):
            lower=1+ring*SEGMENTS
            upper=lower+SEGMENTS
            faces.append((lower+segment, upper+segment, upper+following, lower+following))
        last=1+(len(rings)-1)*SEGMENTS
        faces.append((last+segment,tip,last+following))
    mesh=bpy.data.meshes.new('Bob-Body-Mesh')
    mesh.from_pydata(vertices,[],faces)
    mesh.materials.append(material)
    mesh.validate(verbose=True)
    mesh.update(calc_edges=True)
    for polygon in mesh.polygons:
        polygon.use_smooth=True
    return bpy.data.objects.new('Bob-Body',mesh)


def create_candidate_eye(name, centre_pixel_x, tilt_degrees, material, body):
    centre_x,centre_y,_=runtime_point(centre_pixel_x,721)
    radius_x,radius_y=49/PIXELS_PER_METRE,98/PIXELS_PER_METRE
    tilt=math.radians(tilt_degrees)
    segments,rings=28,5
    vertices=[]
    for ring in range(rings+1):
        radial=ring/rings
        for segment in range(segments if ring else 1):
            angle=math.tau*segment/segments
            dx=radius_x*radial*math.cos(angle)
            dy=radius_y*radial*math.sin(angle)
            x=centre_x+dx*math.cos(tilt)-dy*math.sin(tilt)
            y=centre_y+dx*math.sin(tilt)+dy*math.cos(tilt)
            depth=0.002+0.018*(1-radial*radial)**1.35
            z=neutral['front_surface_z'](body,x,y)-depth
            vertices.append(neutral['runtime_to_blender']((x,y,z)))
    faces=[]
    for segment in range(segments):
        following=(segment+1)%segments
        faces.append((0,1+following,1+segment))
        for ring in range(rings-1):
            current=1+ring*segments
            after=current+segments
            faces.append((current+segment,current+following,after+following,after+segment))
    mesh=bpy.data.meshes.new(name+'-Mesh')
    mesh.from_pydata(vertices,[],faces)
    mesh.materials.append(material)
    mesh.update(calc_edges=True)
    for polygon in mesh.polygons:
        polygon.use_smooth=True
    return bpy.data.objects.new(name,mesh)


def build():
    neutral['clear_scene']()
    bpy.context.preferences.filepaths.save_version=0
    body_material=neutral['create_material']('Bob-Neutral-Body',(0.48,0.51,0.53,1.0))
    eye_material=neutral['create_material']('Bob-Neutral-Eyes',(0.025,0.035,0.045,1.0),roughness=0.20)
    root=bpy.data.objects.new('Bob-Gate-One',None)
    bpy.context.scene.collection.objects.link(root)
    body=create_candidate_body(body_material)
    bpy.context.scene.collection.objects.link(body)
    body.parent=root
    eyes=[]
    for name,pixel_x,tilt in (('Bob-Eye-Left',729,-8),('Bob-Eye-Right',524,8)):
        eye=create_candidate_eye(name,pixel_x,tilt,eye_material,body)
        bpy.context.scene.collection.objects.link(eye)
        eye.parent=root
        eyes.append(eye)
    root['candidate']='front-reference-v3-antenna-depth'
    root['local_up']='+Y'
    root['local_forward']='-Z'
    root['collider_radius_metres']=0.45
    body['resting_contact_y_metres']=-0.45
    points=[neutral['blender_to_runtime'](vertex.co) for vertex in body.data.vertices]
    report={
        'status':'gate-1-candidate-awaiting-visual-approval',
        'reference':'user-supplied front reference 2026-09-23',
        'reference_projection':{'pixels_per_metre':PIXELS_PER_METRE,
                                'centre_x':REFERENCE_CENTRE_X,'contact_y':REFERENCE_CONTACT_Y},
        'body_triangles':neutral['triangle_count'](body.data),
        'eye_triangles_combined':sum(neutral['triangle_count'](eye.data) for eye in eyes),
        'body_connected_components':neutral['connected_component_count'](body.data),
        'body_non_manifold_edges':neutral['body_manifold_edge_count'](body.data),
        'body_bounds_metres':{
            'minimum':[round(min(p[axis] for p in points),6) for axis in range(3)],
            'maximum':[round(max(p[axis] for p in points),6) for axis in range(3)]},
        'morph_targets':0,'armatures':0,'animations':0,
    }
    assert report['body_connected_components']==1,report
    assert report['body_non_manifold_edges']==0,report
    assert 2000<=report['body_triangles']<=3500,report
    assert report['eye_triangles_combined']<=600,report
    assert report['body_triangles']+report['eye_triangles_combined']<=4100,report
    assert report['body_bounds_metres']['minimum'][1]==-0.45,report
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH),check_existing=False)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(GLB_PATH),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=False,export_animations=False,export_skins=False,
        export_morph=False,export_cameras=False,export_lights=False,export_materials='EXPORT',
        export_attributes=False,export_extras=True)
    report['generator_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    report['neutral_generator_sha256']=hashlib.sha256(NEUTRAL_SOURCE.read_bytes()).hexdigest()
    report['glb_sha256']=hashlib.sha256(GLB_PATH.read_bytes()).hexdigest()
    REPORT_PATH.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    build()
