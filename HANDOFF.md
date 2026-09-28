# HANDOFF · Unbroken（键盘一笔画）

> 写给一个完全不了解背景的新会话。先把这份读完再动手。
> 整理时间：2026-09-28。所有路径都相对项目根目录。

---

## 0. 一句话现状

**最新一轮（2026-09-28，已推送到 `main`）**：音乐模式的钢琴换成了**真钢琴录音**（Salamander Grand Piano），
加了四档力度、触键档位、松键声、踏板声、琴房卷积、加载进度。见第 2.5 节。
推送时按用户要求加了**在线版**：GitHub Pages，https://yanaoliu-jpg.github.io/unbroken/（见第 1 节"仓库"）。

再往前那一轮（第 3 节）也已推送（`git log` 第二条）。

**还没动手的事**：**每一关都要风格化——键盘颜色、背景颜色、流动的线条，每关都不一样**。见第 5 节第 1 条。

⚠️ `server.js` 这两轮都改了（压缩 + 缓存；这一轮给 `samples/` 加了一天的缓存），**要用户自己重启一下服务**才生效（不重启也能正常玩）。
仓库是**公开**的，推上去就等于发布；这一轮新增约 23MB 的 mp3（用户同意了下载进仓库）。

---

## 1. 项目是什么、怎么跑

**项目**：一个 Express 服务（`server.js`）加一个静态网站（`public/`）。整个网站只有一块 Three.js r186 的 3D 机械键盘，它在每一屏扮演不同的角色：

| 屏 | 键盘是什么 |
|---|---|
| 首页 | 背景 + 乐器 |
| 关卡 | 一笔画棋盘：上下左右相邻、每键只踩一次、走完所有亮键，共 14 关 |
| 过关 | 一场"梦"的过关仪式；AI（DeepSeek）用这一关的字母写一句英文 |
| 终局 | 14 层的塔 |
| 音乐模式 | 24 件乐器、曲库、编辑器、跟弹、渐变键帽 |
| 深海模式 | 键盘沉进发光的水箱（四种水：深海 / 火山 / 冰川 / 田园） |

另外还有声音检测页 `public/soundcheck.html`。

**运行**
- 第一次：`npm install`，然后 `cp .env.example .env`，在 `.env` 里填 `DEEPSEEK_API_KEY`。
- 启动：`npm start`，打开 http://localhost:3000（也可以双击 `启动游戏.command`）。

**关键约定**
- **端口 3000 的服务是用户自己开的，不要杀、不要重启。** 要测 `server.js` 就另起一个端口（比如 `PORT=3100 node server.js`），测完只关自己起的那个。
- 自己写的 html / js / css 带 `Cache-Control: no-cache`（改完刷新就生效）；`vendor/`、`fonts/` 让浏览器存一天。
- 改了 `server.js` 需要**用户自己**重启服务，要提醒他。

**仓库**
- 地址：https://github.com/yanaoliu-jpg/unbroken ，分支 `main`，**公开**。
- 最近一次推送：2026-09-28（上一轮 + 这一轮一起，`git log` 第一条）；再往前是 `eb580ff`。
- 提交作者邮箱是 GitHub 的 noreply 地址。
- **在线版**：https://yanaoliu-jpg.github.io/unbroken/ 。`.github/workflows/pages.yml` 在每次推送到 `main` 时把 `public/` 发布到 GitHub Pages
  （Pages 的来源设成了 "GitHub Actions"）。在线版没有服务端：`/api/generate` 回 404 / 405 / 501 时 `script.js` 记下 `noServer`，
  以后直接用本地词库拼句子（`localSentence`），不弹"AI 偷懒"按钮。DeepSeek key 只在本机 `.env`，在线版碰不到。

**自测入口**：地址后面加 `?debug`，内部状态会挂到 `window.__ub` 上。常用的：
- `stage`、`audio`、`state`、`style`
- `startLevel`、`handleKeyPress`、`solveFrom`、`skipLevel`、`showHint`、`goToNextLevel`
- `enterMusicMode`、`setInstrument`、`selectSong`、`playSong`、`musicPlayer`
- `enterAbyss` / `exitAbyss`、`abyss`
- `dream`、`dreamSky`、`enterDream` / `leaveDream`、`visualLag`
- `setMood`、`setScene`、`setFxField`、`showScreen`、`SONGS`、`LEVELS`
- `snap()` / `unsnap()`

---

## 2. 用户的习惯（很重要）

- 用户说中文，最后的总结用中文写。
- 常一次发一长串编号需求，并写"具体实现由你来定 / 你自己发挥"。
  - **设计和实现上的选择自己拿主意，不要反复问。**
  - 只有缺事实时才问。
- **没有当轮的明确要求，绝不 push。** "推送 / 合并到 main / 更新 github"才算。
- 会在工作中途追加消息（"顺便……"）。追加的事要一起做完，并在总结里交代。
- 会发参考图（比如这一轮的"键帽拆开飘起来"），照着图做。

---

## 2.5 最新一轮：真钢琴录音（状态：已完成、已测、**未提交**）

