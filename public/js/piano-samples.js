// ============================================================
// 真钢琴：Salamander Grand Piano V3 的录音采样
// 一台 Yamaha C5 三角琴，Alexander Holm 录的（CC BY 3.0，来源和授权见 samples/piano/README.txt）。
// 两支话筒架在琴弦上方十来厘米：近距离收音，琴槌、琴弦、音板的细节都在里面。
//
//   30 个音    从最低的 A0 起每隔小三度录一个（A、C、D#、F#），其余的音变速播放，最多偏一个半音
//   4 档力度   v4（弱）、v7（中弱）、v10（中强）、v13（强）：同一个音真的用四种力道各敲了一次——
//              重的那一下泛音多得多（中央 C：2kHz 以上的能量多出将近 20dB），不只是更响
//   松键声     88 个键各一个：手抬起来时键回弹、琴槌落回去那一下轻轻的"嗒"
//   踏板声     踩下（制音器一起离开琴弦，整台琴"嗡"地被放开）、抬起，各两种
//
// 按需取、按需解码：先取眼下这一屏会弹到的音、当前力度那一档（调用方把中间的八度排在最前），别的档用到了才去取。
// 解码后的 PCM 很占内存（中央 C 录了 16 秒，44.1k 立体声就是 5.6MB）：
// 头 2.5 秒原样存、余音降一半采样率存（piano.js 的 splitSample），再加一个总预算，超了先扔最久没用过的
// ============================================================
import { splitSample, SPLIT_AT } from "./piano.js";

const SR = 44100;
const BASE = new URL("../samples/piano/", import.meta.url).href;
const NAMES = ["A0", "C1", "Ds1", "Fs1", "A1", "C2", "Ds2", "Fs2", "A2", "C3", "Ds3", "Fs3", "A3", "C4", "Ds4", "Fs4",
    "A4", "C5", "Ds5", "Fs5", "A5", "C6", "Ds6", "Fs6", "A6", "C7", "Ds7", "Fs7", "A7", "C8"];
const LOW = 21; // A0
const STEP = 3; // 小三度
const COUNT = NAMES.length;

// 四档力度的录音各自是多大的力道：sfz 里这一档的 MIDI 力度区间的中点
export const LAYERS = [4, 7, 10, 13];
const NOMINAL = { 4: 40, 7: 53.5, 10: 76.5, 13: 100.5 };
// 引擎里的力度 1 = MIDI 力度 76.5 = v10 那一档：平常弹的那个力道，放出来的就是一段原汁原味的录音
const REF = 76.5;
export const midiVelocity = (v) => Math.max(1, Math.min(127, REF * v));

// 每个采样起音后 0.5 秒的 K 加权响度（LUFS，离线量的）。录音没有归一化过，这就是这台琴本来的轻重
const LOUD = {
    4: [-22.5, -20.2, -20.7, -21.0, -20.7, -21.4, -19.9, -20.3, -22.4, -22.3, -20.3, -24.3, -25.8, -21.5, -24.8, -24.1,
        -24.7, -23.4, -24.5, -23.7, -29.8, -31.4, -28.1, -31.7, -30.1, -33.6, -38.9, -34.9, -40.3, -37.8],
    7: [-19.0, -19.0, -17.9, -17.8, -18.4, -19.1, -18.0, -17.6, -19.8, -20.3, -18.8, -20.6, -22.7, -18.6, -21.5, -20.7,
        -20.5, -20.8, -22.6, -20.9, -24.8, -26.7, -21.9, -27.1, -27.0, -28.7, -32.8, -30.9, -35.1, -34.1],
    10: [-17.6, -17.3, -15.8, -16.7, -17.3, -17.1, -16.6, -15.5, -18.5, -17.7, -16.9, -18.8, -19.7, -15.6, -19.2, -18.5,
        -18.3, -18.6, -20.0, -18.3, -22.4, -21.4, -19.5, -23.8, -22.9, -24.6, -26.6, -27.6, -29.5, -30.8],
    13: [-14.9, -15.1, -14.1, -14.9, -14.6, -14.5, -14.4, -13.5, -14.5, -15.8, -14.8, -16.4, -15.9, -13.0, -17.2, -15.5,
        -15.8, -14.9, -16.1, -15.0, -19.0, -18.8, -16.5, -20.2, -18.2, -18.7, -22.7, -23.2, -23.6, -26.2],
};
// v10 那一档的响度随音高的走势（5 点中值再 3 点平均抹平）：每个采样都往这条线上对齐——
// 相邻两个采样不会一个响一个轻（录音里中央 C 那一个比两边都响 3–4dB，弹音阶时 B3 → C4 会"跳"一下）
const TREND = [-17.2, -17.2, -17.1, -17.0, -16.9, -16.9, -17.0, -17.0, -17.2, -17.7, -18.0, -18.3, -18.4, -18.7, -18.6,
    -18.6, -18.6, -18.6, -19.0, -19.5, -20.5, -21.3, -22.2, -23.0, -23.7, -25.0, -26.3, -27.6, -28.6, -29.0];
