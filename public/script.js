// ============================================================
// Unbroken · 键盘一笔画
//
// 整个站点只有一块 3D 键盘（js/kb3d.js），它在每一屏扮演不同的角色：
//   首页    背景 + 乐器：文字从它前面滚过去，规则就在它身上演示
//   关卡    棋盘：亮着的键就是这一关要走完的键
//   过关    一张俯视的笔迹图
//   终局    一座塔：十四关的笔迹一层一层叠上去，首尾相接
//   音乐    二十四件乐器（F1–F12 × 两组）；还能整块沉进"深海"水箱里弹
// 声音在 js/audio.js，配色在 js/colorways.js。
// ============================================================
import { KeyboardStage, REGIONS } from "./js/kb3d.js";
import { AudioEngine, INSTRUMENTS, INSTRUMENT_BANKS } from "./js/audio.js";
import { COLORWAYS, LEVEL_COLORWAYS, HOME_COLORWAY } from "./js/colorways.js";
import { Abyss, ABYSS_TANK } from "./js/abyss.js";
import { Dream } from "./js/dream.js";
import { DreamSky, sparkleSprite, orbSprite } from "./js/dreamsky.js";

// 用相对路径，自动适配当前访问地址
const API_ENDPOINT = "/api/generate";

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const pad2 = (n) => String(n).padStart(2, "0");
const ERROR_COLOR = "#ff5d6c";

// 隐私模式下 localStorage 可能直接抛异常，读写都包一层
const store = {
    get(key) {
        try { return localStorage.getItem(key); } catch (err) { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (err) { return false; }
    },
};

// ============================================================
// 棋盘：键盘中间那四排，4 × 10
// 前十关只用字母；第 11 关把数字那一排也放进来，第 12 关连 ; , . / 一起，整整四十个键。
// 最后两关是出好的题：第 13 关起点、终点都定死；第 14 关还要按顺序经过几个指定的键。
// 四排在网格上是对齐的：Q 的正上方是 1、正下方是 A，和以前的三排字母完全一致。
// ============================================================
const GRID = ["1234567890", "qwertyuiop", "asdfghjkl;", "zxcvbnm,./"].map((r) => r.split(""));
const CELL = {};
GRID.forEach((row, r) => row.forEach((id, c) => { CELL[id] = { row: r, col: c }; }));
const GRID_IDS = Object.keys(CELL);

// 相邻 = 上下左右紧挨着，斜着的不算
const ADJ = {};
GRID_IDS.forEach((id) => {
    const { row, col } = CELL[id];
    ADJ[id] = GRID_IDS.filter((o) => {
        const p = CELL[o];
        return (p.row === row && Math.abs(p.col - col) === 1) || (p.col === col && Math.abs(p.row - row) === 1);
    });
});

const isLetter = (id) => /^[a-z]$/.test(id);
const isDigit = (id) => /^[0-9]$/.test(id);
const label = (id) => id.toUpperCase();

// 每关要走的键数，和这一关能用哪些键
const LEVELS = [
    { count: 5, pool: "letters" },
    { count: 7, pool: "letters" },
    { count: 9, pool: "letters" },
    { count: 11, pool: "letters" },
    { count: 13, pool: "letters" },
    { count: 15, pool: "letters" },
    { count: 17, pool: "letters" },
    { count: 19, pool: "letters" },
    { count: 22, pool: "letters" },
    { count: 26, pool: "letters" },
    { count: 32, pool: "alnum" },
    { count: 40, pool: "all" },
    // 第 13 关：起点 F、终点 T 斜对着，只差一步，却得绕完整块键盘才能回来（M I D 三个键不在这一关里）。
    // 一共只有三种走法
    { count: 37, pool: "all", design: { holes: "mid", start: "f", end: "t", solution: "fghnbvcxzaswq123er4567890pol;/.,kjuyt" } },
    // 第 14 关：从 Q 出发，按顺序经过 W O R L D，最后停在 D 上——全盘四十个键，只有这一种走法。
    // （第一步直接走 W 是个陷阱）
    { count: 40, pool: "all", design: { start: "q", end: "d", order: "world", solution: "q12we34567890poiuytrfghjkl;/.,mnbvcxzasd" } },
];
const TOTAL_LEVELS = LEVELS.length;

// 从第几关开始要求「必须停在指定的终点键上」。设为 1 则每关都要求。
const END_TARGET_FROM_LEVEL = 8;

function poolOf(level) {
    const kind = LEVELS[level - 1].pool;
    return new Set(GRID_IDS.filter((id) =>
        kind === "all" || isLetter(id) || (kind === "alnum" && isDigit(id))
    ));
}

function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function generateLevelKeys(level) {
    // 出好的题：键就是那几个，顺序直接用备好的那条解
    const design = LEVELS[level - 1].design;
    if (design) return design.solution.split("");
    const pool = poolOf(level);
    const target = Math.min(LEVELS[level - 1].count, pool.size);
    // 要走的键接近整片可用区时（第 10–12 关），随机乱走很容易把角落困死，换成"先走出路少的"
    const tight = target >= pool.size - 4;
    const budget = { n: 0 };
    for (let attempt = 0; attempt < 30; attempt++) {
        for (const start of shuffled([...pool])) {
            budget.n = 40000;
            const path = randomWalk(start, target, pool, budget, tight);
            if (path) return path;
        }
    }
    return null;
}

function randomWalk(start, target, pool, budget, tight) {
    const visited = new Set([start]);
    const path = [start];
    const free = (id) => pool.has(id) && !visited.has(id);

    // 从 from 出发还够得着多少个没踩过的键：比剩下要走的少，这条路注定走不完，趁早回头
    const reach = (from) => {
        const seen = new Set([from]);
        const queue = [from];
        let n = 0;
        while (queue.length) {
            const cur = queue.pop();
            for (const nx of ADJ[cur]) {
                if (seen.has(nx) || !free(nx)) continue;
                seen.add(nx);
                queue.push(nx);
                n++;
            }
        }
        return n;
    };
    const onward = (id) => ADJ[id].filter(free).length;

    function walk() {
        if (path.length === target) return true;
        if (budget.n-- <= 0) return false;
        const cur = path[path.length - 1];
        if (reach(cur) < target - path.length) return false;
        const next = shuffled(ADJ[cur].filter(free));
        // Warnsdorff：出路最少的邻居先走。shuffle 在前，出路一样多的时候仍然是随机的
        if (tight) next.sort((a, b) => onward(a) - onward(b));
        for (const nx of next) {
            visited.add(nx);
            path.push(nx);
            if (walk()) return true;
            visited.delete(nx);
            path.pop();
        }
        return false;
    }

    return walk() ? path.slice() : null;
}

// 数出诱导子图上以各个键收尾的哈密顿路径条数。
// 预算耗尽说明这一关的搜索空间太大，返回 null 让调用方退回安全值。
function countPathsByEnd(keys) {
    const inLevel = new Set(keys);
    const sub = {};
    inLevel.forEach((k) => { sub[k] = ADJ[k].filter((x) => inLevel.has(x)); });
    const total = inLevel.size;
    const endCount = {};
    inLevel.forEach((k) => { endCount[k] = 0; });

    let budget = 2000000;
    const visited = new Set();

    function walk(current, depth) {
        if (budget-- <= 0) return;
        if (depth === total) {
            endCount[current]++;
            return;
        }
        for (const next of sub[current]) {
            if (visited.has(next)) continue;
            visited.add(next);
            walk(next, depth + 1);
            visited.delete(next);
        }
    }

    for (const start of inLevel) {
        visited.clear();
        visited.add(start);
        walk(start, 1);
    }
    return budget > 0 ? endCount : null;
}

// 挑「解最少但仍然有解」的键当终点，把可行走法压到最少。
// 统计不完整时退回随机走法自带的终点——它一定可解。
function pickEndKey(keys) {
    const fallback = keys[keys.length - 1];
    // 三十个键以上，路径数是天文数字，数不完的，直接用随机走法的终点
    if (keys.length > 30) return fallback;
    const counts = countPathsByEnd(keys);
    if (!counts) return fallback;
    let best = null;
    Object.keys(counts).forEach((k) => {
        if (counts[k] > 0 && (best === null || counts[k] < counts[best])) best = k;
    });
    return best || fallback;
}

// ============================================================
// 每一关：一套键帽配色 + 一件乐器 + 一个调式
// 走线时第几步就弹音阶的第几级，整条路走完正好是一条往上爬的旋律
// ============================================================
const LEVEL_SOUND = [
    { patch: "musicbox", root: 261.63, scale: [0, 2, 4, 7, 9], span: 11 },       // 晨光 · 宫调五声
    { patch: "marimba", root: 293.66, scale: [0, 2, 4, 7, 9], span: 11 },        // 薄荷
    { patch: "harp", root: 220.0, scale: [0, 3, 5, 7, 10], span: 11 },           // 海雾 · 小调五声
    { patch: "kalimba", root: 196.0, scale: [0, 2, 4, 6, 7, 9, 11], span: 13 },  // 蜜橘 · 利底亚
    { patch: "glass", root: 233.08, scale: [0, 3, 5, 7, 10], span: 11 },         // 薰衣草
    { patch: "handpan", root: 164.81, scale: [0, 2, 3, 5, 7, 9, 10], span: 13 }, // 苔原 · 多利亚
    { patch: "rhodes", root: 233.08, scale: [0, 2, 4, 7, 9], span: 11 },         // 暮云
    { patch: "vibes", root: 277.18, scale: [0, 3, 5, 7, 10], span: 11 },         // 霜夜
    { patch: "ember", root: 220.0, scale: [0, 2, 4, 7, 9], span: 13 },           // 星火
    { patch: "aurora", root: 261.63, scale: [0, 2, 4, 6, 8, 10], span: 11 },     // 极光 · 全音阶
    { patch: "pluck", root: 246.94, scale: [0, 2, 3, 7, 9], span: 13 },          // 青岚
    { patch: "piano", root: 261.63, scale: [0, 2, 4, 5, 7, 9, 11], span: 15 },   // 破晓 · 大调
    { patch: "guzheng", root: 196.0, scale: [0, 2, 4, 7, 9], span: 14 },         // 流光 · 宫调五声，古筝从下面滑上来
    { patch: "cosmos", root: 220.0, scale: [0, 2, 4, 6, 7, 9, 11], span: 17 },   // 寰宇 · 利底亚
];

const levelColorway = (n) => COLORWAYS[LEVEL_COLORWAYS[n - 1]];
const levelSound = (n) => LEVEL_SOUND[n - 1];

// 选了"情绪"时，每一关还是那件乐器、那个主音，但走线用情绪的音阶（悲伤 = 小调……），
// 音域按音阶长短换算，整条路走完仍然是差不多高的一条旋律线
function levelSoundFor(n) {
    const base = LEVEL_SOUND[n - 1];
    const mood = MOODS[style.mood];
    if (!mood || !mood.game) return base;
    const span = Math.round((base.span * mood.game.length) / base.scale.length);
    return { ...base, scale: mood.game, span };
}

function scaleFreqOf(snd, idx) {
    const s = snd.scale;
    const semitone = s[idx % s.length] + 12 * Math.floor(idx / s.length);
    return snd.root * Math.pow(2, semitone / 12);
}

// 第 step 步（共 total 步）落在音阶的哪一级
function stepFreqOf(snd, step, total) {
    const ratio = total > 1 ? step / (total - 1) : 0;
    return scaleFreqOf(snd, Math.round(ratio * snd.span));
}

// ---------- 本地固定词库 ----------
const WORD_BANK = {
    a: ["AMAZING", "ALIVE", "AWESOME", "ADORED", "ABLE", "ARTFUL"],
    b: ["BRIGHT", "BRAVE", "BLOOMING", "BELOVED", "BOLD", "BREEZY"],
    c: ["CALM", "CHERISHED", "CHEERFUL", "CURIOUS", "CARING", "COZY"],
    d: ["DELIGHTFUL", "DARING", "DAZZLING", "DEAR", "DAWNING", "DEVOTED"],
    e: ["EVERGREEN", "EASY", "ENOUGH", "ENDLESS", "EAGER", "EARNEST"],
    f: ["FEARLESS", "FREE", "FRIENDLY", "FOND", "FLOURISHING", "FUNNY"],
    g: ["GENTLE", "GLOWING", "GRATEFUL", "GOLDEN", "GENEROUS", "GRACEFUL"],
    h: ["HAPPY", "HOPEFUL", "HOME", "HEARTFELT", "HUMMING", "HEALING"],
    i: ["IMAGINATIVE", "INSPIRED", "INVITING", "IMPORTANT", "IDEAL", "INTREPID"],
    j: ["JOYFUL", "JOLLY", "JUBILANT", "JAUNTY", "JUST", "JAZZY"],
    k: ["KIND", "KEEN", "KINDRED", "KNOWING", "KINETIC", "KEYED-UP"],
    l: ["LOVELY", "LUCKY", "LIGHT", "LAUGHING", "LOYAL", "LIMITLESS"],
    m: ["MERRY", "MAGIC", "MINDFUL", "MELLOW", "MIGHTY", "MARVELOUS"],
    n: ["NEW", "NEARBY", "NOBLE", "NURTURING", "NIMBLE", "NEEDED"],
    o: ["OPEN", "OPTIMISTIC", "ORIGINAL", "ONWARD", "OUTSTANDING", "OVERJOYED"],
    p: ["PLAYFUL", "PEACEFUL", "PRECIOUS", "PROUD", "PATIENT", "PLUCKY"],
    q: ["QUIET", "QUIRKY", "QUICK", "QUAINT", "QUALITY", "QUENCHING"],
    r: ["RADIANT", "RESTED", "REAL", "READY", "REMARKABLE", "RESILIENT"],
    s: ["SUNNY", "SAFE", "SEEN", "SPARKLING", "STEADY", "SWEET"],
    t: ["TENDER", "TRUE", "THRIVING", "TREASURED", "TRANQUIL", "TRUSTED"],
    u: ["UPLIFTED", "UNIQUE", "UNHURRIED", "USEFUL", "UNBROKEN", "UPBEAT"],
    v: ["VIBRANT", "VALUED", "VIVID", "VICTORIOUS", "VITAL", "VELVETY"],
    w: ["WARM", "WONDERFUL", "WHOLE", "WELCOME", "WISE", "WILLING"],
    x: ["XOXO", "XENIAL", "X-FACTOR", "XTRA-SPECIAL", "XCITING", "XUBERANT"],
    y: ["YOUTHFUL", "YES", "YEARNING", "YOURS", "YIELDING", "YUMMY"],
    z: ["ZESTY", "ZEALOUS", "ZANY", "ZIPPY", "ZEN", "ZINGY"],
};

function generateFixedWords(letterSequence) {
    return letterSequence.split("").map((letter) => {
        const options = WORD_BANK[letter];
        return options[Math.floor(Math.random() * options.length)];
    });
}

// ---------- AI 造句 ----------
async function generateAISentence(letterSequence) {
    // 服务端 20 秒就会放弃并给兜底句；这里多等 5 秒，再不回来就算失败（显示"再试一次"的按钮），不让过关页一直转圈
    const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letters: letterSequence }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined,
    });
    if (!response.ok) {
        const errText = await response.text();
        console.error("❌ [前端] HTTP 错误:", response.status, errText);
        throw new Error(`请求失败 (${response.status}): ${errText}`);
    }
    const data = await response.json();
    if (!data.sentence) {
        console.error("❌ [前端] 返回数据中没有句子:", data);
        throw new Error("返回数据中没有找到句子");
    }
    return data.sentence;
}

// ============================================================
// 舞台、声音、配色
// ============================================================
let stage = null;
try {
    stage = new KeyboardStage();
} catch (err) {
    console.error("WebGL 不可用：", err);
}

const audio = new AudioEngine();

// 配色写进 CSS 变量：背景、按钮、光晕全都跟着键帽套装一起换
const CSS_VARS = [
    ["bg", "--bg"], ["ink", "--ink"], ["glow", "--glow"],
    ["accent", "--accent"], ["accentLegend", "--accent-ink"], ["case", "--case"],
    ["alpha", "--alpha"], ["alphaLegend", "--alpha-ink"], ["mod", "--mod"], ["modLegend", "--mod-ink"],
];
const themeMeta = document.querySelector('meta[name="theme-color"]');
let colorway = COLORWAYS[HOME_COLORWAY];

function applyColorway(cw, opts) {
    colorway = cw;
    const root = document.documentElement.style;
    CSS_VARS.forEach(([k, v]) => root.setProperty(v, cw[k]));
    if (themeMeta) themeMeta.setAttribute("content", cw.bg);
    stage.setColorway(cw, opts);
    // 渐变的头、腰、尾三种颜色也写进 CSS：背景的极光、标题的渐变字、走线序号都用它
    root.setProperty("--grad-a", stage.gradientColor(0));
    root.setProperty("--grad-b", stage.gradientColor(0.5));
    root.setProperty("--grad-c", stage.gradientColor(1));
}

// 键帽上的字：只在内容真的变了时才重画那张小画布
const legendCache = new Map();

function legend(id, data) {
    const d = data || {};
    const key = JSON.stringify(d);
    if ((legendCache.get(id) || "{}") === key) return;
    if (key === "{}") legendCache.delete(id);
    else legendCache.set(id, key);
    stage.setLegend(id, d);
}

function clearLegends() {
    [...legendCache.keys()].forEach((id) => stage.setLegend(id, {}));
    legendCache.clear();
}

// 声像：键在键盘上越靠右，声音越偏右
function panOf(id) {
    const k = stage.keys.get(id);
    if (!k) return 0;
    return Math.max(-0.7, Math.min(0.7, ((k.group.position.x - 8) / 8) * 0.65));
}

// 一组键在键盘上占的范围（给镜头取景用），太小的范围撑到一个最小尺寸，免得怼到脸上
function regionOf(ids, pad = 1, minW = 7, minD = 3.4) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    ids.forEach((id) => {
        const k = stage.keys.get(id);
        if (!k) return;
        const { x, z } = k.group.position;
        const hw = k.spec.w / 2;
        x0 = Math.min(x0, x - hw); x1 = Math.max(x1, x + hw);
        z0 = Math.min(z0, z - 0.5); z1 = Math.max(z1, z + 0.5);
    });
    if (!Number.isFinite(x0)) return REGIONS.letters;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const w = Math.max(minW, x1 - x0 + 2 * pad);
    const d = Math.max(minD, z1 - z0 + 2 * pad);
    return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
}

// ============================================================
// 风格：情绪（音阶 + 灯光）· 场景（键帽 + 背景 + 环境声）· 声音与画面（混响 / 回声 / 画风 / 电影感……）
// 一笔画和音乐模式共用这一套。选情绪或场景 = 套用它推荐的效果；
// 自己在"声音与画面"里改过的项会一直保留，直到点"恢复默认"
// ============================================================
const MODES = {
    ionian: [0, 2, 4, 5, 7, 9, 11],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    phrygianDom: [0, 1, 4, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
};

// mode：音乐模式里 1–7 对应的音程；game：一笔画走线时用的音阶；velocity / length：力度和余音
const MOODS = {
    none: { name: "默认", en: "Default" },
    happy: {
        name: "开心", en: "Happy", mode: MODES.ionian, modeName: "大调", game: [0, 2, 4, 7, 9],
        velocity: 1, length: 0.9, light: { tint: "#fff0da", exposure: 1.12, key: 1.06 },
        fx: { reverb: "room", echo: 0, tone: "bright" },
    },
    sad: {
        name: "悲伤", en: "Sad", mode: MODES.aeolian, modeName: "自然小调", game: MODES.aeolian,
        velocity: 0.8, length: 1.35, light: { tint: "#c6d3ff", exposure: 0.9, key: 0.82 },
        fx: { reverb: "hall", echo: 0.5, tone: "warm" },
    },
    relaxed: {
        name: "放松", en: "Relaxed", mode: MODES.mixolydian, modeName: "混合利底亚", game: [0, 2, 4, 7, 9],
        velocity: 0.7, length: 1.5, light: { tint: "#ffe6cc", exposure: 1, key: 0.92 },
        fx: { reverb: "plate", echo: 0.5, tone: "warm" },
    },
    tense: {
        name: "紧张", en: "Tense", mode: MODES.phrygianDom, modeName: "弗里几亚属", game: MODES.phrygianDom,
        velocity: 1.1, length: 0.55, light: { tint: "#ffffff", exposure: 1.16, key: 1.3 },
        fx: { reverb: "room", echo: 0, tone: "bright" },
    },
    blue: {
        name: "忧郁", en: "Blue", mode: MODES.dorian, modeName: "多利亚", game: [0, 3, 5, 7, 10],
        velocity: 0.75, length: 1.4, light: { tint: "#d4ccf6", exposure: 0.94, key: 0.9 },
        fx: { reverb: "cathedral", echo: 0.5, tone: "clear" },
    },
    free: {
        name: "自由", en: "Free", mode: MODES.lydian, modeName: "利底亚", game: [0, 2, 4, 6, 8, 10],
        velocity: 0.95, length: 1.15, light: { tint: "#eaf8ff", exposure: 1.1, key: 1 },
        fx: { reverb: "hall", echo: 0.5, width: true },
    },
};

// colorway：整块键盘换成这套键帽；amb：环境声；particles：背景里飘的东西
const SCENES = {
    none: { name: "默认", en: "Default" },
    love: { name: "爱情", en: "Love", colorway: "meigui", amb: "love", particles: "petals", fx: { reverb: "hall", bloom: true, tone: "warm" } },
    heartbreak: { name: "失恋", en: "Heartbreak", colorway: "yuye", amb: "rain", particles: "rain", fx: { reverb: "hall", echo: 0.5, tone: "warm" } },
    adventure: { name: "冒险", en: "Adventure", colorway: "xiagu", amb: "adventure", particles: "embers", fx: { reverb: "cathedral", cinematic: true } },
    dream: { name: "梦想", en: "Dream", colorway: "mengjing", amb: "dream", particles: "stars", fx: { reverb: "cathedral", bloom: true, tone: "bright", flow: true } },
    nature: { name: "自然", en: "Nature", colorway: "senlin", amb: "forest", particles: "fireflies", fx: { reverb: "plate", width: true } },
    city: { name: "城市", en: "City", colorway: "nihong", amb: "city", particles: "bokeh", fx: { reverb: "room", echo: 1, tone: "bright", flow: true } },
    ocean: { name: "海洋", en: "Ocean", colorway: "shenhai", amb: "ocean", particles: "bubbles", fx: { reverb: "hall", echo: 0.5, width: true } },
    sunset: { name: "日落", en: "Sunset", colorway: "wanxia", amb: "sunset", particles: "haze", fx: { reverb: "hall", bloom: true, tone: "warm" } },
};

const FX_DEFAULT = { reverb: "hall", echo: 0, tone: "clear", bloom: false, width: false, cinematic: false, ambience: true, flow: false };

// custom：自己在面板里改过的项（优先级最高）
const style = loadStyle();

function loadStyle() {
    try {
        const raw = JSON.parse(store.get("mss-style")) || {};
        return {
            mood: MOODS[raw.mood] ? raw.mood : "none",
            scene: SCENES[raw.scene] ? raw.scene : "none",
            custom: raw.custom && typeof raw.custom === "object" ? raw.custom : {},
        };
    } catch (err) {
        return { mood: "none", scene: "none", custom: {} };
    }
}

// 实际生效的效果：默认 ← 场景推荐 ← 情绪推荐 ← 自己改的
function effectiveFx() {
    return { ...FX_DEFAULT, ...(SCENES[style.scene].fx || {}), ...(MOODS[style.mood].fx || {}), ...style.custom };
}

function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (p, s) => (p >> s) & 255;
    const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
    return "#" + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1);
}

// 画风也作用在 3D 灯光上：暖 = 主光偏琥珀；亮 = 曝光高一点；复古 = 偏旧照片的黄
const TONE_LIGHT = {
    clear: null,
    warm: { tint: "#ffd6a8", t: 0.3, exp: -0.02 },
    bright: { tint: "#ffffff", t: 0, exp: 0.1 },
    vintage: { tint: "#e8c595", t: 0.4, exp: -0.07 },
};

function applyStyle({ persist = true } = {}) {
    const mood = MOODS[style.mood];
    const scene = SCENES[style.scene];
    const fx = effectiveFx();
    audio.setFx({
        reverb: fx.reverb, echo: fx.echo, tone: fx.tone,
        bloom: fx.bloom ? 0.7 : 0, width: fx.width ? 1.6 : 1, cinematic: !!fx.cinematic,
    });
    audio.setAmbience(fx.ambience && scene.amb ? scene.amb : "off", 0.6);
    const L = { tint: "#ffffff", exposure: 1.05, key: 1, ...(mood.light || {}) };
    const tl = TONE_LIGHT[fx.tone];
    stage.setLighting({
        tint: tl ? mixHex(L.tint, tl.tint, tl.t) : L.tint,
        exposure: L.exposure + (tl ? tl.exp : 0) + (fx.cinematic ? -0.04 : 0),
        key: L.key,
    });
    stage.setCinematic(!!fx.cinematic);
    stage.setGradientMode(fx.flow ? "flow" : "soft");
    document.body.classList.toggle("flow", !!fx.flow && !reduceMotion);
    document.body.dataset.tone = fx.tone;
    document.body.dataset.scene = style.scene;
    document.body.classList.toggle("cinematic", !!fx.cinematic);
    refreshColorway();
    sceneFX.set(scene.particles || null);
    syncStylePanel();
    if (currentScreen === "music") {
        syncKeyUI();
        refreshMusicKeyboard();
        if (followMode) highlightNext();
    }
    if (persist) store.set("mss-style", JSON.stringify(style));
}

function setMood(id) {
    if (!MOODS[id]) return;
    style.mood = id;
    applyStyle();
    // 换情绪就用这一屏的乐器弹一小段新的音阶，耳朵马上听出差别
    const mode = (MOODS[id].mode) || MAJOR;
    const patch = currentPatch();
    [0, 2, 4, 6, 7].forEach((deg, i) => {
        const semi = mode[deg % 7] + 12 * Math.floor(deg / 7);
        audio.play(patch, 261.63 * Math.pow(2, semi / 12), { when: i * 0.09, velocity: 0.55, length: 0.7 });
    });
}

function setScene(id) {
    if (!SCENES[id]) return;
    style.scene = id;
    applyStyle();
    if (id !== "none" && stage) stage.ripple("g", { strength: 1, speed: 7, life: 1.8 });
}

function setFxField(field, value) {
    style.custom[field] = value;
    applyStyle();
}

function resetStyle() {
    style.mood = "none";
    style.scene = "none";
    style.custom = {};
    applyStyle();
}

