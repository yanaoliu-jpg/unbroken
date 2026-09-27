// 声音检测页的界面：实时自检、响度表、频谱图、音色相似度、延迟
import { AudioEngine, INSTRUMENTS, INSTRUMENT_ORDER } from "./audio.js";
import { PATTERNS, freqOfIdx, renderPatch, stft, drawSpectrogram, measureAll, timbreAll, similarity } from "./soundcheck.js";

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "–");
const ms = (s) => Math.round(s * 1000);

// 整页共用一个音频引擎（一个 AudioContext），和游戏里走的是同一条声音链路
let live = null;
let raf = null;

function engine() {
    if (!live) {
        live = new AudioEngine();
        live.ensure();
        liveLoop();
    }
    live.unlock();
    return live;
}

// ---------------- ① 实时自检 ----------------
let peakHold = -Infinity;
let heard = -Infinity;

function liveLoop() {
    raf = requestAnimationFrame(liveLoop);
    const m = live.meter();
    if (!m) return;
    // -60 dBFS → 0%，0 dBFS → 100%
    const pct = (db) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
    $("live-bar").style.width = pct(m.rms) + "%";
    peakHold = Math.max(m.peak, peakHold - 0.4);
    $("live-peak").style.left = pct(peakHold) + "%";
    heard = Math.max(heard, m.rms);
    const L = live.latency();
    $("live-state").textContent =
        `状态 ${m.state} · ${live.ctx.sampleRate} Hz · 延迟 ${L ? ms(L.total) : "–"} ms · 电平 ${fmt(m.rms)} dB`;
}

async function liveTest() {
    engine();
    await live.ctx.resume().catch(() => {});
    heard = -Infinity;
    [261.63, 329.63, 392, 523.25].forEach((f, i) => live.play("piano", f, { when: i * 0.06, velocity: 0.9 }));
    const verdict = $("live-verdict");
    verdict.textContent = "听……";
    verdict.classList.remove("bad");
    setTimeout(() => {
        const st = live.ctx.state;
        if (st !== "running") {
            verdict.textContent = `✗ 浏览器把音频挂起了（${st}）。点一下页面任意位置再试；Safari 切过标签页后常这样。`;
            verdict.classList.add("bad");
        } else if (heard < -70) {
            verdict.textContent = "✗ 音频在跑，但送出来的是静音：检查系统音量、耳机，或者 Safari 的「此网站：自动播放」设置。";
            verdict.classList.add("bad");
        } else {
            verdict.textContent = `✓ 声音通路正常：最响的时候 ${fmt(heard)} dBFS。如果还是听不到，问题在系统音量或输出设备上。`;
        }
    }, 900);
}

// ---------------- ② 响度平衡 ----------------
let lastRows = null;

function playPattern(patch, pattern = "phrase") {
    const player = engine();
    const t0 = player.ctx.currentTime;
    PATTERNS[pattern].notes.forEach((n) => {
        const v = player.play(patch, freqOfIdx(n.idx), { when: n.t, hold: true });
        if (v) v.release(t0 + n.t + n.dur);
    });
}

