// ============================================================
// 音频引擎：二十四件合成乐器 + 一整条效果链 + 场景环境声
//
// 每件乐器是一份"配方"，由几种积木拼出来：
//   partials  加法合成：一组正弦/三角/方波泛音，各自有自己的衰减——木琴、八音盒、管风琴都靠它
//   fm        调频：载波 + 调制波，调制深度随时间衰减——电钢琴、玻璃琴、钟声
//   ks        Karplus-Strong 物理建模拨弦：一段噪声在延迟线里来回衰减，就是一根真的弦（吉他、竖琴、古筝）
//   saws      减法合成：几根失谐锯齿/方波进一个带包络的低通——合成器、弦乐、铺底、手风琴
//   formants  共振峰：同一堆锯齿波再过三个带通，就成了人声的"啊"
//   noise     击打瞬间的那一下噪声（琴槌、木槌、拨片、火花）；breath 是吹管乐一直带着的气声
//   sustain   有这个字段的乐器按住会一直响（弦乐、管风琴、人声），没有的就是自然衰减
//   tremolo / vibrato / blip / slide   颤音、揉弦、起音音高弹动、滑音进入
//
// 效果链：声部 → 干声 + 混响 + 回声 + 氛围（长尾）→ 音色（均衡 + 饱和）→ 立体声宽度 → 限幅 → 音量
// ============================================================

const NOISE_SECONDS = 2;
// 限幅器（DynamicsCompressorNode）固定的"预读"，实测 6 ms：整条混音都会晚这么多
const LIMITER_LOOKAHEAD = 0.006;

