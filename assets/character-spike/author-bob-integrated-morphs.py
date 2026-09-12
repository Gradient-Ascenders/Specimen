"""Single-surface Bob morph authoring. Eyes/catchlights are body material faces.
Loading defines helpers only; author and review one pose at a time.
"""
import bpy
import json
from mathutils import Vector
ROOT=bpy.path.abspath('//../../')
OUT=ROOT+'assets/character-spike/'
EVIDENCE=ROOT+'docs/evidence/bob-integrated-eyes/'
BODY='Bob-Body'
BASE=.15392042696475983


def begin():
    obj=bpy.data.objects[BODY]
    assert obj.data.shape_keys is None
    obj.shape_key_add(name='Basis',from_mix=False)
    bpy.context.scene['integrated_basis_snapshot']=json.dumps(dict(vertices=[list(v.co) for v in obj.data.vertices],polygons=[list(p.vertices) for p in obj.data.polygons],uv=[list(u.uv) for u in obj.data.uv_layers.active.data],materials=[p.material_index for p in obj.data.polygons]))


def key_for(obj,name):
    return obj.data.shape_keys.key_blocks.get(name) or obj.shape_key_add(name=name,from_mix=False)


def author(name,deform,volume_y_anchor=None):
    obj=bpy.data.objects[BODY];key=key_for(obj,name)
    for source,target in zip(obj.data.shape_keys.key_blocks['Basis'].data,key.data):target.co=deform(source.co)
    if volume_y_anchor is not None:
        obj.data.calc_loop_triangles()
        def volume(points):
            return sum(points[t.vertices[0]].co.dot(points[t.vertices[1]].co.cross(points[t.vertices[2]].co)) for t in obj.data.loop_triangles)/6
        factor=volume(obj.data.shape_keys.key_blocks['Basis'].data)/volume(key.data)
        for v in key.data:v.co.y=volume_y_anchor+(v.co.y-volume_y_anchor)*factor
    key.slider_min=0;key.slider_max=1
    pose(name,1)


def pose(name='Basis',weight=0):
    obj=bpy.data.objects[BODY]
    if obj.data.shape_keys:
        for key in obj.data.shape_keys.key_blocks:key.value=weight if key.name==name and name!='Basis' else 0
    bpy.context.view_layer.update()


def camera(view):
    scene=bpy.context.scene;cam=scene.camera
    if view=='face':
        obj=bpy.data.objects[BODY].evaluated_get(bpy.context.evaluated_depsgraph_get())
        ids={i for p in obj.data.polygons if p.material_index==1 for i in p.vertices}
        target=sum((obj.data.vertices[i].co for i in ids),Vector())/len(ids) if ids else Vector((-.06,-.608,1.056))
        target.x=-.04;target.z+=.14
        cam.location=target+Vector((.28,-6,.5));cam.data.ortho_scale=2.0
    else:
        target=Vector((0,0,1.43))
        cam.location={'front':(0,-8,1.43),'side':(8,0,1.43),'three-quarter':(3.8,-8,2.8)}[view]
        cam.data.ortho_scale=3.75
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO'
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'


def wall(visible=True):
    obj=bpy.data.objects.get('Morph-Reference-Wall')
    if obj is None:
        bpy.ops.mesh.primitive_cube_add(size=1,location=(0,.755,1.62))
        obj=bpy.context.object;obj.name='Morph-Reference-Wall';obj.dimensions=(4,.04,3.2)
        obj.data.materials.append(bpy.data.objects['Lookdev-Floor'].material_slots[0].material)
        col=bpy.data.collections.new('Bob-Morph-Review-Aids');bpy.context.scene.collection.children.link(col)
        for owner in list(obj.users_collection):owner.objects.unlink(obj)
        col.objects.link(obj)
    obj.hide_render=not visible;obj.hide_set(not visible)


def render(name,weight,view,tag=''):
    pose(name,weight);camera(view)
    bpy.context.scene.render.filepath=EVIDENCE+tag+name.lower()+f'-{weight:.2f}-'+view+'.png'
    bpy.ops.render.render(write_still=True)

