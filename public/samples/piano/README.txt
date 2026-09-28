钢琴录音 · Piano samples
========================

Salamander Grand Piano V3
一台 Yamaha C5 三角琴 / Yamaha C5 grand piano, recorded by Alexander Holm.

授权 / License: Creative Commons Attribution 3.0 Unported (CC BY 3.0)
https://creativecommons.org/licenses/by/3.0/

这些 MP3 来自 @tonejs/piano 项目，是它把 Salamander Grand Piano V3 的原始录音转成了 MP3：
These MP3 files come from the @tonejs/piano project (https://github.com/tambien/Piano),
which converted the original Salamander Grand Piano V3 recordings to MP3
(served at https://tambien.github.io/Piano/audio/). The files here are unmodified copies.

文件 / Files
  A0 C1 Ds1 Fs1 … A7 C8  × v4 v7 v10 v13 (.mp3)
      30 个音（从 A0 起每隔小三度）× 4 档力度（弱 → 强）
      30 notes, one every minor third from A0, × 4 velocity layers (soft → loud)
  rel1.mp3 … rel88.mp3
      88 个键各一个松键声（键回弹、琴槌落回）/ key-release noise, one per key
  pedalD1.mp3 pedalD2.mp3 pedalU1.mp3 pedalU2.mp3
      延音踏板踩下 / 抬起的声音 / sustain pedal down / up noises

怎么用的 / How they are used (js/piano-samples.js, js/piano.js)
  在浏览器里解码后：去掉开头的空白；2.5 秒以后的余音降到 22.05kHz 存（省内存）；
  没录到的音变速播放（最多偏一个半音）；Markus Fiedler 重新校音（"Retuned" 版）的数值用了六成。
  In the browser each file is decoded, its leading silence is trimmed and the quiet tail after 2.5 s is
  resampled to 22.05 kHz to save memory; pitches between the recorded notes are played back at a different
  rate (at most ±1 semitone); 60% of the tuning offsets from the "Retuned" version by Markus Fiedler are applied.