// ---------------- 乐器配方 ----------------
// 公共字段：
//   decay      基音在 A4 附近的鸣响时长（秒）；低音更长、高音更短（decayPitch 控制）
//   holdScale  按住不放时衰减拉长的倍数（钢琴要长、木琴几乎不拉长——木头本来就不延音）
//   release    松手 / 抬踏板时收尾的时长
//   reverb     送进混响的比例
//   octave     整体升降几个八度（八音盒、长笛天生在高音区，贝斯在低音区）
//   oneShot    会一直响的乐器（有 sustain）单发时响多久
export const INSTRUMENTS = {
    // ================= A 组 =================
    // 八音盒：梳齿簧片的泛音不是整数倍，5.4 倍那一个就是"叮"的来源
    musicbox: {
        name: "八音盒", en: "Music Box", colorway: "chenguang", family: "敲击",
        octave: 1, decay: 1.5, decayPitch: 0.45, holdScale: 1.6, release: 0.35, reverb: 0.4, gain: 0.9,
        attack: 0.004,
        partials: [
            { r: 1, g: 0.15, wave: "sine", d: 1 },
            { r: 2.0, g: 0.02, wave: "sine", d: 0.55 },
            { r: 5.4, g: 0.035, wave: "sine", d: 0.22 },
            { r: 8.9, g: 0.012, wave: "sine", d: 0.1 },
        ],
        noise: { type: "highpass", freq: 6500, q: 0.7, g: 0.035, d: 0.012 },
    },

    // 马林巴：木条 + 底下的共鸣管。木头不延音，所以按住也拉不长；
    // 起音那一下"咚"的木头敲击声要足，第二、三个振动模式（3.93、9.2 倍）死得极快
    marimba: {
        name: "马林巴", en: "Marimba", colorway: "bohe", family: "敲击",
        octave: 0, decay: 0.85, decayPitch: 0.55, holdScale: 1.05, release: 0.12, reverb: 0.2, gain: 1.05,
        attack: 0.002,
        partials: [
            { r: 1, g: 0.155, wave: "sine", d: 1 },
            { r: 3.93, g: 0.055, wave: "sine", d: 0.16 },
            { r: 9.2, g: 0.014, wave: "sine", d: 0.05 },
        ],
        noise: { type: "lowpass", freq: 900, q: 1.1, g: 0.13, d: 0.028 },
        filter: { type: "lowpass", freq: 3400, q: 0.5 },
    },

    // 竖琴：物理建模拨弦，亮度会随时间自己暗下去
    harp: {
        name: "竖琴", en: "Harp", colorway: "haiwu", family: "拨弦",
        octave: 0, decay: 2.6, decayPitch: 0.55, holdScale: 1.4, release: 0.5, reverb: 0.45, gain: 1,
        ks: { g: 0.16, brightness: 0.55, stretch: 0.28 },
        partials: [{ r: 1, g: 0.035, wave: "sine", d: 1.2 }], // 一点点琴体共鸣
        filter: { type: "lowpass", freq: 5200, q: 0.5 },
    },

    // 卡林巴：起音时音高先高一点再落回来，那一下"嘣"的弹性就是它
    kalimba: {
        name: "卡林巴", en: "Kalimba", colorway: "miju", family: "拨弦",
        octave: 0, decay: 1.25, decayPitch: 0.45, holdScale: 1.5, release: 0.3, reverb: 0.28, gain: 1,
        attack: 0.002,
        blip: { cents: 35, time: 0.03 },
        partials: [
            { r: 1, g: 0.15, wave: "sine", d: 1 },
            { r: 2.0, g: 0.018, wave: "sine", d: 0.45 },
            { r: 5.94, g: 0.04, wave: "sine", d: 0.12 },
        ],
        noise: { type: "lowpass", freq: 900, q: 1, g: 0.06, d: 0.012 },
    },

    // 玻璃琴：调制比 3.5 是非整数，泛音带一点金属的"不齐"，再加慢揉弦
    glass: {
        name: "玻璃琴", en: "Glass", colorway: "xunyicao", family: "合成",
        octave: 0, decay: 2.4, decayPitch: 0.35, holdScale: 2.2, release: 0.7, reverb: 0.55, gain: 1,
        attack: 0.045,
        fm: [{ c: 1, m: 3.5, index: 1.1, indexEnd: 0.15, indexTime: 1.2, g: 0.1, d: 1 }],
        partials: [{ r: 2, g: 0.02, wave: "sine", d: 0.8 }],
        vibrato: { rate: 5.2, cents: 7, delay: 0.25 },
    },

    // 手碟：八度和十二度（3 倍）两个泛音一起长鸣，低低的一声"咚"打底
    handpan: {
        name: "手碟", en: "Handpan", colorway: "taiyuan", family: "敲击",
        octave: 0, decay: 2.1, decayPitch: 0.4, holdScale: 1.6, release: 0.45, reverb: 0.48, gain: 1,
        attack: 0.006,
        partials: [
            { r: 1, g: 0.14, wave: "sine", d: 1 },
            { r: 2.005, g: 0.05, wave: "sine", d: 0.7 },
            { r: 3.0, g: 0.018, wave: "sine", d: 0.45 },
            { r: 1, g: 0.03, wave: "sine", d: 0.9, detune: 4 },
        ],
        noise: { type: "lowpass", freq: 420, q: 1.1, g: 0.08, d: 0.035 },
    },

    // 电钢琴：1:1 调频是暖的本体，14 倍那一对只响几十毫秒——就是音叉被敲的那声"叮"
    rhodes: {
        name: "电钢琴", en: "Electric Piano", colorway: "muyun", family: "键盘",
        octave: 0, decay: 1.9, decayPitch: 0.4, holdScale: 2.2, release: 0.3, reverb: 0.3, gain: 1,
        attack: 0.003,
        fm: [
            { c: 1, m: 1, index: 2.0, indexEnd: 0.35, indexTime: 0.9, g: 0.11, d: 1 },
            { c: 1, m: 14, index: 0.9, indexEnd: 0.01, indexTime: 0.06, g: 0.03, d: 0.35 },
        ],
        tremolo: { rate: 4.6, depth: 0.16 },
    },

    // 颤音琴：金属条，和马林巴刚好相反——余音很长、泛音发亮，
    // 底下那台小马达带出来的强烈"哇哇"颤音是它的签名
    vibes: {
        name: "颤音琴", en: "Vibraphone", colorway: "shuangye", family: "敲击",
        octave: 0, decay: 3.2, decayPitch: 0.3, holdScale: 1.7, release: 0.55, reverb: 0.55, gain: 1,
        attack: 0.003,
        partials: [
            { r: 1, g: 0.11, wave: "sine", d: 1 },
            { r: 1, g: 0.03, wave: "sine", d: 0.9, detune: 4 },
            { r: 4.0, g: 0.04, wave: "sine", d: 0.32 },
            { r: 10.0, g: 0.007, wave: "sine", d: 0.08 },
        ],
        noise: { type: "bandpass", freq: 3800, q: 1.2, g: 0.03, d: 0.01 },
        tremolo: { rate: 5.4, depth: 0.55 },
        filter: { type: "lowpass", freq: 7000, q: 0.4 },
    },

    // 星火：原样保留的那一件。三角波基音 + 2/3/4 倍泛音，各自比基音早死一截；
    // 起音加一粒 5kHz 附近的噪声，像火星迸出来
    ember: {
        name: "星火", en: "Ember", colorway: "xinghuo", family: "合成",
        octave: 0, decay: 0.55, decayPitch: 0, holdScale: 4.5, release: 0.3, reverb: 0.3, gain: 1,
        attack: 0.01, curve: "exp",
        partials: [
            { r: 1, g: 0.13, wave: "triangle", d: 1 },
            { r: 2, g: 0.045, wave: "triangle", d: 0.6 },
            { r: 3, g: 0.026, wave: "sine", d: 0.45 },
            { r: 4, g: 0.014, wave: "sine", d: 0.35 },
        ],
        noise: { type: "bandpass", freq: 5200, q: 1.3, g: 0.028, d: 0.022 },
        wide: 3, // 左右声道各偏几音分，听起来更宽
    },

    // 极光：一口会发光的钟。FM 钟体 + 左右失谐的一对 + 晚一拍才涨起来的高八度泛光
    aurora: {
        name: "极光", en: "Aurora", colorway: "jiguang", family: "合成",
        octave: 0, decay: 3.0, decayPitch: 0.3, holdScale: 1.8, release: 0.9, reverb: 0.68, gain: 1,
        attack: 0.02,
        fm: [{ c: 1, m: 2, index: 1.4, indexEnd: 0.25, indexTime: 1.6, g: 0.085, d: 1 }],
        partials: [
            { r: 1, g: 0.03, wave: "sine", d: 1, detune: -7 },
            { r: 1, g: 0.03, wave: "sine", d: 1, detune: 7 },
            { r: 2, g: 0.028, wave: "sine", d: 0.9, attack: 0.18 },
        ],
        wide: 6,
    },

    // 合成器：两根失谐锯齿进低通，截止频率一下子从很亮扫到很暗
    pluck: {
        name: "合成器", en: "Synth Pluck", colorway: "qinglan", family: "合成",
        octave: 0, decay: 0.95, decayPitch: 0.3, holdScale: 2.2, release: 0.25, reverb: 0.4, gain: 1,
        attack: 0.003,
        saws: { count: 2, detune: 9, g: 0.075, cutoff: 5200, cutoffEnd: 520, cutoffTime: 0.28, q: 3.5, d: 1 },
        partials: [{ r: 1, g: 0.05, wave: "sine", d: 0.8 }],
        wide: 5,
    },

    // 钢琴：泛音按真实琴弦的"拉伸"排布（越高越偏高一点），高泛音死得快，
    // 基音用两根微微失谐的弦一起响，再加琴槌敲弦的那一下
    piano: {
        name: "钢琴", en: "Piano", colorway: "classic", family: "键盘",
        octave: 0, decay: 3.4, decayPitch: 0.6, holdScale: 2.4, release: 0.3, reverb: 0.32, gain: 1,
        attack: 0.002,
        piano: { n: 9, inharm: 0.00045, g: 0.11 },
        noise: { type: "bandpass", freq: 1400, q: 0.9, g: 0.04, d: 0.018 },
        filter: { type: "lowpass", freq: 5400, q: 0.3, track: true },
    },

    // ================= B 组 =================
    // 吉他（尼龙弦）：拨弦偏暗、偏圆，外加一点琴箱的低频共鸣和指甲擦弦的沙声
    guitar: {
        name: "吉他", en: "Nylon Guitar", colorway: "hetao", family: "拨弦",
        octave: 0, decay: 2.3, decayPitch: 0.5, holdScale: 1.3, release: 0.25, reverb: 0.3, gain: 1,
        ks: { g: 0.2, brightness: 0.38, stretch: 0.45 },
        partials: [{ r: 1, g: 0.03, wave: "sine", d: 0.7 }],
        noise: { type: "bandpass", freq: 2400, q: 0.8, g: 0.03, d: 0.01 },
        filter: { type: "lowpass", freq: 3800, q: 0.6 },
    },

    // 古筝：亮的拨弦 + 左手的"按滑"（音从下面滑上来）+ 余音里的"吟揉"（慢慢摇起来的揉弦）
    guzheng: {
        name: "古筝", en: "Guzheng", colorway: "zhusha", family: "拨弦",
        octave: 0, decay: 3.0, decayPitch: 0.45, holdScale: 1.4, release: 0.45, reverb: 0.42, gain: 1,
        ks: { g: 0.17, brightness: 0.82, stretch: 0.18 },
        slide: { cents: 45, time: 0.07 },
        vibrato: { rate: 5.6, cents: 16, delay: 0.38 },
        noise: { type: "bandpass", freq: 3200, q: 1.2, g: 0.035, d: 0.008 },
        filter: { type: "lowpass", freq: 6800, q: 0.5 },
    },

    // 弦乐：三把失谐的锯齿（一个声部好几个人拉）慢慢起弓，揉弦晚一点才出来；按住就一直拉着
    strings: {
        name: "弦乐", en: "Strings", colorway: "jiuhong", family: "吹奏 · 拉弦",
        octave: 0, decay: 0.9, sustain: 0.82, oneShot: 1.1, release: 0.6, reverb: 0.52, gain: 1,
        attack: 0.13,
        saws: { count: 3, detune: 14, g: 0.05, cutoff: 2800, cutoffEnd: 1900, cutoffTime: 1.2, q: 0.6 },
        vibrato: { rate: 5.2, cents: 11, delay: 0.35 },
        wide: 6,
    },

    // 长笛：几乎纯净的正弦 + 一直跟着的气声，起音有一下"噗"的吐音；揉弦晚半拍出来
    flute: {
        name: "长笛", en: "Flute", colorway: "zhuqing", family: "吹奏 · 拉弦",
        octave: 1, decay: 0.6, sustain: 0.88, oneShot: 0.8, release: 0.18, reverb: 0.45, gain: 0.95,
        attack: 0.06,
        partials: [
            { r: 1, g: 0.13, wave: "sine", d: 1 },
            { r: 2, g: 0.018, wave: "sine", d: 1 },
            { r: 3, g: 0.008, wave: "sine", d: 1 },
        ],
        breath: { g: 0.018, ratio: 1.6, q: 1.6 },
        noise: { type: "bandpass", freq: 3000, q: 1.5, g: 0.03, d: 0.04 },
        vibrato: { rate: 5.0, cents: 13, delay: 0.28 },
    },

    // 管风琴：拉杆式的一排正弦（16'、8'、4'、2⅔'……）按住不衰减；
    // 旋转喇叭（Leslie）带出来的颤音 + 按键那一下"咔"
    organ: {
        name: "管风琴", en: "Organ", colorway: "jiaotang", family: "键盘",
        octave: 0, decay: 0.1, sustain: 1, oneShot: 0.9, release: 0.09, reverb: 0.5, gain: 0.9,
        attack: 0.01,
        partials: [
            { r: 0.5, g: 0.035, wave: "sine", d: 1 },
            { r: 1, g: 0.075, wave: "sine", d: 1 },
            { r: 2, g: 0.05, wave: "sine", d: 1 },
            { r: 3, g: 0.03, wave: "sine", d: 1 },
            { r: 4, g: 0.025, wave: "sine", d: 1 },
            { r: 6, g: 0.012, wave: "sine", d: 1 },
            { r: 8, g: 0.01, wave: "sine", d: 1 },
        ],
        noise: { type: "highpass", freq: 2200, q: 0.7, g: 0.03, d: 0.006 },
        tremolo: { rate: 6.2, depth: 0.2 },
        vibrato: { rate: 6.2, cents: 5, delay: 0 },
    },

    // 人声：锯齿波过三个共振峰（"啊"的 F1/F2/F3），慢起、揉音，像远处的合唱
    choir: {
        name: "人声", en: "Choir", colorway: "shengtang", family: "吹奏 · 拉弦",
        octave: 0, decay: 0.8, sustain: 0.9, oneShot: 1.2, release: 0.6, reverb: 0.6, gain: 1.1,
        attack: 0.13,
        saws: { count: 3, detune: 10, g: 0.06, cutoff: 4200, cutoffEnd: 4200, cutoffTime: 1, q: 0.4 },
        formants: [[800, 5, 1], [1150, 6, 0.6], [2900, 8, 0.28]],
        vibrato: { rate: 5.4, cents: 10, delay: 0.3 },
        wide: 5,
    },

    // 钢片琴：比八音盒更圆、更"夜"一点的小钟琴（《糖梅仙子》那个音色）
    celesta: {
        name: "钢片琴", en: "Celesta", colorway: "xingchen", family: "敲击",
        octave: 1, decay: 1.4, decayPitch: 0.4, holdScale: 1.5, release: 0.35, reverb: 0.5, gain: 0.95,
        attack: 0.002,
        partials: [
            { r: 1, g: 0.13, wave: "sine", d: 1 },
            { r: 2, g: 0.018, wave: "sine", d: 0.5 },
            { r: 4.0, g: 0.03, wave: "sine", d: 0.18 },
        ],
        noise: { type: "highpass", freq: 5200, q: 0.7, g: 0.02, d: 0.008 },
    },

    // 钢鼓：油桶敲出来的音，泛音 2、3 倍都略微跑偏，起音音高先高一点
    steelpan: {
        name: "钢鼓", en: "Steel Pan", colorway: "jialebi", family: "敲击",
        octave: 0, decay: 1.6, decayPitch: 0.4, holdScale: 1.4, release: 0.3, reverb: 0.35, gain: 1,
        attack: 0.003,
        blip: { cents: 25, time: 0.02 },
        partials: [
            { r: 1, g: 0.12, wave: "sine", d: 1 },
            { r: 2.0, g: 0.06, wave: "sine", d: 0.7 },
            { r: 2.98, g: 0.03, wave: "sine", d: 0.4 },
            { r: 4.1, g: 0.012, wave: "sine", d: 0.25 },
        ],
        noise: { type: "bandpass", freq: 1800, q: 1, g: 0.05, d: 0.015 },
    },

    // 贝斯：低八度的暗拨弦 + 一根正弦垫底，弹旋律时像爵士乐手的低音提琴
    bass: {
        name: "贝斯", en: "Bass", colorway: "jueshi", family: "拨弦",
        octave: -1, decay: 1.5, decayPitch: 0.35, holdScale: 1.3, release: 0.14, reverb: 0.16, gain: 1.15,
        ks: { g: 0.2, brightness: 0.26, stretch: 0.5 },
        partials: [{ r: 1, g: 0.06, wave: "sine", d: 0.8 }],
        noise: { type: "lowpass", freq: 700, q: 1, g: 0.05, d: 0.02 },
        filter: { type: "lowpass", freq: 1700, q: 0.7 },
    },

    // 铺底：五根失谐锯齿的"超级锯齿"，慢起慢收，滤波器自己缓缓呼吸——电影配乐里垫在最底下的那层
    pad: {
        name: "铺底", en: "Warm Pad", colorway: "xingyun", family: "合成",
        octave: 0, decay: 1.2, sustain: 0.9, oneShot: 1.6, release: 1.4, reverb: 0.7, gain: 1,
        attack: 0.55,
        saws: { count: 5, detune: 18, g: 0.034, cutoff: 1500, cutoffEnd: 950, cutoffTime: 2, q: 0.9, lfo: { rate: 0.23, depth: 480 } },
        wide: 8,
    },

    // 手风琴：两组簧片故意差几音分（musette），拍频就是它那种"晃"的味道；风箱给一点慢颤
    accordion: {
        name: "手风琴", en: "Accordion", colorway: "bali", family: "吹奏 · 拉弦",
        octave: 0, decay: 0.3, sustain: 0.95, oneShot: 0.8, release: 0.12, reverb: 0.3, gain: 0.95,
        attack: 0.035,
        saws: { count: 2, detune: 12, wave: "square", g: 0.05, cutoff: 2300, cutoffEnd: 2300, cutoffTime: 1, q: 0.7 },
        tremolo: { rate: 4.8, depth: 0.1 },
    },

    // ================= 关卡专用 =================
    // 星河（第 14 关）：一口 FM 钟敲下去，后面晚半拍才涨起来两层很远的"人声"正弦，像星空里有人在唱
    cosmos: {
        name: "星河", en: "Galaxy", colorway: "huanyu", family: "合成",
        octave: 0, decay: 3.2, decayPitch: 0.3, holdScale: 1.6, release: 1.0, reverb: 0.72, gain: 1,
        attack: 0.004,
        fm: [{ c: 1, m: 3.01, index: 1.3, indexEnd: 0.12, indexTime: 0.7, g: 0.075, d: 0.9 }],
        partials: [
            { r: 1, g: 0.035, wave: "sine", d: 1.2, attack: 0.28, detune: -5 },
            { r: 2, g: 0.022, wave: "sine", d: 1.1, attack: 0.34, detune: 6 },
            { r: 3, g: 0.008, wave: "sine", d: 0.9, attack: 0.4 },
        ],
        vibrato: { rate: 4.6, cents: 6, delay: 0.4 },
        wide: 7,
    },

    // 8-bit：游戏机的方波，起音先往上蹦一个五度——吃金币的那一声
    chip: {
        name: "8-bit", en: "Chiptune", colorway: "youxiji", family: "合成",
        octave: 0, decay: 0.7, decayPitch: 0.2, holdScale: 2.4, release: 0.08, reverb: 0.12, gain: 0.8,
        attack: 0.002,
        blip: { cents: 700, time: 0.03 },
        partials: [{ r: 1, g: 0.11, wave: "square", d: 1 }],
        filter: { type: "lowpass", freq: 6000, q: 0.3 },
    },
};