def smooth(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)


def profile(x,knots):
    # C1 monotone cubic profile with conservative harmonic slopes.
    slopes=[(b[1]-a[1])/(b[0]-a[0]) for a,b in zip(knots,knots[1:])]
    ds=[slopes[0]]
    for a,b in zip(slopes,slopes[1:]): ds.append(0 if a*b<=0 else 2*a*b/(a+b))
    ds.append(slopes[-1])
    if x<=knots[0][0]:return knots[0][1]+ds[0]*(x-knots[0][0])
    if x>=knots[-1][0]:return knots[-1][1]+ds[-1]*(x-knots[-1][0])
    for i in range(len(knots)-1):
        a,ya=knots[i];b,yb=knots[i+1]
        if a<=x<=b:
            h=b-a;t=(x-a)/h
            return (2*t**3-3*t*t+1)*ya+(t**3-2*t*t+t)*h*ds[i]+(-2*t**3+3*t*t)*yb+(t**3-t*t)*h*ds[i+1]


def squash(revision=1):
    def deform(p):
        x,y,z=p
        lower=1-smooth(.35,1.25,z);crown=smooth(1.42,2.06,z)
        zz=profile(z,[(BASE,BASE),(.4,.365),(.8,.675),(1.15,.92),(1.5,1.13),(2.061,1.40)])
        xx=x*(1.18+.12*lower)-.10*crown
        yy=y*((1.10 if revision else 1.19)+.04*lower)+.06*crown
        zz-=.05*crown*smooth(.35,.85,x) if revision else 0
        return (xx,yy,zz)
    author('Squash',deform)


def stretch(revision=1):
    def deform(p):
        x,y,z=p
        # Draw volume from the belly upward, retaining a rounded lower reservoir.
        zz=profile(z,[(BASE,BASE),(.4,.43),(.75,1.04),(1.10,1.62),(1.45,2.05),(1.65,2.26),(2.061,2.61)])
        sx=profile(z,[(BASE,.86),(.4,.86),(.8,.81),(1.2,.89),(1.5,.95),(2.061,1.04)])
        sy=profile(z,[(BASE,.96),(.4,.91),(.8,.79),(1.2,.82),(1.6,.88),(2.061,1.0)])
        if revision:
            zz=profile(z,[(BASE,BASE),(.4,.44),(.75,1.21),(1.1,1.67),(1.45,2.08),(1.65,2.29),(2.061,2.63)])
            sx=profile(z,[(BASE,.86),(.4,.84),(.8,.92),(1.2,.96),(1.5,.98),(2.061,1.04)])
        crown=smooth(1.44,2.06,z)
        lean=.11*smooth(.35,1.4,z)
        return (x*sx+lean+.18*crown,y*sy+.18*crown,zz-.07*crown*smooth(.2,.9,x))
    author('Stretch',deform,volume_y_anchor=0 if revision else None)


def cling(revision=1):
    plane=.733
    def deform(p):
        x,y,z=p
        contact=smooth(-.10,.4,y)
        lobe=smooth(.60,1.14,abs(x))*(1-smooth(.37,.72,z))
        if revision:lobe=smooth(.25,1.45,abs(x))*(1-smooth(.25,1.05,z))
        crown=smooth(1.43,2.061,z)
        # Rear skin forms a plane; the front remains a deep, convex gel reservoir.
        yy=profile(y,[(-1,-.86),(-.5,-.39),(0,.10),(.25,.64),(.40,plane),(.75,plane)])
        pull=.48 if revision else .92
        yy=yy*(1-pull*lobe)+plane*pull*lobe
        yy-=.20*crown
        xx=x*(1.03+.18*contact+.13*lobe)-.08*crown
        zz=BASE+(z-BASE)*(1.07+.09*contact)+.30-.16*crown
        return (xx,yy,zz)
    author('Cling',deform,volume_y_anchor=plane)