async function measure() {
    const btn = $("btn-measure");
    btn.disabled = true;
    const prog = $("measure-progress");
    const rows = await measureAll(INSTRUMENT_ORDER, (row, i, n) => { prog.textContent = `${i} / ${n} · ${row.name}`; });
    lastRows = rows;
    window.soundcheckRows = rows;
    const scores = rows.map((r) => r.score).sort((a, b) => a - b);
    const target = scores[Math.floor(scores.length / 2)];
    const tbody = $("balance-table").querySelector("tbody");
    tbody.innerHTML = "";
    rows.forEach((r) => {
        const dev = r.score - target;
        const w = Math.min(50, (Math.abs(dev) / 6) * 50);
        const tr = document.createElement("tr");
        tr.innerHTML =
            `<td class="n">${r.name}</td><td>${fmt(r.phrase.integrated)}</td><td>${fmt(r.tap.momentary)}</td>` +
            `<td>${fmt(r.hold.momentary)}</td><td>${fmt(r.phrase.peak)}</td><td>${fmt(r.score)}</td>` +
            `<td><div class="sc-dev"><i class="${dev < 0 ? "lo" : ""}" style="${dev < 0 ? `right:50%;width:${w}%` : `left:50%;width:${w}%`}"></i></div></td>` +
            `<td><button class="sc-play" type="button">▶</button></td>`;
        tr.querySelector("button").addEventListener("click", () => playPattern(r.patch));
        tbody.appendChild(tr);
    });
    $("balance-table").hidden = false;
    const spread = scores[scores.length - 1] - scores[0];
    const worst = rows.reduce((a, b) => (Math.abs(b.score - target) > Math.abs(a.score - target) ? b : a));
    $("balance-summary").textContent =
        `中位数 ${fmt(target)} LUFS · 最响和最轻差 ${fmt(spread)} dB · 离得最远的是「${worst.name}」（${worst.score > target ? "+" : ""}${fmt(worst.score - target)} dB）`;
    prog.textContent = "测完了";
    btn.disabled = false;
}

// ---------------- ③ 频谱 ----------------
async function spectrum() {
    const patch = $("spec-inst").value;
    const pattern = $("spec-pattern").value;
    const audio = await renderPatch(patch, pattern);
    const spec = stft(audio, { size: 2048, hop: 256 });
    drawSpectrogram($("spec-canvas"), spec);
    const secs = audio.L.length / audio.sr;
    $("spec-note").textContent = `${INSTRUMENTS[patch].name} · ${PATTERNS[pattern].name} · ${secs.toFixed(1)} 秒 · ${spec.frames.length} 帧`;
}

// ---------------- ④ 像不像 ----------------
async function similar() {
    const btn = $("btn-similar");
    btn.disabled = true;
    btn.textContent = "在比……";
    const prints = await timbreAll(INSTRUMENT_ORDER);
    window.soundcheckTimbre = prints;
    const ids = INSTRUMENT_ORDER;
    const grid = $("sim-matrix");
    grid.innerHTML = "";
    grid.style.gridTemplateColumns = `90px repeat(${ids.length}, 1fr)`;
    grid.appendChild(Object.assign(document.createElement("span"), { className: "h" }));
    ids.forEach((id) => grid.appendChild(Object.assign(document.createElement("span"), { className: "h", textContent: INSTRUMENTS[id].name.slice(0, 2) })));
    const pairs = [];
    ids.forEach((a, i) => {
        grid.appendChild(Object.assign(document.createElement("span"), { className: "h", textContent: INSTRUMENTS[a].name }));
        ids.forEach((b, j) => {
            const s = i === j ? 1 : similarity(prints[a], prints[b]);
            if (j > i) pairs.push([a, b, s]);
            const cell = document.createElement("span");
            const t = Math.max(0, (s - 0.5) / 0.5);
            cell.style.background = `color-mix(in oklab, var(--glow) ${Math.round(t * 85)}%, transparent)`;
            cell.textContent = i === j ? "" : Math.round(s * 100);
            cell.title = `${INSTRUMENTS[a].name} × ${INSTRUMENTS[b].name}：${Math.round(s * 100)}`;
            grid.appendChild(cell);
        });
    });
    pairs.sort((x, y) => y[2] - x[2]);
    $("sim-pairs").innerHTML = pairs.slice(0, 6)
        .map(([a, b, s]) => `<li>${INSTRUMENTS[a].name} × ${INSTRUMENTS[b].name}：${Math.round(s * 100)}</li>`).join("");
    window.soundcheckPairs = pairs;
    btn.disabled = false;
    btn.textContent = "再比一次";
}