// 当前这一屏应该穿哪套键帽：选了场景就是场景的，否则每屏各有各的
function screenColorway() {
    if (abyssOn) return COLORWAYS.abyss;
    const sc = SCENES[style.scene];
    if (sc && sc.colorway) return COLORWAYS[sc.colorway];
    if (currentScreen === "game" || currentScreen === "reward") return levelColorway(state.level);
    if (currentScreen === "final") return COLORWAYS.poxiao;
    if (currentScreen === "music") return COLORWAYS[INSTRUMENTS[musicPatch].colorway];
    return COLORWAYS[HOME_COLORWAY];
}

function refreshColorway() {
    if (!stage) return;
    applyColorway(screenColorway());
    // 走过的键上的序号颜色取自配色，换了配色要重画
    if (currentScreen === "game" && state.levelKeySet.size) renderGameKeys(false);
}

// ---------- 风格面板 ----------
const stylePanelEl = $("style-panel");
const styleBtn = $("btn-style");

const SEGS = {
    reverb: [["off", "关"], ["room", "房间"], ["hall", "大厅"], ["cathedral", "教堂"]],
    echo: [[0, "关"], [0.5, "轻"], [1, "重"]],
    tone: [["clear", "清澈"], ["warm", "温暖"], ["bright", "明亮"], ["vintage", "复古"]],
};
const TOGGLES = [
    ["bloom", "氛围感", "每个音后面拖一层光晕和长长的尾巴"],
    ["width", "空间感", "把声音往两边推开，戴耳机最明显"],
    ["cinematic", "电影感", "大空间 + 宽声场 + 遮幅画面，镜头也放慢"],
    ["ambience", "环境声", "场景自带的海浪、雨声、鸟叫……"],
    ["flow", "流光", "渐变的颜色在键盘底光和背景里慢慢流动（多耗一点电）"],
];

function buildStylePanel() {
    const moods = $("sp-moods");
    Object.entries(MOODS).forEach(([id, m]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sp-chip";
        b.dataset.mood = id;
        b.innerHTML = `<span class="sp-chip-name">${m.name}</span><span class="sp-chip-en">${m.modeName || m.en}</span>`;
        b.addEventListener("click", () => setMood(id));
        moods.appendChild(b);
    });
    const scenes = $("sp-scenes");
    Object.entries(SCENES).forEach(([id, sc]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sp-chip sp-scene";
        b.dataset.scene = id;
        const cw = sc.colorway ? COLORWAYS[sc.colorway] : null;
        if (cw) {
            b.style.setProperty("--sw-a", cw.glow);
            b.style.setProperty("--sw-b", cw.accent);
            b.style.setProperty("--sw-c", cw.case);
        }
        b.innerHTML = `<span class="sp-swatch" aria-hidden="true"></span><span class="sp-chip-name">${sc.name}</span>`;
        b.addEventListener("click", () => setScene(id));
        scenes.appendChild(b);
    });
    Object.entries(SEGS).forEach(([field, opts]) => {
        const el = $("sp-" + field);
        opts.forEach(([v, name]) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "seg-btn";
            b.dataset.value = String(v);
            b.textContent = name;
            b.addEventListener("click", () => setFxField(field, v));
            el.appendChild(b);
        });
    });
    const tg = $("sp-toggles");
    TOGGLES.forEach(([field, name, tip]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sp-toggle";
        b.dataset.field = field;
        b.title = tip;
        b.innerHTML = `<span class="sp-toggle-dot" aria-hidden="true"></span>${name}`;
        b.addEventListener("click", () => setFxField(field, !effectiveFx()[field]));
        tg.appendChild(b);
    });
    $("sp-reset").addEventListener("click", resetStyle);
    $("sp-check").addEventListener("click", quickSoundCheck);
}

function syncStylePanel() {
    const fx = effectiveFx();
    document.querySelectorAll("#sp-moods .sp-chip").forEach((b) => {
        const on = b.dataset.mood === style.mood;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
    });
    document.querySelectorAll("#sp-scenes .sp-chip").forEach((b) => {
        const on = b.dataset.scene === style.scene;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
    });
    Object.keys(SEGS).forEach((field) => {
        document.querySelectorAll(`#sp-${field} .seg-btn`).forEach((b) => {
            const on = b.dataset.value === String(fx[field]);
            b.classList.toggle("on", on);
            b.setAttribute("aria-pressed", String(on));
        });
    });
    document.querySelectorAll("#sp-toggles .sp-toggle").forEach((b) => {
        const on = !!fx[b.dataset.field];
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
    });
    // 顶栏按钮上一个小点：有自定义风格时亮着
    styleBtn.classList.toggle("has-style", style.mood !== "none" || style.scene !== "none" || Object.keys(style.custom).length > 0);
}

// ---------- 声音自检：弹一个和弦，从送往扬声器的那一路量电平 ----------
function quickSoundCheck() {
    const out = $("sp-check-out");
    const say = (text, bad = false) => {
        out.textContent = text;
        out.classList.toggle("bad", bad);
    };
    if (!soundOn) return say("声音开关是关着的：点顶栏的喇叭打开", true);
    if (volume <= 0.001) return say("音量是 0：把顶栏的滑杆往右拖", true);
    audio.ensure();
    audio.unlock();
    say("听……");
    const patch = currentPatch();
    [0, 4, 7, 12].forEach((s, i) => audio.play(patch, 261.63 * Math.pow(2, s / 12), { when: i * 0.05, velocity: 0.8 }));
    let best = -Infinity;
    const t0 = performance.now();
    const poll = () => {
        const m = audio.meter();
        if (m) best = Math.max(best, m.rms);
        if (performance.now() - t0 < 900) {
            requestAnimationFrame(poll);
            return;
        }
        const st = audio.ctx ? audio.ctx.state : "none";
        if (st !== "running") say(`浏览器把声音挂起了（${st}）：点一下页面任意位置再试`, true);
        else if (best < -70) say("音频在跑，但送出去的是静音：检查系统音量和输出设备", true);
        else {
            const L = audio.latency();
            const ms = L ? Math.round(L.total * 1000) : 0;
            say(`✓ 声音通路正常，最响 ${Math.round(best)} dBFS` + (ms ? ` · 按下到出声约 ${ms} ms${L.total >= LAG_NOTICE ? "（偏慢，蓝牙耳机？）" : ""}` : ""));
        }
    };
    requestAnimationFrame(poll);
}

// ============================================================
// 场景背景：一张低帧率的 2D 画布，飘花瓣、下雨、萤火虫、星空、气泡……
// 粒子不多（几十个），30fps 画，页面在后台或"减少动效"时停下
// ============================================================
class SceneFX {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.kind = null;
        this.parts = [];
        this.raf = null;
        this.last = 0;
        this.acc = 0;
        this.t = 0;
        this._loop = this._loop.bind(this);
        window.addEventListener("resize", () => this._size());
        document.addEventListener("visibilitychange", () => this._sync());
        this._size();
    }

    _size() {
        this.w = window.innerWidth;
        this.h = window.innerHeight;
        // 软的东西不需要高清：按 1 倍像素画，省一大截
        this.canvas.width = this.w;
        this.canvas.height = this.h;
        if (this.kind) this._seed();
        if (reduceMotion && this.kind) this._draw(0);
    }

    set(kind) {
        this.colors = [colorway.glow, colorway.accent, colorway.highlight];
        if (kind === this.kind) return;
        this.kind = kind;
        this.canvas.classList.toggle("on", !!kind);
        this._seed();
        this._sync();
        if (!kind) this.ctx.clearRect(0, 0, this.w, this.h);
        else if (reduceMotion) this._draw(0);
    }

    _sync() {
        const run = !!this.kind && !document.hidden && !reduceMotion;
        if (run && !this.raf) {
            this.last = performance.now();
            this.raf = requestAnimationFrame(this._loop);
        } else if (!run && this.raf) {
            cancelAnimationFrame(this.raf);
            this.raf = null;
        }
    }

    _seed() {
        const W = this.w;
        const H = this.h;
        const R = Math.random;
        const small = W < 700;
        const n = (k) => Math.round(k * (small ? 0.6 : 1));
        const P = [];
        switch (this.kind) {
            case "petals":
                for (let i = 0; i < n(26); i++) P.push({ x: R() * W, y: R() * H, vy: 14 + R() * 18, vx: 6 + R() * 10, r: 5 + R() * 6, rot: R() * 6, vr: (R() - 0.5) * 1.2, ph: R() * 6 });
                break;
            case "rain":
                for (let i = 0; i < n(80); i++) P.push({ x: R() * W, y: R() * H, len: 12 + R() * 16, v: 420 + R() * 260, a: 0.08 + R() * 0.16 });
                break;
            case "embers":
                for (let i = 0; i < n(42); i++) P.push({ x: R() * W, y: R() * H, vy: 14 + R() * 34, vx: 8 + R() * 14, r: 1 + R() * 2, ph: R() * 6 });
                break;
            case "stars":
                for (let i = 0; i < n(110); i++) P.push({ x: R() * W, y: R() * H * 0.85, r: 0.5 + R() * 1.4, ph: R() * 6, sp: 0.6 + R() * 2 });
                this.shoot = null;
                break;
            case "fireflies":
                for (let i = 0; i < n(30); i++) P.push({ x: R() * W, y: H * 0.35 + R() * H * 0.65, ph: R() * 6, sp: 0.2 + R() * 0.5, r: 1.5 + R() * 1.5 });
                break;
            case "bokeh":
                for (let i = 0; i < n(18); i++) P.push({ x: R() * W, y: R() * H, r: 30 + R() * 70, vx: (R() - 0.5) * 8, vy: (R() - 0.5) * 6, c: i % 3, a: 0.05 + R() * 0.08 });
                break;
            case "bubbles":
                for (let i = 0; i < n(34); i++) P.push({ x: R() * W, y: R() * H, r: 1.5 + R() * 5, vy: 18 + R() * 30, ph: R() * 6 });
                break;
            case "haze":
                for (let i = 0; i < n(36); i++) P.push({ x: R() * W, y: R() * H, r: 0.8 + R() * 1.8, vx: 3 + R() * 8, vy: -2 - R() * 5, ph: R() * 6 });
                break;
            default:
                break;
        }
        this.parts = P;
    }

    _loop(now) {
        this.raf = requestAnimationFrame(this._loop);
        const dt = Math.min(0.1, (now - this.last) / 1000);
        this.last = now;
        this.acc += dt;
        if (this.acc < 1 / 30) return; // 30fps 就够了
        const step = this.acc;
        this.acc = 0;
        this._draw(step);
    }

    _draw(dt) {
        const c = this.ctx;
        const W = this.w;
        const H = this.h;
        this.t += dt;
        const t = this.t;
        const [c1, c2, c3] = this.colors;
        c.clearRect(0, 0, W, H);
        const wrap = (p, pad = 20) => {
            if (p.y > H + pad) { p.y = -pad; p.x = Math.random() * W; }
            if (p.y < -pad) { p.y = H + pad; p.x = Math.random() * W; }
            if (p.x > W + pad) p.x = -pad;
            if (p.x < -pad) p.x = W + pad;
        };
        switch (this.kind) {
            case "petals":
                this.parts.forEach((p) => {
                    p.y += p.vy * dt;
                    p.x += (p.vx + Math.sin(t * 0.9 + p.ph) * 14) * dt;
                    p.rot += p.vr * dt;
                    wrap(p);
                    c.save();
                    c.translate(p.x, p.y);
                    c.rotate(p.rot);
                    c.scale(1, 0.55 + 0.45 * Math.sin(t * 1.6 + p.ph));
                    c.globalAlpha = 0.5;
                    c.fillStyle = p.ph > 3 ? c1 : c3;
                    c.beginPath();
                    c.ellipse(0, 0, p.r, p.r * 0.62, 0, 0, Math.PI * 2);
                    c.fill();
                    c.restore();
                });
                break;
            case "rain":
                c.strokeStyle = c3;
                c.lineWidth = 1;
                this.parts.forEach((p) => {
                    p.y += p.v * dt;
                    p.x += p.v * 0.16 * dt;
                    wrap(p, 30);
                    c.globalAlpha = p.a;
                    c.beginPath();
                    c.moveTo(p.x, p.y);
                    c.lineTo(p.x - p.len * 0.16, p.y - p.len);
                    c.stroke();
                });
                break;
            case "embers":
                this.parts.forEach((p) => {
                    p.y -= p.vy * dt;
                    p.x += (p.vx + Math.sin(t + p.ph) * 10) * dt;
                    wrap(p);
                    const f = 0.55 + 0.45 * Math.sin(t * 6 + p.ph * 3);
                    c.globalAlpha = 0.16 * f;
                    c.fillStyle = c1;
                    c.beginPath();
                    c.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
                    c.fill();
                    c.globalAlpha = 0.85 * f;
                    c.fillStyle = c3;
                    c.beginPath();
                    c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    c.fill();
                });
                break;
            case "stars":
                c.fillStyle = "#ffffff";
                this.parts.forEach((p) => {
                    c.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * p.sp + p.ph));
                    c.beginPath();
                    c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    c.fill();
                });
                // 偶尔一颗流星
                if (!this.shoot && Math.random() < dt * 0.12) this.shoot = { x: Math.random() * W, y: Math.random() * H * 0.4, life: 0 };
                if (this.shoot) {
                    const s = this.shoot;
                    s.life += dt;
                    const k = s.life / 0.9;
                    const hx = s.x + k * 260;
                    const hy = s.y + k * 110;
                    const g = c.createLinearGradient(hx - 120, hy - 50, hx, hy);
                    g.addColorStop(0, "rgba(255,255,255,0)");
                    g.addColorStop(1, c1);
                    c.globalAlpha = 1 - k;
                    c.strokeStyle = g;
                    c.lineWidth = 1.6;
                    c.beginPath();
                    c.moveTo(hx - 120, hy - 50);
                    c.lineTo(hx, hy);
                    c.stroke();
                    if (k >= 1) this.shoot = null;
                }
                break;
            case "fireflies":
                this.parts.forEach((p) => {
                    p.x += Math.cos(t * p.sp + p.ph) * 18 * dt;
                    p.y += Math.sin(t * p.sp * 1.3 + p.ph * 2) * 12 * dt;
                    wrap(p);
                    const blink = Math.max(0, Math.sin(t * (0.8 + p.sp) + p.ph * 5));
                    c.globalAlpha = 0.18 * blink;
                    c.fillStyle = c1;
                    c.beginPath();
                    c.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
                    c.fill();
                    c.globalAlpha = 0.9 * blink;
                    c.fillStyle = c3;
                    c.beginPath();
                    c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    c.fill();
                });
                break;
            case "bokeh":
                this.parts.forEach((p) => {
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    wrap(p, p.r);
                    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
                    const col = [c1, c2, c3][p.c];
                    g.addColorStop(0, col);
                    g.addColorStop(1, "rgba(0,0,0,0)");
                    c.globalAlpha = p.a;
                    c.fillStyle = g;
                    c.beginPath();
                    c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    c.fill();
                });
                break;
            case "bubbles":
                c.strokeStyle = c3;
                c.lineWidth = 1;
                this.parts.forEach((p) => {
                    p.y -= p.vy * dt;
                    p.x += Math.sin(t * 2 + p.ph) * 8 * dt;
                    wrap(p);
                    c.globalAlpha = 0.32;
                    c.beginPath();
                    c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    c.stroke();
                    c.globalAlpha = 0.5;
                    c.fillStyle = "#ffffff";
                    c.beginPath();
                    c.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, Math.max(0.6, p.r * 0.22), 0, Math.PI * 2);
                    c.fill();
                });
                break;
            case "haze": {
                // 一轮很低的太阳，慢慢呼吸
                const r = Math.min(W, H) * (0.34 + 0.02 * Math.sin(t * 0.4));
                const g = c.createRadialGradient(W * 0.5, H * 1.02, 0, W * 0.5, H * 1.02, r * 1.8);
                g.addColorStop(0, c2);
                g.addColorStop(0.35, c1);
                g.addColorStop(1, "rgba(0,0,0,0)");
                c.globalAlpha = 0.22;
                c.fillStyle = g;
                c.fillRect(0, 0, W, H);
                c.fillStyle = c3;
                this.parts.forEach((p) => {
                    p.x += p.vx * dt;
                    p.y += p.vy * dt;
                    wrap(p);
                    c.globalAlpha = 0.25 + 0.3 * Math.sin(t + p.ph);
                    c.beginPath();
                    c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    c.fill();
                });
                break;
            }
            default:
                break;
        }
        c.globalAlpha = 1;
    }
}

const sceneFX = new SceneFX($("scene-canvas"));

// ---------- 小提示条（Safari 声音被暂停……）----------
const toastEl = $("toast");
let toastTimer = null;

function showToast(text, ms = 2600) {
    clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastEl.classList.remove("out");
    if (ms) toastTimer = setTimeout(hideToast, ms);
}

function hideToast() {
    clearTimeout(toastTimer);
    toastEl.classList.add("out");
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 300);
}

// ---------- 输出延迟：蓝牙耳机会让声音晚 0.1–0.3 秒 ----------
// 自动播放的（试听、演示、过关回放）让画面等一等，看到的和听到的才对得上；
// 手上弹的没法让声音提前，只能提示一下是耳机的缘故
const LAG_NOTICE = 0.09; // 外放、有线耳机一般 0.03–0.05 秒；超过这个多半是蓝牙
let lagNoticed = false;

// 画面该晚多少秒：画面本身从 JS 到屏幕也要一两帧（约 25ms），只补多出来的那部分
function visualLag() {
    const L = audio.latency();
    return L ? Math.max(0, L.total - 0.025) : 0;
}

function checkLatency() {
    const L = audio.latency();
    if (!L || lagNoticed || !soundOn || L.total < LAG_NOTICE) return;
    lagNoticed = true;
    toastEl.dataset.kind = "latency";
    showToast(`声音比按键慢了约 ${Math.round(L.total * 1000)} ms——多半是蓝牙耳机。换有线耳机或外放会跟手很多；试听和演示的画面已经自动对齐声音`, 7000);
}

// ============================================================
// 声音开关 / 音量（顶栏的滑杆和键盘右上角那颗金色旋钮是同一个音量）
// ============================================================
const DEFAULT_VOLUME = 0.9;
let soundOn = store.get("mss-sound") !== "off";
let volume = readStoredVolume();

function readStoredVolume() {
    const raw = parseFloat(store.get("mss-volume"));
    if (!Number.isFinite(raw)) return DEFAULT_VOLUME;
    return clamp01(raw);
}

function setSound(on) {
    soundOn = on;
    audio.setMuted(!on);
    store.set("mss-sound", on ? "on" : "off");
    // 延音的音是已经排好的，静音拦不住它们——手上按着的得当场收掉
    if (!on) releaseAllHeld();
    syncSoundUI();
}

function setVolume(v, { persist = true } = {}) {
    volume = clamp01(v);
    audio.setVolume(volume);
    if (stage) stage.setKnob(volume);
    if (persist) store.set("mss-volume", String(volume));
    syncSoundUI();
}

function syncSoundUI() {
    const btn = $("btn-sound");
    const slider = $("vol-slider");
    const silent = !soundOn || volume <= 0.001;
    btn.classList.toggle("is-muted", silent);
    btn.classList.toggle("lvl-1", !silent && volume < 0.4);
    btn.setAttribute("aria-label", soundOn ? "关闭声音" : "打开声音");
    const pct = Math.round(volume * 100);
    if (slider.value !== String(pct)) slider.value = String(pct);
    slider.style.setProperty("--vol-fill", pct + "%");
    slider.classList.toggle("is-muted", !soundOn);
}

// 调完音量试听一声，用的是当前这一屏的乐器
function currentPatch() {
    if (currentScreen === "music") return musicPatch;
    if (currentScreen === "game" || currentScreen === "reward") return levelSound(state.level).patch;
    return FREE.patch;
}

function previewVolume() {
    if (!soundOn || volume <= 0.001) return;
    audio.play(currentPatch(), 392, { velocity: 0.8 });
}

// ============================================================
// 按住发声：键盘和指针可能同时按住同一个键，所以每个键记一份持有者集合，
// 最后一个松开才收尾——不会重复起音、也不会提前掐断。
// ============================================================
const players = [];

// 延音踏板：踩住时松手不落制音器，音按自己的长尾响完。
//   物理空格 = 按住才生效（和真踏板一致）
//   Enter / 点 3D 键盘上的空格键 = 锁住（触屏没法一边按住踏板一边点音符）
let pedalDown = false;
let physicalPedal = false;
let latchedPedal = false;

function applyPedal() {
    setPedal(physicalPedal || latchedPedal);
}

function setPedal(on) {
    if (on !== pedalDown) {
        pedalDown = on;
        if (!on) players.forEach((p) => p.liftPedal());
        document.body.classList.toggle("pedal-down", on);
    }
    syncModifierUI();
}

function makeHoldPlayer({ start, onHold, onRing }) {
    const voices = {};
    // 踏板踩着时手已经松开、但制音器没落下、还在自己响的那些音
    const pedaled = {};

    function damp(key) {
        const v = pedaled[key];
        if (!v) return;
        delete pedaled[key];
        if (v.voice) v.voice.release();
        if (onRing) onRing(key, false);
    }

    function down(key, holder) {
        const v = voices[key];
        if (v) {
            v.holders.add(holder);
            return;
        }
        // 这个键还挂在踏板上响着 → 重新击弦。旧的先收掉，不然同一个音会一层层叠上去
        if (pedaled[key]) damp(key);
        voices[key] = { voice: start(key), holders: new Set([holder]) };
        if (onHold) onHold(key, true);
    }

    function up(key, holder) {
        const v = voices[key];
        if (!v || !v.holders.has(holder)) return;
        v.holders.delete(holder);
        if (v.holders.size) return;
        delete voices[key];
        if (onHold) onHold(key, false);
        if (pedalDown) {
            pedaled[key] = v;
            if (onRing) onRing(key, true);
            return;
        }
        if (v.voice) v.voice.release();
    }

    function liftPedal() {
        Object.keys(pedaled).forEach(damp);
    }

    // 某一个持有者（比如整块物理键盘）一次性全松开
    function releaseHolder(holder) {
        Object.keys(voices).forEach((key) => up(key, holder));
    }

    function releaseAll() {
        Object.keys(voices).forEach((key) => {
            const v = voices[key];
            delete voices[key];
            if (v.voice) v.voice.release();
            if (onHold) onHold(key, false);
        });
        liftPedal();
    }

    const player = { down, up, liftPedal, releaseHolder, releaseAll };
    players.push(player);
    return player;
}

// 切窗口、切标签页时手上的键会丢 keyup，统一收掉，免得留一个音一直响。
// 屏幕上锁住的踏板/升降号不动——那是用户明确点亮的模式，回来还该在，像 CapsLock。
function releaseAllHeld() {
    physicalPedal = false;
    applyPedal();
    players.forEach((p) => p.releaseAll());
    [...audio.voices].filter((v) => v.hold).forEach((v) => v.release());
    if (stage) stage.releasePointers();
    releaseMirrors();
}

// ============================================================
// 庆祝动画：一张铺满屏幕的 2D 画布上的粒子
//   纸片(paper) / 飘带(ribbon) / 火花(spark)——普通地叠上去
//   星芒(star) / 星尘(dust) / 光斑(orb) / 烟花弹(rocket)——"发光"地叠上去（lighter），梦境里全靠它们
// 颜色取当前这套键帽的渐变
// ============================================================
const confettiCanvas = $("confetti-canvas");
const cctx = confettiCanvas.getContext("2d");
const bloomEl = $("screen-bloom");

let particles = [];
let pendingSpawns = []; // 烟花弹炸开时生出来的，等这一帧画完再加进去
let rafId = null;
let lastFrame = 0;
let confettiDpr = 1;

function sizeConfettiCanvas() {
    confettiDpr = Math.min(window.devicePixelRatio || 1, 2);
    confettiCanvas.width = Math.floor(window.innerWidth * confettiDpr);
    confettiCanvas.height = Math.floor(window.innerHeight * confettiDpr);
    cctx.setTransform(confettiDpr, 0, 0, confettiDpr, 0, 0);
}

function themePalette() {
    const c = colorway;
    return [c.glow, c.accent, c.highlight, c.alpha, c.alphaLegend];
}

// 这一关渐变上均匀取 n 种颜色（CSS 十六进制）
function gradPalette(n = 5) {
    return Array.from({ length: n }, (_, i) => stage.gradientColor(n > 1 ? i / (n - 1) : 0));
}

const MAX_PARTICLES = 1100;

// gravity：每帧往下加的速度（负数 = 往上飘）；drag：每帧剩下的速度比例；life：[基础, 随机多出来的]
const PARTICLE_SPEC = {
    paper: { gravity: 0.30, drag: 0.988, life: [2.4, 1.6] },
    ribbon: { gravity: 0.15, drag: 0.972, life: [3.0, 1.8] },
    spark: { gravity: 0.02, drag: 0.930, life: [0.45, 0.35] },
    star: { gravity: -0.012, drag: 0.952, life: [1.2, 1.3], light: true },
    dust: { gravity: -0.008, drag: 0.94, life: [0.5, 0.7], light: true },
    orb: { gravity: -0.035, drag: 0.985, life: [1.6, 1.6], light: true },
    rocket: { gravity: 0.1, drag: 0.985, life: [0.9, 0.25], light: true },
};

// 星芒和光斑的小图：每种颜色画一次，之后直接贴
const spriteCache = new Map();
function sprite(kind, color) {
    const key = kind + color;
    let s = spriteCache.get(key);
    if (!s) {
        s = kind === "orb" ? orbSprite(color) : sparkleSprite(color);
        spriteCache.set(key, s);
    }
    return s;
}

function spawn(x, y, count, opts) {
    const {
        angle = -Math.PI / 2,
        spread = Math.PI / 3,
        speed = 12,
        kind = "paper",
        colors = themePalette(),
        size = 1,
        onDeath = null,
    } = opts || {};
    const spec = PARTICLE_SPEC[kind];
    for (let i = 0; i < count; i++) {
        const a = angle + (Math.random() - 0.5) * spread;
        const sp = speed * (0.55 + Math.random() * 0.8);
        const isRibbon = kind === "ribbon";
        particles.push({
            kind,
            spec,
            color: colors[Math.floor(Math.random() * colors.length)],
            x, y,
            px: x, py: y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            rot: Math.random() * Math.PI * 2,
            vrot: (Math.random() - 0.5) * (kind === "star" ? 0.08 : 0.4),
            flip: Math.random() * Math.PI * 2,      // 纸片翻面
            vflip: 0.10 + Math.random() * 0.18,
            wob: Math.random() * Math.PI * 2,       // 飘落时的左右摆动；星星拿它当闪烁的相位
            w: isRibbon ? 3 + Math.random() * 2 : 5 + Math.random() * 7,
            h: isRibbon ? 22 + Math.random() * 20 : 4 + Math.random() * 6,
            r: (1.5 + Math.random() * 2.5) * size,   // spark / star / dust / orb 的大小
            age: 0,
            life: spec.life[0] + Math.random() * spec.life[1],
            onDeath,
        });
    }
    // 连续快速通关时别让粒子无限堆积，超出上限就丢掉最老的
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    startLoop();
}

