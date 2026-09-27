// ============================================================
// 深海模式：键盘沉在一只玻璃水箱里
//   黑色背景 · 荧光蓝的气泡和烟雾从按下的键里升起来 · 一根根光柱并排往上长 ·
//   头顶是会起涟漪、会反光的水面 · 键帽和箱底上晃着焦散的光纹 · 逆光把键盘勾成剪影
// 画面最后过一遍后期：泛光（bloom）、隔着玻璃看的轻微折射和色散、暗角、颗粒、青蓝调色、高对比
//
// 全部是这一个文件里现写的着色器，不用任何贴图文件。只在进入深海模式时才搭起来，退出就拆掉。
// ============================================================
import * as THREE from "three";
import { BloomChain, QUAD_VERT } from "./post.js";

// 水箱：比键盘大一圈（键盘占 x 0–16、z 0–6.25、键帽顶在 y≈0.6）
const TANK = { x0: -2.4, x1: 18.4, z0: -2.2, z1: 8.6, y0: -0.64, y1: 7.8 };
const CYAN = new THREE.Color("#2ee6ff");
const DEEP = new THREE.Color("#1a6dff");

const MAX_BUBBLES = 420;
const MAX_SMOKE = 260;
const MAX_BEAMS = 28;
const SNOW = 520;

// ---------------- 着色器里共用的几段 ----------------
// 自己写的 Worley（细胞）噪声：细胞的边就是焦散那种一张网似的亮线
const CELLS_GLSL = /* glsl */ `
    vec2 abyssHash(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
    }
    float abyssCells(vec2 p, float t) {
        vec2 g = floor(p);
        vec2 f = fract(p);
        float d1 = 8.0;
        float d2 = 8.0;
        for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
                vec2 o = vec2(float(x), float(y));
                vec2 h = abyssHash(g + o);
                h = 0.5 + 0.5 * sin(t + 6.2831 * h);
                vec2 r = o + h - f;
                float d = dot(r, r);
                if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
            }
        }
        return sqrt(d2) - sqrt(d1);
    }
    float abyssCaustic(vec2 p, float t) {
        float a = abyssCells(p * 0.85, t * 0.55);
        float b = abyssCells(p * 1.6 + 3.1, t * 0.8);
        return pow(1.0 - smoothstep(0.0, 0.13, a), 2.0) * 0.75 + pow(1.0 - smoothstep(0.0, 0.09, b), 2.0) * 0.45;
    }
`;

// 一张烟团贴图：几层噪声叠出来的一团软软的云，边缘淡出
function smokeTexture() {
    const S = 128;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(S, S);
    const rnd = (x, y) => {
        const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        return s - Math.floor(s);
    };
    const noise = (x, y) => {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const xf = x - xi;
        const yf = y - yi;
        const u = xf * xf * (3 - 2 * xf);
        const v = yf * yf * (3 - 2 * yf);
        const a = rnd(xi, yi);
        const b = rnd(xi + 1, yi);
        const cc = rnd(xi, yi + 1);
        const d = rnd(xi + 1, yi + 1);
        return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
    };
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const nx = x / S - 0.5;
            const ny = y / S - 0.5;
            const r = Math.sqrt(nx * nx + ny * ny) * 2;
            let f = 0;
            let amp = 0.55;
            let fr = 3;
            for (let o = 0; o < 4; o++) {
                f += noise(x / S * fr + 13, y / S * fr + 7) * amp;
                amp *= 0.5;
                fr *= 2;
            }
            const fall = Math.max(0, 1 - r);
            const a = Math.max(0, Math.min(1, fall * fall * (f * 1.5 - 0.25)));
            const i = (y * S + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
            img.data[i + 3] = Math.round(a * 255);
        }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
}

export class Abyss {
    constructor(stage) {
        this.stage = stage;
        this.active = false;
        this.built = false;
        this.time = 0;
        this.beamSlots = new Map(); // 键 id → 正在亮的光柱
        this.pulse = 0;             // LED 灯带跟着音符闪
    }

    // ---------------- 搭场景 ----------------
    _build() {
        const S = this.stage;
        this.group = new THREE.Group();
        this.uTime = { value: 0 };
        this._buildTank();
        this._buildSurface();
        this._buildFloor();
        this._buildBackdrop();
        this._buildRays();
        this._buildBubbles();
        this._buildSmoke();
        this._buildBeams();
        this._buildSnow();
        this._buildPost();
        this.built = true;
        this.S = S;
    }