用户原话：钢琴要 "warm grand piano, rich harmonics, crystalline highs, deep resonant bass, delicate touch, long sustain,
intimate close-mic recording, natural room ambience"；建议用 Salamander 采样（每隔小三度一个、playbackRate 补中间的音）、
力度映射音量和音色、键盘没力度就按按键间隔 / 预设力度 ±5% 随机、松键 0.3–0.8 秒 release、空格延音踏板、加载完成前显示加载状态、
ConvolverNode 轻量混响 wet 15–20%。"可以采纳也可以按自己的想法，达到效果就行"。

- **采样**（`public/samples/piano/`，212 个 mp3、约 23MB，来源 https://tambien.github.io/Piano/audio/ ，CC BY 3.0，署名在那里的 README.txt 和主 README 末尾）：
  30 个音 × 力度 v4 / v7 / v10 / v13、rel1–88（松键声）、pedalD1/2、pedalU1/2。44.1k 立体声、约 100kbps；C4 约 16 秒、A0 约 26 秒。
- **`js/piano-samples.js`**（新）：按需取（优先级队列、3 路并行、失败重试一次、头三个都取不到就整套放弃 → 退回 `piano.js` 物理建模）、
  用自己的 `OfflineAudioContext(44.1k)` 解码、在 Worker 里整理（`piano.js` 的 `splitSample`：找起音去开头空白；头 2.5 秒原样，
  之后的余音半带滤波降到 22.05k，两段 60ms 线性交叉淡化——实测前 2.5 秒和原录音逐点一致、接缝处误差 -50dB、电平差 ≤ 0.02dB）。
  内存预算 180MB（手机 72MB），LRU 扔最久没弹的（这一屏那批不扔）。一屏一档力度约 50–60MB。
  - 表：`LOUD`（每个采样起音后 0.5 秒的 K 加权响度，离线用 ffmpeg + numpy 量的）、`TREND`（v10 的平滑走势，每个音往上对齐）、
    `RETUNE`（sfz 里 Markus Fiedler 的重新校音，只用 60%，保留一点伸展调律）。
  - 力度：引擎力度 1 = MIDI 76.5 = v10 的中点；选最近的一档；响度按 `TREND + 高音补 1/3 + 27·log10(m/76.5)` 算目标，减去这一档的 `LOUD` 得增益；
    亮度按和这一档的力度差 0.22dB/单位 做高架（`tilt`）；比 v4 还轻再加低通。
- **`audio.js`**：`play()` 里真钢琴走两段源（head + tail）→ 高架 → gate → **平衡**（`_balance`，不用 StereoPanner，见坑）→ 干声 + 各支路 + **琴房** `_room()`；
  制音器 `damperOf`（两段：τ1 快收到余振 floor，再 τ2 慢收；F6 以上没有制音器）；`voice.keyUp()` 出松键声（踩着踏板也有），`release(t, {quiet})`；
  `pedalNoise(down)`；`setSustain` 同时把琴房抬 2.3dB。`REAL_PIANO_GAIN = 0.56`、`ROOM_SEND = 0.28`、钢琴 `reverb` 0.32 → 0.2、`LOUDNESS_TRIM.piano = 0.673`。
  `makeReverb` 加了 `seed`（琴房固定 seed 1723，每次打开都是同一间）。
- **`script.js`**：触键 `TOUCHES`（轻柔 0.55 / 适中 1 / 有力 1.32，各自在一档录音的正中间，`mss-touch`）、`liveVelocity`（和弦 / 快速经过音 / 乐句开头 / 同音反复 + 慢漂移 + 抖动，总共 ±5% 左右）、
  `songVelocity`（强拍 = 小节线后第一个音 `downbeat`）；`warmPiano` 带 `focus`（加载进度只算这批）；`syncPianoLoad`（乐器名下面的进度条，手机上顶替 "PIANO" 那一行）；
  空闲 1.8 秒后预取 A 那一排；第 12 关、终局和弦也预取；makeHoldPlayer 松手先 `keyUp()` 再看踏板；涟漪强度跟力度。
- **测过的**（无头 Chrome，静音）：加载（本机 0.3 秒全好；限速 300KB/s 进度 0→74% 约 8 秒）、按键 / 踏板 / 松踏板、力度分布、换触键、
  404 退回合成钢琴、第 12 关、试听、深海、手机尺寸不溢出、LUFS（和中位数差 0.04dB）、琴房湿声（单独 15%，加默认大厅 17.5%）、频谱图（轻 → 重高次泛音明显变多，踏板和弦 9 秒还在）。
- **没人听过**：Claude 听不到声音。可调的：`ROOM_SEND`、琴房的 `makeReverb` 参数、`damperOf` 三个数、`TOUCHES` 的三个力度、
  `targetLoudness` 里的 27（力度的响度跨度）和 0.35（高音补多少）、`pickPiano` 里的 0.22（力度差补多少亮度）、松键声 -35dB、踏板声 +3dB。

## 3. 上一轮做了什么（状态：已完成、已测、已推送）