function startLoop() {
    if (rafId !== null) return;
    lastFrame = performance.now();
    rafId = requestAnimationFrame(stepParticles);
}

function stepParticles(now) {
    // 换算成"60fps 的帧数"，让手感与刷新率无关；标签页切回时不要爆冲
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    const f = dt * 60;
    const H = window.innerHeight;

    cctx.clearRect(0, 0, window.innerWidth, H);
    let lighter = false;

    particles = particles.filter((p) => {
        p.age += dt;
        if (p.age >= p.life || p.y > H + 80) {
            if (p.onDeath) pendingSpawns.push(() => p.onDeath(p.x, p.y, p.color));
            return false;
        }

        const dragF = Math.pow(p.spec.drag, f);
        p.px = p.x;
        p.py = p.y;
        p.vx *= dragF;
        p.vy = p.vy * dragF + p.spec.gravity * f;
        p.wob += 0.12 * f;
        const sway = p.kind === "ribbon" ? 1.1 : p.kind === "paper" ? 0.45 : p.kind === "orb" ? 0.25 : 0;
        p.x += (p.vx + Math.sin(p.wob) * sway) * f;
        p.y += p.vy * f;
        p.rot += p.vrot * f;
        p.flip += p.vflip * f;

        const fade = Math.max(0, Math.min(1, (p.life - p.age) / 0.6));
        if (!!p.spec.light !== lighter) {
            lighter = !!p.spec.light;
            cctx.globalCompositeOperation = lighter ? "lighter" : "source-over";
        }
        cctx.globalAlpha = fade;
        cctx.fillStyle = p.color;

        if (p.kind === "spark") {
            cctx.beginPath();
            cctx.arc(p.x, p.y, p.r * (0.4 + fade * 0.6), 0, Math.PI * 2);
            cctx.fill();
        } else if (p.kind === "star") {
            // 十字星芒：一闪一闪，慢慢转
            const tw = 0.55 + 0.45 * Math.sin(p.age * 13 + p.wob * 4);
            const s = p.r * 7 * (0.7 + 0.3 * tw) * (0.5 + 0.5 * fade);
            cctx.globalAlpha = fade * tw;
            cctx.save();
            cctx.translate(p.x, p.y);
            cctx.rotate(p.rot);
            cctx.drawImage(sprite("star", p.color), -s / 2, -s / 2, s, s);
            cctx.restore();
        } else if (p.kind === "dust" || p.kind === "rocket") {
            // 一小段拖影：从上一帧的位置划到这一帧
            const tail = p.kind === "rocket" ? 5 : 2.2;
            cctx.strokeStyle = p.color;
            cctx.lineCap = "round";
            cctx.lineWidth = p.kind === "rocket" ? 2.4 : p.r * 0.7;
            cctx.beginPath();
            cctx.moveTo(p.x - (p.x - p.px) * tail, p.y - (p.y - p.py) * tail);
            cctx.lineTo(p.x, p.y);
            cctx.stroke();
            if (p.kind === "rocket") {
                cctx.fillStyle = "#ffffff";
                cctx.beginPath();
                cctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
                cctx.fill();
            }
        } else if (p.kind === "orb") {
            const s = p.r * 7;
            cctx.globalAlpha = fade * 0.2 * Math.min(1, p.age / 0.3);
            cctx.drawImage(sprite("orb", p.color), p.x - s / 2, p.y - s / 2, s, s);
        } else {
            cctx.save();
            cctx.translate(p.x, p.y);
            cctx.rotate(p.rot);
            // cos(flip) 让纸片周期性变窄，模拟在空中翻面
            cctx.scale(1, Math.cos(p.flip));
            if (p.kind === "ribbon") {
                cctx.beginPath();
                cctx.moveTo(-p.w / 2, -p.h / 2);
                cctx.quadraticCurveTo(p.w * 2.2, 0, -p.w / 2, p.h / 2);
                cctx.quadraticCurveTo(p.w * 0.6, 0, -p.w / 2, -p.h / 2);
                cctx.fill();
            } else {
                cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            }
            cctx.restore();
        }
        return true;
    });

    cctx.globalAlpha = 1;
    cctx.globalCompositeOperation = "source-over";
    if (pendingSpawns.length) {
        const list = pendingSpawns;
        pendingSpawns = [];
        list.forEach((fn) => fn());
    }

    if (particles.length) {
        rafId = requestAnimationFrame(stepParticles);
    } else {
        cctx.clearRect(0, 0, window.innerWidth, H);
        rafId = null;
    }
}

// 一团星光：星芒 + 星尘 + 几个光斑，从 (x, y) 往四周散开，慢慢往上飘着熄掉
function starBurst(x, y, { colors = gradPalette(), stars = 18, dust = 14, orbs = 2, speed = 5 } = {}) {
    if (reduceMotion) return;
    spawn(x, y, stars, { kind: "star", angle: -Math.PI / 2, spread: Math.PI * 2, speed, colors });
    spawn(x, y, dust, { kind: "dust", angle: -Math.PI / 2, spread: Math.PI * 2, speed: speed * 1.3, colors: [...colors, "#ffffff"] });
    if (orbs) spawn(x, y, orbs, { kind: "orb", angle: -Math.PI / 2, spread: Math.PI * 1.2, speed: speed * 0.4, colors, size: 1.4 });
}

// 飞行中的字母身后拖着的星尘
function starTrail(x, y, color) {
    spawn(x, y, 2, { kind: "dust", angle: -Math.PI / 2, spread: Math.PI * 2, speed: 1.1, colors: [color, "#ffffff"], size: 0.8 });
    if (Math.random() < 0.35) spawn(x, y, 1, { kind: "star", angle: -Math.PI / 2, spread: Math.PI * 2, speed: 0.8, colors: [color], size: 0.8 });
}

// 一枚烟花：从屏幕底下升上去，到顶炸成一团星光
function firework(x, colors) {
    const H = window.innerHeight;
    spawn(x, H + 6, 1, {
        kind: "rocket", angle: -Math.PI / 2, spread: 0.18, speed: 15 + Math.random() * 4, colors,
        onDeath: (bx, by, c) => starBurst(bx, by, { colors: [c, ...colors], stars: 22, dust: 26, orbs: 2, speed: 5.5 }),
    });
}

// 通关：屏幕中间一片光晕，键盘中心炸开一团星光，底下升起几枚烟花（颜色都是这一关的渐变）
function launchCelebration(colors, { rockets = 3 } = {}) {
    bloomEl.classList.remove("fire");
    void bloomEl.offsetWidth;
    bloomEl.classList.add("fire");
    if (reduceMotion) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const palette = colors || gradPalette();

    const g = stage.canvas.getBoundingClientRect();
    const cx = g.width ? g.left + g.width / 2 : W / 2;
    const cy = g.height ? g.top + g.height / 2 : H / 2;
    starBurst(cx, cy, { colors: palette, stars: 34, dust: 30, orbs: 3, speed: 7 });
    for (let i = 0; i < rockets; i++) {
        const x = W * (0.18 + (0.64 * (i + 0.5)) / rockets) + (Math.random() - 0.5) * W * 0.08;
        setTimeout(() => firework(x, palette), 120 + i * 260 + Math.random() * 120);
    }
}

// ============================================================
// 屏幕切换：同一块键盘在各屏之间搬家，镜头从旧机位飞到新机位
// ============================================================
const screens = {
    home: $("screen-home"),
    game: $("screen-game"),
    reward: $("screen-reward"),
    final: $("screen-final"),
    music: $("screen-music"),
};
let currentScreen = "home";
let shownScreen = "home";
let homeScrollY = 0;
let resumeScreen = null; // 关卡进行到一半回了首页，再开局时回到哪一屏

// 换屏用浏览器的视图过渡（View Transitions）做一次柔和的交叉淡入；不支持的浏览器直接切。
// "现在在哪一屏"立刻就变，只有画面的替换等浏览器截完旧画面再做——
// 不然紧跟着的按键、提示、跳关会以为还在上一屏
function showScreen(name) {
    const prev = currentScreen;
    const canFade = document.startViewTransition && !reduceMotion && !document.hidden && name !== prev;
    if (prev === "home" && name !== "home") homeScrollY = window.scrollY;
    currentScreen = name;
    if (canFade) {
        try {
            const vt = document.startViewTransition(() => swapScreen(prev, name));
            // 连着换屏时前一次过渡会被跳过，ready 会 reject（AbortError）：这是预期的，别让它变成控制台里的未处理错误
            vt.ready.catch(() => {});
            return;
        } catch (err) { /* 退回直接切 */ }
    }
    swapScreen(prev, name);
}

function showScreenNow(name) {
    const prev = currentScreen;
    currentScreen = name;
    swapScreen(prev, name);
}

function swapScreen(prev, name) {
    // 连着换了两次屏，前一次的替换晚到了：以最新的为准
    if (name !== currentScreen) return;
    // 真正显示着的那一屏（可能和 prev 不同：中间那一屏还没来得及换上就又换走了）
    const was = shownScreen;
    shownScreen = name;
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    // 重挂 class 以重新触发入场动画
    const shown = screens[name];
    shown.classList.remove("screen-enter");
    void shown.offsetWidth;
    shown.classList.add("screen-enter");

    document.body.classList.toggle("on-music", name === "music");
    document.body.classList.toggle("on-home", name === "home");
    if (name !== "home") {
        document.body.classList.remove("past-hero");
        window.scrollTo(0, 0);
    }
    if (was !== name) leaveScreen(was);
    enterScreen(name);
    // 过渡动画截新画面之前先把键盘画出来，不然截到的是一块空画布
    stage.renderNow();
}

function leaveScreen(name) {
    if (name === "home") {
        stopDemo();
        freePlayer.releaseAll();
    } else if (name === "music") {
        stopPlayback();
        setFollow(false);
        if (abyssOn) teardownAbyss();
        musicPlayer.releaseAll();
        physicalAlter = 0;
        applyAlter();
    } else if (name === "game" || name === "reward") {
        resumeScreen = name;
    } else if (name === "final") {
        resumeScreen = null;
        stage.setTowerFlow(false);
    }
    if (name === "reward") {
        clearRewardTimers();
        stopLetterGame();
        $("fly-layer").innerHTML = "";
    }
}

function enterScreen(name) {
    // 醒来：离开过关页就退出梦境（回放还在关卡页上跑的那一下除外）
    if (name !== "reward" && !(name === "game" && replaying)) leaveDream();
    stage.releasePointers();
    stage.attach($("stage-" + name), { touch: name === "home" ? "pan-y" : "none" });
    stage.setActive(true);
    stage.setOrbit(false);
    stage.setTargetKey(null);
    stage.setTowerVisible(name === "final");
    stage.path.growRate = 7;
    stage.path.setFlow(null);
    // 过关仪式里的浮起、流光、亮点，换屏时全部归位
    stage.path.setComet(null);
    stage.path.setShift(0);
    stage.path.setLift(0);
    stage.path.lift = 0;
    if (name === "home") setupHome();
    else if (name === "game") setupGame();
    else if (name === "reward") setupReward();
    else if (name === "final") setupFinal();
    else if (name === "music") setupMusic();
}

// ============================================================
// 物理键盘 → 3D 键盘：按下哪个键，屏幕上那颗键帽就跟着沉下去
// ============================================================
const CODE_TO_ID = {
    Escape: "esc", Delete: "del", Backquote: "`", Minus: "-", Equal: "=", Backspace: "backspace", Home: "home",
    Tab: "tab", BracketLeft: "[", BracketRight: "]", Backslash: "\\", PageUp: "pgup",
    CapsLock: "caps", Semicolon: ";", Quote: "'", Enter: "enter", NumpadEnter: "enter", PageDown: "pgdn",
    ShiftLeft: "shift-l", Comma: ",", Period: ".", Slash: "/", ShiftRight: "shift-r", ArrowUp: "up", End: "end",
    ControlLeft: "ctrl-l", AltLeft: "opt-l", MetaLeft: "cmd-l", Space: "space", MetaRight: "cmd-r",
    AltRight: "cmd-r", ControlRight: "ctrl-r", ArrowLeft: "left", ArrowDown: "down", ArrowRight: "right",
};
for (let i = 1; i <= 12; i++) CODE_TO_ID["F" + i] = "f" + i;
for (let i = 0; i <= 9; i++) CODE_TO_ID["Digit" + i] = String(i);
"abcdefghijklmnopqrstuvwxyz".split("").forEach((c) => { CODE_TO_ID["Key" + c.toUpperCase()] = c; });

// 棋盘上的键。字母优先认 e.key：非 QWERTY 布局（Dvorak 等）照键帽上印的字母走；
// 按住 Option 时 e.key 会变成 å 之类，按下和松开对不上，这时退回 e.code 认物理键位。
// 数字和标点一律认物理位置——按住 Shift 时 e.key 会变成 ! : < 之类。
function noteIdOf(e) {
    if (/^[a-zA-Z]$/.test(e.key)) return e.key.toLowerCase();
    const id = CODE_TO_ID[e.code];
    return id && CELL[id] ? id : null;
}

// 焦点在输入框里时，字母是在打字不是在弹琴。
// 谱面记法里就有 b（降号），不挡住的话打一个 b7 会直接弹响 B 键。
function isTyping(e) {
    const el = e.target;
    if (!el || !el.tagName) return false;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true;
}

// 键盘当乐器用的两个地方：音乐模式，和首页还没开局时
const instrumentActive = () => currentScreen === "music" || (currentScreen === "home" && !homeStarted);

const physHeld = new Map(); // e.code → 3D 键 id

function mirrorDown(code, id) {
    // 当乐器用时琴键的沉浮由发声那边管（按住多久沉多久），这里只管其余的键
    if (CELL[id] && instrumentActive()) return;
    physHeld.set(code, id);
    stage.press(id, true);
}

function mirrorUp(code) {
    const id = physHeld.get(code);
    if (!id) return;
    physHeld.delete(code);
    stage.press(id, false);
}

function releaseMirrors() {
    if (stage) physHeld.forEach((id) => stage.press(id, false));
    physHeld.clear();
}

// ============================================================
// 首页：键盘钉在屏幕上当背景，文字从它前面滚过去
//   hero   键盘斜着摆，底光像呼吸一样一波一波扫过去
//   rules  键盘让到一边，三条规则直接在键帽上演示
//   play   整块摆正，可以弹
//   start  往下滑 = 把一条贯穿四十个键的线画完，画满就开局
// ============================================================
const heroCopyEl = $("hero-copy");
const scrollCueEl = $("scroll-cue");
const panelStartEl = $("panel-start");
const startBtn = $("btn-start");
const startFillEl = $("start-stroke-fill");
const startLabelEl = $("start-stroke-label");
const playTrailEl = $("play-trail");

let homeStarted = false;
let homeChapter = null;

// 贯穿整块棋盘的一笔：蛇形走完四排，正好四十个键，也正好是第 12 关的一种解法
const SIGNATURE = [
    ...GRID[0], ...GRID[1].slice().reverse(), ...GRID[2], ...GRID[3].slice().reverse(),
];
let sigShown = -1;

const DEMO_REGION = { x0: 0.6, x1: 8.4, z0: 1.8, z1: 5.4 };

function homeView(ch) {
    const narrow = window.innerWidth < 760;
    if (ch === "rules") {
        // 演示只用到左半边那些键（Q W E / A S D F / Z X C），镜头就框住它们，挪到卡片右边
        return narrow
            ? { region: REGIONS.letters, az: 0, el: 52, fov: 30, margin: 0.04, shift: 0.25 } // 窄屏：卡片在正中，键盘让到下方
            : { region: DEMO_REGION, az: 14, el: 46, fov: 30, margin: 0.4, shiftX: 0.19 };
    }
    if (ch === "play") {
        return { region: REGIONS.play, az: 0, el: 55, fov: 30, margin: 0.03, shift: narrow ? 0.1 : 0.13 };
    }
    if (ch === "start") {
        return { region: REGIONS.board, az: 0, el: 64, fov: 30, margin: 0.14, shift: -0.08 };
    }
    return { region: REGIONS.board, az: -16, el: 29, fov: 34, margin: narrow ? 0.02 : 0.12, shift: narrow ? 0.14 : 0.17 };
}

function setupHome() {
    applyColorway(screenColorway());
    stage.resetKeys();
    clearLegends();
    stage.setPath([], { grow: false });
    // 规则演示的时候键盘不接受点击，免得和演示抢
    stage.setInteractive((id) => id === "knob" || ((!!CELL[id] || id === "space") && homeChapter !== "rules"));
    homeChapter = null;
    sigShown = -1;
    if (homeScrollY) window.scrollTo(0, homeScrollY);
    onHomeScroll();
    syncModifierUI();
}

function chapterAtMiddle() {
    const mid = window.innerHeight * 0.5;
    let found = "hero";
    document.querySelectorAll("#screen-home .hpanel[data-chapter]").forEach((panel) => {
        if (panel.getBoundingClientRect().top <= mid) found = panel.dataset.chapter;
    });
    return found === "start" ? "play" : found;
}

function onHomeScroll() {
    if (currentScreen !== "home") return;
    const vh = window.innerHeight;

    // hero 随滚动淡出、微微上浮缩小
    const heroP = clamp01(window.scrollY / (vh * 0.62));
    if (!reduceMotion) {
        heroCopyEl.style.opacity = String(1 - heroP);
        heroCopyEl.style.transform = `translateY(${-heroP * 34}px) scale(${1 - heroP * 0.055})`;
    }
    scrollCueEl.style.opacity = String(clamp01(1 - heroP * 2.4));
    document.body.classList.toggle("past-hero", heroP > 0.75);

    // 最后一屏：从它露头到页面滚到底 = 这一笔从 0 画到满。
    // 按"离滚到底还差多少"算，不按面板顶到没到视口顶——手机上地址栏收起后视口比 100svh 高，
    // 面板顶永远到不了视口顶，按后者算这一笔会差一截永远画不满
    const startTop = panelStartEl.getBoundingClientRect().top + window.scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    const from = Math.min(startTop - vh, maxScroll - 1);
    const p = clamp01((window.scrollY - from) / Math.max(1, maxScroll - from));

    const ch = p > 0.02 ? "start" : chapterAtMiddle();
    if (ch !== homeChapter) setHomeChapter(ch);
    if (ch === "rules") pickRuleDemo();
    if (ch === "start") drawSignature(p);
    blendHomeCamera(p);

    startFillEl.style.height = p * 100 + "%";
    startBtn.classList.toggle("is-drawing", p > 0.02 && p < 0.995);
    startBtn.classList.toggle("is-full", p >= 0.995);
    startLabelEl.textContent = p >= 0.995 ? "开始" : "继续下滑，画完这一笔";
    if (p >= 0.995) beginGame();
}

// 镜头跟着滚动连续地转：两个章节之间按滚动位置混合两个机位，而不是到了章节才一跳
const smooth = (t) => t * t * (3 - 2 * t);

function blendHomeCamera(p) {
    if (p > 0.02) {
        stage.setViewBlend(homeView("play"), homeView("start"), smooth(Math.min(1, p * 1.4)));
        return;
    }
    const vh = window.innerHeight;
    const y = window.scrollY + vh * 0.5;
    const top = (sel) => document.querySelector(sel).getBoundingClientRect().top + window.scrollY;
    const bottom = (sel) => document.querySelector(sel).getBoundingClientRect().bottom + window.scrollY;
    const anchors = [
        ["hero", vh * 0.5],
        ["rules", top(".hpanel-rules") + vh * 0.25],
        ["rules", bottom(".hpanel-rules") - vh * 0.45],
        ["play", top(".hpanel-play") + vh * 0.3],
    ];
    let a = anchors[0];
    let b = anchors[0];
    for (let i = 0; i < anchors.length - 1; i++) {
        if (y >= anchors[i][1]) {
            a = anchors[i];
            b = anchors[i + 1];
        }
    }
    if (y >= anchors[anchors.length - 1][1]) a = b = anchors[anchors.length - 1];
    const t = b[1] > a[1] ? clamp01((y - a[1]) / (b[1] - a[1])) : 0;
    stage.setViewBlend(homeView(a[0]), homeView(b[0]), smooth(t));
}

function setHomeChapter(ch) {
    homeChapter = ch;
    stopDemo();
    stage.resetKeys();
    clearLegends();
    stage.setPath([], { grow: false });
    sigShown = -1;
    // 能弹的那一屏：四排琴键都透一点底光
    if (ch === "play") GRID_IDS.forEach((id) => stage.setKey(id, { glow: 0.16 }));
    syncModifierUI();
}

// hero：一道光从左往右扫过整块键盘，像 RGB 键盘的呼吸灯
function ambientTick(dt, t) {
    if (currentScreen !== "home" || homeChapter !== "hero" || reduceMotion) return;
    stage.keys.forEach((k, id) => {
        const { x, z } = k.group.position;
        const w = Math.sin(t * 1.25 - x * 0.45 + z * 0.3);
        stage.setKey(id, { glow: Math.pow(Math.max(0, w), 6) * 0.7 });
    });
}

function drawSignature(p) {
    const n = Math.round(p * SIGNATURE.length);
    if (n === sigShown) return;
    sigShown = n;
    stage.setPath(SIGNATURE.slice(0, n), { grow: !reduceMotion, span: SIGNATURE.length });
    SIGNATURE.forEach((id, i) => {
        const on = i < n;
        stage.setKey(id, { glow: on ? 0.75 : 0.08, lift: i === n - 1 ? 0.08 : 0, legendGlow: on ? 0.3 : 0 });
    });
}

// ---------- 规则演示：直接在键帽上走给你看 ----------
let demoTimers = [];
let demoRule = null;

function stopDemo() {
    demoTimers.forEach(clearTimeout);
    demoTimers = [];
    demoRule = null;
}

function later(ms, fn) {
    demoTimers.push(setTimeout(fn, ms));
}

// 哪条规则最靠近屏幕中间，就演示哪一条
function pickRuleDemo() {
    const mid = window.innerHeight * 0.5;
    let best = null;
    let bestD = Infinity;
    document.querySelectorAll("#screen-home .rule[data-demo]").forEach((li) => {
        const r = li.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestD) { bestD = d; best = li.dataset.demo; }
    });
    if (best && best !== demoRule) runDemo(best);
}

const DEMO_KEYS = {
    adjacent: ["q", "w", "a", "s"],
    once: ["a", "s", "d", "f", "g"],
    complete: ["q", "w", "e", "d", "s", "a", "z", "x", "c"],
};

function runDemo(kind) {
    stopDemo();
    demoRule = kind;
    const focus = DEMO_KEYS[kind];
    const base = () => {
        stage.resetKeys({ dim: 1 });
        clearLegends();
        stage.setPath([], { grow: false });
        focus.forEach((id) => stage.setKey(id, { dim: 0, glow: 0.2 }));
    };
    const badge = (ids) => ids.forEach((id, i) => legend(id, { badge: i + 1, badgeBg: colorway.glow, badgeColor: colorway.bg }));
    const fail = (id) => { stage.shake(id); stage.flare(id, ERROR_COLOR); };
    base();

    if (kind === "adjacent") {
        // Q 的邻居是 W 和 A；斜对角的 S 不算
        stage.setKey("q", { lift: 0.08, glow: 1, pulse: 0.7 });
        stage.setKey("w", { glow: 0.5 });
        stage.setKey("a", { glow: 0.5 });
        legend("s", { mark: "✕", markColor: ERROR_COLOR });
        if (reduceMotion) {
            stage.setPath(["q", "w"], { grow: false });
            return;
        }
        const loop = () => {
            stage.setPath(["q"], { grow: false });
            later(400, () => { stage.setPath(["q", "w"]); stage.pop("w"); stage.flare("w"); });
            later(1400, () => stage.setPath(["q"], { grow: false }));
            later(1700, () => { stage.setPath(["q", "a"]); stage.pop("a"); stage.flare("a"); });
            later(2700, () => { stage.setPath(["q"], { grow: false }); fail("s"); });
            later(3700, loop);
        };
        loop();
        return;
    }

    if (kind === "once") {
        // 走过的键沉下去、标上顺序；想回头再踩 D 会被弹回来
        const seq = ["a", "s", "d", "f"];
        const show = (n) => {
            const walked = seq.slice(0, n);
            stage.setPath(walked);
            walked.forEach((id, i) => stage.setKey(id, i === n - 1
                ? { lift: 0.08, glow: 1.1, pulse: 0.5, dim: 0 }
                : { lift: -0.05, glow: 0.6, pulse: 0, dim: 0.15 }));
            badge(walked);
        };
        if (reduceMotion) {
            show(seq.length);
            legend("d", { badge: 3, badgeBg: colorway.glow, badgeColor: colorway.bg, mark: "✕", markColor: ERROR_COLOR });
            return;
        }
        const loop = () => {
            base();
            seq.forEach((id, i) => later(350 + i * 450, () => { show(i + 1); stage.pop(id); stage.flare(id); }));
            later(350 + seq.length * 450 + 350, () => fail("d"));
            later(350 + seq.length * 450 + 1700, loop);
        };
        loop();
        return;
    }

    // complete：九个键一口气走完，最后整条线亮一下
    const seq = DEMO_KEYS.complete;
    if (reduceMotion) {
        stage.setPath(seq, { grow: false });
        badge(seq);
        seq.forEach((id) => stage.setKey(id, { glow: 0.8 }));
        return;
    }
    const loop = () => {
        base();
        seq.forEach((id, i) => later(300 + i * 300, () => {
            const walked = seq.slice(0, i + 1);
            stage.setPath(walked);
            walked.forEach((w, j) => stage.setKey(w, j === i ? { lift: 0.08, glow: 1.1 } : { lift: -0.04, glow: 0.65 }));
            badge(walked);
            stage.pop(id);
        }));
        later(300 + seq.length * 300 + 150, () => {
            stage.pulsePath();
            seq.forEach((id, i) => later(i * 40, () => { stage.flare(id); stage.setKey(id, { glow: 1, lift: 0 }); }));
        });
        later(300 + seq.length * 300 + 2300, loop);
    };
    loop();
}

// ---------- 首页自由弹奏：星火的音色 + C 宫五声，怎么敲都好听 ----------
// 往右一格高一级，往上一排高一个八度——游戏只能走上下左右，任何一条合法路径天然就是一条旋律
const FREE = { patch: "ember", root: 130.81, scale: [0, 2, 4, 7, 9] };

function freeFreq(id) {
    const c = CELL[id];
    const s = FREE.scale;
    const idx = (GRID.length - 1 - c.row) * s.length + c.col;
    const semitone = s[idx % s.length] + 12 * Math.floor(idx / s.length);
    return FREE.root * Math.pow(2, semitone / 12);
}

let trailKeys = [];
let trailFadeTimer = null;

