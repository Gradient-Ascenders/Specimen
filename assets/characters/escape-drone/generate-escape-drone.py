"""Blender-authored free-flight security carrier for Goop's escape.

Reuses the accepted security family's editable hull builders. Head, airframe
and rotor buffers remain separate; the existing cinematic owns every pose.
"""
import bpy
import math
from pathlib import Path
import importlib.util

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('security_builders', HERE.parent / 'cultivation-security/generate-security.py')
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
core.SCENE = "Goop Escape Drone Foundry"
core.MATERIAL_PREFIX = 'ED_'
core.SIZES = {'escape': (1.6, .8, 1.4)}


def escape_setup():
    core.setup()
    for role,rough,metal in [('armour',.27,.48),('armourShadow',.38,.72),('mechanism',.34,.82),('barrel',.24,.9)]:
        material=bpy.data.materials['ED_'+role]
        material.use_backface_culling=True
        bsdf=material.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Roughness'].default_value=rough
        bsdf.inputs['Metallic'].default_value=metal
    head = core.rig('escape')
    head['asset'] = 'containment-escape-drone-v1'
    for name in ['ED_Airframe', 'ED_Rotor']:
        root = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(root)
        root['asset'] = 'containment-escape-drone-v1'


def escape_head():
    core.armour('escape',marking_offset=.12)
    core.optics_and_weapons('escape')


def escape_fan_profile(name, at, root):
    loops = [(.77, -.105), (.91, -.105), (1, -.065), (1, .09),
             (.95, .125), (.83, .125), (.77, .065)]
    roles = ['mechanism', 'armourShadow', 'armourShadow', 'armour',
             'armour', 'armourShadow', 'mechanism']
    sides = 24
    rings = [[(at[0] + r * .37 * math.cos(k * math.tau / sides),
               at[1] + y, at[2] + r * .37 * math.sin(k * math.tau / sides))
              for k in range(sides)] for r, y in loops]
    for j, role in enumerate(roles):
        band=core.mesh(name + '_duct_band_' + str(j), rings[j] + rings[(j + 1) % len(rings)],
                       [(k, (k + 1) % sides, (k + 1) % sides + sides, k + sides) for k in range(sides)], role, root)
        # Individual finish strips are open patches. Their outward winding is
        # determined by the closed duct section, rather than guessed per strip.
        dr=(loops[(j+1)%len(loops)][0]-loops[j][0])*.37
        dy=loops[(j+1)%len(loops)][1]-loops[j][1]
        for face in band.data.polygons:
            rx=face.center.x-at[0];rz=-face.center.y-at[2]
            radial=math.hypot(rx,rz)
            if face.normal.x*rx/radial*dy-face.normal.y*rz/radial*dy-face.normal.z*dr<0:face.flip()
        band.data.update()
    # A single union-shaped guard has no duplicate crossing faces.
    s, w = .303, .015
    outline = [(-s,-w),(-w,-w),(-w,-s),(w,-s),(w,-w),(s,-w),
               (s,w),(w,w),(w,s),(-w,s),(-w,w),(-s,w)]
    vv = [(at[0]+x, at[1]+y, at[2]+z) for y in [.070,.090] for x,z in outline]
    core.mesh(name + '_fixed_guard', vv, [tuple(reversed(range(12))),tuple(range(12,24))]+
              [(k,(k+1)%12,(k+1)%12+12,k+12) for k in range(12)], 'mechanism', root, .003)
    for side in [-1,1]:
        core.tube(name + '_captive_fastener', (at[0]+side*.332,at[1]+.075,at[2]),
                  (at[0]+side*.332,at[1]+.142,at[2]),.018,'mechanism',root,8,False)


def escape_airframe():
    root = bpy.data.objects['ED_Airframe']
    # Bob's original landing deck stays .85 x .8, with its top exactly +.51 m.
    core.box('CarrierLandingDeck', (.85,.08,.8), (0,.47,0), 'armour', root, .012)
    core.box('DeckUndercarriage', (.55,.11,.54), (0,.36,0), 'mechanism', root, .018)
    for side in [-1,1]:
        core.box('OuterLongeron', (.11,.08,1.35), (side*.845,.235,0), 'armourShadow', root, .015)
        for z in [-.65,.65]:
            core.tube('TriangulatedLiftArm', (side*.39,.413,z*.43),
                      (side*.845,.235,z*.80),.038,'mechanism',root,8)
            escape_fan_profile('LiftFan_' + str(side) + '_' + str(z), (side*.95,.38,z), root)
        core.box('ServiceCheek', (.07,.12,.48), (side*.935,.21,0), 'armour', root, .012)