用户原话（2026-09-28）：
1. 切换乐器的 3D 动画改成键盘上每个按键飘上去、变色、再飘下来（附了两张键帽离开轴体的参考图）；
   深渊模式回滚到上一版，但可以调颜色（键盘、背景、水箱的棱柱），可以换风格（火山、冰川、田园……）。
2. 更新优化缓存，提升流畅度和画质的同时减轻负荷。
3. 音乐模式的键盘加一个渐变色的选项；能调不同场景背景音的大小；加强音质音色，尤其是钢琴。
4. 修：先按住一个键再按另一个，前一个"有几率松开"。
5. 钢琴的音效更逼真。
6. 深渊模式下也要能看到琴键对应的字母（用户的想法：利用高低差，把字母标在正面）。
7. 混响感觉没用，查程序对不对。

### 3.1 bug：前一个键"自己松开"（第 4 项）
- **根因**：不是逻辑也不是声音。每按一个键会从那个键荡开一圈"涟漪"，把经过的键帽往上抬 `wave * 0.06`，**按着的键也被抬**——
  相邻键按下时，按住的那颗弹回行程的 16%（隔一个键 12%），停 0.3 秒才落下，看上去就是"松开了"。
- 查过的其他可能：声部一直是 on；限幅器压缩量几乎为 0；A 按住时再进 B、C、D，A 的基频幅度前后只差约 0.5dB（B 进来之前就差这么多）。
- **修法**：`kb3d.js` `_updateKeys` 里涟漪的抬升乘 `(1 - press)`。复测：按住的键一直停在 -0.050（按到底）。

### 3.2 bug：混响"没用"（第 7 项）
- **根因**：`ConvolverNode` 默认做"等功率归一化"，会按脉冲的长度把它整段往下压（大厅那档被压了 33dB）；
  再叠上每件乐器送出量小、回送 0.62、混响前一道 260Hz 高通（钢琴低音区的能量几乎全在它下面）——
  钢琴开"大厅"时混响声比干声低 **19dB**（低音 A2 低 26dB），几乎听不见。
- **修法**（`audio.js`）：
  - 卷积器关掉自动归一化。注意构造参数叫 `disableNormalization`（**没有** `normalize` 这个选项，写了会被忽略），
    而且 `normalize = false` 要在挂 `buffer` 之前设。封装成 `convolver(ctx, buffer)`。
  - 脉冲响应自己归一到单位能量；早期反射改成比同时刻漫反射强 5–6 倍；漫反射前几十毫秒慢慢长出来。
  - `REVERBS` 每档加 `size`（早期反射疏密）和 `wet`（回送量）；高通改 150Hz、缓坡。
  - 复测（钢琴 C4，混响声比干声）：房间 -11.7dB、大厅 -8.5dB、教堂 -2.5dB。
  - 电影感不再额外加量；深海里的教堂只开到 `reverbMix: 0.65`；`applyStyle` 里显式 `reverbMix: 1`（不然从深海出来会一直小）。
- 踩延音踏板时 `audio.setSustain(true)`：混响送出量整体抬 2.6dB，模拟没弹的弦跟着共鸣。

### 3.3 钢琴（第 3、5 项）
- 新文件 `public/js/piano.js`：物理建模合成，一个音"算"成一段采样。算进去的东西：
  非谐性（B 按音区插值）、1/2/3 根弦（低音一根、到 C3 两根、再往上三根）之间 0.35–1.45 音分的失谐 → 拍频、
  起音声 + 余音两段衰减、击弦点约 1/8.5（第 8、16 个泛音附近很弱）、琴槌软硬（敲得越重越亮）、音板辐射（低音基音弱）、
  高频损耗（泛音越高死得越快）、琴槌敲击声 + 键撞底的低频"笃"、几个音板共振峰、尾巴 30% 淡出、前 0.5 秒均方根统一。
- `public/js/piano-worker.js`：在 Web Worker 里调它（模块 Worker；起不来就退回主线程一个一个算）。
  一个音的耗时：C2 约 100ms、C4 约 24ms、高音几毫秒。
- `audio.js`：
  - 采样按 44.1kHz 算、按 MIDI 号存在模块级的 `pianoBank` 里（`AudioBuffer` 不属于哪个上下文，现场和离线渲染共用）；
  - 每隔两个半音一个采样（偶数 MIDI），中间的音变速播放，最多偏一个半音；
  - 钢琴配方里 `sampled: "piano", sampleGain: 0.62`；采样没好时 `play()` 自动退回原来的实时合成钢琴，并顺手去要；
  - 松手 = 制音器：`damperTime(f)`，低音压得慢，F6（1397Hz）以上没有制音器；松手时一下很轻的毛毡"噗"（`_damperThud`）；
  - 力度小于 0.95 时加一个随力度走的低通（轻敲高频少）；
  - `preloadPiano(freqs)`（导出）、`engine.prepare(patch, freqs)`（声音检测页离线渲染前 await）。