    _buildTank() {
        const T = TANK;
        // 玻璃：五块很淡的板，边缘（掠射角）亮一点，像亚克力的反光
        const glassMat = new THREE.ShaderMaterial({
            uniforms: { uTime: this.uTime },
            vertexShader: /* glsl */ `
                varying vec3 vN;
                varying vec3 vV;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    vN = normalize(normalMatrix * normal);
                    vV = normalize(-mv.xyz);
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: /* glsl */ `
                uniform float uTime;
                varying vec3 vN;
                varying vec3 vV;
                varying vec2 vUv;
                void main() {
                    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
                    float edge = pow(f, 3.0) * 0.35;
                    // 玻璃上两道斜斜的反光条
                    float band = smoothstep(0.035, 0.0, abs(vUv.x + vUv.y * 0.55 - 0.42 - 0.03 * sin(uTime * 0.2)))
                               + 0.5 * smoothstep(0.02, 0.0, abs(vUv.x + vUv.y * 0.55 - 0.58));
                    float a = edge + band * 0.07;
                    gl_FragColor = vec4(vec3(0.55, 0.9, 1.0) * a, a);
                }`,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        });
        const W = T.x1 - T.x0;
        const H = T.y1 - T.y0;
        const D = T.z1 - T.z0;
        const cx = (T.x0 + T.x1) / 2;
        const cy = (T.y0 + T.y1) / 2;
        const cz = (T.z0 + T.z1) / 2;
        const panes = [
            [W, H, [cx, cy, T.z1], [0, 0, 0]],
            [W, H, [cx, cy, T.z0], [0, Math.PI, 0]],
            [D, H, [T.x0, cy, cz], [0, -Math.PI / 2, 0]],
            [D, H, [T.x1, cy, cz], [0, Math.PI / 2, 0]],
        ];
        panes.forEach(([w, h, p, r]) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
            m.position.set(...p);
            m.rotation.set(...r);
            m.renderOrder = 9;
            this.group.add(m);
        });
        // 蓝色 LED 灯带：沿着水箱的棱，和音符一起一闪一闪
        this.ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#1f8dff").multiplyScalar(2.2), toneMapped: false });
        const edge = (a, b, t = 0.035) => {
            const va = new THREE.Vector3(...a);
            const vb = new THREE.Vector3(...b);
            const len = va.distanceTo(vb);
            const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, len), this.ledMat);
            m.position.copy(va).add(vb).multiplyScalar(0.5);
            m.lookAt(vb);
            this.group.add(m);
        };
        const ys = [T.y0 + 0.02, T.y1];
        ys.forEach((y) => {
            edge([T.x0, y, T.z0], [T.x1, y, T.z0]);
            edge([T.x0, y, T.z1], [T.x1, y, T.z1]);
            edge([T.x0, y, T.z0], [T.x0, y, T.z1]);
            edge([T.x1, y, T.z0], [T.x1, y, T.z1]);
        });
        [[T.x0, T.z0], [T.x1, T.z0], [T.x0, T.z1], [T.x1, T.z1]].forEach(([x, z]) => edge([x, T.y0, z], [x, T.y1, z], 0.028));
    }

    // 水面：从下往上看，一张会起伏、会被气泡砸出涟漪、光柱打上去会亮的膜
    _buildSurface() {
        const T = TANK;
        this.ripples = Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, -99, 0));
        this.beamSpots = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0));
        this.rippleAt = 0;
        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: this.uTime, uRipples: { value: this.ripples }, uBeams: { value: this.beamSpots } },
            vertexShader: /* glsl */ `
                varying vec3 vW;
                void main() {
                    vec4 w = modelMatrix * vec4(position, 1.0);
                    vW = w.xyz;
                    gl_Position = projectionMatrix * viewMatrix * w;
                }`,
            fragmentShader: /* glsl */ `
                uniform float uTime;
                uniform vec4 uRipples[12];
                uniform vec4 uBeams[8];
                varying vec3 vW;
                float waves(vec2 p) {
                    float v = sin(p.x * 0.9 + uTime * 0.8) * 0.5 + sin(p.y * 1.3 - uTime * 0.6) * 0.5
                            + sin((p.x + p.y) * 0.7 + uTime * 1.1) * 0.4 + sin(p.x * 2.3 - p.y * 1.7 + uTime * 1.7) * 0.18;
                    for (int i = 0; i < 12; i++) {
                        vec4 r = uRipples[i];
                        float age = uTime - r.z;
                        if (age < 0.0 || age > 3.2) continue;
                        float d = distance(p, r.xy);
                        v += sin(d * 7.0 - age * 9.0) * exp(-d * 0.8) * exp(-age * 1.3) * r.w * 1.4;
                    }
                    return v;
                }
                void main() {
                    vec2 p = vW.xz;
                    float e = 0.06;
                    float hx = waves(p + vec2(e, 0.0)) - waves(p - vec2(e, 0.0));
                    float hz = waves(p + vec2(0.0, e)) - waves(p - vec2(0.0, e));
                    float slope = length(vec2(hx, hz)) / (2.0 * e);
                    // 坡度小的地方像镜子一样把下面的光反回来，坡度大的地方暗：一片晃动的亮纹
                    float glint = pow(max(0.0, 1.0 - slope * 0.55), 6.0);
                    float lines = pow(max(0.0, 1.0 - slope * 0.25), 20.0);
                    vec3 col = vec3(0.012, 0.06, 0.09) + vec3(0.2, 0.75, 1.0) * (glint * 0.42 + lines * 0.25);
                    for (int i = 0; i < 8; i++) {
                        vec4 b = uBeams[i];
                        if (b.z <= 0.001) continue;
                        float d = distance(p, b.xy);
                        col += vec3(0.25, 0.85, 1.0) * b.z * (exp(-d * d * 0.9) * 0.9 + exp(-d * 0.8) * 0.15) * (0.7 + 0.6 * glint);
                    }
                    gl_FragColor = vec4(col, 1.0);
                }`,
            side: THREE.DoubleSide,
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(T.x1 - T.x0, T.z1 - T.z0, 1, 1), mat);
        m.rotation.x = Math.PI / 2;
        m.position.set((T.x0 + T.x1) / 2, T.y1, (T.z0 + T.z1) / 2);
        this.surface = m;
        this.group.add(m);
    }

    // 箱底：深色的沙，上面晃着焦散的光纹
    _buildFloor() {
        const T = TANK;
        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: this.uTime },
            vertexShader: /* glsl */ `
                varying vec3 vW;
                void main() {
                    vec4 w = modelMatrix * vec4(position, 1.0);
                    vW = w.xyz;
                    gl_Position = projectionMatrix * viewMatrix * w;
                }`,
            fragmentShader: CELLS_GLSL + /* glsl */ `
                uniform float uTime;
                varying vec3 vW;
                void main() {
                    float c = abyssCaustic(vW.xz * 0.9, uTime);
                    vec2 q = (vW.xz - vec2(8.0, 3.2)) / vec2(13.0, 8.0);
                    float fade = 1.0 - smoothstep(0.35, 1.0, length(q));
                    vec3 col = vec3(0.004, 0.018, 0.028) + vec3(0.1, 0.55, 0.8) * c * 0.35 * fade;
                    gl_FragColor = vec4(col, 1.0);
                }`,
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(T.x1 - T.x0, T.z1 - T.z0), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set((T.x0 + T.x1) / 2, T.y0 - 0.005, (T.z0 + T.z1) / 2);
        this.group.add(m);
    }

    // 背后的光：一片青蓝色的雾在键盘后面亮着——逆光，键盘就成了剪影
    _buildBackdrop() {
        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: this.uTime },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: /* glsl */ `
                uniform float uTime;
                varying vec2 vUv;
                void main() {
                    vec2 p = (vUv - vec2(0.5, 0.42)) * vec2(2.0, 3.4);
                    float g = exp(-dot(p, p) * 3.2);
                    float breathe = 0.88 + 0.12 * sin(uTime * 0.35);
                    vec3 col = vec3(0.0, 0.002, 0.006) + vec3(0.0, 0.15, 0.23) * g * breathe;
                    gl_FragColor = vec4(col, 1.0);
                }`,
            depthWrite: false,
        });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(90, 50), mat);
        m.position.set(8, 5, -16);
        m.renderOrder = -10;
        this.group.add(m);
    }

    // 从水面斜着照下来的几束光（在水里的雾里看得见）
    _buildRays() {
        this.rays = [];
        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: this.uTime, uSeed: { value: 0 } },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: /* glsl */ `
                uniform float uTime;
                uniform float uSeed;
                varying vec2 vUv;
                void main() {
                    float x = abs(vUv.x - 0.5) * 2.0;
                    float a = exp(-x * x * 6.0) * pow(clamp(vUv.y, 0.0, 1.0), 1.4) * (0.6 + 0.4 * sin(uTime * 0.4 + uSeed * 5.0));
                    gl_FragColor = vec4(vec3(0.2, 0.7, 1.0) * a * 0.1, a * 0.1);
                }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });
        for (let i = 0; i < 6; i++) {
            const m = mat.clone();
            m.uniforms.uTime = this.uTime;
            m.uniforms.uSeed.value = i * 1.37;
            const ray = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + (i % 3) * 0.7, 12), m);
            ray.position.set(-1 + i * 3.6, 3.2, -1.2 + (i % 2) * 2.2);
            ray.rotation.z = -0.28 + (i % 3) * 0.05;
            ray.renderOrder = 8;
            this.rays.push({ mesh: ray, sway: i * 0.9 });
            this.group.add(ray);
        }
    }

    // ---------------- 气泡：荧光的，像深海生物一样自己发光 ----------------
    _buildBubbles() {
        const geo = new THREE.SphereGeometry(1, 16, 12);
        this.bubbleGlow = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BUBBLES), 1);
        this.bubbleGlow.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute("aGlow", this.bubbleGlow);
        const mat = new THREE.ShaderMaterial({
            uniforms: { uColor: { value: CYAN.clone() } },
            vertexShader: /* glsl */ `
                attribute float aGlow;
                varying vec3 vN;
                varying vec3 vV;
                varying float vGlow;
                void main() {
                    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                    vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
                    vV = normalize(-mv.xyz);
                    vGlow = aGlow;
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: /* glsl */ `
                uniform vec3 uColor;
                varying vec3 vN;
                varying vec3 vV;
                varying float vGlow;
                void main() {
                    vec3 n = normalize(vN);
                    vec3 v = normalize(vV);
                    float f = 1.0 - abs(dot(n, v));
                    float rim = pow(f, 2.3);
                    vec3 L = normalize(vec3(-0.35, 0.85, 0.4));
                    float spec = pow(max(dot(reflect(-L, n), v), 0.0), 36.0);
                    vec3 col = uColor * (rim * 1.9 + 0.12) * vGlow + vec3(0.75, 1.0, 1.0) * spec * 1.2 * min(1.0, vGlow + 0.3);
                    gl_FragColor = vec4(col, 1.0);
                }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.bubbleMesh = new THREE.InstancedMesh(geo, mat, MAX_BUBBLES);
        this.bubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.bubbleMesh.frustumCulled = false;
        this.bubbleMesh.count = 0;
        this.bubbleMesh.renderOrder = 12;
        this.bubbles = [];
        this.group.add(this.bubbleMesh);
        this._m4 = new THREE.Matrix4();
    }

    // ---------------- 烟雾：一团团软的、会转、会散开的荧光雾 ----------------
    _buildSmoke() {
        const geo = new THREE.BufferGeometry();
        this.smokePos = new THREE.BufferAttribute(new Float32Array(MAX_SMOKE * 3), 3).setUsage(THREE.DynamicDrawUsage);
        this.smokeSize = new THREE.BufferAttribute(new Float32Array(MAX_SMOKE), 1).setUsage(THREE.DynamicDrawUsage);
        this.smokeAlpha = new THREE.BufferAttribute(new Float32Array(MAX_SMOKE), 1).setUsage(THREE.DynamicDrawUsage);
        this.smokeRot = new THREE.BufferAttribute(new Float32Array(MAX_SMOKE), 1).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute("position", this.smokePos);
        geo.setAttribute("aSize", this.smokeSize);
        geo.setAttribute("aAlpha", this.smokeAlpha);
        geo.setAttribute("aRot", this.smokeRot);
        this.uPointScale = { value: 400 };
        const mat = new THREE.ShaderMaterial({
            uniforms: { tSmoke: { value: smokeTexture() }, uColor: { value: new THREE.Color("#35d9ff") }, uScale: this.uPointScale },
            vertexShader: /* glsl */ `
                attribute float aSize;
                attribute float aAlpha;
                attribute float aRot;
                uniform float uScale;
                varying float vAlpha;
                varying float vRot;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = aSize * uScale / -mv.z;
                    vAlpha = aAlpha;
                    vRot = aRot;
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: /* glsl */ `
                uniform sampler2D tSmoke;
                uniform vec3 uColor;
                varying float vAlpha;
                varying float vRot;
                void main() {
                    vec2 p = gl_PointCoord - 0.5;
                    float c = cos(vRot);
                    float s = sin(vRot);
                    p = mat2(c, -s, s, c) * p;
                    float a = texture2D(tSmoke, p + 0.5).a * vAlpha;
                    gl_FragColor = vec4(uColor * a, a);
                }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.smokePoints = new THREE.Points(geo, mat);
        this.smokePoints.frustumCulled = false;
        this.smokePoints.renderOrder = 11;
        geo.setDrawRange(0, 0);
        this.smoke = [];
        this.group.add(this.smokePoints);
    }

    // ---------------- 光柱：按下一个键，它上方就长出一根光，按着一直亮 ----------------
    _buildBeams() {
        const base = new THREE.ShaderMaterial({
            uniforms: { uTime: this.uTime, uColor: { value: CYAN.clone() }, uAlpha: { value: 0 }, uSeed: { value: 0 } },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: /* glsl */ `
                uniform float uTime;
                uniform vec3 uColor;
                uniform float uAlpha;
                uniform float uSeed;
                varying vec2 vUv;
                void main() {
                    float x = abs(vUv.x - 0.5) * 2.0;
                    float core = exp(-x * x * 16.0);
                    float halo = exp(-x * x * 3.0) * 0.32;
                    float v = clamp(vUv.y, 0.0, 1.0);
                    float fall = pow(max(1.0 - v, 0.0), 1.25) * 0.8 + 0.2;
                    float shimmer = 0.78 + 0.22 * sin(v * 26.0 - uTime * 4.0 + uSeed * 6.0) * sin(v * 6.0 + uTime * 1.3 + uSeed);
                    float a = (core + halo) * fall * shimmer * uAlpha * smoothstep(0.0, 0.03, v);
                    gl_FragColor = vec4(uColor * a, a);
                }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.translate(0, 0.5, 0); // 原点在底边中间：往上长
        this.beams = Array.from({ length: MAX_BEAMS }, (_, i) => {
            const mat = base.clone();
            mat.uniforms.uTime = this.uTime;
            mat.uniforms.uSeed.value = Math.random() * 10;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            mesh.renderOrder = 10;
            this.group.add(mesh);
            return { mesh, mat, id: null, a: 0, target: 0, h: 0, width: 0.8, held: false, life: 0, i };
        });
    }

    // 水里飘着的细碎颗粒（海雪）：很淡，光柱附近亮一点
    _buildSnow() {
        const T = TANK;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(SNOW * 3);
        this.snowSeed = new Float32Array(SNOW);
        for (let i = 0; i < SNOW; i++) {
            pos[i * 3] = T.x0 + Math.random() * (T.x1 - T.x0);
            pos[i * 3 + 1] = T.y0 + Math.random() * (T.y1 - T.y0);
            pos[i * 3 + 2] = T.z0 + Math.random() * (T.z1 - T.z0);
            this.snowSeed[i] = Math.random();
        }
        this.snowPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute("position", this.snowPos);
        geo.setAttribute("aSeed", new THREE.BufferAttribute(this.snowSeed, 1));
        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: this.uTime, uScale: this.uPointScale },
            vertexShader: /* glsl */ `
                attribute float aSeed;
                uniform float uTime;
                uniform float uScale;
                varying float vA;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = (0.025 + aSeed * 0.035) * uScale / -mv.z;
                    vA = 0.25 + 0.75 * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0));
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: /* glsl */ `
                varying float vA;
                void main() {
                    float d = length(gl_PointCoord - 0.5);
                    float a = smoothstep(0.5, 0.0, d) * vA * 0.5;
                    gl_FragColor = vec4(vec3(0.5, 0.9, 1.0) * a, a);
                }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.snow = new THREE.Points(geo, mat);
        this.snow.frustumCulled = false;
        this.group.add(this.snow);
    }

    // ---------------- 后期：泛光 + 折射 + 色散 + 暗角 + 颗粒 + 调色 ----------------
    _buildPost() {
        // 场景 → 亮部 → 四级模糊的泛光：和梦境共用一套（js/post.js）
        this.bloom = new BloomChain(this.stage.renderer, { levels: 4, threshold: 0.62, knee: 0.45 });
        this.matComposite = new THREE.ShaderMaterial({
            uniforms: {
                tScene: { value: null }, tBloom: { value: null }, uTime: this.uTime,
                uBloom: { value: 1.15 }, uAberr: { value: 0.012 }, uVignette: { value: 0.85 }, uGrain: { value: 0.035 },
                uRes: { value: new THREE.Vector2(1, 1) },
            },
            vertexShader: QUAD_VERT,
            fragmentShader: /* glsl */ `
                // 色调映射和色彩空间的函数，three 已经在着色器开头替我们塞进来了
                uniform sampler2D tScene;
                uniform sampler2D tBloom;
                uniform float uTime;
                uniform float uBloom;
                uniform float uAberr;
                uniform float uVignette;
                uniform float uGrain;
                uniform vec2 uRes;
                varying vec2 vUv;
                void main() {
                    vec2 uv = vUv;
                    // 隔着水和亚克力看：画面极轻微地晃
                    uv += vec2(sin(uv.y * 17.0 + uTime * 1.1), cos(uv.x * 13.0 - uTime * 0.9)) * 0.0011;
                    vec2 dir = uv - 0.5;
                    float r2 = dot(dir, dir);
                    // 色散：越往边上，红和蓝分得越开
                    vec2 off = dir * uAberr * r2 * 2.0;
                    vec3 col;
                    col.r = texture2D(tScene, uv + off).r;
                    col.g = texture2D(tScene, uv).g;
                    col.b = texture2D(tScene, uv - off).b;
                    col += texture2D(tBloom, uv).rgb * uBloom;
                    // 调色：往青蓝推，高对比（先压黑，再提亮部）
                    col *= vec3(0.82, 1.0, 1.12);
                    col = max(col - 0.004, 0.0);
                    col = pow(col, vec3(1.08));
                    float vig = smoothstep(0.98, 0.22, sqrt(r2) * 1.3);
                    col *= mix(1.0, vig, uVignette);
                    gl_FragColor = vec4(col, 1.0);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                    float n = fract(sin(dot(vUv * uRes + fract(uTime * 7.3) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
                    gl_FragColor.rgb += (n - 0.5) * uGrain;
                }`,
            depthTest: false,
            depthWrite: false,
        });
    }

    setSize({ w, h }) {
        if (!this.built || !w || !h) return;
        this.bloom.setSize(w, h);
        this.matComposite.uniforms.uRes.value.set(w, h);
        // 点精灵的大小换算：视口高度（像素）/ (2·tan(fov/2))
        const fov = THREE.MathUtils.degToRad(this.stage.camera.fov);
        this.uPointScale.value = h / (2 * Math.tan(fov / 2));
    }

    render(renderer, scene, camera) {
        const bloom = this.bloom.render(renderer, scene, camera);
        this.matComposite.uniforms.tScene.value = this.bloom.rtScene.texture;
        this.matComposite.uniforms.tBloom.value = bloom;
        this.bloom.pass(renderer, this.matComposite, null);
    }

    // ---------------- 进 / 出 ----------------
    enter() {
        if (!this.built) this._build();
        if (this.active) return;
        const S = this.stage;
        this.active = true;
        this.saved = {
            background: S.scene.background,
            fog: S.scene.fog,
            envI: S.scene.environmentIntensity,
            toneMapping: S.renderer.toneMapping,
            rimPos: S.rim.position.clone(),
        };
        S.scene.background = new THREE.Color("#000204");
        S.scene.fog = new THREE.FogExp2(0x010810, 0.03);
        S.scene.environmentIntensity = 0.12;
        S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.matComposite.needsUpdate = true;
        // 逆光：一盏很强的青色灯在键盘后上方
        S.rim.position.set(8, 6.5, -5.5);
        S.lightOverride = {
            key: 0.22, keyColor: new THREE.Color("#8fdcff"), exposure: 0.85,
            rim: 95, rimColor: new THREE.Color("#35d6ff"), hemi: 0.1, hemiColor: new THREE.Color("#0b2a44"),
        };
        this._causticOn(true);
        S.scene.add(this.group);
        S.layers.add(this);
        S.post = this;
        this.setSize(S.drawingSize());
        S._touch(true);
    }

    exit() {
        if (!this.active) return;
        const S = this.stage;
        this.active = false;
        S.scene.remove(this.group);
        S.layers.delete(this);
        S.post = null;
        S.scene.background = this.saved.background;
        S.scene.fog = this.saved.fog;
        S.scene.environmentIntensity = this.saved.envI;
        S.renderer.toneMapping = this.saved.toneMapping;
        S.rim.position.copy(this.saved.rimPos);
        S.lightOverride = null;
        this._causticOn(false);
        // 清场：气泡、烟、光柱全部收起来
        this.bubbles.length = 0;
        this.bubbleMesh.count = 0;
        this.smoke.length = 0;
        this.smokePoints.geometry.setDrawRange(0, 0);
        this.beams.forEach((b) => { b.id = null; b.a = 0; b.target = 0; b.mesh.visible = false; });
        this.beamSlots.clear();
        S._touch(true);
    }

    // 键帽和外壳上也晃着焦散：给它们的材质补一段着色器（退出时拿掉，重新编译回原样）
    _causticOn(on) {
        const S = this.stage;
        if (!this.uCaust) this.uCaust = { value: 0 };
        const mats = [S.caseMat, S.plateMat];
        S.keys.forEach((k) => mats.push(k.capMat));
        mats.forEach((m) => {
            if (on) {
                m.onBeforeCompile = (sh) => {
                    sh.uniforms.uAbyssT = this.uTime;
                    sh.uniforms.uAbyssC = this.uCaust;
                    sh.vertexShader = sh.vertexShader
                        .replace("#include <common>", "#include <common>\nvarying vec3 vAbyssW;\nvarying float vAbyssUp;")
                        .replace("#include <project_vertex>", "#include <project_vertex>\nvAbyssW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvAbyssUp = normalize(mat3(modelMatrix) * objectNormal).y;");
                    sh.fragmentShader = sh.fragmentShader
                        .replace("#include <common>", "#include <common>\nuniform float uAbyssT;\nuniform float uAbyssC;\nvarying vec3 vAbyssW;\nvarying float vAbyssUp;\n" + CELLS_GLSL)
                        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.2, 0.75, 1.0) * abyssCaustic(vAbyssW.xz * 1.05, uAbyssT) * uAbyssC * clamp(vAbyssUp, 0.0, 1.0);");
                };
                m.customProgramCacheKey = () => "abyss-caustic";
            } else {
                m.onBeforeCompile = () => {};
                m.customProgramCacheKey = () => "";
            }
            m.needsUpdate = true;
        });
        this.uCaust.value = on ? 0.55 : 0;
    }

    // ---------------- 按下 / 松开一个键 ----------------
    // velocity 0–1；hold = 这是按住的音（松手时再收光柱）
    noteOn(id, { velocity = 1, freq = 440 } = {}) {
        if (!this.active) return;
        const k = this.stage.keys.get(id);
        if (!k) return;
        const p = this.stage.keyTop(id, 0.02);
        // 音越高，光越偏青白；越低越偏深蓝
        const hue = Math.min(1, Math.max(0, Math.log2(freq / 110) / 4));
        const color = DEEP.clone().lerp(CYAN, 0.35 + hue * 0.65);
        this._bubbleBurst(p, velocity);
        this._smokePuff(p, velocity);
        this._beamOn(id, p, velocity, color);
        this.pulse = Math.min(1.6, this.pulse + 0.35 + velocity * 0.4);
    }

    noteOff(id) {
        const b = this.beamSlots.get(id);
        if (!b) return;
        b.held = false;
        this.beamSlots.delete(id);
    }

    _bubbleBurst(p, v, count) {
        const n = count != null ? count : Math.round(7 + v * 9);
        for (let i = 0; i < n && this.bubbles.length < MAX_BUBBLES; i++) {
            const big = Math.random() < 0.18;
            this.bubbles.push({
                x: p.x + (Math.random() - 0.5) * 0.5,
                y: p.y + Math.random() * 0.2,
                z: p.z + (Math.random() - 0.5) * 0.45,
                r: big ? 0.09 + Math.random() * 0.07 : 0.025 + Math.random() * 0.05,
                vy: 0.4 + Math.random() * 0.5,
                ph: Math.random() * 6.28,
                wob: 0.6 + Math.random() * 1.4,
                glow: 0.9 + Math.random() * 0.6,
                delay: Math.random() * 0.25,
            });
        }
        // 按住时，气泡机一直冒：由 update 里按住的光柱接着吐
    }

    _smokePuff(p, v) {
        const n = Math.round(3 + v * 4);
        for (let i = 0; i < n && this.smoke.length < MAX_SMOKE; i++) {
            this.smoke.push({
                x: p.x + (Math.random() - 0.5) * 0.4,
                y: p.y + 0.05 + Math.random() * 0.2,
                z: p.z + (Math.random() - 0.5) * 0.35,
                vx: (Math.random() - 0.5) * 0.12,
                vy: 0.35 + Math.random() * 0.35,
                vz: (Math.random() - 0.5) * 0.12,
                size: 0.7 + Math.random() * 0.6,
                grow: 0.7 + Math.random() * 0.6,
                age: 0,
                life: 3 + Math.random() * 2.2,
                rot: Math.random() * 6.28,
                vr: (Math.random() - 0.5) * 0.6,
                peak: 0.42 + v * 0.3,
            });
        }
    }

    _beamOn(id, p, v, color) {
        let b = this.beamSlots.get(id);
        if (!b) {
            // 找一根空着的（或者最暗的那根）来用
            b = this.beams.find((x) => !x.id && x.a < 0.01) || this.beams.slice().sort((x, y) => x.a - y.a)[0];
            if (b.id) this.beamSlots.delete(b.id);
            b.id = id;
            b.h = 0;
            this.beamSlots.set(id, b);
        }
        b.x = p.x;
        b.y = p.y;
        b.z = p.z;
        b.held = true;
        b.target = 0.55 + v * 0.45;
        b.width = 0.55 + v * 0.35;
        b.emit = 0;
        b.mat.uniforms.uColor.value.copy(color);
        b.mesh.visible = true;
    }

    // ---------------- 每帧 ----------------
    update(dt) {
        if (!this.active) return false;
        const S = this.stage;
        this.time += dt;
        this.uTime.value = this.time;
        const T = TANK;
        const cam = S.camera.position;

        // 光柱：按着就长满、亮着；松手慢慢暗掉。按着的时候底下的"气泡机"一直往外冒
        let spot = 0;
        this.beamSpots.forEach((b) => b.set(0, 0, 0, 0));
        this.beams.forEach((b) => {
            if (!b.mesh.visible) return;
            const goal = b.held ? b.target : 0;
            b.a += (goal - b.a) * (1 - Math.exp(-dt * (b.held ? 10 : 1.6)));
            b.h = Math.min(T.y1 - b.y, b.h + dt * 18);
            b.mat.uniforms.uAlpha.value = b.a;
            b.mesh.position.set(b.x, b.y, b.z);
            b.mesh.scale.set(b.width, Math.max(0.01, b.h), 1);
            // 圆柱式公告板：绕竖轴转过来对着镜头
            b.mesh.rotation.y = Math.atan2(cam.x - b.x, cam.z - b.z);
            if (b.held) {
                // 按住不放：气泡机细细地一直冒（一秒十几个），烟偶尔补一团
                b.emit += dt;
                if (b.emit > 0.075) {
                    b.emit = 0;
                    this._bubbleBurst({ x: b.x, y: b.y, z: b.z }, 0, Math.random() < 0.5 ? 1 : 2);
                    if (Math.random() < 0.08) this._smokePuff({ x: b.x, y: b.y, z: b.z }, 0.1);
                }
            }
            if (b.a < 0.004 && !b.held) {
                b.mesh.visible = false;
                b.id = null;
            }
            if (spot < this.beamSpots.length && b.a > 0.02) this.beamSpots[spot++].set(b.x, b.z, b.a, 0);
        });

        // 气泡：越大浮得越快，左右摇摆着往上，到水面就破，砸出一圈涟漪
        const m4 = this._m4;
        let n = 0;
        const bubbles = this.bubbles;
        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            if (b.delay > 0) {
                b.delay -= dt;
                continue;
            }
            const terminal = 0.9 + b.r * 9;
            b.vy += (terminal - b.vy) * (1 - Math.exp(-dt * 1.5));
            b.y += b.vy * dt;
            b.x += Math.sin(this.time * b.wob * 2.2 + b.ph) * 0.22 * dt;
            b.z += Math.cos(this.time * b.wob * 1.7 + b.ph) * 0.12 * dt;
            b.r *= 1 + dt * 0.035; // 越往上水压越小，泡越大
            b.glow *= 1 - dt * 0.12;
            if (b.y + b.r >= T.y1) {
                if (b.r > 0.05) this._ripple(b.x, b.z, Math.min(1, b.r * 8));
                bubbles.splice(i, 1);
            }
        }
        for (const b of bubbles) {
            if (b.delay > 0) continue;
            m4.makeScale(b.r, b.r * (0.92 + 0.08 * Math.sin(this.time * 9 + b.ph)), b.r);
            m4.setPosition(b.x, b.y, b.z);
            this.bubbleMesh.setMatrixAt(n, m4);
            this.bubbleGlow.array[n] = b.glow;
            n++;
        }
        this.bubbleMesh.count = n;
        this.bubbleMesh.instanceMatrix.needsUpdate = true;
        this.bubbleGlow.needsUpdate = true;

        // 烟：慢慢往上、慢慢散开、慢慢转，被水流推着打个弯
        const sm = this.smoke;
        for (let i = sm.length - 1; i >= 0; i--) {
            const s = sm[i];
            s.age += dt;
            if (s.age >= s.life || s.y > T.y1 - 0.2) {
                sm.splice(i, 1);
                continue;
            }
            const swirl = Math.sin(s.y * 0.8 + this.time * 0.5 + s.rot) * 0.18;
            s.x += (s.vx + swirl) * dt;
            s.z += (s.vz + Math.cos(s.x * 0.7 + this.time * 0.4) * 0.08) * dt;
            s.y += s.vy * dt;
            s.vy *= 1 - dt * 0.25;
            s.size += s.grow * dt;
            s.rot += s.vr * dt;
        }
        const pos = this.smokePos.array;
        sm.forEach((s, i) => {
            pos[i * 3] = s.x;
            pos[i * 3 + 1] = s.y;
            pos[i * 3 + 2] = s.z;
            this.smokeSize.array[i] = s.size;
            const u = s.age / s.life;
            this.smokeAlpha.array[i] = s.peak * Math.min(1, u * 6) * (1 - u) * (1 - u);
            this.smokeRot.array[i] = s.rot;
        });
        this.smokePoints.geometry.setDrawRange(0, sm.length);
        this.smokePos.needsUpdate = true;
        this.smokeSize.needsUpdate = true;
        this.smokeAlpha.needsUpdate = true;
        this.smokeRot.needsUpdate = true;

        // 海雪：慢慢往下沉、打着旋
        const sp = this.snowPos.array;
        for (let i = 0; i < SNOW; i++) {
            const sd = this.snowSeed[i];
            sp[i * 3 + 1] -= (0.03 + sd * 0.05) * dt;
            sp[i * 3] += Math.sin(this.time * 0.3 + sd * 20) * 0.02 * dt;
            if (sp[i * 3 + 1] < T.y0) sp[i * 3 + 1] = T.y1 - 0.1;
        }
        this.snowPos.needsUpdate = true;

        // 光束轻轻摇；LED 跟着音符闪一下再退回去
        this.rays.forEach((r) => { r.mesh.rotation.z = -0.28 + Math.sin(this.time * 0.15 + r.sway) * 0.05; });
        this.pulse *= Math.exp(-dt * 2.2);
        this.ledMat.color.set("#1f8dff").multiplyScalar(1.6 + this.pulse * 2.4);
        return true;
    }

    _ripple(x, z, strength) {
        const r = this.ripples[this.rippleAt];
        this.rippleAt = (this.rippleAt + 1) % this.ripples.length;
        r.set(x, z, this.time, strength);
    }
}

export const ABYSS_TANK = TANK;