// 两组乐器：音乐模式里 F1–F12 选当前组的第几件，CapsLock 切换 A / B 组
export const INSTRUMENT_BANKS = [
    ["piano", "rhodes", "harp", "marimba", "musicbox", "vibes", "handpan", "kalimba", "pluck", "ember", "aurora", "glass"],
    ["guitar", "guzheng", "strings", "flute", "organ", "choir", "celesta", "steelpan", "bass", "pad", "accordion", "chip"],
];
export const INSTRUMENT_ORDER = INSTRUMENT_BANKS.flat();

// ---------------- 响度校准 ----------------
// 同一个音量下每件乐器听起来一样响：用 soundcheck.html 离线渲染、按 ITU-R BS.1770 量出来的（LUFS）。
// 量的是"一句旋律的整体响度 × 0.5 + 长音最响那 0.4 秒 × 0.3 + 快速点按最响那 0.4 秒 × 0.2"，
// 对齐到二十四件的中位数。改了哪件乐器的配方，到声音检测页重新量一遍、把这里的数换掉
export const LOUDNESS_TRIM = {
    piano: 0.854, rhodes: 1.07, harp: 1.095, marimba: 1, musicbox: 1.026, vibes: 0.864,
    handpan: 0.597, kalimba: 0.833, pluck: 1.03, ember: 1.074, aurora: 0.976, glass: 0.862,
    guitar: 1.095, guzheng: 0.963, strings: 1.492, flute: 0.833, organ: 0.907, choir: 1.451,
    celesta: 1.188, steelpan: 0.883, bass: 0.751, pad: 1.875, accordion: 1.077, chip: 1.195,
    cosmos: 1.138,
};
Object.entries(LOUDNESS_TRIM).forEach(([id, v]) => { if (INSTRUMENTS[id]) INSTRUMENTS[id].level = v; });

// ---------------- 效果链的几档预设 ----------------
// 混响的几种空间：时长、亮度、早期反射
const REVERBS = {
    room: { seconds: 1.1, bright: 0.78, pre: 0.008 },
    hall: { seconds: 2.6, bright: 0.72, pre: 0.018 },
    cathedral: { seconds: 5.4, bright: 0.6, pre: 0.035 },
    plate: { seconds: 1.9, bright: 0.9, pre: 0.004 },
};

// 音色（"画风"）：低架 / 中峰 / 高架（dB）+ 磁带饱和的量
export const TONES = {
    clear: { name: "清澈", low: 0, mid: 0, high: 0, sat: 0 },
    warm: { name: "温暖", low: 3, mid: -1, high: -4.5, sat: 0.3 },
    bright: { name: "明亮", low: -1, mid: 1.5, high: 4.5, sat: 0 },
    vintage: { name: "复古", low: -3, mid: 3, high: -8, sat: 0.55 },
};

// ---------------- 工具 ----------------
function makeNoise(ctx, seconds = NOISE_SECONDS, color = "white") {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (color === "pink") {
            // Paul Kellet 的简化粉噪声：每倍频程 -3dB，比白噪声柔和
            b0 = 0.99765 * b0 + w * 0.099046;
            b1 = 0.963 * b1 + w * 0.2965164;
            b2 = 0.57 * b2 + w * 1.0526913;
            d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        } else if (color === "brown") {
            last = (last + 0.02 * w) / 1.02;
            d[i] = last * 3.5;
        } else {
            d[i] = w;
        }
    }
    return buf;
}

// 混响脉冲：立体声；前几十毫秒几次早期反射，后面是一段越来越暗的漫反射尾巴
// （高频比低频先消失，所以尾巴是暖的，不是一片白噪声）
function makeReverb(ctx, { seconds, bright }) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, len, sr);
    const taps = [
        [0.011, 0.42], [0.017, 0.33], [0.026, 0.27], [0.037, 0.22],
        [0.049, 0.17], [0.061, 0.13], [0.073, 0.1],
    ];
    const tapScale = Math.min(1.6, seconds / 2.6);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        taps.forEach(([t, a]) => {
            const idx = Math.floor((t * tapScale + (ch ? 0.0017 : 0) + Math.random() * 0.0015) * sr);
            if (idx < len) d[idx] += a * (Math.random() < 0.5 ? -1 : 1);
        });
        let lp = 0;
        for (let i = 0; i < len; i++) {
            const t = i / sr;
            const env = Math.exp((-6.9 * t) / seconds);
            const build = t < 0.03 ? t / 0.03 : 1;
            const a = bright - (bright - 0.12) * (t / seconds); // 越往后越暗
            lp += a * ((Math.random() * 2 - 1) - lp);
            d[i] += lp * env * build * 0.55;
        }
    }
    return buf;
}

// 等响度粗补偿：同样的增益，高音听着更抓耳、低音更闷
function pitchTilt(freq) {
    return Math.pow(440 / Math.min(4000, Math.max(60, freq)), 0.18);
}

// 饱和曲线：tanh，amount 越大越"脏"。除以 k 让小信号的增益保持 1——
// 只压峰值、不把整体推响，不然切到"复古"音量会突然大一截
function satCurve(amount) {
    const n = 1024;
    const curve = new Float32Array(n);
    const k = 1 + amount * 6;
    for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(k * x) / k;
    }
    return curve;
}

// ============================================================
export class AudioEngine {
    // context：传一个现成的（比如 OfflineAudioContext）就直接用它——声音检测页靠这个把乐器离线渲染出来量响度
    constructor({ context = null } = {}) {
        this.ctx = null;
        this.volume = 0.9;
        this.muted = false;
        this.voices = new Set();
        this.ksCache = new Map();
        this.fx = { reverb: "hall", reverbMix: 1, echo: 0, width: 1, bloom: 0, tone: "clear", cinematic: false };
        this.amb = { name: "off", level: 0.6, nodes: null, timers: [] };
        this.onState = null; // (state) => void：给界面用，Safari 切回来暂停时提示"点一下恢复"
        this._lastTime = 0;
        this._lastCheck = 0;
        this.offline = !!context;
        if (context) {
            this.ctx = context;
            this._build(context);
        }
    }