- `script.js` 的 `warmPiano()`：进音乐模式 / 换成钢琴 / 换调换八度时把整块键盘会弹到的音排队去算（中间八度最先）；第 12 关（钢琴那关）开局也预算。
- 声部上限还是 48，但先挑自己会响完的单发音偷，实在没有才动按着的。

### 3.4 响度（第 3 项的一部分）
- 混响变响、钢琴换了 → 所有乐器在声音检测页重新量了一遍，`LOUDNESS_TRIM` 全部更新（量之前 26 件的差距 1.9dB，量完对齐到中位数）。
- 环境声：现场录 9 秒环境声总线、按 BS.1770 量（鸟叫雨滴是定时器排的，离线渲染抓不到），`AMB_TRIM` 对齐到 -38.9 LUFS。
  以前"林间"比"深海"轻了近 8dB。新加的三种（火山、冰川、田园）也量过。

### 3.5 环境声音量（第 3 项）
- 风格面板底下一行"环境 · 雨声 · 滑杆 · 80%"：每个场景各记各的（`style.ambVol[sceneId]`，存在 `mss-style` 里），
  "恢复默认"会一起清掉。
- 滑杆 0–100 → 音量 `2 × (v/100)²`（平方，低的那段细一点；最大是校准音量的 2 倍）。场景默认 55，深海默认 85。
- 深海的风格面板里也有一根，每种水各记各的。

### 3.6 渐变键帽（第 3 项）
- 音乐模式乐器那一排右边"键帽"：原色 / 同色渐变 / 海洋 / 日落 / 樱花 / 彩虹（`CAP_GRADS`），存在 `mss-capgrad`。
- `kb3d.js` 的 `setCapGradient(opts)`：字母键取渐变上自己位置（`gradT`，左下 → 右上）的颜色，功能键 ×0.55，
  强调键用点缀色（没有就取渐变对面那一头）；字的颜色按键帽亮度自动挑深浅（`_legendColorFor`）。
- 只在平常的音乐模式里生效（`syncCapGradient`：离开音乐模式、进深海都关掉）。

### 3.7 换乐器的过场：键帽飘起来（第 1 项）
- 替掉了上一轮的"镜头追着一条光线飞"（`FLIGHT_ROUTE`、`startInstrumentFlight` 都删了）。
- `kb3d.js`：
  - 轴体换成白色上盖 + 十字轴心两个合并网格（`switchMat` / `stemMat`，颜色跟配色：`switchHousing` / `switchStem`，
    没写就是乳白上盖 + 旋钮色轴心；深色配色的轴心自己微微发光）；
  - 每颗键多了 `fy / frx / frz`（飘起的高度和歪斜）、`fglow`（飘起来时底光照亮轴体）；
  - `startFloat({ spread, rise, hover, fall, height, onPeak, onLand, onDone })` / `endFloat()`（0.22 秒落下）/ `floating`。
    波从左上到右下（`x + 0.85z`），每颗键升起 → 悬 → 升到最高处 `onPeak`（这里换色）→ 落下 → "咔哒"一顿。
- `script.js` 的 `startInstrumentSwap` / `endSwap`：
  - 颜色用 `setColorway(cw, { hold: true })` 先压住，`onPeak` 里一颗颗 `releaseColorway`；
  - 镜头：在平常取景上叠 `stage.orbit.az / el` 的偏移（-22° / -10°），不用 `setFlyCam`——这样鼠标视差照常，开始结束都不跳；
    打断时 0.45 秒转回去，换屏时立刻清零；
  - 声音：升起时新乐器 do mi sol do（从左到右），落下时 16 下很轻的"咔哒"（`audio.keyClicks`），都按耳机延迟提前排；
  - 泛光：`dream.begin({ threshold: 2.1 })`，只让星尘发光；
  - 弹琴、再换乐器、离开音乐模式、进深海都立刻收场；1.2 秒内连着换不飘。

### 3.8 深海：回滚 + 风格 + 颜色 + 正面刻字（第 1、6 项）
- **回滚**：`abyss.js` 恢复成 `eb580ff` 那一版（上一轮加的体积光、水面倒影、焦散贴图、吸收都去掉了）。
  上一轮那版备份在会话临时目录里（新会话看不到了；要找回只能从这份 HANDOFF 的描述重写）。
  `post.js` 里上一轮加的 `depth` 选项和 `bloomFrom` 还留着，没人用，无害。
- **四种水**（`ABYSS_THEMES` / `ABYSS_THEME_ORDER`）：深海（和上一版一模一样的颜色）、火山、冰川、田园。
  每种：键帽配色（`colorways.js` 新加 `abyssVolcano / abyssGlacier / abyssMeadow`）、环境声、按键时的小声响
  （`audio.bubbles({ kind })`：泡 / 火星噼啪 / 冰晶叮 / 一阵风）、背景、雾、逆光、灯带、玻璃、水面、箱底、光束、
  泡的样子（`solid` 0 空心泡 / 1 实心火星花粉）、上升速度、烟、光柱颜色、水里的颗粒（`snowFall` 正沉负飘）、键帽上的光纹、灯光、调色。
  原来写死在着色器里的颜色全部改成共用的 uniform（`this.U`），换风格时每帧往新值挪（约一秒过渡）。