// ---------------- ⑤ 延迟 ----------------
// 上半：浏览器自己报的各段延迟（插拔耳机时自动刷新）
function readLatency() {
    const L = engine().latency();
    if (!L) return;
    const parts = [
        ["网页", 0.0005, "处理按键、排好这个音：不到 1 ms"],
        ["限幅器", L.limiter, "混音链末尾的限幅器固定预读 6 ms"],
        ["浏览器缓冲", L.base, "浏览器一次交给系统的一小块音频"],
        ["系统 + 耳机", L.output, L.source === "outputLatency" ? "系统报的输出延迟（蓝牙耳机大部分在这里）" : "推算的输出延迟"],
    ];
    const total = parts.reduce((s, p) => s + p[1], 0);
    $("lat-bar").innerHTML = parts.map(([name, v, tip], i) =>
        `<i class="l${i}" style="flex-grow:${Math.max(0.3, v * 1000)}" title="${tip}"><b>${name}</b><span>${v < 0.001 ? "<1" : ms(v)} ms</span></i>`).join("");
    const t = ms(total);
    const verdict = t < 60 ? "跟手：外放 / 有线耳机的正常水平" : t < 100 ? "稍慢：有点能感觉到" : "明显慢：多半是蓝牙耳机，弹琴会觉得慢半拍";
    $("lat-read").innerHTML = `浏览器报的总延迟 <b>${t} ms</b> · ${verdict}`;
    $("lat-read").classList.toggle("bad", t >= 100);
}

// 下半：跟着节拍按键实测（浏览器报的不一定准，尤其蓝牙）。有线测一次、蓝牙测一次，两次的差就是蓝牙多出来的
const TAP_BEAT = 0.6;     // 100 BPM
const TAP_COUNT_IN = 4;
const TAP_BEATS = 12;
const TAP_KEY = "ub-latency-taps";
let tap = null;

function tapResults() {
    try { return JSON.parse(localStorage.getItem(TAP_KEY)) || {}; } catch (err) { return {}; }
}

function renderTapResults() {
    const R = tapResults();
    const row = (id, name) => {
        const r = R[id];
        return `<tr><td class="n">${name}</td><td>${r ? `${r.ms > 0 ? "+" : ""}${r.ms} ms` : "还没测"}</td><td>${r ? `${r.n} 下 · 抖动 ±${r.spread} ms` : ""}</td><td>${r ? new Date(r.at).toLocaleString() : ""}</td></tr>`;
    };
    let html = row("wired", "有线耳机 / 外放") + row("bt", "蓝牙耳机");
    if (R.wired && R.bt) {
        const d = R.bt.ms - R.wired.ms;
        html += `<tr class="sum"><td class="n">蓝牙多出来</td><td><b>${d > 0 ? "+" : ""}${d} ms</b></td><td colspan="2">${d > 120 ? "差得很明显：弹琴时建议用有线耳机或外放" : d > 50 ? "能感觉到一点" : "差不多，蓝牙也能放心弹"}</td></tr>`;
    }
    $("tap-results").querySelector("tbody").innerHTML = html;
}

function clickSound(eng, t, accent) {
    // 一声短促的"嗒"：直接接进干声总线，和乐器走同一条链（限幅器、音量都一样）
    const ctx = eng.ctx;
    const o = new OscillatorNode(ctx, { type: "triangle", frequency: accent ? 1760 : 1320 });
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.38, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
    o.connect(g).connect(eng.dry);
    o.start(t);
    o.stop(t + 0.08);
}

async function startTap() {
    if (tap) return;
    const eng = engine();
    await eng.ctx.resume().catch(() => {});
    const ctx = eng.ctx;
    const t0 = ctx.currentTime + 0.5;
    const beats = [];
    for (let i = 0; i < TAP_COUNT_IN + TAP_BEATS; i++) {
        const t = t0 + i * TAP_BEAT;
        clickSound(eng, t, i % 4 === 0);
        if (i >= TAP_COUNT_IN) beats.push(t);
    }
    tap = { beats, offsets: [], taps: [], device: $("lat-device").value, end: t0 + (TAP_COUNT_IN + TAP_BEATS) * TAP_BEAT + 0.3 };
    $("btn-tap").disabled = true;
    $("tap-pad").classList.add("on");
    $("tap-pad").focus();
    $("tap-status").textContent = "先听四下，从第五下开始跟着按……";
    // 音频时钟 → performance.now()：每帧采一次两者的差，取中位数（currentTime 是一块一块跳的，单次读数有几毫秒的抖动）
    const sample = () => {
        if (!tap) return;
        tap.offsets.push(performance.now() - ctx.currentTime * 1000);
        if (ctx.currentTime < tap.end) requestAnimationFrame(sample);
        else finishTap();
    };
    requestAnimationFrame(sample);
}

