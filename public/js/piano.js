// ============================================================
// 钢琴：每个音离线"算"成一段波形，弹的时候直接放（算在 Web Worker 里，不卡画面）
//
// 以前的钢琴是实时的 9 根正弦：泛音少、每根只一种衰减，听起来像电子琴。
// 真钢琴的声音里有这几样东西，这里一样一样算进去：
//   非谐性      弦有粗细和硬度，第 n 个泛音比 n 倍基频高一点（fn = n·f0·√(1+B·n²)），高音区更明显——钢琴"亮而冷"的那种味道
//   两段衰减    刚敲下去那一两秒掉得快（"起音声"），之后一条长长的余音慢慢退（"余音"）：同一个音的弦在两个方向上振动，损耗不一样
//   拍频        中高音区一个音有三根弦（中低音两根），调得再准也差零点几个音分，余音里会慢慢地"起伏"
//   击弦位置    琴槌敲在弦长约 1/8 处：第 8、16 个泛音附近几乎没有声音
//   琴槌的软硬  敲得越重越亮；泛音越高、死得越快
//   音板辐射    音板推不动太低的频率：低音区的基音其实很弱，听到的"低"大半是泛音拼出来的
//   敲击声      琴槌砸到弦那一下的"咚"，高音区更清楚
//   音板共鸣    木头本身的几个共振峰，给声音一点温度
// 采样每隔两个半音算一个（C D E F# G# A#），中间的音变速播放，最多偏一个半音
// ============================================================

const TAU = Math.PI * 2;
export const PIANO_GRID = 2;
export const PIANO_LOW = 22;   // A#0
export const PIANO_HIGH = 108; // C8

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 这个频率该用哪一个采样（最近的偶数 MIDI 号）
export function pianoGridNote(freq) {
    const m = 69 + 12 * Math.log2(freq / 440);
    return Math.max(PIANO_LOW, Math.min(PIANO_HIGH, PIANO_GRID * Math.round(m / PIANO_GRID)));
}

// 采样长度：低音余音长，高音短（再长的部分弹的时候也几乎听不见了，白占内存）
export function pianoSeconds(midi) {
    return Math.max(2.4, Math.min(7.2, 7.2 - (midi - 36) * 0.085));
}

// 可复现的随机数：同一个音每次算出来一模一样
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function interp(table, x) {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
        if (x <= table[i][0]) {
            const [x0, y0] = table[i - 1];
            const [x1, y1] = table[i];
            return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
        }
    }
    return table[table.length - 1][1];
}

// 二阶带通（RBJ）：原地滤波，返回新数组
function bandpass(x, sr, f, q) {
    const w = (TAU * f) / sr;
    const al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    const b0 = al / a0;
    const b2 = -al / a0;
    const a1 = (-2 * Math.cos(w)) / a0;
    const a2 = (1 - al) / a0;
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
        const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x[i];
        y2 = y1; y1 = v;
        y[i] = v;
    }
    return y;
}