- **自己挑颜色**：键盘 / 背景 / 棱柱，每种水各记各的，存在 `mss-abyss`（`{ theme, custom: {主题: {keys,bg,edge}}, amb: {主题: 音量} }`）。
  键盘色由 `abyssColorway()` 现配一套（功能键深、强调键浅、字按亮度挑深浅）。
- **看得见字母**（用户的"高低差"方案）：进深海时 `stage.setTiers()` 让键帽一排比一排高（`ABYSS_TIERS = [1.6, 1.28, 0.96, 0.64, 0.32, 0]`，
  从 F 排到空格排，后排先升），每个琴键正面刻"字母 + 音级"（`legend` 里的 `front / frontSub`），F 排刻乐器名，Tab 刻"风格"，Esc 刻"浮上"。
  正面字带和顶面字共用一张画布（`kb3d.js` 的 `legendGeometry(w, vSplit)` 多了一片贴在正面的平面，平时透明）。
  `keyTop()` 算上了 `tierV`，所以气泡、光柱都从抬高后的键顶冒。
- 控制栏多了「风格」按钮（打开风格面板）；物理 `Tab` / 点 3D 键盘上的 tab 换下一种水（焦点在控制栏里时 Tab 还是正常的 Tab）。
- 控制栏的强调色跟着风格走（CSS 变量 `--ah-accent`）。
- 顺手修的老问题：在深海里按 F 键换乐器，控制栏上的乐器名以前不会变。

### 3.9 缓存和性能（第 2 项）
- **服务端**（`server.js`，要重启）：js / css / html / json / svg 首次被要时压一份（brotli，不支持就 gzip），按"文件 + 修改时间 + 大小"缓存在内存；
  带 ETag，304 能用；以点开头的路径不管；路径穿越挡掉。three.js 两个文件 766KB → gzip 约 196KB（brotli 更小）。
  `vendor/`、`fonts/`：`public, max-age=86400, stale-while-revalidate=604800`；其余 `no-cache`。
  用临时的 3100 端口测过：压缩、304、字体缓存头、`/.env` 和 `/../.env` 都是 404、解压后和原文件一致。
- **modulepreload**：`index.html` 里所有模块一起去要（写在 importmap 后面，顺序不能反）。
- **着色器提前编**（`post.js` 的 `prewarm()`，`dream.prewarm()`、`abyss.prewarm()`；页面加载 2.5 秒后空闲时调）：
  按真正用的时候的状态编（画进 HDR 渲染目标 / 画到屏幕、深海的 ACES、深海的雾、键帽的光纹补丁临时挂上再摘掉）。
  实测：第一次换乐器新建程序 11 → 2、最长一帧 67 → 33ms；第一次进深海 19 → 0、117 → 83ms（软件渲染下）。
- **背景画缓存**：`Backdrop` 留最近 4 张（按配色 + 尺寸）。
- **钢琴**：一个音从十几个振荡器变成一个采样节点。

---

## 4. 更早的几轮

### 上一轮（2026-09-27，和这一轮一起推送）
- 主题细节：37 套配色各有背景画（`motifs.js`，18 种画法）、空中飘的东西（`SceneFX`）、前景景深光斑、外壳铭牌。
- 小号（A 组 F9，替掉合成拨弦）、黄铜配色 `huangtong`。
- 性能：`GlowPath` 实例化（塔约 1394 → 300 次绘制）、`_step` 分档帧率（只有慢变化时 30fps）。
- 仓库改成公开。
- （换乐器的"追光线飞行"和深海的光追渲染这两样，在这一轮被用户要求替换 / 回滚了。）

### 已推送到 `eb580ff` 的
- 14 关（第 13 关 F→T 三种走法；第 14 关 Q 出发按 W O R L D、停在 D，唯一解）。
- 渐变（OKLab 插值的 `Gradient`）、"流光"。
- 过关仪式"一场梦"（`dream.js`、`dreamsky.js`、`post.js`）。
- 耳机延迟（`audio.latency()`、`visualLag()`、声音检测页第 ⑤ 栏）。
- 去掉的：曲风伴奏、导入乐谱、听歌识曲。
- 服务端加固：letters 1–12 个字母、每 IP 每分钟 30 次、DeepSeek 20 秒超时、请求体 2KB。

---

## 5. 目前的问题 / 待确认