function onTap(e) {
    if (!tap) return;
    e.preventDefault();
    tap.taps.push(e.timeStamp || performance.now());
    const pad = $("tap-pad");
    pad.classList.remove("hit");
    void pad.offsetWidth;
    pad.classList.add("hit");
}

function finishTap() {
    const T = tap;
    tap = null;
    $("btn-tap").disabled = false;
    $("tap-pad").classList.remove("on");
    const off = T.offsets.slice().sort((a, b) => a - b)[Math.floor(T.offsets.length / 2)] || 0;
    const beatsMs = T.beats.map((t) => t * 1000 + off); // 每一拍"音频开始处理"的那一刻（页面时钟）
    const diffs = [];
    T.taps.forEach((p) => {
        let best = null;
        beatsMs.forEach((b) => { if (best == null || Math.abs(p - b) < Math.abs(best)) best = p - b; });
        if (best != null && Math.abs(best) < TAP_BEAT * 1000 * 0.45) diffs.push(best);
    });
    if (diffs.length < 6) {
        $("tap-status").textContent = `只对上了 ${diffs.length} 下，不够算（至少 6 下）。再来一次，跟着"嗒"按就行，不用太紧张。`;
        return;
    }
    diffs.sort((a, b) => a - b);
    const med = Math.round(diffs[Math.floor(diffs.length / 2)]);
    const q1 = diffs[Math.floor(diffs.length * 0.25)];
    const q3 = diffs[Math.floor(diffs.length * 0.75)];
    const R = tapResults();
    R[T.device] = { ms: med, n: diffs.length, spread: Math.round((q3 - q1) / 2), at: Date.now() };
    try { localStorage.setItem(TAP_KEY, JSON.stringify(R)); } catch (err) { /* 隐私模式存不了：这次的结果照样显示 */ }
    $("tap-status").textContent = `这次：你按下的平均比"音频开始播放"晚 ${med} ms（${diffs.length} 下）。` +
        (T.device === "wired" ? "现在换上蓝牙耳机，选「蓝牙耳机」再测一次。" : "");
    renderTapResults();
}

// ---------------- 启动 ----------------
INSTRUMENT_ORDER.forEach((id) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = `${INSTRUMENTS[id].name} · ${INSTRUMENTS[id].en}`;
    $("spec-inst").appendChild(o);
});
Object.entries(PATTERNS).forEach(([id, p]) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = p.name;
    $("spec-pattern").appendChild(o);
});
$("btn-live").addEventListener("click", liveTest);
$("btn-measure").addEventListener("click", measure);
$("btn-spec").addEventListener("click", spectrum);
$("btn-spec-play").addEventListener("click", () => playPattern($("spec-inst").value, $("spec-pattern").value));
$("btn-similar").addEventListener("click", similar);
$("btn-lat").addEventListener("click", readLatency);
$("btn-tap").addEventListener("click", startTap);
$("tap-pad").addEventListener("pointerdown", onTap);
document.addEventListener("keydown", (e) => {
    if (tap && e.code === "Space" && !e.repeat) onTap(e);
});
// 插拔耳机：系统报的延迟会变，等设备切过去再读一遍
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => { if (live) setTimeout(readLatency, 1200); });
}
renderTapResults();
// 控制台里也能看：当前的引擎和正在进行的那次实测
window.soundcheckPage = { get engine() { return live; }, get tap() { return tap; }, readLatency };
// 地址栏带 ?inst=choir 时直接画那一件
const want = new URLSearchParams(location.search).get("inst");
if (want && INSTRUMENTS[want]) $("spec-inst").value = want;
spectrum();
