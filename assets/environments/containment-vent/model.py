"""Blender model authoring core. Coordinates are game X/Y-up/Z, converted at mesh creation.
Run through Blender MCP, or from generate.py for a reproducible export.
"""
import bpy
import math
from mathutils import Vector, Matrix


def build_vent(shell):
    scene = bpy.context.scene
    mats = {}
    # Deliberately dim, light-independent finishes: no textures or live lights.
    for name, color in [('Graphite',(.018,.023,.027)), ('Panels',(.047,.058,.064)),
                        ('Flanges',(.075,.083,.087)), ('Marker',(.18,.105,.035))]:
        mat = bpy.data.materials.new('Vent_'+name)
        mat.diffuse_color = (*color,1)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        out = nodes.new('ShaderNodeOutputMaterial')
        emission = nodes.new('ShaderNodeEmission')
        emission.inputs['Color'].default_value = (*color,1)
        emission.inputs['Strength'].default_value = 1
        mat.node_tree.links.new(emission.outputs[0],out.inputs['Surface'])
        attribute = nodes.new('ShaderNodeVertexColor')
        attribute.layer_name = 'Color'
        mat.node_tree.links.new(attribute.outputs['Color'],emission.inputs['Color'])
        mats[name] = mat
    batches = {name:([],[]) for name in mats}
    def box(center, size, finish, origin=(0,0,0), angle=0):
        vs, fs = batches[finish]
        start = len(vs)
        rotation = Matrix.Rotation(math.radians(angle),3,'X')
        for x,y,z in [(-1,-1,-1),(-1,-1,1),(-1,1,1),(-1,1,-1),(1,-1,-1),(1,-1,1),(1,1,1),(1,1,-1)]:
            p = rotation @ Vector((center[0]+x*size[0]/2,center[1]+y*size[1]/2,center[2]+z*size[2]/2)) + Vector(origin)
            vs.append((p.x,-p.z,p.y))
        for f in [(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2)]:
            fs.append(tuple(start+i for i in f))
    for name,size,pos,angle in shell:
        box((0,0,0),size,'Graphite',pos,angle)
        if name.startswith('duct-crest-'):
            continue
        # Inset panel divisions on the interior face; the backing owns seams.
        axis = size.index(min(size))
        long = size.index(max(size))
        face = 1 if ('floor' in name or 'tile' in name or 'ramp' in name) else -1 if 'roof' in name else 1 if 'west' in name else -1 if 'east' in name else 1 if 'south' in name else -1
        count=max(1,math.ceil(size[long]/1.8))
        for j in range(count):
            dims=[max(.03,v-.04) for v in size]
            dims[axis]=.012
            dims[long]=size[long]/count-.025
            center=[0,0,0];center[axis]=face*(size[axis]/2+.006)
            center[long]=-size[long]/2+(j+.5)*size[long]/count
            box(center,dims,'Panels',pos,angle)
    # One continuous formed sheet over the tangent crest, with no crosswise
    # panel gaps at the slope changes. The box supports remain collision-owned.
    vs,fs=batches['Panels']
    start=len(vs)
    crest=[[23.0, 10.183871891105774], [23.155, 10.254691130318538], [23.31, 10.31597152825167], [23.465, 10.367742759030559], [23.619999999999997, 10.410034496780595], [23.775, 10.442876415627168], [23.93, 10.466298189695667], [24.084999999999997, 10.480329493111482], [24.24, 10.485]]
    for z,y in crest:
        for x in [-5.8,-3.8]: vs.append((x,-z,y+.012))
    for i in range(len(crest)-1):
        a=start+i*2
        fs.append((a,a+2,a+3,a+1))
    # Close the original flat-to-ramp construction gap (z=13..13.106).
    # A fitted sloping toe meets the visible panel surfaces, not a floating box.
    vs,fs=batches['Panels']
    start=len(vs)
    for x in [-5.8,-3.8]:
        for y,z in [(5.08,12.99),(5.08,13.14),(5.386,13.14),(5.237,12.99)]:
            vs.append((x,-z,y))
    for f in [(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2)]:
        fs.append(tuple(start+i for i in f))
    # Flanged service frames, always against the lining and clear of Bob's route.
    for origin,angle,length in [((-4.8,5.225,6),0,6.8),((-4.8,7.85,18.5),-26,10.8),((-8.4,10.485,25.2),0,3.7)]:
        ramp=angle!=0
        for z in ([-4.4,-1.0,2.4,5.0] if ramp else [.35,length-.35]):
            floor=.125 if ramp else 0
            for x in [-.91,.91]:
                box((x,floor+1.02,z),(.06,2.02,.12),'Flanges',origin,angle)
                box((x,floor+.08,z),(.11,.12,.18),'Graphite',origin,angle)
            box((0,floor+1.99,z),(1.88,.08,.12),'Flanges',origin,angle)
        # Low amber datum ticks lead uphill without lighting the tunnel.
        for z in ([-3,0,3] if ramp else [1,length-1]):
            box((-.94,(.125 if ramp else 0)+.28,z),(.016,.035,.30),'Marker',origin,angle)
    # Recess-like access grilles on the low run and final leg.
    for x,y,z,side in [(-5.74,6.24,10,1),(-7.46,11.48,27,-1)]:
        box((x,y,z),(.035,.74,1.3),'Graphite')
        for k in range(6):box((x+side*.027,y-.27+k*.105,z),(.035,.035,1.16),'Flanges')
        for dz in [-.66,.66]:box((x+side*.015,y,z+dz),(.045,.80,.055),'Flanges')
    # Turn direction: sparse chevrons on the far wall and a drop-edge marker.
    for x in [-5.2,-6.0,-6.8]:
        for dy in [-1,1]:
            for i in range(3):box((x+i*.07,11.36+dy*i*.07,24.845),(.09,.045,.014),'Marker')
    for x in [-9,-8.7,-8.4,-8.1,-7.8]:box((x,10.503,29.05),(.15,.012,.075),'Marker')
    for name,(vs,fs) in batches.items():
        mesh=bpy.data.meshes.new('Vent_'+name)
        mesh.from_pydata(vs,[],fs);mesh.update()
        colors=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        base=mats[name].diffuse_color
        for polygon in mesh.polygons:
            # Fixed directional occlusion and slight panel-to-panel variation.
            shade=1 if name=='Marker' else (.52+.28*abs(polygon.normal.z)+.14*abs(polygon.normal.x))*(.88+.12*((polygon.index//6)%3)/2)
            for index in polygon.loop_indices:
                colors.data[index].color=(base[0]*shade,base[1]*shade,base[2]*shade,1)
        obj=bpy.data.objects.new('Vent_'+name,mesh)
        scene.collection.objects.link(obj)
        obj.data.materials.append(mats[name])
        obj['visualOnly']=True
    scene['asset']='containment-vent-v1'