1. **下一个任务：每一关都要风格化**（用户原话："键盘颜色 背景颜色 流动性的线条都需要在每一关有风格化"，
   之前还说"我希望每一关的键盘颜色不一样，因为之前是每一关都是风格化的"）。
   - **已经查到的原因**：风格面板里一选"场景"（比如为了试环境声滑杆选了"失恋"），`screenColorway()` 里场景的键帽配色排在关卡前面，
     十四关全部变成场景那一套（实测：不选场景 14 关 14 套配色；选"失恋"后 14 关全是"雨夜"，顶上却还写着"晨光 · 八音盒"……）。
     `updateAtmosphere()` 里场景的粒子也盖掉了每关自己飘的东西。
   - **已经想好的改法**（推送前写过、又按用户"只推送"撤回了，没提交）：
     `screenColorway()` 里关卡 / 过关 / 终局先返回这一关自己的配色，再轮到场景；
     `updateAtmosphere()` 里在这几屏不用场景的粒子（`const inLevelScreens = () => currentScreen === "game" || … "reward" || … "final"`）。
     场景在关卡里只管声音（环境声、混响）和灯光。
   - 还要顺着用户的话再看：每关的"流动的线条"（走线 `GlowPath` 的渐变、"流光"）和背景颜色在选了场景 / 情绪时是否也被统一了，
     确认 14 关各有各的样子，并在 README 的"风格"一节说明"关卡始终保留自己的配色"。风格面板里"场景"那行的说明也要改。
2. **要用户重启服务**：`server.js` 的压缩和缓存头才生效。
3. **声音没人听过**：Claude 听不到声音。钢琴、混响、新环境声、按键小声响、"咔哒"只看了频谱、LUFS 和能量比，需要用户说好不好听。
   可调的地方：钢琴见第 2.5 节最后一条（现在是真录音，`piano.js` 的物理建模只是退路）、`REVERBS` 的 `wet`、`AMB_TRIM`。
4. **真机 GPU 没测**：无头 Chrome 用的是软件渲染。换乐器飘键帽（87 颗键每帧都在动，阴影图每帧重算）在用户 Mac 上顺不顺，还不知道。
5. **Safari / iPhone 没测**：模块 Worker（Safari 15+）、`color-mix()`、`AudioBuffer` 构造函数（有退路）、`compileAsync`（没有就跳过预编）。
6. **钢琴长音**：已解决——真录音本身就长（C4 约 16 秒、A0 约 26 秒，录到底噪为止）。`pianoSeconds()` 只管物理建模那条退路。
7. `kb3d.js` 里 `setFlyCam` 现在没人用了（换乐器改成了叠环绕偏移），留着当通用接口。

---

## 6. 下一步怎么推进

1. 新会话开始时，先 `git status`、`git log -1`，确认工作区是干净的、最新的提交就是这次推送。
2. 做第 5 节第 1 条（每一关风格化）。
3. 等用户反馈：钢琴像不像、混响三档听不听得出、换乐器的飘键帽（高度、快慢、镜头转多少）、四种水好不好看、正面字够不够大。
4. 按反馈改。改完照第 10 节的方法测。
4. 用户说"推送"时再推：
   - `git add` 相关文件，确认不包含 `.env`；可以用 `git check-ignore -v .env` 验证。
   - 推送前扫一遍 key：`git log -p | grep -E 'sk-[A-Za-z0-9]{20,}'`，只允许 `.env.example` 里全 x 的占位符。
   - 提交信息用中文，末尾加 `Co-Authored-By` 那一行（照当时系统提示给的格式）。
   - `git push origin main`。

---

## 7. 推送包含的文件

**最近一次推送（真钢琴录音这一轮 + 在线版）**：
- 修改：`README.md`、`HANDOFF.md`、`server.js`、`public/index.html`、`public/style.css`、`public/script.js`、
  `public/js/audio.js`、`piano.js`、`piano-worker.js`、`soundcheck.js`
- 新增：`public/js/piano-samples.js`、`public/samples/piano/`（212 个 mp3 + README.txt，约 23MB）、`.github/workflows/pages.yml`

**上一次推送（2026-09-28）**：

- 修改：`README.md`、`server.js`、`public/index.html`、`public/style.css`、`public/script.js`、
  `public/js/abyss.js`、`audio.js`、`colorways.js`、`dream.js`、`kb3d.js`、`post.js`、`soundcheck.js`
- 新增：`public/js/motifs.js`（上一轮）、`public/js/piano.js`、`public/js/piano-worker.js`、`HANDOFF.md`（本文件）

---

## 8. 踩过的坑（一定要避开）

### 测试和环境
- **Claude 自带的浏览器面板**经常处于 `visibilityState === "hidden"`，截图是旧的。改用无头 Chrome 加 CDP，见第 10 节。
- **无头 Chrome 会用本机真实的扬声器出声。一定要加 `--mute-audio`**。
- **CDP 的 `Log.enable` 会重放这个标签页以前的控制台记录**：每次测试开一个新标签页（`/json/new`），并关掉旧的。
- **偏好存在 localStorage 里**（`mss-abyss`、`mss-capgrad`、`mss-style`、`mss-instrument`）：页面一加载就读了，
  测试前要先清掉再**重新加载**，不然上一次测试选的风格会带进来（这一轮就被它误导过一次）。
- 测 AI 造句时把 `window.fetch` 包一层，拦下 `/api/generate` 返回假句子，别花用户的 DeepSeek 额度。
- 本机的 `grep` 其实是 ugrep，长的多字节正则会报"复杂度超限"，用 python。本机没有 `timeout` 命令。
- zsh 里 `echo =====` 会报错，分隔线要加引号。

