// 钢琴的后台线程，两种活：
//   render  算一个物理建模的钢琴音（真钢琴采样取不到时的退路，一个音几十毫秒）
//   split   整理一个刚解码的真钢琴录音：去掉开头的空白、余音降采样（见 piano.js 的 splitSample）
// 都放在这里，画面和手上弹的音都不受影响
import { renderPianoNote, splitSample } from "./piano.js";

self.onmessage = (e) => {
    const { id, type } = e.data;
    try {
        if (type === "split") {
            const out = splitSample(e.data.L, e.data.R, e.data.sr, { split: e.data.split });
            const transfer = out.head.map((d) => d.buffer);
            if (out.tail) out.tail.forEach((d) => transfer.push(d.buffer));
            self.postMessage({ id, ...out }, transfer);
            return;
        }
        const data = renderPianoNote(e.data.midi, e.data.sr);
        self.postMessage({ id, data }, [data.buffer]);
    } catch (err) {
        self.postMessage({ id, error: String(err && err.message ? err.message : err) });
    }
};