// 算一个音。velocity 是"采样时敲多重"（0–1），弹的时候再按实际力度加滤波和音量
export function renderPianoNote(midi, sr, { velocity = 0.82 } = {}) {
    const rnd = mulberry32(midi * 7919 + 101);
    const f0 = midiToFreq(midi);
    const len = Math.floor(pianoSeconds(midi) * sr);
    const out = new Float32Array(len);

    // 非谐系数：中音区最小，往高音涨得很快；最低那几个音（弦短、缠得粗）又回升一点
    const B = Math.pow(10, interp([[21, -3.5], [36, -4.0], [60, -3.4], [84, -2.7], [108, -1.7]], midi));
    // 一个音几根弦：最低一个半八度一根，往上到 C3 两根，再往上三根
    const strings = midi < 32 ? 1 : midi < 48 ? 2 : 3;
    // 余音的 T60（衰减 60dB 要多久）：中央 C 约 20 秒，越高越短
    const T60a = Math.max(1.2, Math.min(30, 20 * Math.pow(261.63 / f0, 0.6)));
    const fmax = Math.min(sr * 0.45, 15000);
    const beta = 0.118 - (midi - 60) * 0.0004; // 击弦点：弦长的约 1/8.5
    const fc = 900 + 1700 * velocity + f0 * 0.8; // 琴槌有多"硬"：这个频率以上的泛音掉得快
    const loss = (f) => 1 + Math.pow(f / 1200, 1.5); // 高频的内损、空气阻尼
    const lossF0 = loss(f0);
    const detune = (0.35 + rnd() * 1.1) / 1731; // 同音几根弦之间差 0.35–1.45 个音分

    for (let n = 1; n <= 90; n++) {
        const fn = n * f0 * Math.sqrt(1 + B * n * n);
        if (fn > fmax) break;
        const hammer = Math.pow(n, -0.35) / (1 + Math.pow(fn / fc, 2.3));
        const comb = 0.3 + 0.7 * Math.abs(Math.sin(Math.PI * n * beta));
        const rad = 1 / (1 + (95 / fn) * (95 / fn));
        const amp = hammer * comb * rad;
        if (amp < 2e-4) continue;
        const t60 = (T60a * lossF0) / loss(fn);
        // [频率倍数, 份量, T60]：第一份是起音声（掉得快），后面是余音（慢，和前一份差一点点音高 → 拍）
        const comps = [[1, 1, t60 / 4.2]];
        if (strings === 1) comps.push([1 + detune * 0.15, 0.3, t60]);
        else {
            comps.push([1 + detune, 0.3, t60]);
            if (strings === 3) comps.push([1 - detune * 0.7, 0.18, t60 * 0.9]);
        }
        for (const [fm, w, T] of comps) {
            const f = fn * fm;
            if (f > fmax) continue;
            const g = Math.exp(-6.9078 / (T * sr)); // 每个采样乘一次：T 秒后正好 -60dB
            let A = amp * w;
            const count = Math.min(len, Math.ceil(Math.log(3e-6 / A) / Math.log(g)));
            // 旋转相量：每个采样一次复数乘法，比每次调 Math.sin 快得多
            const w0 = (TAU * f) / sr;
            const c = Math.cos(w0);
            const s = Math.sin(w0);
            const ph = (rnd() - 0.5) * 0.8;
            let yr = Math.cos(ph);
            let yi = Math.sin(ph);
            for (let i = 0; i < count; i++) {
                out[i] += A * yi;
                const nr = yr * c - yi * s;
                yi = yr * s + yi * c;
                yr = nr;
                A *= g;
            }
        }
    }

    // 起音前 1.2ms 淡入：再快就是一个爆点了
    const fade = Math.max(2, Math.floor(0.0012 * sr));
    for (let i = 0; i < fade; i++) out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);

    // 敲击声：一小段带通噪声，频率跟着音高走；外加琴键撞到底的一下低频"笃"
    const early = Math.floor(0.05 * sr);
    let e0 = 0;
    for (let i = 0; i < early; i++) e0 += out[i] * out[i];
    const rms0 = Math.sqrt(e0 / early) || 1e-3;
    const nLen = Math.floor(0.12 * sr);
    const noise = new Float32Array(nLen);
    for (let i = 0; i < nLen; i++) noise[i] = rnd() * 2 - 1;
    const treble = Math.max(0, Math.min(1, (midi - 48) / 48));
    const knock = bandpass(noise, sr, Math.max(220, Math.min(3400, f0 * 2.2)), 0.8);
    const thud = bandpass(noise, sr, 110, 0.9);
    const tauK = (0.004 + 0.008 * (1 - treble)) * sr;
    const tauT = 0.014 * sr;
    const kAmp = rms0 * (0.9 + 1.1 * treble) * velocity;
    const tAmp = rms0 * 0.6 * velocity;
    for (let i = 0; i < nLen && i < len; i++) {
        out[i] += knock[i] * kAmp * Math.exp(-i / tauK) + thud[i] * tAmp * Math.exp(-i / tauT);
    }

    // 音板共鸣：几个木头的共振峰并联上去（很淡），声音厚一点、暖一点
    const body = [[98, 3, 0.1], [155, 3, 0.09], [235, 3.5, 0.08], [370, 4, 0.06], [620, 4, 0.04], [1150, 4, 0.025]];
    const dry = out.slice();
    body.forEach(([f, q, gain]) => {
        if (f > sr * 0.45) return;
        const y = bandpass(dry, sr, f, q);
        for (let i = 0; i < len; i++) out[i] += y[i] * gain;
    });

    // 尾巴最后 30% 慢慢收掉：采样到头了，别"咔"地断
    const tail = Math.floor(len * 0.3);
    for (let i = 0; i < tail; i++) {
        const k = i / tail;
        out[len - tail + i] *= 0.5 + 0.5 * Math.cos(Math.PI * k);
    }

    // 响度统一：前 0.5 秒的均方根对齐到同一个数（高低音之间的平衡交给弹的时候的等响度补偿）
    const win = Math.min(len, Math.floor(0.5 * sr));
    let e = 0;
    for (let i = 0; i < win; i++) e += out[i] * out[i];
    const k = 0.1 / (Math.sqrt(e / win) || 1);
    for (let i = 0; i < len; i++) out[i] *= k;
    return out;
}