### Three.js r186
- `ShaderMaterial` 的前缀里已经有 tonemapping / colorspace 的 pars，自己再 `#include` 会重复定义；要用就直接调 `toneMapping()`、`linearToOutputTexel()`。
- 用了 `instanceColor` 时，片元着色器里会定义 `USE_COLOR`，`vColor` 是 vec4。
- `ShaderMaterial.clone()` 会把 uniform 复制一份：想让克隆体跟着共用的 uniform 变，要重新挂回去（深海的光束就是这样）。
- 同一个材质"画到屏幕"和"画进渲染目标"是两个着色器程序（色调映射、色彩空间不同），场景有没有雾也分两个——预编译要按真正用的时候的状态编。
- 按需渲染：动画要让 `_step` 知道自己在动（layer 的 `update()` 返回 true，或 `stage._touch()`；每颗键的变化要进 `_updateKeys` 的 calm 判断）。
- `GlowPath` 的线按 `growRate` 一段段长，测试里一口气按完时要 `path.complete()`。
- 外壳倒角让正面往外鼓了 0.09，贴在正面的东西要算上。
- 键帽顶面四周有 0.11 的圆角：正面平的那段只有 y 0.11–0.29；正面字带放在 0.10–0.34（字在中间）。

### 画面
- **浅色键帽加泛光会糊成一片白**：梦境里 `setDreamLight` 压暗；过场里泛光门槛调到 2.1。
- **按住的键不能被涟漪抬起来**（这一轮的 bug 就是它）。
- **入场动画 `.screen-enter > *` 的 `fill-mode: both` 会一直占着 `opacity`**，要变淡用 `filter: opacity()`。
- 深海里绿色 / 红色的背景光看起来比蓝色亮得多：同样的线性值，火山、田园要给得比深海小（这一轮压过两次）。

### 音频
- **`ConvolverNode` 的自动归一化会把长脉冲压掉 20–30dB**：用 `convolver()`（`disableNormalization` + 先设 `normalize=false` 再挂 buffer）。
- 并联的 `WaveShaperNode` 开了过采样会延迟约 3ms、和干声叠成梳状滤波：保持 `oversample: "none"`。
- 高音的泛音、FM 调制波可能超过奈奎斯特频率：新乐器要注意。
- 改了乐器配方或效果链，到声音检测页重量 LUFS：`trim = 旧 trim × 10^((中位数 − 分数)/20)`，写进 `LOUDNESS_TRIM`。
- 环境声里的鸟叫雨滴是 `setTimeout` 排的，离线渲染量不到：要现场录环境声总线再量。
- **Salamander 有些音左右两路几乎反相**（AB 立体声话筒：C5 相关系数 -0.84、A3 -0.43）：`StereoPannerNode` 对立体声输入会把一路混进另一路，
  基音被抵消。真钢琴一律走 `_balance`（ChannelSplitter → 左右各一个 Gain → Merger）。总线的"宽度"调窄时也会这样（那是用户自己选的）。
- 声音检测里拿渲染结果和原录音逐点比时，**要绕开总线**（`eng.dry` 直接接 `ctx.destination`）：限幅器有 6ms 预读、还有常开的均衡，不绕开对不齐。
- 随机生成的混响脉冲每个引擎都不一样，量 LUFS 会有 ±0.5dB 的抖动；琴房现在固定 seed，钢琴量 6 次标准差 0.1dB。
  限幅器的软膝让响度对 trim 不是线性的，要迭代两三次。
- `AudioBuffer.getChannelData()` 的内存不能直接转给 Worker：先拷一份再 transfer。

### 流程
- **不要 push**，除非用户当轮明确要求。
- **仓库是公开的**：带用户名的绝对路径、临时目录路径不要写进要提交的文件；`.env` 永远不进仓库。
- 不要杀、不要重启用户的 3000 端口服务。

---

## 9. 代码地图