// Markus Fiedler 给这套采样重新校的音（音分）。只用六成：真钢琴本来就是高音略偏高、低音略偏低（伸展调律），
// 全拉成平均律反而不像；六成正好把相邻采样之间 5–10 音分的参差抹掉
const RETUNE = [10, 13, 11, -3, -9, -9, -11, -7, -4, 0, -6, -3, -3, -6, -3, 0, -4, -8, -8, -5, -7, -8, -12, -13, -12,
    -17, -17, -27, -38, -38];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const sampleIndex = (midi) => clamp(Math.round((midi - LOW) / STEP), 0, COUNT - 1);
const relIndex = (midi) => clamp(Math.round(midi) - 20, 1, 88);
const noteKey = (idx, layer) => `n${idx}v${layer}`;
const toMidi = (freq) => 69 + 12 * Math.log2(freq / 440);

function curve(table, midi) {
    const x = clamp((midi - LOW) / STEP, 0, COUNT - 1);
    const i = Math.min(COUNT - 2, Math.floor(x));
    return table[i] + (table[i + 1] - table[i]) * (x - i);
}

// 这个音、这个力度该有多响（LUFS）：
//   高音区真钢琴越往上越弱（C8 比中音区轻 10dB），补回来三分之一——高音清亮一点，又不至于刺耳
//   力度：MIDI 力度 40 → 100 大约差 11dB（四档录音本身只差 9dB，再撑开一点，轻弹和重弹一听就分得出）
const TREBLE_REF = curve(TREND, 72);
function targetLoudness(midi, m) {
    let t = curve(TREND, midi);
    if (midi > 72) t += 0.35 * (TREBLE_REF - t);
    return t + 27 * Math.log10(m / REF);
}

function layerFor(m) {
    let best = LAYERS[0];
    LAYERS.forEach((l) => { if (Math.abs(NOMINAL[l] - m) < Math.abs(NOMINAL[best] - m)) best = l; });
    return best;
}

// 解码后的 PCM 总共能占多少：手机上紧一点
const MOBILE = typeof navigator !== "undefined" &&
    (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "") || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform || "")));
const BUDGET = (MOBILE ? 72 : 180) * 1024 * 1024;

const store = new Map();   // key → { head, tail, split, bytes, used }
const jobs = new Map();    // key → 正在排队 / 正在取的
const lost = new Set();    // 重试过还是取不到的
let queue = [];
let active = 0;
let bytes = 0;
let dead = false;          // 整套取不到（文件不在、解不了码）：退回合成的钢琴
let focus = new Set();
const listeners = new Set();

function urlOf(key) {
    if (key[0] === "n") {
        const [, i, l] = /^n(\d+)v(\d+)$/.exec(key);
        return `${BASE}${NAMES[Number(i)]}v${l}.mp3`;
    }
    if (key[0] === "r") return `${BASE}rel${key.slice(1)}.mp3`;
    return `${BASE}pedal${key.slice(1)}.mp3`;
}

// ---------------- 解码 ----------------
// 用一个自己的离线上下文解码：出来就是 44.1k（和录音一样），不用等用户点页面建音频，也不跟着现场的 48k 变大
let decodeCtx = null;
function decoder() {
    if (!decodeCtx) {
        const C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        decodeCtx = new C(2, 1, SR);
    }
    return decodeCtx;
}

function decode(arr) {
    return new Promise((resolve, reject) => {
        try {
            const p = decoder().decodeAudioData(arr, resolve, reject);
            if (p && p.then) p.then(resolve, reject);
        } catch (err) {
            reject(err);
        }
    });
}

function makeBuffer(chs, sr) {
    let b;
    try {
        b = new AudioBuffer({ length: chs[0].length, sampleRate: sr, numberOfChannels: chs.length });
    } catch (err) {
        b = decoder().createBuffer(chs.length, chs[0].length, sr); // 不支持 AudioBuffer 构造函数的老 Safari
    }
    chs.forEach((d, i) => b.getChannelData(i).set(d));
    return b;
}

// 整理（找起音、切尾巴、降采样）放到后台线程：一个长音十几毫秒，在主线程做会让画面掉帧
let worker = null;
let workerDead = false;
let seq = 0;
const splits = new Map();

