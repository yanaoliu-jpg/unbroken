// ============================================================
// 声音检测：把乐器离线渲染成一段波形，再拿它来"看"声音
//   loudness     ITU-R BS.1770 响度（LUFS）：K 加权 + 400ms 分块 + 门限，和广播、流媒体做响度统一用的是同一套
//   spectrogram  短时傅里叶变换，对数频率轴画成一张图
//   timbre       MFCC（梅尔倒谱）+ 起音 / 衰减 / 亮度，拿来比两件乐器像不像
// 页面（soundcheck.html）用它画表格；也挂在 window.soundcheck 上，方便直接在控制台里跑
// ============================================================
import { AudioEngine, INSTRUMENTS, INSTRUMENT_ORDER } from "./audio.js";

export const SR = 44100;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const C3 = 130.81; // 音乐模式里 Z 那一排的 1

// 音乐模式的音级 → 频率（idx 7 = A 那一排的 1 = C4）
export const freqOfIdx = (idx) => C3 * Math.pow(2, (MAJOR[idx % 7] + 12 * Math.floor(idx / 7)) / 12);

// 三种弹法：一句八个音的旋律（最常见）、很短的点按、一个长音按住不放
export const PATTERNS = {
    phrase: {
        name: "一句旋律",
        notes: [7, 8, 9, 10, 11, 12, 13, 14].map((idx, i) => ({ idx, t: 0.3 + i * 0.45, dur: 0.36 })),
        seconds: 0.3 + 8 * 0.45 + 2.2,
    },
    tap: {
        name: "快速点按",
        notes: [7, 9, 11, 14, 11, 9, 7, 9].map((idx, i) => ({ idx, t: 0.3 + i * 0.3, dur: 0.12 })),
        seconds: 0.3 + 8 * 0.3 + 2,
    },
    hold: {
        name: "长音按住",
        notes: [{ idx: 7, t: 0.3, dur: 2 }],
        seconds: 4.8,
    },
};

// 离线渲染：build(engine, ctx) 往里排音，返回左右声道
export async function render(build, seconds, { sr = SR, fx = null } = {}) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
    const eng = new AudioEngine({ context: ctx });
    if (fx) eng.setFx(fx);
    await build(eng, ctx);
    const buf = await ctx.startRendering();
    return { L: buf.getChannelData(0), R: buf.getChannelData(1), sr };
}

// 一件乐器按某种弹法弹一遍（和音乐模式里一样：按住 = hold，松手 = release）
export function renderPatch(patch, patternName = "phrase", opts = {}) {
    const P = PATTERNS[patternName];
    return render((eng) => {
        P.notes.forEach((n) => {
            const v = eng.play(patch, freqOfIdx(n.idx), { when: n.t, hold: true, velocity: opts.velocity || 1 });
            if (v) v.release(n.t + n.dur);
        });
    }, P.seconds, opts);
}

// ---------------- 响度（BS.1770-4）----------------
function biquad(x, b0, b1, b2, a1, a2) {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
        const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x[i];
        y2 = y1; y1 = v;
        y[i] = v;
    }
    return y;
}

// K 加权：一个 +4dB 的高架（模拟人头对高频的放大）+ 一个 38Hz 的高通（耳朵对极低频不敏感）
function kWeight(x, sr) {
    let f0 = 1681.974450955533;
    const G = 3.999843853973347;
    let Q = 0.7071752369554196;
    let K = Math.tan((Math.PI * f0) / sr);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const s1 = biquad(x,
        (Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0,
        (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
    f0 = 38.13547087602444;
    Q = 0.5003270373238773;
    K = Math.tan((Math.PI * f0) / sr);
    a0 = 1 + K / Q + K * K;
    return biquad(s1, 1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
}

const lk = (ms) => -0.691 + 10 * Math.log10(ms + 1e-20);

// { integrated（门限后的整体响度）, momentary（400ms 窗最大值）, peak（dBFS）, rms（dBFS） }
export function loudness({ L, R, sr }) {
    const kl = kWeight(L, sr);
    const kr = kWeight(R, sr);
    const n = kl.length;
    // 前缀和：任意一段的均方都是 O(1)
    const cs = new Float64Array(n + 1);
    let peak = 0;
    let raw = 0;
    for (let i = 0; i < n; i++) {
        cs[i + 1] = cs[i] + kl[i] * kl[i] + kr[i] * kr[i];
        const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
        if (p > peak) peak = p;
        raw += L[i] * L[i] + R[i] * R[i];
    }
    const block = Math.round(0.4 * sr);
    const hop = Math.round(0.1 * sr);
    const z = [];
    for (let s = 0; s + block <= n; s += hop) z.push((cs[s + block] - cs[s]) / block);
    const momentary = z.length ? Math.max(...z.map(lk)) : -Infinity;
    const abs = z.filter((v) => lk(v) > -70);
    let integrated = -Infinity;
    if (abs.length) {
        const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
        const gated = abs.filter((v) => lk(v) > rel);
        integrated = lk(gated.reduce((a, b) => a + b, 0) / gated.length);
    }
    const db = (x) => (x > 1e-12 ? 20 * Math.log10(x) : -Infinity);
    return { integrated, momentary, peak: db(peak), rms: db(Math.sqrt(raw / (2 * n))) };
}

// ---------------- 频谱 ----------------
function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            let t = re[i]; re[i] = re[j]; re[j] = t;
            t = im[i]; im[i] = im[j]; im[j] = t;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wr = Math.cos(ang);
        const wi = Math.sin(ang);
        const half = len >> 1;
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < half; k++) {
                const a = i + k;
                const b = a + half;
                const br = re[b] * cr - im[b] * ci;
                const bi = re[b] * ci + im[b] * cr;
                re[b] = re[a] - br; im[b] = im[a] - bi;
                re[a] += br; im[a] += bi;
                const t = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = t;
            }
        }
    }
}

