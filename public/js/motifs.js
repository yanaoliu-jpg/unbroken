// ============================================================
// 每一套配色的"场景"：键盘背后画一幅属于它的背景，再配一种飘在空中的东西
//   sky    背景画（在一张画布上画一次，换配色时交叉淡入；平时是静止的一张图，不占每帧的开销）
//   atmo   空中飘的东西（交给 script.js 里的 SceneFX：雪、灯下的浮尘、落叶、音符、像素……）
// 颜色全部从这套配色里取，同一种画法在不同配色里是不同的样子
// ============================================================

// 配色 → 场景。没写的配色用 fallback
export const MOTIFS = {
    qinglan: { sky: "mountains", atmo: "motes" },      // 青岚：雾里一层层的青山
    chenguang: { sky: "dawn", atmo: "motes" },         // 晨光：地平线上刚露头的太阳
    bohe: { sky: "clouds", atmo: "leaves" },           // 薄荷：清爽的云和飘落的叶子
    haiwu: { sky: "sea", atmo: "mist" },               // 海雾：雾里的海平线
    miju: { sky: "dawn", atmo: "motes" },              // 蜜橘：暖黄的日出
    xunyicao: { sky: "meadow", atmo: "petals" },       // 薰衣草：一坡紫色的花田
    taiyuan: { sky: "aurora", atmo: "snow" },          // 苔原：极光下落雪
    muyun: { sky: "clouds", atmo: "petals" },          // 暮云：傍晚的云
    shuangye: { sky: "moon", atmo: "snow" },           // 霜夜：弯月和雪
    xinghuo: { sky: "embers", atmo: "embers" },        // 星火：炉火的光和火星
    jiguang: { sky: "aurora", atmo: "stars" },         // 极光
    poxiao: { sky: "dawn", atmo: "motes" },            // 破晓
    hetao: { sky: "stage", atmo: "motes" },            // 胡桃（吉他）：一盏暖灯下的舞台
    zhusha: { sky: "inkhills", atmo: "petals" },       // 朱砂（古筝）：水墨山和一轮红日
    jiuhong: { sky: "stage", atmo: "notes" },          // 酒红（弦乐）：音乐厅
    zhuqing: { sky: "bamboo", atmo: "leaves" },        // 竹青（长笛）：竹林
    jiaotang: { sky: "window", atmo: "motes" },        // 教堂（管风琴）：彩窗里透下来的光
    shengtang: { sky: "window", atmo: "sparkles" },    // 圣堂（人声）
    xingchen: { sky: "galaxy", atmo: "stars" },        // 星辰（钢片琴）
    jialebi: { sky: "sea", atmo: "bubbles" },          // 加勒比（钢鼓）
    jueshi: { sky: "city", atmo: "notes" },            // 爵士（贝斯）：夜里的城市
    xingyun: { sky: "galaxy", atmo: "stars" },         // 星云（铺底）
    bali: { sky: "city", atmo: "leaves", eiffel: true }, // 巴黎（手风琴）：有铁塔的天际线
    youxiji: { sky: "pixels", atmo: "pixels" },        // 掌机（8-bit）：像素风景
    huangtong: { sky: "stage", atmo: "notes" },        // 黄铜（小号）
    meigui: { sky: "meadow", atmo: "petals" },         // 玫瑰
    yuye: { sky: "city", atmo: "rain" },               // 雨夜
    xiagu: { sky: "mountains", atmo: "embers", sharp: true }, // 峡谷
    mengjing: { sky: "clouds", atmo: "stars" },        // 梦境
    senlin: { sky: "forest", atmo: "fireflies" },      // 森林
    nihong: { sky: "grid", atmo: "bokeh" },            // 霓虹：合成波的网格
    shenhai: { sky: "deep", atmo: "bubbles" },         // 深海
    wanxia: { sky: "dawn", atmo: "haze" },             // 晚霞
    liuguang: { sky: "grid", atmo: "sparkles" },       // 流光
    huanyu: { sky: "galaxy", atmo: "stars" },          // 寰宇
    classic: { sky: "stage", atmo: "notes" },          // 黑白（钢琴）
    abyss: { sky: "none", atmo: null },                // 深海模式有自己的一整套画面
    abyssVolcano: { sky: "none", atmo: null },
    abyssGlacier: { sky: "none", atmo: null },
    abyssMeadow: { sky: "none", atmo: null },
};
const FALLBACK = { sky: "clouds", atmo: "motes" };

export function motifOf(id) {
    return MOTIFS[id] || FALLBACK;
}

