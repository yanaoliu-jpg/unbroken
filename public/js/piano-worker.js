// 钢琴采样在这里算：一个音几十毫秒，放在后台线程里，画面和手上弹的音都不受影响
import { renderPianoNote } from "./piano.js";

self.onmessage = (e) => {
    const { id, midi, sr } = e.data;
    try {
        const data = renderPianoNote(midi, sr);
        self.postMessage({ id, data }, [data.buffer]);
    } catch (err) {
        self.postMessage({ id, error: String(err && err.message ? err.message : err) });
    }
};