// 单声道（左右平均）的短时频谱：frames[i] 是一帧的幅度谱（N/2 个频点）
export function stft({ L, R, sr }, { size = 2048, hop = 512 } = {}) {
    const n = L.length;
    const win = new Float64Array(size);
    for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    const frames = [];
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let s = 0; s + size <= n; s += hop) {
        for (let i = 0; i < size; i++) {
            re[i] = ((L[s + i] + R[s + i]) / 2) * win[i];
            im[i] = 0;
        }
        fft(re, im);
        const mag = new Float32Array(size / 2);
        for (let k = 0; k < size / 2; k++) mag[k] = Math.hypot(re[k], im[k]) / (size / 4);
        frames.push(mag);
    }
    return { frames, size, hop, sr };
}

// 颜色：黑 → 深紫 → 洋红 → 橙 → 浅黄（和 matplotlib 的 magma 差不多）
const MAGMA = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 253, 191]];
function magma(t) {
    const x = Math.min(1, Math.max(0, t)) * (MAGMA.length - 1);
    const i = Math.min(MAGMA.length - 2, Math.floor(x));
    const f = x - i;
    return MAGMA[i].map((c, k) => Math.round(c + (MAGMA[i + 1][k] - c) * f));
}

// 画到 canvas 上：横轴时间、纵轴对数频率（40Hz–16kHz），动态范围 range dB
export function drawSpectrogram(canvas, spec, { fMin = 40, fMax = 16000, range = 90 } = {}) {
    const { frames, size, sr } = spec;
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W, H);
    let max = 1e-9;
    frames.forEach((f) => { for (let k = 0; k < f.length; k++) if (f[k] > max) max = f[k]; });
    const binHz = sr / size;
    for (let y = 0; y < H; y++) {
        const fq = fMin * Math.pow(fMax / fMin, (H - 1 - y) / (H - 1));
        const bin = Math.min(size / 2 - 2, fq / binHz);
        const b0 = Math.floor(bin);
        const bf = bin - b0;
        for (let x = 0; x < W; x++) {
            const fr = frames[Math.min(frames.length - 1, Math.floor((x / W) * frames.length))];
            if (!fr) continue;
            const m = fr[b0] * (1 - bf) + fr[b0 + 1] * bf;
            const db = 20 * Math.log10(m / max + 1e-12);
            const [r, g, b] = magma(1 + db / range);
            const o = (y * W + x) * 4;
            img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
}

// ---------------- 音色：MFCC + 包络 ----------------
function melFilters(size, sr, bands = 26, lo = 60, hi = 12000) {
    const mel = (f) => 2595 * Math.log10(1 + f / 700);
    const inv = (m) => 700 * (Math.pow(10, m / 2595) - 1);
    const pts = [];
    for (let i = 0; i < bands + 2; i++) pts.push(inv(mel(lo) + ((mel(hi) - mel(lo)) * i) / (bands + 1)));
    const binHz = sr / size;
    return Array.from({ length: bands }, (_, b) => {
        const [f0, f1, f2] = [pts[b], pts[b + 1], pts[b + 2]];
        const w = new Float32Array(size / 2);
        for (let k = 0; k < size / 2; k++) {
            const f = k * binHz;
            w[k] = f <= f0 || f >= f2 ? 0 : f <= f1 ? (f - f0) / (f1 - f0) : (f2 - f) / (f2 - f1);
        }
        return w;
    });
}

// 一段声音的"指纹"：13 个 MFCC 的均值（去掉代表音量的第 0 个）+ 起音时间、衰减速度、平均亮度
export function timbre(audio) {
    const spec = stft(audio, { size: 2048, hop: 512 });
    const filters = melFilters(spec.size, spec.sr);
    const energies = spec.frames.map((f) => {
        let e = 0;
        for (let k = 0; k < f.length; k++) e += f[k] * f[k];
        return e;
    });
    const maxE = Math.max(...energies, 1e-12);
    const mf = [];
    let centroid = 0;
    let cw = 0;
    spec.frames.forEach((f, fi) => {
        if (energies[fi] < maxE * 1e-4) return; // 只看 -40dB 以内的帧
        const logm = filters.map((w) => {
            let s = 0;
            for (let k = 0; k < f.length; k++) s += w[k] * f[k] * f[k];
            return Math.log(s + 1e-10);
        });
        const c = [];
        for (let i = 1; i <= 12; i++) {
            let s = 0;
            for (let j = 0; j < logm.length; j++) s += logm[j] * Math.cos((Math.PI * i * (j + 0.5)) / logm.length);
            c.push(s);
        }
        mf.push(c);
        let num = 0;
        let den = 0;
        for (let k = 1; k < f.length; k++) { num += k * f[k]; den += f[k]; }
        centroid += (num / (den + 1e-12)) * (spec.sr / spec.size) * energies[fi];
        cw += energies[fi];
    });
    const mean = mf.length ? mf[0].map((_, i) => mf.reduce((a, c) => a + c[i], 0) / mf.length) : new Array(12).fill(0);
    // 包络：每一帧的能量（dB）。起音 = 从出声（-40dB）到离最大值 3dB 以内用了多久；
    // 衰减 = 最大值之后 0.5 秒掉了多少 dB
    const env = energies.map((e) => 10 * Math.log10(e / maxE + 1e-12));
    let peakAt = 0;
    env.forEach((v, i) => { if (v > env[peakAt]) peakAt = i; });
    let onset = 0;
    while (onset < env.length && env[onset] < -40) onset++;
    let a = onset;
    while (a < env.length && env[a] < -3) a++;
    const frameSec = spec.hop / spec.sr;
    const later = Math.min(env.length - 1, peakAt + Math.round(0.5 / frameSec));
    return {
        mfcc: mean,
        attack: (a - onset) * frameSec,
        decay: env[peakAt] - env[later],
        brightness: centroid / (cw + 1e-12),
    };
}

// 两个指纹有多像：0–1（MFCC 的余弦相似度为主，起音 / 衰减 / 亮度差得多就往下扣）
export function similarity(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.mfcc.length; i++) {
        dot += a.mfcc[i] * b.mfcc[i];
        na += a.mfcc[i] * a.mfcc[i];
        nb += b.mfcc[i] * b.mfcc[i];
    }
    const cos = dot / Math.sqrt(na * nb + 1e-12);
    const dAttack = Math.min(1, Math.abs(Math.log((a.attack + 0.01) / (b.attack + 0.01))) / 2.5);
    const dDecay = Math.min(1, Math.abs(a.decay - b.decay) / 30);
    const dBright = Math.min(1, Math.abs(Math.log2((a.brightness + 1) / (b.brightness + 1))) / 1.5);
    const shape = 1 - (dAttack + dDecay + dBright) / 3;
    return Math.max(0, (cos * 0.5 + 0.5) * 0.65 + shape * 0.35);
}