// ---------------- 小工具 ----------------
function rgb(hex) {
    const n = parseInt(String(hex).replace("#", "").slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
    const [r, g, b] = rgb(hex);
    return `rgba(${r},${g},${b},${a})`;
}
// 两色混合（t = 0 → a，1 → b）
function mix(a, b, t) {
    const A = rgb(a);
    const B = rgb(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
// 可复现的随机数：同一套配色每次画出来一样
function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return () => {
        h += 0x6d2b79f5;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function blob(c, x, y, r, color, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
}

function skyGradient(c, W, H, stops) {
    const g = c.createLinearGradient(0, 0, 0, H);
    stops.forEach(([o, col, a]) => g.addColorStop(o, rgba(col, a == null ? 1 : a)));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
}

function stars(c, W, H, R, n, maxY = 0.7, color = "#ffffff") {
    for (let i = 0; i < n; i++) {
        const x = R() * W;
        const y = R() * H * maxY;
        const s = R() < 0.08 ? 1.6 : 0.5 + R() * 0.8;
        c.fillStyle = rgba(color, 0.25 + R() * 0.6);
        c.beginPath();
        c.arc(x, y, s, 0, Math.PI * 2);
        c.fill();
    }
}

// 一道山脊：几层正弦叠出来的轮廓，往下填满
function ridge(c, W, H, R, { base, amp, freq = 1, sharp = false, fill }) {
    const ph = [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28];
    const f = [1.3 * freq, 2.9 * freq, 6.1 * freq, 13 * freq];
    const a = [1, 0.45, 0.2, 0.08];
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) {
        const u = x / W;
        let y = 0;
        for (let k = 0; k < 4; k++) {
            let s = Math.sin(u * f[k] * 6.28 + ph[k]);
            if (sharp && k < 2) s = 1 - Math.abs(s) * 2; // 尖一点：峡谷、水墨山
            y += s * a[k];
        }
        c.lineTo(x, base - y * amp);
    }
    c.lineTo(W, H);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
}

// ---------------- 每一种背景的画法 ----------------
// p：{ bg, glow, accent, highlight, case, alpha, grad[] }
const PAINTERS = {
    // 日出 / 日落：地平线上一轮很大的软太阳，几道横着的薄云
    dawn(c, W, H, p, R) {
        const [g0, g1, g2] = p.grad;
        skyGradient(c, W, H, [[0, p.bg], [0.45, mix(p.bg, g0, 0.25)], [0.74, mix(p.bg, g1, 0.55)], [0.82, mix(g2, g1, 0.4), 0.9], [0.83, mix(p.bg, g0, 0.2)], [1, p.bg]]);
        const hy = H * 0.82;
        blob(c, W * 0.5, hy, H * 0.55, g1, 0.28);
        blob(c, W * 0.5, hy, H * 0.2, g2, 0.55);
        c.save();
        c.beginPath();
        c.rect(0, 0, W, hy);
        c.clip();
        c.fillStyle = rgba(mix(g2, "#ffffff", 0.35), 0.85);
        c.beginPath();
        c.arc(W * 0.5, hy + H * 0.03, H * 0.1, 0, Math.PI * 2);
        c.fill();
        c.restore();
        // 薄云：拉得很长的椭圆
        for (let i = 0; i < 9; i++) {
            const y = H * (0.5 + R() * 0.3);
            const w = W * (0.15 + R() * 0.35);
            c.fillStyle = rgba(mix(g0, "#ffffff", 0.2), 0.05 + R() * 0.08);
            c.beginPath();
            c.ellipse(R() * W, y, w, H * (0.006 + R() * 0.01), 0, 0, Math.PI * 2);
            c.fill();
        }
        // 水面上的倒影
        for (let i = 0; i < 26; i++) {
            const y = hy + H * 0.015 + i * H * 0.006;
            c.fillStyle = rgba(g2, 0.18 * (1 - i / 26));
            c.fillRect(W * 0.5 - (W * 0.12) * (1 - i / 40) * (0.6 + R() * 0.5), y, (W * 0.24) * (1 - i / 40) * (0.6 + R() * 0.5), 1.2);
        }
    },

    // 夜：一弯月亮和它的光晕，稀稀拉拉的星
    moon(c, W, H, p, R) {
        skyGradient(c, W, H, [[0, mix(p.bg, "#000000", 0.3)], [0.6, p.bg], [1, mix(p.bg, p.glow, 0.12)]]);
        stars(c, W, H, R, Math.round(W * H / 5200), 0.75);
        const mx = W * 0.8;
        const my = H * 0.2;
        const mr = H * 0.065;
        blob(c, mx, my, mr * 7, p.glow, 0.2);
        blob(c, mx, my, mr * 2.4, mix(p.glow, "#ffffff", 0.5), 0.3);
        const moon = document.createElement("canvas");
        moon.width = moon.height = Math.ceil(mr * 2 + 4);
        const m = moon.getContext("2d");
        m.fillStyle = mix(p.glow, "#ffffff", 0.75);
        m.beginPath();
        m.arc(mr + 2, mr + 2, mr, 0, Math.PI * 2);
        m.fill();
        m.globalCompositeOperation = "destination-out";
        m.beginPath();
        m.arc(mr + 2 + mr * 0.45, mr + 2 - mr * 0.18, mr * 0.92, 0, Math.PI * 2);
        m.fill();
        c.drawImage(moon, mx - mr - 2, my - mr - 2);
        // 远处低低的山影
        ridge(c, W, H, R, { base: H * 0.9, amp: H * 0.05, freq: 0.8, fill: rgba(mix(p.bg, "#000000", 0.4), 0.9) });
    },

    // 极光：几幅帘子一样的光，底下一道远山
    aurora(c, W, H, p, R) {
        skyGradient(c, W, H, [[0, mix(p.bg, "#000000", 0.35)], [0.7, p.bg], [1, mix(p.bg, p.grad[0], 0.1)]]);
        stars(c, W, H, R, Math.round(W * H / 4200), 0.8);
        c.globalCompositeOperation = "lighter";
        p.grad.forEach((col, k) => {
            const base = H * (0.34 + k * 0.08);
            const ph = R() * 6.28;
            const fr = 1.5 + R() * 1.5;
            for (let x = 0; x < W; x += 2) {
                const u = x / W;
                const y0 = base + Math.sin(u * fr * 6.28 + ph) * H * 0.07 + Math.sin(u * 17 + ph * 2) * H * 0.012;
                const len = H * (0.14 + 0.1 * (0.5 + 0.5 * Math.sin(u * 9 + ph)));
                const a = (0.05 + 0.05 * (0.5 + 0.5 * Math.sin(u * 31 + ph * 3))) * (0.6 + 0.4 * Math.sin(u * 3.14));
                const g = c.createLinearGradient(0, y0 - len, 0, y0);
                g.addColorStop(0, rgba(col, 0));
                g.addColorStop(0.75, rgba(col, a));
                g.addColorStop(1, rgba(col, 0));
                c.fillStyle = g;
                c.fillRect(x, y0 - len, 2, len);
            }
        });
        c.globalCompositeOperation = "source-over";
        ridge(c, W, H, R, { base: H * 0.88, amp: H * 0.06, freq: 1.2, fill: rgba(mix(p.bg, "#000000", 0.5), 0.95) });
    },

    // 山：一层层远近的山脊，越远越淡、越偏天色，中间夹着雾
    mountains(c, W, H, p, R, o) {
        const [g0, g1, g2] = p.grad;
        skyGradient(c, W, H, [[0, p.bg], [0.55, mix(p.bg, g0, 0.18)], [0.75, mix(p.bg, g1, 0.3)], [1, p.bg]]);
        blob(c, W * 0.66, H * 0.56, H * 0.32, g2, 0.22);
        const layers = 5;
        for (let i = 0; i < layers; i++) {
            const t = i / (layers - 1);
            const col = mix(mix(p.bg, g0, 0.45 - t * 0.3), "#000000", t * 0.55);
            ridge(c, W, H, R, { base: H * (0.58 + t * 0.26), amp: H * (0.07 + (1 - t) * 0.05), freq: 0.7 + t * 0.6, sharp: !!o.sharp, fill: rgba(col, 0.55 + t * 0.4) });
            // 两层山之间一条雾
            const g = c.createLinearGradient(0, H * (0.6 + t * 0.26), 0, H * (0.68 + t * 0.26));
            g.addColorStop(0, rgba(mix(p.bg, g1, 0.4), 0));
            g.addColorStop(0.5, rgba(mix(p.bg, g1, 0.4), 0.12));
            g.addColorStop(1, rgba(mix(p.bg, g1, 0.4), 0));
            c.fillStyle = g;
            c.fillRect(0, H * (0.6 + t * 0.26), W, H * 0.08);
        }
    },

    // 水墨山：淡墨的尖峰从雾里冒出来，一轮红日
    inkhills(c, W, H, p, R) {
        skyGradient(c, W, H, [[0, mix(p.bg, "#000000", 0.2)], [0.6, mix(p.bg, p.alpha, 0.06)], [1, p.bg]]);
        c.fillStyle = rgba(p.glow, 0.75);
        c.beginPath();
        c.arc(W * 0.73, H * 0.3, H * 0.06, 0, Math.PI * 2);
        c.fill();
        blob(c, W * 0.73, H * 0.3, H * 0.2, p.glow, 0.18);
        for (let i = 0; i < 4; i++) {
            const t = i / 3;
            const base = H * (0.6 + t * 0.22);
            // 一座座山：顶上浓、下面化进雾里
            for (let k = 0; k < 5; k++) {
                const x = R() * W;
                const w = W * (0.12 + R() * 0.16);
                const h = H * (0.16 + R() * 0.14) * (1 - t * 0.3);
                const g = c.createLinearGradient(0, base - h, 0, base + H * 0.05);
                const ink = mix(mix(p.bg, p.alpha, 0.35 - t * 0.2), "#000000", t * 0.5);
                g.addColorStop(0, rgba(ink, 0.55 + t * 0.3));
                g.addColorStop(1, rgba(ink, 0));
                c.fillStyle = g;
                c.beginPath();
                c.moveTo(x - w, base + H * 0.05);
                c.quadraticCurveTo(x - w * 0.35, base - h * 0.4, x - w * 0.08, base - h);
                c.quadraticCurveTo(x + w * 0.1, base - h * 1.05, x + w * 0.2, base - h * 0.8);
                c.quadraticCurveTo(x + w * 0.55, base - h * 0.3, x + w, base + H * 0.05);
                c.fill();
            }
        }
    },

    // 海：地平线上一道亮，海面上一排排碎光
    sea(c, W, H, p, R) {
        const [g0, g1] = p.grad;
        const hy = H * 0.64;
        skyGradient(c, W, H, [[0, p.bg], [0.5, mix(p.bg, g0, 0.2)], [0.64, mix(p.bg, g1, 0.45)], [0.645, mix(p.bg, g0, 0.25)], [1, mix(p.bg, "#000000", 0.3)]]);
        blob(c, W * 0.5, hy, W * 0.45, g1, 0.16);
        c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 70; i++) {
            const d = R();
            const y = hy + H * 0.01 + d * d * (H - hy);
            const spread = W * (0.06 + d * 0.5);
            const x = W * 0.5 + (R() - 0.5) * spread * 2;
            c.fillStyle = rgba(mix(g1, "#ffffff", 0.3), 0.1 + (1 - d) * 0.22);
            c.fillRect(x, y, W * (0.01 + R() * 0.03) * (0.3 + d), 1 + d * 1.5);
        }
        c.globalCompositeOperation = "source-over";
        // 雾：地平线附近压一层
        const g = c.createLinearGradient(0, hy - H * 0.08, 0, hy + H * 0.08);
        g.addColorStop(0, rgba(mix(p.bg, g0, 0.3), 0));
        g.addColorStop(0.5, rgba(mix(p.bg, g0, 0.3), 0.25));
        g.addColorStop(1, rgba(mix(p.bg, g0, 0.3), 0));
        c.fillStyle = g;
        c.fillRect(0, hy - H * 0.08, W, H * 0.16);
    },

    // 云：几团蓬松的云，一束斜斜的光
    clouds(c, W, H, p, R) {
        const [g0, g1, g2] = p.grad;
        skyGradient(c, W, H, [[0, p.bg], [0.6, mix(p.bg, g0, 0.18)], [1, mix(p.bg, g1, 0.12)]]);
        c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 3; i++) {
            const x = W * (0.1 + R() * 0.8);
            const g = c.createLinearGradient(x, 0, x + W * 0.25, H);
            g.addColorStop(0, rgba(g2, 0.1));
            g.addColorStop(1, rgba(g2, 0));
            c.fillStyle = g;
            c.beginPath();
            c.moveTo(x - W * 0.02, 0);
            c.lineTo(x + W * 0.03, 0);
            c.lineTo(x + W * 0.3, H);
            c.lineTo(x + W * 0.12, H);
            c.fill();
        }
        c.globalCompositeOperation = "source-over";
        for (let k = 0; k < 7; k++) {
            const cx = R() * W;
            const cy = H * (0.12 + R() * 0.8);
            const s = H * (0.05 + R() * 0.07);
            const col = [g0, g1, g2][k % 3];
            for (let i = 0; i < 14; i++) {
                blob(c, cx + (R() - 0.5) * s * 5, cy + (R() - 0.5) * s * 1.2, s * (0.6 + R()), mix(col, "#ffffff", 0.25), 0.06 + R() * 0.05);
            }
        }
    },

    // 花田：远处缓缓的坡，近处一片片小花点
    meadow(c, W, H, p, R) {
        const [g0, g1, g2] = p.grad;
        skyGradient(c, W, H, [[0, p.bg], [0.62, mix(p.bg, g1, 0.25)], [1, p.bg]]);
        blob(c, W * 0.3, H * 0.64, H * 0.3, g2, 0.2);
        for (let i = 0; i < 3; i++) {
            const t = i / 2;
            ridge(c, W, H, R, { base: H * (0.72 + t * 0.12), amp: H * 0.035, freq: 0.5, fill: rgba(mix(mix(p.bg, g0, 0.35), "#000000", t * 0.45), 0.7 + t * 0.25) });
            for (let k = 0; k < 260 * (t + 0.4); k++) {
                const y = H * (0.74 + t * 0.12) + R() * H * 0.14;
                c.fillStyle = rgba(mix([g0, g1, g2][k % 3], "#ffffff", 0.15), 0.25 + R() * 0.35);
                c.fillRect(R() * W, y, 1 + t * 1.6, 1 + t * 1.6);
            }
        }
    },

    // 银河：一条斜斜的星河，里面夹着几道暗尘
    galaxy(c, W, H, p, R) {
        skyGradient(c, W, H, [[0, mix(p.bg, "#000000", 0.4)], [1, p.bg]]);
        stars(c, W, H, R, Math.round(W * H / 2600), 1);
        const angle = -0.42;
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        const cx = W * 0.5;
        const cy = H * 0.42;
        c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 40; i++) {
            const u = (R() - 0.5) * W * 1.3;
            const v = (R() + R() + R() - 1.5) * H * 0.12;
            blob(c, cx + u * ca - v * sa, cy + u * sa + v * ca, H * (0.08 + R() * 0.12), p.grad[i % p.grad.length], 0.05);
        }
        for (let i = 0; i < 2600; i++) {
            const u = (R() - 0.5) * W * 1.3;
            const v = (R() + R() + R() + R() - 2) * H * 0.07;
            c.fillStyle = rgba(mix(p.grad[i % p.grad.length], "#ffffff", 0.5), 0.2 + R() * 0.5);
            c.fillRect(cx + u * ca - v * sa, cy + u * sa + v * ca, R() < 0.05 ? 1.6 : 0.8, R() < 0.05 ? 1.6 : 0.8);
        }
        c.globalCompositeOperation = "source-over";
        for (let i = 0; i < 14; i++) {
            const u = (R() - 0.5) * W * 1.1;
            const v = (R() - 0.5) * H * 0.05;
            blob(c, cx + u * ca - v * sa, cy + u * sa + v * ca, H * (0.03 + R() * 0.05), mix(p.bg, "#000000", 0.5), 0.35);
        }
    },

    // 合成波：地平线上一轮切成条的太阳，底下一张往远处收的网格
    grid(c, W, H, p, R) {
        const [g0, g1, g2] = p.grad;
        const hy = H * 0.6;
        skyGradient(c, W, H, [[0, mix(p.bg, "#000000", 0.3)], [0.58, mix(p.bg, g2 || g1, 0.18)], [0.6, p.bg], [1, mix(p.bg, "#000000", 0.2)]]);
        stars(c, W, H, R, Math.round(W * H / 6000), 0.5);
        // 太阳：上黄下粉，切成一条条
        const sr = H * 0.17;
        const sg = c.createLinearGradient(0, hy - sr, 0, hy);
        sg.addColorStop(0, rgba(g2 || g1, 0.85));
        sg.addColorStop(1, rgba(g0, 0.85));
        c.save();
        c.beginPath();
        c.arc(W * 0.5, hy, sr, Math.PI, 0);
        c.clip();
        c.fillStyle = sg;
        c.fillRect(W * 0.5 - sr, hy - sr, sr * 2, sr);
        c.globalCompositeOperation = "destination-out";
        for (let i = 0; i < 7; i++) {
            const y = hy - sr * 0.45 + i * sr * 0.075;
            c.fillRect(W * 0.5 - sr, y, sr * 2, 1 + i * 0.9);
        }
        c.restore();
        blob(c, W * 0.5, hy, sr * 2.6, g0, 0.18);
        // 网格
        c.globalCompositeOperation = "lighter";
        c.strokeStyle = rgba(g1, 0.35);
        c.lineWidth = 1;
        for (let i = 1; i < 18; i++) {
            const y = hy + (H - hy) * Math.pow(i / 17, 2.2);
            c.globalAlpha = 0.25 + (i / 17) * 0.75;
            c.beginPath();
            c.moveTo(0, y);
            c.lineTo(W, y);
            c.stroke();
        }
        for (let i = -16; i <= 16; i++) {
            c.globalAlpha = 0.6;
            c.beginPath();
            c.moveTo(W * 0.5 + i * W * 0.012, hy);
            c.lineTo(W * 0.5 + i * W * 0.16, H);
            c.stroke();
        }
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";
        const fade = c.createLinearGradient(0, hy, 0, hy + H * 0.08);
        fade.addColorStop(0, rgba(p.bg, 0.9));
        fade.addColorStop(1, rgba(p.bg, 0));
        c.fillStyle = fade;
        c.fillRect(0, hy, W, H * 0.08);
    },

    // 城市：两层天际线，近的那层亮着窗；巴黎那套多一座铁塔
    city(c, W, H, p, R, o) {
        const [g0, g1] = p.grad;
        skyGradient(c, W, H, [[0, mix(p.bg, "#000000", 0.3)], [0.7, p.bg], [0.92, mix(p.bg, g0, 0.28)], [1, mix(p.bg, g1, 0.2)]]);
        stars(c, W, H, R, Math.round(W * H / 9000), 0.45);
        blob(c, W * 0.5, H * 1.02, W * 0.55, g0, 0.18);
        const layer = (base, hMax, col, windows) => {
            let x = -10;
            while (x < W + 10) {
                const w = W * (0.02 + R() * 0.045);
                const h = H * (0.04 + R() * hMax);
                c.fillStyle = col;
                c.fillRect(x, base - h, w + 1, h + H);
                if (windows) {
                    for (let wy = base - h + 4; wy < base - 3; wy += 5) {
                        for (let wx = x + 3; wx < x + w - 3; wx += 4) {
                            if (R() < 0.22) {
                                c.fillStyle = rgba(R() < 0.7 ? mix(g1, "#ffd9a0", 0.5) : g0, 0.35 + R() * 0.4);
                                c.fillRect(wx, wy, 1.6, 1.6);
                            }
                        }
                    }
                }
                x += w + R() * W * 0.006;
            }
        };
        layer(H * 0.93, 0.12, rgba(mix(p.bg, g0, 0.2), 0.85), false);
        if (o.eiffel) {
            // 铁塔：两条往里收的弧 + 两层平台 + 尖顶
            const tx = W * 0.68;
            const base = H * 0.93;
            const th = H * 0.36;
            c.fillStyle = rgba(mix(p.bg, "#000000", 0.35), 0.95);
            c.beginPath();
            c.moveTo(tx - W * 0.045, base);
            c.quadraticCurveTo(tx - W * 0.012, base - th * 0.35, tx - W * 0.004, base - th);
            c.lineTo(tx + W * 0.004, base - th);
            c.quadraticCurveTo(tx + W * 0.012, base - th * 0.35, tx + W * 0.045, base);
            c.lineTo(tx + W * 0.02, base);
            c.quadraticCurveTo(tx, base - th * 0.2, tx - W * 0.02, base);
            c.fill();
            c.fillRect(tx - W * 0.022, base - th * 0.28, W * 0.044, 2);
            c.fillRect(tx - W * 0.012, base - th * 0.55, W * 0.024, 2);
            blob(c, tx, base - th, H * 0.03, g1, 0.6);
        }
        layer(H * 0.97, 0.09, rgba(mix(p.bg, "#000000", 0.45), 0.97), true);
    },

    // 舞台：几束从上面打下来的追光，地上一圈暖光，光里飘着灰
    stage(c, W, H, p, R) {
        skyGradient(c, W, H, [[0, mix(p.bg, "#000000", 0.2)], [0.8, p.bg], [1, mix(p.bg, p.glow, 0.12)]]);
        c.globalCompositeOperation = "lighter";
        const beams = 4;
        for (let i = 0; i < beams; i++) {
            const x = W * (0.12 + (i / (beams - 1)) * 0.76) + (R() - 0.5) * W * 0.05;
            const to = W * 0.5 + (x - W * 0.5) * 0.35;
            const col = p.grad[i % p.grad.length];
            const g = c.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, rgba(col, 0.2));
            g.addColorStop(1, rgba(col, 0.015));
            c.fillStyle = g;
            c.beginPath();
            c.moveTo(x - W * 0.008, -2);
            c.lineTo(x + W * 0.008, -2);
            c.lineTo(to + W * 0.12, H);
            c.lineTo(to - W * 0.12, H);
            c.fill();
            blob(c, x, 0, H * 0.06, mix(col, "#ffffff", 0.4), 0.5);
        }
        c.globalCompositeOperation = "source-over";
        blob(c, W * 0.5, H * 1.05, W * 0.45, p.glow, 0.2);
        for (let i = 0; i < 140; i++) {
            c.fillStyle = rgba(mix(p.glow, "#ffffff", 0.5), 0.1 + R() * 0.3);
            c.fillRect(R() * W, R() * H, 1, 1);
        }
    },

    // 教堂：高处三扇尖顶长窗 + 上面一扇圆的玫瑰窗，彩色玻璃透着光，光斜斜地照下来，光里飘着灰
    window(c, W, H, p, R) {
        skyGradient(c, W, H, [[0, mix(p.bg, "#000000", 0.3)], [1, p.bg]]);
        const cx = W * 0.5;
        const top = H * 0.02;
        const glass = [...p.grad, p.accent, p.highlight];
        // 光束：从窗口往右下铺开
        c.globalCompositeOperation = "lighter";
        const g = c.createLinearGradient(cx, top, cx + W * 0.25, H);
        g.addColorStop(0, rgba(p.glow, 0.12));
        g.addColorStop(1, rgba(p.glow, 0));
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(cx - H * 0.12, top + H * 0.2);
        c.lineTo(cx + H * 0.12, top + H * 0.12);
        c.lineTo(cx + W * 0.45, H);
        c.lineTo(cx - W * 0.05, H);
        c.fill();
        c.globalCompositeOperation = "source-over";
        // 窗画在一张小图上再放大：玻璃一块块是糊的，像隔着灰看过去
        const s = 4;
        const w = Math.ceil(W / s);
        const h = Math.ceil(H / s);
        const win = document.createElement("canvas");
        win.width = w;
        win.height = h;
        const q = win.getContext("2d");
        const lancet = (x, y, lw, lh) => {
            q.save();
            q.beginPath();
            q.moveTo(x - lw / 2, y + lh);
            q.lineTo(x - lw / 2, y + lw * 0.6);
            q.quadraticCurveTo(x - lw / 2, y, x, y - lw * 0.35);
            q.quadraticCurveTo(x + lw / 2, y, x + lw / 2, y + lw * 0.6);
            q.lineTo(x + lw / 2, y + lh);
            q.closePath();
            q.clip();
            for (let yy = y - lw; yy < y + lh; yy += 3) {
                q.fillStyle = rgba(glass[Math.floor(R() * glass.length)], 0.35 + R() * 0.3);
                q.fillRect(x - lw / 2, yy, lw, 3);
            }
            q.restore();
        };
        const cw = w * 0.5;
        const lw = h * 0.07;
        [-1, 0, 1].forEach((k) => lancet(cw + k * lw * 1.35, h * (k === 0 ? 0.13 : 0.16), lw, h * (k === 0 ? 0.24 : 0.2)));
        // 玫瑰窗：一圈花瓣似的彩色玻璃
        const rx = cw;
        const ry = h * 0.07;
        const rr = lw * 0.9;
        for (let i = 0; i < 12; i++) {
            const a0 = (i / 12) * Math.PI * 2;
            q.fillStyle = rgba(glass[i % glass.length], 0.5);
            q.beginPath();
            q.moveTo(rx, ry);
            q.arc(rx, ry, rr, a0, a0 + Math.PI / 6 - 0.08);
            q.closePath();
            q.fill();
        }
        q.fillStyle = rgba(mix(p.glow, "#ffffff", 0.5), 0.6);
        q.beginPath();
        q.arc(rx, ry, rr * 0.25, 0, Math.PI * 2);
        q.fill();
        c.globalAlpha = 0.8;
        c.drawImage(win, 0, 0, w * s, h * s);
        c.globalAlpha = 1;
        blob(c, cx, top + H * 0.16, H * 0.3, p.glow, 0.12);
        for (let i = 0; i < 90; i++) {
            c.fillStyle = rgba(mix(p.glow, "#ffffff", 0.5), 0.1 + R() * 0.3);
            c.fillRect(cx + (R() - 0.2) * W * 0.4, top + R() * H, 1, 1);
        }
    },

    // 竹林：一根根竹竿，越远越淡，雾里透出一点光
    bamboo(c, W, H, p, R) {
        const [g0, g1] = p.grad;
        skyGradient(c, W, H, [[0, p.bg], [0.5, mix(p.bg, g0, 0.14)], [1, p.bg]]);
        blob(c, W * 0.6, H * 0.35, H * 0.4, g1, 0.14);
        for (let layer = 0; layer < 3; layer++) {
            const t = layer / 2;
            const col = mix(mix(p.bg, g0, 0.35 - t * 0.15), "#000000", t * 0.5);
            for (let i = 0; i < 9 + layer * 3; i++) {
                const x = R() * W;
                const w = 3 + t * 6 + R() * 3;
                c.fillStyle = rgba(col, 0.35 + t * 0.5);
                c.fillRect(x, -5, w, H + 10);
                // 竹节
                c.fillStyle = rgba(mix(col, "#000000", 0.3), 0.6);
                for (let y = R() * 60; y < H; y += 50 + R() * 40) c.fillRect(x - 1, y, w + 2, 2);
                // 叶子
                c.fillStyle = rgba(col, 0.3 + t * 0.4);
                for (let k = 0; k < 6; k++) {
                    c.beginPath();
                    c.ellipse(x + (R() - 0.5) * 60, R() * H * 0.5, 14 + R() * 10, 2.5, (R() - 0.5) * 1.2, 0, Math.PI * 2);
                    c.fill();
                }
            }
        }
    },

    // 森林：三层松树的剪影，雾，一点月光
    forest(c, W, H, p, R) {
        const [g0, g1] = p.grad;
        skyGradient(c, W, H, [[0, mix(p.bg, "#000000", 0.2)], [0.65, mix(p.bg, g0, 0.14)], [1, p.bg]]);
        blob(c, W * 0.25, H * 0.2, H * 0.3, g1, 0.12);
        for (let layer = 0; layer < 3; layer++) {
            const t = layer / 2;
            const base = H * (0.78 + t * 0.12);
            const col = rgba(mix(mix(p.bg, g0, 0.3 - t * 0.2), "#000000", t * 0.55), 0.7 + t * 0.28);
            c.fillStyle = col;
            let x = -20;
            while (x < W + 20) {
                const h = H * (0.1 + R() * 0.12) * (1 - t * 0.2);
                const w = h * 0.36;
                c.beginPath();
                c.moveTo(x, base - h);
                for (let k = 1; k <= 4; k++) {
                    const y = base - h + (h * k) / 4;
                    c.lineTo(x + (w * k) / 4, y);
                    c.lineTo(x + (w * k) / 8, y);
                }
                c.lineTo(x + w * 0.1, base + H);
                c.lineTo(x - w * 0.1, base + H);
                for (let k = 4; k >= 1; k--) {
                    const y = base - h + (h * k) / 4;
                    c.lineTo(x - (w * k) / 8, y);
                    c.lineTo(x - (w * k) / 4, y);
                }
                c.closePath();
                c.fill();
                x += w * (0.6 + R() * 0.7);
            }
            const g = c.createLinearGradient(0, base - H * 0.05, 0, base + H * 0.03);
            g.addColorStop(0, rgba(mix(p.bg, g1, 0.3), 0));
            g.addColorStop(1, rgba(mix(p.bg, g1, 0.3), 0.18));
            c.fillStyle = g;
            c.fillRect(0, base - H * 0.05, W, H * 0.08);
        }
    },

    // 水下：从水面斜照下来的光束，飘着的微粒
    deep(c, W, H, p, R) {
        skyGradient(c, W, H, [[0, mix(p.bg, p.glow, 0.2)], [0.5, p.bg], [1, mix(p.bg, "#000000", 0.4)]]);
        c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 7; i++) {
            const x = W * (0.05 + R() * 0.9);
            const w = W * (0.02 + R() * 0.05);
            const g = c.createLinearGradient(0, 0, 0, H * 0.8);
            g.addColorStop(0, rgba(p.glow, 0.14));
            g.addColorStop(1, rgba(p.glow, 0));
            c.fillStyle = g;
            c.beginPath();
            c.moveTo(x, 0);
            c.lineTo(x + w, 0);
            c.lineTo(x + w * 3 + W * 0.08, H * 0.8);
            c.lineTo(x + W * 0.08, H * 0.8);
            c.fill();
        }
        c.globalCompositeOperation = "source-over";
        for (let i = 0; i < 160; i++) {
            c.fillStyle = rgba(mix(p.glow, "#ffffff", 0.4), 0.08 + R() * 0.25);
            c.fillRect(R() * W, R() * H, 1.2, 1.2);
        }
    },

    // 炉火：从底下透上来的暖光，几缕烟
    embers(c, W, H, p, R) {
        skyGradient(c, W, H, [[0, mix(p.bg, "#000000", 0.3)], [0.6, p.bg], [1, mix(p.bg, p.glow, 0.28)]]);
        blob(c, W * 0.5, H * 1.08, W * 0.5, p.glow, 0.3);
        blob(c, W * 0.25, H * 1.02, W * 0.25, p.grad[2] || p.glow, 0.18);
        c.strokeStyle = rgba(mix(p.bg, "#ffffff", 0.2), 0.06);
        c.lineWidth = 6;
        for (let i = 0; i < 6; i++) {
            let x = R() * W;
            c.beginPath();
            c.moveTo(x, H);
            for (let y = H; y > H * 0.2; y -= 20) {
                x += Math.sin(y * 0.02 + i) * 8 + (R() - 0.5) * 6;
                c.lineTo(x, y);
            }
            c.stroke();
        }
    },

    // 像素风景：掌机屏幕里的那种四色小世界（画在很小的图上再放大，边缘是硬的）
    pixels(c, W, H, p, R) {
        const s = 6;
        const w = Math.ceil(W / s);
        const h = Math.ceil(H / s);
        const px = document.createElement("canvas");
        px.width = w;
        px.height = h;
        const q = px.getContext("2d");
        const shades = [mix(p.bg, "#000000", 0.2), mix(p.bg, p.alpha, 0.25), mix(p.bg, p.alpha, 0.55), mix(p.alpha, p.highlight, 0.5)];
        q.fillStyle = shades[0];
        q.fillRect(0, 0, w, h);
        for (let y = 0; y < h * 0.6; y += 1) {
            if (y % 3 === 0) {
                q.fillStyle = shades[1];
                for (let x = (y / 3) % 2; x < w; x += 2) if (R() < 0.04) q.fillRect(x, y, 1, 1);
            }
        }
        // 太阳
        q.fillStyle = shades[3];
        const sx = Math.round(w * 0.75);
        const sy = Math.round(h * 0.25);
        const sr = Math.round(h * 0.07);
        for (let y = -sr; y <= sr; y++) for (let x = -sr; x <= sr; x++) if (x * x + y * y <= sr * sr) q.fillRect(sx + x, sy + y, 1, 1);
        // 云：一块块的方块
        q.fillStyle = shades[2];
        for (let k = 0; k < 5; k++) {
            const cx = Math.round(R() * w);
            const cy = Math.round(h * (0.12 + R() * 0.3));
            for (let i = 0; i < 4; i++) q.fillRect(cx + i * 3 - 4, cy - (i % 2), 6, 2 + (i % 2));
        }
        // 两层阶梯山
        [[0.68, shades[1]], [0.82, shades[2]]].forEach(([base, col], li) => {
            q.fillStyle = col;
            let y = Math.round(h * base);
            for (let x = 0; x < w; x += 2) {
                y += Math.round((R() - 0.5) * 3);
                y = Math.max(Math.round(h * (base - 0.12)), Math.min(Math.round(h * (base + 0.06)), y));
                q.fillRect(x, y, 2, h - y);
            }
            if (li === 1) {
                q.fillStyle = shades[3];
                for (let x = 0; x < w; x += 7) q.fillRect(x + Math.round(R() * 4), Math.round(h * 0.9) + Math.round(R() * 4), 1, 1);
            }
        });
        c.imageSmoothingEnabled = false;
        c.drawImage(px, 0, 0, w * s, h * s);
        c.imageSmoothingEnabled = true;
    },
};

