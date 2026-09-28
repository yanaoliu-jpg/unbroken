// ============================================================
// 3D 键盘舞台：一块照着真实 75% 配列做的机械键盘
//   外壳是带倒角的阳极氧化金属框，键帽下沉在框里；
//   键帽是上窄下宽、顶面微凹的真实形状，按行做了一点"球面"倾角；
//   每颗键底下有一片 RGB 底光，打在底板和缝隙里。
// 整个站点只有这一个 WebGL 画布：切屏时把画布挂到新屏的容器里，
// 镜头从旧机位飞到新机位，看起来就是同一块键盘在转身。
// ============================================================
import * as THREE from "three";
import { RoundedBoxGeometry } from "../vendor/three/addons/RoundedBoxGeometry.js";
import { RoomEnvironment } from "../vendor/three/addons/RoomEnvironment.js";
import { mergeVertices, mergeGeometries } from "../vendor/three/addons/BufferGeometryUtils.js";

// ---------- 尺寸（单位：1 = 一个键距，约 19mm） ----------
const GAP = 0.075;          // 键帽之间的缝
const CAP_H = 0.4;          // 键帽高度
const CAP_R = 0.11;         // 键帽圆角
const CAP_INSET = 0.085;    // 顶面比底面每边收进多少（上窄下宽）
const DISH = 0.026;         // 顶面柱面凹陷深度
const STEM_H = 0.13;        // 键帽底离底板的高度（轴体露出的那一截）
const PRESS_DEPTH = 0.16;   // 按到底的行程
const RIM_TOP = 0.3;        // 外壳边框顶面高度（底板顶面为 0）
const CASE_BOTTOM = -0.62;
const BOARD_W = 16;
const BOARD_D = 6.25;
const PAD = 0.3;            // 键区到边框内缘的留白
const RIM = 0.36;           // 边框宽

// 每一排的高度和倾角：做成 Cherry 那样的球面阶梯，最上排朝向用户、最下排略往后仰
const ROW_SCULPT = [
    { lift: 0.05, tilt: 0.1 },
    { lift: 0.035, tilt: 0.07 },
    { lift: 0.0, tilt: 0.025 },
    { lift: -0.02, tilt: -0.01 },
    { lift: -0.005, tilt: -0.06 },
    { lift: 0.0, tilt: -0.09 },
];

// ---------- 配列 ----------
// 返回每颗键：{ id, label, x, z（左上角）, w, row, role }
function buildLayout() {
    const keys = [];
    const add = (id, label, x, z, w, row, role) => keys.push({ id, label, x, z, w, row, role });

    // 第 0 排：Esc · F1–F12 · Del · 旋钮
    add("esc", "esc", 0, 0, 1, 0, "accent");
    let x = 1.25;
    for (let i = 1; i <= 12; i++) {
        add("f" + i, "F" + i, x, 0, 1, 0, "mod");
        x += 1;
        if (i % 4 === 0) x += 0.25;
    }
    add("del", "del", 14, 0, 1, 0, "mod");

    // 第 1 排：数字
    let z = 1.25;
    add("`", "`", 0, z, 1, 1, "alpha");
    "1234567890".split("").forEach((c, i) => add(c, c, 1 + i, z, 1, 1, "alpha"));
    add("-", "-", 11, z, 1, 1, "alpha");
    add("=", "=", 12, z, 1, 1, "alpha");
    add("backspace", "⌫", 13, z, 2, 1, "mod");
    add("home", "home", 15, z, 1, 1, "mod");

    // 第 2 排
    z = 2.25;
    add("tab", "tab", 0, z, 1.5, 2, "mod");
    "qwertyuiop".split("").forEach((c, i) => add(c, c.toUpperCase(), 1.5 + i, z, 1, 2, "alpha"));
    add("[", "[", 11.5, z, 1, 2, "alpha");
    add("]", "]", 12.5, z, 1, 2, "alpha");
    add("\\", "\\", 13.5, z, 1.5, 2, "alpha");
    add("pgup", "pg up", 15, z, 1, 2, "mod");

    // 第 3 排
    z = 3.25;
    add("caps", "caps", 0, z, 1.75, 3, "mod");
    "asdfghjkl".split("").forEach((c, i) => add(c, c.toUpperCase(), 1.75 + i, z, 1, 3, "alpha"));
    add(";", ";", 10.75, z, 1, 3, "alpha");
    add("'", "'", 11.75, z, 1, 3, "alpha");
    add("enter", "enter", 12.75, z, 2.25, 3, "accent");
    add("pgdn", "pg dn", 15, z, 1, 3, "mod");

    // 第 4 排
    z = 4.25;
    add("shift-l", "shift", 0, z, 2.25, 4, "mod");
    "zxcvbnm".split("").forEach((c, i) => add(c, c.toUpperCase(), 2.25 + i, z, 1, 4, "alpha"));
    add(",", ",", 9.25, z, 1, 4, "alpha");
    add(".", ".", 10.25, z, 1, 4, "alpha");
    add("/", "/", 11.25, z, 1, 4, "alpha");
    add("shift-r", "shift", 12.25, z, 1.75, 4, "mod");
    add("up", "↑", 14, z, 1, 4, "accent");
    add("end", "end", 15, z, 1, 4, "mod");

    // 第 5 排
    z = 5.25;
    add("ctrl-l", "ctrl", 0, z, 1.25, 5, "mod");
    add("opt-l", "⌥", 1.25, z, 1.25, 5, "mod");
    add("cmd-l", "⌘", 2.5, z, 1.25, 5, "mod");
    add("space", "", 3.75, z, 6.25, 5, "mod");
    add("cmd-r", "⌘", 10, z, 1, 5, "mod");
    add("fn", "fn", 11, z, 1, 5, "mod");
    add("ctrl-r", "ctrl", 12, z, 1, 5, "mod");
    add("left", "←", 13, z, 1, 5, "accent");
    add("down", "↓", 14, z, 1, 5, "accent");
    add("right", "→", 15, z, 1, 5, "accent");

    return keys;
}

export const LAYOUT = buildLayout();

// 常用的取景范围（世界坐标，x 右、z 朝向用户、y 向上）
export const REGIONS = {
    board: { x0: -RIM - PAD, x1: BOARD_W + RIM + PAD, z0: -RIM - PAD, z1: BOARD_D + RIM + PAD },
    letters: { x0: 1.35, x1: 12.4, z0: 2.1, z1: 5.4 },
    numbers: { x0: 0.85, x1: 12.4, z0: 1.1, z1: 5.4 },
    play: { x0: -0.15, x1: 16.15, z0: 1.05, z1: 6.4 },
};

// ---------- 几何 ----------
const capGeoCache = new Map();

// 键帽顶面（去掉圆角那一圈之后的平面部分）在收窄后的尺寸：字贴片按它来
function capTop(wUnits) {
    const w = wUnits - GAP;
    const d = 1 - GAP;
    const sxTop = (w - 2 * CAP_INSET) / w;
    const szTop = (d - 2 * CAP_INSET) / d;
    return { hw: (w / 2 - CAP_R) * sxTop, hd: (d / 2 - CAP_R) * szTop };
}

// 键帽：自己搭的圆角方块。
// 不用 RoundedBoxGeometry：它为了省顶点把每个面中间的点全挤到了边上，
// 顶面只剩一整块平四边形，压不出凹面，字贴片会沉进键帽里。
// 这里每根轴一半分 FLAT 段平面 + ROUND 段圆角，顶点只在圆角那一圈加密。
function capGeometry(wUnits) {
    if (capGeoCache.has(wUnits)) return capGeoCache.get(wUnits);
    const W = wUnits - GAP;
    const D = 1 - GAP;
    const H = CAP_H;
    const r = CAP_R;
    // 每根轴一半的段数 = 平面段 + 圆角段。只有凹面那根轴（x）需要平面上有点，
    // 其余两根轴平面部分一段就够——三角形数从每颗两千多降到一千左右
    const ROUND = 3;
    const FX = wUnits > 3 ? 5 : 3;
    const FY = 1;
    const FZ = 1;
    const g = new THREE.BoxGeometry(1, 1, 1, 2 * (FX + ROUND), 2 * (FY + ROUND), 2 * (FZ + ROUND));
    const pos = g.attributes.position;
    const half = new THREE.Vector3(W / 2, H / 2, D / 2);
    const inner = new THREE.Vector3(W / 2 - r, H / 2 - r, D / 2 - r);
    const negInner = inner.clone().negate();
    const remap = (s, a, b, flat) => {
        const n = flat + ROUND;
        const u = Math.abs(s) * 2 * n;
        const v = u <= flat ? (u / flat) * b : b + ((u - flat) / ROUND) * (a - b);
        return Math.sign(s) * v;
    };
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    const sxTop = (W - 2 * CAP_INSET) / W;
    const szTop = (D - 2 * CAP_INSET) / D;
    for (let i = 0; i < pos.count; i++) {
        p.set(
            remap(pos.getX(i), half.x, inner.x, FX),
            remap(pos.getY(i), half.y, inner.y, FY),
            remap(pos.getZ(i), half.z, inner.z, FZ)
        );
        // 往"内缩一个圆角半径的盒子"上投，再沿法线推出去 r：棱和角就圆了，面中间的点原地不动
        q.copy(p).clamp(negInner, inner);
        const nx = p.x - q.x;
        const ny = p.y - q.y;
        const nz = p.z - q.z;
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-9) p.set(q.x + (nx / len) * r, q.y + (ny / len) * r, q.z + (nz / len) * r);
        // 顶面平的那块沿 x 压成浅浅的柱面凹，手指放上去的那种
        if (p.y > half.y - 1e-6 && Math.abs(p.x) <= inner.x + 1e-6) {
            const u = p.x / inner.x;
            p.y -= DISH * (1 - u * u);
        }
        // 上窄下宽
        const t = (p.y + H / 2) / H;
        p.x *= 1 + (sxTop - 1) * t;
        p.z *= 1 + (szTop - 1) * t;
        pos.setXYZ(i, p.x, p.y, p.z);
    }
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    const merged = mergeVertices(g, 1e-5);
    merged.computeVertexNormals();
    merged.translate(0, H / 2, 0); // 底面落在 y=0
    capGeoCache.set(wUnits, merged);
    return merged;
}

// 键帽正面那条字带（侧刻）：在正面平的那一段、偏上的位置——键一排比一排高的时候（深海模式），
// 前一排只挡住后一排正面的下半截，字刚好露出来
const FRONT_Y0 = 0.1;
const FRONT_Y1 = 0.34;

function frontBand(wUnits) {
    const W = wUnits - GAP;
    const D = 1 - GAP;
    const sxTop = (W - 2 * CAP_INSET) / W;
    const yc = (FRONT_Y0 + FRONT_Y1) / 2;
    const sx = 1 + (sxTop - 1) * (yc / CAP_H);
    return { hw: (W / 2 - CAP_R) * sx, h: FRONT_Y1 - FRONT_Y0, D };
}

// 字符贴片：顶面那片跟着顶面的凹一起弯，斜着看也不会浮起来或沉下去；
// 再加正面一条窄带（平时是透明的，深海模式里刻上字母）。两片共用一张画布：上面 top 行给顶面，下面 front 行给正面
function legendGeometry(wUnits, vSplit) {
    const { hw, hd } = capTop(wUnits);
    const top = new THREE.PlaneGeometry(hw * 2, hd * 2, 16, 1);
    top.rotateX(-Math.PI / 2);
    const pos = top.attributes.position;
    const uv = top.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        const u = Math.min(1, Math.abs(pos.getX(i)) / hw);
        pos.setY(i, CAP_H - DISH * (1 - u * u) + 0.005);
        uv.setY(i, vSplit + uv.getY(i) * (1 - vSplit));
    }
    const fb = frontBand(wUnits);
    const front = new THREE.PlaneGeometry(fb.hw * 2, fb.h / Math.cos(Math.atan(CAP_INSET / CAP_H)), 1, 1);
    // 正面上窄下宽，往后仰 atan(收进量 / 高)：贴片跟着仰，贴在面上
    front.rotateX(-Math.atan(CAP_INSET / CAP_H));
    const yc = (FRONT_Y0 + FRONT_Y1) / 2;
    front.translate(0, yc, fb.D / 2 - CAP_INSET * (yc / CAP_H) + 0.006);
    const fuv = front.attributes.uv;
    for (let i = 0; i < fuv.count; i++) fuv.setY(i, fuv.getY(i) * vSplit);
    const g = mergeGeometries([top.toNonIndexed(), front.toNonIndexed()]);
    g.computeVertexNormals();
    return g;
}

// 轴体：白色的上盖（上小下大）+ 一个十字轴心。平时藏在键帽底下，键帽飘起来（换乐器、深海）时才看得见
function switchGeometries() {
    const housing = new THREE.BoxGeometry(0.62, 0.11, 0.62, 1, 1, 1);
    const hp = housing.attributes.position;
    for (let i = 0; i < hp.count; i++) {
        if (hp.getY(i) > 0) {
            hp.setX(i, hp.getX(i) * 0.8);
            hp.setZ(i, hp.getZ(i) * 0.8);
        }
    }
    housing.translate(0, 0.055, 0);
    housing.computeVertexNormals();
    const a = new THREE.BoxGeometry(0.2, 0.09, 0.055);
    const b = new THREE.BoxGeometry(0.055, 0.09, 0.2);
    const stem = mergeGeometries([a, b]);
    stem.translate(0, 0.11 + 0.045, 0);
    return { housing, stem };
}

function roundedRectShape(w, h, r, ShapeClass) {
    const s = new ShapeClass();
    const x = -w / 2;
    const y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x + w, y + h - r);
    s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x + r, y + h);
    s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + r);
    s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
}

// ---------- 贴图 ----------
function radialTexture(size, stops) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// 底光用的是一块横向拉长的柔光：键盘缝里透出来的光本来就是扁的
function underglowTexture() {
    return radialTexture(128, [
        [0, "rgba(255,255,255,1)"],
        [0.35, "rgba(255,255,255,0.55)"],
        [0.7, "rgba(255,255,255,0.12)"],
        [1, "rgba(255,255,255,0)"],
    ]);
}

// ---------- 发光管的材质：视线正对处最亮、边缘淡出，看起来像一根有体积的光 ----------
function glowMaterial(color, intensity) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uIntensity: { value: intensity },
        },
        vertexShader: /* glsl */ `
            varying vec3 vN;
            varying vec3 vV;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vN = normalize(normalMatrix * normal);
                vV = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */ `
            uniform vec3 uColor;
            uniform float uIntensity;
            varying vec3 vN;
            varying vec3 vV;
            void main() {
                float f = abs(dot(normalize(vN), normalize(vV)));
                float a = pow(f, 2.4) * uIntensity;
                gl_FragColor = vec4(uColor * a, a);
                #include <colorspace_fragment>
            }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
}

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(1, 1, 1);
const GHOST = new THREE.Color("#9aa0a8");

// ============================================================
// 渐变：几种颜色之间在 OKLab 里插值（和 CSS 的 color-mix(in oklab) 一样），中间不会发灰发脏。
// 预先算好 64 档，取色只是查表
// ============================================================
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function hexToOklab(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = toLinear(((n >> 16) & 255) / 255);
    const g = toLinear(((n >> 8) & 255) / 255);
    const b = toLinear((n & 255) / 255);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

function oklabToLinear([L, a, b]) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((v) => Math.min(1, Math.max(0, v)));
}