function pushTrail(id) {
    trailKeys.push(label(id));
    if (trailKeys.length > 14) trailKeys.shift();
    playTrailEl.textContent = trailKeys.join("");
    playTrailEl.classList.add("on");
    clearTimeout(trailFadeTimer);
    // 停手一会儿就淡掉，下次重新起一串
    trailFadeTimer = setTimeout(() => {
        playTrailEl.classList.remove("on");
        trailKeys = [];
    }, 2600);
}

const freePlayer = makeHoldPlayer({
    start: (id) => audio.play(FREE.patch, freeFreq(id), { hold: true, pan: panOf(id) }),
    onHold: (id, on) => {
        stage.press(id, on);
        if (on) {
            stage.flare(id);
            stage.ripple(id, { strength: 0.55, speed: 8, life: 1 });
            pushTrail(id);
        }
    },
    // 手松了但踏板挂着、还在响：键帽自己透着光
    onRing: (id, on) => stage.setKey(id, { emissive: on ? 0.9 : 0 }),
});

function beginGame() {
    if (homeStarted) return;
    homeStarted = true;
    if (resumeScreen && !state.finished) showScreen(resumeScreen);
    else startLevel(1);
}

function goHome() {
    closePanels();
    if (currentScreen === "home") {
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        return;
    }
    stopPlayback();
    setFollow(false);
    releaseAllHeld();
    homeStarted = false;
    homeScrollY = 0;
    showScreen("home");
}

// ============================================================
// 关卡
// ============================================================
const state = {
    level: 1,
    keys: [],
    levelKeySet: new Set(),
    endKey: null,           // 本关必须收尾的键，null 表示不限制
    startKey: null,         // 本关必须从哪个键出发（第 13、14 关），null 表示随意
    order: [],              // 必须按顺序经过的键（第 14 关的 W O R L D）
    path: [],
    locked: false,
    pendingLetters: "",     // 开局就选好、已经发给 AI 的那几个字母
    pendingSentence: null,  // 开局发起的预生成请求，通关时直接取结果
    runs: new Map(),        // 第几关 → { path, letters, sentence }：终局的塔和句子都从这里取
    finished: false,
};

const feedbackEl = $("feedback-msg");
let feedbackTimer = null;

function feedback(text, isError = false, ms = 0) {
    clearTimeout(feedbackTimer);
    feedbackEl.textContent = text;
    feedbackEl.classList.toggle("is-error", !!isError && !!text);
    if (ms) {
        feedbackTimer = setTimeout(() => {
            if (feedbackEl.textContent === text) feedback("");
        }, ms);
    }
}

// 从本关的字母里随机挑 5 个（保持原有先后），不满 5 个就全用。数字和符号不送给 AI
function pickLetters(keys) {
    const letters = keys.filter(isLetter);
    if (letters.length <= 5) return letters.join("");
    const indices = shuffled(letters.map((_, i) => i)).slice(0, 5).sort((a, b) => a - b);
    return indices.map((i) => letters[i]).join("");
}

// 开局就把字母发给 AI 预生成。玩家还在走线的这段时间正好用来等模型，
// 通关时结果通常已经在手上了。本关的字母集合开局就定死了，变的只是顺序，而顺序对造句没有影响。
function startPrefetch(keys) {
    const picked = pickLetters(keys);
    state.pendingLetters = picked;
    state.pendingSentence = generateAISentence(picked).catch((err) => {
        // 这里必须吞掉异常：玩家中途退出时没人 await，否则会留下未处理的 rejection
        console.warn("⚠️ [前端] 预生成失败，通关时会重试:", err.message);
        return null;
    });
}

function startLevel(n) {
    stopWordFlash();
    homeStarted = true;
    if (n === 1) {
        // 从第一关开始就是新的一局，上一局的塔拆掉
        state.runs.clear();
        state.finished = false;
        stage.clearTower();
    }
    state.level = n;
    state.path = [];
    state.locked = false;
    const keys = generateLevelKeys(n);
    const cw = levelColorway(n);
    const inst = INSTRUMENTS[levelSound(n).patch];
    $("hud-num").textContent = pad2(n);
    $("hud-total").textContent = pad2(TOTAL_LEVELS);
    $("hud-theme-name").textContent = `${cw.name} · ${inst.name}`;
    $("hud-theme-en").textContent = cw.en;
    if (!keys) {
        state.keys = [];
        state.levelKeySet = new Set();
        state.endKey = null;
        showScreen("game");
        feedback("关卡生成失败了，请刷新页面重试。", true);
        return;
    }
    state.keys = keys;
    state.levelKeySet = new Set(keys);
    const design = LEVELS[n - 1].design;
    state.startKey = design ? design.start || null : null;
    state.order = design && design.order ? design.order.split("") : [];
    state.endKey = design ? design.end || null : n >= END_TARGET_FROM_LEVEL ? pickEndKey(keys) : null;
    // 一条已知能走通的路：随机走法本身就是一条解，除非终点被换成了别的键，那就现算一条
    state.solution = design || !state.endKey || state.endKey === keys[keys.length - 1]
        ? keys.slice()
        : solveFrom([], { budget: 3000000 }) || null;
    state.afterSkip = false;
    hintUndo = null;
    skipArmedAt = 0;
    resetSkipBtn();
    startPrefetch(keys);
    feedback("");
    showScreen("game");
}

function setupGame() {
    applyColorway(screenColorway());
    stage.resetKeys({ dim: 1 });
    clearLegends();
    stage.setPath([], { grow: false });
    // 走过的线上有光点顺着流，线是活的
    if (!reduceMotion) stage.path.setFlow({ count: 2, speed: 3.6 });
    stage.setView(gameView());
    stage.setInteractive((id) => id === "knob" || id === "backspace" || state.levelKeySet.has(id));
    stage.setKey("backspace", { dim: 0.25 }); // ⌫ 也能点：撤销一步
    renderGameKeys(false);
    // 跳关代走的时候人切走了：回来接着进下一关
    if (state.afterSkip) {
        state.afterSkip = false;
        setTimeout(goToNextLevel, 300);
    }
}

// 宽屏看整块键盘（和首页那块是同一个物件）；手机上只框住这一关用得到的那几排，键才点得中
function gameView() {
    if (window.innerWidth < 760) {
        const wide = LEVELS[state.level - 1].pool !== "letters";
        return { region: wide ? REGIONS.numbers : REGIONS.letters, az: 0, el: 57, fov: 30, margin: 0.03 };
    }
    return { region: REGIONS.board, az: 0, el: 52, fov: 30, margin: 0.13, shift: 0.02 };
}

// 亮着的键 = 这一关要走完的键；走过的沉下去、标上第几步；当前那颗抬起来发亮；
// 途经点（第 14 关）用强调色、左上角标着第几站；光环指着"现在该去哪"：还没开走时是起点，之后是终点
function renderGameKeys(grow = true) {
    const cw = colorway;
    const order = new Map(state.path.map((id, i) => [id, i]));
    const current = state.path[state.path.length - 1];
    const total = state.levelKeySet.size;
    const want = nextWaypoint();
    state.levelKeySet.forEach((id) => {
        const wp = state.order.indexOf(id);
        const step = order.get(id);
        if (id === current) {
            stage.setKey(id, { dim: 0, lift: 0.1, glow: 1.25, emissive: 0.45, legendGlow: 0.35, pulse: 0.6, glowColor: stepColor(step, total) });
        } else if (order.has(id)) {
            stage.setKey(id, { dim: 0.18, lift: -0.05, glow: 0.7, emissive: 0.2, legendGlow: 0.15, pulse: 0, glowColor: stepColor(step, total) });
        } else if (wp >= 0) {
            stage.setKey(id, { dim: 0, lift: 0.06, glow: 0.6, emissive: 0.14, legendGlow: 0.25, pulse: id === want ? 0.9 : 0.12, glowColor: cw.accent });
        } else {
            const anchor = id === state.endKey || (id === state.startKey && !state.path.length);
            stage.setKey(id, { dim: 0, lift: 0.04, glow: 0.3, emissive: 0.08, legendGlow: 0, pulse: anchor ? 0.35 : 0, glowColor: null });
        }
        if (order.has(id)) legend(id, { badge: step + 1, badgeBg: stepColor(step, total), badgeColor: cw.bg });
        else if (wp >= 0) legend(id, id === state.endKey
            ? { badge: wp + 1, badgeBg: cw.accent, badgeColor: cw.accentLegend, sub: "终点" }
            : { badge: wp + 1, badgeBg: cw.accent, badgeColor: cw.accentLegend });
        else if (id === state.startKey && !state.path.length) legend(id, { sub: "起点" });
        else if (id === state.endKey) legend(id, { sub: "终点" });
        else legend(id, {});
    });
    const ring = !state.path.length && state.startKey ? state.startKey : state.endKey && !order.has(state.endKey) ? state.endKey : null;
    stage.setTargetKey(ring);
    stage.setPath(state.path, { grow: grow && !reduceMotion, span: total });
    updateLevelInfo();
}

// 走线的颜色：从起点到终点顺着这一关配色的渐变走（第几步就取渐变上的第几段）
function stepColor(i, total) {
    return stage.gradientColor(total > 1 ? i / (total - 1) : 0);
}

function updateLevelInfo() {
    const el = $("level-remaining");
    const total = state.levelKeySet.size;
    if (!total) {
        el.textContent = "";
        return;
    }
    const end = state.endKey ? escapeText(label(state.endKey)) : "";
    const start = state.startKey ? escapeText(label(state.startKey)) : "";
    const route = state.order.length ? state.order.map((k) => escapeText(label(k))).join(" → ") : "";
    if (state.path.length > 0) {
        const want = nextWaypoint();
        el.innerHTML = `还剩 <b>${total - state.path.length}</b> 个键` +
            (want ? `，下一站 <b>${escapeText(label(want))}</b>` : "") +
            (end ? `，终点是 <b>${end}</b>` : "");
    } else if (start && route) {
        el.innerHTML = `本关 <b>${total}</b> 个键：从 <b>${start}</b> 出发，按顺序经过 <b>${route}</b>，最后停在 <b>${end}</b> 上`;
    } else if (start) {
        el.innerHTML = `本关 <b>${total}</b> 个键：从 <b>${start}</b> 出发，停在 <b>${end}</b> 上——起点和终点都定死了`;
    } else if (end) {
        el.innerHTML = `本关 <b>${total}</b> 个键，起点随意，但必须停在 <b>${end}</b> 上`;
    } else {
        el.innerHTML = `本关 <b>${total}</b> 个键，任意一个亮着的键都可以作为起点`;
    }
    renderRoute();
}

// 第 14 关：还没经过的途经点里，排在最前面的那个
function nextWaypoint() {
    return state.order.find((k) => !state.path.includes(k)) || null;
}

// 途经点的进度条：W O R L D 五颗小键帽，经过一个亮一个
function renderRoute() {
    const el = $("hud-route");
    if (!state.order.length || !state.levelKeySet.size) {
        el.hidden = true;
        return;
    }
    el.hidden = false;
    const want = nextWaypoint();
    el.innerHTML = state.order.map((k) => {
        const cls = state.path.includes(k) ? "done" : k === want ? "next" : "";
        return `<kbd class="${cls}">${escapeText(label(k))}</kbd>`;
    }).join('<span class="hr-arrow" aria-hidden="true"></span>');
}

// ---------- 关卡里的声音：每关一件乐器 ----------
function playStep(step, total, id, velocity = 1) {
    const snd = levelSoundFor(state.level);
    const mood = MOODS[style.mood];
    audio.play(snd.patch, stepFreqOf(snd, step, total), {
        pan: panOf(id), velocity: velocity * (mood.velocity || 1), length: mood.length || 1,
    });
}

function playErrorNote() {
    audio.error(levelSound(state.level).root);
}

function playUndoNote() {
    const snd = levelSoundFor(state.level);
    audio.play(snd.patch, scaleFreqOf(snd, 1) / 2, { velocity: 0.5, length: 0.3 });
}

function playFlourish() {
    const snd = levelSoundFor(state.level);
    [0, 2, 4, 6, 9].forEach((idx, i) => {
        audio.play(snd.patch, scaleFreqOf(snd, idx), { when: i * 0.075, velocity: 0.85, length: 1.3, pan: (i - 2) * 0.18 });
    });
    // 底下垫一个低八度的根音，慢慢涨上来：超新星炸开时的那一声"嗡"
    if (!reduceMotion) audio.play("pad", scaleFreqOf(snd, 0) / 2, { velocity: 0.55, length: 1.6 });
}

function handleKeyPress(id) {
    if (currentScreen !== "game" || state.locked) return;
    if (!state.levelKeySet.has(id)) return;
    if (state.path.length === 0 && state.startKey && id !== state.startKey) {
        flashError(id, `这一关得从 ${label(state.startKey)} 出发～`);
        return;
    }
    if (state.path.length > 0) {
        const last = state.path[state.path.length - 1];
        if (state.path.includes(id) || !ADJ[last].includes(id)) {
            flashError(id);
            return;
        }
    }
    // 途经点要按顺序：还没轮到的那几个先不能踩
    const want = nextWaypoint();
    if (want && state.order.includes(id) && id !== want) {
        flashError(id, `要先经过 ${label(want)}，才能走到 ${label(id)}`);
        return;
    }
    // 终点留到最后一步：提前踩上去，后面就再也走不出来了
    if (state.endKey && id === state.endKey && state.path.length < state.levelKeySet.size - 1) {
        flashError(id, `${label(id)} 是终点，要留到最后一步再踩～`);
        return;
    }
    state.path.push(id);
    // 先发声、再更新画面：声音越早排进音频线程越跟手
    playStep(state.path.length - 1, state.levelKeySet.size, id);
    hintUndo = null;
    feedback("");
    renderGameKeys(true);
    stage.pop(id);
    stage.flare(id);
    stage.ripple(id, { strength: 0.45, speed: 7, life: 1 });

    if (state.path.length === state.levelKeySet.size) {
        if (state.endKey && id !== state.endKey) {
            // 键都走完了但没停在终点上——这条路走死了，只能回退
            stage.shake(id);
            stage.flare(id, ERROR_COLOR);
            playErrorNote();
            feedback(
                `${state.levelKeySet.size} 个键都走到了，但终点不是 ${label(state.endKey)}。按 Backspace 回退，换一条走法～`,
                true
            );
            return;
        }
        completeLevel();
    }
}

function flashError(id, message) {
    playErrorNote();
    stage.shake(id);
    stage.flare(id, ERROR_COLOR);
    stage.ripple(id, { color: ERROR_COLOR, strength: 0.5, speed: 6, life: 0.7 });
    feedback(
        message || (state.path.includes(id) ? "这个键已经走过了，换一个试试～" : "这个键不相邻，只能走上下左右紧挨着的键～"),
        true,
        message ? 2000 : 1400
    );
}

function undoLastStep() {
    if (currentScreen !== "game" || state.locked || state.path.length === 0) return;
    hintUndo = null;
    state.path.pop();
    renderGameKeys(false);
    feedback("");
    playUndoNote();
}

function restartCurrentLevel() {
    if (currentScreen !== "game" || state.locked) return;
    hintUndo = null;
    state.path = [];
    renderGameKeys(false);
    feedback("");
    playUndoNote();
}

// ---------- 提示：告诉你下一步走哪；已经走进死路的话，告诉你退回到第几步 ----------
// 从当前这条路往后找一条能走完的走法：停在终点上、从指定起点出发、途经点按顺序。
// 返回剩下要走的键；null = 确定走不通；undefined = 算不过来（预算用完）
const OUT_OF_BUDGET = {};

function solveFrom(path, { budget = 300000, keys = state.levelKeySet, end = state.endKey, start = state.startKey, order = state.order } = {}) {
    const n = keys.size;
    const visited = new Set(path);
    const out = [];
    let steps = budget;
    const cp = new Map(order.map((k, i) => [k, i]));
    const free = (id) => keys.has(id) && !visited.has(id);
    const onward = (id) => ADJ[id].filter(free).length;
    // 这条路已经按顺序经过了几个途经点
    let passed = 0;
    while (passed < order.length && visited.has(order[passed])) passed++;

    // 剪枝：剩下的键里，只有一个出口的"死胡同"最多只能有一个（它得是终点）；没有出口的一个都不能有
    const prune = (cur) => {
        let deadEnds = 0;
        for (const id of keys) {
            if (visited.has(id)) continue;
            let deg = 0;
            for (const nx of ADJ[id]) if (nx === cur || free(nx)) deg++;
            if (deg === 0) return true;
            if (deg === 1) {
                if (end && id !== end) return true;
                deadEnds += 1;
                if (deadEnds > 1) return true;
            }
        }
        return false;
    };

    function dfs(cur, next) {
        if (visited.size === n) return (!end || cur === end) && next === order.length;
        if (--steps <= 0) throw OUT_OF_BUDGET;
        if (prune(cur)) return false;
        const left = n - visited.size;
        const cand = ADJ[cur].filter((id) =>
            free(id) && (!end || id !== end || left === 1) && (!cp.has(id) || cp.get(id) === next));
        cand.sort((a, b) => onward(a) - onward(b));
        for (const nx of cand) {
            visited.add(nx);
            out.push(nx);
            if (dfs(nx, cp.has(nx) ? next + 1 : next)) return true;
            visited.delete(nx);
            out.pop();
        }
        return false;
    }

    try {
        if (path.length === 0) {
            for (const s of start ? [start] : keys) {
                if (end && s === end && n > 1) continue;
                if (cp.has(s) && cp.get(s) !== 0) continue;
                visited.add(s);
                out.push(s);
                if (dfs(s, cp.has(s) ? 1 : 0)) return out;
                visited.delete(s);
                out.pop();
            }
            return null;
        }
        return dfs(path[path.length - 1], passed) ? out : null;
    } catch (err) {
        if (err === OUT_OF_BUDGET) return undefined;
        throw err;
    }
}

let hintUndo = null; // 上一次提示说"要退回到第 k 步"：再按一次提示就直接帮你退

function showHint() {
    if (currentScreen !== "game" || state.locked || !state.levelKeySet.size) return;
    audio.ensure();
    const cw = colorway;
    // 第二次按：帮你退回去
    if (hintUndo) {
        const { len, next } = hintUndo;
        hintUndo = null;
        state.path = state.path.slice(0, len);
        renderGameKeys(false);
        playUndoNote();
        markHint(next, `退回来了。下一步走 ${label(next)}`);
        return;
    }
    let next = null;
    const sol = state.solution;
    if (sol && state.path.every((id, i) => sol[i] === id)) {
        next = sol[state.path.length];
    } else {
        const rest = solveFrom(state.path);
        if (rest === undefined) {
            feedback("这一步岔路太多，一下子算不过来——先撤销几步再点提示", false, 2600);
            return;
        }
        if (rest) next = rest[0];
        else {
            // 走进死路了：往回找最近的一个还能走通的位置
            for (let k = state.path.length - 1; k >= 0; k--) {
                const r = solveFrom(state.path.slice(0, k), { budget: 120000 });
                if (r && r.length) {
                    hintUndo = { len: k, next: r[0] };
                    const back = state.path.length - k;
                    const at = k ? `第 ${k} 步（${label(state.path[k - 1])}）` : "起点之前";
                    feedback(`这条路走不通了：退 ${back} 步回到${at}，再走 ${label(r[0])}。再按一次「提示」帮你退回去`, true);
                    if (k) stage.ripple(state.path[k - 1], { color: ERROR_COLOR, strength: 0.7 });
                    return;
                }
            }
            feedback("这一关换个起点重新走吧～", true, 2400);
            return;
        }
    }
    if (next) markHint(next, state.path.length ? `下一步：${label(next)}` : `从 ${label(next)} 开始走`);
}

function markHint(id, text) {
    stage.setKey(id, { glow: 1.3, pulse: 1, glowColor: colorway.accent, lift: 0.07 });
    stage.ripple(id, { color: colorway.accent, strength: 0.9, speed: 6 });
    stage.flare(id, colorway.accent);
    feedback(`💡 ${text}`, false, 2400);
}

// ---------- 跳关：确认后代你走完这一关，塔里这一层会是一道虚影 ----------
let skipArmedAt = 0;
let skipTimer = null;

function resetSkipBtn() {
    const btn = $("btn-skip");
    btn.classList.remove("armed");
    btn.querySelector(".kbtn-t").textContent = "跳过本关";
}

function skipLevel() {
    if (currentScreen !== "game" || state.locked || !state.levelKeySet.size) return;
    const now = performance.now();
    // 点第一下只是"上膛"，两秒半内再点一次才真的跳，防止手滑
    if (now - skipArmedAt > 2600) {
        skipArmedAt = now;
        const btn = $("btn-skip");
        btn.classList.add("armed");
        btn.querySelector(".kbtn-t").textContent = "再点一次确认";
        clearTimeout(skipTimer);
        skipTimer = setTimeout(resetSkipBtn, 2600);
        return;
    }
    skipArmedAt = 0;
    clearTimeout(skipTimer);
    resetSkipBtn();
    const sol = state.solution || solveFrom([], { budget: 3000000 });
    const level = state.level;
    const finish = () => {
        state.runs.set(level, { path: (sol || state.keys).slice(), letters: pickLetters(sol || state.keys), sentence: null, skipped: true });
        state.locked = false;
        if (currentScreen === "game") goToNextLevel();
        else state.afterSkip = true; // 人切去音乐模式了：回来再接着进下一关
    };
    if (!sol) {
        finish();
        return;
    }
    state.locked = true;
    hintUndo = null;
    state.path = [];
    renderGameKeys(false);
    feedback("代你走一遍——这一层在最后的塔里会是一道虚影", false);
    const step = Math.min(110, Math.max(45, 1500 / sol.length));
    sol.forEach((id, i) => setTimeout(() => {
        if (currentScreen !== "game" || state.level !== level) return;
        state.path.push(id);
        renderGameKeys(true);
        stage.pop(id);
        playStep(i, sol.length, id, 0.5);
    }, 200 + i * step));
    setTimeout(finish, 200 + sol.length * step + 700);
}

// ---------- 过关的那句话：一张小海报 ----------
// 句子用衬线斜体，每个词的首字母单独拎出来，颜色顺着这一关的渐变一个一个排过去；
// 首字母一开始是空着的——等你在键盘上把它们一个个"放飞"回来
function renderPoster(sentence, letters, level) {
    const cw = levelColorway(level);
    const inst = INSTRUMENTS[LEVEL_SOUND[level - 1].patch];
    const wrap = document.createElement("div");
    wrap.className = "poster";
    wrap.innerHTML =
        `<span class="poster-quote" aria-hidden="true">“</span>` +
        `<p class="poster-meta"><span>${pad2(level)}</span><span>${escapeText(cw.name)}</span><span>${escapeText(inst.name)}</span></p>`;
    const p = document.createElement("p");
    p.className = "poster-sentence";
    const want = new Set(String(letters || "").toLowerCase().split(""));
    const words = sentence.split(/\s+/).filter(Boolean);
    words.forEach((word, i) => {
        const m = /^([^A-Za-z]*)([A-Za-z])(.*)$/.exec(word);
        const w = document.createElement("span");
        w.className = "pw";
        w.style.setProperty("--i", i);
        w.style.setProperty("--pw-c", stage.gradientColor(words.length > 1 ? i / (words.length - 1) : 0));
        if (m) {
            const ch = m[2].toLowerCase();
            w.dataset.letter = ch;
            // 句子里用上了这一关字母的那几个词，首字母换强调色
            if (want.has(ch)) {
                w.classList.add("hit");
                want.delete(ch);
            }
            w.innerHTML = `${escapeText(m[1])}<span class="pw-i">${escapeText(m[2])}</span><span class="pw-r">${escapeText(m[3])}</span>`;
        } else {
            w.classList.add("landed");
            w.innerHTML = `<span class="pw-r">${escapeText(word)}</span>`;
        }
        p.appendChild(w);
        p.appendChild(document.createTextNode(" "));
    });
    wrap.appendChild(p);
    const keys = document.createElement("p");
    keys.className = "poster-keys";
    keys.innerHTML =
        `<span class="pk-label">这一关送给 AI 的字母</span>` +
        String(letters || "").toUpperCase().split("").map((c) => `<kbd>${escapeText(c)}</kbd>`).join("");
    wrap.appendChild(keys);
    return wrap;
}

// ============================================================
// 过关仪式——一场梦
//   ① 入梦：最后一步落下，键盘的灯暗下去、光留下来（泛光），页面背后浮出星空；音符的尾巴拖得很长
//   ② 彗星：一颗亮点顺着整条线从起点跑到终点，一路撒星尘；经过哪个键，哪个键弹一下、响一声、升起一道细光
//   ③ 超新星：到终点炸开——一团星尘、两圈彩虹色的冲击波荡满整块键盘、几枚星光烟花
//   ④ 浮起：过关页上笔迹重新画一遍（笔尖撒着星星），然后整条离开键盘悬在上面，像萤火一样一直往外冒星点
//   ⑤ 拾字：每个词的首字母像一盏灯挂在它那颗键上方——按下它（或点它），键里升起一道光，
//      字母拖着星尘飞回句子里，一个字母一个音；空格一次全放飞，Enter 直接去下一关
//   ⑥ 成句：整条线"呼"出一口星星，冲击波荡开，一道彩虹光扫过句子，收一个和弦
//   离开过关页时一切慢慢醒回来
// ============================================================
const dream = stage ? new Dream(stage) : null;
const dreamSky = new DreamSky($("dream-canvas"), { reduced: reduceMotion });
let dreaming = false;
let replaying = false;

// 这套配色有多亮（0 = 深色外壳和键帽，1 = 奶白、粉白那种）：梦里浅色的键盘要压得更深
function colorwayBrightness(cw = colorway) {
    const lum = (hex) => {
        const n = parseInt(String(hex).slice(1, 7), 16);
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    };
    const l = 0.6 * lum(cw.case) + 0.4 * lum(cw.alpha);
    return Math.max(0, Math.min(1, (l - 0.12) / 0.45));
}

function enterDream() {
    if (!dream || reduceMotion || dreaming) return;
    dreaming = true;
    const bright = colorwayBrightness();
    dream.begin({ bloom: 1.1, haze: 0.3 - 0.12 * bright, aberr: 0.005 });
    stage.setDreamLight(1, { bright });
    audio.setDreamTail(0.6);
    document.body.classList.add("dreaming");
    dreamSky.show(gradPalette(4));
}

function leaveDream() {
    if (!dreaming) return;
    dreaming = false;
    dream.end();
    stage.setDreamLight(0);
    audio.setDreamTail(0);
    document.body.classList.remove("dreaming");
    dreamSky.hide();
}

// 一条路上第 i 个键的光点（算上整条线浮起来的高度）
function pathPointOf(id) {
    const p = stage.keyTop(id);
    if (p) p.y += stage.path.lift;
    return p;
}

