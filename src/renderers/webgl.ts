import type { FitMode } from '../types'
import { LIGHT_X, LIGHT_Y } from '../lighting'
import { imageSize } from './types'
import type { ImageSrc, RenderParams, Renderer } from './types'

const VERT = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// Mirrors shade() in lighting.ts.
const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uField;
uniform sampler2D uImage;
uniform vec2 uRes;
uniform ivec2 uGrid;
uniform vec2 uLight;
uniform float uGain;
uniform float uCaustic;
uniform vec2 uRefract;
uniform vec4 uColor;
uniform vec3 uHi;
uniform vec3 uSh;
uniform float uOpacity;
uniform int uHasImage;
uniform vec2 uImgScale;
uniform float uContain;
out vec4 outColor;

vec4 fieldAt(vec2 uv) {
  vec2 g = uv * vec2(uGrid) - 0.5;
  vec2 f0 = floor(g);
  vec2 fr = g - f0;
  ivec2 mx = uGrid - 1;
  ivec2 i0 = clamp(ivec2(f0), ivec2(0), mx);
  ivec2 i1 = clamp(ivec2(f0) + 1, ivec2(0), mx);
  vec4 a = texelFetch(uField, ivec2(i0.x, i0.y), 0);
  vec4 b = texelFetch(uField, ivec2(i1.x, i0.y), 0);
  vec4 c = texelFetch(uField, ivec2(i0.x, i1.y), 0);
  vec4 d = texelFetch(uField, ivec2(i1.x, i1.y), 0);
  return mix(mix(a, b, fr.x), mix(c, d, fr.x), fr.y);
}