// ---------------- 一口气量完所有乐器 ----------------
const tick = () => new Promise((r) => setTimeout(r, 0));

export async function measureInstrument(patch) {
    const out = { patch, name: INSTRUMENTS[patch].name };
    for (const p of Object.keys(PATTERNS)) {
        const a = await renderPatch(patch, p);
        out[p] = loudness(a);
        if (p === "phrase") out.audio = a;
    }
    // 综合响度：一句旋律的整体响度 × 0.5 + 长音最响那 0.4 秒 × 0.3 + 快速点按最响那 0.4 秒 × 0.2
    // （audio.js 里的 LOUDNESS_TRIM 就是按这个数对齐的）
    out.score = 0.5 * out.phrase.integrated + 0.3 * out.hold.momentary + 0.2 * out.tap.momentary;
    return out;
}

export async function measureAll(list = INSTRUMENT_ORDER, onEach) {
    const rows = [];
    for (const id of list) {
        const row = await measureInstrument(id);
        rows.push(row);
        if (onEach) onEach(row, rows.length, list.length);
        await tick();
    }
    return rows;
}

// 每件乐器的"像不像"指纹：用同一个长音（C4 按住 1 秒）来比，公平
export async function timbreAll(list = INSTRUMENT_ORDER) {
    const out = {};
    for (const id of list) {
        const a = await render((eng) => {
            const v = eng.play(id, freqOfIdx(7), { when: 0.2, hold: true });
            if (v) v.release(1.2);
        }, 2.6, { fx: { reverb: "off" } });
        out[id] = timbre(a);
        await tick();
    }
    return out;
}

if (typeof window !== "undefined") {
    window.soundcheck = { render, renderPatch, loudness, stft, drawSpectrogram, timbre, similarity, measureInstrument, measureAll, timbreAll, PATTERNS, freqOfIdx, INSTRUMENTS, INSTRUMENT_ORDER };
}
