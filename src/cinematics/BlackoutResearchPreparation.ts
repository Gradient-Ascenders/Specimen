import * as THREE from 'three';

export function preserveResearchPresentation(scene: THREE.Object3D): () => void {
  const objects: { object: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3;
    visible: boolean; matrix: THREE.Matrix4; world: THREE.Matrix4; layers: number; instance?: Float32Array;
    colors?: Float32Array; count?: number; intensity?: number; lightColor?: THREE.Color }[] = [];
  const materials = new Map<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean; colorWrite: boolean;
    emissive?: number; uniforms?: Record<string, unknown> }>();
  const uniformCopy = (value: unknown): unknown => value instanceof THREE.Vector2 || value instanceof THREE.Vector3 ||
    value instanceof THREE.Vector4 || value instanceof THREE.Color || value instanceof THREE.Matrix3 || value instanceof THREE.Matrix4 ||
    value instanceof THREE.Quaternion ? value.clone() : value;
  scene.traverse(object => {
    const instanced = object instanceof THREE.InstancedMesh ? object : undefined;
    const light = object instanceof THREE.Light ? object : undefined;
    objects.push({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(),
      visible: object.visible, matrix: object.matrix.clone(), world: object.matrixWorld.clone(), layers: object.layers.mask,
      ...(instanced ? { instance: new Float32Array(instanced.instanceMatrix.array),
        ...(instanced.instanceColor ? { colors: new Float32Array(instanced.instanceColor.array) } : {}), count: instanced.count } : {}),
      ...(light ? { intensity: light.intensity, lightColor: light.color.clone() } : {}) });
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
    for (const material of [object.material].flat()) if (!materials.has(material)) materials.set(material, {
      opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite, colorWrite: material.colorWrite,
      ...(material instanceof THREE.MeshStandardMaterial ? { emissive: material.emissiveIntensity } : {}),
      ...(material instanceof THREE.ShaderMaterial ? { uniforms: Object.fromEntries(Object.entries(material.uniforms).map(([k, u]) => [k, uniformCopy(u.value)])) } : {}),
    });
  });
  return () => {
    for (const snapshot of objects) {
      const object = snapshot.object;
      object.position.copy(snapshot.position); object.quaternion.copy(snapshot.quaternion); object.scale.copy(snapshot.scale);
      object.visible = snapshot.visible; object.matrix.copy(snapshot.matrix); object.matrixWorld.copy(snapshot.world); object.layers.mask = snapshot.layers;
      if (object instanceof THREE.InstancedMesh && snapshot.instance) {
        object.instanceMatrix.array.set(snapshot.instance); object.instanceMatrix.needsUpdate = true; object.count = snapshot.count!;
        if (snapshot.colors && object.instanceColor) { object.instanceColor.array.set(snapshot.colors); object.instanceColor.needsUpdate = true; }
      }
      if (object instanceof THREE.Light) { object.intensity = snapshot.intensity!; object.color.copy(snapshot.lightColor!); }
    }
    for (const [material, snapshot] of materials) {
      material.opacity = snapshot.opacity; material.transparent = snapshot.transparent;
      material.depthWrite = snapshot.depthWrite; material.colorWrite = snapshot.colorWrite;
      if (material instanceof THREE.MeshStandardMaterial) material.emissiveIntensity = snapshot.emissive!;
      if (material instanceof THREE.ShaderMaterial && snapshot.uniforms) for (const [key, value] of Object.entries(snapshot.uniforms)) material.uniforms[key]!.value = value;
    }
  };
}