// 整条线"呼"出一口星星：每个键上冒一小团，颜色顺着渐变
function exhaleStars(path, { count = 8, speed = 1.3, life = [1.4, 2.8] } = {}) {
    if (!dreaming || !path.length) return;
    const n = path.length;
    path.forEach((id, i) => {
        dream.emit(pathPointOf(id), {
            count, speed, spread: 1.1, life, size: [0.06, 0.2], buoy: 0.55, star: 0.45,
            colors: [stage.gradientColor(n > 1 ? i / (n - 1) : 0), "#ffffff"],
        });
    });
}

function playVictoryReplay() {
    return new Promise((resolve) => {
        const path = state.path.slice();
        const total = path.length;
        // 手快的时候最后几步的线还在长：先一下子画满，彗星才有路可跑
        stage.path.complete();
        stage.pulsePath();
        if (reduceMotion || !total) {
            resolve();
            return;
        }
        replaying = true;
        enterDream();
        // 梦里让线和星星当光源：走过的键退暗、不再自己发光，序号也收起来
        path.forEach((id, i) => {
            stage.setKey(id, { dim: 0.3, lift: 0, glow: 0.28, emissive: 0, legendGlow: 0, pulse: 0, glowColor: stepColor(i, total) });
            legend(id, {});
        });
        stage.setTargetKey(null);
        const T = Math.min(3.6, Math.max(2, 1.4 + total * 0.055));
        // 每个键在整条线上的位置（按弧长），亮点到了才响
        const pts = path.map((id) => stage.keyTop(id));
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
        const len = cum[cum.length - 1] || 1;
        const colors = gradPalette(6);
        const colorAt = (i) => stage.gradientColor(total > 1 ? i / (total - 1) : 0);
        // 蓝牙耳机的声音晚到：音符提前这么多秒排，耳朵听到的那一刻彗星正好到
        const lead = Math.min(0.35, visualLag());
        let nextSound = 0;
        let nextKey = 0;
        let done = false;
        const t0 = stage.time;
        const view = gameView();
        const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
        // 镜头：压低、推近，跟着彗星从左往右慢慢摇过去
        const shoot = (e) => stage.setView({ ...view, el: view.el + 5 - 7 * Math.sin(Math.PI * e), az: -9 + 18 * e, zoom: 0.88, speed: 1.4 });
        const stop = () => {
            done = true;
            off();
            clearTimeout(safety);
            replaying = false;
            stage.path.setComet(null);
            stage.path.setShift(0);
        };
        const finish = () => {
            if (done) return;
            stop();
            const end = path[total - 1];
            const p = stage.keyTop(end, 0.02);
            // 超新星：终点炸开一团星尘，两圈彩虹色的冲击波荡满整块键盘，泛光猛地一亮
            dream.flash(1.5);
            dream.emit(p, { count: 150, speed: 4.5, spread: 2, life: [1.6, 3.4], size: [0.07, 0.24], colors, buoy: 0.25, drag: 1.3, star: 0.4 });
            dream.ring(p, { colors: [colors[0], colors[5]], radius: 9.5, life: 2, width: 0.045 });
            dream.ring(p, { colors: [colors[2], colors[4]], radius: 6.5, life: 2.2, width: 0.07, delay: 0.2, gain: 1 });
            stage.ripple(end, { strength: 1.5, speed: 9, width: 1.6, life: 2.1 });
            stage.pulsePath();
            if (currentScreen === "game") stage.setView(view);
            resolve();
        };
        const off = stage.onTick(() => {
            // 回放途中人切去了别的屏（音乐模式）：安静地收掉，别在那边放烟花
            if (currentScreen !== "game") {
                stop();
                resolve();
                return;
            }
            const u = Math.min(1, (stage.time - t0) / T);
            const e = ease(u);
            stage.path.setComet(e, { size: 1.2 });
            // 颜色沿线荡一个来回，到终点刚好回到原样
            stage.path.setShift(e * 2);
            shoot(e);
            // 彗星一路撒星尘
            const head = stage.path.cometWorld();
            if (head) {
                dream.emit(head, {
                    count: 4, speed: 0.7, spread: 2, life: [0.6, 1.6], size: [0.05, 0.15], buoy: 0.3, drag: 2.2, star: 0.3,
                    colors: [stage.gradientColor(e), "#ffffff"],
                });
            }
            // 声音按"提前量"走，画面按彗星走
            const eSound = ease(Math.min(1, u + lead / T));
            while (nextSound < total && cum[nextSound] / len <= eSound + 1e-6) {
                playStep(nextSound, total, path[nextSound], 0.85);
                nextSound++;
            }
            while (nextKey < total && cum[nextKey] / len <= e + 1e-6) {
                const id = path[nextKey];
                const c = colorAt(nextKey);
                stage.pop(id);
                stage.flare(id, c);
                stage.setKey(id, { glow: 0.55 });
                const kp = stage.keyTop(id, 0.02);
                dream.emit(kp, { count: 12, speed: 1.8, spread: 0.9, life: [0.8, 1.8], size: [0.05, 0.17], colors: [c, "#ffffff"], buoy: 0.45, star: 0.35 });
                dream.pillar(kp, { color: c, height: 2.6, width: 0.6, life: 1.2, gain: 1.6 });
                nextKey++;
            }
            if (u >= 1) finish();
        });
        shoot(0);
        // 页面切到后台时 rAF 不跑：保险丝，别让流程卡在这里
        const safety = setTimeout(finish, T * 1000 + 2500);
    });
}

let rewardToken = 0;

async function completeLevel() {
    state.locked = true;
    feedback("");
    stage.setTargetKey(null);
    await playVictoryReplay();
    // 回放途中切去了音乐模式：那边不放烟花、不响收尾
    if (currentScreen === "game") {
        playFlourish();
        launchCelebration();
    }

    const level = state.level;
    const path = state.path.slice();
    // 字母在开局就选好并发出去了，这里直接复用；万一没有就现选
    const picked = state.pendingLetters || pickLetters(path);
    const run = { path, letters: picked, sentence: null };
    state.runs.set(level, run);

    $("reward-level-num").textContent = pad2(level);
    $("reward-level-total").textContent = pad2(TOTAL_LEVELS);
    $("btn-next").textContent = level >= TOTAL_LEVELS ? "完成" : "下一关";
    $("btn-next").classList.remove("ready");
    stopLetterGame();
    const token = ++rewardToken;
    const msgEl = $("reward-message");
    showLoading(msgEl, picked);
    resetRewardIntro();
    // 超新星的光和烟花先看一会儿再换屏。这一会儿里点开了音乐模式的话，别把人拽出来，等他回来再看
    await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 1300));
    if (currentScreen === "game") showScreen("reward");
    else if (currentScreen === "music") musicReturnTo = "reward";
    resumeScreen = "reward";

    try {
        // 开局那次请求通常已经回来了，这里几乎不等待；失败过才现场重试一次
        let sentence = state.pendingSentence ? await state.pendingSentence : null;
        if (!sentence) sentence = await generateAISentence(picked);
        run.sentence = sentence;
        if (token === rewardToken) showAIResult(msgEl, sentence, picked, level);
        if (currentScreen === "final") renderFinalMessage();
    } catch (err) {
        console.warn("⚠️ AI 生成失败，显示兜底按钮:", err.message);
        if (token === rewardToken) showFallbackButton(msgEl, picked, err.message, run);
    }
}

// ---------- 过关：斜上方看这一关的笔迹，笔尖走到哪个键哪个键亮；画完整条笔迹浮起来 ----------
let rewardTimers = [];
let rewardPath = [];
let rewardTouchedAt = 0; // 最后一次在过关页上按键 / 点灯的时刻：停手太久，星星就不再冒了（画面能停下来省电）
// 过关页的开场（画线 → 浮起）演完了没有。句子可能比开场先到，字母要等开场演完才挂出来。
// 换屏走的是视图过渡，setupReward 会晚一拍才跑——所以"开场还没演"这个状态在决定换屏的那一刻就要立起来
let rewardIntro = Promise.resolve();
let introResolve = null;

function resetRewardIntro() {
    rewardIntro = new Promise((r) => { introResolve = r; });
}

function clearRewardTimers() {
    rewardTimers.forEach(clearTimeout);
    rewardTimers = [];
}

// 走过的键连成一行字，颜色和线一样顺着渐变排
function renderSequence(path) {
    const el = $("reward-sequence");
    el.innerHTML = path.map((id, i) => `<span style="color:${stepColor(i, path.length)}">${escapeText(label(id))}</span>`).join("");
}

function setupReward() {
    clearRewardTimers();
    applyColorway(screenColorway());
    const run = state.runs.get(state.level);
    const path = run ? run.path : state.path;
    stage.resetKeys({ dim: 1 });
    clearLegends();
    stage.setInteractive((id) => id === "knob" || !!(letterGame && letterGame.pending.has(id)));
    stage.setPath([], { grow: false });
    // 梦里斜一点看：星星往上飘看得出来；镜头之后会轻轻地漂
    const view = { region: regionOf(path, 0.9), az: 0, el: reduceMotion ? 76 : 64, fov: 30, margin: 0.08 };
    stage.setView(view);
    rewardPath = path.slice();
    rewardTouchedAt = performance.now();
    enterDream();
    if (dreaming) dream.setLevel(1, 0.3);
    renderSequence(path);
    if (!introResolve) resetRewardIntro();
    const resolveIntro = introResolve;
    const introDone = () => {
        if (introResolve === resolveIntro) introResolve = null;
        resolveIntro();
    };
    if (!path.length) {
        introDone();
        return;
    }

    path.forEach((id) => stage.setKey(id, { dim: 0.35, glow: 0.12 }));
    stage.setPath(path, { grow: !reduceMotion });
    if (!reduceMotion) stage.path.setFlow({ count: 3, speed: 3 });
    // 刚在关卡里回放过一遍，这里画快一点（最多 1.2 秒），好让字母早点挂出来
    const rate = Math.max(8, stage.path.length / 1.2);
    stage.path.growRate = rate;
    const pts = path.map((id) => stage.keyTop(id));
    let acc = 0;
    path.forEach((id, i) => {
        if (i > 0) acc += pts[i].distanceTo(pts[i - 1]);
        rewardTimers.push(setTimeout(() => {
            // 梦里键帽不自己发光（泛光会把它糊成一团白），底光留着
            stage.setKey(id, dreaming
                ? { dim: 0.2, glow: 0.6, legendGlow: 0, emissive: 0, glowColor: stepColor(i, path.length) }
                : { dim: 0, glow: 0.85, legendGlow: 0.3, emissive: 0.25, glowColor: stepColor(i, path.length) });
            stage.flare(id);
        }, reduceMotion ? 0 : (acc / rate) * 1000));
    });
    legend(path[0], { sub: "起" });
    legend(path[path.length - 1], { sub: "终" });
    const drawn = reduceMotion ? 0 : (acc / rate) * 1000;
    if (dreaming) startRewardDream(view);
    // 画完：整条笔迹离开键盘浮起来，悬在上面；键帽退暗一点，等一会儿字母从它们上面冒出来
    rewardTimers.push(setTimeout(() => {
        if (currentScreen !== "reward") return;
        stage.path.setLift(reduceMotion ? 0 : 0.8);
        stage.path.pulse = 0.7;
        path.forEach((id, i) => stage.setKey(id, { glow: dreaming ? 0.34 : 0.45, emissive: dreaming ? 0 : 0.1, glowColor: stepColor(i, path.length) }));
        if (!reduceMotion) stage.ripple(path[0], { strength: 0.8, speed: 8, life: 1.6 });
        // 离开键盘的那一下，整条线抖落一层星星
        exhaleStars(path, { count: 5, speed: 0.9, life: [1.2, 2.4] });
    }, drawn + 250));
    rewardTimers.push(setTimeout(introDone, reduceMotion ? 0 : drawn + 650));
    // 从音乐模式回来时句子已经在了：接着玩没放飞完的那几个字母
    const poster = $("reward-message").querySelector(".poster");
    if (poster) {
        const token = rewardToken;
        rewardIntro.then(() => {
            if (currentScreen === "reward" && token === rewardToken) startLetterGame(poster, state.level);
        });
    }
}

// 过关页上一直在动的那部分梦：画线时笔尖撒星星；画完后整条线像萤火一样往外冒星点，镜头轻轻地漂。
// 停手超过 25 秒就不再冒（星星熄完，画面停下，不白白耗电）；再按一下键又接着来
function startRewardDream(view) {
    let acc = 0;
    let sway = 0;
    dream.ambient = (dt) => {
        if (currentScreen !== "reward") return false;
        const tip = stage.path.tip();
        if (tip) {
            dream.emit(tip, { count: 2, speed: 0.6, spread: 2, life: [0.7, 1.5], size: [0.05, 0.14], buoy: 0.4, star: 0.3, colors: gradPalette(5) });
            return true;
        }
        if (performance.now() - rewardTouchedAt > 25000) return false;
        sway += dt;
        stage.setView({ ...view, az: Math.sin(sway * 0.22) * 4, el: view.el + Math.sin(sway * 0.17) * 2.5, speed: 1.2 });
        const done = !letterGame || letterGame.done;
        const every = done ? 0.2 : 0.07;
        acc += dt;
        while (acc > every) {
            acc -= every;
            const u = Math.random();
            dream.emit(stage.path.pointAt(u), {
                count: 1, speed: 0.25, spread: 2, life: [2, 3.6], size: [0.05, 0.14], buoy: 0.2, drag: 1, star: 0.35,
                colors: [stage.gradientColor(u), "#ffffff"],
            });
        }
        return true;
    };
}

// ---------- 拾字：句子里的首字母挂在各自的键上方，按一下放飞一个 ----------
let letterGame = null;
const lanternLayer = $("lantern-layer");
const letterHintEl = $("letter-hint");

function stopLetterGame() {
    const G = letterGame;
    if (!G) return;
    cancelAnimationFrame(G.raf);
    clearInterval(G.idle);
    G.lanterns.forEach((el) => el.remove());
    G.lanterns.clear();
    letterGame = null;
    letterHintEl.hidden = true;
}

function startLetterGame(poster, level) {
    if (letterGame && letterGame.poster === poster && !letterGame.done) return; // 已经在玩这一张了
    stopLetterGame();
    // 这句话早就拼完了（从音乐模式回来）：不再重放收尾
    if (poster.classList.contains("complete")) {
        $("btn-next").classList.add("ready");
        return;
    }
    const words = [...poster.querySelectorAll(".pw")];
    const pending = new Map(); // 键 → 还没放飞的那几个词（按句子里的先后）
    words.forEach((w) => {
        if (w.classList.contains("landed")) return;
        const ch = w.dataset.letter;
        if (!ch || !stage.keys.has(ch) || reduceMotion) {
            w.classList.add("landed");
            return;
        }
        if (!pending.has(ch)) pending.set(ch, []);
        pending.get(ch).push(w);
    });
    const G = {
        poster, level, words, pending,
        lanterns: new Map(), flying: 0, landed: 0,
        lastAt: performance.now(), raf: 0, idle: 0, done: false,
    };
    letterGame = G;
    if (!pending.size) {
        finishLetterGame();
        return;
    }
    letterHintEl.hidden = false;
    letterHintEl.classList.remove("nudge");
    letterHintEl.querySelector(".lh-text").textContent = "敲下发光的键，把字母送回句子里";
    stage.setInteractive((id) => id === "knob" || !!(letterGame && letterGame.pending.has(id)));
    // 灯笼一盏一盏亮起来
    [...pending.keys()].forEach((ch, i) => rewardTimers.push(setTimeout(() => addLantern(ch), 120 + i * 110)));
    const track = () => {
        G.raf = requestAnimationFrame(track);
        G.lanterns.forEach((el, ch) => placeLantern(el, ch));
    };
    track();
    // 停手太久：下一个该放飞的字母轻轻跳一跳
    G.idle = setInterval(() => {
        if (G.done || G.flying || performance.now() - G.lastAt < 5200) return;
        const next = G.words.find((w) => !w.classList.contains("landed") && G.pending.has(w.dataset.letter));
        if (!next) return;
        const el = G.lanterns.get(next.dataset.letter);
        if (el) el.classList.add("nudge");
        stage.setKey(next.dataset.letter, { pulse: 1.4 });
        letterHintEl.classList.add("nudge");
        letterHintEl.querySelector(".lh-text").textContent = `试试按 ${next.dataset.letter.toUpperCase()}`;
    }, 1300);
}

function wordColor(w) {
    return w.style.getPropertyValue("--pw-c") || colorway.glow;
}

function addLantern(ch) {
    const G = letterGame;
    if (!G || G.done || !G.pending.has(ch) || G.lanterns.has(ch)) return;
    const list = G.pending.get(ch);
    const color = wordColor(list[0]);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "lantern";
    el.style.setProperty("--c", color);
    el.setAttribute("aria-label", `放飞字母 ${ch.toUpperCase()}`);
    el.innerHTML = `<span class="lt-in"><span class="lt-ch"></span><i class="lt-n"></i></span>`;
    el.querySelector(".lt-ch").textContent = list[0].querySelector(".pw-i").textContent;
    el.addEventListener("click", (e) => {
        e.stopPropagation();
        launchLetter(ch);
    });
    lanternLayer.appendChild(el);
    G.lanterns.set(ch, el);
    updateLanternCount(ch);
    placeLantern(el, ch);
    stage.setKey(ch, { glow: dreaming ? 0.9 : 1.1, pulse: 0.55, glowColor: color, lift: 0.07, emissive: dreaming ? 0.06 : 0.35, dim: 0 });
    stage.pop(ch);
    // 每亮一盏，很轻地响一下（音阶往上走）
    const snd = levelSoundFor(G.level);
    audio.play(snd.patch, scaleFreqOf(snd, 7 + (G.lanterns.size % snd.scale.length)), { velocity: 0.16, length: 0.5, pan: panOf(ch) });
}

function updateLanternCount(ch) {
    const G = letterGame;
    const el = G && G.lanterns.get(ch);
    if (!el) return;
    const n = (G.pending.get(ch) || []).length;
    el.querySelector(".lt-n").textContent = n > 1 ? `×${n}` : "";
}

// 灯笼挂在键帽正上方：镜头动、页面滚，每一帧跟着那颗键走
function placeLantern(el, ch) {
    const p = stage.screenOf(ch);
    if (!p) return;
    el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
}