function thread() {
    if (worker || workerDead || typeof Worker === "undefined") return worker;
    try {
        worker = new Worker(new URL("./piano-worker.js", import.meta.url), { type: "module" });
        worker.onmessage = (e) => {
            const p = splits.get(e.data.id);
            if (!p) return;
            splits.delete(e.data.id);
            if (e.data.error) p.reject(new Error(e.data.error));
            else p.resolve(e.data);
        };
        // 模块 Worker 起不来（很老的浏览器）：这几个失败的会重试，重试时就在主线程做了
        worker.onerror = () => {
            workerDead = true;
            worker = null;
            const all = [...splits.values()];
            splits.clear();
            all.forEach((p) => p.reject(new Error("piano worker failed")));
        };
    } catch (err) {
        workerDead = true;
        worker = null;
    }
    return worker;
}

function tidy(L, R, sr, split) {
    const w = thread();
    if (!w) return Promise.resolve(splitSample(L, R, sr, { split }));
    return new Promise((resolve, reject) => {
        const id = ++seq;
        splits.set(id, { resolve, reject });
        w.postMessage({ id, type: "split", L, R, sr, split }, [L.buffer, R.buffer]);
    });
}

async function fetchSample(key) {
    const res = await fetch(urlOf(key));
    if (!res.ok) throw new Error(`HTTP ${res.status} ${urlOf(key)}`);
    const buf = await decode(await res.arrayBuffer());
    const sr = buf.sampleRate;
    // 拷一份再交给后台线程（AudioBuffer 自己的内存不能转手）
    const L = new Float32Array(buf.getChannelData(0));
    const R = buf.numberOfChannels > 1 ? new Float32Array(buf.getChannelData(1)) : L.slice();
    const out = await tidy(L, R, sr, key[0] === "n" ? SPLIT_AT : 0);
    const head = makeBuffer(out.head, sr);
    const tail = out.tail ? makeBuffer(out.tail, sr / 2) : null;
    return { head, tail, split: out.split, bytes: (head.length + (tail ? tail.length : 0)) * 8, used: now() };
}

// ---------------- 排队 ----------------
// pri 越小越先取：-1 = 手已经按下去了还没有；0… = 眼下这一屏；1000… = 顺带预取
function want(key, pri) {
    if (store.has(key)) return Promise.resolve(store.get(key));
    let job = jobs.get(key);
    if (job) {
        if (pri < job.pri) job.pri = pri;
        return job.promise;
    }
    if (dead || lost.has(key)) return Promise.reject(new Error("piano sample unavailable"));
    job = { key, pri, tries: 0 };
    job.promise = new Promise((resolve, reject) => {
        job.resolve = resolve;
        job.reject = reject;
    });
    jobs.set(key, job);
    queue.push(job);
    pump();
    return job.promise;
}

const PARALLEL = 3;
function pump() {
    while (active < PARALLEL && queue.length) {
        queue.sort((a, b) => a.pri - b.pri);
        const job = queue.shift();
        active++;
        run(job).then(() => {
            active--;
            pump();
            emit();
        });
    }
}

async function run(job) {
    try {
        const entry = await fetchSample(job.key);
        store.set(job.key, entry);
        bytes += entry.bytes;
        jobs.delete(job.key);
        job.resolve(entry);
        trim();
    } catch (err) {
        job.tries++;
        if (job.tries < 2 && !dead) {
            // 网络抖了一下：歇一会儿再来一次
            await new Promise((r) => setTimeout(r, 1200));
            queue.push(job);
            return;
        }
        jobs.delete(job.key);
        lost.add(job.key);
        // 一个都没取到就连着失败：文件多半根本不在，整套放弃，别一直去撞
        if (lost.size >= 3 && store.size === 0) giveUp();
        job.reject(err);
    }
}

function giveUp() {
    dead = true;
    const all = queue;
    queue = [];
    all.forEach((job) => {
        jobs.delete(job.key);
        job.reject(new Error("piano samples unavailable"));
    });
    if (typeof console !== "undefined") console.warn("钢琴采样取不到，改用合成的钢琴");
    emit();
}

// 超预算：先扔最久没弹过的（眼下这一屏要用的那批不扔）
function trim() {
    if (bytes <= BUDGET) return;
    const cands = [...store.entries()]
        .filter(([k]) => k[0] === "n" && !focus.has(k))
        .sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of cands) {
        if (bytes <= BUDGET * 0.85) break;
        store.delete(k);
        bytes -= e.bytes;
    }
}

