import * as THREE from 'three';
import { canonicalShaderSource } from './ShaderStageSource.ts';

const BLOCK = 'SpecimenOutput';
const MARKER = ':shared-output-v1';
const toneSource = THREE.ShaderChunk.tonemapping_pars_fragment;
const neutral = toneSource.slice(toneSource.indexOf('vec3 NeutralToneMapping('), toneSource.indexOf('vec3 CustomToneMapping('))
  .replace('NeutralToneMapping', 'specimenNeutralToneMapping').replace('toneMappingExposure', 'specimenOutput.y');
const declaration = `layout(std140) uniform ${BLOCK} { vec4 specimenOutput; };\n${neutral}`;

/** Screen and refraction draws differ only at the final output conversion.
 * Share their lighting programs and select that conversion with a render-target
 * uniform block. The block also updates consecutive draws of one material,
 * independently of Three's material-uniform refresh cache. */
export class SharedOutputPrograms {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly gl: WebGL2RenderingContext;
  private readonly installed = new WeakSet<THREE.Material>();
  private readonly compiling = new WeakMap<object, number>();
  private bound = new WeakSet<WebGLProgram>();
  private validated = new WeakSet<WebGLProgram>();
  private buffers: WebGLBuffer[] = [];
  private readonly binding: number;
  private readonly values = new Float32Array(4);
  private readonly clear = new Float32Array([0, 0, 0, 1]);
  private lost = false;
  private readonly original: {
    compile: THREE.WebGLRenderer['compile']; render: THREE.WebGLRenderer['render'];
    direct: THREE.WebGLRenderer['renderBufferDirect']; target: THREE.WebGLRenderer['setRenderTarget'];
    useProgram: WebGL2RenderingContext['useProgram']; clearColor: WebGL2RenderingContext['clearColor'];
    parameter: WebGL2RenderingContext['getProgramParameter']; checkErrors: boolean;
    shaderSource: WebGL2RenderingContext['shaderSource'];
  };

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    const gl = this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.binding = gl.getParameter(gl.MAX_UNIFORM_BUFFER_BINDINGS) - 1;
    this.original = {compile: renderer.compile, render: renderer.render, direct: renderer.renderBufferDirect,
      target: renderer.setRenderTarget, useProgram: gl.useProgram, clearColor: gl.clearColor,
      parameter: gl.getProgramParameter, checkErrors: renderer.debug.checkShaderErrors, shaderSource: gl.shaderSource};
    // Validate links before reflection/use, and retrieve compiler logs only on
    // failure. Asking for successful compiler logs serializes driver work.
    renderer.debug.checkShaderErrors = false;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.initialize();
    const owner = this;
    gl.shaderSource = function(shader, source) {
      owner.original.shaderSource.call(this, shader, canonicalShaderSource(source));
    };
    gl.getProgramParameter = function(program, parameter) {
      if (parameter === this.ACTIVE_UNIFORMS || parameter === this.ACTIVE_ATTRIBUTES) owner.validate(program);
      return owner.original.parameter.call(this, program, parameter);
    };
    renderer.compile = function(scene, camera, targetScene) {
      scene.traverse(object => owner.installObject(object));
      if (targetScene?.overrideMaterial) owner.install(targetScene.overrideMaterial);
      if (scene instanceof THREE.Scene && scene.overrideMaterial) owner.install(scene.overrideMaterial);
      return owner.original.compile.call(this, scene, camera, targetScene);
    };
    renderer.renderBufferDirect = function(camera, scene, geometry, material, object, group) {
      owner.install(material);
      return owner.original.direct.call(this, camera, scene, geometry, material, object, group);
    };
    renderer.render = function(scene, camera) {
      owner.update();
      return owner.original.render.call(this, scene, camera);
    };
    renderer.setRenderTarget = function(target, face, mip) {
      owner.original.target.call(this, target, face, mip);
      owner.update(); owner.applyClear();
    };
    gl.useProgram = function(program) {
      if (program) owner.validate(program);
      owner.original.useProgram.call(this, program);
      if (program && !owner.bound.has(program) && !owner.lost) {
        const index = this.getUniformBlockIndex(program, BLOCK);
        if (index !== this.INVALID_INDEX) this.uniformBlockBinding(program, index, owner.binding);
        owner.bound.add(program);
      }
    };
    gl.clearColor = function(r, g, b, a) {
      owner.clear.set([r, g, b, a]); owner.applyClear();
    };
    renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    renderer.domElement.addEventListener('webglcontextrestored', this.contextRestored);
  }

  private installObject(object: THREE.Object3D): void {
    const material = (object as THREE.Mesh).material;
    if (Array.isArray(material)) material.forEach(value => this.install(value));
    else if (material) this.install(material);
  }

  private install(material: THREE.Material): void {
    if (this.installed.has(material)) return;
    this.installed.add(material);
    // Materials can survive a level handoff. Their hooks retain only this
    // weak nesting tracker, never the renderer or its context-owned resources.
    const compiling = this.compiling;
    const wrapCompile = (hook: THREE.Material['onBeforeCompile']): THREE.Material['onBeforeCompile'] => function(this: THREE.Material, shader, renderer) {
      const depth = compiling.get(shader) ?? 0;
      compiling.set(shader, depth + 1);
      try { hook.call(this, shader, renderer); }
      finally { if (depth) compiling.set(shader, depth); else compiling.delete(shader); }
      if (depth || shader.fragmentShader.includes(`uniform ${BLOCK}`) || !shader.fragmentShader.includes('#include <colorspace_fragment>')) return;
      shader.fragmentShader = declaration + shader.fragmentShader
        .replace('#include <tonemapping_fragment>', this.toneMapped
          ? 'if ( specimenOutput.x > 0.5 ) gl_FragColor.rgb = specimenNeutralToneMapping( gl_FragColor.rgb );' : '')
        .replace('#include <colorspace_fragment>', 'if ( specimenOutput.x > 0.5 ) gl_FragColor = sRGBTransferOETF( gl_FragColor );');
    };
    const wrapKey = (hook: THREE.Material['customProgramCacheKey']): THREE.Material['customProgramCacheKey'] => function(this: THREE.Material) {
      return hook.call(this).replaceAll(/:shared-output-v1:(true|false)/g, '') + MARKER + ':' + this.toneMapped;
    };
    let compileHook = material.onBeforeCompile;
    const defaultKey = () => compileHook.toString();
    const selectKey = (hook: THREE.Material['customProgramCacheKey']) =>
      wrapKey(hook === THREE.Material.prototype.customProgramCacheKey ? defaultKey : hook);
    let compile = wrapCompile(compileHook);
    let key = selectKey(material.customProgramCacheKey);
    // Level lighting/deformation hooks can be installed after an earlier
    // presentation draw. Apply output conversion after their whole chain,
    // retaining the standard include points until the outermost hook returns.
    Object.defineProperties(material, {
      onBeforeCompile: {configurable:true,enumerable:true,get:()=>compile,set:(hook: THREE.Material['onBeforeCompile'])=>{compileHook=hook;compile=wrapCompile(hook);}},
      customProgramCacheKey: {configurable:true,enumerable:true,get:()=>key,set:(hook: THREE.Material['customProgramCacheKey'])=>{key=selectKey(hook);}},
    });
    material.needsUpdate = true;
  }

  private initialize(): void {
    const gl = this.gl;
    this.buffers = [0, 1].map(screen => {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('Could not allocate render output state.');
      gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
      gl.bufferData(gl.UNIFORM_BUFFER, new Float32Array([screen, this.renderer.toneMappingExposure, 0, 0]), gl.DYNAMIC_DRAW);
      return buffer;
    });
    this.values.fill(-1); this.bound = new WeakSet(); this.validated = new WeakSet(); this.update();
  }

  private validate(program: WebGLProgram): void {
    if (this.lost || this.validated.has(program)) return;
    const gl = this.gl;
    if (!this.original.parameter.call(gl, program, gl.LINK_STATUS)) {
      const shaders = gl.getAttachedShaders(program) ?? [];
      const diagnostics = [gl.getProgramInfoLog(program), ...shaders.map(shader => gl.getShaderInfoLog(shader))].filter(Boolean).join('\n');
      throw new Error(`Shader preparation failed:\n${diagnostics}`);
    }
    this.validated.add(program);
  }

  private update(): void {
    if (this.lost) return;
    const screen = this.renderer.getRenderTarget() === null ? 1 : 0, exposure = Math.fround(this.renderer.toneMappingExposure);
    if (this.values[0] === screen && this.values[1] === exposure) return;
    const gl = this.gl;
    if (this.values[1] !== exposure) {
      this.values[1] = exposure;
      // Linear captures never tone-map. Only the screen buffer uses exposure.
      gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffers[1]);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 4, this.values.subarray(1, 2));
    }
    if (this.values[0] !== screen) gl.bindBufferBase(gl.UNIFORM_BUFFER, this.binding, this.buffers[screen]);
    this.values[0] = screen;
  }

  private applyClear(): void {
    // Three now supplies working-space clear colours for both targets. Match
    // its former sRGB screen clear without changing linear capture clears.
    const transfer = (value: number) => value < .0031308 ? value * 12.92 : 1.055 * Math.pow(value, .41666) - .055;
    const screen = this.renderer.getRenderTarget() === null;
    const [r, g, b, a] = this.clear;
    this.original.clearColor.call(this.gl, screen ? transfer(r) : r, screen ? transfer(g) : g, screen ? transfer(b) : b, a);
  }

  private readonly contextLost = (): void => { this.lost = true; };
  private readonly contextRestored = (): void => { this.lost = false; this.initialize(); this.applyClear(); };

  dispose(): void {
    const {renderer, gl, original} = this;
    renderer.compile = original.compile; renderer.render = original.render; renderer.renderBufferDirect = original.direct;
    renderer.setRenderTarget = original.target; gl.useProgram = original.useProgram; gl.clearColor = original.clearColor;
    gl.getProgramParameter = original.parameter; renderer.debug.checkShaderErrors = original.checkErrors;
    gl.shaderSource = original.shaderSource;
    renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    renderer.domElement.removeEventListener('webglcontextrestored', this.contextRestored);
    for (const buffer of this.buffers) gl.deleteBuffer(buffer);
    this.buffers.length = 0;
  }
}