    ensure() {
        if (this.ctx) {
            // Safari 切到别的标签页再回来，状态会变成 "interrupted"（WebKit 特有）或 "suspended"，
            // 以前只认 "suspended"，于是 Safari 回来就一直没声音
            if (this.ctx.state !== "running" && !this.offline) this._resume();
            return this.ctx;
        }
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        // iOS / macOS Safari：网页音频默认走"环境音"通道，静音键一拨就没声音；声明成"播放"
        try {
            if (navigator.audioSession) navigator.audioSession.type = "playback";
        } catch (err) { /* 老版本没有这个 API */ }
        const ctx = new Ctx({ latencyHint: "interactive" });
        this.ctx = ctx;
        this._build(ctx);
        ctx.onstatechange = () => {
            if (this.onState) this.onState(ctx.state);
        };
        // 环境声可能在音频还没建起来时就选好了：现在补上
        if (this.amb.name !== "off") {
            const name = this.amb.name;
            this.amb.name = "off";
            this.setAmbience(name, this.amb.level);
        }
        return ctx;
    }

    // 每次用户手势（点、按键）都调一下：Safari 只允许在手势里恢复音频
    unlock() {
        const ctx = this.ctx;
        if (!ctx || this.offline) return;
        if (ctx.state !== "running") {
            this._resume();
            return;
        }
        // 还有一种更阴的情况：状态写着 running，时钟却停着（iOS 从后台回来偶发）。
        // 隔半秒以上检查一次时钟有没有走，没走就整个重建
        const now = performance.now();
        if (now - this._lastCheck > 500) {
            if (this._lastCheck && ctx.currentTime === this._lastTime && !document.hidden) this._rebuild();
            this._lastCheck = now;
            this._lastTime = this.ctx ? this.ctx.currentTime : 0;
        }
    }

    _resume() {
        const ctx = this.ctx;
        if (!ctx || this._resuming) return;
        this._resuming = true;
        const p = ctx.resume();
        const done = () => { this._resuming = false; };
        if (p && p.then) p.then(done, done);
        else done();
    }

    _rebuild() {
        const old = this.ctx;
        this.voices.clear();
        this.ksCache.clear();
        this._stopAmbience(true);
        this.ctx = null;
        try { old.close(); } catch (err) { /* 已经关了 */ }
        this.ensure(); // 会顺手把环境声接回来
    }

    now() {
        return this.ctx ? this.ctx.currentTime : 0;
    }