// 放飞 ch 上排在最前面的那个字母；没有可放的返回 false
function launchLetter(ch) {
    const G = letterGame;
    if (!G || G.done) return false;
    const list = G.pending.get(ch);
    if (!list || !list.length) return false;
    const w = list.shift();
    const lantern = G.lanterns.get(ch);
    let from = stage.screenOf(ch);
    if (lantern) {
        const r = lantern.querySelector(".lt-in").getBoundingClientRect();
        from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    if (!list.length) {
        G.pending.delete(ch);
        if (lantern) {
            G.lanterns.delete(ch);
            lantern.classList.add("gone");
            setTimeout(() => lantern.remove(), 400);
        }
        stage.setKey(ch, { glow: 0.5, pulse: 0, lift: 0, emissive: 0.1 });
    } else {
        updateLanternCount(ch);
        if (lantern) lantern.classList.remove("nudge");
    }
    G.lastAt = performance.now();
    rewardTouchedAt = G.lastAt;
    letterHintEl.classList.remove("nudge");
    letterHintEl.querySelector(".lh-text").textContent = G.pending.size ? "敲下发光的键，把字母送回句子里" : "……";
    stage.pop(ch);
    stage.flare(ch, wordColor(w));
    stage.ripple(ch, { strength: 0.55, speed: 8, life: 1.1 });
    if (dreaming) {
        // 键里升起一道光，迸出一团星星——字母就是从这里飞出去的
        const kp = stage.keyTop(ch, 0.02);
        dream.emit(kp, { count: 18, speed: 2.2, spread: 0.8, life: [0.8, 1.7], size: [0.05, 0.18], buoy: 0.5, star: 0.45, colors: [wordColor(w), "#ffffff"] });
        dream.pillar(kp, { color: wordColor(w), height: 3.2, width: 0.45, life: 1 });
        dream.flash(0.25);
    }
    G.flying += 1;
    flyLetter(w, from, () => {
        G.flying -= 1;
        landWord(w);
    });
    return true;
}

// 一个字母从 from 飞进句子里它自己的位置：沿一道弧线（二次贝塞尔）飞，身后拖着星尘，落下时迸一团星光
function flyLetter(w, from, onLand) {
    const init = w.querySelector(".pw-i");
    if (!init || reduceMotion || !from) {
        onLand();
        return;
    }
    const tr = init.getBoundingClientRect();
    const to = { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 };
    const color = wordColor(w);
    const fly = document.createElement("span");
    fly.className = "fly-letter" + (w.classList.contains("hit") ? " hit" : "");
    fly.style.setProperty("--pw-c", color);
    fly.textContent = init.textContent;
    fly.style.fontSize = getComputedStyle(init).fontSize;
    $("fly-layer").appendChild(fly);
    // 控制点：往上拱出一道弧，每个字母偏得不一样
    const cx = (from.x + to.x) / 2 + (Math.random() - 0.5) * 180;
    const cy = Math.min(from.y, to.y) - 90 - Math.random() * 80;
    const spin = (Math.random() - 0.5) * 50;
    const dur = 920;
    const t0 = performance.now();
    let done = false;
    const land = (burst) => {
        if (done) return;
        done = true;
        fly.remove();
        if (burst) starBurst(to.x, to.y, { colors: [color, "#ffffff"], stars: 12, dust: 12, orbs: 1, speed: 3.6 });
        onLand();
    };
    const step = (now) => {
        if (done) return;
        const k = Math.min(1, (now - t0) / dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * cx + e * e * to.x;
        const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * cy + e * e * to.y;
        const sc = 1.3 + 0.35 * Math.sin(Math.PI * e) - 0.3 * e;
        fly.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${sc.toFixed(3)}) rotate(${(spin * Math.sin(Math.PI * e)).toFixed(1)}deg)`;
        starTrail(x, y, color);
        if (k >= 1) land(true);
        else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    // 页面在后台时 rAF 不跑：到点直接落下
    setTimeout(() => land(false), dur + 500);
}

function landWord(w) {
    const G = letterGame;
    w.classList.add("landed");
    if (!G || G.poster !== w.closest(".poster")) return;
    G.landed += 1;
    if (currentScreen === "reward") {
        // 落定一个响一个：句子被你一个音一个音地"弹"出来，越往后越高
        const snd = levelSoundFor(G.level);
        const idx = G.words.indexOf(w);
        audio.play(snd.patch, scaleFreqOf(snd, 4 + G.landed), {
            velocity: 0.55, length: 0.9, pan: (idx / Math.max(1, G.words.length - 1) - 0.5) * 0.8,
        });
    }
    if (!G.pending.size && !G.flying) finishLetterGame();
}

// 空格：剩下的字母按句子顺序一个接一个全放飞
function releaseAllLetters() {
    const G = letterGame;
    if (!G || G.done) return;
    const order = G.words.filter((w) => !w.classList.contains("landed") && G.pending.has(w.dataset.letter));
    order.forEach((w, i) => rewardTimers.push(setTimeout(() => launchLetter(w.dataset.letter), i * 120)));
}

// 按了一个没有灯笼的键：轻轻荡一下，不算错
function tapWithoutLetter(id) {
    rewardTouchedAt = performance.now();
    if (stage.keys.has(id)) {
        stage.pop(id);
        stage.ripple(id, { strength: 0.25, speed: 7, life: 0.7 });
    }
}

// ④ 成句
function finishLetterGame() {
    const G = letterGame;
    if (!G || G.done) return;
    G.done = true;
    cancelAnimationFrame(G.raf);
    clearInterval(G.idle);
    G.lanterns.forEach((el) => el.remove());
    G.lanterns.clear();
    letterHintEl.hidden = true;
    stage.setInteractive((id) => id === "knob");
    if (currentScreen !== "reward") return;
    G.poster.classList.add("complete");
    $("btn-next").classList.add("ready");
    if (reduceMotion) return;
    // 键盘上从左到右荡过一道波，线落回一半、继续流光
    stage.ripple("`", { strength: 1.1, speed: 10, width: 1.7, life: 2.4 });
    stage.path.setLift(0.35);
    stage.path.pulse = 1;
    // 收一个和弦：这一关的乐器从低到高扫上去
    const snd = levelSoundFor(G.level);
    [0, 2, 4, 7, 9, 11, 14].forEach((d, i) => {
        audio.play(snd.patch, scaleFreqOf(snd, d), { when: 0.1 + i * 0.07, velocity: 0.62, length: 1.4, pan: (i / 6 - 0.5) * 0.9 });
    });
    const colors = gradPalette(6);
    const r = G.poster.getBoundingClientRect();
    if (r.width) {
        // 句子上迸开一大团星光，左右再各开一朵
        starBurst(r.left + r.width / 2, r.top + r.height * 0.4, { colors, stars: 44, dust: 40, orbs: 3, speed: 7.5 });
        [0.2, 0.8].forEach((fx, i) => setTimeout(() => {
            if (currentScreen === "reward") starBurst(r.left + r.width * fx, r.top + r.height * 0.3, { colors, stars: 16, dust: 14, orbs: 1, speed: 5 });
        }, 180 + i * 170));
    }
    if (!dreaming) return;
    // 整条线"呼"出一口星星，冲击波从中间荡开，两枚星光烟花
    dream.flash(1.2);
    exhaleStars(rewardPath);
    const mid = rewardPath.length ? stage.keyTop(rewardPath[Math.floor(rewardPath.length / 2)], 0.02) : null;
    dream.ring(mid, { colors: [colors[0], colors[5]], radius: 9, life: 2.4, width: 0.05 });
    const W = window.innerWidth;
    [0.25, 0.75].forEach((fx, i) => setTimeout(() => {
        if (currentScreen === "reward") firework(W * fx, colors);
    }, 350 + i * 300));
    rewardTouchedAt = performance.now();
    // 梦慢慢安静下来：光退到一半，星星冒得越来越少
    rewardTimers.push(setTimeout(() => { if (dreaming) dream.setLevel(0.75, 0.22); }, 6000));
}

function goToNextLevel() {
    stopWordFlash(); // AI 还没返回就点了下一关时，别让闪词继续跑
    stopLetterGame();
    if (state.level >= TOTAL_LEVELS) showFinal();
    else startLevel(state.level + 1);
}

// ---------- 等待 AI 时的词闪烁 ----------
const WORD_FLASH_MS = 420; // 单个词停留时间，和 CSS 动画时长保持一致
let wordFlashTimer = null;

function stopWordFlash() {
    if (wordFlashTimer) {
        clearInterval(wordFlashTimer);
        wordFlashTimer = null;
    }
}

function showLoading(container, letterSequence) {
    stopWordFlash();
    container.innerHTML = "";
    container.classList.remove("has-words", "is-poster");

    const flash = document.createElement("div");
    flash.className = "word-flash";
    container.appendChild(flash);

    // 这一关走过的字母，在词库里对应的所有词，打乱后循环闪
    const letters = String(letterSequence || "").toLowerCase().split("").filter((l) => WORD_BANK[l]);
    const pool = letters.length
        ? shuffled(letters.flatMap((l) => WORD_BANK[l]))
        : shuffled(Object.values(WORD_BANK).flat()).slice(0, 12);

    let i = 0;
    const tick = () => {
        const word = document.createElement("span");
        word.className = "word-flash-item";
        word.textContent = pool[i % pool.length];
        flash.innerHTML = "";
        flash.appendChild(word);
        i++;
    };
    tick();
    wordFlashTimer = setInterval(tick, WORD_FLASH_MS);
}

function showAIResult(container, sentence, sequence, level = state.level) {
    stopWordFlash();
    stopLetterGame();
    container.innerHTML = "";
    container.classList.add("has-words", "is-poster");
    const poster = renderPoster(sentence, sequence, level);
    container.appendChild(poster);
    // 句子的样子先出来（首字母空着），等笔迹浮起来了，字母才挂到键盘上
    const token = rewardToken;
    rewardIntro.then(() => {
        if (currentScreen === "reward" && token === rewardToken && poster.isConnected) startLetterGame(poster, level);
    });
}

function showFallbackButton(container, sequence, errorMsg, run) {
    stopWordFlash();
    container.innerHTML = "";
    container.classList.remove("has-words", "is-poster");

    const wrapper = document.createElement("div");
    wrapper.className = "fallback-area";

    const hint = document.createElement("div");
    hint.className = "fallback-hint";
    hint.textContent = "💫 AI 暂时偷了个懒，但你可以——";
    wrapper.appendChild(hint);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kbtn kbtn-accent kbtn-sm btn-fallback";
    btn.textContent = "✨ 点我看看固定词库怎么说";
    btn.addEventListener("click", () => {
        const words = generateFixedWords(sequence);
        const sentence = "You are " + words.join(" · ");
        // 固定词库给的这句也收进终局的句子列表里
        if (run) run.sentence = sentence;
        showAIResult(container, sentence, sequence);
    });
    wrapper.appendChild(btn);

    if (errorMsg) {
        const debug = document.createElement("div");
        debug.className = "debug-info";
        debug.textContent = "🔍 错误: " + errorMsg;
        wrapper.appendChild(debug);
    }
    container.appendChild(wrapper);
}

// ============================================================
// 终局：一座塔
// 每一关的笔迹停在它自己那一层，位置就是当时在键盘上走过的那些键；
// 上一层的终点用一道弧线接到下一层的起点——整条线从底层一路盘到顶，一次都没断。
// 每一层画出来的时候，用那一关的乐器把它的旋律再弹一遍，十四件乐器轮一圈，最后落在"星河"上。
// ============================================================
const captionEl = $("chain-caption");
const finalHintEl = $("final-hint");
let finalLevels = [];

function showFinal() {
    state.finished = true;
    $("final-level-num").textContent = pad2(TOTAL_LEVELS);
    $("final-level-total").textContent = pad2(TOTAL_LEVELS);
    renderFinalMessage();
    showScreen("final");
}

// 第 i 层离底板多高（和 kb3d 里 buildTower 的默认 base / floorGap 一致）
function floorY(i) {
    return stage.keyTop("q", 0.62 + i * 0.62).y;
}

function finalView(topY) {
    return {
        region: REGIONS.board, yLo: -0.62, yHi: topY + 0.5, targetY: topY * 0.42,
        az: -24, el: 21, fov: 30, margin: 0.06,
    };
}

function sayFloor(text, color) {
    captionEl.textContent = text;
    captionEl.style.setProperty("--cap-dot", color);
    captionEl.classList.remove("flip");
    void captionEl.offsetWidth;
    captionEl.classList.add("flip", "on");
}

function setupFinal() {
    applyColorway(screenColorway());
    stage.resetKeys({ dim: 0.85 });
    clearLegends();
    stage.setPath([], { grow: false });
    stage.setInteractive((id) => id === "knob");
    stage.setOrbit(true, { auto: 0 });

    if (stage.tower) {
        // 从音乐模式回来：塔还在，接着转
        stage.setView(finalView(stage.towerTopY()));
        stage.setOrbit(true, { auto: reduceMotion ? 0 : 6 });
        stage.setTowerFlow(true);
        finalHintEl.classList.add("on");
        return;
    }
    finalLevels = [...state.runs.entries()].sort((a, b) => a[0] - b[0]);
    if (!finalLevels.length) return;
    // 跳过的关卡：这一层是一道虚影
    stage.buildTower(finalLevels.map(([lv, run]) => ({ ids: run.path, color: levelColorway(lv).glow, grad: levelColorway(lv).grad, ghost: !!run.skipped })));
    finalHintEl.classList.remove("on");
    captionEl.classList.remove("on", "flip");
    stage.setView(finalView(floorY(1)));

    let lit = null;
    stage.playTower({
        floorTime: 0.9,
        linkTime: 0.38,
        instant: reduceMotion,
        // 塔在后台也会接着盖完；但人已经切去音乐模式的话，镜头、键帽和声音都不能再动那一屏
        onFloor: (i) => {
            const [lv, run] = finalLevels[i];
            const cw = levelColorway(lv);
            sayFloor(`第 ${lv} 关 · ${cw.name}${run.skipped ? " · 跳过" : ""}`, cw.glow);
            if (currentScreen !== "final") return;
            // 这一层走过的键在键盘上亮成它自己的颜色：塔的每一层都是从键盘上"升"起来的
            if (lit) lit.forEach((id) => stage.setKey(id, { glow: 0, glowColor: null, dim: 0.85 }));
            run.path.forEach((id) => stage.setKey(id, { glow: 0.9, glowColor: cw.glow, dim: 0.35 }));
            lit = run.path;
            if (!reduceMotion) {
                stage.setView(finalView(floorY(i) + 0.9)); // 镜头跟着塔往上退
                floorMotif(lv, run.path);
            }
        },
        onDone: () => {
            sayFloor(`${finalLevels.length} 关 · 一笔到底`, COLORWAYS.poxiao.glow);
            finalHintEl.classList.add("on");
            if (stage.tower) stage.tower.floors.forEach((f, i) => setTimeout(() => { f.path.pulse = 1; }, i * 70));
            if (currentScreen !== "final") return;
            if (lit) lit.forEach((id) => stage.setKey(id, { glow: 0, glowColor: null, dim: 0.85 }));
            stage.setView(finalView(stage.towerTopY()));
            finaleChord();
            launchCelebration(finalLevels.map(([lv]) => levelColorway(lv).glow), { rockets: 5 });
            stage.setOrbit(true, { auto: reduceMotion ? 0 : 6 });
            // 塔盖好了：每一层都有一颗光点顺着那一关的路慢慢走
            stage.setTowerFlow(true);
        },
    });
}

// 每一层：这一关的乐器，把它那条路的旋律压缩成六个音再弹一遍
function floorMotif(level, path) {
    if (currentScreen !== "final") return;
    const snd = levelSoundFor(level);
    const n = path.length;
    const m = Math.min(6, n);
    for (let k = 0; k < m; k++) {
        const step = m > 1 ? Math.round((k * (n - 1)) / (m - 1)) : 0;
        audio.play(snd.patch, stepFreqOf(snd, step, n), { when: k * 0.13, velocity: 0.72, pan: panOf(path[step]) });
    }
}

// 收尾：钢琴铺开一个 C 大九和弦，极光在上面再亮三下
function finaleChord() {
    const low = [65.41, 130.81, 196.0, 261.63, 329.63, 392.0, 587.33, 659.25];
    low.forEach((f, i) => {
        audio.play("piano", f, { when: i * 0.04, velocity: 0.8, length: 1.3, pan: (i / (low.length - 1) - 0.5) * 0.9 });
    });
    [523.25, 659.25, 783.99].forEach((f, i) => {
        audio.play("aurora", f, { when: 0.45 + i * 0.16, velocity: 0.5, length: 1.1, pan: (i - 1) * 0.5 });
    });
}

function renderFinalMessage() {
    const el = $("final-message");
    el.innerHTML = "";
    el.classList.add("has-words");
    const items = [...state.runs.entries()].sort((a, b) => a[0] - b[0]).filter(([, run]) => run.sentence);

    const lead = document.createElement("p");
    lead.className = "reward-lead";
    lead.textContent = items.length ? `📖 你的 ${items.length} 句话——` : "这一局 AI 一句话都没写出来，但塔已经立起来了。";
    el.appendChild(lead);

    const list = document.createElement("div");
    list.className = "final-sentence-list";
    items.forEach(([lv, run], i) => {
        const cw = levelColorway(lv);
        const line = document.createElement("div");
        line.className = "final-sentence-line";
        line.style.animationDelay = i * 0.3 + "s";

        const dot = document.createElement("span");
        dot.className = "final-sentence-dot";
        dot.style.setProperty("--dot", cw.glow);

        const text = document.createElement("p");
        text.className = "final-sentence-text";
        // 和过关时那张海报一样：每个词的首字母拎出来
        run.sentence.split(/\s+/).filter(Boolean).forEach((word) => {
            const m = /^([^A-Za-z]*)([A-Za-z])(.*)$/.exec(word);
            const w = document.createElement("span");
            if (m) {
                w.appendChild(document.createTextNode(m[1]));
                const ini = document.createElement("span");
                ini.className = "fs-i";
                ini.textContent = m[2];
                w.appendChild(ini);
                w.appendChild(document.createTextNode(m[3]));
            } else {
                w.textContent = word;
            }
            text.appendChild(w);
            text.appendChild(document.createTextNode(" "));
        });

        const note = document.createElement("span");
        note.className = "final-sentence-note";
        note.textContent = `第 ${lv} 关 · ${cw.name} · 字母: ${run.letters.toUpperCase().split("").join(" ")}`;

        line.append(dot, text, note);
        list.appendChild(line);
    });
    el.appendChild(list);
}

function restartGame() {
    stage.clearTower();
    state.runs.clear();
    state.finished = false;
    resumeScreen = null;
    captionEl.classList.remove("on", "flip");
    finalHintEl.classList.remove("on");
    startLevel(1);
}

// ============================================================
// 音乐模式：同一块键盘，脱离关卡限制，纯当乐器 + 一个小曲库
// 四排琴键：列决定音级（越往右越高），行决定八度（越往上越高），A 那一排是中央八度。
//   F1–F12       当前这一组的十二件乐器；Caps Lock 在 A / B 两组之间切换（二十四件）
//   ← →  或 - =  降调 / 升调（半音）；↑ ↓ 高八度 / 低八度
//   ⇧ / ⌥        临时升 / 降半音；空格 延音踏板，Enter 是它的开关
// 键盘上铺的是"1 2 3 4 5 6 7"——首调唱名。换调只改实际音高，谱子一个字都不用改。
// ============================================================
const MUSIC_ROOT = 261.63; // C4：A 那一排的 1 在原调时就是它
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DEGREES = ["1", "2", "3", "4", "5", "6", "7"];
const KEY_NAMES = ["C", "♭D", "D", "♭E", "E", "F", "♯F", "G", "♭A", "A", "♭B", "B"];
const KEY_MIN = -6;
const KEY_MAX = 6;
const keyName = (k) => "1=" + KEY_NAMES[((k % 12) + 12) % 12];

// 曲谱记法（简谱）：
//   1–7  音级       0 休止
//   ^    高八度（可叠）   _  低八度（可叠）
//   -    把前一个音延长一拍（和简谱一样）
//   /    时值减半（可叠）：5/ 是半拍，5// 是四分之一拍
//   .    附点，时值 ×1.5（写在 / 后面）：5. 是一拍半，5/. 是三个十六分
//   # b  升/降半音，写在数字前（八度记号之后）：#4、b7、^#5、_b3
//   |    小节线，只用来断行
//   ( )  圆滑线：括号里的音连着唱/奏，中间不断：(5 3/)
//   ~    延音线：两个同样的音连成一个长音（跨小节也行）：3/ ~ 3
//   { }  三连音：括号里的音按三分之二的时值走：{1 2 3}
const SONGS = [
    {
        name: "小星星",
        bpm: 112,
        score:
            "1 1 5 5 6 6 5 - | 4 4 3 3 2 2 1 - | " +
            "5 5 4 4 3 3 2 - | 5 5 4 4 3 3 2 - | " +
            "1 1 5 5 6 6 5 - | 4 4 3 3 2 2 1 -",
    },
    {
        name: "欢乐颂",
        bpm: 120,
        score:
            "3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3 - 2 - | " +
            "3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2 - 1 -",
    },
    {
        name: "生日快乐",
        bpm: 104,
        score:
            "5/ 5/ 6 5 ^1 7 - | 5/ 5/ 6 5 ^2 ^1 - | " +
            "5/ 5/ ^5 ^3 ^1 7 6 | ^4/ ^4/ ^3 ^1 ^2 ^1 -",
    },
    {
        name: "两只老虎",
        bpm: 120,
        score: "1 2 3 1 | 1 2 3 1 | 3 4 5 - | 3 4 5 -",
    },
    {
        // 久石让《君をのせて》主题，按 1=C 记。整段是 A 段原样重复两遍再收尾，
        // 全曲都是二分音符和全音符，慢，正好用来体会"按住不放能延音"。
        name: "天空之城",
        bpm: 76,
        tip: "全是长音，按住别松；起手在 N M 两个低音键上",
        score:
            "0 0 _6 _7 | 1 - - _7 | 1 - 3 - | _7 - - - | 0 - _3 _3 | " +
            "_6 - - _5 | _6 - 1 - | 3 - - - | 0 - 3 4 | " +
            "_7 - - 3 | _7 - _6 - | _6 - - - | 0 - _6 _7 | " +
            "1 - - _7 | 1 - 3 - | _7 - - - | 0 - _3 _3 | " +
            "_6 - - _5 | _6 - 1 - | 3 - - - | 0 - 3 4 | " +
            "_7 - - 3 | _7 - _6 - | 1 - - -",
    },
    {
        name: "茉莉花",
        bpm: 100,
        score: "3 3 5 6 | ^1 ^1 6 - | 5 6 5 3 | 5 - - -",
    },
    {
        name: "友谊地久天长",
        bpm: 96,
        score: "_5 | 1 - 1 1 | 3 - 2 1 | 2 - 3 - | 1 - - -",
    },
];

let musicPatch = store.get("mss-instrument");
if (!INSTRUMENTS[musicPatch]) musicPatch = "piano";
let musicBank = INSTRUMENT_BANKS[1].includes(musicPatch) ? 1 : 0;
let musicKey = 0;    // 调：相对 C 的半音数，-6 … +6
let musicOctave = 0; // 八度：-2 … +2

// 键盘上 1–7 对应的音程：平时是大调；"情绪"选了别的就换成那个调式（悲伤 = 自然小调……）
const musicMode = () => (MOODS[style.mood] && MOODS[style.mood].mode) || MAJOR;

// 和首页同一条规则：列决定音级，行决定八度
function musicIndexOf(id) {
    const pos = CELL[id];
    if (!pos) return null;
    return (GRID.length - 1 - pos.row) * 7 + pos.col;
}

// alter：+1 升半音、-1 降半音、0 本位
function musicSemitone(idx, alter) {
    const s = musicMode();
    return s[idx % 7] + 12 * Math.floor(idx / 7) + (alter || 0);
}

function musicFreqOf(idx, alter) {
    const semitone = musicSemitone(idx, alter) + musicKey + 12 * musicOctave;
    return (MUSIC_ROOT / 2) * Math.pow(2, semitone / 12);
}

const ALTER_SIGN = { "-1": "b", "0": "", "1": "#" };

// Mac 键帽上不印 "Alt"，印的是 Option ⌥——同一个物理键，浏览器里同样是 e.altKey，
// 但提示文案得按用户面前的键盘来写，不然照着找不到。
const IS_MAC = /Mac|iPhone|iPad|iPod/i.test(
    (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ""
);
const ALT_LABEL = IS_MAC ? "Option ⌥" : "Alt";

// 一个音高可能落在两个键上（相邻两排重叠三个音）。
// 优先取 A 那一排：曲子基本都在中央那个八度，落在 ASDFGHJKL 上手最顺；其次上一排、再下一排、最后数字排。
function musicKeyOf(idx) {
    for (const r of [2, 1, 3, 0]) {
        const col = idx - (GRID.length - 1 - r) * 7;
        if (col >= 0 && col < GRID[r].length) return GRID[r][col];
    }
    return null;
}

// ---------------- 读谱 ----------------
const NOTE_RE = /^([_^]*)([#b]?)([0-7])(\/*)(\.*)$/;

// 一个词可以带前缀 ( {、后缀 ) } ~：(5  3/)  5~  {1  3}
function tokenizeScore(text) {
    const out = [];
    text.split(/\s+/).filter(Boolean).forEach((raw) => {
        let t = raw;
        const pre = [];
        const post = [];
        while (t && (t[0] === "(" || t[0] === "{")) {
            pre.push(t[0]);
            t = t.slice(1);
        }
        while (t && /[)}~]$/.test(t)) {
            post.unshift(t[t.length - 1]);
            t = t.slice(0, -1);
        }
        out.push({ raw, core: t, pre, post });
    });
    return out;
}

function parseScore(text) {
    const notes = [];
    let slurDepth = 0;
    let slurId = 0;
    let curSlur = 0;
    let pendingSlur = 0;
    let pendingTriplet = false;
    let triplet = false;
    let tieNext = false;
    const last = () => notes[notes.length - 1];

    tokenizeScore(text).forEach(({ core, pre, post }) => {
        pre.forEach((c) => {
            if (c === "(") pendingSlur += 1;
            else pendingTriplet = true;
        });
        if (core === "|") {
            if (last()) last().bar = true;
        } else if (core === "-") {
            if (last()) last().beats += 1;
        } else if (core) {
            const m = NOTE_RE.exec(core);
            if (m) {
                let octave = 1; // 1 = 中央那个八度
                for (const ch of m[1]) octave += ch === "^" ? 1 : -1;
                const alter = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
                let beats = 1;
                for (let i = 0; i < m[4].length; i++) beats /= 2;
                for (let i = 0; i < m[5].length; i++) beats *= 1.5;
                const n = m[3] === "0"
                    ? { rest: true, beats }
                    : { idx: octave * 7 + DEGREES.indexOf(m[3]), alter, beats, key: null, degree: m[1] + m[2] + m[3] };
                if (pendingTriplet) {
                    triplet = true;
                    pendingTriplet = false;
                    n.tpStart = true;
                }
                if (triplet) {
                    n.beats *= 2 / 3;
                    n.triplet = true;
                }
                if (pendingSlur) {
                    slurDepth += pendingSlur;
                    pendingSlur = 0;
                    curSlur = ++slurId;
                    n.slurStart = true;
                }
                if (slurDepth > 0) n.slur = curSlur;
                const prev = last();
                if (tieNext && prev && !prev.rest && !n.rest) {
                    // 同一个音才是延音线；不同的音连起来，按圆滑线处理（连着奏，不断开）
                    if (prev.idx === n.idx && (prev.alter || 0) === (n.alter || 0)) {
                        prev.tieNext = true;
                        n.tiePrev = true;
                    } else {
                        n.legatoFromPrev = true;
                    }
                }
                tieNext = false;
                notes.push(n);
            }
        }
        post.forEach((c) => {
            const l = last();
            if (c === "~") tieNext = true;
            else if (c === ")") {
                if (slurDepth > 0) {
                    slurDepth -= 1;
                    if (l) l.slurEnd = true;
                }
            } else if (c === "}") {
                if (triplet) {
                    triplet = false;
                    if (l) l.tpEnd = true;
                }
            }
        });
    });
    notes.forEach((n) => {
        if (!n.rest) n.key = musicKeyOf(n.idx);
    });
    return notes;
}

// 真正要"按下去"的音：连在延音线上的几个音合成一个；圆滑线里的音标上 legato（前一个音一直响到后一个音）
function buildEvents(notes) {
    const events = [];
    let t = 0;
    notes.forEach((n, i) => {
        const start = t;
        t += n.beats;
        if (n.rest) return;
        const prev = events[events.length - 1];
        if (n.tiePrev && prev && prev.last === i - 1) {
            prev.beats += n.beats;
            prev.last = i;
            prev.indices.push(i);
            // 延音线的后半个音正好是一条圆滑线的开头：这个长音也算在圆滑线里
            if (n.slur) prev.slur = n.slur;
            return;
        }
        events.push({
            idx: n.idx, alter: n.alter || 0, key: n.key, start, beats: n.beats,
            first: i, last: i, indices: [i], slur: n.slur || 0, legato: false,
        });
    });
    for (let k = 0; k < events.length - 1; k++) {
        const a = events[k];
        const b = events[k + 1];
        if ((a.slur && a.slur === b.slur) || notes[b.first].legatoFromPrev) a.legato = true;
    }
    return { events, total: t };
}

// 编辑器用：parseScore 遇到不认识的词是静默跳过的，这里反过来——写错了要立刻说是哪个词
function checkScore(text) {
    const bad = [];
    const bars = [];
    let cur = 0;
    let count = 0;
    let slur = 0;
    let tp = 0;
    let unbalanced = false;
    tokenizeScore(text).forEach(({ core, pre, post }) => {
        pre.forEach((c) => {
            if (c === "(") slur += 1;
            else tp += 1;
        });
        if (core === "|") {
            bars.push(cur);
            cur = 0;
        } else if (core === "-") {
            cur += 1;
        } else if (core) {
            const m = NOTE_RE.exec(core);
            if (!m) {
                if (bad.length < 4 && !bad.includes(core)) bad.push(core);
            } else {
                let b = 1;
                for (let i = 0; i < m[4].length; i++) b /= 2;
                for (let i = 0; i < m[5].length; i++) b *= 1.5;
                cur += tp > 0 ? (b * 2) / 3 : b;
                if (m[3] !== "0") count++;
            }
        }
        post.forEach((c) => {
            if (c === ")") {
                if (slur > 0) slur -= 1;
                else unbalanced = true;
            } else if (c === "}") {
                if (tp > 0) tp -= 1;
                else unbalanced = true;
            }
        });
    });
    if (slur !== 0 || tp !== 0) unbalanced = true;
    // 最后一段只在还有内容、或者全篇一个 "|" 都没写时才算一小节——
    // 谱面写成 "1 2 3 4 |" 收尾很常见，不然这个空尾巴会把小节数多报一个
    if (cur > 0 || bars.length === 0) bars.push(cur);
    const notes = parseScore(text);
    const ties = notes.filter((n) => n.tiePrev).length;
    const oddTies = notes.filter((n) => n.legatoFromPrev).length;
    return { bad, bars, count, unbalanced, ties, oddTies, notes };
}

// ---------- 音乐模式的界面 ----------
const instRowEl = $("inst-row");
const songListEl = $("song-list");
const scoreNotesEl = $("score-notes");
const scoreNameEl = $("score-name");
const scoreHintEl = $("score-hint");
const scorePlayBtn = $("btn-score-play");
const scoreFollowBtn = $("btn-score-follow");
const scoreEditBtn = $("btn-score-edit");
const editorEl = $("score-editor");
const edNameEl = $("ed-name");
const edKeyEl = $("ed-key");
const edBpmEl = $("ed-bpm");
const edScoreEl = $("ed-score");
const edStatusEl = $("ed-status");
const edSaveBtn = $("btn-ed-save");
const edRevertBtn = $("btn-ed-revert");
const edDeleteBtn = $("btn-ed-delete");

let musicReturnTo = "home";
let currentSong = null;
let currentNotes = [];
let currentEvents = [];
let playTimers = [];
let playVoices = new Set();
let followMode = false;
let followPos = 0;

// 音乐模式里能点的功能键：Esc 返回、F1–F12 换乐器、Caps 换组、方向键升降调 / 八度、
// ⇧ / ⌥ 升降号、空格 / Enter 踏板、旋钮音量
const MUSIC_KEYS = new Set(["knob", "esc", "caps", "shift-l", "shift-r", "opt-l", "space", "enter", "left", "right", "up", "down"]);
for (let i = 1; i <= 12; i++) MUSIC_KEYS.add("f" + i);

// 手机上整块键盘太小：只框四排琴键 + 左下角的 ⇧ ⌥ 和空格（升降号、踏板都在这里），
// F 键换乐器、方向键升降调的活交给上面的按钮
const MUSIC_NARROW_REGION = { x0: -0.1, x1: 12.5, z0: 1.05, z1: 6.35 };

function musicView() {
    if (window.innerWidth < 600) return { region: MUSIC_NARROW_REGION, az: 0, el: 60, fov: 30, margin: 0.02 };
    return { region: REGIONS.board, az: 0, el: 50, fov: 30, margin: 0.02 };
}

function setupMusic() {
    applyColorway(screenColorway());
    stage.resetKeys();
    clearLegends();
    stage.setPath([], { grow: false });
    stage.setView(musicView());
    stage.setInteractive((id) => MUSIC_KEYS.has(id) || !!CELL[id]);
    // 用不上的键压暗，注意力留给琴键和那几颗功能键
    stage.keys.forEach((k, id) => {
        if (!CELL[id] && !MUSIC_KEYS.has(id)) stage.setKey(id, { dim: 0.55 });
    });
    legend("esc", { main: "esc", sub: "返回" });
    legend("shift-l", { main: "⇧", sub: "升 #" });
    legend("shift-r", { main: "⇧", sub: "升 #" });
    legend("opt-l", { main: "⌥", sub: "降 b" });
    legend("enter", { main: "enter", sub: "踏板锁" });
    legend("space", { main: "SUSTAIN" });
    legend("left", { main: "←", sub: "降调" });
    legend("right", { main: "→", sub: "升调" });
    legend("up", { main: "↑", sub: "高八度" });
    legend("down", { main: "↓", sub: "低八度" });
    syncBankKeys();
    refreshMusicKeyboard();
    syncInstrumentKeys();
    syncModifierUI();
    syncKeyUI();
    if (followMode) highlightNext();
}

// 键帽右上角临时挂的升降号：试听时这个音带升降、跟弹时下一个音要按修饰键
const keyMark = {};

function musicLegendFor(id) {
    const idx = musicIndexOf(id);
    const oct = Math.floor(idx / 7);
    // 八度记号和谱面写法一样：_ 低八度、^ 高八度
    const marks = oct === 0 ? "_" : "^".repeat(Math.max(0, oct - 1));
    const d = { sub: marks + ALTER_SIGN[String(musicAlter)] + DEGREES[idx % 7] };
    if (keyMark[id]) {
        d.mark = keyMark[id];
        d.markColor = colorway.accent;
    }
    return d;
}

function updateMusicLegend(id) {
    if (currentScreen === "music" && CELL[id]) legend(id, musicLegendFor(id));
}

// 按住 Shift / Option 的时候整块键盘的音级标签跟着变成 #x / bx，手还没落下就能看见自己要弹的是哪个音
function refreshMusicKeyboard() {
    if (currentScreen !== "music") return;
    GRID_IDS.forEach((id) => {
        legend(id, musicLegendFor(id));
        const idx = musicIndexOf(id);
        // 中央八度透一点底光：曲子基本都落在这一排。同音的两个键只标谱面实际会用的那个
        stage.setKey(id, { glow: Math.floor(idx / 7) === 1 && musicKeyOf(idx) === id ? 0.14 : 0 });
    });
}

function syncInstrumentKeys() {
    if (currentScreen !== "music") return;
    INSTRUMENT_BANKS[musicBank].forEach((inst, i) => {
        const on = inst === musicPatch;
        stage.setKey("f" + (i + 1), { glow: on ? 1 : 0, emissive: on ? 0.5 : 0, lift: on ? -0.07 : 0, legendGlow: on ? 0.4 : 0 });
    });
}

function syncBankKeys() {
    if (currentScreen !== "music") return;
    INSTRUMENT_BANKS[musicBank].forEach((inst, i) => legend("f" + (i + 1), { main: "F" + (i + 1), sub: INSTRUMENTS[inst].name }));
    legend("caps", { main: "caps", sub: musicBank ? "B 组 ●" : "A 组" });
    stage.setKey("caps", { lift: musicBank ? -0.09 : 0, glow: musicBank ? 0.8 : 0, emissive: musicBank ? 0.5 : 0 });
}

// 修饰键的状态画在 3D 键帽上：按着 / 生效时发光；屏幕上锁住的，键帽停在半沉的位置，像一颗自锁开关
function syncModifierUI() {
    if (!stage) return;
    const inMusic = currentScreen === "music";
    if (!inMusic && currentScreen !== "home") return;
    stage.setKey("space", { emissive: pedalDown ? 0.85 : 0, lift: latchedPedal ? -0.09 : 0 });
    if (!inMusic) return;
    stage.setKey("space", { glow: pedalDown ? 0.9 : 0 });
    stage.setKey("enter", { emissive: latchedPedal ? 0.6 : 0, glow: latchedPedal ? 0.7 : 0, lift: latchedPedal ? -0.09 : 0 });
    ["shift-l", "shift-r"].forEach((id) => stage.setKey(id, {
        emissive: musicAlter > 0 ? 0.85 : 0, glow: musicAlter > 0 ? 0.9 : 0, lift: latchedAlter > 0 ? -0.09 : 0,
    }));
    stage.setKey("opt-l", {
        emissive: musicAlter < 0 ? 0.85 : 0, glow: musicAlter < 0 ? 0.9 : 0, lift: latchedAlter < 0 ? -0.09 : 0,
    });
}

// ---------- 升降号：按住 Shift 升半音、按住 Option / Alt 降半音 ----------
let musicAlter = 0;          // 生效值 = 物理按住 || 屏幕锁存
let physicalAlter = 0;       // 按住 Shift / Option 的实时状态
let latchedAlter = 0;        // 屏幕上点亮锁住的
const musicKeyAlter = {};    // 每个正在响的键，按下那一刻用的升降（松手前不再改）

function syncMusicAlter(e) {
    // 两个都按住时以升为准，不做双重升降
    physicalAlter = e.shiftKey ? 1 : e.altKey ? -1 : 0;
    applyAlter();
}

function applyAlter() {
    const next = physicalAlter || latchedAlter;
    if (next !== musicAlter) {
        musicAlter = next;
        refreshMusicKeyboard();
        if (followMode) highlightNext(); // 跟弹时提示的目标键也跟着变
    }
    syncModifierUI();
}

// ---------- 调和八度 ----------
function setMusicKey(k, { announce = false } = {}) {
    musicKey = Math.max(KEY_MIN, Math.min(KEY_MAX, k));
    syncKeyUI();
    if (announce && currentScreen === "music") {
        // 换调就把 do mi sol 弹一下，耳朵马上知道新的"1"在哪
        [7, 9, 11].forEach((idx, i) => audio.play(musicPatch, musicFreqOf(idx, 0), { when: i * 0.07, velocity: 0.55, length: 0.6 }));
        stage.ripple("a", { strength: 0.8 });
    }
}

function setMusicOctave(o, { announce = false } = {}) {
    musicOctave = Math.max(-2, Math.min(2, o));
    syncKeyUI();
    if (announce && currentScreen === "music") {
        audio.play(musicPatch, musicFreqOf(7, 0), { velocity: 0.6, length: 0.6 });
        stage.ripple(musicOctave >= 0 ? "q" : "z", { strength: 0.8 });
    }
}

function syncKeyUI() {
    $("key-name").textContent = keyName(musicKey);
    const mood = MOODS[style.mood];
    $("key-mode").textContent = mood && mood.mode ? mood.modeName : "大调";
    $("oct-name").textContent = (musicOctave > 0 ? "+" : "") + musicOctave;
    $("key-down").disabled = musicKey <= KEY_MIN;
    $("key-up").disabled = musicKey >= KEY_MAX;
    $("oct-down").disabled = musicOctave <= -2;
    $("oct-up").disabled = musicOctave >= 2;
    if (currentScreen === "music") {
        stage.setKey("left", { glow: musicKey < 0 ? 0.6 : 0 });
        stage.setKey("right", { glow: musicKey > 0 ? 0.6 : 0 });
        stage.setKey("up", { glow: musicOctave > 0 ? 0.6 : 0 });
        stage.setKey("down", { glow: musicOctave < 0 ? 0.6 : 0 });
    }
}

// ---------- 乐器 ----------
function buildInstRow() {
    instRowEl.innerHTML = "";
    INSTRUMENT_BANKS[musicBank].forEach((id, i) => {
        const inst = INSTRUMENTS[id];
        const cw = COLORWAYS[inst.colorway];
        const b = document.createElement("button");
        b.type = "button";
        b.className = "inst-chip";
        b.dataset.inst = id;
        b.style.setProperty("--chip", cw.alpha);
        b.style.setProperty("--chip-ink", cw.alphaLegend);
        b.setAttribute("aria-pressed", String(id === musicPatch));
        b.classList.toggle("on", id === musicPatch);
        b.title = `${inst.name} · ${inst.en}（F${i + 1}）`;
        b.innerHTML = `<span class="inst-f">F${i + 1}</span><span class="inst-name">${inst.name}</span><span class="inst-fam">${inst.family}</span>`;
        b.addEventListener("click", () => setInstrument(id, { preview: true }));
        instRowEl.appendChild(b);
    });
    document.querySelectorAll("#inst-bank .bank-btn").forEach((b) => {
        const on = Number(b.dataset.bank) === musicBank;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
    });
}

function setBank(bank) {
    musicBank = bank ? 1 : 0;
    buildInstRow();
    syncBankKeys();
    syncInstrumentKeys();
}

function setInstrument(id, { preview = false } = {}) {
    if (!INSTRUMENTS[id]) return;
    musicPatch = id;
    store.set("mss-instrument", id);
    const bank = INSTRUMENT_BANKS[1].includes(id) ? 1 : 0;
    if (bank !== musicBank) setBank(bank);
    const inst = INSTRUMENTS[id];
    $("music-inst").textContent = inst.name;
    $("music-inst-en").textContent = inst.en;
    instRowEl.querySelectorAll(".inst-chip").forEach((b) => {
        const on = b.dataset.inst === id;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
        // 用键盘 F 键换乐器时，把那颗按钮横向滚进视野（只滚这一排，不动整页）
        if (on && preview) {
            const r = b.getBoundingClientRect();
            const rr = instRowEl.getBoundingClientRect();
            if (r.left < rr.left || r.right > rr.right) {
                instRowEl.scrollBy({ left: r.left + r.width / 2 - (rr.left + rr.width / 2), behavior: reduceMotion ? "auto" : "smooth" });
            }
        }
    });
    if (currentScreen === "music") {
        // 换乐器 = 换一套键帽：钢琴是黑白，星火是深色透光……（选了场景的话场景优先）
        applyColorway(screenColorway());
        syncInstrumentKeys();
        refreshMusicKeyboard();
        syncModifierUI();
    }
    if (preview) {
        // 换上就先听一声：do mi sol do 往上一跳
        [0, 2, 4, 7].forEach((d, i) => audio.play(id, musicFreqOf(7 + d, 0), { when: i * 0.085, velocity: 0.7 }));
        stage.ripple("f", { strength: 0.7 });
    }
}

// ---------- 曲库 ----------
// 内置的 SONGS 只读，自编的存 localStorage，两边拼起来才是完整曲库
const CUSTOM_SONGS_KEY = "mss-custom-songs";

function loadCustomSongs() {
    try {
        const raw = JSON.parse(store.get(CUSTOM_SONGS_KEY));
        if (!Array.isArray(raw)) return [];
        // 存久了格式可能对不上（改过记法、手动编辑过），逐条挑干净的
        return raw
            .filter((s) => s && typeof s.name === "string" && typeof s.score === "string")
            .map((s) => ({
                name: s.name.slice(0, 24),
                key: Number.isFinite(+s.key) ? Math.max(KEY_MIN, Math.min(KEY_MAX, +s.key)) : 0,
                octave: Number.isFinite(+s.octave) ? Math.max(-2, Math.min(2, +s.octave)) : 0,
                bpm: Number.isFinite(+s.bpm) ? Math.min(240, Math.max(30, +s.bpm)) : 100,
                score: s.score,
                custom: true,
            }));
    } catch (err) {
        return [];
    }
}

let customSongs = loadCustomSongs();

function persistCustomSongs() {
    return store.set(CUSTOM_SONGS_KEY, JSON.stringify(customSongs));
}

const allSongs = () => SONGS.concat(customSongs);

function renderSongList() {
    songListEl.innerHTML = "";
    allSongs().forEach((song) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "song-chip";
        b.classList.toggle("on", currentSong === song);
        b.classList.toggle("is-custom", !!song.custom);
        const tag = song.custom ? "自编" : keyName(song.key || 0);
        b.innerHTML =
            `<span class="song-name">${escapeText(song.name)}</span>` +
            `<span class="song-tag">${escapeText(tag)}</span>`;
        b.addEventListener("click", () => selectSong(song));
        songListEl.appendChild(b);
    });
}

// 曲名是用户输入的，进 innerHTML 前必须转义
function escapeText(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
}

function loadNotes(text) {
    currentNotes = parseScore(text);
    currentEvents = buildEvents(currentNotes).events;
}

function selectSong(song) {
    stopPlayback();
    setFollow(false);
    currentSong = song;
    if (!song) {
        currentNotes = [];
        currentEvents = [];
        scoreNameEl.textContent = "选一首曲子";
        scoreHintEl.textContent =
            "下面挑一首，或者直接敲键盘随便弹（F1–F12 换乐器，Caps Lock 换组；← → 升降调，↑ ↓ 换八度；" +
            `空格踩延音踏板、Enter 是它的开关；Shift+键 升半音、${ALT_LABEL}+键 降半音）`;
        scoreNotesEl.innerHTML = "";
        scorePlayBtn.disabled = true;
        scoreFollowBtn.disabled = true;
        renderSongList();
        // 编辑器开着时也要跟着清空，不然表单里留着旧曲子，点保存会把旧内容当新曲子存进去
        if (editorOpen) fillEditor(null);
        return;
    }
    // 曲子自己是什么调就切到什么调（谱子都是按首调写的）
    setMusicKey(song.key || 0);
    setMusicOctave(song.octave || 0);
    loadNotes(song.score);
    scoreNameEl.textContent = song.name;
    const ties = currentNotes.some((n) => n.tiePrev);
    scoreHintEl.textContent =
        `${keyName(song.key || 0)} · ♩=${song.bpm || 100} · 按顺序敲下面这串键就是这首曲子` +
        (song.tip ? ` · ${song.tip}` : ties ? " · 延音线连着的同音只按一次、按住别松" : "");
    scorePlayBtn.disabled = false;
    scoreFollowBtn.disabled = false;
    renderScore();
    renderSongList();
    if (editorOpen) fillEditor(song);
}

// ---------- 乐谱编辑器 ----------
let editorOpen = false;

function buildKeySelect() {
    edKeyEl.innerHTML = "";
    for (let k = KEY_MIN; k <= KEY_MAX; k++) {
        const o = document.createElement("option");
        o.value = String(k);
        o.textContent = keyName(k) + (k === 0 ? "（原调）" : k > 0 ? `（升 ${k}）` : `（降 ${-k}）`);
        edKeyEl.appendChild(o);
    }
}

function fillEditor(song) {
    edNameEl.value = song ? song.name : "";
    edKeyEl.value = String(song ? song.key || 0 : musicKey);
    edBpmEl.value = song ? song.bpm || 100 : 100;
    edScoreEl.value = song ? song.score : "";
    edDeleteBtn.hidden = !(song && song.custom);
    refreshEditor();
}

// 编辑中试听/跟弹都走草稿，不用先保存
function refreshEditor() {
    const k = parseInt(edKeyEl.value, 10) || 0;
    if (k !== musicKey) setMusicKey(k);
    const text = edScoreEl.value;
    const { bad, bars, count, unbalanced, ties, oddTies } = checkScore(text);
    loadNotes(text);
    renderScore();
    scorePlayBtn.disabled = !count;
    scoreFollowBtn.disabled = !count;

    const offBars = bars
        .map((b, i) => [i + 1, b])
        .filter(([, b]) => b > 0 && Math.abs(b - Math.round(b)) > 1e-6);
    const outOfRange = currentNotes.filter((n) => !n.rest && !n.key).length;

    const parts = [`${count} 个音`];
    if (bars.length > 1) parts.push(`${bars.length} 小节`);
    if (ties) parts.push(`${ties} 处延音线`);
    if (bad.length) parts.push(`⚠ 看不懂：${bad.join("、")}`);
    if (outOfRange) parts.push(`⚠ ${outOfRange} 个音超出键盘范围`);
    if (unbalanced) parts.push("⚠ 括号没有配对");
    if (oddTies) parts.push(`${oddTies} 处 ~ 两边不是同一个音，按圆滑线处理`);
    if (offBars.length) parts.push(`小节拍数不是整数：第 ${offBars.map((x) => x[0]).join("、")} 小节`);
    edStatusEl.textContent = parts.join(" · ");
    edStatusEl.classList.toggle("is-bad", bad.length > 0 || outOfRange > 0 || unbalanced);
}

// 连音工具：选中几个音点"圆滑线"就在两边包上 ( )；"三连音"包 { }；"延音线"在光标处插一个 ~
function applyEdTool(tool) {
    const el = edScoreEl;
    const v = el.value;
    let s = el.selectionStart;
    let e = el.selectionEnd;
    if (tool === "tie") {
        const ins = (s > 0 && v[s - 1] !== " " ? " " : "") + "~ ";
        el.value = v.slice(0, s) + ins + v.slice(e);
        el.selectionStart = el.selectionEnd = s + ins.length;
    } else {
        const [open, close] = tool === "slur" ? ["(", ")"] : ["{", "}"];
        // 没选中就包住光标所在的那个词
        if (s === e) {
            while (s > 0 && !/\s/.test(v[s - 1])) s--;
            while (e < v.length && !/\s/.test(v[e])) e++;
        }
        // 两头的空白不包进去
        while (s < e && /\s/.test(v[s])) s++;
        while (e > s && /\s/.test(v[e - 1])) e--;
        if (s === e) {
            edStatusEl.textContent = tool === "slur" ? "先选中要连起来的几个音，再点「圆滑线」" : "先选中三个音，再点「三连音」";
            edStatusEl.classList.add("is-bad");
            return;
        }
        el.value = v.slice(0, s) + open + v.slice(s, e) + close + v.slice(e);
        el.selectionStart = s;
        el.selectionEnd = e + 2;
    }
    el.focus();
    refreshEditor();
}

function setEditorOpen(on) {
    editorOpen = on;
    editorEl.hidden = !on;
    scoreEditBtn.classList.toggle("on", on);
    scoreEditBtn.textContent = on ? "✕ 收起" : "✎ 编辑";
    if (on) {
        stopPlayback();
        setFollow(false);
        fillEditor(currentSong);
    } else {
        selectSong(currentSong); // 丢掉未保存的草稿，回到已存的版本
    }
}

function saveDraft() {
    const name = edNameEl.value.trim().slice(0, 24);
    if (!name) {
        edStatusEl.textContent = "⚠ 先起个曲名";
        edStatusEl.classList.add("is-bad");
        edNameEl.focus();
        return;
    }
    // 撞上内置曲子的名字会存成两条同名 chip，分不清哪个是哪个。
    // 只挡新建的情况——已经存在的同名自编曲子照样能覆盖保存
    if (SONGS.some((s) => s.name === name) && !customSongs.some((s) => s.name === name)) {
        edStatusEl.textContent = `⚠ 「${name}」和内置曲子撞名了，换一个名字再存`;
        edStatusEl.classList.add("is-bad");
        edNameEl.focus();
        return;
    }
    const { count } = checkScore(edScoreEl.value);
    if (!count) {
        edStatusEl.textContent = "⚠ 谱面是空的，没有可保存的音";
        edStatusEl.classList.add("is-bad");
        return;
    }
    const old = customSongs.find((s) => s.name === name);
    const score = edScoreEl.value.trim().replace(/\s+/g, " ");
    const song = {
        name,
        key: parseInt(edKeyEl.value, 10) || 0,
        octave: old ? old.octave || 0 : musicOctave,
        bpm: Math.min(240, Math.max(30, parseInt(edBpmEl.value, 10) || 100)),
        score,
        custom: true,
    };
    // 同名就覆盖，不然改一次存一次会堆一串同名曲目
    const at = customSongs.findIndex((s) => s.name === name);
    if (at >= 0) customSongs[at] = song;
    else customSongs.push(song);

    const ok = persistCustomSongs();
    currentSong = song;
    renderSongList();
    fillEditor(song);
    if (!ok) {
        edStatusEl.textContent = "⚠ 存不进去（浏览器不让写本地存储），曲子只在本次有效";
        edStatusEl.classList.add("is-bad");
    } else {
        edStatusEl.textContent = `已保存「${name}」${at >= 0 ? "（覆盖了同名曲目）" : "，去下面曲库里找它"}`;
        edStatusEl.classList.remove("is-bad");
    }
}

function deleteDraft() {
    if (!currentSong || !currentSong.custom) return;
    const name = currentSong.name;
    customSongs = customSongs.filter((s) => s !== currentSong);
    persistCustomSongs();
    currentSong = null;
    renderSongList();
    fillEditor(null);
    edStatusEl.textContent = `已删除「${name}」`;
    edStatusEl.classList.remove("is-bad");
}

// 谱面：延音线、圆滑线画成音符上方的弧；三连音在中间那个音上标一个小小的 3
function renderScore() {
    scoreNotesEl.innerHTML = "";
    let tpCount = 0;
    currentNotes.forEach((n, i) => {
        const el = document.createElement("span");
        el.className = "score-note";
        el.dataset.i = i;
        if (n.rest) {
            el.classList.add("is-rest");
            el.innerHTML = `<span class="sn-key">·</span><span class="sn-deg"></span>`;
        } else {
            el.innerHTML =
                `<span class="sn-key">${escapeText((n.key || "?").toUpperCase())}</span>` +
                `<span class="sn-deg">${escapeText(n.degree)}</span>`;
        }
        if (n.beats >= 2) el.classList.add("is-long");
        if (n.beats < 1) el.classList.add("is-short");
        if (n.tieNext) el.classList.add("tie-start");
        if (n.tiePrev) el.classList.add("tie-end");
        if (n.slur && !(n.slurStart && n.slurEnd)) {
            el.classList.add(n.slurStart ? "sl-start" : n.slurEnd ? "sl-end" : "sl-mid");
        }
        if (n.triplet) {
            el.classList.add("is-tp");
            tpCount = n.tpStart ? 0 : tpCount + 1;
            if (tpCount === 1) el.insertAdjacentHTML("beforeend", `<span class="sn-tp">3</span>`);
        }
        scoreNotesEl.appendChild(el);
        if (n.bar) {
            const bar = document.createElement("span");
            bar.className = "score-bar";
            scoreNotesEl.appendChild(bar);
        }
    });
}

function markScoreAt(i) {
    scoreNotesEl.querySelectorAll(".score-note").forEach((el) => {
        const at = Number(el.dataset.i);
        el.classList.toggle("on", at === i);
        el.classList.toggle("done", at < i);
    });
    const cur = scoreNotesEl.querySelector(".score-note.on");
    if (cur) {
        // 只滚谱面那个小框，不动整页
        const r = cur.getBoundingClientRect();
        const box = scoreNotesEl.getBoundingClientRect();
        if (r.top < box.top || r.bottom > box.bottom) {
            scoreNotesEl.scrollBy({ top: r.top - box.top - box.height / 2 + r.height / 2, behavior: reduceMotion ? "auto" : "smooth" });
        }
    }
}

// ---------- 试听 ----------
const litTimers = {};

// 试听时用：键帽按下去、底光一闪，亮多久跟着这个音的时值走。
// 带升降号的音在键帽右上角挂一个记号，光看键盘就知道这下要按修饰键
function litMusicKey(id, ms, alter) {
    if (!id || !stage.keys.has(id)) return;
    stage.press(id, true);
    stage.flare(id);
    if (abyssOn) {
        abyss.noteOn(id, { velocity: 0.75, freq: musicFreqOf(musicIndexOf(id), alter) });
        setTimeout(() => abyss.noteOff(id), ms || 240);
    }
    if (alter) keyMark[id] = alter > 0 ? "#" : "b";
    else delete keyMark[id];
    updateMusicLegend(id);
    clearTimeout(litTimers[id]);
    litTimers[id] = setTimeout(() => {
        delete litTimers[id];
        stage.press(id, false);
        delete keyMark[id];
        updateMusicLegend(id);
    }, ms || 240);
}

function stopPlayback() {
    playTimers.forEach(clearTimeout);
    playTimers = [];
    playVoices.forEach((v) => v.release());
    playVoices.clear();
    Object.keys(litTimers).forEach((id) => {
        clearTimeout(litTimers[id]);
        delete litTimers[id];
        if (stage) stage.press(id, false);
        delete keyMark[id];
        updateMusicLegend(id);
    });
    scorePlayBtn.textContent = "▶ 试听";
    scorePlayBtn.classList.remove("on");
    const demo = $("btn-abyss-play");
    demo.classList.remove("on");
    demo.textContent = "▶ 演示";
}

// 编辑器开着时听的是草稿，速度得取输入框里的值，不是已保存曲目的
function currentBpm() {
    if (editorOpen) {
        const v = parseInt(edBpmEl.value, 10);
        if (Number.isFinite(v)) return Math.min(240, Math.max(30, v));
    }
    return (currentSong && currentSong.bpm) || 100;
}

function playSong() {
    if (!currentNotes.length) return;
    stopPlayback();
    setFollow(false);
    const ctx = audio.ensure();
    if (!ctx) return;
    scorePlayBtn.textContent = "■ 停下";
    scorePlayBtn.classList.add("on");
    const beat = 60 / currentBpm();
    // 按音频时钟排（不靠 setTimeout 掐点），快歌也不会一顿一顿的
    const t0 = ctx.currentTime + 0.15;
    const at = (beats) => t0 + beats * beat;
    // 画面（亮键、谱面进度）等声音真的从耳机里出来再动：蓝牙耳机要晚 0.1–0.3 秒
    const lag = visualLag();
    const delayMs = (time) => Math.max(0, (time - ctx.currentTime + lag) * 1000);
    // 谱面上的进度：每个音（包括延音线后面那一半）到点就亮
    let t = 0;
    currentNotes.forEach((n, i) => {
        const start = t;
        playTimers.push(setTimeout(() => markScoreAt(i), delayMs(at(start))));
        t += n.beats;
    });
    const total = t;
    // 往前排 0.25 秒，每 40ms 补一批
    let k = 0;
    const tick = () => {
        const horizon = ctx.currentTime + 0.25;
        while (k < currentEvents.length && at(currentEvents[k].start) < horizon) {
            const e = currentEvents[k++];
            const start = at(e.start);
            const dur = e.beats * beat;
            // 圆滑线里：一直响到下一个音进来（再多 30ms 叠一点），听起来是连着的；
            // 普通音：留一点断口，连着的同音之间才听得出是两下
            const off = e.legato ? dur + 0.03 : Math.max(0.06, dur * 0.88);
            const v = audio.play(musicPatch, musicFreqOf(e.idx, e.alter), {
                when: start - ctx.currentTime, hold: true, pan: e.key ? panOf(e.key) : 0, velocity: e.legato ? 0.92 : 1,
            });
            if (v) {
                playVoices.add(v);
                v.release(start + off);
                playTimers.push(setTimeout(() => playVoices.delete(v), delayMs(start + off) + 100));
            }
            playTimers.push(setTimeout(() => litMusicKey(e.key, Math.max(140, off * 1000), e.alter), delayMs(start)));
        }
    };
    tick();
    playTimers.push(setInterval(tick, 40)); // clearTimeout 也能清掉 setInterval
    playTimers.push(setTimeout(() => {
        stopPlayback();
        markScoreAt(-1);
    }, delayMs(at(total)) + 600));
}

// ---------- 跟弹：下一个该敲的键上方悬着光环，敲对了才往前走 ----------
let followHintKey = null;

function clearFollowHint() {
    if (!stage) return;
    stage.setTargetKey(null);
    if (followHintKey) {
        delete keyMark[followHintKey];
        updateMusicLegend(followHintKey);
        followHintKey = null;
    }
    ["shift-l", "shift-r", "opt-l"].forEach((id) => stage.setKey(id, { pulse: 0 }));
}

function setFollow(on) {
    followMode = on;
    followPos = 0;
    scoreFollowBtn.classList.toggle("on", on);
    scoreFollowBtn.textContent = on ? "退出跟弹" : "跟弹";
    clearFollowHint();
    if (on) {
        stopPlayback();
        highlightNext();
    } else {
        markScoreAt(-1);
    }
}

// 跟弹按"要按下去的音"走：延音线连着的几个音只算一次，休止符自己跳过去
function highlightNext() {
    clearFollowHint();
    if (followPos >= currentEvents.length) {
        setFollow(false);
        markScoreAt(currentNotes.length);
        scoreHintEl.textContent = `${currentSong ? currentSong.name : "这段"} 弹完了 🎉 再点一次「跟弹」从头来`;
        return;
    }
    const ev = currentEvents[followPos];
    markScoreAt(ev.first);
    if (!ev.key || currentScreen !== "music") return;
    stage.setTargetKey(ev.key);
    // 这个音要带升降号：修饰键还没按住，就在键帽上挂记号、让对应的修饰键一起闪
    const want = ev.alter || 0;
    if (want && musicAlter !== want) {
        followHintKey = ev.key;
        keyMark[ev.key] = want > 0 ? "#" : "b";
        updateMusicLegend(ev.key);
        (want > 0 ? ["shift-l", "shift-r"] : ["opt-l"]).forEach((id) => stage.setKey(id, { pulse: 1 }));
    }
}

// 跟弹的推进挂在"按下"上，和松手无关。
// 升降号也要对上——谱面写 #4 时只按 F 不算过，得 Shift+F
function advanceFollow(key, alter) {
    if (!followMode || followPos >= currentEvents.length) return;
    const ev = currentEvents[followPos];
    if (ev.key === key && (ev.alter || 0) === (alter || 0)) {
        followPos++;
        highlightNext();
    }
}

const musicPlayer = makeHoldPlayer({
    start: (id) => {
        const idx = musicIndexOf(id);
        // 按下那一刻的升降跟着这个音走到松手，中途放开 Shift 不改已经在响的音
        musicKeyAlter[id] = musicAlter;
        const f = musicFreqOf(idx, musicAlter);
        // 先发声、再做画面：声音越早排进音频线程越跟手
        const voice = audio.play(musicPatch, f, { hold: true, pan: panOf(id) });
        if (abyssOn) {
            abyss.noteOn(id, { velocity: 0.95, freq: f });
            audio.bubbles({ pan: panOf(id) });
        }
        return voice;
    },
    onHold: (id, on) => {
        stage.press(id, on);
        if (on) {
            stage.flare(id);
            stage.ripple(id, { strength: 0.55, speed: 9, life: 0.9 });
            advanceFollow(id, musicKeyAlter[id] || 0);
            if (abyssOn) hideAbyssHint();
        } else {
            delete musicKeyAlter[id];
            if (abyssOn) abyss.noteOff(id);
        }
    },
    // 手松了但踏板挂着、还在响：和"手按着"要能分开看
    onRing: (id, on) => stage.setKey(id, { emissive: on ? 0.9 : 0 }),
});

// 3D 键盘上点到的键
function musicPointerDown(id, holder) {
    if (CELL[id]) {
        musicPlayer.down(id, holder);
        return;
    }
    stage.pop(id);
    if (id === "esc") {
        if (abyssOn) exitAbyss();
        else exitMusicMode();
    } else if (/^f\d+$/.test(id)) {
        setInstrument(INSTRUMENT_BANKS[musicBank][Number(id.slice(1)) - 1], { preview: true });
    } else if (id === "caps") {
        setBank(musicBank ? 0 : 1);
    } else if (id === "left" || id === "right") {
        setMusicKey(musicKey + (id === "right" ? 1 : -1), { announce: true });
    } else if (id === "up" || id === "down") {
        setMusicOctave(musicOctave + (id === "up" ? 1 : -1), { announce: true });
    } else if (id === "shift-l" || id === "shift-r") {
        // 点一下锁住，再点一下松开；升和降互斥
        latchedAlter = latchedAlter === 1 ? 0 : 1;
        applyAlter();
    } else if (id === "opt-l") {
        latchedAlter = latchedAlter === -1 ? 0 : -1;
        applyAlter();
    } else if (id === "space" || id === "enter") {
        latchedPedal = !latchedPedal;
        applyPedal();
    }
}

// ============================================================
// 深海模式（音乐模式里的一个沉浸视图）：键盘沉进发光的水箱，弹钢琴时从键里升起气泡、烟雾和光柱。
// 画面由 js/abyss.js 负责；这里管进出、镜头、声音和那一条控制栏
// ============================================================
const abyss = stage ? new Abyss(stage) : null;
let abyssOn = false;
let abyssSaved = null;
let abyssCam = null;
let abyssHintTimer = null;

// 镜头：隔着水箱的前壁平视，轻轻地来回漂（像手持摄影机在水族馆外面拍）
function abyssView(t = 0) {
    // 竖屏：整只水箱塞进来键盘就太小了，左右裁掉一些
    const tall = window.innerWidth < window.innerHeight * 0.9;
    return {
        region: tall
            ? { x0: 1.2, x1: 14.8, z0: ABYSS_TANK.z0 + 1, z1: ABYSS_TANK.z1 }
            : { x0: ABYSS_TANK.x0 + 0.9, x1: ABYSS_TANK.x1 - 0.9, z0: ABYSS_TANK.z0 + 1, z1: ABYSS_TANK.z1 },
        yLo: ABYSS_TANK.y0, yHi: ABYSS_TANK.y1, targetY: 3.1,
        az: Math.sin(t * 0.07) * 5, el: 4.5 + Math.sin(t * 0.05 + 1) * 1.2, fov: 30, margin: 0, speed: 0.8,
    };
}

function hideAbyssHint() {
    clearTimeout(abyssHintTimer);
    abyssHintTimer = setTimeout(() => $("abyss-hint").classList.add("gone"), 2500);
}

function enterAbyss() {
    if (!abyss || abyssOn) return;
    if (currentScreen !== "music") enterMusicMode();
    const go = () => {
        abyssOn = true;
        stopPlayback();
        setFollow(false);
        closePanels();
        abyssSaved = { patch: musicPatch };
        document.body.classList.add("abyss");
        $("abyss-hud").hidden = false;
        $("abyss-hint").classList.remove("gone");
        // 提示词里是钢琴：进来先换成钢琴，F 键照样能换
        if (musicPatch !== "piano") setInstrument("piano");
        applyColorway(COLORWAYS.abyss);
        abyss.enter();
        stage.setInteractive((id) => !!CELL[id] || id === "esc" || id === "tab");
        const t0 = stage.time;
        stage.setView(abyssView(0), { instant: false });
        abyssCam = stage.onTick(() => stage.setView(abyssView(stage.time - t0)));
        // 声音：大教堂一样的混响、回声、长尾，环境声换成深海的轰鸣和远处的气泡
        audio.setFx({ reverb: "cathedral", echo: 0.5, bloom: 0.8, width: 1.5, tone: "clear", cinematic: false });
        audio.setAmbience("abyss", 0.95);
        $("abyss-inst").textContent = INSTRUMENTS[musicPatch].name;
        const sel = $("abyss-song");
        sel.innerHTML = allSongs().map((s, i) => `<option value="${i}">${escapeText(s.name)}</option>`).join("");
        const pick = allSongs().findIndex((s) => s.name === "天空之城");
        if (pick >= 0) sel.value = String(pick);
    };
    if (document.startViewTransition && !reduceMotion) document.startViewTransition(go);
    else go();
}

// 拆掉深海（不带过渡）：换屏时用
function teardownAbyss() {
    if (!abyssOn) return;
    abyssOn = false;
    if (abyssCam) abyssCam();
    abyssCam = null;
    clearTimeout(abyssHintTimer);
    abyss.exit();
    document.body.classList.remove("abyss");
    $("abyss-hud").hidden = true;
    $("btn-abyss-play").classList.remove("on");
    if (abyssSaved && abyssSaved.patch !== musicPatch) setInstrument(abyssSaved.patch);
    applyStyle({ persist: false }); // 效果、环境声、配色都回到风格面板里的设置
}

function exitAbyss() {
    if (!abyssOn) return;
    const go = () => {
        stopPlayback();
        teardownAbyss();
        if (currentScreen === "music") setupMusic();
    };
    if (document.startViewTransition && !reduceMotion) document.startViewTransition(go);
    else go();
}

function playAbyssDemo() {
    const btn = $("btn-abyss-play");
    if (playTimers.length) {
        stopPlayback();
        btn.classList.remove("on");
        btn.textContent = "▶ 演示";
        return;
    }
    const song = allSongs()[Number($("abyss-song").value)];
    if (!song) return;
    selectSong(song);
    playSong();
    hideAbyssHint();
    btn.classList.add("on");
    btn.textContent = "■ 停下";
}

function enterMusicMode() {
    closePanels();
    if (currentScreen === "music") return;
    // 从哪来回哪去：游戏中途进来，退出时关卡还在
    musicReturnTo = currentScreen;
    audio.ensure();
    showScreen("music");
}

function exitMusicMode() {
    if (currentScreen !== "music") return;
    stopPlayback();
    setFollow(false);
    releaseAllHeld(); // 按着键点了返回，别把音带出去
    showScreen(musicReturnTo);
}

// ============================================================
// 顶栏：菜单（音乐模式入口 + 选关）和风格面板
// ============================================================
const settingsBtn = $("btn-settings");
const levelPanelEl = $("level-panel");

function closeLevelPanel() {
    levelPanelEl.hidden = true;
    settingsBtn.setAttribute("aria-expanded", "false");
}

function closeStylePanel() {
    stylePanelEl.hidden = true;
    styleBtn.setAttribute("aria-expanded", "false");
}

function closePanels() {
    closeLevelPanel();
    closeStylePanel();
}

function togglePanel(panel, btn) {
    const open = panel.hidden;
    closePanels();
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
}

// 选关：十四颗小键帽，每颗就是那一关那套键帽里的一颗，底下一道那一关的渐变
function buildLevelChips() {
    const el = $("level-chips");
    LEVELS.forEach((lv, i) => {
        const level = i + 1;
        const cw = levelColorway(level);
        const inst = INSTRUMENTS[levelSound(level).patch];
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "level-chip";
        chip.dataset.level = level;
        chip.style.setProperty("--chip", cw.alpha);
        chip.style.setProperty("--chip-ink", cw.alphaLegend);
        if (cw.grad && cw.grad.length > 1) chip.style.setProperty("--chip-grad", `linear-gradient(90deg, ${cw.grad.join(", ")})`);
        chip.title = `第 ${level} 关 · ${cw.name} · ${inst.name} · ${lv.count} 个键` + (lv.design ? " · 起终点固定" : "");
        chip.setAttribute("aria-label", chip.title);
        chip.innerHTML =
            `<span class="level-chip-num">${pad2(level)}</span>` +
            `<span class="level-chip-keys">${lv.count}</span>`;
        chip.addEventListener("click", () => {
            audio.ensure();
            closePanels();
            startLevel(level);
        });
        el.appendChild(chip);
    });
}

// ============================================================
// 事件
// ============================================================
function bindEvents() {
    // ---- 3D 键盘上的点击 / 触摸 ----
    stage.on("keydown", (id, holder) => {
        if (id === "knob") return;
        if (currentScreen === "home") {
            if (CELL[id]) freePlayer.down(id, holder);
            else if (id === "space") {
                stage.pop(id);
                latchedPedal = !latchedPedal;
                applyPedal();
            }
        } else if (currentScreen === "game") {
            if (id === "backspace") {
                stage.pop(id);
                undoLastStep();
            } else {
                handleKeyPress(id);
            }
        } else if (currentScreen === "music") {
            musicPointerDown(id, holder);
        } else if (currentScreen === "reward") {
            launchLetter(id);
        }
    });
    stage.on("keyup", (id, holder) => {
        if (CELL[id]) players.forEach((p) => p.up(id, holder));
    });
    // 右上角那颗金色旋钮就是音量：拖着转
    stage.on("knob", (v) => {
        if (!soundOn && v > 0.001) setSound(true);
        setVolume(v);
    });
    stage.on("knobend", () => previewVolume());
    stage.onTick(ambientTick);

    // ---- Safari：切到别的标签页再回来，音频会被挂起；任何一次点击/按键都顺手恢复 ----
    const unlock = () => audio.unlock();
    ["pointerdown", "keydown", "touchend"].forEach((t) => window.addEventListener(t, unlock, true));
    // 输出设备换了（插上 / 连上耳机）或者音频刚跑起来：重新看一眼延迟。
    // 设备刚切过去时系统报的数还不准，等一会儿再读
    const recheckLatency = () => setTimeout(() => {
        const L = audio.latency();
        if (L && L.total < LAG_NOTICE) lagNoticed = false; // 换回了有线 / 外放：下次再连蓝牙还会提示
        checkLatency();
    }, 1200);
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
        navigator.mediaDevices.addEventListener("devicechange", recheckLatency);
    }
    audio.onState = (st) => {
        if (st === "running") {
            if (toastEl.dataset.kind === "audio") hideToast();
            recheckLatency();
        } else if (soundOn && !document.hidden) {
            toastEl.dataset.kind = "audio";
            showToast("声音被浏览器暂停了——点一下页面任意位置就恢复", 0);
        }
    };
    // 切回来时试着恢复；Safari 不让没有手势的恢复，那就提示点一下
    const tryResume = () => {
        if (document.hidden || !audio.ctx) return;
        audio.unlock();
        setTimeout(() => {
            if (audio.ctx && audio.ctx.state !== "running" && soundOn && !document.hidden) {
                toastEl.dataset.kind = "audio";
                showToast("声音被浏览器暂停了——点一下页面任意位置就恢复", 0);
            }
        }, 450);
    };
    window.addEventListener("pageshow", tryResume);
    window.addEventListener("focus", tryResume);

    // ---- 物理键盘 ----
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (!e.repeat) mirrorDown(e.code, "esc");
            // 面板开着先收面板，否则 Esc 就是退出音乐模式
            if (!levelPanelEl.hidden || !stylePanelEl.hidden) closePanels();
            else if (abyssOn) exitAbyss();
            else if (currentScreen === "music") exitMusicMode();
            return;
        }
        if (isTyping(e)) return; // 编辑器里空格是分隔符、b 是降号，不能变成踏板和琴键
        const vid = CODE_TO_ID[e.code];
        if (vid && !e.repeat) mirrorDown(e.code, vid);

        // 焦点在按钮上时，空格和回车是按那个按钮，不是踩踏板
        const onControl = e.target && e.target.closest && e.target.closest("button, a, [role='button']");

        // 过关页：字母键 = 放飞挂在那颗键上的字母；空格 = 全部放飞；Enter = 下一关
        if (currentScreen === "reward") {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.code === "Space" && !onControl) {
                e.preventDefault();
                if (!e.repeat) releaseAllLetters();
                return;
            }
            if (e.key === "Enter" && !onControl) {
                e.preventDefault();
                if (!e.repeat) goToNextLevel();
                return;
            }
            const rid = noteIdOf(e);
            if (rid && !e.repeat && !launchLetter(rid)) tapWithoutLetter(rid);
            return;
        }
        if (e.code === "Space" || e.key === " ") {
            if (!instrumentActive() || onControl) return;
            e.preventDefault(); // 空格默认会滚页面
            if (!e.repeat) {
                physicalPedal = true;
                applyPedal();
            }
            return;
        }
        if (e.key === "Enter") {
            if (onControl) return;
            // 关卡里 Enter = 提示
            if (currentScreen === "game") {
                e.preventDefault();
                if (!e.repeat) showHint();
                return;
            }
            // 乐器模式里 Enter = 踏板开关，踩住不放腾不出手时用这个
            if (!instrumentActive()) return;
            e.preventDefault();
            if (!e.repeat) {
                latchedPedal = !latchedPedal;
                applyPedal();
            }
            return;
        }
        if (e.key === "Backspace" && currentScreen === "game") {
            e.preventDefault();
            undoLastStep();
            return;
        }
        if (currentScreen === "music") {
            syncMusicAlter(e);
            // Caps Lock：按下去灯亮 = B 组，再按灯灭 = A 组
            if (e.code === "CapsLock") {
                setBank(e.getModifierState("CapsLock") ? 1 : 0);
                return;
            }
            const fn = /^F([1-9]|1[0-2])$/.exec(e.key);
            if (fn) {
                e.preventDefault();
                if (!e.repeat) setInstrument(INSTRUMENT_BANKS[musicBank][Number(fn[1]) - 1], { preview: true });
                return;
            }
            // 方向键 / - = ：升降调、换八度
            const keyStep = { ArrowLeft: -1, ArrowRight: 1, Minus: -1, Equal: 1 }[e.code];
            const octStep = { ArrowDown: -1, ArrowUp: 1 }[e.code];
            if (keyStep || octStep) {
                e.preventDefault();
                if (!e.repeat) {
                    if (keyStep) setMusicKey(musicKey + keyStep, { announce: true });
                    else setMusicOctave(musicOctave + octStep, { announce: true });
                }
                return;
            }
        }
        // ⌘ / Ctrl 组合是快捷键，不当琴键
        if (e.metaKey || e.ctrlKey) return;
        const id = noteIdOf(e);
        if (!id) return;
        if (currentScreen === "music") {
            // Alt 在系统层面可能唤起菜单栏，按住弹琴时要拦掉
            if (e.altKey) e.preventDefault();
            if (!e.repeat) musicPlayer.down(id, "kb");
            return;
        }
        // 还在首页时，同一块键盘是乐器不是棋盘
        if (currentScreen === "home" && !homeStarted) {
            if (!e.repeat) freePlayer.down(id, "kb");
            return;
        }
        if (currentScreen === "game" && !e.repeat) handleKeyPress(id);
    });

    // 松手才收尾。这里故意不挡 isTyping：收音是幂等的，挡掉反而会让
    // "按下琴键后焦点跑进输入框"变成一个收不掉的长音。
    document.addEventListener("keyup", (e) => {
        mirrorUp(e.code);
        // macOS：⌘ 按住期间其他键的 keyup 不会来，⌘ 一松就把物理键盘按着的全放掉
        if (e.key === "Meta") {
            releaseMirrors();
            players.forEach((p) => p.releaseHolder("kb"));
        }
        // macOS 上 Caps Lock 关掉时只来 keyup
        if (e.code === "CapsLock" && currentScreen === "music") {
            setBank(e.getModifierState("CapsLock") ? 1 : 0);
            return;
        }
        // 踏板抬起只放物理那一路，屏幕上锁住的不受影响
        if (e.code === "Space" || e.key === " ") {
            physicalPedal = false;
            applyPedal();
            return;
        }
        if (currentScreen === "music") syncMusicAlter(e);
        const id = noteIdOf(e);
        if (id) players.forEach((p) => p.up(id, "kb"));
    });

    // 切窗口、切标签页时手上的键会丢 keyup
    window.addEventListener("blur", () => {
        releaseAllHeld();
        physicalAlter = 0;
        applyAlter();
    });
    document.addEventListener("visibilitychange", () => {
        // 环境声（海浪、雨……）不在后台一直响
        audio.pauseAmbience(document.hidden);
        if (document.hidden) releaseAllHeld();
        else tryResume();
    });

    // ---- 首页滚动 ----
    let scrollTicking = false;
    window.addEventListener("scroll", () => {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(() => {
            scrollTicking = false;
            onHomeScroll();
        });
    }, { passive: true });

    window.addEventListener("resize", () => {
        sizeConfettiCanvas();
        if (currentScreen === "home" && homeChapter) onHomeScroll();
        else if (currentScreen === "music" && !abyssOn) stage.setView(musicView());
        else if (currentScreen === "game") stage.setView(gameView());
    });

    // 背景那几团光跟着鼠标慢慢挪一点：整个页面像是在流动
    let pmQueued = false;
    let pmX = 0;
    let pmY = 0;
    window.addEventListener("pointermove", (e) => {
        if (reduceMotion || e.pointerType !== "mouse") return;
        pmX = e.clientX / window.innerWidth - 0.5;
        pmY = e.clientY / window.innerHeight - 0.5;
        if (pmQueued) return;
        pmQueued = true;
        requestAnimationFrame(() => {
            pmQueued = false;
            document.documentElement.style.setProperty("--mx", pmX.toFixed(3));
            document.documentElement.style.setProperty("--my", pmY.toFixed(3));
        });
    }, { passive: true });

    // 规则逐条落位
    const reveals = document.querySelectorAll("#screen-home .reveal");
    if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("in");
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.35 });
        reveals.forEach((n, i) => {
            n.style.transitionDelay = (i % 3) * 90 + "ms";
            io.observe(n);
        });
    } else {
        reveals.forEach((n) => n.classList.add("in"));
    }

    // ---- 按钮 ----
    startBtn.addEventListener("click", () => {
        audio.ensure();
        beginGame();
    });
    $("btn-brand").addEventListener("click", goHome);
    settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePanel(levelPanelEl, settingsBtn);
    });
    styleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        audio.ensure();
        togglePanel(stylePanelEl, styleBtn);
    });
    // 点面板外面收起
    document.addEventListener("click", (e) => {
        if (!levelPanelEl.hidden && !levelPanelEl.contains(e.target)) closeLevelPanel();
        if (!stylePanelEl.hidden && !stylePanelEl.contains(e.target)) closeStylePanel();
    });
    $("btn-music-mode").addEventListener("click", enterMusicMode);
    $("btn-music-back").addEventListener("click", exitMusicMode);
    $("btn-undo").addEventListener("click", undoLastStep);
    $("btn-restart").addEventListener("click", restartCurrentLevel);
    $("btn-hint").addEventListener("click", showHint);
    $("btn-skip").addEventListener("click", skipLevel);
    $("btn-next").addEventListener("click", goToNextLevel);
    $("btn-release-all").addEventListener("click", releaseAllLetters);
    $("btn-restart-game").addEventListener("click", restartGame);

    $("btn-sound").addEventListener("click", () => {
        setSound(!soundOn);
        if (soundOn) {
            audio.ensure();
            if (volume <= 0.001) setVolume(DEFAULT_VOLUME); // 音量在 0 时开声音，给回默认档
            previewVolume();
        }
    });
    const volSliderEl = $("vol-slider");
    volSliderEl.addEventListener("input", (e) => {
        const v = Number(e.target.value) / 100;
        // 拖动音量就是想听见，顺手取消静音
        if (!soundOn && v > 0) setSound(true);
        setVolume(v);
    });
    // 松手/停下来才试听一声，拖动过程中不叠音
    volSliderEl.addEventListener("change", () => {
        audio.ensure();
        previewVolume();
    });

    // ---- 音乐模式 ----
    $("btn-abyss").addEventListener("click", enterAbyss);
    $("btn-abyss-mode").addEventListener("click", () => {
        audio.ensure();
        closePanels();
        enterAbyss();
    });
    $("btn-abyss-exit").addEventListener("click", exitAbyss);
    $("btn-abyss-play").addEventListener("click", playAbyssDemo);
    $("key-down").addEventListener("click", () => setMusicKey(musicKey - 1, { announce: true }));
    $("key-up").addEventListener("click", () => setMusicKey(musicKey + 1, { announce: true }));
    $("oct-down").addEventListener("click", () => setMusicOctave(musicOctave - 1, { announce: true }));
    $("oct-up").addEventListener("click", () => setMusicOctave(musicOctave + 1, { announce: true }));
    document.querySelectorAll("#inst-bank .bank-btn").forEach((b) => {
        b.addEventListener("click", () => setBank(Number(b.dataset.bank)));
    });
    scorePlayBtn.addEventListener("click", () => {
        if (playTimers.length) stopPlayback();
        else playSong();
    });
    scoreFollowBtn.addEventListener("click", () => {
        if (followMode) {
            setFollow(false);
        } else {
            setFollow(true);
            if (followMode && currentNotes.length) scoreHintEl.textContent = "按光环底下那个键，敲对了才往下走（延音线连着的同音只按一次）";
        }
    });
    scoreEditBtn.addEventListener("click", () => setEditorOpen(!editorOpen));
    edScoreEl.addEventListener("input", refreshEditor);
    edKeyEl.addEventListener("change", refreshEditor);
    edBpmEl.addEventListener("input", () => {
        if (playTimers.length) stopPlayback(); // 速度改了，正在播的那遍已经不作数
    });
    edSaveBtn.addEventListener("click", saveDraft);
    edDeleteBtn.addEventListener("click", deleteDraft);
    edRevertBtn.addEventListener("click", () => {
        fillEditor(currentSong);
        edStatusEl.textContent = currentSong ? "已还原到保存的版本" : "已清空";
        edStatusEl.classList.remove("is-bad");
    });
    document.querySelectorAll(".ed-tool").forEach((b) => {
        // 按下时别让焦点离开文本框，选区才还在
        b.addEventListener("mousedown", (e) => e.preventDefault());
        b.addEventListener("click", () => applyEdTool(b.dataset.tool));
    });
    // 谱面里空格是分隔符，Tab 用来缩进小节比切走焦点有用
    edScoreEl.addEventListener("keydown", (e) => {
        if (e.key !== "Tab") return;
        e.preventDefault();
        const s = edScoreEl.selectionStart;
        const v = edScoreEl.value;
        edScoreEl.value = v.slice(0, s) + "  " + v.slice(edScoreEl.selectionEnd);
        edScoreEl.selectionStart = edScoreEl.selectionEnd = s + 2;
        refreshEditor();
    });
}