export class Gradient {
    constructor(stops, size = 64) {
        const labs = (stops && stops.length ? stops : ["#ffffff"]).map(hexToOklab);
        this.stops = stops;
        this.size = size;
        this.lin = [];
        this.hex = [];
        for (let i = 0; i < size; i++) {
            const t = (i / (size - 1)) * (labs.length - 1);
            const k = Math.min(labs.length - 2, Math.floor(t));
            const lab = labs.length === 1 ? labs[0] : labs[k].map((v, j) => v + (labs[k + 1][j] - v) * (t - k));
            const lin = oklabToLinear(lab);
            this.lin.push(new THREE.Color().setRGB(lin[0], lin[1], lin[2])); // three 的工作色彩空间就是线性 sRGB
            this.hex.push("#" + lin.map((v) => Math.round(toSrgb(v) * 255).toString(16).padStart(2, "0")).join(""));
        }
    }

    _i(t) {
        return Math.round(Math.min(1, Math.max(0, t)) * (this.size - 1));
    }

    // 线性空间的 THREE.Color（共享的，别直接改它）
    color(t) {
        return this.lin[this._i(t)];
    }

    css(t) {
        return this.hex[this._i(t)];
    }

    // 超出 0–1 时来回折返：流动的时候颜色是一路荡过去再荡回来，不会在尽头"跳"回起点
    cycle(t) {
        const u = ((t % 2) + 2) % 2;
        return this.color(u > 1 ? 2 - u : u);
    }
}
const damp = (dt, rate) => 1 - Math.exp(-dt * rate);
const lerpAngle = (a, b, t) => a + (b - a) * t;
// 换配色时一起渐变过去的那几样（外壳、底板、旋钮、逆光、环境光、轴体上盖、轴心）
const CW_FIELDS = ["case", "plate", "knob", "glow", "hemi", "housing", "stem"];
// 相对亮度（线性空间）：给渐变键帽挑深色还是浅色的字
const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

// ============================================================
// 发光路径：一段段圆柱 + 关节处的小球，外面再套一层发光壳。
// 游戏里的走线、终局那座塔的每一层都用它。
// 所有段、所有关节各用一个 InstancedMesh 画：不管线多长，一条线就是 4 次绘制（段芯 / 段光壳 / 关节芯 / 关节光壳）。
// 以前每段每个关节各是两个网格，40 个键的线要画 160 次、终局的塔一帧上千次。颜色按实例给，渐变逐段精确取值。
// setFlow 打开后，几颗光点会顺着线一路流过去——线是"活"的，不是一根静止的灯管。
// ============================================================
const IDENTITY_Q = new THREE.Quaternion();
const ZERO_M4 = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpM4 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

// 线芯：标准材质（受光、投影），自发光按每个实例自己的颜色（标准材质的 emissive 只有一个颜色，着色器里补一句）
function pathCoreMaterial(emissiveIntensity, ghost) {
    const m = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity, roughness: 0.35, metalness: 0,
        transparent: ghost, opacity: ghost ? 0.55 : 1,
    });
    m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace(
            "vec3 totalEmissiveRadiance = emissive;",
            "vec3 totalEmissiveRadiance = emissive * vColor.rgb;"
        );
    };
    m.customProgramCacheKey = () => "glowpath-core";
    return m;
}