// ============================================================
// 背景画布：换配色时画一张新的，和旧的交叉淡入；画完就是一张静止的图
// ============================================================
export class Backdrop {
    constructor(canvas, { reduced = false } = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.reduced = reduced;
        this.key = null;
        this.cur = null;
        this.fade = null;
        this._resizeTimer = 0;
        // 最近画过的几张（按配色 + 尺寸）：换乐器来回切的时候直接拿来用，不用每次重画
        this.cache = new Map();
        window.addEventListener("resize", () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => {
                const k = this.key;
                this.key = null;
                if (k) this.show(this.last.cw, this.last.id, { instant: true });
            }, 250);
        });
    }

    // cw：配色；id：配色的名字（决定画法和随机种子）
    show(cw, id, { instant = false } = {}) {
        const motif = motifOf(id);
        const key = id + "|" + motif.sky;
        if (key === this.key) return;
        this.key = key;
        this.last = { cw, id };
        // 按一半的像素画：背景要的就是软，也省一大半的画的时间
        const W = Math.max(64, Math.round(window.innerWidth / 2));
        const H = Math.max(64, Math.round(window.innerHeight / 2));
        const ck = key + "|" + W + "x" + H;
        let next = this.cache.get(ck);
        if (next) {
            this.cache.delete(ck); // 挪到最后：最近用过的留得最久
            this.cache.set(ck, next);
        } else {
            next = this._paint(cw, id, motif, W, H);
            this.cache.set(ck, next);
            if (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value);
        }
        const prev = this.cur;
        this.cur = next;
        if (this.canvas.width !== W || this.canvas.height !== H) {
            this.canvas.width = W;
            this.canvas.height = H;
        }
        cancelAnimationFrame(this.fade);
        if (instant || this.reduced || !prev || prev.width !== W) {
            this.ctx.clearRect(0, 0, W, H);
            this.ctx.drawImage(next, 0, 0);
            return;
        }
        // 交叉淡入 0.9 秒：只在这一小段时间里每帧画，淡完就停
        const t0 = performance.now();
        const step = (now) => {
            const k = Math.min(1, (now - t0) / 900);
            const e = k * k * (3 - 2 * k);
            this.ctx.globalAlpha = 1;
            this.ctx.clearRect(0, 0, W, H);
            this.ctx.globalAlpha = 1 - e;
            this.ctx.drawImage(prev, 0, 0);
            this.ctx.globalAlpha = e;
            this.ctx.drawImage(next, 0, 0);
            this.ctx.globalAlpha = 1;
            if (k < 1) this.fade = requestAnimationFrame(step);
        };
        this.fade = requestAnimationFrame(step);
    }

    // 画一张新的（半分辨率）
    _paint(cw, id, motif, W, H) {
        const next = document.createElement("canvas");
        next.width = W;
        next.height = H;
        if (motif.sky !== "none" && PAINTERS[motif.sky]) {
            const p = {
                bg: cw.bg, glow: cw.glow, accent: cw.accent, highlight: cw.highlight, case: cw.case, alpha: cw.alpha,
                grad: (cw.grad && cw.grad.length ? cw.grad : [cw.glow, cw.highlight, cw.accent]).slice(),
            };
            while (p.grad.length < 3) p.grad.push(p.grad[p.grad.length - 1]);
            try {
                PAINTERS[motif.sky](next.getContext("2d"), W, H, p, seeded(id), motif);
            } catch (err) {
                console.warn("背景画不出来：", motif.sky, err);
            }
        }
        return next;
    }
}