    // ---------------- 总线 ----------------
    _build(ctx) {
        this.noise = makeNoise(ctx, NOISE_SECONDS, "white");
        this.ksCache.clear();
        this.verbs = {};

        // 所有声部汇到 dry；送混响、送回声、送"氛围长尾"各一条支路
        this.dry = new GainNode(ctx, { gain: 1 });
        this.reverbIn = new GainNode(ctx, { gain: 1 });
        this.echoIn = new GainNode(ctx, { gain: 0 });
        this.bloomIn = new GainNode(ctx, { gain: 0 });

        // 汇总 → 音色（低架 / 中峰 / 高架 + 并联饱和）→ 宽度（M/S）→ 限幅 → 音量
        this.mix = new GainNode(ctx, { gain: 1 });
        this.eqLow = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: 180, gain: 1.5 });
        this.eqMid = new BiquadFilterNode(ctx, { type: "peaking", frequency: 1800, Q: 0.8, gain: 0 });
        this.eqHigh = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 6500, gain: 1.2 });
        this.satDry = new GainNode(ctx, { gain: 1 });
        this.satWet = new GainNode(ctx, { gain: 0 });
        // 不开过采样：过采样会让这一路比并联的干声晚 ~3ms，两路一叠就成了梳状滤波（温暖 / 复古两档声音发空、发"相位"）。
        // 这条曲线很温和、又只混进来两三成，混叠听不出来
        this.shaper = new WaveShaperNode(ctx, { curve: satCurve(0.4), oversample: "none" });
        this.satOut = new GainNode(ctx, { gain: 1 });
        this.dry.connect(this.mix);
        this.mix.connect(this.eqLow).connect(this.eqMid).connect(this.eqHigh);
        this.eqHigh.connect(this.satDry).connect(this.satOut);
        this.eqHigh.connect(this.shaper).connect(this.satWet).connect(this.satOut);

        // 立体声宽度：L' = a·L + b·R，R' = b·L + a·R；a = (1+w)/2，b = (1-w)/2
        const split = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
        const merge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
        this.wLL = new GainNode(ctx, { gain: 1 });
        this.wRR = new GainNode(ctx, { gain: 1 });
        this.wLR = new GainNode(ctx, { gain: 0 });
        this.wRL = new GainNode(ctx, { gain: 0 });
        this.satOut.connect(split);
        split.connect(this.wLL, 0).connect(merge, 0, 0);
        split.connect(this.wLR, 0).connect(merge, 0, 1);
        split.connect(this.wRR, 1).connect(merge, 0, 1);
        split.connect(this.wRL, 1).connect(merge, 0, 0);

        const limiter = new DynamicsCompressorNode(ctx, {
            threshold: -10, knee: 6, ratio: 12, attack: 0.003, release: 0.25,
        });
        this.master = new GainNode(ctx, { gain: this.muted ? 0 : this.volume });
        merge.connect(limiter).connect(this.master).connect(ctx.destination);
        // 声音检测：量"真正送到扬声器的那一路"。分析器只在被读的时候才算，平时不花力气
        this.analyser = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0 });
        this.master.connect(this.analyser);

        // 混响支路：切掉低频 → 预延迟 → 卷积（按空间大小切换，交叉淡化）→ 回到汇总
        this.verbCut = new BiquadFilterNode(ctx, { type: "highpass", frequency: 260 });
        this.verbPre = new DelayNode(ctx, { delayTime: 0.018, maxDelayTime: 0.2 });
        this.reverbIn.connect(this.verbCut).connect(this.verbPre);
        this.verbReturn = new GainNode(ctx, { gain: 0.62 });
        this.verbReturn.connect(this.mix);
        this.verbCurrent = null;

        // 回声：乒乓延迟，每一跳暗一点，左右交替
        this.echoL = new DelayNode(ctx, { delayTime: 0.36, maxDelayTime: 1.5 });
        this.echoR = new DelayNode(ctx, { delayTime: 0.36, maxDelayTime: 1.5 });
        this.echoFb = new GainNode(ctx, { gain: 0.38 });
        this.echoDamp = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 3200, Q: 0.5 });
        const echoMerge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
        this.echoOut = new GainNode(ctx, { gain: 0.8 });
        this.echoIn.connect(this.echoL);
        this.echoL.connect(this.echoR);
        this.echoR.connect(this.echoDamp).connect(this.echoFb).connect(this.echoL);
        this.echoL.connect(echoMerge, 0, 0);
        this.echoR.connect(echoMerge, 0, 1);
        echoMerge.connect(this.echoOut).connect(this.mix);
        // 回声也进一点混响，不然每一跳都是干的，像在浴室里
        this.echoOut.connect(this.reverbIn);

        // 氛围长尾：一个特别长、特别亮的空间，只收高频，听起来像音符后面拖着一层光
        this.bloomCut = new BiquadFilterNode(ctx, { type: "highpass", frequency: 900 });
        this.bloomVerb = null;
        this.bloomOut = new GainNode(ctx, { gain: 0.9 });
        this.bloomIn.connect(this.bloomCut);
        this.bloomOut.connect(this.mix);

        // 环境声独立一条，不进混响（它本身就是"空间"）
        this.ambBus = new GainNode(ctx, { gain: 0 });
        this.ambBus.connect(this.mix);

        this._applyFx(true);
    }

    setVolume(v) {
        this.volume = Math.min(1, Math.max(0, v));
        this._applyGain();
    }

    setMuted(m) {
        this.muted = m;
        this._applyGain();
        if (m) this.releaseAll();
    }

    _applyGain() {
        if (!this.master) return;
        // 平滑过渡，拖滑杆时不咔哒
        this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.015);
    }

    releaseAll() {
        [...this.voices].forEach((v) => v.release());
    }

    // 从"排好一个音"到"耳朵听见"要多久（秒），分三段：
    //   base     浏览器自己的音频缓冲（一般 3–12 ms）
    //   output   系统和输出设备：外放、有线耳机一般 10–40 ms；蓝牙耳机常见 100–300 ms
    //   limiter  混音链末尾的限幅器（DynamicsCompressor）规定要"往前看"6 ms
    // 报不出 outputLatency 的浏览器（老 Safari）用 getOutputTimestamp 推一个
    latency() {
        const ctx = this.ctx;
        if (!ctx || this.offline) return null;
        const base = ctx.baseLatency || 0;
        let output = ctx.outputLatency;
        let source = "outputLatency";
        if (!(output > 0) && ctx.getOutputTimestamp && ctx.state === "running") {
            const ts = ctx.getOutputTimestamp();
            if (ts && ts.performanceTime > 0) {
                // 此刻正从扬声器出来的是 contextTime + 这段时间走过的；和 currentTime 差多少就是整条链路的延迟
                const heard = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
                output = Math.max(0, ctx.currentTime - heard - base);
                source = "timestamp";
            }
        }
        if (!(output >= 0)) {
            output = 0;
            source = "unknown";
        }
        return { base, output, limiter: LIMITER_LOOKAHEAD, total: base + output + LIMITER_LOOKAHEAD, source };
    }

    // 此刻送到扬声器的电平：{ rms, peak }（dBFS）；还没建音频或被挂起时返回 null
    meter() {
        if (!this.analyser) return null;
        const a = this.analyser;
        const buf = this._meterBuf || (this._meterBuf = new Float32Array(a.fftSize));
        a.getFloatTimeDomainData(buf);
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
            const v = buf[i];
            sum += v * v;
            if (Math.abs(v) > peak) peak = Math.abs(v);
        }
        const db = (x) => (x > 1e-9 ? 20 * Math.log10(x) : -Infinity);
        return { rms: db(Math.sqrt(sum / buf.length)), peak: db(peak), state: this.ctx.state };
    }

    // ---------------- 效果 ----------------
    // fx: { reverb: off|room|hall|cathedral|plate, echo: 0..1, width: 0.6..1.8, bloom: 0..1, tone, cinematic }
    setFx(fx) {
        Object.assign(this.fx, fx);
        if (this.ctx) this._applyFx(false);
    }

    // 过关的梦境：音符后面临时拖一条很长、很亮的尾巴（0 = 恢复成风格面板里的设置）
    setDreamTail(amount) {
        if (amount === (this.dreamTail || 0)) return;
        this.dreamTail = amount;
        if (this.ctx && !this.offline) this._applyFx(false);
    }

    _applyFx(instant) {
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const k = instant ? 0.001 : 0.12;
        const f = this.fx;
        const cine = !!f.cinematic;

        // 混响：电影感强制用教堂那么大的空间
        const size = cine ? "cathedral" : f.reverb;
        this._setVerb(size === "off" ? null : size, instant);
        this.verbReturn.gain.setTargetAtTime(size === "off" ? 0 : (cine ? 0.9 : 0.62) * (f.reverbMix ?? 1), t, k);

        // 回声
        const echo = Math.min(1, Math.max(0, f.echo || 0));
        this.echoIn.gain.setTargetAtTime(echo > 0 ? 0.22 + echo * 0.2 : 0, t, k);
        this.echoFb.gain.setTargetAtTime(0.28 + echo * 0.24, t, k);

        // 氛围长尾（过关的梦境里临时拉起来一截）
        const bloom = Math.max(f.bloom || 0, cine ? 0.7 : 0, this.dreamTail || 0);
        if (bloom > 0 && !this.bloomVerb) {
            this.bloomVerb = new ConvolverNode(ctx, { buffer: makeReverb(ctx, { seconds: 6.5, bright: 0.95 }) });
            this.bloomCut.connect(this.bloomVerb).connect(this.bloomOut);
        }
        this.bloomIn.gain.setTargetAtTime(bloom * 0.55, t, k);

        // 音色
        const tone = TONES[f.tone] || TONES.clear;
        this.eqLow.gain.setTargetAtTime(1.5 + tone.low + (cine ? 3 : 0), t, k);
        this.eqLow.frequency.setTargetAtTime(cine ? 110 : 180, t, k);
        this.eqMid.gain.setTargetAtTime(tone.mid, t, k);
        this.eqMid.frequency.setTargetAtTime(f.tone === "vintage" ? 1200 : 1800, t, k);
        this.eqHigh.gain.setTargetAtTime(1.2 + tone.high + (cine ? 1.5 : 0), t, k);
        if (tone.sat > 0) this.shaper.curve = satCurve(tone.sat);
        this.satWet.gain.setTargetAtTime(tone.sat * 0.6, t, k);
        this.satDry.gain.setTargetAtTime(1 - tone.sat * 0.35, t, k);

        // 宽度（1 = 原样；>1 加宽；电影感再宽一点）
        const w = Math.min(1.9, Math.max(0.5, (f.width || 1) * (cine ? 1.25 : 1)));
        const a = (1 + w) / 2;
        const b = (1 - w) / 2;
        this.wLL.gain.setTargetAtTime(a, t, k);
        this.wRR.gain.setTargetAtTime(a, t, k);
        this.wLR.gain.setTargetAtTime(b, t, k);
        this.wRL.gain.setTargetAtTime(b, t, k);
    }

    _setVerb(size, instant) {
        const ctx = this.ctx;
        if (size === (this.verbCurrent && this.verbCurrent.size)) return;
        const t = ctx.currentTime;
        const old = this.verbCurrent;
        if (old) {
            old.gain.gain.setTargetAtTime(0, t, instant ? 0.001 : 0.15);
            // 淡完再断开，没信号的卷积器照样吃 CPU
            setTimeout(() => {
                if (this.verbCurrent !== old) {
                    try { this.verbPre.disconnect(old.conv); } catch (err) { /* 已断开 */ }
                }
            }, 900);
        }
        if (!size) {
            this.verbCurrent = null;
            return;
        }
        let v = this.verbs[size];
        if (!v) {
            const spec = REVERBS[size];
            v = {
                size,
                conv: new ConvolverNode(ctx, { buffer: makeReverb(ctx, spec) }),
                gain: new GainNode(ctx, { gain: 0 }),
            };
            v.conv.connect(v.gain).connect(this.verbReturn);
            this.verbs[size] = v;
        }
        try { this.verbPre.connect(v.conv); } catch (err) { /* 已连 */ }
        this.verbPre.delayTime.setTargetAtTime(REVERBS[size].pre, t, 0.05);
        v.gain.gain.setTargetAtTime(1, t, instant ? 0.001 : 0.15);
        this.verbCurrent = v;
    }

    // ---------------- 发一个音 ----------------
    // opts: { when, velocity, pan, hold, length }
    //   hold    按住模式：音会拉长，等 release() 才收（踏板、长按都走这里）
    //   length  单发模式下鸣响时长的倍数（收尾小音、终曲琶音会用到）
    play(patchId, freq, opts = {}) {
        const ctx = this.ensure();
        if (!ctx || this.muted) return null;
        const P = INSTRUMENTS[patchId] || INSTRUMENTS.ember;
        const { when = 0, velocity = 1, pan = 0, hold = false, length = 1 } = opts;
        const f = freq * Math.pow(2, P.octave || 0);
        const t0 = ctx.currentTime + Math.max(0, when);
        const sustained = P.sustain != null;
        const decay = sustained
            ? P.decay
            : P.decay * Math.pow(440 / f, P.decayPitch || 0) * (hold ? P.holdScale : length);
        const tilt = pitchTilt(f) * (P.gain || 1) * velocity;
        // 会一直响的乐器单发时：响 oneShot 秒再收
        const relAt = sustained && !hold ? t0 + (P.oneShot || 0.9) * length : null;

        // 声部内部的链路：各积木 → mix → [滤波] → [颤音] → 收尾总闸 → 声像 → 干声 + 各支路
        const nodes = [];
        const sources = [];
        // level：响度校准（见文件末尾的 LOUDNESS_TRIM），整件乐器一起放大缩小，不动它内部各部分的比例
        const mix = new GainNode(ctx, { gain: P.level || 1 });
        nodes.push(mix);
        let tail = mix;
        if (P.filter) {
            const fq = P.filter.track ? Math.min(12000, P.filter.freq * (0.55 + velocity * 0.6)) : P.filter.freq;
            const flt = new BiquadFilterNode(ctx, { type: P.filter.type, frequency: fq, Q: P.filter.q || 0.7, gain: P.filter.gain || 0 });
            tail.connect(flt);
            tail = flt;
            nodes.push(flt);
        }
        if (P.tremolo) {
            const trem = new GainNode(ctx, { gain: 1 - P.tremolo.depth / 2 });
            const lfo = new OscillatorNode(ctx, { type: "sine", frequency: P.tremolo.rate });
            const depth = new GainNode(ctx, { gain: P.tremolo.depth / 2 });
            lfo.connect(depth).connect(trem.gain);
            tail.connect(trem);
            tail = trem;
            lfo.start(t0);
            sources.push(lfo);
            nodes.push(trem, depth);
        }
        const gate = new GainNode(ctx, { gain: 1 });
        const panner = new StereoPannerNode(ctx, { pan: Math.max(-1, Math.min(1, pan)) });
        tail.connect(gate).connect(panner);
        panner.connect(this.dry);
        const send = new GainNode(ctx, { gain: P.reverb || 0 });
        panner.connect(send).connect(this.reverbIn);
        const echoSend = new GainNode(ctx, { gain: 0.7 });
        panner.connect(echoSend).connect(this.echoIn);
        const bloomSend = new GainNode(ctx, { gain: 0.8 });
        panner.connect(bloomSend).connect(this.bloomIn);
        nodes.push(gate, panner, send, echoSend, bloomSend);

        let end = t0 + 0.05;
        // 包络：衰减型 = 起音后一路往 0 走；持续型 = 起音 → 落到持续电平 → 一直保持到松手
        const env = (gainNode, peak, dur, attack, curve) => {
            const g = gainNode.gain;
            const a = Math.max(0.001, attack);
            if (sustained) {
                g.setValueAtTime(0, t0);
                g.linearRampToValueAtTime(peak, t0 + a);
                g.setTargetAtTime(peak * P.sustain, t0 + a, Math.max(0.02, P.decay / 3));
                end = Math.max(end, relAt || t0 + 16);
                return;
            }
            if (curve === "exp") {
                g.setValueAtTime(0.0001, t0);
                g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.min(a, dur * 0.5));
            } else {
                g.setValueAtTime(0, t0);
                g.linearRampToValueAtTime(peak, t0 + a);
            }
            g.exponentialRampToValueAtTime(0.0001, t0 + a + dur);
            end = Math.max(end, t0 + a + dur);
        };

        // 揉弦：一个 LFO 同时推所有振荡器的 detune
        let vib = null;
        if (P.vibrato) {
            const lfo = new OscillatorNode(ctx, { type: "sine", frequency: P.vibrato.rate });
            vib = new GainNode(ctx, { gain: 0 });
            vib.gain.setValueAtTime(0, t0);
            vib.gain.linearRampToValueAtTime(P.vibrato.cents, t0 + (P.vibrato.delay || 0) + 0.3);
            lfo.connect(vib);
            lfo.start(t0);
            sources.push(lfo);
            nodes.push(vib);
        }
        const osc = (type, frequency, detune = 0) => {
            const o = new OscillatorNode(ctx, { type, frequency, detune });
            if (vib) vib.connect(o.detune);
            if (P.slide) {
                o.detune.setValueAtTime(detune - P.slide.cents, t0);
                o.detune.linearRampToValueAtTime(detune, t0 + P.slide.time);
            }
            sources.push(o);
            return o;
        };
        const wide = P.wide || 0;
        // 高过奈奎斯特频率（采样率的一半）的振荡器听不见，还会折回来变成刺耳的杂音：高音区的高次泛音直接不要
        const nyq = ctx.sampleRate * 0.45;

        // ---- 加法泛音 ----
        (P.partials || []).forEach((p, i) => {
            if (f * p.r * (P.blip && i === 0 ? Math.pow(2, P.blip.cents / 1200) : 1) > nyq) return;
            const o = osc(p.wave || "sine", f * p.r, (p.detune || 0) + (wide ? (i % 2 ? wide : -wide) : 0));
            if (P.blip && i === 0) {
                o.frequency.setValueAtTime(f * p.r * Math.pow(2, P.blip.cents / 1200), t0);
                o.frequency.exponentialRampToValueAtTime(f * p.r, t0 + P.blip.time);
            }
            const g = new GainNode(ctx, { gain: 0 });
            env(g, p.g * tilt, decay * (p.d || 1), p.attack || P.attack || 0.005, P.curve);
            o.connect(g).connect(mix);
            o.start(t0);
            nodes.push(g);
        });

        // ---- 调频 ----
        (P.fm || []).forEach((op) => {
            if (f * op.c > nyq) return;
            const car = osc("sine", f * op.c);
            const fmod = f * op.m;
            // 调制波本身超出奈奎斯特：只留载波（这么高的音，调制出来的边带也都听不见了）
            if (fmod <= nyq) {
                const mod = osc("sine", fmod);
                const dev = new GainNode(ctx, { gain: 0 });
                dev.gain.setValueAtTime(op.index * fmod, t0);
                dev.gain.exponentialRampToValueAtTime(Math.max(0.01, op.indexEnd * fmod), t0 + op.indexTime * (hold ? 1.4 : 1));
                mod.connect(dev).connect(car.frequency);
                mod.start(t0);
                nodes.push(dev);
            }
            const g = new GainNode(ctx, { gain: 0 });
            env(g, op.g * tilt, decay * (op.d || 1), P.attack || 0.005, P.curve);
            car.connect(g).connect(mix);
            car.start(t0);
            nodes.push(g);
        });

        // ---- 钢琴：拉伸泛音 + 双弦 ----
        if (P.piano) {
            const pp = P.piano;
            const B = pp.inharm * Math.pow(f / 261.6, 0.6);
            for (let n = 1; n <= pp.n; n++) {
                const fn = f * n * Math.sqrt(1 + B * n * n);
                if (fn > 16000) break;
                const amp = pp.g * tilt * Math.pow(n, -1.15) * (n === 2 ? 0.85 : 1) * (0.7 + velocity * 0.3 * Math.min(1, n / 3));
                const dn = decay / (1 + 0.42 * (n - 1));
                const strings = n === 1 ? [-1.6, 1.6] : [0];
                strings.forEach((dt) => {
                    const o = osc("sine", fn, dt);
                    const g = new GainNode(ctx, { gain: 0 });
                    env(g, amp / strings.length, dn, P.attack, "lin");
                    o.connect(g).connect(mix);
                    o.start(t0);
                    nodes.push(g);
                });
            }
        }

        // ---- 减法：失谐锯齿 / 方波 → 低通（可选：共振峰、滤波器呼吸）----
        if (P.saws) {
            const s = P.saws;
            const flt = new BiquadFilterNode(ctx, { type: "lowpass", frequency: s.cutoff, Q: s.q });
            flt.frequency.setValueAtTime(s.cutoff, t0);
            if (s.cutoffEnd !== s.cutoff) {
                flt.frequency.exponentialRampToValueAtTime(s.cutoffEnd, t0 + s.cutoffTime * (hold ? 1.6 : 1));
            }
            if (s.lfo) {
                const lfo = new OscillatorNode(ctx, { type: "sine", frequency: s.lfo.rate });
                const depth = new GainNode(ctx, { gain: s.lfo.depth });
                lfo.connect(depth).connect(flt.frequency);
                lfo.start(t0);
                sources.push(lfo);
                nodes.push(depth);
            }
            const g = new GainNode(ctx, { gain: 0 });
            env(g, s.g * tilt, decay * (s.d || 1), P.attack, "lin");
            const count = s.count || 2;
            for (let i = 0; i < count; i++) {
                const spread = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
                const o = osc(s.wave || "sawtooth", f, spread * s.detune);
                o.connect(flt);
                o.start(t0);
            }
            if (P.formants) {
                // 人声：同一个声源并联过三个共振峰
                const sum = new GainNode(ctx, { gain: 2.2 });
                P.formants.forEach(([ff, q, fg]) => {
                    const bp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: ff, Q: q });
                    const bg = new GainNode(ctx, { gain: fg });
                    flt.connect(bp).connect(bg).connect(sum);
                    nodes.push(bp, bg);
                });
                sum.connect(g);
                nodes.push(sum);
            } else {
                flt.connect(g);
            }
            g.connect(mix);
            nodes.push(flt, g);
        }

        // ---- 物理建模拨弦 ----
        if (P.ks) {
            const { buffer, rate } = this._ks(f, sustained ? 3 : decay, P.ks);
            const src = new AudioBufferSourceNode(ctx, { buffer, playbackRate: rate });
            // 拨弦没有振荡器可推，滑音和揉弦改走 playbackRate
            if (P.slide) {
                src.playbackRate.setValueAtTime(rate * Math.pow(2, -P.slide.cents / 1200), t0);
                src.playbackRate.linearRampToValueAtTime(rate, t0 + P.slide.time);
            }
            if (P.vibrato) {
                const lfo = new OscillatorNode(ctx, { type: "sine", frequency: P.vibrato.rate });
                const depth = new GainNode(ctx, { gain: 0 });
                const amt = rate * (Math.pow(2, P.vibrato.cents / 1200) - 1);
                depth.gain.setValueAtTime(0, t0);
                depth.gain.linearRampToValueAtTime(amt, t0 + (P.vibrato.delay || 0) + 0.4);
                lfo.connect(depth).connect(src.playbackRate);
                lfo.start(t0);
                sources.push(lfo);
                nodes.push(depth);
            }
            const g = new GainNode(ctx, { gain: P.ks.g * tilt * 1.6 });
            src.connect(g).connect(mix);
            src.start(t0);
            sources.push(src);
            nodes.push(g);
            end = Math.max(end, t0 + buffer.duration / rate);
        }

        // ---- 吹管的气声：跟着音一直在 ----
        if (P.breath) {
            const b = P.breath;
            const src = new AudioBufferSourceNode(ctx, { buffer: this.noise, loop: true });
            const bp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: Math.min(9000, f * b.ratio), Q: b.q });
            const g = new GainNode(ctx, { gain: 0 });
            env(g, b.g * velocity, decay, P.attack, "lin");
            src.connect(bp).connect(g).connect(mix);
            src.start(t0, Math.random() * (NOISE_SECONDS - 0.2));
            sources.push(src);
            nodes.push(bp, g);
        }

        // ---- 击打噪声 ----
        if (P.noise) {
            const n = P.noise;
            const src = new AudioBufferSourceNode(ctx, { buffer: this.noise });
            const flt = new BiquadFilterNode(ctx, { type: n.type, frequency: n.freq, Q: n.q });
            const g = new GainNode(ctx, { gain: 0 });
            g.gain.setValueAtTime(0, t0);
            g.gain.linearRampToValueAtTime(n.g * velocity, t0 + 0.0015);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d + 0.002);
            src.connect(flt).connect(g).connect(mix);
            src.start(t0, Math.random() * (NOISE_SECONDS - 0.2), n.d + 0.05);
            // 噪声自己带时长，只放进 nodes 等着一起断开，不参与"最后一个停下才收拾"的判断
            nodes.push(src, flt, g);
        }

        // ---- 氛围感打开时：每个音后面再浮起一层高八度的光晕 ----
        const bloom = Math.max(this.fx.bloom || 0, this.fx.cinematic ? 0.7 : 0);
        if (bloom > 0 && patchId !== "chip") {
            const o = osc("sine", f * 2, wide ? 4 : 0);
            const g = new GainNode(ctx, { gain: 0 });
            const peak = 0.014 * bloom * tilt;
            g.gain.setValueAtTime(0, t0);
            g.gain.linearRampToValueAtTime(peak, t0 + 0.45);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45 + Math.max(1.2, sustained ? 3 : decay * 1.2));
            o.connect(g).connect(mix);
            o.start(t0);
            nodes.push(g);
            end = Math.max(end, t0 + 0.45 + Math.max(1.2, sustained ? 3 : decay * 1.2));
        }

        // 哨兵：一个不接任何地方的静音源，和所有有音高的源同时停。
        // 收拾（断开整条链路）挂在它的 onended 上——不能挂在"最后建的那个源"上，
        // 那可能是只响几十毫秒的琴槌噪声，整个音会在 70ms 后被拔线
        const sentinel = new ConstantSourceNode(ctx, { offset: 0 });
        sentinel.start(t0);
        sources.push(sentinel);

        const rel = P.release || 0.25;
        const voice = {
            t0,
            hold,
            released: false,
            end,
            release: (time) => {
                if (voice.released) return;
                voice.released = true;
                this.voices.delete(voice);
                const t = Math.max(ctx.currentTime, time || 0);
                // 从当前音量接着往下收，松手瞬间才不会咔哒一声
                gate.gain.cancelScheduledValues(t);
                gate.gain.setValueAtTime(gate.gain.value, t);
                gate.gain.setTargetAtTime(0, t, rel / 4);
                stopAll(t + rel + 0.05);
            },
        };
        let stopped = false;
        const stopAll = (at) => {
            if (stopped && at >= voice.stopAt) return;
            stopped = true;
            voice.stopAt = at;
            sources.forEach((s) => {
                try { s.stop(at); } catch (err) { /* 已经停过了 */ }
            });
        };
        sentinel.onended = () => {
            nodes.forEach((n) => { try { n.disconnect(); } catch (err) { /* 已断开 */ } });
            sources.forEach((s) => { try { s.disconnect(); } catch (err) { /* 已断开 */ } });
            this.voices.delete(voice);
        };
        if (relAt) {
            // 持续型乐器的单发：到点自己松手
            gate.gain.setValueAtTime(1, relAt);
            gate.gain.setTargetAtTime(0, relAt, rel / 4);
            stopAll(relAt + rel + 0.05);
        } else {
            // 单发的音到时间自己停；按住的音也设一道保险丝，键卡住了也不会一直占着
            stopAll(hold ? t0 + Math.max(end - t0, 16) : end + 0.05);
        }

        this.voices.add(voice);
        // 同时响的声部太多就把最早的收掉，免得在快速连弹时把机器拖慢
        if (this.voices.size > 48) {
            const oldest = this.voices.values().next().value;
            if (oldest) oldest.release(ctx.currentTime);
        }
        return voice;
    }

    // Karplus-Strong：在延迟线里反复做"两点平均 × 损耗"，一段噪声就变成了一根弦
    _ks(freq, decay, spec) {
        const ctx = this.ctx;
        const key = `${Math.round(freq * 10)}|${Math.round(decay * 10)}|${spec.brightness}|${spec.stretch}`;
        if (this.ksCache.has(key)) {
            const hit = this.ksCache.get(key);
            this.ksCache.delete(key); // 挪到最后，最近用过的留得最久
            this.ksCache.set(key, hit);
            return hit;
        }
        const sr = 32000; // 拨弦里没有 16k 以上的东西，低一点的采样率省一半内存
        const S = spec.stretch != null ? spec.stretch : 0.5;
        const N = Math.max(2, Math.round(sr / freq - S));
        const T60 = Math.max(0.4, decay);
        const seconds = Math.min(4, T60 * 1.15);
        const len = Math.floor(sr * seconds);
        const buffer = ctx.createBuffer(1, len, sr);
        const out = buffer.getChannelData(0);
        const line = new Float32Array(N);
        const a = 0.2 + spec.brightness * 0.75;
        let lp = 0;
        let mean = 0;
        for (let i = 0; i < N; i++) {
            lp += a * ((Math.random() * 2 - 1) - lp);
            line[i] = lp;
            mean += lp;
        }
        mean /= N;
        for (let i = 0; i < N; i++) line[i] -= mean; // 去直流，不然尾巴会带一个慢慢漂的偏移
        const rho = Math.pow(10, -3 / (T60 * freq));
        let i = 0;
        for (let n = 0; n < len; n++) {
            const cur = line[i];
            const nxt = line[i + 1 === N ? 0 : i + 1];
            out[n] = cur;
            line[i] = rho * ((1 - S) * cur + S * nxt);
            i = i + 1 === N ? 0 : i + 1;
        }
        // 起音的前 2ms 淡入，免得噪声直接起跳带出一个爆点
        const fade = Math.floor(sr * 0.002);
        for (let n = 0; n < fade; n++) out[n] *= n / fade;
        const rate = freq / (sr / (N + S));
        const hit = { buffer, rate };
        this.ksCache.set(key, hit);
        if (this.ksCache.size > 40) this.ksCache.delete(this.ksCache.keys().next().value);
        return hit;
    }

    // 走错一步的那一声：两下发闷的三全音，往下掉
    error(freq) {
        const ctx = this.ensure();
        if (!ctx || this.muted) return;
        const t0 = ctx.currentTime;
        [[freq * Math.pow(2, 6 / 12), 0, 0.075], [freq * Math.pow(2, 5 / 12), 0.07, 0.065]].forEach(([f, dt, v]) => {
            const o = new OscillatorNode(ctx, { type: "triangle", frequency: f });
            const flt = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 1200, Q: 0.7 });
            const g = new GainNode(ctx, { gain: 0 });
            g.gain.setValueAtTime(0, t0 + dt);
            g.gain.linearRampToValueAtTime(v, t0 + dt + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.2);
            o.connect(flt).connect(g).connect(this.dry);
            o.start(t0 + dt);
            o.stop(t0 + dt + 0.25);
        });
    }

    // ============================================================
    // 场景环境声：海浪、雨、林间、城市、梦境、日落、爱情、冒险
    // 全部现场合成（噪声 + 滤波 + 慢 LFO + 偶尔一只鸟），不用任何音频文件
    // ============================================================
    setAmbience(name, level = this.amb.level) {
        this.amb.level = level;
        if (!this.ctx) {
            this.amb.name = name || "off";
            return;
        }
        const ctx = this.ctx;
        const t = ctx.currentTime;
        // 环境声是背景：整体比乐器低一截，level 只在这个范围里调
        this.ambBus.gain.setTargetAtTime(this.muted || this.amb.paused ? 0 : level * 0.3, t, 0.3);
        if ((name || "off") === this.amb.name && this.amb.nodes) return;
        this._stopAmbience(false);
        this.amb.name = name || "off";
        if (this.amb.name === "off") return;
        const build = AMBIENCES[this.amb.name];
        if (!build) return;
        const out = new GainNode(ctx, { gain: 0 });
        out.connect(this.ambBus);
        out.gain.setTargetAtTime(1, t, 0.8);
        const bed = { out, sources: [], nodes: [out], timers: [] };
        build(this, ctx, bed);
        this.amb.nodes = bed;
    }

    // 页面切到后台时把环境声压下去，回来再抬起来（不影响正在弹的音）
    pauseAmbience(paused) {
        this.amb.paused = paused;
        if (!this.ctx || !this.ambBus) return;
        const on = !paused && !this.muted && this.amb.name !== "off";
        this.ambBus.gain.setTargetAtTime(on ? this.amb.level * 0.3 : 0, this.ctx.currentTime, 0.2);
    }

    _stopAmbience(instant) {
        const bed = this.amb.nodes;
        this.amb.nodes = null;
        if (!bed) return;
        bed.timers.forEach(clearTimeout);
        bed.timers.length = 0;
        bed.dead = true;
        if (!this.ctx || instant) return;
        const t = this.ctx.currentTime;
        bed.out.gain.setTargetAtTime(0, t, 0.5);
        setTimeout(() => {
            bed.sources.forEach((s) => { try { s.stop(); } catch (err) { /* 已停 */ } });
            bed.nodes.forEach((n) => { try { n.disconnect(); } catch (err) { /* 已断 */ } });
        }, 3000);
    }

    // 环境声的小零件
    _ambNoise(bed, color, { type = "lowpass", freq = 800, q = 0.7, gain = 0.1, lfo } = {}) {
        const ctx = this.ctx;
        if (!this.ambBuffers) this.ambBuffers = {};
        if (!this.ambBuffers[color]) this.ambBuffers[color] = makeNoise(ctx, 4, color);
        const src = new AudioBufferSourceNode(ctx, { buffer: this.ambBuffers[color], loop: true });
        const flt = new BiquadFilterNode(ctx, { type, frequency: freq, Q: q });
        const g = new GainNode(ctx, { gain: gain });
        src.connect(flt).connect(g).connect(bed.out);
        src.start(ctx.currentTime, Math.random() * 3.5);
        bed.sources.push(src);
        bed.nodes.push(flt, g);
        if (lfo) {
            // 慢慢起伏：海浪、风
            const o = new OscillatorNode(ctx, { type: "sine", frequency: lfo.rate });
            const d = new GainNode(ctx, { gain: lfo.depth });
            o.connect(d).connect(lfo.target === "freq" ? flt.frequency : g.gain);
            o.start();
            bed.sources.push(o);
            bed.nodes.push(d);
        }
        return { src, flt, g };
    }

    _ambPad(bed, freqs, { gain = 0.02, type = "sine", cutoff = 1200, breathe = 0.07 } = {}) {
        const ctx = this.ctx;
        const flt = new BiquadFilterNode(ctx, { type: "lowpass", frequency: cutoff, Q: 0.5 });
        const g = new GainNode(ctx, { gain });
        flt.connect(g).connect(bed.out);
        bed.nodes.push(flt, g);
        freqs.forEach((fr, i) => {
            [-6, 6].forEach((dt) => {
                const o = new OscillatorNode(ctx, { type, frequency: fr, detune: dt + i });
                o.connect(flt);
                o.start();
                bed.sources.push(o);
            });
        });
        const lfo = new OscillatorNode(ctx, { type: "sine", frequency: breathe });
        const d = new GainNode(ctx, { gain: gain * 0.6 });
        lfo.connect(d).connect(g.gain);
        lfo.start();
        bed.sources.push(lfo);
        bed.nodes.push(d);
    }

    // 隔一段随机时间做一次（鸟叫、雨滴、远处的车），bed 停了就不再排
    _ambEvery(bed, minMs, maxMs, fn) {
        const tick = () => {
            if (bed.dead) return;
            fn();
            bed.timers.push(setTimeout(tick, minMs + Math.random() * (maxMs - minMs)));
        };
        bed.timers.push(setTimeout(tick, minMs * Math.random()));
    }

    _chirp(bed, base) {
        // 一声鸟叫：两三下快速上滑的正弦
        const ctx = this.ctx;
        const t0 = ctx.currentTime;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
            const t = t0 + i * (0.09 + Math.random() * 0.05);
            const o = new OscillatorNode(ctx, { type: "sine", frequency: base });
            o.frequency.setValueAtTime(base * 0.85, t);
            o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), t + 0.06);
            const g = new GainNode(ctx, { gain: 0 });
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.02, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
            const p = new StereoPannerNode(ctx, { pan: Math.random() * 1.6 - 0.8 });
            o.connect(g).connect(p).connect(bed.out);
            o.start(t);
            o.stop(t + 0.1);
        }
    }

    _drop(bed) {
        // 一粒雨滴：极短的高频噪声 + 一点点音高
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const src = new AudioBufferSourceNode(ctx, { buffer: this.noise });
        const bp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: 2500 + Math.random() * 4000, Q: 6 });
        const g = new GainNode(ctx, { gain: 0 });
        g.gain.setValueAtTime(0.03 + Math.random() * 0.03, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        const p = new StereoPannerNode(ctx, { pan: Math.random() * 2 - 1 });
        src.connect(bp).connect(g).connect(p).connect(bed.out);
        src.start(t, Math.random() * 1.5, 0.05);
    }

    // 水下的一个小气泡"啵"：正弦从低往高一滑，很短
    _bloop(out, t, { gain = 0.02, pan = 0, f0 = 260 + Math.random() * 260 } = {}) {
        const ctx = this.ctx;
        const o = new OscillatorNode(ctx, { type: "sine", frequency: f0 });
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 * (2.4 + Math.random() * 1.4), t + 0.05 + Math.random() * 0.03);
        const g = new GainNode(ctx, { gain: 0 });
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        const p = new StereoPannerNode(ctx, { pan: Math.max(-1, Math.min(1, pan)) });
        o.connect(g).connect(p).connect(out);
        o.start(t);
        o.stop(t + 0.12);
        return p;
    }

    // 深海模式里按一个键："气泡机"跟着冒一串泡，轻轻的
    bubbles({ pan = 0, amount = 1 } = {}) {
        const ctx = this.ctx;
        if (!ctx || this.muted) return;
        const t0 = ctx.currentTime;
        const n = 2 + Math.round(Math.random() * 3 * amount);
        for (let i = 0; i < n; i++) {
            const p = this._bloop(this.dry, t0 + 0.03 + i * (0.04 + Math.random() * 0.07), {
                gain: 0.006 + Math.random() * 0.01, pan: pan + (Math.random() - 0.5) * 0.4,
            });
            const send = new GainNode(ctx, { gain: 0.6 });
            p.connect(send).connect(this.reverbIn);
            setTimeout(() => { try { send.disconnect(); } catch (err) { /* 已断 */ } }, 800);
        }
    }

    _swell(bed, { freq = 400, dur = 3, gain = 0.03, q = 1 } = {}) {
        // 一次远远经过的声音（车、雷、风）：带通噪声慢起慢落，顺便从一边移到另一边
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const src = new AudioBufferSourceNode(ctx, { buffer: this.noise, loop: true });
        const bp = new BiquadFilterNode(ctx, { type: "bandpass", frequency: freq, Q: q });
        const g = new GainNode(ctx, { gain: 0 });
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + dur * 0.45);
        g.gain.linearRampToValueAtTime(0, t + dur);
        const side = Math.random() < 0.5 ? -1 : 1;
        const p = new StereoPannerNode(ctx, { pan: side * 0.8 });
        p.pan.linearRampToValueAtTime(-side * 0.8, t + dur);
        src.connect(bp).connect(g).connect(p).connect(bed.out);
        src.start(t, Math.random());
        src.stop(t + dur + 0.1);
    }
}