def escape_rotor():
    root = bpy.data.objects['ED_Rotor']
    for k in range(6):
        a = k * math.tau / 6
        shape = [(.070,-.012),(.255,-.028),(.269,.004),(.093,.024)]
        vv = [(A*math.cos(a)-B*math.sin(a),y,A*math.sin(a)+B*math.cos(a))
              for y in [-.010,.006] for A,B in shape]
        core.mesh('SweptRotorBlade', vv, [(3,2,1,0),(4,5,6,7),(0,1,5,4),
                  (1,2,6,5),(2,3,7,6),(3,0,4,7)],'barrel',root)
    core.profile('RotorHub', [(.001,-.05),(.085,-.05),(.085,.027),(.062,.045),(.001,.045)],
                 (0,0,0),'y','barrel',root,16)


def escape_finish():
    for root, prefix in [(core.rig('escape'),'ED_Head'),(bpy.data.objects['ED_Airframe'],'ED_Airframe'),
                         (bpy.data.objects['ED_Rotor'],'ED_Rotor')]:
        roles = [role for role in core.ROLES[:4] if any(o.get('securityRole')==role for o in root.children)]
        for role in roles:
            parts = [o for o in root.children if o.type=='MESH' and o.get('securityRole')==role]
            for o in bpy.context.selected_objects:o.select_set(False)
            for o in parts:o.select_set(True)
            bpy.context.view_layer.objects.active=parts[0]
            if len(parts)>1:bpy.ops.object.join()
            part=bpy.context.view_layer.objects.active
            part.name=prefix+'_'+role
            part['escapePart']=prefix.removeprefix('ED_')
            part.select_set(False)
    # The source shows the four actual rotor instances, sharing editable data.
    rotor=bpy.data.objects['ED_Rotor_barrel']
    rotor.hide_set(True)
    for x in [-.95,.95]:
        for z in [-.65,.65]:
            preview=rotor.copy();preview.data=rotor.data;preview.parent=None
            bpy.context.scene.collection.objects.link(preview)
            preview.name='ED_PreviewRotor';preview['referenceOnly']=True
            preview.location=core.xyz((x,.38,z));preview.hide_set(False)
    core.runtime_pupil_reference('escape')
    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type=='VIEW_3D':
            area.spaces.active.shading.type='MATERIAL'
            area.spaces.active.overlay.show_overlays=False


def escape_export(save=True):
    for o in bpy.context.selected_objects:o.select_set(False)
    parts=[o for o in bpy.context.scene.objects if o.get('escapePart') and not o.get('referenceOnly')]
    rotor=bpy.data.objects['ED_Rotor_barrel'];rotor.hide_set(False)
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    links=[]
    for role in core.ROLES[:4]:
        tree=bpy.data.materials['ED_'+role].node_tree
        for link in list(tree.nodes.get('Principled BSDF').inputs['Base Color'].links):
            links.append((tree,link.from_socket,link.to_socket));tree.links.remove(link)
    try:
        bpy.ops.export_scene.gltf(filepath=str(HERE/'escape-drone.glb'),export_format='GLB',use_selection=True,
            use_active_scene=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,
            export_animations=False,export_vertex_color='NAME',export_vertex_color_name='wear',export_all_vertex_colors=False)
    finally:
        for tree,source,target in links:tree.links.new(source,target)
        for o in parts:o.select_set(False)
        rotor.hide_set(True)
    if save:bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'escape-drone.blend'))
    print('Exported eight shared head, airframe and rotor buffers')


if __name__=='__main__':
    if bpy.app.background and bpy.context.scene.name=='Scene':
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    escape_setup();escape_head();escape_airframe();escape_rotor();escape_finish();escape_export()
