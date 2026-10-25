"""Original Cultivation architecture; metres, Three (x,y,z) -> Blender (x,-z,y).

Stages are deliberately callable separately through Blender MCP. Only this
studio's C2_ objects regenerate. Runtime lights, colliders and mechanisms are
references; export contains no cameras, lights, colliders or animation tracks.
"""
import bpy
import bmesh
import json
import math
import sys
from mathutils import Vector, Matrix

HERE=__file__[:max(__file__.rfind('/'),__file__.rfind('\\'))]
ROOT=HERE+'/../../..'
LAYOUT=json.load(open(HERE+'/authoring-layout.json',encoding='utf8'))
PALETTE={
    'Ceramic':((.74,.73,.64),.86,.03),
    'Cool':((.24,.36,.32),.86,.08),
    'Resin':((.39,.46,.44),.84,.08),
    'Graphite':((.055,.079,.078),.82,.38),
    'Alloy':((.30,.37,.37),.60,.70),
    'Oxide':((.34,.22,.12),.94,.30),
    'Amber':((.62,.37,.09),.72,.15),
    'Foliage':((.15,.27,.085),.91,0),
    'Loam':((.13,.095,.055),.98,0),
    'Lamp':((.92,.91,.82),.38,0),
    'Deck':((.72,.71,.61),.93,.02),
    'Ink':((.82,.81,.73),.90,0),
    'Paint':((.74,.74,.69),.96,0),
    'Seal':((.045,.052,.047),.98,0),
    'Composite':((.52,.55,.49),.96,.04),
    'Rust':((.75,.74,.70),.98,.12),
}
# New passage surfaces share Room 1's finishes while the approved entrance
# shutter retains its original material names, buffers and appearance.
for _finish in ['Ceramic','Cool','Resin','Graphite','Alloy','Oxide','Foliage','Loam','Lamp','Ink','Paint','Seal']:
    _colour,_rough,_metal=PALETTE[_finish]
    _colour={'Ceramic':(.69,.68,.63),'Cool':(.39,.42,.40),'Resin':(.40,.42,.40),
        'Alloy':(.36,.40,.39),'Oxide':(.25,.27,.25),'Graphite':(.07,.08,.075)}.get(_finish,_colour)
    PALETTE['Hall'+_finish]=(_colour,_rough,_metal)
PALETTE['HallGlass']=((.46,.55,.49),.40,.02)
for _finish in list(PALETTE):
    if not _finish.startswith('Hall'):
        PALETTE['Test'+_finish]=PALETTE.get('Hall'+_finish,PALETTE[_finish])
PALETTE['TestGlass']=PALETTE['HallGlass']
CURRENT=None
BOXES=[]
DETAILS=[]
OCCLUDERS=[]

def xyz(p): return (p[0],-p[2],p[1])

def setup(room):
    global CURRENT,BOXES,DETAILS,OCCLUDERS
    CURRENT=room;BOXES=[];DETAILS=[];OCCLUDERS=[]
    name='Cultivation / '+room
    scene=bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    bpy.context.window.scene=scene
    prefix='C2_'+room+'_'
    for o in list(scene.objects):
        if o.name.startswith(prefix): bpy.data.objects.remove(o,do_unlink=True)
    for blocks in (bpy.data.meshes,bpy.data.curves,bpy.data.materials,bpy.data.lights,bpy.data.cameras):
        for block in list(blocks):
            if block.name.startswith(prefix) and block.users==0: blocks.remove(block)
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene.world=bpy.data.worlds.get('C2_StudioWorld') or bpy.data.worlds.new('C2_StudioWorld')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
    for finish,(colour,rough,metal) in PALETTE.items():
        if room=='room-1':
            colour={'Ceramic':(.69,.68,.63),'Cool':(.39,.42,.40),'Resin':(.40,.42,.40),
                'Alloy':(.36,.40,.39),'Oxide':(.25,.27,.25),'Graphite':(.07,.08,.075)}.get(finish,colour)
        mat=bpy.data.materials.new(prefix+finish);mat.use_nodes=True
        mat.diffuse_color=(*colour,1);mat.use_backface_culling=True
        shader=mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value=(*colour,1)
        shader.inputs['Roughness'].default_value=rough;shader.inputs['Metallic'].default_value=metal
        if room=='room-1' or finish.startswith(('Hall','Test')):
            colour_node=mat.node_tree.nodes.new('ShaderNodeVertexColor');colour_node.layer_name='wear'
            tint=mat.node_tree.nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY'
            tint.inputs[0].default_value=1;tint.inputs[1].default_value=(*colour,1)
            mat.node_tree.links.new(colour_node.outputs['Color'],tint.inputs[2])
            mat.node_tree.links.new(tint.outputs[0],shader.inputs['Base Color'])
        if finish in ('HallGlass','TestGlass'):
            shader.inputs['Alpha'].default_value=.24;mat.diffuse_color=(*colour,.24)
            mat.surface_render_method='DITHERED'
    root=bpy.data.objects.new(prefix+'Architecture',None);scene.collection.objects.link(root)
    root['asset']='cultivation-blender-v1';root['owner']=LAYOUT[room]['owner']
    root['gameplay']='Presentation only; protected colliders, lights and controllers remain in TypeScript.'
    scene['coordinate_mapping']='Three (x,y,z) -> Blender (x,-z,y)'
    print('Owned studio ready:',name)

def material(finish): return bpy.data.materials['C2_'+CURRENT+'_'+finish]

def owner_root(owner):
    prefix='C2_'+CURRENT+'_'
    if not owner:return bpy.data.objects[prefix+'Architecture']
    name=prefix+'Owner_'+owner
    obj=bpy.data.objects.get(name)
    if obj:return obj
    values=LAYOUT[CURRENT]['rigs'][owner]['matrix']
    game=Matrix([values[i::4] for i in range(4)])
    convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    obj=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(obj)
    obj.parent=bpy.data.objects[prefix+'Architecture'];obj.matrix_local=convert@game@convert.inverted()
    obj['runtimeOwner']=owner;obj['previewPoseOnly']=True
    return obj

def mesh(name,vertices,faces,finish,owner=''):
    if CURRENT=='room-2':
        if finish.startswith('Hall'):finish='Test'+finish[4:]
        elif name.startswith(('Test_','Solid_Test_','Transfer_','Solid_Transfer_','Ivy_')) and not finish.startswith('Test'):finish='Test'+finish
    if CURRENT in ('passage-1-2','passage-2-3','bob-duct') and name.startswith(('Hall_','Solid_Hall_','Filter_','Solid_Filter_','Duct_','Solid_Duct_','Ivy_')) and not finish.startswith('Hall'):
        finish='Hall'+finish
    hall=finish.startswith('Hall');testing=finish.startswith('Test')
    weathered=hall or testing;base_finish=finish[4:] if weathered else finish
    owner=owner or LAYOUT[CURRENT].get('defaultTarget','')
    prefix='C2_'+CURRENT+'_'
    if (CURRENT=='room-1' or weathered) and base_finish not in ('Foliage','Loam','Lamp','Glass'):
        # Sample dirt on the actual surface, with no coplanar decal layers or
        # extra texture allocation. Metric tessellation keeps large panels dirty.
        points=[];patches=[]
        for face in faces:
            if len(face)!=4:
                start=len(points);points.extend(vertices[i] for i in face);patches.append(tuple(range(start,len(points))));continue
            a,b,c,d=[Vector(vertices[i]) for i in face]
            centre=(a+b+c+d)/4
            # Extra samples belong only to leaks and the two safe floor banks.
            # The rest of the room retains its established mesh density.
            near_leak=('wet_bay_rear' in name and abs(abs(centre.x)-19.08)<.001) or ('Archive_recess_back' in name and abs(centre.z+1.15)<.001)
            floor_bank=abs(centre.y-.2)<.001 and (weathered or centre.z<9 or centre.z>43)
            if hall:near_leak='Observation_rear' in name or 'Service_rear' in name
            if testing:near_leak='Process_rear' in name
            spacing=.38 if near_leak else .55 if floor_bank else 1.6
            nu=max(1,math.ceil(max((b-a).length,(c-d).length)/spacing))
            nv=max(1,math.ceil(max((d-a).length,(c-b).length)/spacing))
            start=len(points)
            for v in range(nv+1):
                for u in range(nu+1):
                    if testing or CURRENT in ('passage-2-3','bob-duct'):
                        # Compute the shared boundary in double precision.
                        # Chained float-vector lerps can leave a micrometre
                        # crack between the ceiling rail and its neighbour.
                        t=u/nu;s=v/nv;corners=[vertices[i] for i in face]
                        points.append(tuple(corners[0][axis]*(1-t)*(1-s)+corners[1][axis]*t*(1-s)+
                            corners[2][axis]*t*s+corners[3][axis]*(1-t)*s for axis in range(3)))
                    else:points.append(tuple(a.lerp(b,u/nu).lerp(d.lerp(c,u/nu),v/nv)))
            for v in range(nv):
                for u in range(nu):
                    k=start+v*(nu+1)+u;patches.append((k,k+1,k+nu+2,k+nu+1))
        vertices,faces=points,patches
    data=bpy.data.meshes.new(prefix+name)
    data.from_pydata([xyz(v) for v in vertices],[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    # Union pieces can have open contact boundaries. Their explicit winding is
    # authoritative; recalc on an open patch can turn a structural face inward.
    if all(edge.is_manifold for edge in bm.edges):
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(data);bm.free()
    uv=data.uv_layers.new(name='MetricUV')
    colours=data.color_attributes.new(name='wear',type='FLOAT_COLOR',domain='POINT')
    for v in data.vertices:
        p=v.co;d=.92+.08*math.sin(p.x*.73+p.y*.31)**2
        if finish in ('Ceramic','Cool','Alloy','Oxide'): d*=.82+.18*min(1,max(0,(p.z+.5)/4))
        if CURRENT=='room-5' and finish in ('Ceramic','Cool','Resin','Oxide'):
            d*=.66+.34*math.sin(p.x*.39+p.y*.14+math.sin(p.z*.21))**2
        colour=(d,d,d,1)
        if CURRENT=='room-1' and finish!='Lamp':
            x,y,z=p.x,p.z,-p.y
            cloud=.5+.5*math.sin(x*.81+z*.53+math.sin(z*1.13+y*.19)*1.8)
            streak=math.sin(z*2.73+math.sin(z*.49)*2.1)**12
            wet=(.5+.5*math.sin(z*.23+x*.39))**3
            soil=min(1,.35*cloud+.35*streak+.3*wet*max(0,1-y/15))
            if finish in ('Alloy','Oxide','Graphite'):
                colour=(.87-.35*soil,.86-.38*soil,.82-.39*soil,1)
            elif finish in ('Ceramic','Cool','Resin','Deck'):
                colour=(.88-.30*soil,.86-.42*soil,.75-.40*soil,1)
            elif finish=='Foliage':
                colour=(.70+.25*cloud,.66+.32*cloud,.48+.30*cloud,1)
            if finish not in ('Foliage','Loam','Lamp','Seal'):
                leak=0;rust=0
                # Gravity streaks originate at actual irrigation/service bends.
                sources=[(21.85,12.45,.60),(15.0,10.55,.22),(18.1,8.65,.20)] if x<-17.7 else [(33.7,11.9,.45)] if x>17.7 else []
                for at,top,strength in sources:
                    fall=top-y
                    if 0<=fall<7.5:
                        width=.14+.040*fall
                        wiggle=.055*math.sin(fall*2.2+at)
                        trail=math.exp(-((z-at-wiggle)/width)**2)*math.exp(-fall/5)
                        leak=max(leak,strength*trail)
                        rust=max(rust,.32*trail*math.exp(-fall/1.3))
                if z<.25 and abs(x+5.3)<1:
                    fall=10.4-y
                    if 0<=fall<6:
                        trail=math.exp(-((x+5.3+.04*math.sin(fall*2)) /(.13+.025*fall))**2)
                        leak=max(leak,.5*trail*math.exp(-fall/4));rust=max(rust,.25*trail*math.exp(-fall/1.2))
                if abs(y-.2)<.001 and (z<9.01 or z>42.99):
                    edge=max(0,1-(17.8-abs(x))/1.1)
                    end=max(0,1-min(z,50-z)/.9)
                    leak=max(leak,.25*max(edge,end)*(.65+.35*cloud))
                colour=tuple(max(.15,colour[i]*(1-leak)*([1,.88,.80][i]**rust)) for i in range(3))+(1,)
            if finish=='Paint':
                fade=.46+.29*cloud+.14*math.sin(x*4.2+z*7)**2
                colour=(fade,fade,fade*.98,1)
            if finish=='Seal':colour=(.70+.15*cloud,)*3+(1,)
            if finish=='Composite':
                groove=min(abs(abs(x)-.205),abs(abs(z)-.205))<.002
                dirt=.28 if groove else .86-.24*soil
                colour=(dirt,dirt*.98,dirt*.92,1)
        if weathered and base_finish!='Lamp':
            x,y,z=p.x,p.z,-p.y
            cloud=.5+.5*math.sin(z*.73+x*.42+math.sin(y*.54+z*.31)*1.9)
            soil=.16+.22*cloud+.20*max(0,1-y/2)
            leak=0
            if abs(x)>3.7:
                for at,top in [(10.85,5.1),(16.8,5.25),(18.7,4.15)]:
                    fall=top-y
                    if 0<fall<4:
                        leak=max(leak,.4*math.exp(-((z-at-.035*math.sin(fall*3))/(.10+.025*fall))**2)*math.exp(-fall/3))
            if abs(y-.2)<.001:soil+=.22*max(0,1-(3.85-abs(x))/.9)
            if testing:
                soil=.13+.23*cloud+.18*max(0,1-y/4)
                leak=0
                if x>18.7:
                    for at,top in [(10.55,11.2),(17.2,10.8),(29.55,11.2),(35.8,10.8)]:
                        fall=top-y
                        if 0<fall<9:leak=max(leak,.50*math.exp(-((z-at-.045*math.sin(fall*2))/(.15+.03*fall))**2)*math.exp(-fall/6))
                if abs(y-.2)<.001:soil+=.22*max(0,1-(18.8-abs(x))/1.0)
            dirt=max(.32,.94-soil-leak)
            colour=(dirt,dirt*.98,dirt*.94,1)
            if base_finish=='Foliage':colour=(.72+.2*cloud,.75+.2*cloud,.55+.2*cloud,1)
            if base_finish=='Loam':colour=(.66,.65,.57,1)
            if base_finish=='Glass':colour=(.82,.86,.82,1)
            if base_finish=='Paint':colour=(.55+.25*cloud,)*3+(1,)
        colours.data[v.index].color=colour
    for poly in data.polygons:
        axis=max(range(3),key=lambda i:abs(poly.normal[i]))
        for i in poly.loop_indices:
            p=data.vertices[data.loops[i].vertex_index].co
            a,b=((p.y,p.z) if axis==0 else (p.x,p.z) if axis==1 else (p.x,p.y))
            uv.data[i].uv=(a/8+.13,b/8+.31) if (CURRENT=='room-1' and finish in ('Deck','Paint')) or finish=='HallPaint' else (a/2,b/2)
    obj=bpy.data.objects.new(prefix+name,data);bpy.context.scene.collection.objects.link(obj)
    obj.parent=owner_root(owner);data.materials.append(material(finish))
    obj['finish']=finish;obj['runtimeTarget']=owner;obj['visualOnly']=True
    if CURRENT=='room-5' and not owner:
        centre=sum((Vector(v) for v in vertices),Vector())/max(1,len(vertices))
        zone='sewer' if centre.x>29 else 'return' if centre.y<0 else 'crown' if centre.z>17 else 'access'
        obj['spatialRegion']=zone+'_'+str(math.floor(centre.z/24))
    if CURRENT=='escape-duct':
        centre=sum((Vector(v) for v in vertices),Vector())/max(1,len(vertices))
        obj['spatialRegion']='drop_'+str(math.floor(centre.y/18)) if centre.y<-1 else 'branch' if centre.z>63.2 else 'airway_'+str(math.floor(centre.x/12))
    return obj

def box(name,lo,hi,finish='Ceramic',owner=''):
    owner=owner or LAYOUT[CURRENT].get('defaultTarget','')
    if any(hi[i]-lo[i]<.00001 for i in range(3)): return
    BOXES.append({'name':name,'lo':[round(v,4) for v in lo],'hi':[round(v,4) for v in hi],'finish':finish,'owner':owner})

def block(name,size,at,finish='Alloy',owner=''):
    box(name,[at[i]-size[i]/2 for i in range(3)],[at[i]+size[i]/2 for i in range(3)],finish,owner)

def tube(name,a,b,radius,finish='Alloy',sides=16,owner='',cap_a=True,cap_b=True):
    direction=(Vector(b)-Vector(a)).normalized();right=direction.cross(Vector((0,1,0)))
    if right.length<.01: right=direction.cross(Vector((1,0,0)))
    right.normalize();up=right.cross(direction).normalized()
    vv=[tuple(Vector(p)+radius*(right*math.cos(math.tau*i/sides)+up*math.sin(math.tau*i/sides)))
        for p in (a,b) for i in range(sides)]
    ff=[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    if cap_a:ff.append(tuple(reversed(range(sides))))
    if cap_b:ff.append(tuple(range(sides,sides*2)))
    if not(cap_a and cap_b):ff=[tuple(reversed(face)) for face in ff]
    DETAILS.append(mesh(name,vv,ff,finish,owner))

def annulus_x(name,x,y,z,inner,outer,depth,finish='Alloy',sides=24,owner=''):
    vv=[]
    for xx,r in [(x-depth/2,outer),(x+depth/2,outer),(x-depth/2,inner),(x+depth/2,inner)]:
        vv.extend((xx,y+r*math.sin(math.tau*i/sides),z+r*math.cos(math.tau*i/sides)) for i in range(sides))
    ff=[]
    for i in range(sides):
        j=(i+1)%sides
        ff.extend([(i,j,j+sides,i+sides),(i+2*sides,i+3*sides,j+3*sides,j+2*sides),
            (i,i+2*sides,j+2*sides,j),(i+sides,j+sides,j+3*sides,i+3*sides)])
    DETAILS.append(mesh(name,vv,ff,finish,owner))

def annulus_z(name,x,y,z,inner,outer,depth,finish='Alloy',sides=40):
    vv=[]
    for zz,r in [(z-depth/2,outer),(z+depth/2,outer),(z-depth/2,inner),(z+depth/2,inner)]:
        vv.extend((x+r*math.cos(math.tau*i/sides),y+r*math.sin(math.tau*i/sides),zz) for i in range(sides))
    ff=[]
    for i in range(sides):
        j=(i+1)%sides
        ff.extend([(i,j,j+sides,i+sides),(i+2*sides,i+3*sides,j+3*sides,j+2*sides),
            (i,i+2*sides,j+2*sides,j),(i+sides,j+sides,j+3*sides,i+3*sides)])
    DETAILS.append(mesh(name,vv,ff,finish))

def signboard(name,labels):
    """A fitted, backed metal plaque in the lettering's exact local plane."""
    anchor=labels[0];bpy.context.view_layer.update();basis=anchor.matrix_local.copy()
    inv=basis.inverted();points=[inv@o.matrix_local@v.co for o in labels for v in o.data.vertices]
    if not points:return
    margin=max(.12,min(.40,(max(p.y for p in points)-min(p.y for p in points))*.28))
    lo=[min(p.x for p in points)-margin,min(p.y for p in points)-margin]
    hi=[max(p.x for p in points)+margin,max(p.y for p in points)+margin]
    rim=max(.035,min(.09,margin*.30));owner=anchor.get('runtimeTarget','')
    def panel(suffix,vv,ff,finish):
        vv=[basis@Vector(v) for v in vv]
        game=[(p.x,p.z,-p.y) for p in vv]
        obj=mesh(name+'_'+suffix,game,ff,finish,owner)
        obj['signboard']=name;obj['lettering']=[o.name for o in labels]
    outer=[(lo[0],lo[1]),(hi[0],lo[1]),(hi[0],hi[1]),(lo[0],hi[1])]
    inner=[(lo[0]+rim,lo[1]+rim),(hi[0]-rim,lo[1]+rim),(hi[0]-rim,hi[1]-rim),(lo[0]+rim,hi[1]-rim)]
    vertices=[(x,y,z) for ring,z in [(outer,.016),(inner,.016),(inner,-.012),(outer,-.025)] for x,y in ring]
    faces=[(15,14,13,12)]
    for i in range(4):
        j=(i+1)%4;faces.extend([(i,j,j+4,i+4),(i+4,j+4,j+8,i+8),(i+12,j+12,j,i)])
    # The frame owns the complete back and returns; the inset owns only its
    # visible front. Their shared boundary has no internal contact faces.
    panel('frame',vertices,faces,'Alloy')
    panel('face',vertices[8:12],[(0,1,2,3)],'Graphite')

def label(name,text,at,size=.5,rotation=(90,0,180),finish='Ceramic',owner='',framed=True):
    prefix='C2_'+CURRENT+'_'
    if finish=='Ceramic':finish='Ink'
    curve=bpy.data.curves.new(prefix+name,'FONT');curve.body=text;curve.size=size
    curve.align_x='CENTER';curve.extrude=0;curve.resolution_u=2
    obj=bpy.data.objects.new(prefix+name,curve);bpy.context.scene.collection.objects.link(obj)
    obj.location=xyz(at);obj.rotation_euler=[math.radians(a) for a in rotation]
    curve.materials.append(material(finish));obj['finish']=finish;obj['runtimeTarget']=owner;obj['visualOnly']=True
    obj.parent=owner_root(owner)
    selected=list(bpy.context.selected_objects);active=bpy.context.view_layer.objects.active
    for o in selected:o.select_set(False)
    obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH')
    obj=bpy.context.object
    if not obj.data.color_attributes.get('wear'):
        colours=obj.data.color_attributes.new(name='wear',type='FLOAT_COLOR',domain='POINT')
        for c in colours.data:c.color=(1,1,1,1)
    if not obj.data.uv_layers:obj.data.uv_layers.new(name='MetricUV')
    DETAILS.append(obj)
    obj.select_set(False)
    for o in selected:o.select_set(True)
    bpy.context.view_layer.objects.active=active
    if framed:signboard(name+'_plaque',[obj])
    return obj

def intervals(start,end,step):
    points=[start];p=(math.floor(start/step)+1)*step
    while p<end-.01:points.append(p);p+=step
    points.append(end);return list(zip(points,points[1:]))

def wall(spec,bays=True):
    lo=spec['lo'];hi=spec['hi'];name=spec['name'];axis=0 if hi[0]-lo[0]<hi[2]-lo[2] else 2
    lo=list(lo);hi=list(hi)
    passage=CURRENT.startswith('passage-')
    if passage:lo[1]=max(lo[1],.04)
    along=2 if axis==0 else 0
    if hi[axis]-lo[axis]>.8 or hi[1]-lo[1]<1:
        box(name,lo,hi,'Graphite');return
    centre=(lo[axis]+hi[axis])/2
    inward=spec.get('inward',1 if centre<0 else -1)
    if axis==2:inward=spec.get('inward',1 if centre<1 else -1)
    face=hi[axis] if inward>0 else lo[axis]
    outer_depth=.4 if CURRENT in ('room-2','room-3') else .46
    depths=(face-inward*outer_depth,face-inward*.23,face)
    span=hi[along]-lo[along]
    recesses=[]
    if bays and axis==0 and span>30 and hi[1]>15:
        positions={'room-1':([16] if inward>0 else [31]),'room-2':([] if inward>0 else [14,33]),
            'room-3':([29,57] if inward>0 else [17,49]),'room-5':([32,65] if inward>0 else [37])}.get(CURRENT,[])
        recesses=[(z-3.3,z+3.3,max(lo[1]+.7,2.6),min(hi[1]-.7,11.0)) for z in positions
            if z-3.3>lo[along]+.3 and z+3.3<hi[along]-.3]
    if axis==0 and CURRENT in ('passage-1-2','passage-2-3'):
        recesses=[(7.5,17.2,1.2,5.4)] if inward<0 else [(19.3,24.5,1.2,5.4)]
    if CURRENT=='room-3' and name=='cultivation-room-3-exit-wall-header':
        recesses=[(-2.6,2.6,11,27)]
    if CURRENT=='room-5' and name=='room-5-chamber-back':
        recesses=[(-7.4,7.4,18,35)]
    us={lo[along],hi[along]};ys={lo[1],hi[1]}
    if CURRENT=='escape-duct' and axis==0 and lo[1]<-10:
        # Stagger shaft cassette seams from the independently visible sewer
        # deck below; both owners retain their original continuous footprint.
        us.add((lo[along]+hi[along])/2)
    else:
        for a,b in intervals(lo[along],hi[along],4 if span>14 else 2):us.update((a,b))
    for y in ([.61,3.21,3.41,5.81] if passage else [.55,3.15,3.35,8.6,9.2,14.5,15.1,21.8,22.3,29,30,35.5]):
        if lo[1]<y<hi[1]:ys.add(y)
    if CURRENT=='escape-duct':
        for a,b in intervals(lo[1],hi[1],6):ys.update((a,b))
        if lo[1]<2.25<hi[1]:ys.add(2.25)
    for a,b,c,d in recesses:us.update((a,b));ys.update((c,d))
    us=sorted(us);ys=sorted(ys)
    def slab(n,a,b,c,d,depth1,depth2,finish):
        lower=[0,c,0];upper=[0,d,0]
        lower[axis]=min(depth1,depth2);upper[axis]=max(depth1,depth2)
        lower[along]=a;upper[along]=b;box(n,lower,upper,finish)
    for i,(a,b) in enumerate(zip(us,us[1:])):
        for j,(c,d) in enumerate(zip(ys,ys[1:])):
            if any(a>=aa-.001 and b<=bb+.001 and c>=cc-.001 and d<=dd+.001 for aa,bb,cc,dd in recesses):continue
            slab(name+f'_back_{i}_{j}',a,b,c,d,depths[0],depths[1]-.03*inward,'Graphite')
            finish='Cool' if .5<c<3.4 else 'Alloy' if 8.5<c<9.25 or 14.4<c<15.2 else 'Ceramic'
            if hi[1]>25 and c>21:finish='Cool' if CURRENT=='room-5' else 'Alloy'
            if CURRENT=='bob-duct':finish='Alloy'
            margin=.12 if CURRENT=='escape-duct' else .025
            along_margin=.15 if CURRENT=='escape-duct' and axis==0 and lo[1]<-10 else margin
            slab(name+f'_panel_{i}_{j}',a+along_margin,b-along_margin,c+margin,d-margin,depths[1],depths[2],finish)
    for k,(a,b,c,d) in enumerate(recesses):
        rear=face-1.55*inward
        slab(name+f'_process_back_{k}',a,b,c,d,rear,rear-.18*inward,'Graphite')
        slab(name+f'_cheek_a_{k}',a,a+.18,c,d,rear,face,'Alloy')
        slab(name+f'_cheek_b_{k}',b-.18,b,c,d,rear,face,'Alloy')
        slab(name+f'_sill_{k}',a+.18,b-.18,c,c+.2,rear,face,'Oxide')
        slab(name+f'_header_{k}',a+.18,b-.18,d-.2,d,rear,face,'Alloy')
        # Equipment occupies the recess behind the original collision plane.
        if CURRENT=='room-5' and axis==2:
            annulus_z('Quarantine_pressure_bulkhead',0,26.5,80.25,4.55,5.6,.22,'Alloy')
            annulus_z('Quarantine_pressure_gasket',0,26.5,80.51,4.42,4.58,.14,'Oxide')
            for row in range(14):
                y=22.44+row*.625;half=math.sqrt(max(0,4.3**2-(y-26.5)**2))
                block(f'Quarantine_diaphragm_louvre_{row}',[2*half,.23,.18],[0,y,80.75],'Cool')
            for bolt in range(12):
                angle=bolt*math.tau/12
                tube('Quarantine_pressure_fastener_'+str(bolt),(5.06*math.cos(angle),26.5+5.06*math.sin(angle),80.08),
                    (5.06*math.cos(angle),26.5+5.06*math.sin(angle),80.20),.105,'Oxide',6)
            continue
        if CURRENT=='passage-2-3' and inward<0:
            # Retain the existing independently animated fan in its exact pose.
            # The new fixed intake sleeve clears the complete blade envelope.
            annulus_x('Extraction_intake',4.02,3.05,12,1.11,1.28,.42,'Alloy')
            for centre in [9,15]:
                for t in range(12):
                    slab(f'Filter_pleat_{centre}_{t}',centre-.88+t*.16,centre-.78+t*.16,1.7,4.6,
                        face-.73*inward,face-.9*inward,'Ceramic' if t%3 else 'Oxide')
                for y in [1.5,4.8]:slab(f'Filter_cradle_{centre}_{y}',centre-1.05,centre+1.05,y,y+.13,face-.31*inward,face-1.2*inward,'Alloy')
            continue
        if CURRENT=='room-2':
            for t in range(2):
                u=(a+b)/2+(-1.6 if t==0 else 1.6)
                for y in [5.5,8.8]:
                    tube(f'Calibration_ram_{k}_{t}_{y}',(face-.29*inward,y,u),(face-1.18*inward,y,u),.64,'Alloy',24)
                    annulus_x(f'Calibration_collar_{k}_{t}_{y}',face-.27*inward,y,u,.34,.71,.13,'Oxide')
                    tube(f'Calibration_core_{k}_{t}_{y}',(face-.15*inward,y,u),(face-.48*inward,y,u),.29,'Amber',12)
            slab(f'Calibration_light_mount_{k}',a+.2,b-.2,3.87,4.13,face-.04*inward,rear,'Graphite')
            continue
        if CURRENT=='room-3':
            if axis==2:
                # A tall extraction hood is the terminal focal point above the
                # existing exit, clear of every drone and slime sightline.
                for n in range(20):
                    y=c+.65+n*.72
                    slab(f'Extraction_hood_louvre_{n}',a+.35,b-.35,y,y+.22,
                        face-.35*inward,face-.76*inward,'Alloy' if n%4 else 'Oxide')
            else:
                for centre in [(a+b)/2-2,(a+b)/2,(a+b)/2+2]:
                    for n in range(17):
                        y=c+.5+n*.41
                        slab(f'Security_filter_{k}_{centre}_{n}',centre-.78,centre+.78,y,y+.16,
                            face-.45*inward,face-.83*inward,'Ceramic' if n%5 else 'Oxide')
                    for u in [centre-.87,centre+.87]:
                        slab(f'Security_filter_jamb_{k}_{u}',u,u+.1,c+.4,d-.4,
                            face-.32*inward,face-.97*inward,'Alloy')
            continue
        count=min(3,max(1,int((b-a-2.4)/2)+1))
        for t in range(count):
            u=a+1.2+t*2
            p=[0,c+.55,0];q=[0,d-.65,0]
            p[axis]=q[axis]=face-.77*inward;p[along]=q[along]=u
            tube(name+f'_pressure_vessel_{k}_{t}',p,q,.46,'Cool',20)
            for y in [c+.4,d-.5]:
                slab(name+f'_vessel_clamp_{k}_{t}_{y}',u-.55,u+.55,y,y+.12,face-.22*inward,face-.39*inward,'Alloy')
            slab(name+f'_vessel_datum_{k}_{t}',u-.06,u+.06,c+1,d-1,face-.29*inward,face-.32*inward,'Amber')

def deck(spec):
    lo,hi=spec['lo'],spec['hi'];name=spec['name'];height=hi[1]
    box(name+'_substrate',lo,[hi[0],height-.13,hi[2]],'Graphite')
    step=2.8 if 'passage' in CURRENT or CURRENT=='bob-duct' else 4
    for i,(a,b) in enumerate(intervals(lo[0],hi[0],step)):
        for j,(c,d) in enumerate(intervals(lo[2],hi[2],step)):
            box(name+f'_deck_{i}_{j}',[a+.025,height-.10,c+.025],[b-.025,height,d-.025],
                'Alloy' if (i+j)%7==0 else 'Resin')

def roof(spec):
    lo,hi=spec['lo'],spec['hi'];name=spec['name']
    for i,(a,b) in enumerate(intervals(lo[0],hi[0],4)):
        for j,(c,d) in enumerate(intervals(lo[2],hi[2],8)):
            backing=.175 if CURRENT=='room-3' else .15
            box(name+f'_backing_{i}_{j}',[a,lo[1]+backing,c],[b,hi[1],d],'Graphite')
            box(name+f'_cassette_{i}_{j}',[a+.025,lo[1],c+.025],[b-.025,lo[1]+.12,d-.025],
                'Alloy' if i%3==0 else 'Cool')

def nursery_sweep(name,path,radius,finish='Oxide',sides=7):
    """One closed tube; bends share rings instead of overlapping capped parts."""
    path=[Vector(p) for p in path];vertices=[]
    for i,p in enumerate(path):
        tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
        right=tangent.cross(Vector((1,0,0)))
        if right.length<.01:right=tangent.cross(Vector((0,1,0)))
        right.normalize();up=right.cross(tangent).normalized()
        vertices.extend(tuple(p+radius*(right*math.cos(j*math.tau/sides)+up*math.sin(j*math.tau/sides))) for j in range(sides))
    faces=[tuple(reversed(range(sides))),tuple(range((len(path)-1)*sides,len(path)*sides))]
    for i in range(len(path)-1):
        for j in range(sides):
            k=i*sides+j;n=i*sides+(j+1)%sides;faces.append((k,n,n+sides,k+sides))
    return mesh(name,vertices,faces,finish)

def nursery_profile(name,path,radii,finishes,sides=10):
    """Continuous tube with material boundaries, without internal contact caps."""
    path=[Vector(p) for p in path];vertices=[];right=None
    for i,p in enumerate(path):
        tangent=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
        if right is not None:right=right-tangent*right.dot(tangent)
        if right is None or right.length<.01:
            right=tangent.cross(Vector((1,0,0)))
            if right.length<.01:right=tangent.cross(Vector((0,1,0)))
        right.normalize();up=tangent.cross(right).normalized()
        vertices.extend(tuple(p+radii[i]*(right*math.cos(j*math.tau/sides)+up*math.sin(j*math.tau/sides))) for j in range(sides))
    groups={}
    for i,finish in enumerate(finishes):
        ff=groups.setdefault(finish,[])
        for j in range(sides):
            k=i*sides+j;n=i*sides+(j+1)%sides;ff.append((k,n,n+sides,k+sides))
    groups[finishes[0]].append(tuple(reversed(range(sides))))
    groups[finishes[-1]].append(tuple(range((len(path)-1)*sides,len(path)*sides)))
    result=[]
    for finish,faces in groups.items():
        indices=sorted({index for face in faces for index in face});lookup={old:new for new,old in enumerate(indices)}
        result.append(mesh(name+'_'+finish,[vertices[i] for i in indices],[tuple(lookup[i] for i in f) for f in faces],finish))
    return result

def nursery_polygon_split(polygon,a,b):
    """Split a convex XZ footprint at one directed boundary, with shared edges."""
    inside=[];outside=[]
    for p,q in zip(polygon,polygon[1:]+polygon[:1]):
        dp=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
        dq=(b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0])
        if dp>=-1e-9:inside.append(p)
        if dp<=1e-9:outside.append(p)
        if (dp>1e-9 and dq<-1e-9) or (dp<-1e-9 and dq>1e-9):
            t=dp/(dp-dq);point=(p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1]))
            inside.append(point);outside.append(point)
    def clean(poly):
        if len(poly)<3:return []
        area=sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(poly,poly[1:]+poly[:1]))
        return poly if abs(area)>1e-8 else []
    return clean(inside),clean(outside)