// 每种场景的环境声怎么搭
const AMBIENCES = {
    // 海：棕噪声低通，音量和亮度一起慢慢涨落，就是一波一波的浪
    ocean(eng, ctx, bed) {
        eng._ambNoise(bed, "brown", { freq: 520, gain: 0.16, lfo: { rate: 0.09, depth: 0.12 } });
        eng._ambNoise(bed, "pink", { type: "bandpass", freq: 1400, q: 0.5, gain: 0.018, lfo: { rate: 0.09, depth: 0.016 } });
    },
    // 失恋：窗外的雨
    rain(eng, ctx, bed) {
        eng._ambNoise(bed, "pink", { type: "highpass", freq: 900, gain: 0.08 });
        eng._ambNoise(bed, "brown", { freq: 300, gain: 0.07 });
        eng._ambEvery(bed, 40, 180, () => eng._drop(bed));
        eng._ambPad(bed, [110, 130.81, 164.81], { gain: 0.006, cutoff: 700, breathe: 0.05 });
    },
    // 自然：林间的风 + 偶尔一只鸟 + 远处的溪水
    forest(eng, ctx, bed) {
        eng._ambNoise(bed, "pink", { type: "bandpass", freq: 700, q: 0.6, gain: 0.09, lfo: { rate: 0.07, depth: 0.06 } });
        eng._ambNoise(bed, "white", { type: "bandpass", freq: 3200, q: 1.2, gain: 0.02, lfo: { rate: 1.7, depth: 0.01 } });
        eng._ambEvery(bed, 2200, 6500, () => eng._chirp(bed, 2200 + Math.random() * 2400));
    },
    // 城市：低低的嗡鸣 + 远处偶尔驶过的车
    city(eng, ctx, bed) {
        eng._ambNoise(bed, "brown", { freq: 160, gain: 0.15 });
        eng._ambPad(bed, [55, 82.41], { gain: 0.01, cutoff: 300, breathe: 0.03 });
        eng._ambEvery(bed, 3500, 9000, () => eng._swell(bed, { freq: 260 + Math.random() * 300, dur: 3 + Math.random() * 2, gain: 0.05 }));
    },
    // 梦想：一团慢慢呼吸的 Cmaj9，偶尔一颗星星似的高音
    dream(eng, ctx, bed) {
        eng._ambPad(bed, [130.81, 196, 246.94, 293.66], { gain: 0.012, cutoff: 1600, breathe: 0.06 });
        eng._ambEvery(bed, 2500, 6000, () => {
            const notes = [1046.5, 1174.66, 1318.51, 1567.98, 1975.53];
            eng.play("celesta", notes[Math.floor(Math.random() * notes.length)] / 2, { velocity: 0.22, pan: Math.random() * 1.4 - 0.7 });
        });
    },
    // 日落：暖的 Dmaj7 + 远处很轻的浪
    sunset(eng, ctx, bed) {
        eng._ambPad(bed, [146.83, 220, 277.18, 185], { gain: 0.012, cutoff: 1100, breathe: 0.05 });
        eng._ambNoise(bed, "brown", { freq: 420, gain: 0.07, lfo: { rate: 0.07, depth: 0.05 } });
    },
    // 爱情：柔软的 Fmaj9，像午后窗边的光
    love(eng, ctx, bed) {
        eng._ambPad(bed, [174.61, 220, 261.63, 329.63, 392], { gain: 0.01, cutoff: 1400, breathe: 0.08 });
        eng._ambNoise(bed, "pink", { type: "bandpass", freq: 900, q: 0.5, gain: 0.008 });
    },
    // 深海：很低的水压轰鸣 + 一个几乎听不见的低音持续音 + 远处偶尔冒上去的气泡
    abyss(eng, ctx, bed) {
        eng._ambNoise(bed, "brown", { freq: 150, gain: 0.22, lfo: { rate: 0.05, depth: 0.1 } });
        eng._ambNoise(bed, "pink", { type: "bandpass", freq: 420, q: 0.6, gain: 0.012, lfo: { rate: 0.08, depth: 0.01 } });
        eng._ambPad(bed, [55, 82.41, 110], { gain: 0.012, cutoff: 240, breathe: 0.03 });
        eng._ambEvery(bed, 700, 2400, () => {
            const t = ctx.currentTime;
            const n = 1 + Math.floor(Math.random() * 3);
            for (let i = 0; i < n; i++) eng._bloop(bed.out, t + i * 0.07, { gain: 0.012 + Math.random() * 0.012, pan: Math.random() * 1.6 - 0.8 });
        });
    },
    // 冒险：低音的五度持续音 + 峡谷里的风 + 偶尔远处的一声闷雷
    adventure(eng, ctx, bed) {
        eng._ambPad(bed, [55, 82.41, 110], { gain: 0.02, type: "sawtooth", cutoff: 380, breathe: 0.04 });
        eng._ambNoise(bed, "pink", { type: "bandpass", freq: 500, q: 0.8, gain: 0.055, lfo: { rate: 0.11, depth: 0.04 } });
        eng._ambEvery(bed, 6000, 14000, () => eng._swell(bed, { freq: 90, dur: 4, gain: 0.12, q: 0.7 }));
    },
};