// 光壳：和 glowMaterial 一样"正对视线处最亮、边缘淡出"，颜色按实例
function pathGlowMaterial(intensity) {
    return new THREE.ShaderMaterial({
        uniforms: { uIntensity: { value: intensity } },
        vertexShader: /* glsl */ `
            varying vec3 vN;
            varying vec3 vV;
            varying vec3 vC;
            void main() {
                #ifdef USE_INSTANCING
                mat4 im = instanceMatrix;
                #else
                mat4 im = mat4(1.0);
                #endif
                vec4 mv = modelViewMatrix * im * vec4(position, 1.0);
                vN = normalize(normalMatrix * mat3(im) * normal);
                vV = normalize(-mv.xyz);
                #ifdef USE_INSTANCING_COLOR
                vC = instanceColor.rgb;
                #else
                vC = vec3(1.0);
                #endif
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: /* glsl */ `
            uniform float uIntensity;
            varying vec3 vN;
            varying vec3 vV;
            varying vec3 vC;
            void main() {
                float f = abs(dot(normalize(vN), normalize(vV)));
                float a = pow(f, 2.4) * uIntensity;
                gl_FragColor = vec4(vC * a, a);
                #include <colorspace_fragment>
            }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
}

export class GlowPath {
    constructor(stage, { radius = 0.055, color = "#ffffff", glow = 1, shadow = true, emissive = 1, ghost = false, gradient = null } = {}) {
        this.stage = stage;
        this.group = new THREE.Group();
        this.radius = radius;
        this.ghost = ghost;
        this.color = new THREE.Color(color);
        // 跳过的关卡在塔里是一层"虚影"：颜色褪一半、不怎么发光
        if (ghost) this.color.lerp(GHOST, 0.5);
        // 渐变：线从起点到终点换颜色
        this.gradient = gradient;
        this.span = 0;      // 这条线最终会有几个点（还在一步步画的时候，已经画好的颜色不会跟着变）
        this.shift = 0;     // 整条线的颜色沿线挪动（过关时颜色顺着线流过去）
        this.lift = 0;      // 整条线离开键盘浮起来多高
        this.liftGoal = 0;
        this.cometU = -1;
        this.emissiveBase = 1.5 * emissive * (ghost ? 0.35 : 1);
        this.glowBase = 0.55 * glow * (ghost ? 0.4 : 1);
        this.coreMat = pathCoreMaterial(this.emissiveBase, ghost);
        this.glowMat = pathGlowMaterial(this.glowBase);
        this.shadow = shadow && !ghost;
        this.points = [];
        this.segs = [];   // { a, b, p（长到了百分之几）, target }
        this.joints = []; // { pos, shown, s（缩放，出现时从 0 弹到 1）}
        this.beads = [];
        this.flow = null;
        this.growRate = 7; // 每秒长多少个键距：一步约 0.15 秒
        this.pulse = 0;
        this._animating = false;
        this._colorsDirty = false;
        this._cap = 0;
        this._ensureCapacity(32);
        stage.scene.add(this.group);
    }

    // 实例的容量不够就翻倍重建（很少发生：一条线最多几十个点）
    _ensureCapacity(n) {
        if (n <= this._cap) return;
        let cap = Math.max(32, this._cap);
        while (cap < n) cap *= 2;
        const meshes = [this.segCore, this.segHalo, this.jointCore, this.jointHalo];
        meshes.forEach((m) => {
            if (!m) return;
            this.group.remove(m);
            m.dispose();
        });
        const make = (geo, mat, order, cast) => {
            const m = new THREE.InstancedMesh(geo, mat, cap);
            m.count = 0;
            m.frustumCulled = false; // 实例一直在变，包围球跟不上，而且线总是在画面里
            m.renderOrder = order;
            m.castShadow = cast;
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            m.setColorAt(0, WHITE); // 建出 instanceColor
            m.instanceColor.setUsage(THREE.DynamicDrawUsage);
            this.group.add(m);
            return m;
        };
        this.segCore = make(this.stage._unitCylinder, this.coreMat, 0, this.shadow);
        this.segHalo = make(this.stage._unitCylinder, this.glowMat, 5, false);
        this.jointCore = make(this.stage._unitSphere, this.coreMat, 0, this.shadow);
        this.jointHalo = make(this.stage._unitSphere, this.glowMat, 5, false);
        this._cap = cap;
        this._colorsDirty = true;
    }

    setColor(color) {
        this.color.set(color);
        if (this.ghost) this.color.lerp(GHOST, 0.5);
        if (this.beadCore) {
            this.beadCore.color.copy(this.color).lerp(WHITE, 0.65);
            this.beadGlow.uniforms.uColor.value.copy(this.color);
        }
        this._colorsDirty = true;
        this.stage._touch();
    }

    // 换一套渐变（null = 单色）
    setGradient(gradient) {
        this.gradient = gradient;
        this._colorsDirty = true;
        this.stage._touch();
    }

    // 颜色沿线整体挪 s（0–1 为一整段）：只改每个实例的颜色，不碰几何
    setShift(s) {
        if (Math.abs(s - this.shift) < 1e-4) return;
        this.shift = s;
        this._colorsDirty = true;
        this.stage._touch();
    }

    // 整条线浮起来（过关：笔迹离开键盘，悬在上面）
    setLift(y) {
        this.liftGoal = y;
        this.stage._touch(true);
    }

    // 线上 t（0–1）处的颜色
    _colorAt(t, out) {
        if (!this.gradient) return out.copy(this.color);
        out.copy(this.gradient.cycle(t + this.shift));
        if (this.ghost) out.lerp(GHOST, 0.5);
        return out;
    }

    // 第 i 个点在整条线上的位置（0–1）
    _t(i) {
        const n = Math.max(this.span || 0, this.joints.length, 2);
        return i / (n - 1);
    }

    _applyColors() {
        this._colorsDirty = false;
        for (let i = 0; i < this.segs.length; i++) {
            this._colorAt(this._t(i + 0.5), tmpC);
            this.segCore.setColorAt(i, tmpC);
            this.segHalo.setColorAt(i, tmpC);
        }
        for (let i = 0; i < this.joints.length; i++) {
            this._colorAt(this._t(i), tmpC);
            this.jointCore.setColorAt(i, tmpC);
            this.jointHalo.setColorAt(i, tmpC);
        }
        this.segCore.instanceColor.needsUpdate = true;
        this.segHalo.instanceColor.needsUpdate = true;
        this.jointCore.instanceColor.needsUpdate = true;
        this.jointHalo.instanceColor.needsUpdate = true;
    }

    // 一颗亮点顺着整条线跑（u：0 起点 → 1 终点；null 收起）。过关回放时笔尖就是它
    setComet(u, { size = 1 } = {}) {
        if (u == null || u < 0 || !this.segs.length) {
            if (this.cometCore) this.cometCore.visible = this.cometHalo.visible = false;
            if (this.cometTrail) this.cometTrail.forEach((t) => { t.visible = false; });
            this.cometU = -1;
            this.stage._touch();
            return;
        }
        if (!this.cometCore) {
            this.cometMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            this.cometGlow = glowMaterial("#ffffff", 1.7);
            this.cometTrailGlow = glowMaterial("#ffffff", 0.7);
            this.cometCore = new THREE.Mesh(this.stage._unitSphere, this.cometMat);
            this.cometHalo = new THREE.Mesh(this.stage._unitSphere, this.cometGlow);
            this.cometTrail = Array.from({ length: 6 }, () => new THREE.Mesh(this.stage._unitSphere, this.cometTrailGlow));
            [this.cometCore, this.cometHalo, ...this.cometTrail].forEach((m) => { m.renderOrder = 7; this.group.add(m); });
        }
        this.cometU = u;
        const total = this.length;
        const at = (uu, out) => this._at(uu, out, total);
        const r = this.radius * size;
        at(u, this.cometCore.position);
        this.cometHalo.position.copy(this.cometCore.position);
        this.cometCore.scale.setScalar(r * 2.1);
        this.cometHalo.scale.setScalar(r * 9);
        const c = this.gradient ? this.gradient.color(u) : this.color;
        this.cometMat.color.copy(c).lerp(WHITE, 0.7);
        this.cometGlow.uniforms.uColor.value.copy(c);
        this.cometTrailGlow.uniforms.uColor.value.copy(c);
        this.cometCore.visible = this.cometHalo.visible = true;
        // 拖尾：往回按弧长均匀放几颗越来越小的光
        this.cometTrail.forEach((m, i) => {
            const back = u - ((i + 1) * 0.35) / Math.max(1, total);
            m.visible = back > 0;
            if (!m.visible) return;
            at(back, m.position);
            m.scale.setScalar(r * (6.5 - i * 0.9));
        });
        this.stage._touch();
    }

    // 线上按弧长第 u（0–1）处的点（线自己的坐标，不含浮起的高度）
    _at(u, out, total = this.length) {
        if (!this.segs.length) return out.set(0, 0, 0);
        let d = Math.max(0, Math.min(1, u)) * total;
        for (const s of this.segs) {
            const len = s.a.distanceTo(s.b);
            if (d <= len || s === this.segs[this.segs.length - 1]) return out.lerpVectors(s.a, s.b, Math.min(1, d / Math.max(1e-4, len)));
            d -= len;
        }
        return out.copy(this.segs[0].a);
    }

    // 同上，世界坐标（算上整条线浮起来的高度）：粒子从线上冒出来时用
    pointAt(u, out = new THREE.Vector3()) {
        return this._at(u, out).add(this.group.position);
    }

    // 彗星此刻在哪（世界坐标）；没在跑时 null
    cometWorld(out = new THREE.Vector3()) {
        if (this.cometU < 0 || !this.cometCore || !this.cometCore.visible) return null;
        return out.copy(this.cometCore.position).add(this.group.position);
    }

    // 正在画的那一笔的笔尖（世界坐标）；整条都画完了返回 null
    tip(out = new THREE.Vector3()) {
        for (let i = 0; i < this.segs.length; i++) {
            const s = this.segs[i];
            if (s.p >= s.target - 1e-3) continue;
            if (s.p <= 1e-4) return i > 0 ? out.copy(s.a).add(this.group.position) : null;
            return out.lerpVectors(s.a, s.b, s.p).add(this.group.position);
        }
        return null;
    }

    // 光点顺着线流动：{ count, speed（键距/秒）, size }；传 null 关掉
    setFlow(opts) {
        this.flow = opts ? { count: opts.count || 2, speed: opts.speed || 3.2, size: opts.size || 1, t: 0 } : null;
        const want = this.flow ? this.flow.count : 0;
        while (this.beads.length > want) {
            const b = this.beads.pop();
            this.group.remove(b.core, b.halo);
        }
        if (want && !this.beadCore) {
            this.beadCore = new THREE.MeshBasicMaterial({ color: this.color.clone().lerp(WHITE, 0.65) });
            this.beadGlow = glowMaterial(this.color, 1.1);
        }
        while (this.beads.length < want) {
            const core = new THREE.Mesh(this.stage._unitSphere, this.beadCore);
            const halo = new THREE.Mesh(this.stage._unitSphere, this.beadGlow);
            core.renderOrder = 6;
            halo.renderOrder = 6;
            core.visible = halo.visible = false;
            this.group.add(core, halo);
            this.beads.push({ core, halo });
        }
        this.stage._touch();
    }

    // points: Vector3[]；grow=true 时只有新增的那一段从头长出来；span：整条线最终的点数（渐变按它分配颜色）
    setPoints(points, { grow = true, span = 0 } = {}) {
        this.span = span;
        const n = Math.max(0, points.length - 1);
        // 前缀不变的段原样保留，后面的删掉重建
        let keep = 0;
        while (
            keep < this.segs.length && keep < n &&
            this.segs[keep].a.equals(points[keep]) && this.segs[keep].b.equals(points[keep + 1])
        ) keep++;
        this.segs.length = keep;
        this.joints.length = Math.min(this.joints.length, points.length, keep + 1);
        for (let i = keep; i < n; i++) {
            this.segs.push({ a: points[i].clone(), b: points[i + 1].clone(), p: grow ? 0 : 1, target: 1 });
        }
        for (let i = this.joints.length; i < points.length; i++) {
            // 关节等它前面那一段长到了再出现
            this.joints.push({ pos: points[i].clone(), shown: !grow || i === 0 || i <= keep, s: grow ? 0 : 1 });
        }
        this.points = points.map((p) => p.clone());
        this._ensureCapacity(Math.max(this.segs.length, this.joints.length));
        this._layout();
        this._applyColors();
        this.stage._touch(true);
    }

    // 还在一段段长的线一下子长满（过关回放开始时：手快的人最后几步的线可能还没画完）
    complete() {
        this.segs.forEach((s) => { s.p = s.target; });
        this._layout();
        this.stage._touch(true);
    }

    // 把已有的段全部设成未显示，再按 revealUntil 逐段放出来（终局用）
    hideAll() {
        this.dormant = true; // 连起点那颗圆点也先藏着，等 revealAll 再出来
        this.segs.forEach((s) => { s.p = 0; s.target = 0; });
        this.joints.forEach((j) => { j.shown = false; j.s = 0; });
        this._layout();
        this.stage._touch(true);
    }

    revealAll(rate) {
        if (rate) this.growRate = rate;
        this.dormant = false;
        this.segs.forEach((s) => { s.target = 1; });
        this.stage._touch(true);
    }

    // 把每一段、每个关节的位置 / 缩放写进实例矩阵
    _layout() {
        const r = this.radius;
        this.segs.forEach((s, i) => {
            const len = tmpV.subVectors(s.b, s.a).length();
            const shown = len * s.p;
            if (shown <= 1e-4) {
                this.segCore.setMatrixAt(i, ZERO_M4);
                this.segHalo.setMatrixAt(i, ZERO_M4);
                return;
            }
            tmpV.normalize();
            tmpQ.setFromUnitVectors(UP, tmpV);
            tmpV2.copy(s.a).addScaledVector(tmpV, shown / 2);
            tmpM4.compose(tmpV2, tmpQ, tmpS.set(r, shown, r));
            this.segCore.setMatrixAt(i, tmpM4);
            tmpM4.compose(tmpV2, tmpQ, tmpS.set(r * 3.2, shown, r * 3.2));
            this.segHalo.setMatrixAt(i, tmpM4);
        });
        let animating = false;
        this.joints.forEach((j, i) => {
            // 第 i 个关节等第 i-1 段长满才亮
            const ready = !this.dormant && (i === 0 || (this.segs[i - 1] && this.segs[i - 1].p > 0.98));
            const on = j.shown || ready;
            j.shown = on;
            const goal = on ? 1 : 0;
            j.s += (goal - j.s) * 0.35;
            if (Math.abs(goal - j.s) > 0.01) animating = true;
            else j.s = goal;
            if (j.s <= 0.02) {
                this.jointCore.setMatrixAt(i, ZERO_M4);
                this.jointHalo.setMatrixAt(i, ZERO_M4);
                return;
            }
            const sr = r * 1.06 * j.s;
            tmpM4.compose(j.pos, IDENTITY_Q, tmpS.setScalar(sr));
            this.jointCore.setMatrixAt(i, tmpM4);
            tmpM4.compose(j.pos, IDENTITY_Q, tmpS.setScalar(sr * 3.2));
            this.jointHalo.setMatrixAt(i, tmpM4);
        });
        this.segCore.count = this.segHalo.count = this.segs.length;
        this.jointCore.count = this.jointHalo.count = this.joints.length;
        this.segCore.instanceMatrix.needsUpdate = true;
        this.segHalo.instanceMatrix.needsUpdate = true;
        this.jointCore.instanceMatrix.needsUpdate = true;
        this.jointHalo.instanceMatrix.needsUpdate = true;
        this._animating = animating;
    }

    // 光点：沿着已经画出来的那部分线走；走到头歇一小会儿再从起点出发
    _updateBeads(dt) {
        const F = this.flow;
        if (!F || !this.beads.length) return false;
        const shown = [];
        let total = 0;
        for (const s of this.segs) {
            const len = s.a.distanceTo(s.b) * s.p;
            if (len <= 1e-4) break;
            shown.push({ s, len });
            total += len;
            if (s.p < 0.999) break;
        }
        if (total < 0.6 || this.dormant) {
            this.beads.forEach((b) => { b.core.visible = b.halo.visible = false; });
            return false;
        }
        F.t += dt;
        const gap = 1.6;
        const cycle = total + gap;
        const r = this.radius * F.size;
        this.beads.forEach((b, i) => {
            const d = (F.t * F.speed + (i * cycle) / this.beads.length) % cycle;
            if (d > total) {
                b.core.visible = b.halo.visible = false;
                return;
            }
            let acc = 0;
            for (const { s, len } of shown) {
                if (d <= acc + len || s === shown[shown.length - 1].s) {
                    const u = Math.min(1, (d - acc) / Math.max(1e-4, s.a.distanceTo(s.b)));
                    b.core.position.lerpVectors(s.a, s.b, u);
                    b.halo.position.copy(b.core.position);
                    break;
                }
                acc += len;
            }
            // 起点和终点附近淡入淡出，不会凭空冒出来
            const fade = Math.max(0, Math.min(1, d / 0.5, (total - d) / 0.5));
            b.core.visible = b.halo.visible = fade > 0.02;
            b.core.scale.setScalar(Math.max(1e-4, r * 1.25 * fade));
            b.halo.scale.setScalar(Math.max(1e-4, r * 5.5 * fade));
        });
        return true;
    }

    // 返回位标志：1 = 画面有变化（要重画），2 = 有东西真的动了（阴影要更新）
    update(dt) {
        let moving = false;
        // 一段一段顺着长：前一段没长满，后面的不动——像一支笔在走，不是整条同时浮现
        let budget = dt * this.growRate;
        for (const s of this.segs) {
            if (s.p > s.target) {
                s.p = s.target;
                moving = true;
                continue;
            }
            if (s.p >= s.target - 1e-4) continue;
            const len = Math.max(0.001, s.a.distanceTo(s.b));
            const use = Math.min(budget, (s.target - s.p) * len);
            s.p += use / len;
            budget -= use;
            moving = true;
            if (budget <= 1e-6) break;
        }
        const pulsing = this.pulse > 0;
        if (pulsing) this.pulse = Math.max(0, this.pulse - dt * 1.4);
        this.coreMat.emissiveIntensity = this.emissiveBase + this.pulse * 2.2;
        this.glowMat.uniforms.uIntensity.value = this.glowBase + this.pulse * 0.9;
        if (moving || this._animating) this._layout();
        const recolor = this._colorsDirty;
        if (recolor) this._applyColors();
        const beads = this._updateBeads(dt);
        // 浮起 / 落下
        let lifting = false;
        if (Math.abs(this.liftGoal - this.lift) > 1e-3) {
            this.lift += (this.liftGoal - this.lift) * damp(dt, 2.6);
            lifting = true;
        } else if (this.lift !== this.liftGoal) {
            this.lift = this.liftGoal;
            lifting = true;
        }
        this.group.position.y = this.lift;
        // 光点沿线慢慢流只算"慢"变化；长线、浮起、变色、闪一下都算"快"
        const fast = moving || this._animating || pulsing || lifting || recolor;
        return (fast || beads ? 1 : 0) | (moving || this._animating || lifting ? 2 : 0) | (fast ? 4 : 0);
    }

    get finished() {
        return this.segs.every((s) => s.p >= s.target - 1e-3);
    }

    get length() {
        return this.segs.reduce((sum, s) => sum + s.a.distanceTo(s.b), 0);
    }

    dispose() {
        this.stage.scene.remove(this.group);
        [this.segCore, this.segHalo, this.jointCore, this.jointHalo].forEach((m) => m.dispose());
        this.coreMat.dispose();
        this.glowMat.dispose();
        if (this.cometMat) {
            this.cometMat.dispose();
            this.cometGlow.dispose();
            this.cometTrailGlow.dispose();
        }
        if (this.beadCore) {
            this.beadCore.dispose();
            this.beadGlow.dispose();
        }
    }
}

// ============================================================
// 舞台
// ============================================================
export class KeyboardStage {
    constructor({ legendFont = '"JetBrains Mono", ui-monospace, monospace', brandFont = '"Unbounded", system-ui, sans-serif' } = {}) {
        this.legendFont = legendFont;
        this.brandFont = brandFont;
        this.listeners = {};
        this.interactive = () => false;
        this.lastFrame = 0; // 上一帧的 performance.now()（THREE.Clock 在 r18x 里已经弃用）
        this.time = 0;
        this.visible = false;
        this.container = null;
        this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        // ---- renderer ----
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
        });
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        // Neutral 映射尽量保住键帽本来的颜色，ACES 会把饱和的配色洗灰
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap; // r18x 起 PCF 本身就是软阴影，PCFSoft 已移除
        // 阴影图不每帧重算：只有键帽、旋钮、光路这些投影的东西真的动了才算（镜头转动不影响阴影图）
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = true;
        this.renderer = renderer;
        this.canvas = renderer.domElement;
        this.canvas.className = "kb-canvas";
        this.maxAniso = renderer.capabilities.getMaxAnisotropy();

        // ---- scene ----
        const scene = new THREE.Scene();
        this.scene = scene;
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = 0.7;
        pmrem.dispose();

        this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);

        // ---- lights ----
        const center = new THREE.Vector3(BOARD_W / 2, 0, BOARD_D / 2);
        this.center = center;
        this.hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.35);
        scene.add(this.hemi);

        // 主光从左前上方打下来：键帽顶面亮、侧壁暗，立体感主要靠这一对明暗
        const key = new THREE.DirectionalLight(0xffffff, 3.4);
        key.position.set(center.x - 3, 14, center.z + 9);
        key.target.position.copy(center);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        const sc = key.shadow.camera;
        sc.left = -12; sc.right = 12; sc.top = 10; sc.bottom = -10; sc.near = 2; sc.far = 40;
        key.shadow.bias = -0.0004;
        key.shadow.normalBias = 0.02;
        key.shadow.radius = 3;
        scene.add(key, key.target);
        this.keyLight = key;

        // 逆光：外壳边缘和键帽背面勾出一圈主题色
        this.rim = new THREE.PointLight(0xffffff, 26, 30, 1.6);
        this.rim.position.set(center.x + 3, 5, center.z - 7);
        scene.add(this.rim);

        // ---- 共享几何 ----
        this._unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
        this._unitSphere = new THREE.SphereGeometry(1, 16, 12);
        this._glowTex = underglowTexture();

        // ---- 模型 ----
        this.board = new THREE.Group();
        scene.add(this.board);
        this._buildCase();
        this._buildKeys();
        this._buildKnob();
        this._buildTargetRing();

        // ---- 镜头 ----
        this.view = null;
        this.pose = { target: center.clone(), az: 0, el: 40, dist: 30, fov: 28, shift: 0, shiftX: 0 };
        this.goal = { target: center.clone(), az: 0, el: 40, dist: 30, fov: 28, shift: 0, shiftX: 0 };
        this.parallax = { x: 0, y: 0, tx: 0, ty: 0, amount: 1 };
        this.orbit = { enabled: false, az: 0, el: 0, auto: 0, dragging: false, idle: 0 };

        // 渲染按需进行：画面没有任何变化时跳过 render，空转的一帧只剩几十个数字的比较
        this._forceRender = 3;
        this._shadowDirty = true;
        this.inView = true;
        this.pixelRatio = 1;
        this.maxPixelRatio = 1;
        this._perf = { sum: 0, n: 0, changedAt: 0, good: 0 };
        this.ripples = [];
        this.cinematic = false;
        // 灯光氛围（情绪）：主光颜色 + 曝光，平滑过渡。
        // dream：过关的梦境里整块键盘暗下去（主光、曝光压低，逆光提亮），发光的东西才显出来
        this._light = {
            tint: new THREE.Color(1, 1, 1), tintGoal: new THREE.Color(1, 1, 1),
            exposure: 1.05, exposureGoal: 1.05, keyScale: 1, keyScaleGoal: 1,
            dream: 0, dreamGoal: 0, dreamBright: 0,
        };
        this.envBase = scene.environmentIntensity;

        // 渐变：配色里的几种颜色从键盘左下铺到右上。soft = 静止的渐变；flow = 慢慢流动；off = 单色
        this.gradient = new Gradient(["#ffffff"]);
        this.gradientMode = "soft";
        this._flow = { phase: 0, acc: 0 };

        this.path = new GlowPath(this, { radius: 0.05 });
        this.extraPaths = new Set();
        this.tickers = new Set();
        // 外挂的"层"（深海模式）：每帧 update(dt) 返回要不要重画；post 不为空时由它来画（后期处理）
        this.layers = new Set();
        this.post = null;
        // 灯光覆盖：深海模式要把主光压暗、逆光拉满，不让配色 / 情绪灯光每帧写回去
        this.lightOverride = null;

        this._bindInput();
        this._resizeObs = new ResizeObserver(() => this._resize());
        // 键盘滚出屏幕（比如音乐模式往下翻到曲库）就整个停下来
        this._io = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (e.target !== this.container) return;
                this.inView = e.isIntersecting;
                this._syncRunning();
            });
        });
        this._loop = this._loop.bind(this);
        document.addEventListener("visibilitychange", () => this._syncRunning());

        // 字体加载完再画一遍字，不然第一眼可能是后备字体
        if (document.fonts && document.fonts.load) {
            Promise.all([
                document.fonts.load(`600 64px ${this.legendFont}`),
                document.fonts.load(`700 64px ${this.brandFont}`),
            ]).then(() => {
                this.keys.forEach((k) => { k.legendDirty = true; });
                if (this.nameplate) {
                    this.nameplate.key = "";
                    this._drawNameplate(this.colorway);
                    this._touch();
                }
            });
        }
    }

    // ---------------- 模型搭建 ----------------
    _buildCase() {
        const W = BOARD_W + 2 * PAD + 2 * RIM;
        const D = BOARD_D + 2 * PAD + 2 * RIM;
        const bevel = 0.09;
        const depth = RIM_TOP - CASE_BOTTOM - 2 * bevel;
        const outer = roundedRectShape(W, D, 0.52, THREE.Shape);
        const hole = roundedRectShape(W - 2 * RIM, D - 2 * RIM, 0.2, THREE.Path);
        outer.holes.push(hole);
        const geo = new THREE.ExtrudeGeometry(outer, {
            depth,
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: 6,
            curveSegments: 20,
        });
        geo.rotateX(-Math.PI / 2);
        geo.translate(this.center.x, CASE_BOTTOM + bevel, this.center.z);
        this.caseMat = new THREE.MeshPhysicalMaterial({
            color: 0x10403b,
            metalness: 0.55,
            roughness: 0.36,
            clearcoat: 0.45,
            clearcoatRoughness: 0.28,
        });
        const caseMesh = new THREE.Mesh(geo, this.caseMat);
        caseMesh.castShadow = true;
        caseMesh.receiveShadow = true;
        this.board.add(caseMesh);

        // 底板（键帽下面那块）+ 全部轴体合并成一个网格
        this.plateMat = new THREE.MeshStandardMaterial({ color: 0x0a211f, roughness: 0.85, metalness: 0.2 });
        const plateGeo = new RoundedBoxGeometry(W - 2 * RIM + 0.02, 0.12, D - 2 * RIM + 0.02, 2, 0.12);
        plateGeo.translate(this.center.x, -0.06, this.center.z);
        const plate = new THREE.Mesh(plateGeo, this.plateMat);
        plate.receiveShadow = true;
        this.board.add(plate);

        // 底面封口（从很低的角度看时不至于看穿）
        const bottomGeo = new THREE.PlaneGeometry(W - 0.4, D - 0.4);
        bottomGeo.rotateX(Math.PI / 2);
        bottomGeo.translate(this.center.x, CASE_BOTTOM + 0.01, this.center.z);
        this.board.add(new THREE.Mesh(bottomGeo, this.caseMat));

        // 贴地的接触阴影：透明画布上也能"落"在页面上
        const shadowTex = radialTexture(256, [
            [0, "rgba(0,0,0,0.75)"],
            [0.55, "rgba(0,0,0,0.35)"],
            [1, "rgba(0,0,0,0)"],
        ]);
        const contact = new THREE.Mesh(
            new THREE.PlaneGeometry(W * 1.28, D * 1.9),
            new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.75 })
        );
        contact.rotation.x = -Math.PI / 2;
        contact.position.set(this.center.x, CASE_BOTTOM - 0.02, this.center.z + 0.4);
        contact.renderOrder = -1;
        this.contactShadow = contact;
        this.board.add(contact);

        // 铭牌：外壳正面左边一块小金属牌，刻着这套配色的名字（像客制化键盘的铭牌）
        const npCanvas = document.createElement("canvas");
        npCanvas.width = 640;
        npCanvas.height = 80;
        const npTex = new THREE.CanvasTexture(npCanvas);
        npTex.colorSpace = THREE.SRGBColorSpace;
        npTex.anisotropy = this.maxAniso;
        this.nameplateMat = new THREE.MeshStandardMaterial({
            map: npTex, transparent: true, metalness: 0.55, roughness: 0.32,
            emissive: 0xffffff, emissiveMap: npTex, emissiveIntensity: 0,
            polygonOffset: true, polygonOffsetFactor: -2,
        });
        const np = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.35), this.nameplateMat);
        // 倒角让外壳正面往外鼓了 bevel：铭牌要贴在鼓出来的那个面上
        np.position.set(0.5 + 1.4, -0.16, this.center.z + D / 2 + bevel + 0.004);
        np.receiveShadow = true;
        this.nameplate = { mesh: np, canvas: npCanvas, ctx: npCanvas.getContext("2d"), tex: npTex, key: "" };
        this.board.add(np);

        const catcher = new THREE.Mesh(
            new THREE.PlaneGeometry(80, 80),
            new THREE.ShadowMaterial({ opacity: 0.28 })
        );
        catcher.rotation.x = -Math.PI / 2;
        catcher.position.set(this.center.x, CASE_BOTTOM - 0.01, this.center.z);
        catcher.receiveShadow = true;
        this.board.add(catcher);
    }

    _buildKeys() {
        this.keys = new Map();
        this.capMeshes = [];
        const housingGeos = [];
        const stemGeos = [];
        const sw = switchGeometries();

        LAYOUT.forEach((spec) => {
            const cx = spec.x + spec.w / 2;
            const cz = spec.z + 0.5;
            const group = new THREE.Group();
            group.position.set(cx, 0, cz);
            this.board.add(group);

            const sculpt = ROW_SCULPT[spec.row] || ROW_SCULPT[3];
            const holder = new THREE.Group();
            holder.position.y = STEM_H + sculpt.lift;
            holder.rotation.x = sculpt.tilt;
            group.add(holder);

            const capMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.52, metalness: 0.02 });
            const cap = new THREE.Mesh(capGeometry(spec.w), capMat);
            cap.castShadow = true;
            cap.receiveShadow = true;
            cap.userData.keyId = spec.id;
            holder.add(cap);
            this.capMeshes.push(cap);

            // 字：一张跟着顶面凹下去的透明贴片 + 正面一条字带，同一张画布（上面 texH 行是顶面，下面 frontH 行是正面）
            const texH = 160;
            const top = capTop(spec.w);
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(texH * top.hw / top.hd);
            const fb = frontBand(spec.w);
            // 正面字带按实际长宽比该有多高；太矮字会糊，至少给 48 行，画的时候再按比例压回去
            const frontNatural = (canvas.width * fb.h) / (2 * fb.hw);
            const frontH = Math.max(48, Math.round(frontNatural));
            canvas.height = texH + frontH;
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = this.maxAniso;
            const legendMat = new THREE.MeshStandardMaterial({
                map: texture,
                transparent: true,
                depthWrite: false,
                roughness: 0.6,
                emissive: 0xffffff,
                emissiveMap: texture,
                emissiveIntensity: 0,
                polygonOffset: true,
                polygonOffsetFactor: -2,
            });
            const legend = new THREE.Mesh(legendGeometry(spec.w, frontH / (texH + frontH)), legendMat);
            legend.renderOrder = 2;
            cap.add(legend);

            // 底光
            const glowMat = new THREE.MeshBasicMaterial({
                map: this._glowTex,
                color: 0xffffff,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
            const glow = new THREE.Mesh(new THREE.PlaneGeometry(spec.w * 1.5 + 0.35, 1.85), glowMat);
            glow.rotation.x = -Math.PI / 2;
            glow.position.y = 0.006;
            glow.renderOrder = 1;
            glow.visible = false;
            group.add(glow);

            housingGeos.push(sw.housing.clone().translate(cx, 0, cz));
            stemGeos.push(sw.stem.clone().translate(cx, 0, cz));

            this.keys.set(spec.id, {
                spec, group, holder, cap, legend, glow,
                capMat, legendMat, glowMat, canvas,
                ctx: canvas.getContext("2d"),
                texture,
                texH, frontH, frontScale: frontH / frontNatural,
                baseTilt: sculpt.tilt,
                // 飘起来：fy 高度、frx / frz 倾斜（换乐器的动画每帧写）；tier：深海模式里一排比一排高（慢慢长过去）
                fy: 0, frx: 0, frz: 0, tier: 0, tierV: 0, tierAt: 0,
                baseLift: holder.position.y,
                base: new THREE.Color(),
                baseGoal: new THREE.Color(),
                legendColor: "#ffffff",
                glowColor: new THREE.Color(1, 1, 1),
                t: { press: 0, lift: 0, dim: 0, glow: 0, emissive: 0, legendGlow: 0 },
                v: { press: 0, lift: 0, dim: 0, glow: 0, emissive: 0, legendGlow: 0 },
                pulse: 0,
                popAt: -1,
                shakeAt: -1,
                flareAt: -1,
                hover: 0,
                held: false,
                legendData: {},
                legendDirty: true,
                tint: null,
                // 这颗键在渐变上的位置：左下 0 → 右上 1
                gradT: Math.min(1, Math.max(0, (cx - 0.4 * cz + 1.8) / 17.1)),
            });
        });

        // 全部轴体合成两个网格（上盖一个、轴心一个），两次绘制
        this.switchMat = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.42, metalness: 0 });
        this.stemMat = new THREE.MeshStandardMaterial({ color: 0xe0b454, roughness: 0.5, metalness: 0 });
        const housings = new THREE.Mesh(mergeGeometries(housingGeos), this.switchMat);
        const stems = new THREE.Mesh(mergeGeometries(stemGeos), this.stemMat);
        housings.receiveShadow = stems.receiveShadow = true;
        this.board.add(housings, stems);
        sw.housing.dispose();
        sw.stem.dispose();
    }

    _buildKnob() {
        // 旋钮：车了一圈倒角的金属圆柱，顶上一道刻线指示角度
        const pts = [];
        const R = 0.37;
        const H = 0.52;
        pts.push(new THREE.Vector2(0, 0));
        pts.push(new THREE.Vector2(R - 0.02, 0));
        pts.push(new THREE.Vector2(R, 0.03));
        pts.push(new THREE.Vector2(R, H - 0.07));
        pts.push(new THREE.Vector2(R - 0.035, H - 0.015));
        pts.push(new THREE.Vector2(R - 0.08, H));
        pts.push(new THREE.Vector2(0, H));
        const geo = new THREE.LatheGeometry(pts, 64);
        this.knobMat = new THREE.MeshPhysicalMaterial({
            color: 0xd9a441, metalness: 0.9, roughness: 0.26, clearcoat: 0.3,
        });
        const knob = new THREE.Mesh(geo, this.knobMat);
        knob.castShadow = true;
        knob.userData.keyId = "knob";
        const notch = new THREE.Mesh(
            new THREE.BoxGeometry(0.035, 0.012, 0.2),
            new THREE.MeshStandardMaterial({ color: 0x1a1206, roughness: 0.8 })
        );
        notch.position.set(0, H + 0.004, -0.17);
        knob.add(notch);
        knob.position.set(15.5, 0.05, 0.5);
        this.board.add(knob);
        this.knob = knob;
        this.knobValue = 0.9;
        this.knobShown = 0.9;
        this.capMeshes.push(knob);
    }

    _buildTargetRing() {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.44, 0.04, 14, 64),
            new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6 })
        );
        ring.rotation.x = -Math.PI / 2;
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.13, 12, 64), glowMaterial("#ffffff", 0.7));
        halo.rotation.x = -Math.PI / 2;
        g.add(ring, halo);
        g.visible = false;
        this.scene.add(g);
        this.target = { group: g, ring, halo, id: null, s: 0 };
    }

    // ---------------- 配色 ----------------
    // hold：键帽先保持原来的颜色，等 releaseColorway 一颗颗放开（换乐器时让一条线"刷"过去换色）
    setColorway(cw, { instant = false, hold = false } = {}) {
        this.colorway = cw;
        const C = (hex) => new THREE.Color(hex);
        this._cwGoal = {
            case: C(cw.case), plate: C(cw.plate), knob: C(cw.knob),
            glow: C(cw.glow), hemi: C(cw.highlight),
            // 轴体：乳白的上盖（带一点这套配色底板的色），轴心是旋钮那种金属色
            housing: C(cw.switchHousing || "#ebe8e1").lerp(C(cw.plate), cw.switchHousing ? 0 : 0.1),
            stem: C(cw.switchStem || cw.knob || cw.accent),
        };
        this.gradient = new Gradient(cw.grad || [cw.glow, cw.highlight, cw.accent]);
        if (this.capGrad && this.capGrad.follow) this.capGrad.gradient = this.gradient;
        this.keys.forEach((k) => {
            const role = k.spec.role;
            k.roleColor = C(role === "alpha" ? cw.alpha : role === "accent" ? cw.accent : cw.mod);
            k.baseGoal.copy(this._capColor(k));
            const legendColor = this._legendColorFor(k, role === "alpha" ? cw.alphaLegend : role === "accent" ? cw.accentLegend : cw.modLegend);
            k.cwHold = hold && !instant;
            if (k.cwHold) {
                k.pendingLegend = legendColor; // 字的颜色也等键帽换色时一起换，不然会有一瞬间白字落在白键帽上
            } else {
                k.legendColor = legendColor;
                k.pendingLegend = null;
                k.legendDirty = true;
            }
            if (!k.tint) k.glowColor.copy(this._defaultGlow(k));
            if (instant) k.base.copy(k.baseGoal);
        });
        this.path.setColor(cw.glow);
        this.path.setGradient(this.gradientMode === "off" ? null : this.gradient);
        // 光环用强调色：黑白钢琴那套的底光是白的，白光环落在白键帽上就看不见了
        this.target.ring.material.color.set(cw.accent);
        this.target.ring.material.emissive.set(cw.accent);
        this.target.halo.material.uniforms.uColor.value.set(cw.accent);
        if (instant || !this._cwNow) {
            this._cwNow = {};
            CW_FIELDS.forEach((f) => { this._cwNow[f] = this._cwGoal[f].clone(); });
        }
        this.legendGlowBase = cw.legendGlow ? 1.15 : 0;
        this._drawNameplate(cw);
        this._touch();
    }

    // 铭牌：一块圆角金属牌（旋钮那种金属色），名字是刻进去的——字比牌面深，下沿一道亮边像刻痕反光
    _drawNameplate(cw) {
        const N = this.nameplate;
        if (!N || !cw) return;
        const title = String(cw.en || "").toUpperCase();
        const key = title + cw.name + cw.knob + cw.case;
        if (key === N.key) return;
        N.key = key;
        const c = N.ctx;
        const W = N.canvas.width;
        const H = N.canvas.height;
        c.clearRect(0, 0, W, H);
        const r = H * 0.28;
        const path = () => {
            c.beginPath();
            c.moveTo(r, 2);
            c.lineTo(W - r, 2);
            c.quadraticCurveTo(W - 2, 2, W - 2, r);
            c.lineTo(W - 2, H - r);
            c.quadraticCurveTo(W - 2, H - 2, W - r, H - 2);
            c.lineTo(r, H - 2);
            c.quadraticCurveTo(2, H - 2, 2, H - r);
            c.lineTo(2, r);
            c.quadraticCurveTo(2, 2, r, 2);
            c.closePath();
        };
        const metal = new THREE.Color(cw.knob || cw.accent);
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#" + metal.clone().lerp(WHITE, 0.35).getHexString());
        g.addColorStop(0.55, "#" + metal.getHexString());
        g.addColorStop(1, "#" + metal.clone().multiplyScalar(0.62).getHexString());
        path();
        c.fillStyle = g;
        c.fill();
        c.lineWidth = 2;
        c.strokeStyle = "rgba(255,255,255,0.35)";
        c.stroke();
        const ink = "#" + new THREE.Color(cw.case).multiplyScalar(0.55).getHexString();
        c.textBaseline = "middle";
        c.font = `700 ${Math.round(H * 0.42)}px ${this.brandFont}`;
        c.letterSpacing = `${Math.round(H * 0.08)}px`;
        const tw = c.measureText(title).width;
        c.font = `600 ${Math.round(H * 0.4)}px "PingFang SC", "Songti SC", system-ui, sans-serif`;
        c.letterSpacing = "0px";
        const zw = c.measureText(cw.name || "").width;
        const gap = H * 0.5;
        let x = (W - (tw + gap + zw + H * 0.2)) / 2;
        const y = H * 0.54;
        // 刻痕：先在下面一像素画一道亮的，再画深色的字
        const engrave = (draw) => {
            c.fillStyle = "rgba(255,255,255,0.45)";
            draw(1.5);
            c.fillStyle = ink;
            draw(0);
        };
        engrave((dy) => {
            c.font = `700 ${Math.round(H * 0.42)}px ${this.brandFont}`;
            c.letterSpacing = `${Math.round(H * 0.08)}px`;
            c.fillText(title, x, y + dy);
        });
        x += tw + gap * 0.5;
        c.fillStyle = ink;
        c.beginPath();
        c.arc(x, y, H * 0.06, 0, Math.PI * 2);
        c.fill();
        x += gap * 0.5;
        engrave((dy) => {
            c.font = `600 ${Math.round(H * 0.4)}px "PingFang SC", "Songti SC", system-ui, sans-serif`;
            c.letterSpacing = "0px";
            c.fillText(cw.name || "", x, y + dy);
        });
        c.letterSpacing = "0px";
        N.tex.needsUpdate = true;
        // 深色、字透光的那几套：铭牌也微微亮一点
        this.nameplateMat.emissiveIntensity = cw.legendGlow ? 0.18 : 0;
    }

    // 放开 hold 住的键帽，让它们换成新配色（pred(k) 为真的那些；不传就全部放开）
    releaseColorway(pred = null) {
        this.keys.forEach((k) => {
            if (!k.cwHold || (pred && !pred(k))) return;
            k.cwHold = false;
            k.fastSwap = true;
            if (k.pendingLegend) {
                k.legendColor = k.pendingLegend;
                k.pendingLegend = null;
                k.legendDirty = true;
            }
        });
        this._cwDirty = true;
        this._touch();
    }

    // 取景参数（target / az / el / dist）→ 镜头的位置和看向（不算视差和拖动）
    _camFrom(p) {
        const az = THREE.MathUtils.degToRad(p.az);
        const el = THREE.MathUtils.degToRad(p.el);
        const pos = new THREE.Vector3(
            p.target.x + p.dist * Math.sin(az) * Math.cos(el),
            p.target.y + p.dist * Math.sin(el),
            p.target.z + p.dist * Math.cos(az) * Math.cos(el)
        );
        return { pos, look: p.target.clone(), fov: p.fov };
    }

    // 平常取景下镜头"该在"的位置（过场动画飞回去的终点）
    goalCamera() {
        return this._camFrom(this.goal);
    }

    // 镜头直接接管：fn(time) 每帧给出 { pos, look, fov }（过场动画用）；传 null 交还给平常的取景，从当前机位平滑地回去
    setFlyCam(fn) {
        this.flyCam = fn;
        this._camDirty = true;
        this._touch();
    }

    // 渐变：soft（静止）/ flow（慢慢流动）/ off（单色，和以前一样）
    setGradientMode(mode) {
        const m = mode === "flow" || mode === "off" ? mode : "soft";
        if (m === this.gradientMode) return;
        this.gradientMode = m;
        this.keys.forEach((k) => {
            if (!k.tint) k.glowColor.copy(this._defaultGlow(k));
            k.baseGoal.copy(this._capColor(k));
            k._flowDirty = true;
        });
        this.path.setGradient(m === "off" ? null : this.gradient);
        this._touch();
    }

    // 渐变上 t 处的颜色（CSS 十六进制）：界面上的徽标、走线序号跟 3D 里的颜色对得上
    gradientColor(t) {
        return this.gradientMode === "off" ? (this.colorway ? this.colorway.glow : "#ffffff") : this.gradient.css(t);
    }

    // 一颗键平时的底光颜色：渐变上它那个位置的颜色（流动时再加上相位）
    _defaultGlow(k) {
        if (this.gradientMode === "off" || !this.colorway) return new THREE.Color(this.colorway ? this.colorway.glow : "#ffffff");
        return this.gradient.cycle(k.gradT * 0.92 + (this.gradientMode === "flow" ? this._flow.phase : 0));
    }

    // 键帽本身的颜色：配色里写了 gradCaps 的（流光、寰宇……），字母键也染上一层渐变。
    // 打开了"渐变键帽"（音乐模式里选的）：整块键盘从左下到右上铺一道渐变——
    // 字母键取渐变上自己那个位置的颜色，功能键同一个颜色压暗一截（双色键帽那种层次），强调键取对面那一头（或者渐变自带的点缀色）
    _capColor(k) {
        const cw = this.colorway;
        const c = (k._capTmp || (k._capTmp = new THREE.Color())).copy(k.roleColor || WHITE);
        const G = this.capGrad;
        if (G && G.gradient) {
            const role = k.spec.role;
            if (role === "accent") {
                if (G.accent) c.copy(G.accent);
                else c.copy(G.gradient.color(1 - k.gradT)).lerp(WHITE, 0.12);
            } else {
                c.copy(G.gradient.color(k.gradT));
                if (role === "mod") c.multiplyScalar(0.55);
            }
            return c;
        }
        const amt = cw && cw.gradCaps && this.gradientMode !== "off" && k.spec.role === "alpha" ? cw.gradCaps : 0;
        if (amt > 0) c.lerp(this._defaultGlow(k), amt);
        return c;
    }

    // 字的颜色：平常用配色里写好的；渐变键帽上每颗键颜色都不一样，按键帽亮度挑深字或浅字（带一点键帽自己的色）
    _legendColorFor(k, fallback) {
        if (!this.capGrad || !this.capGrad.gradient) return fallback;
        const cap = this._capColor(k);
        const out = cap.clone();
        if (luma(cap) > 0.28) out.multiplyScalar(0.16);
        else out.lerp(WHITE, 0.86);
        return "#" + out.getHexString(THREE.SRGBColorSpace);
    }

    // 渐变键帽：opts = { stops: [...], accent } 固定的一组颜色；{ follow: true } 跟着当前配色自己的渐变；null 关掉
    setCapGradient(opts) {
        if (!opts) this.capGrad = null;
        else if (opts.follow) this.capGrad = { follow: true, gradient: this.gradient, accent: null };
        else this.capGrad = { follow: false, gradient: new Gradient(opts.stops), accent: opts.accent ? new THREE.Color(opts.accent) : null };
        if (this.colorway) {
            const cw = this.colorway;
            this.keys.forEach((k) => {
                const role = k.spec.role;
                k.baseGoal.copy(this._capColor(k));
                const lc = this._legendColorFor(k, role === "alpha" ? cw.alphaLegend : role === "accent" ? cw.accentLegend : cw.modLegend);
                if (k.cwHold) k.pendingLegend = lc;
                else if (lc !== k.legendColor) {
                    k.legendColor = lc;
                    k.legendDirty = true;
                }
            });
            this._cwDirty = true;
        }
        this._touch();
    }

    // 流动：底光（和染色的键帽）慢慢换颜色。只有开了"流光"才每帧推，30fps 就够顺
    _updateFlow(dt) {
        if (this.gradientMode !== "flow" || this.reduced) return false;
        const F = this._flow;
        F.acc += dt;
        if (F.acc < 1 / 30) return false;
        F.phase += F.acc * 0.07;
        F.acc = 0;
        const tinted = this.colorway && this.colorway.gradCaps;
        this.keys.forEach((k) => {
            if (!k.tint) k.glowColor.copy(this._defaultGlow(k));
            if (tinted && k.spec.role === "alpha") {
                k.baseGoal.copy(this._capColor(k));
                k.base.copy(k.baseGoal);
            }
            k._flowDirty = true;
        });
        return true;
    }

    // 情绪的灯光：{ tint: 主光颜色, exposure: 曝光, key: 主光强度倍数 }
    setLighting({ tint = "#ffffff", exposure = 1.05, key = 1 } = {}) {
        this._light.tintGoal.set(tint);
        this._light.exposureGoal = exposure;
        this._light.keyScaleGoal = key;
        this._touch();
    }

    // 梦境的暗场：0 = 平常，1 = 夜里（慢慢过渡过去）。
    // bright：这套配色本身有多亮（0–1）。浅色的外壳 / 键帽要压得更深、逆光少给一点，不然边缘一圈高光会被泛光放大成一道白边
    setDreamLight(v, { bright = 0 } = {}) {
        this._light.dreamGoal = Math.max(0, Math.min(1, v));
        if (v > 0) this._light.dreamBright = Math.max(0, Math.min(1, bright));
        this._touch();
    }

    // 电影感：镜头更慢、视差更小
    setCinematic(on) {
        this.cinematic = !!on;
        this._touch();
    }

    // 标记"下一帧必须画"；moved = 有投影的东西动了，阴影图也要重算
    _touch(moved = false) {
        this._forceRender = Math.max(this._forceRender, 2);
        if (moved) this._shadowDirty = true;
    }

    _updateColorway(dt) {
        if (!this._cwNow) return false;
        const k = damp(dt, 5);
        const n = this._cwNow;
        const g = this._cwGoal;
        let diff = 0;
        const d3 = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
        CW_FIELDS.forEach((f) => {
            diff = Math.max(diff, d3(n[f], g[f]));
            n[f].lerp(g[f], k);
        });
        this.caseMat.color.copy(n.case);
        this.plateMat.color.copy(n.plate);
        this.knobMat.color.copy(n.knob);
        this.switchMat.color.copy(n.housing);
        this.stemMat.color.copy(n.stem);
        this.stemMat.emissive.copy(n.stem);
        this.stemMat.emissiveIntensity = this.colorway && this.colorway.legendGlow ? 0.7 : 0;
        this.rim.color.copy(n.glow);
        this.hemi.color.copy(n.hemi).lerp(WHITE, 0.6);
        let keyDiff = 0;
        // 被线"刷"到的那几颗换得快（0.2 秒），平常整套换色还是原来那样慢慢过渡
        const kSwap = damp(dt, 14);
        this.keys.forEach((key) => {
            if (key.cwHold) return;
            const d = d3(key.base, key.baseGoal);
            keyDiff = Math.max(keyDiff, d);
            key.base.lerp(key.baseGoal, key.fastSwap ? kSwap : k);
            if (d < 0.004) key.fastSwap = false;
        });
        diff = Math.max(diff, keyDiff);
        // 键帽颜色还在变（或者这一帧刚一步到位）：每颗键都得把新颜色写进材质，哪怕它别的什么都没变
        if (keyDiff > 1e-6) this._cwDirty = true;
        // 情绪灯光
        const L = this._light;
        const kl = damp(dt, 2.5);
        diff = Math.max(diff, d3(L.tint, L.tintGoal), Math.abs(L.exposure - L.exposureGoal), Math.abs(L.keyScale - L.keyScaleGoal),
            Math.abs(L.dream - L.dreamGoal));
        L.tint.lerp(L.tintGoal, kl);
        L.exposure += (L.exposureGoal - L.exposure) * kl;
        L.keyScale += (L.keyScaleGoal - L.keyScale) * kl;
        L.dream += (L.dreamGoal - L.dream) * damp(dt, 3);
        if (diff < 0.004) {
            // 已经看不出差别了：一步到位，不再每帧重画
            CW_FIELDS.forEach((f) => n[f].copy(g[f]));
            this.keys.forEach((key) => { if (!key.cwHold) key.base.copy(key.baseGoal); });
            L.tint.copy(L.tintGoal);
            L.exposure = L.exposureGoal;
            L.keyScale = L.keyScaleGoal;
            L.dream = L.dreamGoal;
        }
        const ov = this.lightOverride;
        const d = ov ? 0 : L.dream;
        const b = L.dreamBright;
        this.keyLight.color.copy(ov && ov.keyColor ? ov.keyColor : L.tint);
        this.keyLight.intensity = (ov ? ov.key : 3.4) * L.keyScale * (1 - (0.62 + 0.15 * b) * d);
        this.renderer.toneMappingExposure = ov ? ov.exposure : L.exposure * (1 - (0.26 + 0.16 * b) * d);
        if (ov) {
            this.rim.color.copy(ov.rimColor);
            this.rim.intensity = ov.rim;
            this.hemi.color.copy(ov.hemiColor);
            this.hemi.intensity = ov.hemi;
        } else {
            this.rim.intensity = 26 * (1 + 0.8 * d * (1 - b) - 0.35 * d * b);
            this.hemi.intensity = 0.35 * (1 - 0.55 * d);
            this.scene.environmentIntensity = this.envBase * (1 - (0.6 + 0.2 * b) * d);
        }
        return diff >= 0.004;
    }

    // ---------------- 键的状态 ----------------
    // state: { dim, lift, glow, emissive, pulse, glowColor, legendGlow }
    setKey(id, state) {
        const k = this.keys.get(id);
        if (!k) return;
        const t = k.t;
        if ("dim" in state) t.dim = state.dim;
        if ("lift" in state) t.lift = state.lift;
        if ("glow" in state) t.glow = state.glow;
        if ("emissive" in state) t.emissive = state.emissive;
        if ("legendGlow" in state) t.legendGlow = state.legendGlow;
        if ("pulse" in state) k.pulse = state.pulse;
        if ("glowColor" in state) {
            if (state.glowColor) {
                k.tint = state.glowColor;
                k.glowColor.set(state.glowColor);
            } else {
                k.tint = null;
                if (this.colorway) k.glowColor.copy(this._defaultGlow(k));
            }
        }
    }

    resetKeys(state = {}) {
        this.keys.forEach((k, id) => {
            this.setKey(id, { dim: 0, lift: 0, glow: 0, emissive: 0, legendGlow: 0, pulse: 0, glowColor: null, ...state });
            k.held = false;
            k.t.press = 0;
        });
    }

    // legend: { main, sub, badge, subColor }；main 省略就用键本身的字
    setLegend(id, legend) {
        const k = this.keys.get(id);
        if (!k) return;
        k.legendData = legend || {};
        k.legendDirty = true;
    }

    press(id, down = true) {
        const k = this.keys.get(id);
        if (!k) return;
        k.held = down;
        k.t.press = down ? 1 : 0;
    }

    pop(id) {
        const k = this.keys.get(id);
        if (k) k.popAt = this.time;
    }

    shake(id) {
        const k = this.keys.get(id);
        if (k) k.shakeAt = this.time;
    }

    // 底光猛地亮一下再退回去
    flare(id, color) {
        const k = this.keys.get(id);
        if (!k) return;
        k.flareAt = this.time;
        if (color) k.flareColor = new THREE.Color(color);
        else k.flareColor = null;
    }

    _drawLegend(k) {
        const { ctx, canvas, spec } = k;
        const W = canvas.width;
        const H = k.texH; // 顶面那一块；下面 frontH 行是正面的字带
        ctx.clearRect(0, 0, W, canvas.height);
        const d = k.legendData || {};
        const main = d.main != null ? d.main : spec.label;
        const color = d.color || k.legendColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;

        if (spec.id === "space") {
            // 空格键上印一行小小的站名
            ctx.globalAlpha = 0.5;
            ctx.font = `700 ${Math.round(H * 0.16)}px ${this.brandFont}`;
            ctx.letterSpacing = `${Math.round(H * 0.06)}px`;
            ctx.fillText(d.main != null ? d.main : "UNBROKEN", W / 2, H * 0.52);
            ctx.letterSpacing = "0px";
            ctx.globalAlpha = 1;
        } else if (main) {
            const single = [...main].length <= 2;
            const size = single ? H * (d.sub ? 0.34 : 0.4) : H * (main.length > 4 ? 0.17 : 0.2);
            ctx.font = `${single ? 600 : 500} ${Math.round(size)}px ${this.legendFont}`;
            ctx.fillText(main, W / 2, d.sub ? H * 0.4 : H * 0.5);
        }
        if (d.sub) {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = d.subColor || color;
            ctx.font = `600 ${Math.round(H * 0.19)}px ${this.legendFont}`;
            ctx.fillText(d.sub, W / 2, H * 0.76);
            ctx.globalAlpha = 1;
        }
        if (d.badge != null) {
            // 走过的顺序号：左上角一颗小圆
            const r = H * 0.14;
            const bx = r + H * 0.06;
            const by = r + H * 0.06;
            ctx.fillStyle = d.badgeBg || color;
            ctx.beginPath();
            ctx.arc(bx, by, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = d.badgeColor || "#111";
            ctx.font = `700 ${Math.round(H * 0.16)}px ${this.legendFont}`;
            ctx.fillText(String(d.badge), bx, by + 1);
        }
        if (d.mark) {
            // 右上角一个小记号（升降号之类）
            ctx.fillStyle = d.markColor || color;
            ctx.font = `700 ${Math.round(H * 0.2)}px ${this.legendFont}`;
            ctx.fillText(d.mark, W - H * 0.18, H * 0.2);
        }
        if (d.front) this._drawFront(k, d, color);
        k.texture.needsUpdate = true;
        k.legendDirty = false;
    }

    // 正面的字带（侧刻）：主字在左、小字（音级）在右；画布这一条比实际长宽比高一些，这里按比例压回去
    _drawFront(k, d, color) {
        const { ctx, canvas } = k;
        const W = canvas.width;
        const h = k.frontH / k.frontScale; // 按实际长宽比的"逻辑高度"
        ctx.save();
        ctx.translate(0, k.texH);
        ctx.scale(1, k.frontScale);
        ctx.textBaseline = "middle";
        ctx.fillStyle = d.frontColor || color;
        const main = String(d.front);
        const sub = d.frontSub ? String(d.frontSub) : "";
        ctx.font = `700 ${Math.round(h * 0.8)}px ${this.legendFont}`;
        const mw = ctx.measureText(main).width;
        ctx.font = `600 ${Math.round(h * 0.52)}px ${this.legendFont}`;
        const sw = sub ? ctx.measureText(sub).width : 0;
        const gap = sub ? h * 0.35 : 0;
        let x = (W - (mw + gap + sw)) / 2;
        ctx.textAlign = "left";
        ctx.font = `700 ${Math.round(h * 0.8)}px ${this.legendFont}`;
        ctx.fillText(main, x, h * 0.54);
        if (sub) {
            x += mw + gap;
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = d.frontSubColor || d.frontColor || color;
            ctx.font = `600 ${Math.round(h * 0.52)}px ${this.legendFont}`;
            ctx.fillText(sub, x, h * 0.58);
            ctx.globalAlpha = 1;
        }
        ctx.restore();
        ctx.textAlign = "center";
    }

    // ---------------- 目标光环 ----------------
    setTargetKey(id) {
        this.target.id = id || null;
        this._touch();
    }

    // 键顶中心的世界坐标（再往上抬 h；深海模式里算上这一排被抬高的那一截）
    keyTop(id, h = 0.14) {
        const k = this.keys.get(id);
        if (!k) return null;
        return new THREE.Vector3(k.group.position.x, k.baseLift + k.tierV + CAP_H + h, k.group.position.z);
    }

    // 深海模式：一排比一排高（fn(k) 给出这颗键要抬多高；null = 全部落回去）。
    // 升的时候后排先动，落的时候前排先动，像一道台阶一级一级长出来
    setTiers(fn) {
        const now = this.time;
        this.keys.forEach((k) => {
            const goal = fn ? fn(k) : 0;
            if (goal === k.tier) return;
            k.tier = goal;
            k.tierAt = now + (fn ? (5 - k.spec.row) * 0.08 : k.spec.row * 0.05);
        });
        this._touch(true);
    }

    // ---------------- 换乐器：键帽飘起来、在空中换色、再落回轴上 ----------------
    // 一道波从左上角（Esc）扫到右下角：每颗键帽依次升起、带一点歪斜地悬一下、
    // 升到最高处换上新颜色（onPeak），再落回去、在轴上轻轻一顿（onLand）。底下的灯把露出来的轴体照亮
    startFloat({ spread = 0.62, rise = 0.4, hover = 0.2, fall = 0.44, height = 1.15, onPeak = null, onLand = null, onDone = null } = {}) {
        if (this._float) this._finishFloat(true);
        const keys = [...this.keys.values()];
        const phase = (k) => k.group.position.x + k.group.position.z * 0.85;
        let lo = Infinity;
        let hi = -Infinity;
        keys.forEach((k) => {
            const p = phase(k);
            lo = Math.min(lo, p);
            hi = Math.max(hi, p);
        });
        // 每颗键自己的一点随机（同一颗每次都一样，不会一抖一抖）
        const rnd = (k, s) => {
            const x = Math.sin((k.group.position.x * 12.9898 + k.group.position.z * 78.233 + s * 37.719)) * 43758.5453;
            return x - Math.floor(x);
        };
        const items = keys.map((k) => ({
            k,
            start: ((phase(k) - lo) / Math.max(1e-6, hi - lo)) * spread + rnd(k, 1) * 0.06,
            h: height * (0.82 + 0.4 * rnd(k, 2)),
            rx: (rnd(k, 3) - 0.5) * 0.42,
            rz: (rnd(k, 4) - 0.5) * 0.52,
            bob: rnd(k, 5) * 6.28,
            peaked: false,
            landed: false,
        }));
        this._float = { t0: this.time, items, rise, hover, fall, onPeak, onLand, onDone, fastAt: -1 };
        this._touch(true);
        return this._float;
    }

    // 立刻收场：还在空中的键帽 0.22 秒内落回去，没换色的马上换
    endFloat() {
        const F = this._float;
        if (!F || F.fastAt >= 0) return;
        F.fastAt = this.time;
        F.items.forEach((it) => {
            it.from = it.k.fy;
            it.fromRx = it.k.frx;
            it.fromRz = it.k.frz;
            if (!it.peaked) {
                it.peaked = true;
                if (F.onPeak) F.onPeak(it.k);
            }
        });
        this._touch(true);
    }

    get floating() {
        return !!this._float;
    }

    _finishFloat(silent = false) {
        const F = this._float;
        if (!F) return;
        this._float = null;
        F.items.forEach((it) => {
            const k = it.k;
            if (!it.peaked && F.onPeak && !silent) F.onPeak(k);
            k.fy = 0;
            k.frx = 0;
            k.frz = 0;
            k.fglow = 0;
            k._floatDirty = true;
        });
        if (F.onDone && !silent) F.onDone();
        this._touch(true);
    }

    _updateFloat() {
        const F = this._float;
        if (!F) return false;
        const now = this.time;
        const out = (x) => 1 - Math.pow(1 - x, 3);
        let alive = false;
        if (F.fastAt >= 0) {
            const p = Math.min(1, (now - F.fastAt) / 0.22);
            const e = 1 - out(p);
            F.items.forEach((it) => {
                const k = it.k;
                k.fy = it.from * e;
                k.frx = it.fromRx * e;
                k.frz = it.fromRz * e;
                k.fglow = Math.min(0.9, k.fy * 0.8);
                k._floatDirty = true;
            });
            if (p >= 1) this._finishFloat();
            return true;
        }
        const t = now - F.t0;
        const total = F.rise + F.hover + F.fall;
        F.items.forEach((it) => {
            const k = it.k;
            const lt = t - it.start;
            let lift = 0;
            let tilt = 0;
            if (lt > 0 && lt < F.rise) {
                lift = out(lt / F.rise);
                tilt = lift;
            } else if (lt >= F.rise && lt < F.rise + F.hover) {
                const p = (lt - F.rise) / F.hover;
                lift = 1 + Math.sin(p * Math.PI) * 0.04;
                tilt = 1 - p * 0.25;
            } else if (lt >= F.rise + F.hover && lt < total) {
                const p = (lt - F.rise - F.hover) / F.fall;
                lift = 1 - Math.pow(p, 2.2); // 越落越快，像是被轴"吸"回去
                tilt = (1 - p) * 0.75;
            } else if (lt >= total && lt < total + 0.14) {
                // 落到轴上那一下：往下顿一点再弹回来，就是"咔哒"
                const p = (lt - total) / 0.14;
                lift = -0.045 * Math.sin(p * Math.PI) / it.h;
                tilt = 0;
            }
            if (!it.peaked && lt >= F.rise * 0.85) {
                it.peaked = true;
                if (F.onPeak) F.onPeak(k);
            }
            if (!it.landed && lt >= total) {
                it.landed = true;
                if (F.onLand) F.onLand(k);
            }
            if (lt < total + 0.14) alive = true;
            k.fy = it.h * lift;
            k.frx = it.rx * tilt + Math.sin(now * 2.4 + it.bob) * 0.03 * tilt;
            k.frz = it.rz * tilt;
            k.fglow = Math.max(0, Math.min(0.9, lift * 0.9));
            k._floatDirty = true;
        });
        if (!alive) this._finishFloat();
        return true;
    }

    // 游戏里的走线
    setPath(ids, opts = {}) {
        const pts = ids.map((id) => this.keyTop(id)).filter(Boolean);
        this.path.setPoints(pts, { span: ids.length, ...opts });
    }

    pulsePath() {
        this.path.pulse = 1;
    }

    // 世界坐标 → 页面坐标（给 2D 的礼花粒子定位）
    screenOf(id) {
        const k = this.keys.get(id);
        if (!k) return null;
        const p = this.keyTop(id, 0);
        p.project(this.camera);
        const r = this.canvas.getBoundingClientRect();
        return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
    }

    // ---------------- 旋钮 ----------------
    setKnob(v, instant) {
        this.knobValue = Math.min(1, Math.max(0, v));
        if (instant) {
            this.knobShown = this.knobValue;
            this.knob.rotation.y = THREE.MathUtils.degToRad(135 - this.knobShown * 270);
            this._touch(true);
        }
    }

    // ---------------- 镜头 ----------------
    // view: { region, az, el, fov, margin, shift, target? }
    setView(view, { instant = false } = {}) {
        this.view = view;
        this._blend = null;
        this._computeGoal();
        this._camDirty = true;
        this._touch();
        if (instant) {
            this.pose.target.copy(this.goal.target);
            ["az", "el", "dist", "fov", "shift", "shiftX"].forEach((f) => { this.pose[f] = this.goal[f]; });
        }
    }

    setParallax(amount) {
        this.parallax.amount = amount;
    }

    setOrbit(enabled, { auto = 0 } = {}) {
        this.orbit.enabled = enabled;
        this.orbit.auto = auto;
        if (!enabled) { this.orbit.az = 0; this.orbit.el = 0; }
        this._camDirty = true;
        this._touch();
    }

    // 首页滚动用：两个机位按 t 混合，镜头随滚动连续地转过去，而不是到了章节才一跳
    setViewBlend(a, b, t) {
        this.view = t < 0.5 ? a : b;
        this._blend = { a, b, t: Math.min(1, Math.max(0, t)) };
        this._computeGoal();
        this._camDirty = true;
        this._touch();
    }

    _computeGoal() {
        if (this._blend && this.view !== this._blend.a && this.view !== this._blend.b) this._blend = null;
        if (this._blend) {
            const { a, b, t } = this._blend;
            const ga = this._goalFor(a);
            const gb = this._goalFor(b);
            const g = this.goal;
            g.target.lerpVectors(ga.target, gb.target, t);
            ["az", "el", "dist", "fov", "shift", "shiftX"].forEach((f) => { g[f] = ga[f] + (gb[f] - ga[f]) * t; });
            return;
        }
        if (!this.view) return;
        const g = this._goalFor(this.view);
        this.goal.target.copy(g.target);
        ["az", "el", "dist", "fov", "shift", "shiftX"].forEach((f) => { this.goal[f] = g[f]; });
    }

    _goalFor(v) {
        const R = v.region || REGIONS.board;
        const yLo = v.yLo != null ? v.yLo : CASE_BOTTOM;
        const yHi = v.yHi != null ? v.yHi : RIM_TOP + 0.3;
        const ty = v.targetY != null ? v.targetY : (yLo + yHi) / 2 * 0.3;
        const target = v.target
            ? v.target.clone()
            : new THREE.Vector3((R.x0 + R.x1) / 2, ty, (R.z0 + R.z1) / 2);
        const az = THREE.MathUtils.degToRad(v.az || 0);
        const el = THREE.MathUtils.degToRad(v.el != null ? v.el : 40);
        const fov = v.fov || 28;
        const aspect = this.aspect || 1.6;
        const margin = v.margin != null ? v.margin : 0.06;

        const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
        const f = dir.clone().negate();
        const r = new THREE.Vector3().crossVectors(f, UP).normalize();
        const u = new THREE.Vector3().crossVectors(r, f).normalize();
        const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (1 - margin);
        const tanH = tanV * aspect;
        let d = 0;
        for (const x of [R.x0, R.x1]) for (const y of [yLo, yHi]) for (const z of [R.z0, R.z1]) {
            const rel = new THREE.Vector3(x, y, z).sub(target);
            const px = rel.dot(r);
            const py = rel.dot(u);
            const pz = rel.dot(f);
            d = Math.max(d, Math.abs(px) / tanH - pz, Math.abs(py) / tanV - pz);
        }
        return {
            target,
            az: v.az || 0,
            el: v.el != null ? v.el : 40,
            dist: d * (v.zoom || 1),
            fov,
            shift: v.shift || 0,
            shiftX: v.shiftX || 0,
        };
    }

    _updateCamera(dt) {
        if (this.flyCam) {
            const f = this.flyCam(this.time);
            if (f) {
                const cam = this.camera;
                const p = this.pose;
                cam.position.copy(f.pos);
                cam.lookAt(f.look);
                if (Math.abs(cam.fov - f.fov) > 1e-3) {
                    cam.fov = f.fov;
                    cam.updateProjectionMatrix();
                }
                cam.clearViewOffset();
                // 平常的取景参数跟着同步：交还控制的那一刻，从这里平滑地回到该在的机位，不会跳
                const off = tmpV.subVectors(f.pos, f.look);
                const dist = Math.max(1e-3, off.length());
                p.target.copy(f.look);
                p.dist = dist;
                p.el = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, off.y / dist))));
                p.az = THREE.MathUtils.radToDeg(Math.atan2(off.x, off.z));
                p.fov = f.fov;
                p.shift = 0;
                p.shiftX = 0;
                this._camDirty = true;
                return true;
            }
        }
        const speed = (this.view && this.view.speed ? this.view.speed : 3.2) * (this.cinematic ? 0.55 : 1);
        const k = this.reduced ? 1 : damp(dt, speed);
        const p = this.pose;
        const g = this.goal;
        // 离目标机位已经近到肉眼分不出来：直接对齐，停止重画
        let settling =
            p.target.distanceToSquared(g.target) > 1e-4 || Math.abs(p.az - g.az) > 0.02 ||
            Math.abs(p.el - g.el) > 0.02 || Math.abs(p.dist - g.dist) > 2e-3 * Math.max(1, g.dist) ||
            Math.abs(p.fov - g.fov) > 0.01 || Math.abs(p.shift - g.shift) > 5e-4 || Math.abs(p.shiftX - g.shiftX) > 5e-4;
        if (!settling && (p.az !== g.az || p.dist !== g.dist || p.el !== g.el)) {
            p.target.copy(g.target);
            ["az", "el", "dist", "fov", "shift", "shiftX"].forEach((f) => { p[f] = g[f]; });
            this._camDirty = true;
        }
        p.target.lerp(g.target, k);
        p.az = lerpAngle(p.az, g.az, k);
        p.el = lerpAngle(p.el, g.el, k);
        p.dist += (g.dist - p.dist) * k;
        p.fov += (g.fov - p.fov) * k;
        p.shift += (g.shift - p.shift) * k;
        p.shiftX += (g.shiftX - p.shiftX) * k;

        // 视差：鼠标在哪边，键盘就往那边稍稍转一点
        const px = this.parallax;
        const pk = damp(dt, 4);
        px.x += (px.tx - px.x) * pk;
        px.y += (px.ty - px.y) * pk;

        const o = this.orbit;
        let orbiting = !!o.dragging;
        if (o.enabled && !o.dragging) {
            o.idle += dt;
            if (o.auto && o.idle > 1.2) {
                o.az += o.auto * dt;
                orbiting = true;
            }
        }
        const drifting = Math.abs(px.tx - px.x) > 2e-3 || Math.abs(px.ty - px.y) > 2e-3;
        if (!settling && !orbiting && !drifting && !this._camDirty) return false;
        this._camDirty = false;

        const amt = this.reduced ? 0 : px.amount * (this.cinematic ? 0.4 : 1);
        const az = THREE.MathUtils.degToRad(p.az + px.x * 3.2 * amt + o.az);
        const el = THREE.MathUtils.degToRad(Math.min(88, Math.max(8, p.el - px.y * 2.2 * amt + o.el)));
        const cam = this.camera;
        cam.position.set(
            p.target.x + p.dist * Math.sin(az) * Math.cos(el),
            p.target.y + p.dist * Math.sin(el),
            p.target.z + p.dist * Math.cos(az) * Math.cos(el)
        );
        cam.lookAt(p.target);
        if (Math.abs(cam.fov - p.fov) > 1e-3) {
            cam.fov = p.fov;
            cam.updateProjectionMatrix();
        }
        // 平移画面：shift 正值让键盘往下（给上方标题留地方），shiftX 正值让键盘往右
        if (this.width) {
            const offY = -p.shift * this.height;
            const offX = -p.shiftX * this.width;
            if (Math.abs(offY) > 0.5 || Math.abs(offX) > 0.5) {
                cam.setViewOffset(this.width, this.height, offX, offY, this.width, this.height);
            } else {
                cam.clearViewOffset();
            }
        }
        return true;
    }

    // ---------------- 挂载 / 尺寸 / 循环 ----------------
    attach(container, { touch = "none" } = {}) {
        if (this.container === container) return;
        if (this.container) {
            this._resizeObs.unobserve(this.container);
            this._io.unobserve(this.container);
        }
        this.container = container;
        if (container) {
            container.appendChild(this.canvas);
            this.canvas.style.touchAction = touch;
            this._resizeObs.observe(container);
            this.inView = true;
            this._io.observe(container);
            this._resize();
        }
        this._touch(true);
        this._camDirty = true;
        this._syncRunning();
    }

    setActive(on) {
        this.visible = on;
        this._syncRunning();
    }

    _resize() {
        if (!this.container) return;
        const w = Math.max(1, this.container.clientWidth);
        const h = Math.max(1, this.container.clientHeight);
        if (w === this.width && h === this.height) return;
        this.width = w;
        this.height = h;
        this.aspect = w / h;
        // 像素密度上限：画布越大给得越少（全屏的首页 1.5 倍就够细）；运行中再按帧率自动下调
        const small = Math.min(w, h) < 520;
        const cap = w * h > 1.1e6 ? 1.5 : small ? 2 : 1.75;
        this.maxPixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, cap));
        this.pixelRatio = Math.min(this.maxPixelRatio, this._prLimit || this.maxPixelRatio);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(w, h, false);
        if (this.post) this.post.setSize(this.drawingSize());
        this.camera.aspect = this.aspect;
        this.camera.updateProjectionMatrix();
        this._computeGoal();
        this._camDirty = true;
        this._touch();
    }

    // 帧率跟不上就降一档像素密度，长时间很顺再升回来
    _trackPerf(raw) {
        const P = this._perf;
        if (raw > 0.1 || raw <= 0) return; // 切回来的第一帧、偶发的大卡顿不算
        P.sum += raw;
        P.n += 1;
        if (P.n < 50) return;
        const avg = P.sum / P.n;
        P.sum = 0;
        P.n = 0;
        const now = performance.now();
        if (now - P.changedAt < 2500) return;
        if (avg > 1 / 42 && this.pixelRatio > 1) {
            this._setPixelRatio(this.pixelRatio - 0.25);
            P.changedAt = now;
            P.good = 0;
        } else if (avg < 1 / 57 && this.pixelRatio < this.maxPixelRatio) {
            P.good += 1;
            if (P.good >= 6) {
                this._setPixelRatio(this.pixelRatio + 0.25);
                P.changedAt = now;
                P.good = 0;
            }
        } else {
            P.good = 0;
        }
    }

    _setPixelRatio(pr) {
        this.pixelRatio = Math.max(1, Math.min(this.maxPixelRatio, pr));
        this._prLimit = this.pixelRatio;
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.width, this.height, false);
        if (this.post) this.post.setSize(this.drawingSize());
        this._touch();
    }

    _syncRunning() {
        const run = this.visible && !!this.container && !document.hidden && this.inView;
        if (run && !this._raf) {
            this.lastFrame = performance.now();
            this._raf = requestAnimationFrame(this._loop);
        } else if (!run && this._raf) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
    }

    onTick(fn) {
        this.tickers.add(fn);
        return () => this.tickers.delete(fn);
    }

    _loop() {
        this._raf = requestAnimationFrame(this._loop);
        const now = performance.now();
        const raw = (now - this.lastFrame) / 1000;
        const dt = Math.min(raw, 0.05);
        this.lastFrame = now;
        this.time += dt;
        const busy = this._step(dt);
        // 只有慢变化时隔一帧画一次（30fps）：呼吸、流光这种缓慢的动在 30fps 下看不出差别，显卡的活少一半
        this._slowAcc = busy === 1 ? (this._slowAcc || 0) + raw : 0;
        const due = busy === 2 || this._forceRender > 0 || (busy === 1 && this._slowAcc >= 1 / 31);
        if (due) {
            if (this._forceRender > 0) this._forceRender -= 1;
            this._slowAcc = 0;
            this._render();
            if (this._rendering && busy === 2) this._trackPerf(raw);
            this._rendering = true;
        } else {
            this._rendering = false; // 空闲帧：不画，也不算进帧率统计
        }
    }

    // 所有状态往前推一帧；返回"画面有没有变化"
    // 返回 0 = 画面没变；1 = 只有慢变化（呼吸、流光、光点沿线慢慢流）；2 = 有快变化（按键、镜头、粒子……）
    _step(dt) {
        let slow = false;
        let fast = false;
        let moved = false;
        this.tickers.forEach((fn) => fn(dt, this.time));
        if (this._updateFlow(dt)) slow = true;
        if (this._updateFloat()) fast = moved = true;
        if (this._updateColorway(dt)) fast = true;
        const kr = this._updateKeys(dt);
        if (kr & 1) slow = true;
        if (kr & 2) moved = true;
        if (kr & 4) fast = true;
        if (this._updateKnob(dt)) fast = moved = true;
        const tr = this._updateTarget(dt);
        if (tr === 1) slow = true;
        else if (tr === 2) fast = true;
        const pathUpdate = (p) => {
            const r = p.update(dt);
            if (r & 1) slow = true;
            if (r & 2) moved = true;
            if (r & 4) fast = true;
        };
        pathUpdate(this.path);
        this.extraPaths.forEach(pathUpdate);
        if (this.towerTick(dt)) fast = true;
        this.layers.forEach((l) => {
            if (l.update(dt, this.time)) fast = true;
        });
        if (this._updateCamera(dt)) fast = true;
        if (moved) this._shadowDirty = true;
        return fast ? 2 : slow ? 1 : 0;
    }

    _render() {
        if (this._shadowDirty) {
            this.renderer.shadowMap.needsUpdate = true;
            this._shadowDirty = false;
        }
        if (this.post) this.post.render(this.renderer, this.scene, this.camera);
        else this.renderer.render(this.scene, this.camera);
    }

    // 画布的像素尺寸（后期处理的渲染目标要跟着它）
    drawingSize() {
        return { w: Math.round(this.width * this.pixelRatio), h: Math.round(this.height * this.pixelRatio) };
    }

    // 不走 rAF，直接把模拟往前推 seconds 秒再画一帧。
    // 页面在后台时 rAF 不跑，截图 / 测试和"减少动效"时的瞬时落位都靠它
    advance(seconds = 0, dt = 1 / 60) {
        let left = seconds;
        do {
            const step = Math.min(dt, Math.max(left, 0));
            this.time += step;
            this._step(step);
            left -= dt;
        } while (left > 0);
        this._shadowDirty = true;
        this._camDirty = true;
        this._updateCamera(0);
        this._render();
    }

    // 立刻画一帧（页面切换的过渡截图要拿到新画面）
    renderNow() {
        this._camDirty = true;
        this._updateCamera(0);
        this._render();
    }

    // 以某个键为中心荡开一圈光波：键帽依次亮起、微微浮起来，像水面的涟漪
    ripple(id, { color, strength = 1, speed = 8, width = 1.1, life = 1.3 } = {}) {
        const k = this.keys.get(id);
        if (!k || this.reduced) return;
        this.ripples.push({
            x: k.group.position.x, z: k.group.position.z, t0: this.time,
            // 不指定颜色：波扫过哪颗键就亮成那颗键自己的颜色（渐变配色下就是一道彩虹）
            color: color ? new THREE.Color(color) : null,
            strength, speed, width, life,
        });
        if (this.ripples.length > 10) this.ripples.shift();
        this._touch(true);
    }

    // 返回位标志：1 = 画面有变化，2 = 有键帽真的移动了（阴影要更新）
    _updateKeys(dt) {
        const now = this.time;
        const kFast = damp(dt, 26);
        const kMid = damp(dt, 11);
        const kSlow = damp(dt, 6);
        const plate = this._cwNow ? this._cwNow.plate : new THREE.Color(0);
        const dimTo = (this._dimTo = this._dimTo || new THREE.Color()).copy(plate).multiplyScalar(0.42);
        const tmpC = this._tmpC || (this._tmpC = new THREE.Color());
        let changed = false;
        let moved = false;
        let fast = false; // 有键在按、在弹、在闪：要 60fps。只有底光呼吸、光圈起伏这种慢变化的话，30fps 就够顺

        // 还活着的涟漪
        const ripples = this.ripples;
        for (let i = ripples.length - 1; i >= 0; i--) {
            if (now - ripples[i].t0 > ripples[i].life) ripples.splice(i, 1);
        }
        if (ripples.length) changed = moved = fast = true;

        const kTier = damp(dt, 3.2);
        this.keys.forEach((k) => {
            const t = k.t;
            const v = k.v;
            // 深海模式的阶梯：一排一排按各自的时刻长过去
            let tiering = false;
            if (k.tierV !== k.tier) {
                tiering = true;
                if (now >= k.tierAt) {
                    k.tierV += (k.tier - k.tierV) * kTier;
                    if (Math.abs(k.tier - k.tierV) < 1e-4) k.tierV = k.tier;
                }
            }
            const floating = k._floatDirty;
            k._floatDirty = false;
            const glowDelta = Math.abs(t.glow - v.glow);
            const delta =
                Math.abs(t.press - v.press) + Math.abs(t.lift - v.lift) + Math.abs(t.dim - v.dim) +
                glowDelta + Math.abs(t.emissive - v.emissive) + Math.abs(t.legendGlow - v.legendGlow);
            const hoverGoal = k === this._hovered ? 1 : 0;
            // 除了底光亮度和呼吸，什么都没在变
            const calm = delta - glowDelta < 2e-3 && Math.abs(hoverGoal - k.hover) < 2e-3 && !tiering && !floating &&
                k.popAt < 0 && k.shakeAt < 0 && k.flareAt < 0 && !k.legendDirty && !ripples.length && !k._ringing && !this._cwDirty;
            const idle = calm && glowDelta < 2e-3 && !k.pulse && !k._flowDirty;
            k._flowDirty = false;
            // 这颗键什么都没变：跳过整段计算（大部分时候大部分键都是这样）
            if (idle) return;
            changed = true;
            if (!calm) fast = true;
            v.press += (t.press - v.press) * kFast;
            v.lift += (t.lift - v.lift) * kMid;
            v.dim += (t.dim - v.dim) * kSlow;
            v.glow += (t.glow - v.glow) * kMid;
            v.emissive += (t.emissive - v.emissive) * kMid;
            v.legendGlow += (t.legendGlow - v.legendGlow) * kMid;
            k.hover += (hoverGoal - k.hover) * kMid;
            if (delta < 2e-3) {
                v.press = t.press; v.lift = t.lift; v.dim = t.dim;
                v.glow = t.glow; v.emissive = t.emissive; v.legendGlow = t.legendGlow;
            }

            // 点一下：先按到底再弹回来，带一点过冲
            let pop = 0;
            if (k.popAt >= 0) {
                const p = (now - k.popAt) / 0.32;
                if (p >= 1) k.popAt = -1;
                else pop = p < 0.18 ? p / 0.18 : Math.max(-0.12, Math.cos((p - 0.18) / 0.82 * Math.PI) * 0.5 + 0.5 - Math.sin((p - 0.18) / 0.82 * Math.PI) * 0.12);
            }
            let shakeX = 0;
            if (k.shakeAt >= 0) {
                const p = (now - k.shakeAt) / 0.36;
                if (p >= 1) k.shakeAt = -1;
                else shakeX = Math.sin(p * Math.PI * 7) * 0.08 * (1 - p);
            }
            let flare = 0;
            if (k.flareAt >= 0) {
                const p = (now - k.flareAt) / 0.9;
                if (p >= 1) k.flareAt = -1;
                else flare = Math.pow(1 - p, 2);
            }

            // 涟漪：一圈光从中心往外走，经过的键亮一下、浮一下
            let wave = 0;
            let waveColor = null;
            if (ripples.length) {
                const x = k.group.position.x;
                const z = k.group.position.z;
                for (const r of ripples) {
                    const age = now - r.t0;
                    const d = Math.hypot(x - r.x, z - r.z);
                    const front = age * r.speed;
                    const fall = 1 - age / r.life;
                    const w = Math.exp(-((d - front) * (d - front)) / (r.width * r.width)) * fall * fall * r.strength;
                    if (w > wave) {
                        wave = w;
                        waveColor = r.color || k.glowColor;
                    }
                }
            }
            k._ringing = wave > 0.01;

            const press = Math.min(1, v.press + pop);
            const pulse = k.pulse ? (Math.sin(now * 4.2) * 0.5 + 0.5) * k.pulse : 0;
            // 涟漪只抬没按着的键：按住的键被旁边新按下的那颗荡起来的波抬起一截（行程的 12–16%），
            // 看上去就像手没松、键却自己弹起来了
            const y = k.baseLift + v.lift + k.tierV + k.fy + k.hover * 0.04 - press * PRESS_DEPTH - v.dim * 0.07 + wave * 0.06 * (1 - press);
            if (Math.abs(y - k.holder.position.y) > 1e-5 || Math.abs(shakeX - k.holder.position.x) > 1e-5 || floating) moved = true;
            k.holder.position.y = y;
            k.holder.position.x = shakeX;
            k.holder.rotation.x = k.baseTilt + k.frx;
            k.holder.rotation.z = k.frz;

            // 暗掉 = 往"压暗的底板色"靠：浅色套装（晨光、薄荷）的底板本身很亮，只往底板靠拉不开层次
            tmpC.copy(k.base).lerp(dimTo, v.dim * 0.6);
            k.capMat.color.copy(tmpC);
            let glowC = k.glowColor;
            if (k.flareColor && flare > 0) glowC = tmpC.copy(k.glowColor).lerp(k.flareColor, flare);
            if (waveColor && wave > 0.02) glowC = tmpC.copy(glowC).lerp(waveColor, Math.min(1, wave * 1.4));
            k.capMat.emissive.copy(glowC);
            k.capMat.emissiveIntensity = (v.emissive + pulse * 0.35 + flare * 0.5 + wave * 0.6) * 0.35 + k.hover * 0.06;

            // 键帽飘起来时，底下的灯把轴体照亮（k.fglow 由换乐器的动画写）
            const glowAmt = Math.min(1.6, v.glow + pulse * 0.5 + flare * 1.2 + wave * 1.1 + press * 0.35 * (v.glow > 0.05 ? 1 : 0) + (k.fglow || 0));
            k.glowMat.opacity = glowAmt * 0.9;
            k.glowMat.color.copy(glowC);
            k.glow.visible = glowAmt > 0.01;
            k.glow.scale.setScalar(1 + flare * 0.25 + wave * 0.2);

            k.legendMat.opacity = 1 - v.dim * 0.7;
            k.legendMat.emissiveIntensity = (this.legendGlowBase || 0) * (1 - v.dim * 0.8) + v.legendGlow + flare * 0.8 + wave * 0.5;

            if (k.legendDirty) this._drawLegend(k);
        });
        this._cwDirty = false;
        return (changed ? 1 : 0) | (moved ? 2 : 0) | (fast ? 4 : 0);
    }

    _updateKnob(dt) {
        const d = this.knobValue - this.knobShown;
        if (Math.abs(d) < 1e-4) return false;
        this.knobShown += d * damp(dt, 12);
        // 0 → 左下 135°，1 → 右下 -135°
        this.knob.rotation.y = THREE.MathUtils.degToRad(135 - this.knobShown * 270);
        return true;
    }

    _updateTarget(dt) {
        const tg = this.target;
        const on = !!tg.id;
        tg.s += ((on ? 1 : 0) - tg.s) * damp(dt, 8);
        const was = tg.group.visible;
        tg.group.visible = tg.s > 0.01;
        if (!tg.group.visible) return was ? 2 : 0;
        if (on) {
            const p = this.keyTop(tg.id, 0.34 + Math.sin(this.time * 2.4) * 0.05);
            tg.group.position.copy(p);
            this._targetLast = p;
        } else if (this._targetLast) {
            tg.group.position.copy(this._targetLast);
        }
        tg.group.scale.setScalar(0.6 + tg.s * 0.4);
        tg.ring.rotation.z = this.time * 1.2;
        tg.halo.material.uniforms.uIntensity.value = 0.55 * tg.s + Math.sin(this.time * 3) * 0.12;
        tg.ring.material.opacity = tg.s;
        // 已经出现完了、只在慢慢转和起伏：算"慢"
        return Math.abs((on ? 1 : 0) - tg.s) > 0.01 ? 2 : 1;
    }

    // ---------------- 输入 ----------------
    on(type, fn) {
        (this.listeners[type] = this.listeners[type] || []).push(fn);
    }

    _emit(type, ...args) {
        (this.listeners[type] || []).forEach((fn) => fn(...args));
    }

    setInteractive(pred) {
        this.interactive = pred || (() => false);
    }

    _pick(e) {
        const r = this.canvas.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        this._ray = this._ray || new THREE.Raycaster();
        this._ray.setFromCamera(ndc, this.camera);
        const hits = this._ray.intersectObjects(this.capMeshes, false);
        return hits.length ? hits[0].object.userData.keyId : null;
    }

    _bindInput() {
        const c = this.canvas;
        this._pointerKeys = new Map();
        this._knobDrag = null;

        c.addEventListener("pointerdown", (e) => {
            if (e.button != null && e.button > 0) return;
            const id = this._pick(e);
            if (id === "knob" && this.interactive("knob")) {
                e.preventDefault();
                this._knobDrag = { x: e.clientX, y: e.clientY, v: this.knobValue, id: e.pointerId };
                try { c.setPointerCapture(e.pointerId); } catch (err) { /* 抓不到就算了 */ }
                return;
            }
            if (id && this.interactive(id)) {
                e.preventDefault();
                this._pointerKeys.set(e.pointerId, id);
                try { c.setPointerCapture(e.pointerId); } catch (err) { /* 同上 */ }
                this._emit("keydown", id, "p" + e.pointerId, e);
                return;
            }
            if (this.orbit.enabled) {
                this.orbit.dragging = { x: e.clientX, y: e.clientY, az: this.orbit.az, el: this.orbit.el };
                try { c.setPointerCapture(e.pointerId); } catch (err) { /* 同上 */ }
            }
        });

        c.addEventListener("pointermove", (e) => {
            if (this._knobDrag && this._knobDrag.id === e.pointerId) {
                const d = (e.clientX - this._knobDrag.x - (e.clientY - this._knobDrag.y)) / 220;
                const v = Math.min(1, Math.max(0, this._knobDrag.v + d));
                this.setKnob(v);
                this._emit("knob", v);
                return;
            }
            if (this.orbit.dragging) {
                const o = this.orbit;
                o.az = o.dragging.az - (e.clientX - o.dragging.x) * 0.35;
                o.el = Math.max(-20, Math.min(40, o.dragging.el + (e.clientY - o.dragging.y) * 0.25));
                o.idle = 0;
                return;
            }
            if (e.pointerType === "mouse") this._queueHover(e);
        });

        const end = (e) => {
            if (this._knobDrag && this._knobDrag.id === e.pointerId) {
                this._knobDrag = null;
                this._emit("knobend", this.knobValue);
                return;
            }
            if (this.orbit.dragging) {
                this.orbit.dragging = false;
                this.orbit.idle = 0;
                return;
            }
            const id = this._pointerKeys.get(e.pointerId);
            if (!id) return;
            this._pointerKeys.delete(e.pointerId);
            this._emit("keyup", id, "p" + e.pointerId, e);
        };
        c.addEventListener("pointerup", end);
        c.addEventListener("pointercancel", end);
        c.addEventListener("pointerleave", () => {
            this._hovered = null;
            c.style.cursor = "";
        });

        // 视差跟着整页的鼠标走，不只在画布上
        window.addEventListener("pointermove", (e) => {
            if (!this.width || e.pointerType !== "mouse") return;
            this.parallax.tx = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
            this.parallax.ty = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
        }, { passive: true });
    }

    _queueHover(e) {
        if (this._hoverQueued) {
            this._hoverEvt = e;
            return;
        }
        this._hoverQueued = true;
        this._hoverEvt = e;
        requestAnimationFrame(() => {
            this._hoverQueued = false;
            const id = this._pick(this._hoverEvt);
            const ok = id && this.interactive(id);
            this._hovered = ok && id !== "knob" ? this.keys.get(id) : null;
            this.canvas.style.cursor = ok ? (id === "knob" ? "grab" : "pointer") : (this.orbit.enabled ? "grab" : "");
        });
    }

    // 所有指针按住的键全部松开（切屏 / 失焦时）
    releasePointers() {
        this._pointerKeys.forEach((id, pid) => this._emit("keyup", id, "p" + pid));
        this._pointerKeys.clear();
    }

    // ============================================================
    // 终局：一座塔。每一关的路径停在它自己那一层，
    // 位置就是当时在键盘上走过的那些键；层与层之间用一道弧线接起来——
    // 上一关的终点接下一关的起点，整条线从第一层一路盘到顶，一次都没断。
    // ============================================================
    buildTower(levels, { floorGap = 0.62, base = 0.62 } = {}) {
        this.clearTower();
        const group = new THREE.Group();
        this.scene.add(group);
        const floors = levels.map((lv, i) => {
            const pts = lv.ids.map((id) => this.keyTop(id, base + i * floorGap)).filter(Boolean);
            // 跳过的关卡：一层更细、更淡的虚影——线还在，只是那一层不是你亲手走的
            const path = new GlowPath(this, {
                radius: lv.ghost ? 0.03 : 0.042, color: lv.color, shadow: true, ghost: !!lv.ghost,
                gradient: lv.grad && this.gradientMode !== "off" ? new Gradient(lv.grad) : null,
            });
            path.setPoints(pts, { grow: false, span: pts.length });
            path.hideAll();
            this.extraPaths.add(path);
            // 每层底下一片淡淡的光：看得出"这是一层"
            const plate = this._floorPlate(pts, lv.color, pts.length ? pts[0].y - 0.02 : 0);
            group.add(plate.mesh);
            const color = new THREE.Color(lv.color);
            // 渐变的层：起点一种颜色、终点另一种，层与层之间的弧线就从上一层的尾色接到下一层的头色
            const g = path.gradient;
            return { path, pts, color, head: g ? g.color(0).clone() : color, tail: g ? g.color(1).clone() : color, plate };
        });

        const links = [];
        for (let i = 0; i < floors.length - 1; i++) {
            const a = floors[i].pts[floors[i].pts.length - 1];
            const b = floors[i + 1].pts[0];
            if (!a || !b) continue;
            const c1 = a.clone().add(new THREE.Vector3(0, floorGap * 0.85, 0));
            const c2 = b.clone().add(new THREE.Vector3(0, floorGap * 0.45, 0));
            const curve = new THREE.CubicBezierCurve3(a, c1, c2, b);
            const tubular = 48;
            const radial = 10;
            const geo = new THREE.TubeGeometry(curve, tubular, 0.036, radial, false);
            // 弧线的颜色从上一层的尾巴渐变到下一层的开头
            const cA = floors[i].tail;
            const cB = floors[i + 1].head;
            const colors = [];
            const perRing = radial + 1;
            const tmpC = new THREE.Color();
            for (let t = 0; t <= tubular; t++) {
                tmpC.copy(cA).lerp(cB, t / tubular);
                for (let r = 0; r < perRing; r++) colors.push(tmpC.r, tmpC.g, tmpC.b);
            }
            geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
            const core = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }));
            // 自发光要跟着顶点色一起渐变，标准材质的 emissive 只能给一个颜色，所以在着色器里补一句
            core.material.onBeforeCompile = (sh) => {
                sh.fragmentShader = sh.fragmentShader.replace(
                    "#include <emissivemap_fragment>",
                    "#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * 1.2;"
                );
            };
            core.castShadow = true;
            const haloGeo = new THREE.TubeGeometry(curve, tubular, 0.12, radial, false);
            const halo = new THREE.Mesh(haloGeo, glowMaterial(cB.clone().lerp(cA, 0.5), 0.5));
            halo.renderOrder = 5;
            group.add(core, halo);
            const total = geo.index.count;
            geo.setDrawRange(0, 0);
            haloGeo.setDrawRange(0, 0);
            links.push({ core, halo, geo, haloGeo, total, p: 0 });
        }

        this.tower = { group, floors, links, floorGap, base, t: 0, queue: null };
        return this.tower;
    }

    _floorPlate(pts, color, y) {
        if (!pts.length) return { mesh: new THREE.Group(), mat: null };
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        pts.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
        const w = x1 - x0 + 1.1;
        const d = z1 - z0 + 1.1;
        const mat = new THREE.MeshBasicMaterial({
            map: this._glowTex, color: new THREE.Color(color), transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.25, d * 1.4), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
        mesh.renderOrder = 3;
        return { mesh, mat, target: 0 };
    }

    // 按顺序一层一层画：层 → 弧线 → 下一层……
    // onFloor(i) 在第 i 层开始画的那一刻回调（用来报关名、挪镜头）
    playTower({ floorTime = 1.0, linkTime = 0.42, onFloor, onDone, instant = false } = {}) {
        const T = this.tower;
        if (!T) return;
        if (instant) {
            T.floors.forEach((f, i) => { f.path.revealAll(1e6); f.plate.target = 0.16; if (onFloor) onFloor(i); });
            T.links.forEach((l) => { l.p = 1; this._setLinkRange(l); });
            T.floors.forEach((f) => f.path.update(1));
            if (onDone) onDone();
            return;
        }
        const steps = [];
        T.floors.forEach((f, i) => {
            steps.push({ kind: "floor", i });
            if (T.links[i]) steps.push({ kind: "link", i });
        });
        let k = -1;
        let begun = 0;
        const next = () => {
            k += 1;
            begun = this.time;
            const s = steps[k];
            if (!s) {
                if (this._towerTick) this._towerTick();
                this._towerTick = null;
                if (onDone) onDone();
                return;
            }
            if (s.kind === "floor") {
                const f = T.floors[s.i];
                f.path.growRate = Math.max(2, f.path.length / floorTime);
                f.path.revealAll();
                f.plate.target = 0.16;
                if (onFloor) onFloor(s.i);
            }
        };
        if (this._towerTick) this._towerTick();
        this._towerTick = this.onTick(() => {
            const s = steps[k];
            if (!s) return;
            if (s.kind === "floor") {
                if (T.floors[s.i].path.finished) next();
            } else {
                const l = T.links[s.i];
                l.p = Math.min(1, (this.time - begun) / linkTime);
                this._setLinkRange(l);
                if (l.p >= 1) next();
            }
        });
        next();
    }

    _setLinkRange(l) {
        // 只画到整段管子的前 p：按三角形整组截，不然会出现半个面片
        const n = Math.floor((l.total * l.p) / 6) * 6;
        l.geo.setDrawRange(0, n);
        l.haloGeo.setDrawRange(0, Math.floor((l.haloGeo.index.count * l.p) / 6) * 6);
        this._touch(true);
    }

    towerTick(dt) {
        const T = this.tower;
        if (!T) return false;
        let busy = false;
        T.floors.forEach((f) => {
            if (!f.plate.mat) return;
            const d = f.plate.target - f.plate.mat.opacity;
            if (Math.abs(d) < 1e-3) return;
            f.plate.mat.opacity += d * damp(dt, 3);
            busy = true;
        });
        return busy;
    }

    // 塔盖好之后：每一层都有一颗光点顺着那一关的路慢慢走
    setTowerFlow(on) {
        const T = this.tower;
        if (!T) return;
        T.floors.forEach((f, i) => {
            if (f.path.ghost) return;
            f.path.setFlow(on && !this.reduced ? { count: 1, speed: 1.6 + (i % 3) * 0.35, size: 0.9 } : null);
        });
    }

    setTowerVisible(on) {
        const T = this.tower;
        if (!T) return;
        T.group.visible = on;
        T.floors.forEach((f) => { f.path.group.visible = on; });
        this._touch(true);
    }

    towerTopY() {
        const T = this.tower;
        if (!T) return 0;
        return this.keys.get("q").baseLift + CAP_H + T.base + (T.floors.length - 1) * T.floorGap;
    }

    clearTower() {
        if (this._towerTick) this._towerTick();
        this._towerTick = null;
        const T = this.tower;
        if (!T) return;
        T.floors.forEach((f) => {
            this.extraPaths.delete(f.path);
            f.path.dispose();
            if (f.plate.mat) f.plate.mat.dispose();
            if (f.plate.mesh.geometry) f.plate.mesh.geometry.dispose(); // 每层底下那块光板：以前漏了，每盖一次塔多占 14 份
        });
        T.links.forEach((l) => {
            l.geo.dispose();
            l.haloGeo.dispose();
            l.core.material.dispose();
            l.halo.material.dispose();
        });
        this.scene.remove(T.group);
        this.tower = null;
        this._touch(true);
    }
}

export const KB = { CAP_H, STEM_H, RIM_TOP, CASE_BOTTOM, BOARD_W, BOARD_D };