def nursery_floor_finish(spec,vertices,faces):
    """Replace floor surface patches with paint; no offset/decal/stacked faces."""
    if '_deck_' not in spec['name'] or abs(spec['hi'][1]-.2)>.001:return vertices,faces
    masks=[]
    for z in [8.62,43.28]:
        for index in range(15):
            a=-17.55+index*2.42+.08*math.sin(index*3.1)
            b=min(17.55,a+2.18-.15*math.sin(index*1.7)**2)
            masks.append(('Paint',[(a,z),(b,z),(b,z+.10),(a,z+.10)]))
    for z in [8.14,43.52]:
        for index in range(29):
            a=-17.3+index*1.20
            masks.append(('Seal',[(a,z),(a+.31,z),(a+.65,z+.34),(a+.34,z+.34)]))
    result_vertices=[];result_faces=[];paint={}
    def emit(vv,ff,polygon):
        if not polygon:return
        start=len(vv);vv.extend((p[0],.2,p[1]) for p in polygon)
        # CCW XZ is downward when converted into the game's Y-up space.
        ff.append(tuple(reversed(range(start,len(vv)))))
    for face in faces:
        points=[vertices[i] for i in face]
        normal=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0]))
        if normal.y<=0 or any(abs(p[1]-.2)>.00001 for p in points):
            start=len(result_vertices);result_vertices.extend(points);result_faces.append(tuple(range(start,len(result_vertices))));continue
        polygon=[(p[0],p[2]) for p in points]
        if sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(polygon,polygon[1:]+polygon[:1]))<0:polygon.reverse()
        remaining=[polygon]
        for finish,mask in masks:
            if max(p[0] for p in mask)<min(p[0] for p in polygon) or min(p[0] for p in mask)>max(p[0] for p in polygon) or max(p[1] for p in mask)<min(p[1] for p in polygon) or min(p[1] for p in mask)>max(p[1] for p in polygon):continue
            uncovered=[]
            for candidate in remaining:
                overlap=candidate
                for a,b in zip(mask,mask[1:]+mask[:1]):
                    overlap,off=nursery_polygon_split(overlap,a,b)
                    if off:uncovered.append(off)
                    if not overlap:break
                if overlap:
                    vv,ff=paint.setdefault(finish,([],[]));emit(vv,ff,overlap)
            remaining=uncovered
        for polygon in remaining:emit(result_vertices,result_faces,polygon)
    for finish,(vv,ff) in paint.items():mesh('Solid_'+spec['name']+'_worn_'+finish,vv,ff,finish,spec['owner'])
    return result_vertices,result_faces

def nursery_leaf(name,at,side,angle,size,age=0):
    # Accepted MCP prototype: lobed outline and a folded centre, with real
    # thickness. No alpha cards, double-sided leaves or foliage light sources.
    outline=[(0,0,0),(-.18,-.04,.12),(-.26,-.015,.34),(-.12,0,.40),
        (0,-.055,.67),(.12,0,.40),(.26,-.015,.34),(.18,-.04,.12),(0,.045,.30)]
    vertices=[]
    for layer in [0,.024]:
        for u,depth,h in outline:
            uu=(u*math.cos(angle)-h*math.sin(angle))*size
            hh=(u*math.sin(angle)+h*math.cos(angle))*size
            vertices.append((at[0]+side*(depth*size+layer),at[1]+hh,at[2]+uu))
    front=[(i,(i+1)%8,8) for i in range(8)]
    faces=front+[tuple(j+9 for j in reversed(f)) for f in front]+[(i,i+9,(i+1)%8+9,(i+1)%8) for i in range(8)]
    obj=mesh(name,vertices,faces,'Loam' if age else 'Foliage');obj['botanicalPart']='folded ivy leaf';return obj

def nursery_ivy(side,origin,height,spread,seed,root_height=3.8,recess=False):
    # One established root with uneven shoots, rather than parallel stems.
    # Roots terminate in a real recess sill or an existing panel joint.
    path=[]
    for k in range(22):
        t=k/21
        depth=17.61+.045*math.sin(t*8+seed)
        if t<.07:depth=(18.20 if recess else 17.83)+(depth-(18.20 if recess else 17.83))*t/.07
        path.append((side*depth,root_height+t*height,origin+.16*math.sin(t*9+seed)+.28*t))
    nursery_profile(f'Ivy_{side}_{seed}_trunk',path,[.052-.034*k/21 for k in range(22)],['Loam']*21,7)
    for branch,(anchor,hand) in enumerate([(3,-1),(5,1),(8,-1),(11,1),(14,-1),(17,1)]):
        start=Vector(path[anchor]);length=height*(.26+.12*math.sin(seed+branch*2.4)**2)
        shoot=[]
        for k in range(9):
            t=k/8
            shoot.append(tuple(start+Vector((-side*(.18+.10*(branch%3))*math.sin(t*math.pi/2),length*t,2*(hand*spread*(.22+.10*math.sin(branch+seed)**2)*t+.10*math.sin(t*5))))))
        nursery_profile(f'Ivy_{side}_{seed}_branch_{branch}',shoot,[.027-.014*k/8 for k in range(9)],['Loam']*8,6)
        for k in range(1,8):
            p=Vector(shoot[k]);leaf_hand=-1 if (k+branch)%2 else 1
            at=p+Vector((-side*(.11+.07*(branch%2)),.035,leaf_hand*.14))
            nursery_sweep(f'Ivy_{side}_{seed}_petiole_{branch}_{k}',[tuple(p),tuple(at)],.013,'Loam',5)
            angle=leaf_hand*(.62+.75*math.sin(seed+k*1.9+branch)**2)
            size=.55+.58*math.sin(k*2.1+branch*1.4+seed)**2
            nursery_leaf(f'Ivy_{side}_{seed}_{branch}_leaf_{k}',at,side,angle,size,(k+seed+branch)%13==0)
    for k in [2,5,9,12,16,19]:
        p=Vector(path[k]);hand=-1 if k%2 else 1
        at=p+Vector((-side*.12,.03,hand*.13))
        nursery_sweep(f'Ivy_{side}_{seed}_main_petiole_{k}',[tuple(p),tuple(at)],.014,'Loam',5)
        nursery_leaf(f'Ivy_{side}_{seed}_main_leaf_{k}',at,side,hand*(.7+.35*math.sin(k+seed)**2),.8+.25*math.sin(k*3)**2)
    # Bare dry runners arch back toward the wall instead of sprouting more props.
    for index,k in enumerate([7,15]):
        p=Vector(path[k]);hand=(-1 if index else 1)
        runner=[tuple(p+Vector((-side*.035*math.sin(t*math.pi),.6*math.sin(t*2.2),hand*t*.95))) for t in [0,.2,.4,.6,.8,1]]
        nursery_profile(f'Ivy_{side}_{seed}_dry_tendril_{index}',runner,[.024,.023,.021,.018,.016,.014],['Loam']*5,6)

