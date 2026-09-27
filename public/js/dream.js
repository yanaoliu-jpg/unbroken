// ============================================================
// 过关的"梦境"：一笔画完的那一刻，世界暗下去，光留下来
//   后期   泛光 + 柔焦（整幅画面罩一层模糊的自己）+ 边缘一点点色散；保留透明，页面的背景照样透上来
//   星尘   GPU 粒子：从彗星、键帽、整条笔迹里冒出来的发光星点（一部分带十字星芒），往上飘、会闪、慢慢熄
//   光环   在键盘上荡开的一圈彩色冲击波
//   光柱   从键帽里升起来的一道细光
// 只在过关仪式里搭起来。用完（泛光退到 0、粒子全熄）就把后期拆掉，平时的渲染一点不多花。
// 粒子的运动整个写在顶点着色器里：CPU 只在"撒"的那一下写几个数，之后每帧只改一个时间
// ============================================================
import * as THREE from "three";
import { BloomChain, QUAD_VERT } from "./post.js";

const MAX_DUST = 3000;
const MAX_RINGS = 6;
const MAX_PILLARS = 28;
const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

const rand = (a, b) => a + Math.random() * (b - a);
// 颜色可以直接给 CSS 的 "#rrggbb"（页面上用的就是它），换算成线性的 THREE.Color 并记住
const colorCache = new Map();
function toColor(c) {
    if (!c) return new THREE.Color(1, 1, 1);
    if (c.isColor) return c;
    let v = colorCache.get(c);
    if (!v) {
        v = new THREE.Color(c);
        colorCache.set(c, v);
    }
    return v;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const range = (r, d) => (Array.isArray(r) ? rand(r[0], r[1]) : r != null ? r : d);

// 各向均匀的随机方向
function randomDir(out) {
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return out.set(s * Math.cos(t), u, s * Math.sin(t));
}

export class Dream {
    constructor(stage) {
        this.stage = stage;
        this.built = false;
        this.attached = false; // 后期和粒子挂在舞台上
        this.on = false;       // 梦境开着（仪式进行中）
        this.level = 0;        // 泛光强度（跟着 goal 慢慢走）
        this.goal = 0;
        this.kick = 0;         // 猛地一亮，自己退下去
        this.aliveUntil = 0;   // 最后一颗星尘熄灭的时刻
        this.ambient = null;   // 每帧调一下的"持续冒星星"
        this.reduced = stage.reduced;
    }

    // ---------------- 搭场景 ----------------
    _build() {
        const S = this.stage;
        this.group = new THREE.Group();
        this.uTime = { value: 0 };
        this.uScale = { value: 400 };
        // 只有真正"比白还亮"的东西（发光的线、彗星、星尘）才起泛光；白键帽本身不糊
        this.bloom = new BloomChain(S.renderer, { levels: 5, threshold: 1.25, knee: 1 });
        this._buildComposite();
        this._buildDust();
        this._buildRings();
        this._buildPillars();
        this.built = true;
    }

    // 合成：场景按"不开后期时一模一样"的方式出图，再把光（泛光 + 柔焦）用滤色叠上去，透明度跟着光走
    _buildComposite() {
        this.matComposite = new THREE.ShaderMaterial({
            uniforms: {
                tScene: { value: null }, tBloom: { value: null },
                uBloom: { value: 0 }, uHaze: { value: 0 }, uAberr: { value: 0 },
                uTint: { value: new THREE.Color(1, 1, 1) },
            },
            vertexShader: QUAD_VERT,
            fragmentShader: /* glsl */ `
                uniform sampler2D tScene;
                uniform sampler2D tBloom;
                uniform float uBloom;
                uniform float uHaze;
                uniform float uAberr;
                uniform vec3 uTint;
                varying vec2 vUv;
                vec3 toDisplay(vec3 c) {
                    vec4 o = vec4(c, 1.0);
                    #ifdef TONE_MAPPING
                    o.rgb = toneMapping(o.rgb);
                    #endif
                    return linearToOutputTexel(o).rgb;
                }
                void main() {
                    vec2 uv = vUv;
                    vec2 dir = uv - 0.5;
                    float r2 = dot(dir, dir);
                    vec2 off = dir * uAberr * r2 * 2.0;
                    vec4 s = texture2D(tScene, uv);
                    float a = clamp(s.a, 0.0, 1.0);
                    vec3 col = max(vec3(texture2D(tScene, uv + off).r, s.g, texture2D(tScene, uv - off).b), 0.0);
                    // 场景本身：先还原成"没乘透明度"的颜色再做色调映射、转色彩空间——和不开后期时画出来的一样
                    vec3 base = a > 0.001 ? toDisplay(col / a) * a : vec3(0.0);
                    vec3 b = texture2D(tBloom, uv).rgb;
                    if (any(isnan(b)) || any(isinf(b))) b = vec3(0.0);
                    vec3 light = b * (uBloom * uTint + uHaze);
                    light = 1.0 - exp(-light);
                    light = linearToOutputTexel(vec4(light, 1.0)).rgb;
                    // 滤色：亮的地方不会冲爆；透明的地方光本身就是不透明度（预乘过的）
                    vec3 rgb = base + light - base * light;
                    gl_FragColor = vec4(rgb, max(a, max(light.r, max(light.g, light.b))));
                }`,
            depthTest: false,
            depthWrite: false,
        });
    }

    // ---------------- 星尘 ----------------
    _buildDust() {
        const N = MAX_DUST;
        const geo = new THREE.BufferGeometry();
        const attr = (size) => new THREE.BufferAttribute(new Float32Array(N * size), size).setUsage(THREE.DynamicDrawUsage);
        this.dPos = attr(3);   // 出生的位置
        this.dVel = attr(3);   // 初速度
        this.dTime = attr(2);  // 出生时刻、寿命
        this.dColor = attr(3); // 颜色（线性）
        this.dProps = attr(4); // 大小、阻力、浮力（负数就是往下落）、随机种子
        this.dKind = attr(1);  // 0 圆点 1 十字星芒
        for (let i = 0; i < N; i++) {
            this.dTime.array[i * 2] = -1e6;
            this.dProps.array[i * 4 + 1] = 1;
        }
        geo.setAttribute("position", this.dPos);
        geo.setAttribute("aVel", this.dVel);
        geo.setAttribute("aTime", this.dTime);
        geo.setAttribute("aColor", this.dColor);
        geo.setAttribute("aProps", this.dProps);
        geo.setAttribute("aKind", this.dKind);
        this.dAttrs = [this.dPos, this.dVel, this.dTime, this.dColor, this.dProps, this.dKind];
        const mat = new THREE.ShaderMaterial({
            uniforms: { uTime: this.uTime, uScale: this.uScale, uGain: { value: 1.6 } },
            vertexShader: /* glsl */ `
                attribute vec3 aVel;
                attribute vec2 aTime;
                attribute vec3 aColor;
                attribute vec4 aProps;
                attribute float aKind;
                uniform float uTime;
                uniform float uScale;
                varying vec3 vColor;
                varying float vAlpha;
                varying float vKind;
                varying float vSpin;
                void main() {
                    float age = uTime - aTime.x;
                    if (age < 0.0 || age > aTime.y) {
                        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                        gl_PointSize = 0.0;
                        return;
                    }
                    float k = age / aTime.y;
                    float drag = aProps.y;
                    float seed = aProps.w;
                    // 初速度被空气慢慢拖住，同时往上浮（或往下落），越往后越打旋
                    vec3 p = position + aVel * (1.0 - exp(-drag * age)) / drag;
                    p.y += 0.5 * aProps.z * age * age;
                    float sw = seed * 6.2831;
                    float wob = 0.22 * smoothstep(0.0, 0.7, k);
                    p.x += sin(age * (1.1 + seed * 1.7) + sw) * wob;
                    p.z += cos(age * (0.9 + seed * 1.3) + sw * 1.7) * wob;
                    vec4 mv = modelViewMatrix * vec4(p, 1.0);
                    float grow = smoothstep(0.0, 0.05, k);
                    float fade = 1.0 - smoothstep(0.5, 1.0, k);
                    float tw = 0.55 + 0.45 * sin(uTime * (6.0 + seed * 9.0) + sw * 5.0);
                    gl_PointSize = aProps.x * uScale * grow * mix(0.5, 1.0, 1.0 - k) / max(0.1, -mv.z);
                    vAlpha = grow * fade * mix(1.0, tw, 0.75);
                    vColor = aColor;
                    vKind = aKind;
                    vSpin = sw + uTime * (seed - 0.5) * 1.4;
                    gl_Position = projectionMatrix * mv;
                    // 飘到画布边上就淡掉：画布是页面里的一个框，别让星星在框边上被一刀切
                    vec2 ndc = gl_Position.xy / gl_Position.w;
                    vAlpha *= smoothstep(1.02, 0.78, abs(ndc.y)) * smoothstep(1.02, 0.86, abs(ndc.x));
                }`,
            fragmentShader: /* glsl */ `
                uniform float uGain;
                varying vec3 vColor;
                varying float vAlpha;
                varying float vKind;
                varying float vSpin;
                void main() {
                    vec2 p = gl_PointCoord - 0.5;
                    float d2 = dot(p, p);
                    float core = exp(-d2 * 110.0);
                    float e = core + exp(-d2 * 16.0) * 0.3;
                    if (vKind > 0.5) {
                        // 四角星芒：两道细光交叉，慢慢转
                        float c = cos(vSpin);
                        float s = sin(vSpin);
                        vec2 q = mat2(c, -s, s, c) * p;
                        e += (exp(-abs(q.x) * 70.0) * exp(-abs(q.y) * 6.0) + exp(-abs(q.y) * 70.0) * exp(-abs(q.x) * 6.0)) * 0.9;
                    }
                    float a = e * vAlpha;
                    if (a < 0.004) discard;
                    vec3 col = mix(vColor, vec3(1.0), core * 0.6);
                    gl_FragColor = vec4(col * a * uGain, a);
                    #include <colorspace_fragment>
                }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            premultipliedAlpha: true,
        });
        this.dust = new THREE.Points(geo, mat);
        this.dust.frustumCulled = false;
        this.dust.renderOrder = 20;
        this.group.add(this.dust);
        this.dHead = 0;
        this.dDirty = null; // 这一帧写过的那一段 [起, 止)
    }

    // 撒一把星尘。p：世界坐标
    //   count 颗数 · speed 初速度 · dir 主方向 · spread 0 = 顺着 dir，1 = 半边，2 = 四面八方
    //   life / size 可以给 [最小, 最大] · colors THREE.Color 数组（线性） · buoy 浮力（负 = 往下落）· drag 阻力
    //   star 带星芒的比例 · jitter 出生位置的随机半径
    emit(p, opts = {}) {
        if (!this.on || !this.attached || !p) return;
        const {
            count = 8, speed = 1, dir = UP, spread = 1, life = [1, 2], size = [0.06, 0.16], colors = null,
            buoy = 0.35, drag = 1.8, star = 0.25, jitter = 0.04,
        } = opts;
        const N = MAX_DUST;
        const now = this.stage.time; // 用舞台的时钟：着色器里的时间可能还停在上一次梦境
        const cols = colors && colors.length ? colors.map(toColor) : [toColor(null)];
        let n = Math.min(count, N);
        while (n-- > 0) {
            const i = this.dHead;
            this.dHead = (this.dHead + 1) % N;
            randomDir(tmp);
            tmp2.copy(dir).multiplyScalar(Math.max(0, 1 - spread * 0.5)).addScaledVector(tmp, spread * 0.5);
            if (tmp2.lengthSq() < 1e-6) tmp2.copy(dir);
            tmp2.normalize().multiplyScalar(speed * rand(0.35, 1));
            randomDir(tmp).multiplyScalar(jitter * Math.random());
            const P = this.dPos.array;
            P[i * 3] = p.x + tmp.x;
            P[i * 3 + 1] = p.y + tmp.y;
            P[i * 3 + 2] = p.z + tmp.z;
            const V = this.dVel.array;
            V[i * 3] = tmp2.x;
            V[i * 3 + 1] = tmp2.y;
            V[i * 3 + 2] = tmp2.z;
            const L = range(life, 1.5);
            this.dTime.array[i * 2] = now;
            this.dTime.array[i * 2 + 1] = L;
            const c = pick(cols);
            this.dColor.array[i * 3] = c.r;
            this.dColor.array[i * 3 + 1] = c.g;
            this.dColor.array[i * 3 + 2] = c.b;
            const Q = this.dProps.array;
            Q[i * 4] = range(size, 0.1);
            Q[i * 4 + 1] = Math.max(0.05, drag);
            Q[i * 4 + 2] = buoy;
            Q[i * 4 + 3] = Math.random();
            this.dKind.array[i] = Math.random() < star ? 1 : 0;
            this._markDust(i);
            this.aliveUntil = Math.max(this.aliveUntil, now + L);
        }
        this.stage._touch();
    }

    _markDust(i) {
        const d = this.dDirty;
        if (!d) this.dDirty = [i, i + 1];
        else if (i === d[1]) d[1] = i + 1;
        else if (i < d[0] || i >= d[1]) this.dDirty = [0, MAX_DUST]; // 绕回开头了：整段重传（很少发生）
    }

    _flushDust() {
        const d = this.dDirty;
        if (!d) return;
        this.dDirty = null;
        this.dAttrs.forEach((a) => {
            a.clearUpdateRanges();
            a.addUpdateRange(d[0] * a.itemSize, (d[1] - d[0]) * a.itemSize);
            a.needsUpdate = true;
        });
    }

    // ---------------- 光环：贴着键帽顶面荡开的一圈 ----------------
    _buildRings() {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.rotateX(-Math.PI / 2);
        const base = new THREE.ShaderMaterial({
            uniforms: {
                uK: { value: 0 }, uWidth: { value: 0.05 }, uTime: this.uTime,
                uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uGain: { value: 1 },
            },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: /* glsl */ `
                uniform float uK;
                uniform float uWidth;
                uniform float uTime;
                uniform vec3 uC1;
                uniform vec3 uC2;
                uniform float uGain;
                varying vec2 vUv;
                void main() {
                    vec2 p = vUv * 2.0 - 1.0;
                    float d = length(p);
                    float fade = (1.0 - uK) * (1.0 - uK);
                    float ring = exp(-pow((d - 0.92) / uWidth, 2.0));
                    float inner = smoothstep(0.92, 0.2, d) * 0.1;
                    float ang = atan(p.y, p.x);
                    // 一圈上颜色在渐变的两头之间转着变：彩虹色的冲击波
                    vec3 col = mix(uC1, uC2, 0.5 + 0.5 * sin(ang * 2.0 + uTime * 1.7));
                    float a = (ring + inner) * fade * step(d, 1.0);
                    gl_FragColor = vec4(col * a * uGain, a);
                    #include <colorspace_fragment>
                }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            premultipliedAlpha: true,
        });
        this.rings = Array.from({ length: MAX_RINGS }, () => {
            const mat = base.clone();
            mat.uniforms.uTime = this.uTime;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            mesh.renderOrder = 19;
            mesh.frustumCulled = false;
            this.group.add(mesh);
            return { mesh, mat, t: 0, life: 1, delay: 0, r0: 0.3, r1: 8, busy: false };
        });
    }

    // 从 p 荡开一圈：{ colors: [c1, c2], radius 最终半径, life 秒, width 线宽（相对）, delay 秒, gain 亮度 }
    ring(p, { colors = null, radius = 8, life = 1.8, width = 0.05, delay = 0, gain = 1.4 } = {}) {
        if (!this.on || !this.attached || !p) return;
        const r = this.rings.find((x) => !x.busy) || this.rings.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
        r.busy = true;
        r.t = -delay;
        r.life = life;
        r.r1 = radius;
        r.mesh.position.set(p.x, p.y, p.z);
        r.mat.uniforms.uWidth.value = width;
        r.mat.uniforms.uGain.value = gain;
        const c = colors && colors.length ? colors : [null];
        r.mat.uniforms.uC1.value.copy(toColor(c[0]));
        r.mat.uniforms.uC2.value.copy(toColor(c[1] || c[0]));
        this.aliveUntil = Math.max(this.aliveUntil, this.stage.time + delay + life);
        this.stage._touch();
    }

    // ---------------- 光柱：从键帽里往上长的一道细光 ----------------
    _buildPillars() {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.translate(0, 0.5, 0); // 原点在底边中间：往上长
        const base = new THREE.ShaderMaterial({
            uniforms: { uTime: this.uTime, uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uSeed: { value: 0 } },
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
                    float core = exp(-x * x * 26.0);
                    float halo = exp(-x * x * 4.0) * 0.3;
                    float v = clamp(vUv.y, 0.0, 1.0);
                    float fall = pow(max(1.0 - v, 0.0), 1.7);
                    float shimmer = 0.8 + 0.2 * sin(v * 32.0 - uTime * 7.0 + uSeed * 6.0);
                    float a = (core + halo) * fall * shimmer * uAlpha * smoothstep(0.0, 0.05, v);
                    gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.35) * a, a);
                    #include <colorspace_fragment>
                }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            premultipliedAlpha: true,
            side: THREE.DoubleSide,
        });
        this.pillars = Array.from({ length: MAX_PILLARS }, () => {
            const mat = base.clone();
            mat.uniforms.uTime = this.uTime;
            mat.uniforms.uSeed.value = Math.random() * 10;
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            mesh.renderOrder = 18;
            mesh.frustumCulled = false;
            this.group.add(mesh);
            return { mesh, mat, t: 0, life: 1, h: 3, w: 0.5, busy: false };
        });
    }

    // p 上长出一道光：{ color, height, width, life }
    pillar(p, { color = null, height = 3, width = 0.5, life = 1.1, gain = 1 } = {}) {
        if (!this.on || !this.attached || !p) return;
        const b = this.pillars.find((x) => !x.busy) || this.pillars.reduce((a, c) => (a.t / a.life > c.t / c.life ? a : c));
        b.busy = true;
        b.t = 0;
        b.life = life;
        b.h = height;
        b.w = width;
        b.gain = gain;
        b.mesh.position.set(p.x, p.y, p.z);
        b.mat.uniforms.uColor.value.copy(toColor(color));
        this.aliveUntil = Math.max(this.aliveUntil, this.stage.time + life);
        this.stage._touch();
    }

    // ---------------- 进 / 出 ----------------
    // 梦境开始：泛光慢慢亮到 bloom，柔焦 haze
    begin({ bloom = 1, haze = 0.3, aberr = 0.006, tint = null } = {}) {
        if (this.reduced) return;
        if (!this.built) this._build();
        this.on = true;
        this.goal = bloom;
        this.hazeGoal = haze;
        this.aberr = aberr;
        if (tint) this.matComposite.uniforms.uTint.value.copy(toColor(tint));
        else this.matComposite.uniforms.uTint.value.setRGB(1, 1, 1);
        this._attach();
    }

    // 泛光换一个强度（仪式的不同段落）
    setLevel(bloom, haze = this.hazeGoal) {
        this.goal = bloom;
        this.hazeGoal = haze;
        this.stage._touch();
    }

    // 泛光猛地一亮（超新星、成句）
    flash(amount = 1) {
        if (!this.on) return;
        this.kick = Math.max(this.kick, amount);
        this.stage._touch();
    }

    // 梦醒：泛光退掉、不再冒星星；等最后一颗星尘熄了再把后期拆掉
    end() {
        this.on = false;
        this.goal = 0;
        this.hazeGoal = 0;
        this.ambient = null;
        this.stage._touch();
    }

    // 立刻收场（换屏时不想看到上一屏的残光）
    reset() {
        this.end();
        if (!this.built) return;
        this.level = 0;
        this.kick = 0;
        this.aliveUntil = 0;
        for (let i = 0; i < MAX_DUST; i++) this.dTime.array[i * 2] = -1e6;
        this.dDirty = [0, MAX_DUST];
        this._flushDust();
        this.rings.forEach((r) => { r.busy = false; r.mesh.visible = false; });
        this.pillars.forEach((b) => { b.busy = false; b.mesh.visible = false; });
        this._detach();
    }

    _attach() {
        if (this.attached) return;
        const S = this.stage;
        if (S.post && S.post !== this) return; // 深海模式正开着：不抢
        this.attached = true;
        this.uTime.value = S.time;
        S.scene.add(this.group);
        S.layers.add(this);
        S.post = this;
        this.setSize(S.drawingSize());
        S._touch(true);
    }

    _detach() {
        if (!this.attached) return;
        const S = this.stage;
        this.attached = false;
        S.scene.remove(this.group);
        S.layers.delete(this);
        if (S.post === this) S.post = null;
        S._touch(true);
    }


    // ---------------- 每帧 ----------------
    update(dt, time) {
        if (!this.attached) return false;
        const S = this.stage;
        this.uTime.value = time;
        // 持续冒星星的那一段：返回 false 表示这一帧它什么也没做（人停手了），不用为它重画
        const amb = this.ambient ? this.ambient(dt, time) !== false : false;
        // 泛光往目标走；猛亮的那一下自己退掉
        const k = 1 - Math.exp(-dt * (this.goal > this.level ? 2.2 : 1.6));
        this.level += (this.goal - this.level) * k;
        this.haze = (this.haze || 0) + ((this.hazeGoal || 0) - (this.haze || 0)) * k;
        this.kick = Math.max(0, this.kick - dt * 1.4);
        const u = this.matComposite.uniforms;
        u.uBloom.value = this.level + this.kick;
        u.uHaze.value = this.haze * (1 + this.kick * 0.5);
        u.uAberr.value = (this.aberr || 0) * Math.min(1, this.level + this.kick);
        // 点精灵的大小换算要跟着镜头的视角走（setView 会慢慢改 fov）
        const fov = THREE.MathUtils.degToRad(S.camera.fov);
        this.uScale.value = S.drawingSize().h / (2 * Math.tan(fov / 2));
        this._flushDust();
        // 光环
        this.rings.forEach((r) => {
            if (!r.busy) return;
            r.t += dt;
            if (r.t < 0) {
                r.mesh.visible = false;
                return;
            }
            const kk = r.t / r.life;
            if (kk >= 1) {
                r.busy = false;
                r.mesh.visible = false;
                return;
            }
            const e = 1 - Math.pow(1 - kk, 3);
            const rad = 0.2 + (r.r1 - 0.2) * e;
            r.mesh.visible = true;
            r.mesh.scale.set(rad * 2, 1, rad * 2);
            r.mat.uniforms.uK.value = kk;
        });
        // 光柱：很快长高，慢慢淡掉；始终侧对镜头（绕竖轴转）
        const cam = S.camera.position;
        this.pillars.forEach((b) => {
            if (!b.busy) return;
            b.t += dt;
            const kk = b.t / b.life;
            if (kk >= 1) {
                b.busy = false;
                b.mesh.visible = false;
                return;
            }
            const grow = 1 - Math.pow(1 - Math.min(1, b.t / 0.22), 3);
            b.mesh.visible = true;
            b.mesh.scale.set(b.w, b.h * grow, 1);
            b.mesh.rotation.y = Math.atan2(cam.x - b.mesh.position.x, cam.z - b.mesh.position.z);
            b.mat.uniforms.uAlpha.value = (b.gain || 1) * Math.min(1, b.t / 0.08) * (1 - kk) * (1 - kk);
        });
        const alive = time < this.aliveUntil;
        const settling = Math.abs(this.goal - this.level) > 0.002 || this.kick > 0;
        // 梦醒、光退完、星星都熄了：拆掉后期，回到平常的渲染
        if (!this.on && this.level < 0.002 && this.kick <= 0 && !alive) {
            this.level = 0;
            this._detach();
            return true;
        }
        // 什么都没在动（泛光停在目标上、没有星星）：不用每帧重画，画面停在最后一帧
        return alive || settling || amb;
    }

    setSize({ w, h }) {
        if (!this.built || !w || !h) return;
        this.bloom.setSize(w, h);
    }

    render(renderer, scene, camera) {
        const bloom = this.bloom.render(renderer, scene, camera);
        this.matComposite.uniforms.tScene.value = this.bloom.rtScene.texture;
        this.matComposite.uniforms.tBloom.value = bloom;
        this.bloom.pass(renderer, this.matComposite, null);
    }
}