// ============================================================
// 真钢琴录音的整理（js/piano-samples.js 解码完交到这里，在后台线程里跑）
//   开头：录音前面有几毫秒到几十毫秒的空白（有的浏览器解 mp3 还会多出编码器塞的 ~25ms 静音）——
//         找到起音（比开头最响处低 40dB 的第一个点），往前留 1.5ms，从那里开始放，按下去才跟手
//   尾巴：一个中央 C 录了 16 秒，44.1k 立体声解码出来就是 5.6MB。头 2.5 秒原样留着（琴槌、亮的泛音都在这里）；
//         之后是长长的余音，已经比起音低 20dB 以上，10kHz 以上几乎什么都没有了——降一半采样率存，省下四成内存。
//         两段在 2.5 秒处交叉淡化 60ms 接起来：两段是同一个信号，线性淡化加起来正好是 1，听不出接缝
// ============================================================
export const SPLIT_AT = 2.5;
const XFADE = 0.06;

// 半带低通（Blackman 窗、47 阶）：只有奇数位置的系数不为 0，隔一个取一个之前先用它挡掉 11kHz 以上
const HB_N = 23;
const HB = (() => {
    const h = [];
    let s = 0;
    for (let n = 1; n <= HB_N; n += 2) {
        const w = 0.42 + 0.5 * Math.cos((Math.PI * n) / (HB_N + 1)) + 0.08 * Math.cos((2 * Math.PI * n) / (HB_N + 1));
        const v = (Math.sin((Math.PI * n) / 2) / (Math.PI * n)) * w;
        h.push(v);
        s += v;
    }
    return h.map((v) => (v * 0.25) / s); // 中心 0.5 + 两边各 Σh = 1：直流增益正好是 1
})();

function decimate(x, from, count) {
    const y = new Float32Array(count);
    const n = x.length;
    for (let j = 0; j < count; j++) {
        const i = from + 2 * j;
        let v = i < n ? 0.5 * x[i] : 0;
        for (let k = 0; k < HB.length; k++) {
            const d = 2 * k + 1;
            const a = i - d >= 0 && i - d < n ? x[i - d] : 0;
            const b = i + d < n ? x[i + d] : 0;
            v += HB[k] * (a + b);
        }
        y[j] = v;
    }
    return y;
}

// L、R：解码出来的两个声道（44.1k）。split = 0 表示不切（松键声、踏板声这种短的）
// 返回 { head: [L, R], tail: [L, R] | null, split }，tail 的采样率是 sr / 2，从 split 秒那一刻接上
export function splitSample(L, R, sr, { split = SPLIT_AT } = {}) {
    const len = L.length;
    let peak = 0;
    const scan = Math.min(len, Math.floor(sr * 0.5));
    for (let i = 0; i < scan; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const thr = peak * 0.01;
    let on = 0;
    while (on < scan && Math.abs(L[on]) < thr && Math.abs(R[on]) < thr) on++;
    const start = Math.max(0, on - Math.round(sr * 0.0015));
    const S = Math.round(split * sr);
    const X = Math.round(XFADE * sr);
    const rest = len - start;
    // 短的（或者没要求切）：整段留着，尾巴收一下
    if (!split || rest < S + X + sr * 2.5) {
        const out = [L.subarray(start).slice(), R.subarray(start).slice()];
        const fade = Math.min(out[0].length, Math.round(sr * (split ? 0.25 : 0.01)));
        out.forEach((d) => {
            for (let i = 0; i < fade; i++) d[d.length - fade + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / fade);
        });
        return { head: out, tail: null, split: 0 };
    }
    const head = [L.subarray(start, start + S + X).slice(), R.subarray(start, start + S + X).slice()];
    head.forEach((d) => {
        for (let k = 0; k < X; k++) d[S + k] *= 1 - k / X;
    });
    // 尾巴第 j 个点 = 原录音 start + S + 2j 那个位置（时间上对齐）
    const count = Math.floor((rest - S) / 2);
    const tail = [decimate(L, start + S, count), decimate(R, start + S, count)];
    const X2 = X / 2;
    const fade = Math.min(count, Math.round((sr / 2) * 0.3));
    tail.forEach((d) => {
        for (let j = 0; j < X2; j++) d[j] *= j / X2;
        // 录音到底了：最后 0.3 秒收掉，别"咔"地断
        for (let i = 0; i < fade; i++) d[count - fade + i] *= 0.5 + 0.5 * Math.cos((Math.PI * i) / fade);
    });
    return { head, tail, split };
}