// ---------------- 对外 ----------------
// 这些音（MIDI 号，可以带小数，调用方按"最常弹的在前"排好）在这个力度下要用的采样，排队去取。
//   focus   这是眼下这一屏要弹的那一批：界面上的加载进度只算它们，内存不够时它们最后才扔
//   noises  顺带把这些键的松键声、踏板声也取了（排在后面）
// 返回的 Promise 在这一批都有了结果（取到或者取不到）时 resolve 成"整套还能不能用"
export function requestPiano(midis, { velocity = 1, focus: isFocus = false, noises = true } = {}) {
    if (dead) return Promise.resolve(false);
    const layer = layerFor(midiVelocity(velocity));
    const idxs = [];
    midis.forEach((m) => {
        const i = sampleIndex(m);
        if (!idxs.includes(i)) idxs.push(i);
    });
    const keys = idxs.map((i) => noteKey(i, layer));
    if (isFocus) focus = new Set(keys);
    const base = isFocus ? 0 : 1000;
    const all = keys.map((k, n) => want(k, base + n));
    if (noises) {
        ["D1", "U1", "D2", "U2"].forEach((p, n) => all.push(want(`p${p}`, base + 300 + n)));
        const rels = [];
        midis.forEach((m) => {
            const k = relIndex(m);
            if (!rels.includes(k)) rels.push(k);
        });
        rels.forEach((k, n) => all.push(want(`r${k}`, base + 400 + n)));
    }
    emit();
    return Promise.all(all.map((p) => p.catch(() => null))).then(() => !dead);
}

// 弹一个音要用的采样。还没取到就返回 null（同时插队去取），调用方先用合成的顶上。
// 想要的那档力度还没到、同一个音别的档在手：先拿它顶，力度差出来的响度和亮度下面补
export function pickPiano(freq, velocity) {
    const midi = toMidi(freq);
    const idx = sampleIndex(midi);
    const m = midiVelocity(velocity);
    const ideal = layerFor(m);
    let layer = ideal;
    let e = store.get(noteKey(idx, ideal));
    if (!e) {
        if (!dead) want(noteKey(idx, ideal), -1).catch(() => {});
        layer = null;
        LAYERS.forEach((l) => {
            const c = store.get(noteKey(idx, l));
            if (c && (layer === null || Math.abs(NOMINAL[l] - m) < Math.abs(NOMINAL[layer] - m))) {
                layer = l;
                e = c;
            }
        });
        if (layer === null) return null;
    }
    e.used = now();
    const rate = Math.pow(2, (midi - (LOW + STEP * idx)) / 12 + (RETUNE[idx] * 0.6) / 1200);
    const gainDb = clamp(targetLoudness(midi, m) - LOUD[layer][idx], -40, 9);
    return {
        head: e.head,
        tail: e.tail,
        split: e.split,
        rate,
        gain: Math.pow(10, gainDb / 20),
        // 力度和这一档录音差多少，高频就提 / 压多少（每差 1 个 MIDI 力度 0.22dB）：
        // 同一档里轻一点就暗一点，接到下一档时亮度是连着的
        tilt: clamp((m - NOMINAL[layer]) * 0.22, -6, 3),
        tiltFreq: clamp(3 * freq, 1000, 5000),
        // 比最弱那一档还轻：再把高频收一收（琴槌几乎是"放"在弦上的）
        soft: m < 40 ? 1200 + 12000 * Math.pow(m / 40, 2) : 0,
        layer,
    };
}

// 手抬起来那一下的松键声（没取到就顺手去取，这次先不响）
export function pianoKeyNoise(freq) {
    const key = `r${relIndex(toMidi(freq))}`;
    const e = store.get(key);
    if (!e) {
        if (!dead) want(key, 1500).catch(() => {});
        return null;
    }
    return e.head;
}

export function pianoPedalNoise(down) {
    const keys = (down ? ["pD1", "pD2"] : ["pU1", "pU2"]).filter((k) => store.has(k));
    if (!keys.length) return null;
    return store.get(keys[Math.floor(Math.random() * keys.length)]).head;
}

// { done, total, ready, failed }：眼下这一屏那一批取到了几个（取不到的也算"有结果了"，那几个音用合成的顶）
export function pianoStatus() {
    let done = 0;
    focus.forEach((k) => {
        if (store.has(k) || lost.has(k)) done++;
    });
    return { done, total: focus.size, ready: done >= focus.size, failed: dead, bytes };
}

export function onPianoStatus(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function emit() {
    const s = pianoStatus();
    listeners.forEach((fn) => {
        try { fn(s); } catch (err) { /* 界面的事不影响取采样 */ }
    });
}

export const pianoSamplesFailed = () => dead;