def nursery_ring_profile(name,loops,finishes,owner='',cycle=True):
    """One fitted band per finish; adjacent rings share only their boundary."""
    assert len(finishes)==len(loops)-(0 if cycle else 1)
    def bridge(a,b):
        if len(a)==len(b):return [(i,(i+1)%len(a),(i+1)%len(b)+len(a),i+len(a)) for i in range(len(a))]
        if len(a)==8:
            faces=[]
            for i in range(4):faces.extend([(2*i,2*i+1,8+(i+1)%4,8+i),(2*i+1,(2*i+2)%8,8+(i+1)%4)])
            return faces
        lookup=list(range(4,12))+list(range(4))
        return [tuple(lookup[i] for i in reversed(face)) for face in bridge(b,a)]
    objects=[]
    for i,finish in enumerate(finishes):
        a=loops[i];b=loops[(i+1)%len(loops)]
        objects.append(mesh(f'{name}_{i}',a+b,bridge(a,b),finish,owner))
    return objects

def nursery_square_ring(x,z,radius,cut,height):
    if not cut:return [(x+a,height,z+b) for a,b in [(-radius,-radius),(radius,-radius),(radius,radius),(-radius,radius)]]
    return [(x+a,height,z+b) for a,b in [(-radius+cut,-radius),(radius-cut,-radius),
        (radius,-radius+cut),(radius,radius-cut),(radius-cut,radius),
        (-radius+cut,radius),(-radius,radius-cut),(-radius,-radius+cut)]]