```
server.js                    Express + /api/generate（DeepSeek、校验、限流、超时、兜底词库）+ 静态文件压缩和缓存头
public/index.html            页面结构（importmap 后面一串 modulepreload；.bg 里是背景光、backdrop-canvas、极光、scene-canvas……）
public/style.css             样式（颜色跟着配色的 CSS 变量走；深海控制栏跟着 --ah-accent）
public/script.js             主逻辑（约 5830 行）：
                             关卡、过关梦境、字母游戏、终局塔
                             音乐模式（乐器、曲库、编辑器、跟弹、换乐器飘键帽 startInstrumentSwap、渐变键帽 CAP_GRADS、warmPiano）
                             风格（MOODS / SCENES / 效果开关 / 环境声音量）、SceneFX、礼花粒子
                             深海入口（风格、自己挑的颜色、台阶、正面刻字）、延迟提示、?debug 钩子
public/js/kb3d.js            KeyboardStage：渲染循环、镜头、配色（hold/release、渐变键帽）、轴体、
                             键帽飘起 startFloat、台阶 setTiers、正面字带、梦境暗场、铭牌、塔；GlowPath；Gradient
public/js/audio.js           AudioEngine：26 份乐器配方、钢琴采样库、效果链（混响已修）、环境声（12 种）、
                             LOUDNESS_TRIM、AMB_TRIM、latency()、setSustain()、keyClicks()、bubbles({kind})
public/js/piano-samples.js   真钢琴录音：按需取 / 解码 / 整理、力度选档、响度和亮度补偿、内存预算、加载状态
public/js/piano.js           录音整理 splitSample（去开头空白、余音降采样）+ 物理建模钢琴（录音取不到时的退路）
public/js/piano-worker.js    后台线程：split（整理录音）、render（物理建模）
public/samples/piano/        Salamander 钢琴录音 212 个 mp3 + README.txt（来源、授权）
public/js/colorways.js       40 套配色（含深海的四种水）+ LEVEL_COLORWAYS + HOME_COLORWAY
public/js/motifs.js          配色 → 背景画（18 种画法）+ 空中粒子；Backdrop（带缓存）
public/js/dream.js           Dream：后期、GPU 星尘、光环、光柱；prewarm()
public/js/dreamsky.js        梦境背景的 2D 星空
public/js/post.js            BloomChain + prewarm()（着色器预编译）
public/js/abyss.js           深海：水箱、水面、焦散、气泡、烟、光柱、海雪、后期；ABYSS_THEMES（四种水）；prewarm()
public/js/soundcheck*.js     声音检测页（响度、频谱、音色、延迟）；离线渲染前 await engine.prepare()
public/vendor/three/         Three.js r186（本地一份）
```

---

## 10. 怎么测试（无头 Chrome + CDP）

**启动**（本机 Node 24，自带全局 `WebSocket`）：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 \
  --user-data-dir=<临时目录>/chrome-profile --enable-unsafe-swiftshader --mute-audio \
  --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check about:blank &
```

**驱动脚本**（约 60 行的 `drive.mjs`，上个会话的在临时目录里，新会话要重写）：
- `PUT http://127.0.0.1:9333/json/new?about:blank` 开新标签页，关掉旧的；连 `webSocketDebuggerUrl`。
- `Runtime.enable` / `Page.enable` / `Log.enable`；`Emulation.setDeviceMetricsOverride`（1440×900；手机 390×844，mobile: true）。
- `Runtime.evaluate`：`expression` 包成 `(async()=>{...})()`，`awaitPromise` + `returnByValue`。
- `Page.captureScreenshot` 存 png，再用 Read 看。收集 `consoleAPICalled` / `exceptionThrown` / `Log.entryAdded` 的错误。

**这一轮用过的测试**（照着重写就行）：
- 按住 A 再按 S、D：每 10ms 记 A 的 `t.press / v.press / holder.position.y`、声部状态、限幅器 `reduction`。
- 混响：同一个音"只留干声"（`eng.verbReturn.disconnect()`）和"只留混响"（`eng.dry.disconnect()`）各渲染一遍，比能量。
- 钢琴：`preloadPiano` 计时；`soundcheck.js` 的 `render` + `stft` + `drawSpectrogram` 出频谱图。
- 全部乐器 LUFS：`measureAll([...INSTRUMENT_ORDER, "pluck", "cosmos"])`，算新 trim。
- 环境声：`new AudioEngine()` 现场跑，环境声总线接一个 AnalyserNode，录 9 秒，`loudness()`。
- 换乐器：按 F9 后在 250 / 550 / 850 / 1150 / 1500ms 截图；检查结束后 `floating`、`fy`、`cwHold`、`orbit.az/el` 都归零；
  飘到一半弹琴 / 换屏要立刻收场。
- 深海：Tab 换四种水截图；正面字要放大截图才看得清；自己挑颜色用 `input.value = …; dispatchEvent(new Event("input"))`。
- 预编译：`renderer.info.programs.length` 在第一次换乐器、第一次进深海前后各读一次。
- 回归：14 关一路走完（每关结束读 `renderer.info.memory`，重开后几何体应回到同一个数）、关卡工具、音乐、风格、手机尺寸不溢出。

测试时的参考数字（1440×900）：首页约 200 次绘制；终局塔约 310 次；重开后几何体 190、贴图 101。

---

## 11. 其他事实

- 每关的配色依次是：晨光、薄荷、海雾、蜜橘、薰衣草、苔原、暮云、霜夜、星火、极光、青岚、破晓、流光、寰宇。首页配色：青岚。
- 乐器分组：
  - A 组：piano、rhodes、harp、marimba、musicbox、vibes、handpan、kalimba、trumpet、ember、aurora、glass
  - B 组：guitar、guzheng、strings、flute、organ、choir、celesta、steelpan、bass、pad、accordion、chip
- 用户的自编曲子存在浏览器 localStorage（`mss-custom-songs`），不在仓库里。
- 自动记忆目录里有几条笔记会自动加载：用户放手让我做设计决定、测试的做法、深海要简洁可调的那一版。
