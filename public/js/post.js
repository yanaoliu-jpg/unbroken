// ============================================================
// 后期处理的公共部分（深海模式、过关的梦境都用它）
//   场景先画进一张 HDR 贴图（4 倍多重采样抗锯齿）→ 第一级只留亮部 →
//   "对偶 Kawase"模糊：一级级缩小（每级 5 次采样）、再一级级放大加回来（每级 8 次采样），得到又大又软的泛光。
// 最后一步"合成"由各个模式自己写：着色器里拿 tScene（场景）和 tBloom（泛光）两张图。
// ============================================================
import * as THREE from "three";

export const QUAD_VERT = /* glsl */ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;

export class BloomChain {
    // levels：往下缩几级（越多泛光越大越软）；threshold / knee：第一级只留比 threshold 亮的部分，knee 是软过渡的宽度
    constructor(renderer, { levels = 4, samples = 4, threshold = 0.62, knee = 0.45 } = {}) {
        // 半精度浮点贴图才装得下"比白还亮"的光；老设备不支持就退回 8 位（泛光弱一些，但不会黑屏）
        const ext = renderer.extensions;
        const hdr = ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float");
        const type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
        this.rtScene = new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: true, samples });
        this.down = Array.from({ length: levels }, () => new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false }));
        this.up = Array.from({ length: levels - 1 }, () => new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false }));
        this.threshold = threshold;
        this.knee = knee;
        this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this.quad.frustumCulled = false;
        this.quadScene = new THREE.Scene();
        this.quadScene.add(this.quad);
        this.matDown = new THREE.ShaderMaterial({
            uniforms: { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 }, uKnee: { value: knee } },
            vertexShader: QUAD_VERT,
            fragmentShader: /* glsl */ `
                uniform sampler2D tMap;
                uniform vec2 uTexel;
                uniform float uThreshold;
                uniform float uKnee;
                varying vec2 vUv;
                vec3 pick(vec2 uv) {
                    vec3 c = texture2D(tMap, uv).rgb;
                    // 一个坏像素（NaN / 无穷大）经过模糊会糊成一大块黑：先洗掉
                    if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
                    c = min(c, vec3(64.0));
                    if (uThreshold > 0.0) {
                        float br = max(c.r, max(c.g, c.b));
                        c *= smoothstep(uThreshold, uThreshold + uKnee, br);
                    }
                    return c;
                }
                void main() {
                    vec3 s = pick(vUv) * 4.0;
                    s += pick(vUv - uTexel);
                    s += pick(vUv + uTexel);
                    s += pick(vUv + vec2(uTexel.x, -uTexel.y));
                    s += pick(vUv - vec2(uTexel.x, -uTexel.y));
                    gl_FragColor = vec4(s / 8.0, 1.0);
                }`,
            depthTest: false,
            depthWrite: false,
        });
        this.matUp = new THREE.ShaderMaterial({
            uniforms: { tMap: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } },
            vertexShader: QUAD_VERT,
            fragmentShader: /* glsl */ `
                uniform sampler2D tMap;
                uniform sampler2D tAdd;
                uniform vec2 uTexel;
                varying vec2 vUv;
                void main() {
                    vec2 t = uTexel;
                    vec3 s = texture2D(tMap, vUv + vec2(-t.x * 2.0, 0.0)).rgb;
                    s += texture2D(tMap, vUv + vec2(-t.x, t.y)).rgb * 2.0;
                    s += texture2D(tMap, vUv + vec2(0.0, t.y * 2.0)).rgb;
                    s += texture2D(tMap, vUv + vec2(t.x, t.y)).rgb * 2.0;
                    s += texture2D(tMap, vUv + vec2(t.x * 2.0, 0.0)).rgb;
                    s += texture2D(tMap, vUv + vec2(t.x, -t.y)).rgb * 2.0;
                    s += texture2D(tMap, vUv + vec2(0.0, -t.y * 2.0)).rgb;
                    s += texture2D(tMap, vUv + vec2(-t.x, -t.y)).rgb * 2.0;
                    gl_FragColor = vec4(s / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
                }`,
            depthTest: false,
            depthWrite: false,
        });
    }

    setSize(w, h) {
        if (!w || !h) return;
        this.rtScene.setSize(w, h);
        let dw = w;
        let dh = h;
        this.down.forEach((rt) => {
            dw = Math.max(1, dw >> 1);
            dh = Math.max(1, dh >> 1);
            rt.setSize(dw, dh);
        });
        this.up.forEach((rt, i) => rt.setSize(this.down[i].width, this.down[i].height));
    }

    // 用 mat 把整个画面画一遍，画到 target（null = 屏幕）
    pass(renderer, mat, target) {
        this.quad.material = mat;
        renderer.setRenderTarget(target);
        renderer.render(this.quadScene, this.quadCam);
    }

    // 画场景、算泛光。场景那张图在 this.rtScene.texture，返回泛光那张
    render(renderer, scene, camera) {
        renderer.setRenderTarget(this.rtScene);
        renderer.render(scene, camera);
        // 往下：亮部 → 1/2 → 1/4 → …
        let src = this.rtScene.texture;
        const du = this.matDown.uniforms;
        du.uKnee.value = this.knee;
        this.down.forEach((rt, i) => {
            du.tMap.value = src;
            du.uTexel.value.set(1 / rt.width, 1 / rt.height);
            du.uThreshold.value = i === 0 ? this.threshold : 0;
            this.pass(renderer, this.matDown, rt);
            src = rt.texture;
        });
        // 往上：一级一级放大，每级把同尺寸的那一张加回来
        const uu = this.matUp.uniforms;
        for (let i = this.up.length - 1; i >= 0; i--) {
            const rt = this.up[i];
            uu.tMap.value = src;
            uu.tAdd.value = this.down[i].texture;
            uu.uTexel.value.set(0.5 / rt.width, 0.5 / rt.height);
            this.pass(renderer, this.matUp, rt);
            src = rt.texture;
        }
        return src;
    }

    dispose() {
        [this.rtScene, ...this.down, ...this.up].forEach((rt) => rt.dispose());
        this.matDown.dispose();
        this.matUp.dispose();
        this.quad.geometry.dispose();
    }
}