def nursery_fluted_strut(name,length,owner,span=.48,across=None,finish='Composite'):
    """Room 1's formed composite section, also fitted to the testing rig."""
    section=[]
    for side in range(4):
        angle=side*math.pi/2
        for a,b in [(-.18,-.24),(-.065,-.24),(-.045,-.205),(.045,-.205),(.065,-.24),(.18,-.24)]:
            section.append((a*math.cos(angle)-b*math.sin(angle),a*math.sin(angle)+b*math.cos(angle)))
    steps=16 if finish=='Rust' else 1
    n=len(section);vertices=[(a,-length/2+length*k/steps,b) for k in range(steps+1) for a,b in section]
    faces=[tuple(range(n)),tuple(reversed(range(n*steps,n*(steps+1))))]+[
        (k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for k in range(steps) for i in range(n)]
    if across:
        # The short release bar retains the original target's full length and
        # depth. Its upper edge clears the fixed ceiling saddle.
        vertices=[(y,a*.43/.48-.035,b*.8/.48) for a,y,b in vertices]
        faces=[tuple(reversed(face)) for face in faces]
    elif span!=.48:vertices=[(a*span/.48,y,b*span/.48) for a,y,b in vertices]
    obj=mesh(name,vertices,faces,finish,owner)
    if finish=='Rust':
        # Pitted oxide and exposed grey steel, without decals or another map.
        for v in obj.data.vertices:
            x,y,z=v.co.x,v.co.z,-v.co.y
            patch=.5+.5*math.sin(y*31+x*41+math.sin(z*61+y*7)*2.1)
            flake=max(0,min(1,(patch-.54)/.20))
            pit=.62+.38*math.sin(y*113+z*97+x*83)**2
            oxide=(.48*pit,.20*pit,.07*pit);steel=(.22,.25,.24)
            obj.data.color_attributes['wear'].data[v.index].color=tuple(
                oxide[i]*(1-flake)+steel[i]*flake for i in range(3))+(1,)
    return obj

def nursery_ceiling_saddle(index,x,z,top=19.825,width=1.8,height=.605):
    """The approved Room 1 bolted support, fitted to an existing mount."""
    scale=width/1.8
    profile=[(.90,.20,19.825),(.90,.20,19.43),(.73,.13,19.275),(.40,.10,19.275),
        (.38,.09,19.22),(.265,0,19.22),(.265,0,19.825)]
    rings=[nursery_square_ring(x,z,r*scale,c*scale,top+(y-19.825)*height/.605) for r,c,y in profile]
    tag=f'Test_Suspension_{index}' if CURRENT=='room-2' else f'Suspension_{index}'
    nursery_ring_profile(tag+'_ceiling_saddle',rings,
        ['Cool','Alloy','Ceramic','Alloy','Graphite','Graphite','Alloy'])
    for k,(a,b) in enumerate([(-.54,-.54),(.54,-.54),(.54,.54),(-.54,.54)]):
        tube(tag+f'_saddle_bolt_{k}',(x+a*scale,top+(19.235-19.825)*height/.605,z+b*scale),
            (x+a*scale,top+(19.30-19.825)*height/.605,z+b*scale),.065*scale,'Graphite',12)

def nursery_suspension(index,x,z,length,owner):
    nursery_fluted_strut(f'Suspension_{index}_fluted_strut',length,owner,finish='Rust')
    nursery_ceiling_saddle(index,x,z)

def nursery_transfer_platform(index,owner):
    # Original five-metre footprint and .30m top; the complete Level 1 harness
    # below is unchanged. A formed chassis replaces the plain black box.
    loops=[nursery_square_ring(0,0,r,c,y) for r,c,y in [(2.5,.12,.30),(2.5,.12,.24),
        (2.47,.13,.16),(2.47,.13,-.14),(2.5,.13,-.22),(2.44,.13,-.30)]]
    nursery_ring_profile(f'Transfer_{index}_formed_chassis',loops,
        ['Alloy','Alloy','Cool','Graphite','Alloy'],owner,False)
    bottom=loops[-1];mesh(f'Transfer_{index}_chassis_bottom',bottom,[tuple(range(8))],'Graphite',owner)
    inner=nursery_square_ring(0,0,2.25,0,.30)
    # Reverse this ring: its visible face is the upward rim, not an underside.
    for obj in nursery_ring_profile(f'Transfer_{index}_rolled_rim',[loops[0],inner],['Alloy'],owner,False):
        for polygon in obj.data.polygons:polygon.flip()
        obj.data.update()
    box(f'Transfer_{index}_deck_backing',[-2.25,.18,-2.25],[2.25,.27,2.25],'Graphite',owner)
    for sx in [-1,1]:
        for sz in [-1,1]:
            xa,xb=(-2.25,-.018) if sx<0 else (.018,2.25)
            za,zb=(-2.25,-.018) if sz<0 else (.018,2.25)
            a,b=(xa,-.34) if sx<0 else (.34,xb)
            box(f'Transfer_{index}_deck_outer_{sx}_{sz}',[a,.27,za],[b,.30,zb],'Deck',owner)
            a,b=(-.34,xb) if sx<0 else (xa,.34)
            c,d=(za,-.34) if sz<0 else (.34,zb)
            box(f'Transfer_{index}_deck_inner_{sx}_{sz}',[a,.27,c],[b,.30,d],'Deck',owner)
            x,z=sx*2.15,sz*2.15
            block(f'Transfer_{index}_corner_{sx}_{sz}',[.17,.03,.17],[x,.285,z],'Amber',owner)
    box(f'Transfer_{index}_flush_release_socket',[-.34,.27,-.34],[.34,.30,.34],'Alloy',owner)
    for x in [-.28,.28]:
        for z in [-.28,.28]:block(f'Transfer_{index}_socket_fastener_{x}_{z}',[.045,.03,.045],[x,.285,z],'Graphite',owner)

def nursery_platform_harness(index,owner,width=5,depth=5,top=.30):
    """Canonical Level 1 Room 2 harness, at this deck's exact width and top.
    Source: containment-room-two/generate-room-two.py::build_thruster_harness.
    The engine, nozzle, flames, glow and spill lights are deliberately absent.
    """
    vertices=[];sides=24
    for height,radius in [(top-.80,.51),(top-.94,.51),(top-.80,.40),(top-.94,.40)]:
        vertices.extend((radius*math.cos(math.tau*i/sides),height,radius*math.sin(math.tau*i/sides)) for i in range(sides))
    faces=[]
    for i in range(sides):
        j=(i+1)%sides
        faces.extend([(i,j,sides+j,sides+i),(2*sides+j,2*sides+i,3*sides+i,3*sides+j),
            (i,2*sides+i,2*sides+j,j),(sides+j,3*sides+j,3*sides+i,sides+i)])
    obj=mesh(f'Transfer_{index}_Level_one_harness_cradle',vertices,faces,'Alloy',owner)
    obj['sourceAsset']='containment-room-two/build_thruster_harness';obj['enginePresent']=False
    for sx in [-1,1]:
        for sz in [-1,1]:
            tag=f'Transfer_{index}_Level_one_harness_{sx}_{sz}'
            mount=(sx*width*.32,top-.60,sz*depth*.25)
            block(tag+'_clevis',[.19,.18,.27],mount,'Graphite',owner)
            tube(tag+'_diagonal',mount,(sx*.32,top-.87,sz*.32),.055,'Alloy',12,owner)
            block(tag+'_latch',[.022,.07,.12],[mount[0]+sx*.118,mount[1],mount[2]],'Amber',owner)

def nursery_entry_vent():
    """Pressed collar and continuous shaft; the original 4m drop stays clear."""
    def octagon(radius,cut,height):
        return [(-10+x,height,4+z) for x,z in [(-radius+cut,-radius),(radius-cut,-radius),
            (radius,-radius+cut),(radius,radius-cut),(radius-cut,radius),
            (-radius+cut,radius),(-radius,radius-cut),(-radius,-radius+cut)]]
    def rectangle(radius,height):
        return [(-10+x,height,4+z) for x,z in [(-radius,-radius),(radius,-radius),(radius,radius),(-radius,radius)]]
    loops=[octagon(2.72,.50,19.85),octagon(2.72,.50,19.55),octagon(2.62,.40,19.35),
        octagon(2.27,.20,19.35),octagon(2.14,.14,19.35),rectangle(2,19.65),
        rectangle(2,25.15),rectangle(2.16,25.15),rectangle(2.16,19.90)]
    finishes=['Graphite','Alloy','Ceramic','Seal','Alloy','Cool','Alloy','Graphite','Alloy']
    def bridge(a,b):
        if len(a)==len(b):return [(i,(i+1)%len(a),(i+1)%len(b)+len(a),i+len(a)) for i in range(len(a))]
        if len(a)==8:
            faces=[]
            for i in range(4):
                faces.extend([(2*i,2*i+1,8+(i+1)%4,8+i),(2*i+1,(2*i+2)%8,8+(i+1)%4)])
            return faces
        lookup=list(range(4,12))+list(range(4))
        return [tuple(lookup[i] for i in reversed(face)) for face in bridge(b,a)]
    for index,(a,finish) in enumerate(zip(loops,finishes)):
        b=loops[(index+1)%len(loops)]
        obj=mesh(f'Entry_vent_shell_{index}',a+b,bridge(a,b),finish)
        obj['clearOpeningMetres']=[4,4]
    for index,(x,z) in enumerate([(-2.42,-1.6),(-2.42,1.6),(2.42,-1.6),(2.42,1.6),
        (-1.6,-2.42),(1.6,-2.42),(-1.6,2.42),(1.6,2.42)]):
        tube(f'Entry_vent_recessed_fastener_{index}',(-10+x,19.30,4+z),(-10+x,19.38,4+z),.065,'Graphite',10)
    # The remaining grille hangs outward from its hinge, entirely beyond Z=6.
    # Its broken centre is visible from the arrival camera, without dressing
    # across either falling body's path or changing the cinematic controller.
    tube('Entry_vent_broken_grille_hinge',(-11.74,19.45,6.75),(-8.26,19.45,6.75),.09,'Alloy',12)
    def grille_bar(name,u0,u1,v0,v1):
        vertices=[]
        for w in [-.035,.035]:
            for u,v in [(u0,v0),(u1,v0),(u1,v1),(u0,v1)]:
                vertices.append((-10+u,19.35-v*.72+w*.70,6.74+v*.70+w*.72))
        mesh('Entry_vent_broken_grille_'+name,vertices,
            [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'Alloy')
    grille_bar('hinge_rail',-1.8,1.8,0,.12)
    grille_bar('left_return',-1.8,-1.69,.12,.92)
    grille_bar('right_return',1.69,1.8,.12,.92)
    grille_bar('torn_lower_left',-1.69,-.55,.80,.92)
    grille_bar('torn_lower_right',.65,1.69,.80,.92)
    for index,u in enumerate([-1.3,-.7,.05,.8,1.3]):
        grille_bar(f'slat_{index}',u-.045,u+.045,.12,.48 if index==2 else .65 if index==1 else .80)

def nursery_return_air():
    # The entrance wall gets one substantial piece of retired cultivation
    # equipment, recessed behind the unmodified solid wall and clear of the vent.
    box('Archive_structural_back',[-18,0,-1.65],[18,20,-1.32],'Graphite')
    us=[-18,-12,-6,0,6,12,18];ys=[0,.55,3.6,11.4,14,20]
    for i,(a,b) in enumerate(zip(us,us[1:])):
        for j,(c,d) in enumerate(zip(ys,ys[1:])):
            if -6<=a and b<=6 and 3.6<=c and d<=11.4:continue
            box(f'Archive_wall_back_{i}_{j}',[a,c,-.45],[b,d,-.16],'Graphite')
            box(f'Archive_wall_panel_{i}_{j}',[a+.055,c+.025,-.12],[b-.055,d-.025,.2],
                'Cool' if c<3.6 else 'Ceramic')
    box('Archive_recess_back',[-6,3.6,-1.32],[6,11.4,-1.15],'Cool')
    for a,b in [(-6,-5.75),(5.75,6)]:box('Archive_side_return',[a,3.6,-1.32],[b,11.4,.2],'Alloy')
    for a,b in [(3.6,3.85),(11.15,11.4)]:box('Archive_horizontal_return',[-5.75,a,-1.32],[5.75,b,.2],'Alloy')
    for a,b in [(-5.84,-5.78),(5.78,5.84)]:box('Archive_rubber_side_gasket',[a,3.85,.14],[b,11.15,.2],'Seal')
    for a,b in [(3.77,3.83),(11.17,11.23)]:box('Archive_rubber_cross_gasket',[-5.84,a,.14],[5.84,b,.2],'Seal')
    for k,x in enumerate([-3,3]):
        annulus_z(f'Return_filter_rim_{k}',x,7.9,-.67,1.53,1.87,.18,'Alloy',32)
        annulus_z(f'Return_filter_seal_{k}',x,7.9,-.83,1.46,1.59,.04,'Graphite',32)
        for row in range(-4,5):
            y=row*.32;half=math.sqrt(max(0,1.43**2-y*y))
            block(f'Return_filter_baffle_{k}_{row}',[2*half,.12,.12],[x,7.9+y,-.99],'Alloy')
        tube(f'Return_filter_blind_hub_{k}',(x,7.9,-.91),(x,7.9,-.81),.20,'Graphite',16)
    for k,x in enumerate([-4.3,-1.45,1.45,4.3]):
        block(f'Retired_culture_cartridge_{k}',[2.4,.85,.60],[x,4.8,-.66],'Cool')
        block(f'Cartridge_recessed_handle_{k}',[.60,.10,.12],[x,4.8,-.32],'Alloy')
    nursery_sweep('Return_air_service_line',[(-5.3,5.7,-.55),(-5.3,10.4,-.55),(-4.9,10.75,-.55),
        (4.9,10.75,-.55),(5.3,10.4,-.55),(5.3,5.7,-.55)],.10,'Oxide',10)
    label('Return_air_identification','CULTIVATION / RETURN AIR',[0,12.2,.30],.53,(90,0,0))
    label('Return_air_service','CULTURE RECOVERY / ISOLATED',[0,2.7,.30],.32,(90,0,0))
    before=set(bpy.context.scene.objects)
    nursery_ivy(-1,-3.8,8.2,1.6,17)
    for obj in set(bpy.context.scene.objects)-before:
        if obj.type!='MESH':continue
        for vertex in obj.data.vertices:
            p=vertex.co.copy();depth=-p.x-16.85
            if 'trunk' in obj.name and p.z<4.35:depth=.10+(depth-.10)*max(0,(p.z-3.8)/.55)
            vertex.co=(-p.y,-depth,p.z)
        obj.data.update()

def door_pressed(name,polygon,side,back,front,finish,owner):
    """Pressed sheet with an inset face and angled returns into the backing.
    The continuous core owns the back; there is no duplicate contact face.
    """
    polygon=list(polygon)
    area=sum(polygon[i][0]*polygon[(i+1)%len(polygon)][1]-polygon[(i+1)%len(polygon)][0]*polygon[i][1] for i in range(len(polygon)))
    if area<0:polygon.reverse()
    centre=sum((Vector(p) for p in polygon),Vector((0,0)))/len(polygon)
    inset=[centre+(Vector(p)-centre)*.975 for p in polygon];n=len(polygon)
    vertices=[(p[0],p[1],side*front) for p in inset]+[(p[0],p[1],side*back) for p in polygon]
    faces=[tuple(range(n))]+[(i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n)]
    if side<0:faces=[tuple(reversed(f)) for f in faces]
    return mesh(name,vertices,faces,finish,owner)

def door_band(name,outer,inner,side,back,front,inset_depth,owner):
    n=len(outer)
    vertices=[(x*scale,y*scale,side*z) for ring,scale,z in
        [(outer,1,back),(outer,.99,front),(inner,1.01,front),(inner,1,inset_depth)] for x,y in ring]
    faces=[]
    for i in range(n):
        j=(i+1)%n
        faces.extend([(i,j,j+n,i+n),(i+n,j+n,j+2*n,i+2*n),(i+2*n,j+2*n,j+3*n,i+3*n)])
    if side<0:faces=[tuple(reversed(f)) for f in faces]
    return mesh(name,vertices,faces,'Alloy',owner)

def nursery_door_leaf(owner='cultivation-room-1-to-2-lab-passage-entry-shutter-panel'):
    # Sculpted armour remains entirely inside the original leaf's envelope.
    vertices=[(x,y,z) for z,h in [(-.07,2.30),(.07,2.26)] for y in [-h,h] for x in [-2,2]]
    mesh('Containment_door_core',vertices,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],'Graphite',owner)
    outer=[(-1.68,-2.22),(1.68,-2.22),(1.94,-1.96),(1.94,1.96),(1.68,2.22),(-1.68,2.22),(-1.94,1.96),(-1.94,-1.96)]
    inner=[(-1.64,-2.08),(1.64,-2.08),(1.80,-1.92),(1.80,1.92),(1.64,2.08),(-1.64,2.08),(-1.80,1.92),(-1.80,-1.92)]
    armour=[(-1.70,-1.65),(-.48,-1.65),(-.22,-1.35),(-.22,-.67),(-.68,-.34),(-.68,.34),
        (-.22,.67),(-.22,1.5),(-.48,1.82),(-1.45,1.82),(-1.70,1.52)]
    badge=[(-.28,-.62),(.28,-.62),(.62,-.28),(.62,.28),(.28,.62),(-.28,.62),(-.62,.28),(-.62,-.28)]
    for side in [-1,1]:
        door_band(f'Containment_door_perimeter_{side}',outer,inner,side,.07,.13,.07,owner)
        for hand in [-1,1]:door_pressed(f'Containment_door_armour_{side}_{hand}',[(hand*x,y) for x,y in armour],side,.07,.13,'Ceramic',owner)
        door_pressed(f'Containment_door_kick_shield_{side}',[(-1.62,-2.01),(1.62,-2.01),(1.48,-1.76),(-1.48,-1.76)],side,.07,.13,'Alloy',owner)
        door_band(f'Containment_door_badge_rim_{side}',badge,[(x*.66,y*.66) for x,y in badge],side,.07,.14,.105,owner)
        face=[(x*.66,y*.66,side*.105) for x,y in badge];winding=tuple(range(8))
        mesh(f'Containment_door_badge_face_{side}',face,[winding if side>0 else tuple(reversed(winding))],'Graphite',owner)
        door_pressed(f'Containment_door_upward_emblem_{side}',[(-.36,-.10),(-.25,-.23),(0,.05),(.25,-.23),(.36,-.10),(0,.30)],side,.105,.145,'Ceramic',owner)
        for sx in [-1,1]:
            for sy in [-1,1]:
                a=Vector((sx*.62,sy*.58));b=Vector((sx*1.44,sy*1.52));d=(b-a).normalized();r=Vector((-d.y,d.x))*.055
                polygon=[a-r,b-r,b+r,a+r]
                door_pressed(f'Containment_door_diagonal_rib_{side}_{sx}_{sy}',polygon,side,.13,.15,'Alloy',owner)
                bolt=[(sx*1.55+.065*math.cos(i*math.tau/8),sy*.90+.065*math.sin(i*math.tau/8)) for i in range(8)]
                door_pressed(f'Containment_door_fastener_{side}_{sx}_{sy}',bolt,side,.13,.15,'Alloy',owner)

def nursery_sliding_door():
    nursery_door_leaf()
    # Fitted guide channels replace the old featureless jambs in their envelope.
    for side in [-1,1]:
        lo,hi=sorted([side*2,side*2.28])
        box(f'Nursery_door_guide_{side}',[lo,0,.26],[hi,4.6,.74],'Graphite')
        for a,b in [(2.025,2.09),(2.18,2.28)]:
            lo,hi=sorted([side*a,side*b])
            box(f'Nursery_door_guide_face_{side}_{a}',[lo,.025,.245],[hi,4.575,.28],'Alloy')
            box(f'Nursery_door_guide_back_{side}_{a}',[lo,.025,.72],[hi,4.575,.755],'Alloy')
    box('Nursery_door_drive_header',[-2.28,4.6,.26],[2.28,4.94,.74],'Alloy')

def build_nursery():
    # Room 1 is independently composed, rather than a variation of the other
    # rooms' panel grid. Physical room and mechanism definitions remain external.
    for spec in LAYOUT[CURRENT]['boxes']:
        name=spec['name']
        if 'floor' in name:deck(spec)
        elif 'ceiling' in name:roof(spec)
        elif name=='cultivation-room-1-entry-wall':nursery_return_air()
        elif 'west-wall' not in name and 'east-wall' not in name:wall(spec,False)
    for side in [-1,1]:
        def slab(name,a,b,c,d,near,far,finish):
            box(f'Nursery_{side}_{name}',[min(side*near,side*far),c,a],[max(side*near,side*far),d,b],finish)
        a,b=(12.8,22.5) if side<0 else (27.2,39.4)
        # Continuous deep backing, fitted cheeks, sill and return, with a single
        # owner for every opaque face, including where piers meet the panels.
        slab('containment_back',0,50,0,20,19.35,19.7,'Graphite')
        us=sorted(set([0,6.2,11.6,24.4,32,41.6,46,50,a,b]));ys=[0,.45,3.1,4,8.8,13.5,15.7,20]
        for i,(u,v) in enumerate(zip(us,us[1:])):
            for j,(c,d) in enumerate(zip(ys,ys[1:])):
                if a<=u and v<=b and 4<=c and d<=13.5:continue
                finish='Cool' if c<3.1 else 'Oxide' if 13.4<c<15.8 else 'Ceramic'
                slab(f'wall_panel_{i}_{j}',u+.045,v-.045,c+.025,d-.025,17.8,18.12,finish)
                # Each panel gap has its own shallow backing: no open throat
                # into the deeper process recess or adjacent bay.
                slab(f'panel_back_{i}_{j}',u,v,c,d,18.16,18.36,'Graphite')
        slab('wet_bay_rear',a,b,4,13.5,19.08,19.35,'Cool')
        slab('wet_bay_reveal_a',a,a+.22,4,13.5,17.8,19.35,'Alloy')
        slab('wet_bay_reveal_b',b-.22,b,4,13.5,17.8,19.35,'Alloy')
        slab('wet_bay_sill',a+.22,b-.22,4,4.24,17.8,19.35,'Oxide')
        slab('wet_bay_header',a+.22,b-.22,13.28,13.5,17.8,19.35,'Alloy')
        for z in [0,11.6,24.4,41.6,49.7]:
            slab(f'pressure_pier_{z}',z,z+.28,.45,19.8,17.77,18.36,'Alloy')
        slab('lower_return',.3,49.7,.43,.61,17.77,18.36,'Oxide')
        slab('service_cornice',.3,49.7,15.65,15.9,17.77,18.36,'Alloy')
        if side<0:
            # Abandoned planting rack. All tiers remain within the wall recess.
            for row,y in enumerate([4.6,6.5,8.4,10.3]):
                slab(f'irrigation_tray_{row}',a+.6,b-.6,y,y+.20,18.10,19.0,'Oxide')
                slab(f'exhausted_soil_{row}',a+.76,b-.76,y+.20,y+.27,18.25,18.91,'Loam')
                for z in [a+.45,b-.45]:slab(f'rack_upright_{row}_{z}',z,z+.12,4.3,12,18.94,19.08,'Alloy')
            path=[(-18.75,12.7,a+.6)];radii=[.12];finishes=[]
            for k,z in enumerate([14.2,17.6,20.6]):
                for at,radius,finish in [(z-.20,.12,'Oxide'),(z-.16,.18,'Alloy'),
                    (z-.07,.18,'Alloy'),(z+.07,.18,'Seal'),(z+.16,.18,'Alloy'),(z+.20,.12,'Alloy')]:
                    path.append((-18.75,12.7,at));radii.append(radius);finishes.append(finish)
                box(f'Irrigation_clamp_wall_foot_{k}',[-19.08,12.42,z-.13],[-18.90,12.98,z+.13],'Alloy')
            path.extend([(-18.75,12.7,b-1),(-18.75,12.45,b-.65),(-18.75,5.0,b-.65)])
            radii.extend([.12]*3);finishes.extend(['Oxide']*3)
            nursery_profile('Failed_irrigation_feed',path,radii,finishes,10)
        else:
            # Two sealed mixing vessels and one visibly abandoned service bay.
            for k,z in enumerate([a+2.1,a+6.5]):
                tube(f'Nursery_mix_vessel_{k}',(18.70,4.45,z),(18.70,11.85,z),.44,'Cool',16)
                for y in [4.4,11.9]:slab(f'vessel_cradle_{k}_{y}',z-.7,z+.7,y,y+.14,18.06,19.08,'Alloy')
            for y in [5.3,7.1,8.9,10.7]:slab(f'empty_sample_drawer_{y}',b-3.4,b-.55,y,y+.16,18.25,18.95,'Oxide')
            for k,y in enumerate([6.15,9.65]):
                box(f'Service_cable_gland_backplate_{k}',[18.98,y-.29,37.82],[19.08,y+.29,38.48],'Alloy')
                path=[(19.04,y,38.15),(18.92,y,38.15),(18.88,y,38.15),
                    (18.74,y,38.15),(18.66,y,38.15),(18.60,y,38.15),
                    (18.45,y-.10,38.18),(18.44,y-.31,38.25),(18.57,y-.50,38.34)]
                nursery_profile(f'Service_cable_gland_{k}',path,[.13,.13,.16,.16,.11,.043,.043,.043,.043],
                    ['Alloy','Alloy','Seal','Seal','Seal','Seal','Seal','Seal'],10)
        nursery_ivy(side,17.1 if side<0 else 34.1,9.2 if side<0 else 7,3.4,3 if side<0 else 8,4.18,True)
        if side<0:nursery_ivy(side,29.5,11.4,3.2,11,3.1)
    # Service rails support deliberately placed fixtures, clear of every rope
    # and the original vent mouth. They are presentation, never new colliders.
    for x in [-9,9]:
        block(f'Service_rail_{x}',[.38,.38,37],[x,19.67,26],'Graphite')
        for z in [10.5,25,42.5]:block(f'Service_hanger_{x}_{z}',[.16,.94,.24],[x,20.33,z],'Oxide')
    for k,(x,z) in enumerate([(-9,15.5),(9,35)]):
        block(f'Practical_hanger_{k}',[.10,1.665,.10],[x,18.6475,z],'Oxide')
        block(f'Practical_housing_{k}',[2.9,.25,.72],[x,17.69,z],'Alloy')
        block(f'Practical_diffuser_{k}',[2.55,.04,.49],[x,17.545,z],'Lamp')
    block('Exit_practical_housing',[2.6,.28,.40],[0,5.24,49.44],'Alloy')
    block('Exit_practical_diffuser',[2.30,.04,.30],[0,5.08,49.39],'Lamp')
    # A broad pressed-metal portal replaces the green greybox lintel. Jambs
    # stay outside the original clear width and join the existing wall union.
    for side in [-1,1]:
        a,b=sorted([side*2.04,side*2.36])
        box(f'Containment_portal_jamb_{side}',[a,.2,49.80],[b,4.6,50.20],'Alloy')
        a,b=sorted([side*2.11,side*2.27])
        box(f'Containment_portal_inset_{side}',[a,.35,49.80],[b,4.40,49.84],'Graphite')
    box('Containment_portal_lintel',[-2.36,4.6,49.48],[2.36,5.0,49.76],'Alloy')
    # Exact Level 1 inset deck, bevelled perimeter and corner markings, now
    # weathered. Motion inherits the existing platform collider, including reset.
    for index in range(1,4):
        owner=f'cultivation-room-1-platform-{index}-platform'
        nursery_transfer_platform(index,owner)
        nursery_platform_harness(index,owner)
    print('Abandoned nursery: asymmetric process bays, folded ivy, fitted platforms and service fixtures')

def hall_floor():
    box('Hall_Floor_foundation',[-4,-.2,0],[4,.10,28],'Graphite')
    cuts=sorted(set([0,28,22.72,24.52]+[i*2.8 for i in range(1,10)]))
    for j,(a,b) in enumerate(zip(cuts,cuts[1:])):
        drain=a>=22.72 and b<=24.52
        spans=[(-4,-3.35),(3.35,4)] if drain else [(-4,0),(0,4)]
        for i,(c,d) in enumerate(spans):
            box(f'Hall_Floor_back_{i}_{j}',[c,.10,a],[d,.165,b],'Graphite')
            box(f'Hall_Floor_panel_{i}_{j}',[c+.018,.165,a+.018],[d-.018,.20,b-.018],'Resin')
            if not drain:
                for x in [-2.65,2.65]:
                    if c<x<d and (20<a<22.72 or 24.52<=a<26):
                        box(f'Hall_Faded_containment_{x}_{j}',[x-.035,.175,a+.15],[x+.035,.20,min(b-.05,a+.9)],'Paint')
    box('Hall_Drain_sealed_tray',[-3.35,.10,22.72],[3.35,.135,24.52],'Seal')
    for x in [-3.35,3.25]:box('Hall_Drain_edge',[x,.135,22.72],[x+.10,.20,24.52],'Alloy')
    for z in [22.72,24.42]:box('Hall_Drain_end',[-3.25,.135,z],[3.25,.20,z+.10],'Alloy')
    for i in range(41):
        x=-3.22+i*.16
        box(f'Hall_Drain_grate_{i}',[x,.14,22.82],[x+.065,.20,24.42],'Alloy')

def hall_ivy_leaf(name,at,angle,size,tilt,phase):
    # Thin, folded three-lobed ivy. Cross-sections give the midrib its own
    # narrow colour strip and keep the leaf edge crisp rather than inflated.
    sections=[(0,.016),(.045,.13),(.10,.23),(.18,.30),(.27,.31),(.35,.24),
        (.465,.43),(.50,.29),(.55,.135),(.67,.105),(.82,.055),(.94,.004)]
    across=[-1,-.07,0,.07,1];vv=[]
    for layer in [0,.0025]:
        for v,width in sections:
            for fraction in across:
                u=width*fraction
                depth=.027*(1-abs(fraction))*(.35+.65*math.sin(v*math.pi/.98))
                depth+=.012*fraction*fraction*math.sin(v*5+phase)+.016*max(0,v-.65)
                uu=(u*math.cos(angle)-v*math.sin(angle))*size
                hh=(u*math.sin(angle)+v*math.cos(angle))*size
                vv.append((at[0]-depth*size+uu*math.sin(tilt)+layer,at[1]+hh,at[2]+uu*math.cos(tilt)))
    count=len(sections)*len(across);front=[];boundary={}
    for row in range(len(sections)-1):
        for col in range(len(across)-1):
            a=row*len(across)+col
            cell=(a,a+1,a+1+len(across),a+len(across));front.append(cell)
            for a,b in zip(cell,cell[1:]+cell[:1]):
                key=tuple(sorted((a,b)))
                if key in boundary:del boundary[key]
                else:boundary[key]=(a,b)
    faces=front+[tuple(count+k for k in reversed(f)) for f in front]
    faces.extend((a,b,b+count,a+count) for a,b in boundary.values())
    obj=mesh(name,vv,faces,'HallFoliage')
    for poly in obj.data.polygons:poly.use_smooth=abs(poly.normal.x)>.5
    colours=obj.data.color_attributes['wear'];shade=.61+.23*(.5+.5*math.sin(phase*2.41))
    for vertex in obj.data.vertices:
        p=vertex.co;game=Vector((p.x,p.z,-p.y))-Vector(at)
        u=(game.z/math.cos(tilt)*math.cos(angle)+game.y*math.sin(angle))/size
        vein=math.exp(-(u/.007)**2)
        edge=min(1,abs(u)/.31)
        colours.data[vertex.index].color=(shade*.76+.19*vein+.035*edge,
            shade+.16*vein,shade*.58+.14*vein+.025*edge,1)
    obj['botanicalPart']='thin folded three-lobed ivy blade with midrib'
    return obj


def hall_process_ivy(at,height,spread,seed):
    # Runners remain wholly in the observation recess. Alternating leaves
    # have their own rotation and depth instead of forming one flat curtain.
    path=[]
    for k in range(15):
        t=k/14
        path.append((at[0]+.045*math.sin(t*7+seed),at[1]+height*.85*t,
            at[2]+.10*math.sin(t*8+seed)+.08*t))
    nursery_profile(f'Ivy_{seed}_root',path,[.026-.018*k/14 for k in range(15)],['HallLoam']*14,7)
    for branch,(anchor,hand) in enumerate([(2,-1),(4,1),(6,-1),(8,1),(10,-1),(12,1)]):
        p=Vector(path[anchor]);length=height*(.18+.09*math.sin(seed+branch*1.7)**2)
        shoot=[]
        for k in range(7):
            t=k/6
            shoot.append(tuple(p+Vector((-.09*math.sin(t*2),length*t,
                hand*spread*(.42+.18*math.sin(branch+seed)**2)*t))))
        nursery_profile(f'Ivy_{seed}_shoot_{branch}',shoot,[.014-.007*k/6 for k in range(7)],['HallLoam']*6,6)
        for k in [1,3,5]:
            p=Vector(shoot[k]);hand_leaf=-1 if (k+branch)%2 else 1
            leaf_at=p+Vector((-.055,.015,hand_leaf*.045))
            nursery_sweep(f'Ivy_{seed}_petiole_{branch}_{k}',[tuple(p),tuple(leaf_at)],.006,'HallLoam',5)
            size=(.22+.095*math.sin(seed+k*2.1+branch)**2)*min(1,height/1.8)
            hall_ivy_leaf(f'Ivy_{seed}_blade_{branch}_{k}',tuple(leaf_at),
                hand_leaf*(.55+.57*math.sin(seed+k+branch)**2),size,
                .45*math.sin(seed+branch*2.7+k),seed+branch*7+k)
    for k in [3,7,11,14]:
        p=Vector(path[k]);hand=-1 if k%2 else 1
        leaf_at=p+Vector((-.055,.01,hand*.04))
        nursery_sweep(f'Ivy_{seed}_main_petiole_{k}',[tuple(p),tuple(leaf_at)],.006,'HallLoam',5)
        hall_ivy_leaf(f'Ivy_{seed}_main_blade_{k}',tuple(leaf_at),hand*.52,
            .29*min(1,height/1.8),.35*math.sin(k+seed),seed+k*3)


def hall_observation():
    a,b=7.5,17.2
    box('Hall_Observation_rear',[5.90,1.15,a],[6.15,5.45,b],'Cool')
    for z in [a,b-.18]:box('Hall_Observation_cheek',[3.85,1.15,z],[5.90,5.45,z+.18],'Alloy')
    for y in [1.15,5.28]:box('Hall_Observation_return',[3.85,y,a+.18],[5.90,y+.15,b-.18],'Alloy')
    for z in [a,10.66,13.80,b-.14]:box('Hall_Observation_mullion',[3.85,1.30,z],[4.04,5.28,z+.14],'Ceramic')
    for y in [1.30,5.18]:box('Hall_Observation_gasket',[3.85,y,a+.14],[3.89,y+.10,b-.14],'Seal')
    panes=[(7.72,10.66),(10.80,13.80),(13.94,17.00)]
    for k,(c,d) in enumerate(panes):
        obj=mesh(f'Hall_Observation_glass_{k}',[(3.90,1.43,c),(3.90,5.18,c),(3.90,5.18,d),(3.90,1.43,d)],[(0,3,2,1)],'HallGlass')
        uv=obj.data.uv_layers.active
        for loop in obj.data.loops:
            p=obj.data.vertices[loop.vertex_index].co
            u=(-p.y-c)/(d-c);v=(p.z-1.43)/(5.18-1.43)
            uv.data[loop.index].uv=((.008+.984*u+k%2)/2,(.008+.984*v+k//2)/2)
    for k,z in enumerate([9.2,12.35,15.5]):
        box(f'Hall_Canister_seat_{k}',[4.26,1.30,z-.65],[5.58,1.44,z+.65],'Graphite')
        path=[(4.95,y,z) for y in [1.43,1.50,1.62,1.74,4.36,4.50,4.64,4.78,4.96]]
        nursery_profile(f'Hall_Culture_canister_{k}',path,[.48,.57,.57,.48,.48,.57,.57,.39,.39],
            ['Graphite','Alloy','Alloy','Cool','Alloy','Alloy','Alloy','Cool'],20)
        nursery_sweep(f'Hall_Canister_feed_{k}',[(4.95,4.96,z),(4.95,5.10,z),(5.52,5.10,z),(5.52,4.66,z)],.055,'Alloy',8)
    nursery_sweep('Hall_Failed_irrigation_upper',[(5.62,5.16,8.3),(5.62,5.16,10.85),(5.62,4.64,10.85)],.075,'Alloy',10)
    nursery_sweep('Hall_Failed_irrigation_lower',[(5.62,4.53,10.85),(5.62,1.42,10.85)],.075,'Oxide',10)
    hall_process_ivy((4.72,1.265,10.8),3.7,.55,23)
    for z in [11.8,12.9]:box('Hall_Observation_sign_mount',[3.785,5.51,z-.06],[3.96,5.59,z+.06],'Alloy')
    label('Hall_Observation_ident','CULTURE TRANSFER',[3.76,5.48,12.35],.24,(90,0,270),'HallInk')

def hall_service_handwheel(name,x,y,z):
    # The rim, hub and spokes are one pressed part. Shared radial cells own
    # only their exterior boundary, including the three open apertures.
    sides=24;radii=[.034,.058,.097,.142];vv=[]
    for xx in [x-.0175,x+.0175]:
        for r in radii:
            vv.extend((xx,y+r*math.cos(i*math.tau/sides),z+r*math.sin(i*math.tau/sides)) for i in range(sides))
    cells=[]
    for ring in range(3):
        for i in range(sides):
            if ring==1 and i%8 not in (0,7):continue
            j=(i+1)%sides
            cells.append((ring*sides+i,(ring+1)*sides+i,(ring+1)*sides+j,ring*sides+j))
    count=4*sides;faces=[];boundary={}
    for cell in cells:
        faces.extend([tuple(reversed(cell)),tuple(i+count for i in cell)])
        for a,b in zip(cell,cell[1:]+cell[:1]):
            key=tuple(sorted((a,b)))
            if key in boundary:del boundary[key]
            else:boundary[key]=(a,b)
    for a,b in boundary.values():faces.append((a,b,b+count,a+count))
    return mesh(name,vv,faces,'Graphite')

def hall_service_bay():
    a,b=17.65,20.8
    box('Hall_Service_rear',[-4.85,1.35,a],[-4.65,4.80,b],'Cool')
    for z in [a,b-.14]:box('Hall_Service_cheek',[-4.65,1.35,z],[-3.85,4.80,z+.14],'Alloy')
    for y in [1.35,4.64]:box('Hall_Service_return',[-4.65,y,a+.14],[-3.85,y+.16,b-.14],'Alloy')
    box('Hall_Service_mounting_chassis',[-4.61,1.58,17.90],[-4.43,4.45,20.53],'Graphite')
    box('Hall_Service_pressed_instrument_plate',[-4.43,1.70,18.00],[-4.32,4.37,19.67],'Ceramic')
    for z in [18.09,19.58]:
        for y in [1.80,4.28]:tube(f'Hall_Service_plate_fastener_{y}_{z}',(-4.32,y,z),(-4.26,y,z),.035,'Alloy',8)
    for k,z in enumerate([18.34,19.22]):
        y=3.65
        tube(f'Hall_Gauge_cast_body_{k}',(-4.32,y,z),(-4.15,y,z),.235,'Graphite',32)
        annulus_x(f'Hall_Gauge_stepped_bezel_{k}',-4.09,y,z,.213,.275,.13,'Alloy',32)
        annulus_x(f'Hall_Gauge_inner_gasket_{k}',-4.017,y,z,.205,.238,.016,'Seal',32)
        vv=[(-4.021,y+.203*math.cos(i*math.tau/32),z+.203*math.sin(i*math.tau/32)) for i in range(32)]
        mesh(f'Hall_Gauge_porcelain_dial_{k}',vv,[tuple(range(32))],'Ink')
        for i in range(13):
            angle=math.radians(-130+i*260/12)
            outer=.177;inner=.133 if i%3==0 else .151
            tube(f'Hall_Gauge_scale_{k}_{i}',(-3.992,y+inner*math.cos(angle),z+inner*math.sin(angle)),
                (-3.992,y+outer*math.cos(angle),z+outer*math.sin(angle)),.005,'Graphite',5)
        angle=math.radians(-42 if k==0 else 67)
        direction=Vector((math.cos(angle),math.sin(angle)));across=Vector((-direction.y,direction.x))
        shape=[-direction*.055-across*.014,direction*.139,-direction*.055+across*.014]
        vv=[(x,y+p.x,z+p.y) for x in [-3.987,-3.975] for p in shape]
        mesh(f'Hall_Gauge_pointed_needle_{k}',vv,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],'Graphite')
        # Open rear is buried in the needle boss, with no duplicate contact cap.
        vv=[(x,y+.026*math.cos(i*math.tau/12),z+.026*math.sin(i*math.tau/12)) for x in [-3.983,-3.950] for i in range(12)]
        ff=[tuple(range(12,24))]+[(i,(i+1)%12,(i+1)%12+12,i+12) for i in range(12)]
        mesh(f'Hall_Gauge_needle_boss_{k}',vv,ff,'Alloy')
        nursery_sweep(f'Hall_Gauge_pressure_line_{k}',[(-4.23,3.43,z),(-4.23,3.08,z),
            (-4.23,2.95,z),(-4.18,2.84,z),(-4.18,2.12,z)],.048,'Alloy',10)
        for y in [2.38,2.70]:tube(f'Hall_Line_compression_fitting_{k}_{y}',(-4.18,y-.07,z),(-4.18,y+.07,z),.078,'Oxide',8)
        # A small handwheel reads as manual maintenance hardware behind glass.
        tube(f'Hall_Service_valve_stem_{k}',(-4.18,2.48,z),(-3.98,2.48,z),.031,'Alloy',10)
        hall_service_handwheel(f'Hall_Service_handwheel_{k}',-4.015,2.48,z)
    nursery_profile('Hall_Service_lower_manifold',[(-4.18,2.12,z) for z in [18.05,18.14,19.49,19.58]],
        [.08,.10,.10,.08],['Alloy','Cool','Alloy'],12)
    # One rigid regulator replaces the loose dangling wires. Connections end
    # in the manifold, rear plate and header, all behind the original wall line.
    nursery_profile('Hall_Service_regulator',[(-4.14,y,20.05) for y in [1.84,1.96,2.10,2.27,3.40,3.52,3.64]],
        [.13,.19,.19,.145,.145,.19,.19],['Alloy','Alloy','Cool','Ceramic','Alloy','Graphite'],20)
    nursery_sweep('Hall_Service_manifold_return',[(-4.18,2.12,19.58),(-4.18,2.12,19.78),(-4.14,2.12,20.05)],.065,'Alloy',10)
    nursery_sweep('Hall_Service_regulator_feed',[(-4.14,3.64,20.05),(-4.14,3.98,20.05),
        (-4.24,4.12,20.05),(-4.42,4.12,20.05)],.058,'Alloy',10)
    for y in [2.40,3.24]:
        box(f'Hall_Service_regulator_saddle_{y}',[-4.43,y-.06,19.84],[-4.22,y+.06,20.26],'Graphite')


def hall_decon_arch():
    z=23.6
    for side in [-1,1]:
        a,b=sorted([side*3.85,side*4.22])
        box(f'Hall_Decon_leg_{side}',[a,.20,z-.20],[b,5.26,z+.34],'Ceramic')
        a,b=sorted([side*3.85,side*3.92])
        box(f'Hall_Decon_leg_gasket_{side}',[a,.36,z-.11],[b,5.18,z+.20],'Seal')
    box('Hall_Decon_head_core',[-3.85,5.26,z-.18],[3.85,6.35,z+.34],'Graphite')
    polygon=[(-3.85,5.26),(3.85,5.26),(3.85,5.94),(3.4,6.35),(-3.4,6.35),(-3.85,5.94)]
    door_pressed('Hall_Decon_pressed_fascia',polygon,-1,-(z-.18),-(z-.24),'Ceramic','')
    for x in [-3.12,3.12]:
        tube(f'Hall_Decon_fascia_bolt_{x}',(x,5.72,z-.28),(x,5.72,z-.16),.07,'Alloy',12)
    for k,x in enumerate([-2.65,0,2.65]):
        nursery_profile(f'Hall_Dormant_spray_nozzle_{k}',[(x,5.28,z),(x,5.18,z),(x,5.10,z),(x,5.05,z)],
            [.10,.10,.07,.055],['Alloy','Alloy','Graphite'],12)
    label('Hall_Decon_ident','DECONTAMINATION / 02',[0,5.70,z-.29],.28,(90,0,180),'HallInk')

def hall_practicals():
    for k,(side,x,y,z) in enumerate([(1,2.99,4.3,12),(-1,3.20,4.15,18.7)]):
        def side_box(name,near,far,low,high,left,right,finish):
            a,b=sorted([side*near,side*far]);box(f'Hall_Practical_{k}_{name}',[a,low,left],[b,high,right],finish)
        side_box('housing',x,x+.28,y-.27,y+.27,z-.43,z+.43,'Alloy')
        side_box('diffuser',x-.025,x,y-.20,y+.20,z-.34,z+.34,'Lamp')
        for at in [z-.39,z+.36]:side_box('guard',x-.06,x,y-.23,y+.23,at,at+.03,'Graphite')
        anchor=5.29 if side>0 else 4.72
        side_box('wall_arm',x+.28,3.74,y+.16,y+.24,z-.055,z+.055,'Alloy')
        side_box('drop_bracket',3.66,3.74,y+.16,anchor,z-.055,z+.055,'Alloy')
        side_box('header_foot',3.66,4.14,anchor-.04,anchor+.04,z-.12,z+.12,'Graphite')
    for side in [-1,1]:
        for y in [5.85,6.12]:
            nursery_sweep(f'Hall_Upper_service_{side}_{y}',[(side*3.74,y,2),(side*3.74,y,21.5)],.065,'Alloy',10)
        for z in [3.8,7.2,17.7,21.5]:
            a,b=sorted([side*3.74,side*4.18]);box(f'Hall_Conduit_clamp_{side}_{z}',[a,5.70,z-.07],[b,6.27,z+.07],'Graphite')

def build_decontamination_passage():
    hall_floor()
    for side in [-1,1]:
        def slab(name,a,b,c,d,near,far,finish):
            lo,hi=sorted([side*near,side*far]);box(f'Hall_{side}_{name}',[lo,c,a],[hi,d,b],finish)
        opening=(7.5,17.2,1.15,5.45) if side>0 else (17.65,20.8,1.35,4.80)
        a,b,c,d=opening
        zs=sorted(set([0,3.5,7.5,10.7,14,17.2,20.8,23.6,26,28,a,b]))
        ys=sorted(set([.20,1.05,3.45,5.45,6.35,c,d]))
        for i,(left,right) in enumerate(zip(zs,zs[1:])):
            for j,(low,high) in enumerate(zip(ys,ys[1:])):
                if a<=left and right<=b and c<=low and high<=d:continue
                slab(f'Wall_back_{i}_{j}',left,right,low,high,3.98,4.20,'Graphite')
                slab(f'Wall_panel_{i}_{j}',left+.025,right-.025,low+.025,high-.025,3.85,3.96,'Cool' if low<1.05 else 'Ceramic')
        slab('Floor_return',0,28,.04,.20,3.85,4.20,'Alloy')
        slab('Ceiling_return',0,28,6.35,6.65,3.85,4.20,'Alloy')
    for k,(a,b) in enumerate(intervals(0,28,3.5)):
        box(f'Hall_Ceiling_back_{k}',[-4,6.47,a],[4,6.65,b],'Graphite')
        for i,(c,d) in enumerate([(-4,-.6),(-.6,.6),(.6,4)]):
            box(f'Hall_Ceiling_panel_{i}_{k}',[c+.025,6.35,a+.025],[d-.025,6.45,b-.025],'Cool' if i==1 else 'Ceramic')
    for spec in LAYOUT[CURRENT]['boxes']:
        if 'partition' in spec['name']:box('Hall_'+spec['name'],spec['lo'],spec['hi'],'Ceramic')
    hall_observation();hall_service_bay();hall_decon_arch();hall_practicals()
    owner='cultivation-room-1-to-2-lab-passage-exit-shutter-panel'
    nursery_door_leaf(owner)
    for side in [-1,1]:
        a,b=sorted([side*2,side*2.28])
        box(f'Hall_Exit_door_guide_{side}',[a,0,27.26],[b,4.6,27.74],'Graphite')
        for low,high in [(2.025,2.09),(2.18,2.28)]:
            a,b=sorted([side*low,side*high])
            box(f'Hall_Exit_door_face_{side}_{low}',[a,.025,27.245],[b,4.575,27.28],'Alloy')
            box(f'Hall_Exit_door_back_{side}_{low}',[a,.025,27.72],[b,4.575,27.755],'Alloy')
    box('Hall_Exit_door_drive_header',[-2.28,4.6,27.26],[2.28,4.94,27.74],'Alloy')

def testing_deck(index,owner,width=3.8,depth=3.8,height=.6):
    before=set(bpy.context.scene.objects);start=len(BOXES)
    nursery_transfer_platform(index,owner)
    for obj in set(bpy.context.scene.objects)-before:
        if obj.type!='MESH':continue
        for v in obj.data.vertices:v.co=(v.co.x*width/5,v.co.y*depth/5,v.co.z*height/.6)
        obj.data.update()
    for spec in BOXES[start:]:
        for end in ['lo','hi']:
            spec[end]=[spec[end][0]*width/5,spec[end][1]*height/.6,spec[end][2]*depth/5]
    nursery_platform_harness(index,owner,width,depth,height/2)

def testing_process_bay(centre,index):
    a,b=centre-4.5,centre+4.5;bottom,top=2.2,12.8
    box(f'Test_Process_rear_{index}',[22.15,bottom,a],[22.45,top,b],'Cool')
    for z in [a,b-.22]:box(f'Test_Process_cheek_{index}',[18.8,bottom,z],[22.15,top,z+.22],'Alloy')
    for y in [bottom,top-.22]:box(f'Test_Process_return_{index}',[18.8,y,a+.22],[22.15,y+.22,b-.22],'Alloy')
    box(f'Test_Process_sump_{index}',[19.05,2.42,a+.22],[21.95,2.60,b-.22],'Graphite')
    for k,z in enumerate([centre-2.6,centre,centre+2.6]):
        tag=f'Test_Process_{index}_vessel_{k}'
        nursery_profile(tag,[(20.5,y,z) for y in [2.6,2.78,3.00,3.20,9.80,10.0,10.25,10.45]],
            [.61,.79,.79,.70,.70,.79,.79,.48],['Graphite','Alloy','Alloy','Ceramic','Alloy','Alloy','Cool'],24)
        for y in [3.55,9.35]:
            box(tag+'_wall_saddle',[21.18,y-.15,z-.44],[22.15,y+.15,z+.44],'Graphite')
        nursery_sweep(tag+'_upper_feed',[(20.5,10.45,z),(20.5,10.85,z),(20.8,11.1,z),(21.35,11.1,z)],.10,'Alloy',10)
        nursery_sweep(tag+'_draw_line',[(20.5,2.75,z),(20.5,2.90,z),(19.85,3.15,z),(19.85,4.4,z)],.075,'Alloy',10)
        tube(tag+'_valve_stem',(19.85,4.4,z),(19.3,4.4,z),.048,'Alloy',12)
        hall_service_handwheel(tag+'_service_wheel',19.36,4.4,z)
        for y in [3.45,4.05]:tube(tag+f'_coupling_{y}',(19.85,y-.11,z),(19.85,y+.11,z),.13,'Oxide',8)
        box(tag+'_gauge_plinth',[19.45,6.55,z-.40],[19.84,7.35,z+.40],'Cool')
        tube(tag+'_gauge_body',(19.35,6.95,z),(19.62,6.95,z),.27,'Graphite',32)
        annulus_x(tag+'_gauge_bezel',19.30,6.95,z,.245,.33,.12,'Alloy',32)
        vv=[(19.255,6.95+.24*math.cos(i*math.tau/32),z+.24*math.sin(i*math.tau/32)) for i in range(32)]
        mesh(tag+'_gauge_dial',vv,[tuple(reversed(range(32)))],'Ink')
        for n in range(11):
            theta=math.radians(-130+n*26);inner=.168 if n%5==0 else .19
            tube(tag+f'_dial_tick_{n}',(19.235,6.95+inner*math.cos(theta),z+inner*math.sin(theta)),
                (19.235,6.95+.215*math.cos(theta),z+.215*math.sin(theta)),.006,'Graphite',5)
        theta=.45+k*.7;direction=Vector((math.cos(theta),math.sin(theta)));across=Vector((-direction.y,direction.x))
        shape=[-direction*.06-across*.017,direction*.17,-direction*.06+across*.017]
        vv=[(x,6.95+p.x,z+p.y) for x in [19.215,19.225] for p in shape]
        mesh(tag+'_dial_pointer',vv,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],'Graphite')
    nursery_sweep(f'Test_Process_{index}_upper_manifold',[(21.35,11.10,a+.40),(21.35,11.10,b-.40)],.17,'Alloy',12)
    nursery_sweep(f'Test_Process_{index}_broken_feed',[(19.62,10.95,a+.75),(19.62,9.85,a+.75),(19.62,9.6,a+1.05)],.055,'Oxide',8)
    hall_process_ivy((19.65,2.54,a+1.0),6.2,.85,40+index*7)
    for k,z in enumerate([a+.22,centre-1.5,centre+1.5,b-.22]):
        box(f'Test_Process_mullion_{index}_{k}',[18.80,2.42,z-.06],[19.00,12.58,z+.06],'Ceramic')
    box(f'Test_Process_crossbar_{index}',[18.80,7.41,a+.22],[19.00,7.56,b-.22],'Alloy')
    for k,(c,d) in enumerate([(a+.30,centre-1.56),(centre-1.44,centre+1.44),(centre+1.56,b-.30)]):
        for row,(low,high) in enumerate([(2.63,7.41),(7.56,12.52)]):
            obj=mesh(f'Test_Process_glass_{index}_{k}_{row}',[(18.87,low,c),(18.87,high,c),(18.87,high,d),(18.87,low,d)],[(0,3,2,1)],'TestGlass')
            for loop in obj.data.loops:
                p=obj.data.vertices[loop.vertex_index].co;u=(-p.y-c)/(d-c);v=(p.z-low)/(high-low)
                variant=(index+k+row)%4
                obj.data.uv_layers.active.data[loop.index].uv=((variant%2+.008+.984*u)/2,(variant//2+.008+.984*v)/2)
    label(f'Test_Process_ident_{index}','NUTRIENT CONDITIONING' if index==0 else 'CULTURE PRESSURE RETURN',
        [19.075,13.35,centre],.34,(90,0,270),'TestInk')

def testing_floor_and_walls():
    box('Test_Start_floor_foundation',[-19.25,-.20,0],[19.25,.12,8],'Graphite')
    for i,(a,b) in enumerate(intervals(-18.8,18.8,4.7)):
        for j,(c,d) in enumerate([(0,4),(4,7.45),(7.45,7.62),(7.62,8)]):
            box(f'Test_Start_deck_panel_{i}_{j}',[a+.022,.12,c+.022],[b-.022,.20,d-.022],
                'Paint' if j==2 and i%2==0 else 'Seal' if j==2 else 'Deck')
    zs=sorted(set([0,4,9.5,12.5,18.5,22.5,28.5,31.5,37.5,41,45]))
    ys=[.20,2.2,6.0,12.8,18.7,23.8]
    for side in [-1,1]:
        def slab(name,a,b,c,d,near,far,finish):
            lo,hi=sorted([side*near,side*far]);box(f'Test_Wall_{side}_{name}',[lo,c,a],[hi,d,b],finish)
        slab('base_return',0,45,0,.20,18.8,19.25,'Alloy')
        slab('head_return',0,45,23.8,24.2,18.8,19.25,'Graphite')
        for i,(a,b) in enumerate(zip(zs,zs[1:])):
            for j,(c,d) in enumerate(zip(ys,ys[1:])):
                if side>0 and any(A<=a and b<=B and 2.2<=c and d<=12.8 for A,B in [(9.5,18.5),(28.5,37.5)]):continue
                slab(f'back_{i}_{j}',a,b,c,d,19.30,19.50,'Graphite')
                slab(f'panel_{i}_{j}',a+.035,b-.035,c+.035,d-.035,19.10,19.28,'Cool' if c<2.2 else 'Ceramic')
        # Recess the cladding behind continuous load-bearing piers. Every
        # room-facing edge stays at or behind the original collision wall.
        for z in [0,4,9.5,22.5,28.5,37.5,41,44.64]:
            slab(f'load_pier_{z}',z,min(45,z+.36),0,24.2,18.83 if side<0 else 18.8,19.50,'Ceramic')
        for y in [.2,12.8,23.40]:
            slab(f'load_course_{y}',0,45,y,y+.24,18.8,19.50,'Alloy')
    # End walls use the authoritative openings. Their backs reach the side
    # backing, sealing the full corner rather than stopping at the floor edge.
    for spec in LAYOUT[CURRENT]['boxes']:
        if not('entry-wall' in spec['name'] or 'far-wall' in spec['name'] or 'bob-vent' in spec['name'] or 'above-blast' in spec['name']):continue
        lo=list(spec['lo']);hi=list(spec['hi'])
        if lo[0]<-18:lo[0]=-19.50
        if hi[0]>18:hi[0]=19.50
        face=.2 if hi[2]<1 else 44.8;front=hi[2]<1
        # A 20 mm lap separates the visible backer from adjoining passage
        # end caps. The fitted returns still seal the complete shared edge.
        backlo,backhi=(lo[2],face-.18) if front else (face+.18,hi[2])
        box('Test_End_back_'+spec['name'],[lo[0],lo[1],backlo],[hi[0],hi[1],backhi],'Graphite')
        for i,(a,b) in enumerate(intervals(lo[0],hi[0],5.5)):
            for j,(c,d) in enumerate(intervals(lo[1],hi[1],5.9)):
                za,zb=(face-.18,face) if front else (face,face+.18)
                box(f'Test_End_panel_{spec["name"]}_{i}_{j}',[a+.035,c+.035,za],[b-.035,d-.035,zb],'Ceramic')
        # Continuous contact returns seal each end-wall perimeter and reveal.
        for a,b in [(lo[0],lo[0]+.035),(hi[0]-.035,hi[0])]:
            box('Test_End_vertical_return',[a,lo[1],lo[2]],[b,hi[1],hi[2]],'Alloy')
        for c,d in [(lo[1],lo[1]+.035),(hi[1]-.035,hi[1])]:
            box('Test_End_cross_return',[lo[0],c,lo[2]],[hi[0],d,hi[2]],'Alloy')

def testing_ceiling_and_mounts():
    cuts=sorted(set([0,8,16,24,28.9,31.1,33.9,36.1,38.9,41.1,45]))
    for k,(a,b) in enumerate(zip(cuts,cuts[1:])):
        beam=any(A<=a and b<=B for A,B in [(28.9,31.1),(33.9,36.1),(38.9,41.1)])
        box(f'Test_Roof_back_{k}',[-19.25,23.98,a],[19.25,24.20,b],'Graphite')
        if beam:
            box(f'Test_Load_gantry_beam_{k}',[-19.25,23.8,a],[19.25,24.45,b],'Alloy')
            for z in [a+.12,b-.24]:box(f'Test_Load_gantry_flange_{k}',[-19.25,23.8,z],[19.25,23.93,z+.12],'Graphite')
        else:
            for i,(c,d) in enumerate(intervals(-19.25,19.25,6.4)):
                box(f'Test_Ceiling_panel_{i}_{k}',[c+.035,23.8,a+.035],[d-.035,23.96,b-.035],'Cool' if i%3==0 else 'Ceramic')
    for index,(x,z) in enumerate([(-11.5,30),(-5.5,35),(2.5,40)],1):
        nursery_ceiling_saddle(f'Test_Load_{index}',x,z,23.8,1.7,.5)
        nursery_fluted_strut(f'Test_Load_{index}_formed_beam',1,
            f'cultivation-room-2-block-{index}-non-soluble-rope',.22,finish='Rust')
        nursery_fluted_strut(f'Test_Load_{index}_release_bar',2.2,
            f'cultivation-room-2-block-{index}-soluble-wooden-brace',across=True)
        testing_deck(index,f'cultivation-room-2-block-{index}-block')
    testing_deck('button','cultivation-room-2-button-rest-ledge',2.6,3,.5)

def testing_route_and_exits():
    # The entire architectural field is behind the existing adhesive fronts.
    for index,(bottom,top,left,right) in enumerate([(.35,5.85,4,11),(3.6,8.4,9.5,15.5),
        (6.2,11.4,14,21),(8.6,13.8,19,26),(10.85,16.35,24,31)]):
        box(f'Test_Adhesion_rig_backplate_{index}',[-19.10,max(.20,bottom-.30),left-.30],
            [-18.815,top+.30,right+.30],'Cool')
    for z in [3.55,31.9]:box('Test_Adhesion_rig_jamb',[-19.04,.2,z],[-18.8,19.5,z+.22],'Alloy')
    for y in [.20,19.3]:box('Test_Adhesion_rig_crossmember',[-19.04,y,3.55],[-18.8,y+.20,32.12],'Alloy')
    for n in range(15):
        y=1+n*1.25
        box(f'Test_Adhesion_scale_{n}',[-18.80,y,32.28],[-18.73,y+.065,32.75 if n%5 else 33.10],'Alloy')
    label('Test_Adhesion_ident','ADHESION / HOLD CONTROL',[-19.075,18.05,17.7],.43,(90,0,90),'TestInk')
    # The existing button remains the only control and owns its press/colour.
    nursery_sweep('Test_Control_conduit',[(-18.9,17.6,31.45),(-18.9,15.8,31.45),(-18.9,14.2,30.2)],.075,'Alloy',10)
    for side in [-1,1]:
        a,b=sorted([side*2.0,side*2.37])
        box('Test_Blast_door_reveal',[a,0,44.71],[b,5.06,45.20],'Alloy')
    box('Test_Blast_door_header',[-2.37,4.6,44.71],[2.37,5.06,45.20],'Graphite')
    label('Test_Blast_door_ident','CONTAINMENT / 03',[0,7.65,44.775],.32,(90,0,180),'TestInk')
    # Continuous duct reveal, open over the original 2 x 2.1 m passage.
    for a,b in [(6.72,7),(9,9.28)]:box('Test_Upper_duct_jamb',[a,18.52,44.65],[b,21.18,45.20],'Alloy')
    for a,b in [(18.52,18.77),(20.9,21.18)]:box('Test_Upper_duct_crosspiece',[7,a,44.65],[9,b,45.20],'Alloy')
    label('Test_Upper_duct_ident','SERVICE / 03',[8,21.85,44.775],.29,(90,0,180),'TestInk')

def testing_practicals():
    # Bodies are fitted above the actual existing point pools; none of these
    # meshes is a light or changes light/shadow placement or activation.
    # The upper-vent and low exit pools are existing fill lights. Keep their
    # camera/door volumes clear instead of hanging hardware across those routes.
    for index,(x,y,z,width,depth) in enumerate([(0,14,12,2.6,1.3)]):
        box(f'Test_Practical_{index}_body',[x-width/2,y+.16,z-depth/2],[x+width/2,y+.44,z+depth/2],'Graphite')
        box(f'Test_Practical_{index}_diffuser',[x-width/2+.10,y+.12,z-depth/2+.10],[x+width/2-.10,y+.16,z+depth/2-.10],'Lamp')
        for dx in [-width*.35,width*.35]:
            tube(f'Test_Practical_{index}_hanger_{dx}',(x+dx,y+.44,z),(x+dx,23.8,z),.045,'Alloy',8)
    for index,(x,z) in enumerate([(-10.64,13),(10.64,37)]):
        box(f'Test_Shadow_fixture_{index}',[x-.20,23.70,z-1.1],[x+.20,23.8,z+1.1],'Alloy')
        box(f'Test_Shadow_diffuser_{index}',[x-.15,23.66,z-1],[x+.15,23.70,z+1],'Lamp')
    box('Test_Control_worklight',[-17.50,17.16,26.65],[-16.60,17.42,27.35],'Alloy')
    box('Test_Control_worklight_diffuser',[-17.43,17.12,26.72],[-16.67,17.16,27.28],'Lamp')
    box('Test_Control_worklight_arm',[-18.80,17.28,26.93],[-17.50,17.40,27.07],'Graphite')

def testing_laser_emitters():
    # Fit the original 0.18 m emitter body and keep the live aperture/status
    # meshes. These owner-local housings inherit endpoint motion and reset.
    scale=.18/.256;sides=24
    for index,owner in enumerate(LAYOUT[CURRENT].get('laserEmitterTargets',[])):
        profile=[(.165,-.17),(.205,-.17),(.25,-.12),(.25,.06),(.23,.13),(.23,.16),(.165,.16)]
        vv=[(r*scale*math.cos(i*math.tau/sides),y,r*scale*math.sin(i*math.tau/sides)) for r,y in profile for i in range(sides)]
        ff=[]
        for ring in range(len(profile)):
            next_ring=(ring+1)%len(profile)
            for i in range(sides):
                j=(i+1)%sides
                ff.append((ring*sides+i,ring*sides+j,next_ring*sides+j,next_ring*sides+i))
        obj=mesh(f'Test_Laser_emitter_{index}',vv,ff,'Alloy',owner)
        for vertex in obj.data.vertices:
            p=vertex.co;radius=math.hypot(p.x,p.y)
            shade=.82 if p.z>.12 and radius>.12 else .22
            obj.data.color_attributes['wear'].data[vertex.index].color=(shade,shade*.99,shade*.96,1)
        for bolt in range(4):
            angle=(bolt+.5)*math.tau/4;x=.197*scale*math.cos(angle);z=.197*scale*math.sin(angle)
            tube(f'Test_Laser_fastener_{index}_{bolt}',(x,.145,z),(x,.195,z),.013*scale,'Alloy',8,owner)

def build_testing_hall():
    testing_floor_and_walls();testing_ceiling_and_mounts()
    testing_process_bay(14,0);testing_process_bay(33,1)
    testing_route_and_exits();testing_practicals();testing_laser_emitters()


def filtration_architecture():
    box('Filter_Floor_back',[-3.65,-.24,0],[3.65,.16,28],'Graphite')
    for i,(a,b) in enumerate(intervals(-3.35,3.35,1.675)):
        for k,(c,d) in enumerate(intervals(0,28,3.5)):
            box(f'Filter_Floor_plate_{i}_{k}',[a+.018,.16,c+.018],[b-.018,.20,d-.018],'Resin')
    for side in [-1,1]:
        def slab(name,near,far,low,high,a,b,finish):
            x,X=sorted([side*near,side*far]);box(f'Filter_{side}_{name}',[x,low,a],[X,high,b],finish)
        a,b,c,d=(6.8,17.2,1.25,4.8) if side>0 else (17,23.4,1.05,4.65)
        zs=sorted(set([0,3.5,6.8,10.3,13.7,17,17.2,20.5,23.4,26,28,a,b]))
        ys=sorted(set([.20,1.05,1.25,3.0,4.65,4.8,6.35,c,d]))
        for i,(left,right) in enumerate(zip(zs,zs[1:])):
            for j,(low,high) in enumerate(zip(ys,ys[1:])):
                if a<=left and right<=b and c<=low and high<=d:continue
                slab(f'Wall_back_{i}_{j}',3.50,3.72,low,high,left,right,'Graphite')
                slab(f'Wall_cassette_{i}_{j}',3.35,3.48,low+.025,high-.025,left+.025,right-.025,'Cool' if high<=1.25 else 'Ceramic')
        slab('Bay_back',4.88,5.10,c,d,a,b,'Cool')
        for z in [a,b-.16]:slab('Bay_cheek',3.35,4.88,c,d,z,z+.16,'Alloy')
        for y in [c,d-.16]:slab('Bay_sill',3.35,4.88,y,y+.16,a+.16,b-.16,'Alloy')
        slab('Floor_return',3.35,3.72,.04,.20,0,28,'Alloy')
        slab('Ceiling_return',3.35,3.72,6.35,6.65,0,28,'Alloy')
        for z in [2.0,25.8]:slab('Pressure_pier',3.35,3.74,.2,6.35,z-.10,z+.10,'Alloy')
        for z in [4.5,23.5]:
            for y in [.6,5.90]:tube(f'Filter_Pier_bolt_{side}_{z}_{y}',(side*3.38,y,z),(side*3.43,y,z),.042,'Graphite',8)
    for k,(a,b) in enumerate(intervals(0,28,3.5)):
        box(f'Filter_Ceiling_back_{k}',[-3.65,6.47,a],[3.65,6.68,b],'Graphite')
        for i,(c,d) in enumerate([(-3.5,-.9),(-.9,.9),(.9,3.5)]):
            box(f'Filter_Ceiling_cassette_{i}_{k}',[c+.025,6.35,a+.025],[d-.025,6.45,b-.025],'Ceramic' if i!=1 else 'Cool')
    for z in [28/3,56/3]:box('Filter_Crosshead',[-3.35,6.14,z-.16],[3.35,6.68,z+.16],'Alloy')
    for spec in LAYOUT[CURRENT]['boxes']:
        if 'partition' in spec['name']:box('Filter_'+spec['name'],spec['lo'],spec['hi'],'Ceramic')
    for end,z in [('entry',.5),('exit',27.5)]:
        owner=f'cultivation-room-2-to-3-goop-lab-passage-{end}-shutter-panel'
        nursery_door_leaf(owner)
        for side in [-1,1]:
            x,X=sorted([side*2,side*2.28])
            box(f'Filter_{end}_door_guide_{side}',[x,0,z-.24],[X,4.6,z+.24],'Graphite')
            for a,b in [(2.025,2.09),(2.18,2.28)]:
                x,X=sorted([side*a,side*b])
                for zz in [z-.255,z+.22]:box(f'Filter_{end}_door_face_{side}',[x,.025,zz],[X,4.575,zz+.035],'Alloy')
        box(f'Filter_{end}_drive_header',[-2.28,4.6,z-.24],[2.28,4.94,z+.24],'Alloy')

def filtration_cartridge(tag,z):
    # A continuous corrugated insert, sealed along its top/bottom and ends.
    points=[(3.78 if i%2==0 else 4.14,z-1.22+i*2.44/40) for i in range(41)]
    n=len(points);vv=[(x+offset,y,zz) for offset,y in [(0,1.68),(0,4.42),(.03,1.68),(.03,4.42)] for x,zz in points]
    ff=[]
    for i in range(n-1):
        j=i+1;ff.extend([(i,j,j+n,i+n),(i+2*n,i+3*n,j+3*n,j+2*n),
            (i,i+2*n,j+2*n,j),(i+n,j+n,j+3*n,i+3*n)])
    ff.extend([(0,n,3*n,2*n),(n-1,3*n-1,4*n-1,2*n-1)])
    mesh(tag+'_folded_filter',vv,ff,'HallCeramic')
    box(tag+'_rear',[4.30,1.58,z-1.33],[4.44,4.52,z+1.33],'Graphite')
    for a,b in [(z-1.43,z-1.28),(z+1.28,z+1.43)]:box(tag+'_stile',[3.47,1.48,a],[4.32,4.62,b],'Alloy')
    for a,b in [(1.48,1.68),(4.42,4.62)]:box(tag+'_crossbar',[3.47,a,z-1.28],[4.32,b,z+1.28],'Ceramic')
    for k in range(9):box(tag+'_guard',[3.53,1.74+k*.31,z-1.25],[3.56,1.77+k*.31,z+1.25],'Graphite')
    for k in range(7):box(tag+'_upright',[3.53,1.74,z-1.18+k*.393],[3.56,4.37,z-1.15+k*.393],'Graphite')
    for y in [1.60,4.50]:
        for zz in [z-1.35,z+1.35]:tube(tag+'_captive_bolt',(3.43,y,zz),(3.52,y,zz),.040,'Graphite',8)

def filtration_equipment():
    filtration_cartridge('Filter_Cartridge_A',8.45);filtration_cartridge('Filter_Cartridge_B',15.55)
    # The fan stays on the original x-axis rotor owner, at the original centre.
    for inner,outer,x,depth,finish in [(1.15,1.38,3.64,.22,'Alloy'),(1.10,1.15,3.90,.30,'Graphite'),(1.10,1.36,4.15,.20,'Alloy')]:
        annulus_x('Filter_Fan_formed_shroud',x,3.05,12,inner,outer,depth,finish,48)
    for k in range(8):
        t=(k+.5)*math.tau/8;y=3.05+1.27*math.cos(t);z=12+1.27*math.sin(t)
        tube('Filter_Fan_flange_fastener',(3.48,y,z),(3.58,y,z),.047,'Graphite',8)
    for y in [1.97,3.97]:
        for z in [11.20,12.64]:box('Filter_Fan_rear_mount',[4.20,y,z],[4.90,y+.16,z+.16],'Alloy')
    tube('Filter_Fan_rear_spindle',(4.12,3.05,12),(4.90,3.05,12),.085,'HallGraphite',20)
    for y in [2.00,2.35,2.70,3.05,3.40,3.75,4.10]:
        dz=math.sqrt(max(0,1.23**2-(y-3.05)**2))
        box('Filter_Fan_guard_bar',[3.51,y-.014,12-dz],[3.55,y+.014,12+dz],'Graphite')
    box('Filter_Fan_guard_spine',[3.51,1.82,11.986],[3.55,4.28,12.014],'Graphite')
    owner='cultivation-filtration-slow-fan'
    for k in range(5):
        angle=k*math.tau/5;shape=[(.22,-.06),(.87,-.22),(1.04,-.04),(.97,.13),(.46,.24),(.22,.12)]
        vv=[(x,a*math.cos(angle)-b*math.sin(angle),a*math.sin(angle)+b*math.cos(angle)) for x in [-.045,.045] for a,b in shape]
        n=len(shape);ff=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh(f'Filter_Rotor_formed_blade_{k}',vv,ff,'HallAlloy',owner)
    tube('Filter_Rotor_hub',(-.14,0,0),(.14,0,0),.23,'HallGraphite',32,owner)
    for k in range(5):
        t=k*math.tau/5;tube('Filter_Rotor_hub_bolt',(-.18,.13*math.cos(t),.13*math.sin(t)),(-.12,.13*math.cos(t),.13*math.sin(t)),.027,'HallAlloy',8,owner)
    hall_service_bay() # The approved dial, regulator and handwheel assembly.
    for index,y in enumerate([1.45,2.85]):
        box(f'Filter_Spare_cassette_{index}',[-4.34,y,21.25],[-3.81,y+1.12,22.95],'Ceramic')
        for zz in [21.32,22.84]:box('Filter_Spare_retainer',[-3.81,y+.06,zz],[-3.67,y+1.06,zz+.045],'Graphite')
        for k in range(7):box('Filter_Spare_face_pleat',[-3.80,y+.16,21.44+k*.18],[-3.74,y+.96,21.48+k*.18],'Alloy')
    nursery_sweep('Filter_Feed_upper',[(4.76,4.60,7.0),(4.76,5.08,7.0),(4.76,5.08,16.65),(4.76,4.78,16.65)],.075,'HallAlloy',10)
    nursery_sweep('Filter_Failed_feed',[(4.76,4.67,16.65),(4.76,3.82,16.65)],.055,'HallOxide',8)
    nursery_sweep('Filter_Abandoned_riser',[(4.76,4.98,13.75),(3.87,4.98,13.75),(3.87,1.41,13.75)],.045,'HallOxide',10)
    hall_process_ivy((3.75,1.42,13.75),3.1,.30,54)
    label('Filter_Intake_ident','BIOFILTRATION / 03',[3.325,5.58,8.45],.24,(90,0,270),'HallInk')
    label('Filter_Service_ident','FILTER SERVICE',[-3.325,5.58,20.15],.23,(90,0,90),'HallInk')
    label('Filter_Exit_ident','03 / RESTRICTED',[0,5.59,27.30],.28,(90,0,180),'HallInk')

def filtration_practicals():
    # Fitted diffusers face the two existing point pools. No source is added.
    for k,(side,x,y,z) in enumerate([(1,2.5,4.9,11.5),(-1,2.8,4.55,17.95)]):
        def slab(name,near,far,lo,hi,a,b,finish):
            X,Y=sorted([side*near,side*far]);box(f'Filter_Practical_{k}_{name}',[X,lo,a],[Y,hi,b],finish)
        slab('body',x+.15,x+.37,y-.30,y+.30,z-.42,z+.42,'Alloy')
        slab('diffuser',x+.11,x+.15,y-.23,y+.23,z-.32,z+.32,'Lamp')
        for zz in [z-.34,z,z+.34]:slab('cage',x+.07,x+.12,y-.25,y+.25,zz-.014,zz+.014,'Graphite')
        slab('bracket',x+.37,3.5,y+.20,y+.28,z-.08,z+.08,'Alloy')
    for k,z in enumerate([5,13,21]):
        for x in [-1.96,1.96]:
            box('Filter_Ceiling_light_housing',[x-.18,6.24,z-1.12],[x+.18,6.35,z+1.12],'Alloy')
            box('Filter_Ceiling_light_lens',[x-.12,6.21,z-1.02],[x+.12,6.24,z+1.02],'Lamp')
    for x in [-.86,.86]:box('Filter_Cable_tray_rail',[x-.035,5.92,1.5],[x+.035,6.11,26.5],'Alloy')
    for k in range(19):box('Filter_Cable_tray_rung',[-.82,5.92,2+k*1.28],[.82,5.95,2.055+k*1.28],'Graphite')
    for x in [-.49,-.17,.17,.49]:tube('Filter_Cable_run',(x,6.015,1.6),(x,6.015,26.4),.031,'Graphite',8)
    for z in [3.5,14,24.5]:
        for x in [-.86,.86]:box('Filter_Tray_hanger',[x-.035,6.11,z-.06],[x+.035,6.50,z+.06],'Alloy')

def build_filtration_passage():
    filtration_architecture();filtration_equipment();filtration_practicals()

def duct_flange(z,index):
    inner=[(-1.02,-.015),(1.02,-.015),(1.08,.10),(1.08,2.10),(1,2.18),(-1,2.18),(-1.08,2.10),(-1.08,.10)]
    outer=[(-1.18,-.20),(1.18,-.20),(1.34,.04),(1.34,2.20),(1.10,2.40),(-1.10,2.40),(-1.34,2.20),(-1.34,.04)]
    loops=[[(x,y,zz) for x,y in ring] for ring,zz in [(inner,z),(outer,z),(outer,z+.12),(inner,z+.12)]]
    vv=sum(loops,[]);ff=[]
    for k in range(4):
        for i in range(8):j=(i+1)%8;ff.append((k*8+i,k*8+j,((k+1)%4)*8+j,((k+1)%4)*8+i))
    mesh(f'Duct_Formed_flange_{index}',vv,ff,'HallAlloy')
    for x,y in [(-1.17,.35),(1.17,.35),(-1.17,1.83),(1.17,1.83),(-.65,2.29),(.65,2.29)]:
        tube(f'Duct_Flange_fastener_{index}',(x,y,z-.045),(x,y,z+.025),.028,'HallOxide',8)

def build_service_duct():
    # Every formed corner expands outside the original 2 x 2.1 m clear box.
    inner=[(-1,0),(1,0),(1.20,.18),(1.20,2.12),(1.03,2.28),(-1.03,2.28),(-1.20,2.12),(-1.20,.18)]
    outer=[(-1.18,-.24),(1.18,-.24),(1.38,.12),(1.38,2.20),(1.12,2.46),(-1.12,2.46),(-1.38,2.20),(-1.38,.12)]
    for i in [1,3,5,7]:
        j=(i+1)%8
        vv=[(x,y,z) for z in [.2,27.8] for x,y in [inner[i],inner[j],outer[j],outer[i]]]
        # Adjacent room reveals own the end caps of this continuous liner.
        mesh(f'Duct_Folded_corner_{i}',vv,[(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],'HallAlloy')
    box('Duct_Floor_back',[-1.18,-.24,.2],[1.18,-.04,27.8],'Graphite')
    cuts=sorted(set([.2,1.5,3.5,7,10.5,14,17.5,21,24.5,27.8]))
    for k,(a,b) in enumerate(zip(cuts,cuts[1:])):
        box(f'Duct_Floor_panel_{k}',[-1,-.04,a],[1,0,b],'Alloy')
    for k,(a,b) in enumerate(intervals(.2,27.8,3.5)):
        box(f'Duct_Roof_back_{k}',[-1.12,2.40,a],[1.12,2.46,b],'Graphite')
        box(f'Duct_Roof_panel_{k}',[-1.03,2.28,a+.018],[1.03,2.38,b-.018],'Alloy')
    for side,centre in [(1,9.5),(-1,22)]:
        def slab(name,near,far,low,high,a,b,finish):
            x,X=sorted([side*near,side*far]);box(f'Duct_{side}_{name}',[x,low,a],[X,high,b],finish)
        a,b,c,d=centre-.9,centre+.9,.65,1.65
        zs=sorted(set([.2,3.5,7,10.5,14,17.5,21,24.5,27.8,a,b]));ys=[.18,c,d,2.12]
        for k,(left,right) in enumerate(zip(zs,zs[1:])):
            for j,(low,high) in enumerate(zip(ys,ys[1:])):
                if a<=left and right<=b and c<=low and high<=d:continue
                slab(f'Wall_back_{k}_{j}',1.30,1.38,low,high,left,right,'Graphite')
                slab(f'Wall_panel_{k}_{j}',1.20,1.28,low,high,left+.018,right-.018,'Alloy')
        slab('Grille_back',1.46,1.56,c,d,a,b,'Graphite')
        for z in [a,b-.06]:slab('Grille_cheek',1.04,1.46,c,d,z,z+.06,'Alloy')
        for y in [c,d-.06]:slab('Grille_sill',1.04,1.46,y,y+.06,a+.06,b-.06,'Alloy')
        for k in range(6):slab(f'Grille_louvre_{k}',1.09,1.13,c+.12+k*.14,c+.145+k*.14,a+.08,b-.08,'Alloy')
        for zz in [a+.09,b-.09]:
            for y in [c+.08,d-.08]:tube('Duct_Grille_fastener',(side*1.015,y,zz),(side*1.075,y,zz),.023,'HallGraphite',8)
    for k,z in enumerate([.30,7.5,15.5,23.5,27.62]):duct_flange(z,k)
    for k,z in enumerate([7,14,21]):
        box('Duct_Fixture_body',[-.48,2.04,z-.17],[.48,2.08,z+.17],'Alloy')
        box('Duct_Fixture_diffuser',[-.40,2.02,z-.13],[.40,2.04,z+.13],'Lamp')
        for x in [-.48,.43]:box('Duct_Fixture_endcap',[x,2.02,z-.17],[x+.05,2.04,z+.17],'Graphite')
    for side,a,b in [(1,5.0,10.0),(-1,20.7,24.5)]:
        points=[(side*(1.115+.025*math.sin(k*.9)),2.18+.025*math.sin(k*.7),a+(b-a)*k/20) for k in range(21)]
        nursery_profile(f'Duct_Root_runner_{side}',points,[.018-.010*k/20 for k in range(21)],['HallLoam']*20,6)
        for k in [4,9,14]:
            p=Vector(points[k]);nursery_sweep(f'Duct_Root_branch_{side}_{k}',[tuple(p),tuple(p+Vector((side*.035,.015,.22))),tuple(p+Vector((side*.045,.02,.48)))],.009,'HallLoam',5)
    label('Duct_Exit_marker','03 / AIR RETURN',[1.175,1.55,25.8],.12,(90,0,270),'HallInk')
    label('Duct_Section_marker','F-02',[-1.175,1.48,12.8],.10,(90,0,90),'HallInk')


def build_enclosure():
    # Opaque backs of the unchanged fixtures and retained acid slabs own their
    # contact faces. Only immutable surfaces in this same room are trimmed.
    OCCLUDERS.extend(LAYOUT[CURRENT].get('occluders',[]))
    if CURRENT=='room-1':
        # Old repeated strips are retired. Only the retained acid owns a
        # contact face; new architecture must seal the former fixture seats.
        OCCLUDERS[:]=[o for o in OCCLUDERS if o['hi'][1]<=0]
        build_nursery();return
    if CURRENT=='passage-1-2':
        OCCLUDERS[:]=[]
        nursery_sliding_door()
        build_decontamination_passage();return
    if CURRENT=='room-2':
        OCCLUDERS[:]=[o for o in OCCLUDERS if o['hi'][1]<=0]+LAYOUT[CURRENT].get('retainedSurfaceOccluders',[])
        build_testing_hall();return
    if CURRENT=='passage-2-3':
        OCCLUDERS[:]=[]
        build_filtration_passage();return
    if CURRENT=='room-4':
        build_lift();return
    if CURRENT=='room-5':
        build_quarantine();return
    if CURRENT=='escape-duct':
        build_escape();return
    if CURRENT=='bob-duct':
        OCCLUDERS[:]=[]
        build_service_duct();return
    for spec in LAYOUT[CURRENT]['boxes']:
        lo,hi=spec['lo'],spec['hi'];dy=hi[1]-lo[1]
        if dy<.85 and ('floor' in spec['name']):deck(spec)
        elif dy<.85 and ('ceiling' in spec['name'] or 'roof' in spec['name']):roof(spec)
        else:wall(spec)
    print('Enclosure authored:',CURRENT,len(BOXES),'editable structural parts')

def build_escape():
    for spec in LAYOUT[CURRENT]['boxes']:
        lo,hi=spec['lo'],spec['hi']
        if 'floor' in spec['name']:
            # The ordinary pressed deck meets the unchanged hinged floor.
            base={**spec,'hi':[hi[0],.0175,hi[2]]};deck(base)
        elif 'roof' in spec['name']:roof(spec)
        else:wall(spec,False)
    # Flush alloy straps and recessed oxidation belong to the liner's union,
    # not to a second grille or an alternate cinematic mechanism.
    for x in [22,28,34,40,46,52]:
        for z,inward in [(60.08,1),(62.92,-1)]:
            if z<61 and 46.4<x<49.6 or z>62 and 25.4<x<28.6:continue
            block(f'Airway_pressure_strap_{x}_{z}',[.14,2.64,.20],[x,1.35,z-inward*.10],'Alloy')
    for y in range(-6,-69,-6):
        for x,inward in [(40.6,1),(43.4,-1)]:
            block(f'Drop_flange_{x}_{y}',[.24,.16,2.8],[x-inward*.12,y,61.5],'Oxide')
    print('Escape airway, branch and full drop authored on existing annex root')

def room_mesh(name,vertices,faces,finish,owner=''):
    if owner:
        values=LAYOUT[CURRENT]['rigs'][owner]['matrix']
        inv=Matrix([values[i::4] for i in range(4)]).inverted()
        vertices=[tuple(inv@Vector(v)) for v in vertices]
    return mesh(name,vertices,faces,finish,owner)

def sewer_shell(i,a,b,missing_start=False,missing_end=False,owner=''):
    """Fitted radial backing, with returns only at intentional open boundaries."""
    angle=i*math.pi/20;next_angle=(i+1)*math.pi/20
    inner=(10.85 if owner else 10.15)/math.cos(math.pi/40)
    outer=(11.3 if owner else 10.8)/math.cos(math.pi/40)
    # A deeper sliding back overlaps the static jamb in Z while remaining
    # outside its radial envelope throughout the existing upward travel.
    shell_start=a-.25 if owner else a-.05 if a==16 else a
    shell_end=b+.25 if owner else b+.05 if b==140 else b
    for start,end in intervals(shell_start,shell_end,24):
        vv=[(40+r*math.cos(t),-12+r*math.sin(t),z)
            for z in [start,end] for r in [inner,outer] for t in [angle,next_angle]]
        # Explicit inward/outer winding. Adjacent cells share edges, never caps.
        ff=[(0,1,5,4),(2,6,7,3)]
        if missing_start and start==shell_start:ff.append((0,2,3,1))
        if missing_end and end==shell_end:ff.append((4,5,7,6))
        if i==0:ff.append((0,4,6,2))
        if i==19:ff.append((1,3,7,5))
        room_mesh(f'Interceptor_backing_{i}_{start}',vv,[tuple(reversed(face)) for face in ff],'Graphite',owner)
    # Inset pressed cassettes use the original tangent clearance. Deep joints
    # expose the continuous backing, rather than another coplanar wall.
    theta=(i+.5)*math.pi/20;n=Vector((math.cos(theta),math.sin(theta),0));t=Vector((-math.sin(theta),math.cos(theta),0))
    half=9.825*math.tan(math.pi/40)-.045
    for section,(c,d) in enumerate(intervals(a,b,8)):
        if d-c<.18:continue
        vv=[tuple(Vector((40,-12,z))+n*r+t*u) for z in [c+.04,d-.04] for r in [9.825,10.105] for u in [-half,half]]
        ff=[(0,4,5,1),(2,3,7,6),(0,1,3,2),(4,6,7,5),(0,2,6,4),(1,5,7,3)]
        room_mesh(f'Interceptor_cassette_{i}_{c}',vv,ff,'Cool' if i in [3,4,15,16] else 'Ceramic' if i<5 or i>14 else 'Oxide',owner)

def build_quarantine():
    # Ducts, climb shaft and return keep their existing faces and openings;
    # all depth and service reveals extend behind those protected planes.
    for spec in LAYOUT[CURRENT]['boxes']:
        name=spec['name'];lo,hi=spec['lo'],spec['hi'];dy=hi[1]-lo[1]
        if name=='room-5-chamber-roof':
            quarantine_crown(spec);continue
        if dy<.85 and ('floor' in name or 'landing-tile' in name):deck(spec)
        elif dy<.85 and ('roof' in name or 'flange' in name):roof(spec)
        else:wall(spec,bays='chamber' in name)
    # Preserve the actual sloped, front-sided profiles; introduce alternating
    # service bands on their existing triangles without changing the route.
    for spec in LAYOUT[CURRENT]['profiles']:
        vertices=spec['vertices'];ii=spec['indices'];by_finish={}
        for k in range(0,len(ii),3):
            face=ii[k:k+3];z=sum(vertices[j][2] for j in face)/3
            finish='Resin' if spec['name'].endswith('ramp') else 'Alloy'
            if int(z/6)%4==0:finish='Oxide'
            by_finish.setdefault(finish,[]).append(face)
        for finish,faces in by_finish.items():mesh(spec['name']+'_'+finish,vertices,faces,finish)
    for x in [33.5,46.5]:
        deck({'name':f'Interceptor_bank_{x}','lo':[x-3.5,-12.5,16],'hi':[x+3.5,-11.2,140]})
    # The original non-colliding pipe ducked across the return's entry view.
    # Route its presentation above that doorway through the service shell.
    for run,(start,end) in enumerate([(17,119.5),(128.5,139)]):
        sections=intervals(start,end,24)
        for j,(a,b) in enumerate(sections):
            tube(f'Interceptor_return_pipe_{run}_{j}',(32,-8.7,a),(32,-8.7,b),.30,'Oxide',12,
                 cap_a=j==0 and run==0,cap_b=j==len(sections)-1 and run==1)
    vv=[];segments=24;sides=12
    for j in range(segments+1):
        t=j*math.pi/segments;centre=Vector((32,-8.7+4.5*math.sin(t)**2,119.5+9*t/math.pi))
        tangent=Vector((0,9*math.sin(t)*math.cos(t),9/math.pi)).normalized()
        right=Vector((1,0,0));radial=tangent.cross(right)
        for i in range(sides):vv.append(tuple(centre+.30*(right*math.cos(math.tau*i/sides)+radial*math.sin(math.tau*i/sides))))
    ff=[]
    for j in range(segments):
        for i in range(sides):
            n=(i+1)%sides;ff.append((j*sides+i,j*sides+n,(j+1)*sides+n,(j+1)*sides+i))
    mesh('Interceptor_return_pipe_arch',vv,ff,'Oxide')
    bands=[(16,18.5),(18.5,21.5),(21.5,122),(122,126),(126,140)]
    for band,(a,b) in enumerate(bands):
        for i in range(20):
            if band==1 and i in [9,10]:continue
            if band==3 and i>=17:continue
            sewer_shell(i,a,b,band==0 or band==2 and i in [9,10],band==4 or band==0 and i in [9,10])
    # The hidden curved return travels on the existing door. Its inset face
    # and deeper backing lap clear the static jamb throughout that motion.
    for i in [17,18,19]:sewer_shell(i,122.05,125.95,True,True,'room-5-maintenance-reunion-door')
    for side in [-1,1]:
        # Raised crown buttresses and horizontal service spines remain beyond
        # the chamber collision plane, clear of every patrol and jump path.
        for z in [24,44,76]:
            box(f'Crown_pressure_pier_{side}_{z}',[side*20.15-.15,0,z-.23],[side*20.15+.15,38,z+.23],'Alloy')
        for y in [3.35,15.0,30.15]:
            box(f'Crown_service_spine_{side}_{y}',[side*20.15-.15,y,18.3],[side*20.15+.15,y+.28,79.7],'Oxide' if y<4 else 'Alloy')
    for seat in LAYOUT[CURRENT].get('ceilingSeats',[]):
        lo=list(seat['lo']);lo[1]=38.025
        box('Crown_seat_'+seat['name'],lo,seat['hi'],'Alloy')
    for x in [-2.5,2.5]:block('Crown_cell_feed_collar_'+str(x),[.28,2.24,.28],[x,39.145,49],'Oxide')
    # One thick tapered collar owns the wall-to-airway join. The cinematic
    # liner starts beyond the wall; neither independently visible owner copies
    # the other's flat reveal planes.
    front=[(59.82,27.8),(63.18,27.8),(63.18,30.78),(59.82,30.78)]
    back=[(60.08,27.8175),(62.92,27.8175),(62.92,30.53),(60.08,30.53)]
    outer_front=[(59.54,27.5),(63.46,27.5),(63.46,31.05),(59.54,31.05)]
    outer_back=[(59.55,27.5),(63.45,27.5),(63.45,31.0),(59.55,31.0)]
    vv=[(x,y,z) for x,ring in [(20.25,front),(20.25,outer_front),(20.56,back),(20.56,outer_back)] for z,y in ring]
    ff=[]
    for i in range(4):
        j=(i+1)%4
        ff.extend([(i,j,j+8,i+8),(i+4,i+12,j+12,j+4),(i,i+4,j+4,j),(i+8,j+8,j+12,i+12)])
    mesh('Escape_tapered_wall_collar',vv,ff,'Alloy')
    # Wide, flush identification backs the pod without adding a second cage.
    label('Quarantine_identification','05 / QUARANTINE CROWN',[0,36.4,79.72],1.0)
    label('Quarantine_protocol','EXCLUSIVE NETWORKS / CELL ISOLATION',[0,35.65,79.72],.36)
    # Route labels are set into the duct's existing rear wall, not its floor.
    label('Fork_bob','ADHESIVE ACCESS  <',[-5.2,1.35,10.17],.23)
    label('Fork_goop','>  EFFLUENT CONTROL',[7.5,1.35,10.17],.23)
    print('Quarantine crown, two-body access and complete interceptor/return authored')

def quarantine_crown(spec):
    # A deep central containment coffer changes the high-room silhouette;
    # the perimeter grid still receives every existing suspension anchor.
    lo,hi=spec['lo'],spec['hi']
    for i,(a,b) in enumerate(intervals(lo[0],hi[0],4)):
        for j,(c,d) in enumerate(intervals(lo[2],hi[2],8)):
            deep=abs((a+b)/2)<8 and 32<c<64
            if not deep:
                roof({'name':f'Crown_perimeter_{i}_{j}','lo':[a,lo[1],c],'hi':[b,hi[1],d]});continue
            box(f'Crown_coffer_back_{i}_{j}',[a,40.5,c],[b,40.9,d],'Graphite')
            for x in [a,b-.17]:box(f'Crown_coffer_x_{i}_{j}_{x}',[x,38,c],[x+.17,40.5,d],'Alloy')
            for z in [c,d-.17]:box(f'Crown_coffer_z_{i}_{j}_{z}',[a+.17,38,z],[b-.17,40.5,z+.17],'Alloy')
            box(f'Crown_coffer_inner_{i}_{j}',[a+.20,40.26,c+.20],[b-.20,40.38,d-.20],'Cool')

def build_lift():
    """Travelling presentation is authored in its existing owner's local frame."""
    rigs=LAYOUT[CURRENT]['rigs']
    boarding='room-4-boarding-proximity-shutter'
    shared_boarding={'room-4-boarding-floor','room-4-boarding-ceiling','room-4-partition-0--3.7',
                     'room-4-partition-0-3.7','room-4-header-0','room-4-boarding-shaft-wall'}
    for side in [-1,1]:
        block(f'Shaft_outer_backing_{side}',[.26,76,16.85],[side*5.37,32,13.575],'Graphite')
        block(f'Boarding_side_return_{side}',[.5,186,5.15],[side*5.25,87,2.575],'Graphite')
    # Capped running wells let every scrolling cassette and departing boarding
    # assembly pass the fixed crown without intersecting its horizontal faces.
    box('Shaft_head_roof',[-4.88,44.2,5.15],[4.88,44.6,14.65],'Graphite')
    box('Shaft_upper_cap',[-5.5,70,5.15],[5.5,70.4,22],'Graphite')
    box('Boarding_upper_cap',[-5.5,180,0],[5.5,180.4,5.15],'Graphite')
    box('Boarding_crown_return',[-5.5,44.2,5.10],[5.5,180,5.15],'Graphite')
    for side in [-1,1]:
        # A 20 mm stepped reveal seats inside the neighbouring duct's wall,
        # clear of the carriage end caps and its independently owned rails.
        box(f'Arrival_wall_{side}',[-5.04 if side<0 else 1.12,-6,14.85],[-1.12 if side<0 else 5.04,70,15.025],'Graphite')
    box('Arrival_header',[-1.12,2.42,14.85],[1.12,70,15.025],'Graphite')
    for owner in ['room-4-boarding-floor','room-4-boarding-ceiling','room-4-partition-0--3.7',
                  'room-4-partition-0-3.7','room-4-header-0','room-4-boarding-shaft-wall',
                  'room-4-boarding-safety-guard','room-4-destination-vent-shutter','room-4-arrival-shield',
                  'room-4-boarding-shutter-panel']:
        original_owner=owner;spec=rigs[owner];lo=list(spec['lo']);hi=list(spec['hi'])
        if original_owner=='room-4-boarding-shaft-wall':lo[0]=-4.97;hi[0]=4.97
        if original_owner=='room-4-boarding-safety-guard':lo[0]=-4.95;hi[0]=4.95
        if owner in shared_boarding:
            offset=spec['matrix'][12:15];lo=[lo[i]+offset[i] for i in range(3)];hi=[hi[i]+offset[i] for i in range(3)]
            owner=boarding
            if original_owner.startswith('room-4-partition-'):lo[1]=.06
            if 'partition-' in original_owner or 'header-' in original_owner:lo[2]=.04
        box(original_owner+'_body',lo,hi,'Graphite',owner)
        axis=min(range(3),key=lambda i:hi[i]-lo[i])
        if axis==1:
            for i,(a,b) in enumerate(intervals(lo[0]+.06,hi[0]-.06,2)):
                for j,(c,d) in enumerate(intervals(lo[2]+.06,hi[2]-.06,2)):
                    bottom=lo[1] if 'floor' not in original_owner else hi[1]-.05
                    top=lo[1]+.05 if 'floor' not in original_owner else hi[1]
                    box(original_owner+f'_inset_{i}_{j}',[a+.015,bottom,c+.015],[b-.015,top,d-.015],
                        'Resin' if 'floor' in original_owner else 'Alloy',owner)
        else:
            for i,(a,b) in enumerate(intervals(lo[0]+.08,hi[0]-.08,2)):
                box(original_owner+f'_plate_{i}',[a+.02,lo[1]+.08,hi[2]-.04],[b-.02,hi[1]-.08,hi[2]],
                    'Cool' if 'guard' in original_owner or 'shutter' in original_owner else 'Ceramic',owner)
    owner='room-4-lift-floor';spec=rigs[owner]
    box('Lift_underframe',spec['lo'],spec['hi'],'Graphite',owner)
    for i,(a,b) in enumerate(intervals(-4.8,4.8,1.6)):
        for j,(c,d) in enumerate(intervals(-4.8,4.8,1.6)):
            left=a+(.30 if abs(a+4.8)<.001 else .025);right=b-(.30 if abs(b-4.8)<.001 else .025)
            box(f'Lift_load_plate_{i}_{j}',[left,.4,c+.025],[right,.44,d-.025],
                'Alloy' if (i+j)%4==0 else 'Resin',owner)
    for x in [-3.4,-1.7,0,1.7,3.4]:
        for z in [-3.5,-1.8,-.1,1.6,3.3]:
            for n in range(3):block(f'Lift_grip_{x}_{z}_{n}',[.8,.008,.024],[x,.444,z+n*.13],'Alloy',owner)
    for index in range(8):
        owner=f'room-4-shaft-module-{index}'
        for side in [-1,1]:
            for z in [7.5,11.5]:
                block(f'Module_{index}_cassette_{side}_{z}',[.10,6.5,3.45],[side*5.12,3.9,z],'Cool',owner)
                for y in [.65,7.15]:block(f'Module_{index}_crossrail_{side}_{z}_{y}',[.24,.18,3.5],[side*5.055,y,z],'Alloy',owner)
                for zz in [z-1.72,z+1.72]:block(f'Module_{index}_stanchion_{side}_{zz}',[.24,6.35,.16],[side*5.055,3.9,zz],'Oxide',owner)
                annulus_x(f'Module_{index}_hatch_{side}_{z}',side*5.0,3.8,z,.32,.56,.12,'Alloy',20,owner)
                tube(f'Module_{index}_hatch_core_{side}_{z}',(side*4.96,3.8,z),(side*5.08,3.8,z),.29,'Graphite',16,owner)
                for bolt in range(4):
                    angle=math.pi/4+bolt*math.pi/2
                    y=3.8+.50*math.sin(angle);zz=z+.50*math.cos(angle)
                    tube(f'Module_{index}_inspection_bolt_{side}_{z}_{bolt}',(side*4.925,y,zz),(side*4.985,y,zz),.055,'Oxide',6,owner)
                block(f'Module_{index}_fixture_seat_{side}_{z}',[.19,.2,1.3],[side*5.0775,6.35,z],'Graphite',owner)
        for x in [-3.05,3.05]:
            block(f'Module_{index}_rear_panel_{x}',[3.4,6.5,.09],[x,3.9,14.785],'Cool',owner)
            for y in [.65,7.15]:block(f'Module_{index}_rear_rail_{x}_{y}',[3.45,.18,.13],[x,y,14.765],'Alloy',owner)
            for xx in [x-1.7,x+1.7]:block(f'Module_{index}_rear_stile_{xx}',[.16,6.35,.13],[xx,3.9,14.765],'Oxide',owner)
            block(f'Module_{index}_rear_fixture_seat_{x}',[1.3,.2,.0725],[x,6.35,14.79375],'Graphite',owner)
    label('Lift_identification','04 / SERVICE DESCENT',[0,5.775,-.22],.32,finish='Ceramic',owner=boarding)
    reuse_lift_wheels()
    print('Lift built against',len(rigs),'existing pose owners; no animation tracks.')

def reuse_lift_wheels():
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=ROOT+'/assets/environments/containment-room-four/room-four-lift.glb')
    bpy.context.view_layer.update()
    source=bpy.data.objects['R4_Batch_Wheel_Alloy'];template=source.data.copy()
    template.transform(Matrix.Rotation(math.pi/2,4,'Z')@Matrix.Scale(1.5,4)@source.matrix_world)
    template.materials.clear();template.materials.append(material('Alloy'))
    colours=template.color_attributes.get('wear') or template.color_attributes.new(name='wear',type='FLOAT_COLOR',domain='POINT')
    for colour in colours.data:colour.color=(1,1,1,1)
    for x in [-4.65,4.65]:
        for z in [6,14]:
            owner=f'room-4-carriage-{x}-{z}';data=template.copy()
            for vertex in data.vertices:vertex.co.y+=-.42 if z==6 else .42
            obj=bpy.data.objects.new('C2_'+CURRENT+f'_Level_one_guide_wheel_{x}_{z}',data)
            bpy.context.scene.collection.objects.link(obj);obj.parent=owner_root(owner)
            obj['finish']='Alloy';obj['runtimeTarget']=owner;obj['visualOnly']=True
            obj['sourceAsset']='containment-room-four/R4_Wheel'
    for obj in set(bpy.data.objects)-before:
        if not obj.name.startswith('C2_'+CURRENT+'_'):bpy.data.objects.remove(obj,do_unlink=True)
    if template.users==0:bpy.data.meshes.remove(template)
    for blocks in [bpy.data.meshes,bpy.data.materials]:
        for block in list(blocks):
            if block.name.startswith('R4_') and block.users==0:blocks.remove(block)

def build_identity():
    if CURRENT=='room-1':
        label('Nursery_bay_ident','IRRIGATION  /  ISOLATE FEED',[-17.69,14.25,17.6],.35,(90,0,90),'Ceramic')
        label('Nursery_bay_warning','CONTAINMENT 01',[17.69,14.25,33.3],.43,(90,0,270),'Ceramic')
    elif CURRENT=='passage-1-2':
        return # The purpose-built passage owns its frames and identification.
    elif CURRENT=='room-2':
        return # The testing hall owns its equipment labels and metric scales.
    elif CURRENT in ('passage-2-3','bob-duct'):
        return # The filtration and duct builders own fitted identification.
    elif CURRENT=='room-3':
        label('Filter_sign','03  /  SECURITY FILTRATION',[0,9,71.72],.67)
        for side in [-1,1]:
            for z in [6,13,22,39,45,63,69]:
                block(f'Extraction_pier_{side}_{z}',[.24,28.7,.45],[side*23.92,15,z],'Alloy')
            for y in [1.4,12.4,23.4]:
                block(f'Extraction_manifold_{side}_{y}',[.22,.36,70.6],[side*23.91,y,36],'Oxide' if y<2 else 'Graphite')
        label('Extraction_header','EXTRACTION / NEGATIVE PRESSURE',[0,28.2,71.72],.45)
    print('Identity stage:',CURRENT)

def finalise_boxes():
    """Extract the union boundary, including faces inside the same batch.
    Separate runtimeTarget values are never clipped against one another.
    Editable source pieces and the export use these same repaired surfaces.
    """
    prefix='C2_'+CURRENT+'_'
    for o in list(bpy.context.scene.objects):
        if o.name.startswith(prefix+'Solid_'):bpy.data.objects.remove(o,do_unlink=True)
    triangles=0
    for index,s in enumerate(BOXES):
        vv=[];ff=[]
        for axis in range(3):
            u,v=[i for i in range(3) if i!=axis]
            for side in [-1,1]:
                plane=s['lo' if side<0 else 'hi'][axis]
                blockers=[]
                for k,o in enumerate(BOXES+OCCLUDERS):
                    if k==index or o['owner']!=s['owner']:continue
                    if not(o['lo'][axis]-1e-7<=plane<=o['hi'][axis]+1e-7):continue
                    if o['hi'][u]<=s['lo'][u]+1e-7 or o['lo'][u]>=s['hi'][u]-1e-7 or o['hi'][v]<=s['lo'][v]+1e-7 or o['lo'][v]>=s['hi'][v]-1e-7:continue
                    boundary=o['lo' if side<0 else 'hi'][axis]
                    # Later authored finish plates own coplanar coverage over
                    # an earlier structural backing, with exactly one face.
                    if abs(boundary-plane)<1e-7 and k<index:continue
                    blockers.append(o)
                us={s['lo'][u],s['hi'][u]};vs={s['lo'][v],s['hi'][v]}
                if CURRENT in ('escape-duct','room-1'):
                    # Every union patch shares the profile's crease grid,
                    # including caps/straps. Transforming unsplit contact faces
                    # would turn their T junctions into overlapping triangles.
                    cuts=({0:[20.3,21.7,45.8,46.6,49.4,50.2],1:[2.25,2.73]}
                        if CURRENT=='escape-duct' else {0:[-17.8,0,17.8],1:[15]})
                    us.update(p for p in cuts.get(u,[]) if s['lo'][u]<p<s['hi'][u])
                    vs.update(p for p in cuts.get(v,[]) if s['lo'][v]<p<s['hi'][v])
                for o in blockers:
                    us.update(max(s['lo'][u],min(s['hi'][u],o[e][u])) for e in ['lo','hi'])
                    vs.update(max(s['lo'][v],min(s['hi'][v],o[e][v])) for e in ['lo','hi'])
                us=sorted(us);vs=sorted(vs)
                for a,b in zip(us,us[1:]):
                    for c,d in zip(vs,vs[1:]):
                        if b-a<1e-7 or d-c<1e-7:continue
                        mu=(a+b)/2;mv=(c+d)/2
                        if any(o['lo'][u]-1e-7<=mu<=o['hi'][u]+1e-7 and o['lo'][v]-1e-7<=mv<=o['hi'][v]+1e-7 for o in blockers):continue
                        if CURRENT=='room-1' and 'ceiling' in s['name']:
                            centre=[0,0,0];centre[axis]=plane;centre[u]=mu;centre[v]=mv
                            # The new shaft owns the hole's vertical reveal.
                            # Ceiling top/underside coverage remains unchanged.
                            if axis==0 and min(abs(plane+12),abs(plane+8))<1e-6 and 2<centre[2]<6:continue
                            if axis==2 and min(abs(plane-2),abs(plane-6))<1e-6 and -12<centre[0]<-8:continue
                        start=len(vv)
                        for aa,bb in [(a,c),(b,c),(b,d),(a,d)]:
                            p=[0,0,0];p[axis]=plane;p[u]=aa;p[v]=bb;vv.append(p)
                        face=tuple(range(start,start+4))
                        normal=(Vector(vv[start+1])-Vector(vv[start])).cross(Vector(vv[start+2])-Vector(vv[start]))
                        if normal[axis]*side<0:face=tuple(reversed(face))
                        ff.append(face)
        if ff:
            if CURRENT=='room-1':vv,ff=nursery_floor_finish(s,vv,ff)
            obj=mesh('Solid_'+s['name'],vv,ff,s['finish'],s['owner'])
            whole_box=len(ff)==6 and all(any(abs(p[i]-s[end][i])<1e-7 for end in ['lo','hi']) for p in vv for i in range(3))
            if whole_box and any(token in s['name'] for token in ['_panel_','_cassette_']):
                bm=bmesh.new();bm.from_mesh(obj.data)
                # Metric dirt samples can create T junctions where density
                # changes. Never bevel a partial shell or a coplanar grid edge.
                sampled=CURRENT in ('room-1','room-2','passage-2-3','bob-duct') or (CURRENT=='passage-1-2' and s['name'].startswith('Hall_'))
                if not sampled or all(e.is_manifold for e in bm.edges):
                    edges=[e for e in bm.edges if e.is_manifold and (not sampled or e.calc_face_angle()>.01)]
                    bmesh.ops.bevel(bm,geom=edges,offset=.008,segments=1,affect='EDGES')
                    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data)
                bm.free()
            obj['authoredBounds']=s['lo']+s['hi'];triangles+=len(ff)*2
    print('Union boundary:',CURRENT,triangles,'quad-equivalent triangles')
    if CURRENT=='room-3':
        rotation=Matrix.Rotation(math.radians(18),3,'X')
        for obj in bpy.context.scene.objects:
            if obj.type=='MESH' and obj.name.startswith(prefix+'Solid_Extraction_hood_louvre_'):
                centre=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
                for vertex in obj.data.vertices:vertex.co=centre+rotation@(vertex.co-centre)
                obj.data.update()
    if CURRENT=='room-5':
        rotation=Matrix.Rotation(math.radians(32),3,'X')
        for obj in bpy.context.scene.objects:
            if obj.type=='MESH' and obj.name.startswith(prefix+'Solid_Quarantine_diaphragm_louvre_'):
                centre=sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
                for vertex in obj.data.vertices:vertex.co=centre+rotation@(vertex.co-centre)
                obj.data.update();obj['acceptedLouvreAngleDegrees']=32
    if CURRENT=='escape-duct':
        for obj in bpy.context.scene.objects:
            if obj.type!='MESH' or not obj.get('finish'):continue
            for vertex in obj.data.vertices:
                p=vertex.co
                if p.z<=2.25:continue
                transition=min(1,max(0,(p.x-20.3)/1.4))
                opening=min(1,max(0,max(46.6-p.x,p.x-49.4)/.8))
                spread=.6*min(1,(p.z-2.25)/.48)*transition*opening
                p.y-=spread*(-p.y-61.5)/1.42
            obj.data.update();obj['splayedUpperLinerMetres']=.6
    if CURRENT=='room-1':
        for obj in bpy.context.scene.objects:
            if obj.type=='MESH' and obj.name.startswith(prefix+'Solid_'):
                for vertex in obj.data.vertices:
                    vertex.co.z+=1.4*max(0,1-abs(vertex.co.x)/17.8)*max(0,(vertex.co.z-15)/4.8)
                obj.data.update()
        # Original ceiling mounts stay fixed. These static upper hangers bridge
        # the new service vault without touching a moving controller or rope.
        for index,(x,z) in enumerate([(-3,15.5),(2,25),(-1,35)]):
            low=19.82
            a=x-.32;b=x+.32;c=z-.32;d=z+.32
            high_a=19.8+1.4*(1-abs(a)/17.8);high_b=19.8+1.4*(1-abs(b)/17.8)
            mesh(f'Upper_hanger_{index}',[(a,low,c),(b,low,c),(b,high_b,c),(a,high_a,c),
                (a,low,d),(b,low,d),(b,high_b,d),(a,high_a,d)],
                [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],'Alloy')
        nursery_entry_vent()
        for index,(x,y,z) in enumerate([(-3,13,15.5),(2,15,25),(-1,12.5,35)],1):
            nursery_suspension(index,x,z,19.25-y-.3,f'cultivation-room-1-platform-{index}-soluble-rope')

def import_references():
    prefix='C2_'+CURRENT+'_'
    existing=bpy.data.collections.get(prefix+'References')
    if existing:return
    collection=bpy.data.collections.new(prefix+'References');bpy.context.scene.collection.children.link(collection)
    source=ROOT+'/artifacts/evidence/cultivation-blender/'+('references' if '--current-references' in sys.argv else 'baseline')+'/'+CURRENT+'.scene.json'
    data=json.load(open(source,encoding='utf8'))
    retired=set(LAYOUT[CURRENT]['retireNames'])
    prefixes=LAYOUT[CURRENT].get('retirePrefixes',[])
    subtrees=LAYOUT[CURRENT].get('retireSubtrees',[])
    for item in data['objects']:
        if item['name'].startswith('C2_'):continue
        if CURRENT=='room-1' and not item['name']:continue # Retired procedural platform preview parts.
        if not item['visible'] or item['name'].split('[')[0] in retired or item['name'].removesuffix('-surface-skin') in retired:continue
        if any('/'+name+'/' in item.get('path','') for name in subtrees):continue
        if any(item['name'].startswith(p) for p in prefixes):continue
        if 'contamination' in item['name'] or 'cultivation-room-1-cultivation-' in item['name']:continue
        if not item['vertices']:continue
        meshdata=bpy.data.meshes.new(prefix+'REF_'+item['name']);ii=item['indices']
        meshdata.from_pydata(item['vertices'],[],[ii[i:i+3] for i in range(0,len(ii),3)]);meshdata.update()
        obj=bpy.data.objects.new(prefix+'REF_'+item['name'],meshdata);collection.objects.link(obj)
        m=item['matrix'];convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
        obj.matrix_world=convert@Matrix([m[i::4] for i in range(4)])
        mat=bpy.data.materials.new(prefix+'REFmat_'+item['name']);mat.diffuse_color=(*item['materials'][0]['color'],1)
        meshdata.materials.append(mat);obj['referenceOnly']=True;obj.hide_render=True
    print('Production references:',len(collection.objects))

def frame(eye,target):
    area=next(a for a in bpy.context.window_manager.windows[0].screen.areas if a.type=='VIEW_3D');space=area.spaces.active
    space.clip_end=700;space.shading.type='MATERIAL';space.overlay.show_overlays=False
    eye=Vector(xyz(eye));target=Vector(xyz(target));direction=target-eye
    space.region_3d.view_rotation=direction.to_track_quat('-Z','Y')
    space.region_3d.view_perspective='PERSP';space.region_3d.view_location=target
    space.region_3d.view_distance=direction.length;space.lens=24
    # The native GUI needs an explicit view update after an MCP edit. A
    # background process has no GPU view matrix and must only save these fields.
    if not bpy.app.background:space.region_3d.update()

def export_asset(save=True):
    prefix='C2_'+CURRENT+'_';root=bpy.data.objects[prefix+'Architecture']
    bpy.context.view_layer.update()
    selected=list(bpy.context.selected_objects);active=bpy.context.view_layer.objects.active
    originals=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(prefix) and o.get('finish')]
    # Export copies are batched by existing runtime owner and finish. Originals
    # remain individually editable and already have the same union boundary.
    batches={};copies=[]
    for o in originals:
        key=(o.get('runtimeTarget',''),o.get('spatialRegion',''),o['finish'])
        batches.setdefault(key,[]).append(o)
    for o in bpy.context.selected_objects:o.select_set(False)
    for (owner,region,finish),objects in batches.items():
        parts=[]
        for o in objects:
            copy=o.copy();copy.data=o.data.copy();copy.parent=None
            parent_frame=owner_root(owner).matrix_world if owner else Matrix.Identity(4)
            copy.matrix_world=parent_frame.inverted()@o.matrix_world
            # Identity origins avoid rotated text becoming the numeric frame
            # of a room-sized batch and perturbing fitted contact edges.
            copy.data.transform(copy.matrix_world);copy.matrix_world=Matrix.Identity(4)
            bpy.context.scene.collection.objects.link(copy)
            parts.append(copy);copy.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join()
        joined=bpy.context.object;joined.name=prefix+'Batch_'+(owner or 'Architecture').replace('.','p')+('_'+region if region else '')+'_'+finish
        joined['finish']=finish;joined['runtimeTarget']=owner;joined['owner']=LAYOUT[CURRENT]['owner'];copies.append(joined)
        joined.select_set(False)
    for o in copies:o.select_set(True)
    destination=HERE+'/'+CURRENT
    # Directory creation belongs to the external CLI runner, never the MCP path.
    bpy.ops.export_scene.gltf(filepath=destination+'.glb',export_format='GLB',use_selection=True,use_active_scene=True,
        export_extras=True,export_cameras=False,export_lights=False,export_animations=False,
        export_materials='EXPORT',export_yup=True,export_vertex_color='NAME',export_vertex_color_name='wear',export_all_vertex_colors=False)
    for o in copies:
        data=o.data;bpy.data.objects.remove(o,do_unlink=True)
        if data.users==0:bpy.data.meshes.remove(data)
    for o in selected:
        if o.name in bpy.context.view_layer.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=active
    if save:bpy.ops.wm.save_as_mainfile(filepath=destination+'.blend')
    print('Exported editable-source boundary:',CURRENT,len(batches),'finish batches')

def build(room,refs=False):
    setup(room);build_enclosure();build_identity();finalise_boxes()
    if room=='room-1':
        # Accepted interactive Blender edit: one blade folds downward/outward.
        damaged=bpy.data.objects['C2_room-1_Solid_Return_filter_baffle_1_0']
        for vertex in damaged.data.vertices:
            fold=math.exp(-((vertex.co.x-3)/.55)**4)
            vertex.co.z-=.20*fold;vertex.co.y-=.18*fold
        damaged.data.update();damaged['damage']='Single bent return-air grille blade'
        # Reproject from final positions rather than retaining BMesh's bevel
        # interpolation, whose last UV bits depend on process allocation order.
        for obj in bpy.context.scene.objects:
            if obj.type=='MESH' and obj.get('finish'):
                for layer in obj.data.uv_layers:
                    for poly in obj.data.polygons:
                        axis=max(range(3),key=lambda i:round(abs(poly.normal[i]),5))
                        for index in poly.loop_indices:
                            p=obj.data.vertices[obj.data.loops[index].vertex_index].co
                            a,b=(p.y,p.z) if axis==0 else (p.x,p.z) if axis==1 else (p.x,p.y)
                            uv=(a/8+.13,b/8+.31) if obj['finish'] in ('Deck','Paint') else (a/2,b/2)
                            layer.data[index].uv=tuple(round(v,6) for v in uv)
    if room in ('passage-1-2','room-2','passage-2-3','bob-duct'):
        for obj in bpy.context.scene.objects:
            if obj.type!='MESH' or not obj.get('finish','').startswith(('Hall','Test')) or obj['finish'].endswith('Glass'):continue
            for layer in obj.data.uv_layers:
                for poly in obj.data.polygons:
                    axis=max(range(3),key=lambda i:round(abs(poly.normal[i]),5))
                    for index in poly.loop_indices:
                        p=obj.data.vertices[obj.data.loops[index].vertex_index].co
                        a,b=(p.y,p.z) if axis==0 else (p.x,p.z) if axis==1 else (p.x,p.y)
                        uv=(a/8+.13,b/8+.31) if obj['finish'].endswith(('Paint','Deck')) else (a/2,b/2)
                        layer.data[index].uv=tuple(round(v,6) for v in uv)
    if refs:import_references()

if '--cultivation-build' in sys.argv:
    # Remove only this headless factory process's starter objects. Its empty
    # Scene datablock is harmless and is never included in the selected export.
    if bpy.context.scene.name=='Scene':
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    room=sys.argv[sys.argv.index('--cultivation-build')+1]
    build(room,'--references' in sys.argv)
    viewpoints={
      'room-1':((-11,3.2,5.5),(0,8,28)),
      'passage-1-2':((1,2.5,3),(-1,2.5,25)),
      'room-2':((8,5,4),(-5,13,28)),
      'passage-2-3':((1,2.5,3),(-1,3,25)),
      'bob-duct':((0,1,3),(0,1,26)),
      'room-3':((1,5,3),(0,13,46)),
      'room-4':((0,3.8,6.1),(0,3,14.5)),
      'room-5':((-12,13,20),(0,26,50)),
      'escape-duct':((22,29.1,61.5),(43,29.1,61.5)),
    }
    frame(*viewpoints[room]);export_asset()
elif '--cultivation-reexport' in sys.argv:
    # Fast independent source/export check, without rebuilding the union. This
    # is distinct from a full generator regeneration and does not resave source.
    CURRENT=sys.argv[sys.argv.index('--cultivation-reexport')+1]
    bpy.ops.wm.open_mainfile(filepath=HERE+'/'+CURRENT+'.blend',load_ui=False,use_scripts=False)
    export_asset(save=False)
