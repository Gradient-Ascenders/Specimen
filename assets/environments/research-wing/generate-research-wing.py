import bpy
import math
import os
import sys
from mathutils import Vector


OUTPUT = os.path.dirname(os.path.abspath(__file__))
SCENE_NAME = "Bob_Research_Wing"
HALL_EXTENSION = 24


def stage_z(z):
    return z - HALL_EXTENSION * max(0, min(1, (84 - z) / 54))


def build():
    scene = bpy.data.scenes.new(SCENE_NAME)
    bpy.context.window.scene = scene
    scene.unit_settings.system = 'METRIC'
    scene.world = bpy.data.worlds.new("Research_Studio_World")
    scene.world.color = (.12, .15, .17)
    static = bpy.data.collections.new("ResearchWing_Static")
    scene.collection.children.link(static)
    lamps = bpy.data.collections.new('ResearchWing_LightFixtures')
    scene.collection.children.link(lamps)
    zone = 'Gallery'
    materials = {}
    palette = {
        'Ceramic': ((.72, .80, .81), .22, .48),
        'Panel': ((.43, .54, .58), .36, .55),
        'Alloy': ((.16, .22, .27), .72, .34),
        'Graphite': ((.018, .032, .042), .48, .48),
        'Teal': ((.025, .43, .48), .35, .4),
        'Amber': ((.68, .31, .045), .3, .5),
        'Light': ((.55, .94, 1), .15, .3),
        'Emergency': ((.8, .025, .012), .1, .4),
        'GlassBlue': ((.19, .58, .64), .18, .2),
        'Porcelain': ((.88, .9, .84), .05, .32),
    }
    for name, (color, metal, rough) in palette.items():
        mat = bpy.data.materials.new("Research_" + name)
        mat.diffuse_color = (*color, 1)
        mat.use_nodes = True
        mat.use_backface_culling = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        bsdf.inputs['Metallic'].default_value = metal
        bsdf.inputs['Roughness'].default_value = rough
        if name in ('Light', 'Emergency'):
            bsdf.inputs['Emission Color'].default_value = (*color, 1)
            bsdf.inputs['Emission Strength'].default_value = 2.8
        materials[name] = mat

    def box(name, size, pos, finish='Ceramic', bevel=.025, collection=static):
        front, back = stage_z(pos[2] - size[2] / 2), stage_z(pos[2] + size[2] / 2)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(pos[0], -(front + back) / 2, pos[1]))
        obj = bpy.context.object
        obj.name = name
        obj.dimensions = (size[0], back - front, size[1])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        for col in list(obj.users_collection):
            col.objects.unlink(obj)
        collection.objects.link(obj)
        obj['zone'] = zone
        obj.data.materials.append(materials[finish])
        if bevel:
            modifier = obj.modifiers.new('Machined edges', 'BEVEL')
            modifier.width = min(bevel, min(size) * .2)
            modifier.segments = 2
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        return obj

    def cylinder(name, radius, height, pos, finish='Alloy', rotation=None):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=height, location=(pos[0], -stage_z(pos[2]), pos[1]))
        obj = bpy.context.object
        obj.name = name
        for col in list(obj.users_collection):
            col.objects.unlink(obj)
        static.objects.link(obj)
        obj.data.materials.append(materials[finish])
        obj['zone'] = zone
        if rotation:
            obj.rotation_euler = rotation
        return obj

    def lab_station(side, z, index):
        x = side * 6.9
        cylinder('Centrifuge_Base', .32, .22, (x, 1.28, z + 1.05), 'Alloy')
        cylinder('Centrifuge_Lid', .29, .11, (x, 1.45, z + 1.05), 'Porcelain')
        box('Centrifuge_Control', (.16, .07, .12), (x - side * .22, 1.43, z + .84), 'Teal')
        box('Microscope_Foot', (.43, .09, .5), (x, 1.23, z - 1.1), 'Porcelain')
        arm = box('Microscope_Arm', (.11, .62, .13), (x + side * .13, 1.55, z - 1.05), 'Alloy')
        arm.rotation_euler[1] = side * .25
        box('Microscope_Stage', (.32, .06, .3), (x - side * .05, 1.45, z - 1.15), 'Graphite')
        cylinder('Microscope_Lens', .085, .32, (x - side * .08, 1.83, z - 1.12), 'Graphite')
        cylinder('Specimen_Tray', .08, .035, (x - side * .05, 1.5, z - 1.15), 'GlassBlue')
        box('Tube_Rack', (.35, .12, .8), (x + side * .3, 1.24, z), 'Porcelain')
        for i in range(5):
            cylinder('Test_Tube', .035, .28 + i % 2 * .05, (x + side * .3, 1.42, z - .28 + i * .14), 'GlassBlue')
            cylinder('Test_Tube_Cap', .041, .04, (x + side * .3, 1.58 + i % 2 * .025, z - .28 + i * .14), 'Teal')
        for dz in [-1.4, 1.4]:
            for y in [.28, .48, .68]:
                box('Cabinet_Drawer_Seam', (.012, .012, .95), (side * 6.475, y, z + dz), 'Panel', 0)
        if index % 2 == 0:
            box('Lab_Trolley', (.8, .07, 1.1), (side * 5.9, .85, z + 2.4), 'Alloy')
            box('Lab_Trolley_Lower', (.8, .07, 1.1), (side * 5.9, .28, z + 2.4), 'Panel')
            for dx in [-.32, .32]:
                for dz in [-.45, .45]:
                    cylinder('Trolley_Leg', .035, .75, (side * 5.9 + dx, .5, z + 2.4 + dz))
                    cylinder('Trolley_Wheel', .075, .08, (side * 5.9 + dx, .1, z + 2.4 + dz), 'Graphite', (math.pi / 2, 0, 0))

    def frame(name, x, y, z, width, height, axis='z'):
        if axis == 'x':
            box(name + '_back', (.16, height + .28, width + .28), (x, y, z), 'Graphite')
            for sy in [-1, 1]:
                box(name + '_rim', (.24, .11, width + .3), (x, y + sy * (height / 2 + .09), z), 'Alloy')
            for sz in [-1, 1]:
                box(name + '_rim', (.24, height + .2, .11), (x, y, z + sz * (width / 2 + .09)), 'Alloy')
        else:
            box(name + '_back', (width + .28, height + .28, .16), (x, y, z), 'Graphite')
            for sy in [-1, 1]:
                box(name + '_rim', (width + .3, .11, .24), (x, y + sy * (height / 2 + .09), z), 'Alloy')
            for sx in [-1, 1]:
                box(name + '_rim', (.11, height + .2, .24), (x + sx * (width / 2 + .09), y, z), 'Alloy')

    box('Research_Floor', (16.4, .3, 33), (0, -.15, 14.5))
    box('Research_Ceiling', (16.4, .3, 33), (0, 8.15, 14.5), 'Panel')
    for side in [-1, 1]:
        box('Entrance_Outer_Pier', (.75, 8, .35), (side * 7.85, 4, -2.04))
        box('Entrance_Inner_Pier', (.5, 8, .35), (side * 3.75, 4, -2.04), 'Panel')
        box('Entrance_Bay_Plinth', (3.35, 3.3, .35), (side * 5.6, 1.65, -2.04))
        box('Entrance_Bay_Header', (3.35, 1.1, .35), (side * 5.6, 7.45, -2.04))
        box('Launch_Bay_Back', (3.6, 8, .3), (side * 5.6, 4, -6.6), 'Graphite')
        for dx in [-1.85, 1.85]:
            box('Launch_Bay_Side', (.2, 8, 4.8), (side * 5.6 + dx, 4, -4.2), 'Panel')
        box('Launch_Bay_Ceiling', (3.8, .3, 4.8), (side * 5.6, 8.15, -4.2), 'Panel')
        box('Launch_Bay_Floor', (3.8, .3, 4.8), (side * 5.6, 3.15, -4.2), 'Alloy')
        box('Launch_Bay_Guide', (.07, 2.5, .08), (side * 7.2, 5.05, -2.3), 'Light', 0)
        cylinder('Gas_Cylinder', .28, 1.7, (side * 7.15, .95, 27.7), 'Porcelain')
        cylinder('Gas_Regulator', .08, .25, (side * 7.15, 1.92, 27.7), 'Alloy')
        box('Gas_Manifold', (.45, .6, .15), (side * 7.75, 2.2, 27.7), 'Alloy')
        for z in [8, 15, 22]:
            box('Wall_Utility_Rail', (.12, .08, 5.8), (side * 7.85, 1.8, z), 'Alloy')
    box('Entrance_Door_Header', (7.15, 1.1, .35), (0, 7.45, -2.04), 'Panel')
    box('Director_Bay_Back', (7.3, 8, .3), (0, 4, -6.7), 'Graphite')
    box('Director_Bay_Ceiling', (7.4, .3, 4.8), (0, 8.15, -4.3), 'Panel')
    box('Director_Bay_Floor', (7.4, .3, 4.8), (0, -.15, -4.3), 'Alloy')
    shutters = bpy.data.collections.new('ResearchWing_LaunchShutters')
    scene.collection.children.link(shutters)
    for side, name in [(-1, 'Left'), (1, 'Right')]:
        box('Research_Bay_Gallery_' + name, (3.3, 3.5, .19), (side * 5.6, 5.1, -2.1), 'Alloy', .03, shutters)
    box('Research_Bay_Director', (7.1, 6.8, .2), (0, 3.4, -2.1), 'Panel', .04, shutters)
    for side in [-1, 1]:
        if side == -1:
            box('Gallery_West', (.32, 8, 33), (side * 8.1, 4, 14.5))
        else:
            box('Gallery_East_Front', (.32, 8, 24), (8.1, 4, 10))
            box('Gallery_East_Rear', (.32, 8, 3), (8.1, 4, 29.5))
            box('Side_Exit_Lintel', (.32, 2, 6), (8.1, 7, 25))
        for z in [1, 7, 13, 19, 25, 30]:
            box('Gallery_Wall_Brace', (.19, 7.6, .18), (side * 7.88, 4, z), 'Panel')
        box('Gallery_Skirting', (.1, .32, 32), (side * 7.88, .25, 14.5), 'Graphite')
        for index, z in enumerate([5, 12, 19]):
            frame('Side_Research_Monitor', side * 7.63, 3.3, z, 3.8, 2.22, 'x')
            box('Monitor_Conduit', (.13, 3.2, .12), (side * 7.8, 6.25, z), 'Alloy')
            box('Lab_Worktop', (1.45, .13, 4.4), (side * 7.05, 1.1, z), 'Graphite')
            for dz in [-1.4, 1.4]:
                box('Cabinet_Base', (1.2, .85, 1.2), (side * 7.1, .48, z + dz))
                box('Cabinet_Handle', (.035, .035, .48), (side * 6.48, .7, z + dz), 'Alloy')
            for i in range(4):
                box('Sample_Cartridge', (.14, .32 + i % 2 * .1, .14), (side * 6.85, 1.34, z - .7 + i * .42), 'Teal', .04)
            lab_station(side, z, index)
        for z in [2, 25]:
            box('Vent_Recess', (.2, 1.5, 2.1), (side * 7.88, 6.5, z), 'Graphite')
            for i in range(6):
                box('Vent_Louvre', (.12, .085, 1.85), (side * 7.73, 5.94 + i * .21, z), 'Alloy')
        for z in [4, 11, 18, 25]:
            box('Floor_Path_Guide', (.1, .013, 3.9), (side * 4.9, .014, z), 'Teal', 0)
            box('Service_Trench', (.44, .014, 3.9), (side * 5.6, .015, z), 'Alloy', 0)
    box('Gallery_End_Wall', (16.4, 8, .32), (0, 4, 31.05))
    frame('Catastrophic_Display', 0, 4.2, 30.77, 10.8, 5.1)
    for side in [-1, 1]:
        box('Display_Power_Trunk', (.18, 7.5, .22), (side * 6, 4, 30.8), 'Graphite')
        for i in range(4):
            box('Display_Power_Cell', (.65, .8, .5), (side * 6.7, 1.2 + i * 1.25, 30.7), 'Teal')
        box('Bio_Incubator_Base', (1.4, .3, 1.6), (side * 5.55, .2, 28.6), 'Alloy')
        box('Bio_Incubator_Housing', (1.4, 2.2, 1.4), (side * 5.55, 1.4, 28.8), 'Porcelain')
        box('Bio_Incubator_Window', (1.08, 1.55, .06), (side * 5.55, 1.5, 28.06), 'GlassBlue')
        for i in range(3):
            cylinder('Incubator_Sample', .08, .22, (side * 5.55 - .32 + i * .32, 1.3, 28.02), 'Teal')
    for z in [4, 12, 20, 25]:
        box('Gallery_Light_Housing', (7.6, .2, .65), (0, 7.85, z), 'Graphite')
        box('Research_GalleryLamp_' + str(z), (7.15, .05, .45), (0, 7.72, z), 'Light', 0, lamps)
        for side in [-1, 1]:
            box('Ceiling_Suspension', (.055, .28, .055), (side * 3.3, 8, z), 'Alloy')
    zone = 'Hall'
    box('Emergency_Side_Exit_Floor', (12.2, .3, 8), (14.3, -.15, 26))
    box('Emergency_Side_Exit_Ceiling', (12.2, .3, 8), (14.3, 8.15, 26), 'Panel')
    box('Side_Exit_Front_Return', (12, 8, .3), (14, 4, 22))
    box('Side_Exit_Back_Return', (4, 8, .3), (10, 4, 30))
    box('Side_Exit_End_Wall', (.3, 8, 8), (20.1, 4, 26))
    box('Side_Exit_Height_Transition', (8.4, 1.5, .3), (16, 7.4, 30), 'Panel')
    box('Hall_Floor', (8.4, .3, 54), (16, -.15, 57))
    box('Hall_Ceiling', (8.4, .3, 54), (16, 6.75, 57), 'Panel')
    for side in [-1, 1]:
        for z in range(34, 86, 8):
            start, end = max(30, z - 4), min(84, z + 4)
            if z == 50:
                box('Hall_Drone_Port_Lower', (.3, 2.5, 8), (16 + side * 4.1, 1.25, z))
                box('Hall_Drone_Port_Header', (.3, 1.3, 8), (16 + side * 4.1, 5.95, z))
                for dz in [-3.7, 3.7]:
                    box('Hall_Drone_Port_Jamb', (.3, 2.8, .6), (16 + side * 4.1, 3.9, z + dz), 'Panel')
                box('Hall_Drone_Bay_Back', (.3, 4.2, 7.2), (16 + side * 6.6, 3.7, z), 'Panel')
                for dz in [-3.6, 3.6]:
                    box('Hall_Drone_Bay_Side', (2.7, 4.2, .2), (16 + side * 5.5, 3.7, z + dz), 'Panel')
                for y in [1.6, 5.8]:
                    box('Hall_Drone_Bay_Cap', (2.7, .2, 7.2), (16 + side * 5.5, y, z), 'Alloy')
                box('Research_Bay_Hall_' + ('Left' if side < 0 else 'Right'), (.20, 2.68, 6.68), (16 + side * 4.16, 3.9, z), 'Alloy', .025, shutters)
                continue
            box('Hall_Wall_Module', (.3, 6.6, end - start), (16 + side * 4.1, 3.3, (start + end) / 2))
            box('Hall_Observation_Backing', (.12, 2.7, 3.5), (16 + side * 3.9, 3.2, z), 'Graphite')
            for dy in [-1.4, 1.4]:
                box('Hall_Window_Rail', (.19, .12, 3.7), (16 + side * 3.78, 3.2 + dy, z), 'Alloy')
            for dz in [-1.8, 1.8]:
                box('Hall_Window_Jamb', (.19, 2.9, .12), (16 + side * 3.78, 3.2, z + dz), 'Alloy')
            box('Hall_Window_Inner', (.05, 2.4, 3.2), (16 + side * 3.7, 3.2, z), 'Teal', 0)
            box('Hall_Module_Pillar', (.3, 6.4, .25), (16 + side * 3.91, 3.25, end - .2), 'Panel')
        for z in [30, 44, 58, 72, 84]:
            box('Hall_Path_Guide', (.08, .014, 10), (16 + side * 2.9, .014, z), 'Teal', 0)
    for z in range(30, 88, 6):
        box('Hall_Light_Backing', (5.7, .16, .4), (16, 6.5, z), 'Graphite')
        box('Research_HallLamp_' + str(z), (5.3, .04, .25), (16, 6.39, z), 'Light', 0, lamps)
    box('Trap_Floor', (12, .3, 11), (16, -.15, 89.5))
    box('Trap_Ceiling', (12, .3, 12), (16, 9.15, 90), 'Panel')
    box('Trap_Entrance_Upper_Return', (8.2, 2.4, .3), (16, 7.8, 84), 'Panel')
    for side in [-1, 1]:
        box('Trap_Entrance_Return', (2.05, 9, .3), (16 + side * 5, 4.5, 84))
        box('Trap_Wall', (.3, 9, 12), (16 + side * 6, 4.5, 90))
        box('Door_Flank', (3.8, 9, .55), (16 + side * 4.1, 4.5, 94.5), 'Panel')
        for y in [1.2, 3.4, 5.6]:
            box('Trap_Energy_Conduit', (.18, .18, 9.5), (16 + side * 5.8, y, 89), 'Teal')
    box('Door_Header', (4.4, 2.5, .6), (16, 7.8, 94.5), 'Alloy')
    door = bpy.data.collections.new('ResearchWing_DeadEndDoor')
    scene.collection.children.link(door)
    box('Research_DeadEndDoor', (4.2, 6.6, .48), (16, 3.3, 94.5), 'Alloy', .04, door)
    for x in [15, 17]:
        box('Research_Door_Armour', (1.85, 5.8, .12), (x, 3.35, 94.18), 'Panel', .025, door)
    for y in [.7, 5.9]:
        box('Research_Door_Caution', (3.9, .12, .06), (16, y, 94.08), 'Amber', 0, door)
    zone = 'Overlook'
    box('Research_OverlookSeal', (4.2, 6.6, .2), (16, 9.95, 95), 'Alloy', .03, shutters)
    box('Upper_Observation_Floor', (16, .3, 16.5), (16, -.15, 103.25))
    box('Upper_Observation_Ceiling', (16, .3, 17), (16, 10.15, 103), 'Panel')
    for side in [-1, 1]:
        box('Observation_Back_Wall', (5.85, 10, .32), (16 + side * 5.1, 5, 94.8))
        box('Upper_Observation_Wall', (.3, 10, 17), (16 + side * 8, 5, 103))
        box('Upper_Glass_Jamb', (.3, 9.8, .3), (16 + side * 7.7, 5, 111.3), 'Alloy')
        for z in [98, 104, 109]:
            box('Observation_Pillar', (.45, 9.8, .3), (16 + side * 7.7, 5, z), 'Panel')
        box('Observation_Safety_Kerb', (.3, .45, 16.5), (16 + side * 7.7, .2, 102.8), 'Alloy')
        box('Observation_Service_Console', (1.4, .9, 2), (16 + side * 6.8, .5, 107.5), 'Panel')
        for z in [97, 103, 109]:
            box('Observation_Exterior_Support', (.45, 3.84, .6), (16 + side * 7.3, -2, z), 'Alloy')
    box('Observation_Door_Lintel', (4.35, 3.35, .35), (16, 8.3, 94.8), 'Panel')
    box('Upper_Glass_Header', (15.7, .3, .3), (16, 9.9, 111.3), 'Alloy')
    box('Upper_Glass_Sill', (15.7, .16, .26), (16, .05, 111.3), 'Alloy')
    for z in [98, 105]:
        box('Observation_Light_Housing', (10, .22, .8), (16, 9.83, z), 'Graphite')
        box('Research_OverlookLamp_' + str(z), (9.6, .04, .6), (16, 9.68, z), 'Light', 0, lamps)

    for section in ['Gallery', 'Hall', 'Overlook']:
        for mat in materials.values():
            meshes = [o for o in static.objects if o.type == 'MESH' and o.get('zone') == section and o.data.materials and o.data.materials[0] == mat]
            if not meshes:
                continue
            bpy.ops.object.select_all(action='DESELECT')
            for obj in meshes:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = meshes[0]
            bpy.ops.object.join()
            bpy.context.object.name = 'Research_' + section + '_' + mat.name
    for obj in static.objects:
        obj['asset'] = 'bob-research-wing-v5'
    scene.render.engine = 'CYCLES'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 24
    scene['asset'] = 'bob-research-wing-v5'
    scene['three_up'] = '+Y'
    scene['three_forward'] = '+Z'
    scene['gallery_dimensions'] = [16, 8, 33]
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUTPUT, 'research-wing.glb'), export_format='GLB',
        use_selection=True, use_active_scene=True, export_yup=True, export_cameras=False, export_lights=False, export_extras=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTPUT, 'research-wing.blend'))
    print('RESEARCH_WING_EXPORTED', len(scene.objects))


if __name__ == '__main__':
    build()