// ============================================================
// 启动
// ============================================================
function init() {
    sizeConfettiCanvas();
    buildLevelChips();
    buildStylePanel();
    buildKeySelect();
    buildInstRow();
    bindEvents();

    audio.setVolume(volume);
    audio.setMuted(!soundOn);
    stage.setKnob(volume, true);
    syncSoundUI();

    setInstrument(musicPatch);
    selectSong(null);
    renderSongList();
    syncKeyUI();

    // 刷新时别让浏览器恢复上次的滚动位置，否则一进来那一笔已经画满、直接开局
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    // 开场：镜头从高处斜着落下来
    const first = SCENES[style.scene].colorway ? COLORWAYS[SCENES[style.scene].colorway] : COLORWAYS[HOME_COLORWAY];
    stage.setColorway(first, { instant: true });
    stage.setView({ region: REGIONS.board, az: -46, el: 62, fov: 34, margin: 0.35 }, { instant: true });
    applyStyle({ persist: false });
    showScreenNow("home");
}

if (stage) {
    init();
    // 自测用：地址后面加 ?debug 才把内部状态挂到 window 上
    if (/[?&]debug\b/.test(location.search)) {
        window.__ub = {
            stage, audio, state, style, LEVELS, SONGS, startLevel, handleKeyPress, showHint, skipLevel, solveFrom,
            completeLevel, goToNextLevel, showScreen, enterMusicMode, setInstrument, selectSong, playSong,
            applyStyle, setMood, setScene, setFxField, get currentScreen() { return currentScreen; },
            parseScore, musicSemitone, get currentNotes() { return currentNotes; },
            abyss, enterAbyss, exitAbyss, musicPlayer, dream, dreamSky, enterDream, leaveDream, visualLag,
            // 预览窗口在后台时 WebGL 画布不会被合成进截图：画一帧，拍成图片盖在画布上，截完再拿掉
            snap(seconds = 0.2) {
                stage.advance(seconds);
                const url = stage.canvas.toDataURL("image/png");
                let img = document.getElementById("__snap");
                if (!img) {
                    img = document.createElement("img");
                    img.id = "__snap";
                    img.style.cssText = "position:absolute;z-index:5;pointer-events:none;";
                }
                const r = stage.canvas.getBoundingClientRect();
                Object.assign(img.style, { left: r.left + scrollX + "px", top: r.top + scrollY + "px", width: r.width + "px", height: r.height + "px" });
                img.src = url;
                document.body.appendChild(img);
                return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
            },
            unsnap() {
                const img = document.getElementById("__snap");
                if (img) img.remove();
            },
        };
    }
} else {
    $("webgl-fallback").hidden = false;
}