void main() {
  vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
  vec4 f = fieldAt(uv);
  vec2 slope = f.xy;
  vec4 base = vec4(0.0);
  if (uHasImage == 1) {
    vec2 iuv = (uv + slope * uRefract - 0.5) * uImgScale + 0.5;
    bool inside = iuv.x >= 0.0 && iuv.x <= 1.0 && iuv.y >= 0.0 && iuv.y <= 1.0;
    vec4 c = texture(uImage, clamp(iuv, 0.0, 1.0));
    base = (uContain > 0.5 && !inside) ? vec4(0.0) : c;
  }
  base = uColor + base * (1.0 - uColor.a);
  float l = dot(slope, uLight) * uGain;
  float hi = clamp(l, 0.0, 1.0);
  float dk = clamp(-l, 0.0, 1.0);
  float aHi = 0.3 * hi + 0.55 * hi * hi * hi;
  float aDk = 0.42 * dk;
  float ca = pow(clamp(-f.z * uCaustic, 0.0, 1.0), 1.5) * 0.5;
  float a = min(aHi + ca + aDk, 1.0);
  vec3 rgb = min(uHi * (aHi + ca) + uSh * aDk, vec3(a));
  vec4 lit = vec4(rgb, a);
  outColor = (lit + base * (1.0 - lit.a)) * uOpacity;
}`

export class WebGLRenderer implements Renderer {
  readonly kind = 'webgl' as const
  onRestore?: () => void
  private gl: WebGL2RenderingContext
  private prog: WebGLProgram | null = null
  private fieldTex: WebGLTexture | null = null
  private imgTex: WebGLTexture | null = null
  private dummyTex: WebGLTexture | null = null
  private u: Record<string, WebGLUniformLocation | null> = {}
  private gw = 0
  private gh = 0
  private pxW = 1
  private pxH = 1
  private cssW = 1
  private cssH = 1
  private image: ImageSrc | null = null
  private fit: FitMode = 'cover'
  private imageOk = false
  private lost = false

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false,
      depth: false, stencil: false, preserveDrawingBuffer: false,
    })
    if (!gl) throw new Error('lwkripple: WebGL2 is not available')
    this.gl = gl
    this.init()
    canvas.addEventListener('webglcontextlost', this.onLost, false)
    canvas.addEventListener('webglcontextrestored', this.onRestored, false)
  }

  private init(): void {
    const gl = this.gl
    const compile = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('lwkripple shader: ' + gl.getShaderInfoLog(s))
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('lwkripple link: ' + gl.getProgramInfoLog(prog))
    this.prog = prog
    for (const n of ['uField', 'uImage', 'uRes', 'uGrid', 'uLight', 'uGain', 'uCaustic', 'uRefract', 'uColor', 'uHi', 'uSh', 'uOpacity', 'uHasImage', 'uImgScale', 'uContain']) {
      this.u[n] = gl.getUniformLocation(prog, n)
    }
    this.dummyTex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.dummyTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    this.imgTex = gl.createTexture()
    this.fieldTex = gl.createTexture()
    if (this.gw) this.allocField()
    if (this.image) this.imageOk = this.upload()
  }

  private allocField(): void {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.gw, this.gh, 0, gl.RGBA, gl.FLOAT, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  private upload(): boolean {
    const gl = this.gl
    if (!this.image) return false
    try {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.imgTex)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image as TexImageSource)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      if (gl.getError() !== gl.NO_ERROR) return false
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return true
    } catch {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      return false
    }
  }

  private onLost = (e: Event): void => { e.preventDefault(); this.lost = true }
  private onRestored = (): void => {
    try { this.init(); this.lost = false; this.onRestore?.() } catch { /* stays blank */ }
  }

  resize(cssW: number, cssH: number, pxW: number, pxH: number, gw: number, gh: number): void {
    this.cssW = cssW; this.cssH = cssH; this.pxW = pxW; this.pxH = pxH
    this.canvas.width = pxW
    this.canvas.height = pxH
    if (this.lost) return
    this.gl.viewport(0, 0, pxW, pxH)
    if (gw !== this.gw || gh !== this.gh) { this.gw = gw; this.gh = gh; this.allocField() }
  }

  setImage(src: ImageSrc | null, fit: FitMode): boolean {
    this.fit = fit
    this.image = src
    if (!src) { this.imageOk = false; return true }
    if (this.lost) return true
    this.imageOk = this.upload()
    return this.imageOk
  }

  render(field: Float32Array, p: RenderParams): void {
    if (this.lost || !this.prog) return
    const gl = this.gl
    const u = this.u
    gl.useProgram(this.prog)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gw, this.gh, gl.RGBA, gl.FLOAT, field)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.imageOk ? this.imgTex : this.dummyTex)
    gl.uniform1i(u.uField, 0)
    gl.uniform1i(u.uImage, 1)
    gl.uniform2f(u.uRes, this.pxW, this.pxH)
    gl.uniform2i(u.uGrid, this.gw, this.gh)
    gl.uniform2f(u.uLight, LIGHT_X, LIGHT_Y)
    gl.uniform1f(u.uGain, p.gain)
    gl.uniform1f(u.uCaustic, p.causticK)
    gl.uniform2f(u.uRefract, p.refractPx / this.cssW, p.refractPx / this.cssH)
    gl.uniform4f(u.uColor, p.color[0], p.color[1], p.color[2], p.color[3])
    gl.uniform3f(u.uHi, p.highlight[0], p.highlight[1], p.highlight[2])
    gl.uniform3f(u.uSh, p.shadow[0], p.shadow[1], p.shadow[2])
    gl.uniform1f(u.uOpacity, p.opacity)
    gl.uniform1i(u.uHasImage, this.imageOk ? 1 : 0)
    let sx = 1, sy = 1
    if (this.imageOk && this.image && this.fit !== 'fill') {
      const [iw, ih] = imageSize(this.image)
      const ea = this.cssW / this.cssH
      const ia = iw / ih
      if (this.fit === 'cover') { if (ea > ia) sy = ia / ea; else sx = ea / ia }
      else { if (ea > ia) sx = ea / ia; else sy = ia / ea }
    }
    gl.uniform2f(u.uImgScale, sx, sy)
    gl.uniform1f(u.uContain, this.fit === 'contain' ? 1 : 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  clear(): void {
    if (this.lost) return
    this.gl.clearColor(0, 0, 0, 0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
  }

  destroy(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost, false)
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored, false)
    try { this.gl.getExtension('WEBGL_lose_context')?.loseContext() } catch { /* ignore */ }
  }
}
