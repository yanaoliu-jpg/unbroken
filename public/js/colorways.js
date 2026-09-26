// 键帽配色：每一关换一套"键帽套装"，像机械键盘圈里的 GMK 套件那样各有名字和性格。
// 首页那套照着参考图来：深青外壳、湖蓝字母键、薄荷亮键、琥珀色功能键、金色旋钮。
//
// 字段：
//   case / plate      外壳（阳极氧化金属感）/ 键帽下面那块底板
//   alpha / alphaLegend   字母、数字、标点键 / 上面的字
//   mod / modLegend       修饰键（Tab、Shift、F 键……）
//   accent / accentLegend 强调键（Esc、Enter、方向键）
//   highlight         "亮起"时键帽本身变成的颜色（参考图里那几颗薄荷色的键）
//   glow              底光、路径、光环的颜色
//   knob              旋钮
//   legendGlow        字是否透光自发光（深色键帽 + 发光字，像背光键盘）
//   bg / ink          页面背景与文字（深色界面，从键盘配色里取调子）

export const COLORWAYS = {
    // 首页 / 第 11 关：参考图那一套
    qinglan: {
        name: "青岚",
        en: "Teal Haze",
        case: "#10403b",
        plate: "#0a211f",
        alpha: "#2c8c90",
        alphaLegend: "#dcfcf6",
        mod: "#1c5b62",
        modLegend: "#bfe9e3",
        accent: "#f2b93b",
        accentLegend: "#3b2a06",
        highlight: "#4fd9b9",
        glow: "#4fe6c4",
        knob: "#d9a441",
        legendGlow: false,
        bg: "#041211",
        ink: "#e6f7f3",
    },

    chenguang: {
        name: "晨光",
        en: "Dawn",
        case: "#efe3d6",
        plate: "#d6c6b6",
        alpha: "#f8f0e6",
        alphaLegend: "#d2537a",
        mod: "#eaa3b6",
        modLegend: "#6e2640",
        accent: "#ff7489",
        accentLegend: "#fff5f6",
        highlight: "#ffc2d1",
        glow: "#ff8fb1",
        knob: "#e6bf9c",
        legendGlow: false,
        bg: "#1a0d14",
        ink: "#fbecef",
    },

    bohe: {
        name: "薄荷",
        en: "Mint",
        case: "#bde5d5",
        plate: "#8fc4af",
        alpha: "#effaf5",
        alphaLegend: "#1a8a6e",
        mod: "#8bd4ba",
        modLegend: "#0d4a3a",
        accent: "#4ab6e6",
        accentLegend: "#05283a",
        highlight: "#7ff0cf",
        glow: "#3df2c0",
        knob: "#d6e2df",
        legendGlow: false,
        bg: "#05130f",
        ink: "#e8faf3",
    },

    haiwu: {
        name: "海雾",
        en: "Sea Mist",
        case: "#495a6e",
        plate: "#2d3846",
        alpha: "#c8d3e0",
        alphaLegend: "#283a52",
        mod: "#7b8da6",
        modLegend: "#eef4fa",
        accent: "#6aa4e8",
        accentLegend: "#0a1b33",
        highlight: "#a9cdf7",
        glow: "#8dc4ff",
        knob: "#adb8c6",
        legendGlow: false,
        bg: "#080d15",
        ink: "#e6edf6",
    },

    miju: {
        name: "蜜橘",
        en: "Honey",
        case: "#e88a31",
        plate: "#b35f17",
        alpha: "#f8ebd4",
        alphaLegend: "#7a4715",
        mod: "#f1b155",
        modLegend: "#583006",
        accent: "#2d9c7e",
        accentLegend: "#eafff7",
        highlight: "#ffd08a",
        glow: "#ffb13f",
        knob: "#f2d178",
        legendGlow: false,
        bg: "#140a03",
        ink: "#fff1de",
    },

    xunyicao: {
        name: "薰衣草",
        en: "Lavender",
        case: "#9b86cb",
        plate: "#6c58a0",
        alpha: "#ece5f8",
        alphaLegend: "#583ca2",
        mod: "#b8a3e6",
        modLegend: "#2b185a",
        accent: "#6a8ce0",
        accentLegend: "#eef2ff",
        highlight: "#d4c2ff",
        glow: "#b797ff",
        knob: "#d7ccf0",
        legendGlow: false,
        bg: "#0d0916",
        ink: "#f0eafb",
    },

    taiyuan: {
        name: "苔原",
        en: "Tundra",
        case: "#58623f",
        plate: "#393f29",
        alpha: "#cfd2b4",
        alphaLegend: "#394127",
        mod: "#7a8558",
        modLegend: "#f1f4e2",
        accent: "#c89455",
        accentLegend: "#2c1d0a",
        highlight: "#e3ecae",
        glow: "#c7da76",
        knob: "#b8986a",
        legendGlow: false,
        bg: "#0a0c06",
        ink: "#eef1df",
    },

    muyun: {
        name: "暮云",
        en: "Dusk",
        case: "#854665",
        plate: "#582a42",
        alpha: "#f5dfe5",
        alphaLegend: "#7a2a4c",
        mod: "#d5658d",
        modLegend: "#fff0f5",
        accent: "#eaa35a",
        accentLegend: "#3c1d03",
        highlight: "#ffb3cf",
        glow: "#ff7cb2",
        knob: "#e2b077",
        legendGlow: false,
        bg: "#14080f",
        ink: "#fbe8ee",
    },

    shuangye: {
        name: "霜夜",
        en: "Frost Night",
        case: "#17273e",
        plate: "#0d1728",
        alpha: "#dcecf8",
        alphaLegend: "#1a3556",
        mod: "#4d91bd",
        modLegend: "#e8f6ff",
        accent: "#7be6f3",
        accentLegend: "#052129",
        highlight: "#a8f1ff",
        glow: "#7ce8ff",
        knob: "#c6d6e8",
        legendGlow: false,
        bg: "#030812",
        ink: "#e8f3fb",
    },

    // 第 9 关：星火。深色键帽 + 透光的橙色字，像背光键盘在夜里亮着
    xinghuo: {
        name: "星火",
        en: "Ember",
        case: "#241e1c",
        plate: "#141010",
        alpha: "#3b3431",
        alphaLegend: "#ff8a3a",
        mod: "#2d2623",
        modLegend: "#ffad6b",
        accent: "#e4552c",
        accentLegend: "#fff1e8",
        highlight: "#ff7a36",
        glow: "#ff6a1c",
        knob: "#c77838",
        legendGlow: true,
        bg: "#0c0705",
        ink: "#fbeee6",
    },

    jiguang: {
        name: "极光",
        en: "Aurora",
        case: "#1c1936",
        plate: "#100e21",
        alpha: "#29244e",
        alphaLegend: "#5ff5d1",
        mod: "#372c6f",
        modLegend: "#bba9ff",
        accent: "#8b7ae2",
        accentLegend: "#f4f1ff",
        highlight: "#5ff5d1",
        glow: "#5cf2ce",
        knob: "#9da2c9",
        legendGlow: true,
        bg: "#05040e",
        ink: "#eeeafd",
    },

    // 第 12 关：破晓。夜蓝的外壳和修饰键、暖白的字母键、金色强调——天要亮了
    poxiao: {
        name: "破晓",
        en: "Daybreak",
        case: "#141938",
        plate: "#0b0e22",
        alpha: "#f6efe2",
        alphaLegend: "#1c2446",
        mod: "#222a55",
        modLegend: "#f4c96a",
        accent: "#f2bf4a",
        accentLegend: "#2b1f04",
        highlight: "#ffe29a",
        glow: "#ffcf5c",
        knob: "#e6b545",
        legendGlow: false,
        bg: "#04050e",
        ink: "#f7f1e6",
    },

    // ================= B 组乐器的键帽 =================
    // 吉他：胡桃木 + 骨白键帽
    hetao: {
        name: "胡桃", en: "Walnut",
        case: "#5a3a26", plate: "#2b1a10",
        alpha: "#e9d8bf", alphaLegend: "#5a3a26",
        mod: "#8a5a3a", modLegend: "#f3e6d2",
        accent: "#c9763a", accentLegend: "#2b1405",
        highlight: "#f0c38a", glow: "#ffb26b", knob: "#c9a36b",
        legendGlow: false, bg: "#120a06", ink: "#f6ece0",
    },
    // 古筝：朱砂漆 + 宣纸 + 金
    zhusha: {
        name: "朱砂", en: "Cinnabar",
        case: "#7e1c16", plate: "#3d0b08",
        alpha: "#f3e3c3", alphaLegend: "#8a1f18",
        mod: "#b8322a", modLegend: "#fbe7c6",
        accent: "#d9a43c", accentLegend: "#3b2204",
        highlight: "#ffd28a", glow: "#ff6b4a", knob: "#e0b053",
        legendGlow: false, bg: "#140504", ink: "#fbece0",
    },
    // 弦乐：酒红琴身 + 松香金
    jiuhong: {
        name: "酒红", en: "Bordeaux",
        case: "#4a1424", plate: "#230810",
        alpha: "#e8d2d6", alphaLegend: "#5b1a2c",
        mod: "#7a2439", modLegend: "#f5dde3",
        accent: "#c9a15a", accentLegend: "#2e1c05",
        highlight: "#f3b7c4", glow: "#ff7a9c", knob: "#c9a15a",
        legendGlow: false, bg: "#10040a", ink: "#f8e8ec",
    },
    // 长笛：竹青
    zhuqing: {
        name: "竹青", en: "Bamboo",
        case: "#4f7a52", plate: "#2a4230",
        alpha: "#eef4df", alphaLegend: "#3b6b40",
        mod: "#86b07a", modLegend: "#1d3a22",
        accent: "#d8c46a", accentLegend: "#2e2a06",
        highlight: "#c8f0a8", glow: "#9dfc8c", knob: "#cbd9a8",
        legendGlow: false, bg: "#06100a", ink: "#eef7ea",
    },
    // 管风琴：深色木 + 烛光一样发亮的金字 + 彩色玻璃的钴蓝
    jiaotang: {
        name: "教堂", en: "Cathedral",
        case: "#2a1f33", plate: "#140e1a",
        alpha: "#3a2e46", alphaLegend: "#f2c96a",
        mod: "#4b3a5c", modLegend: "#e6d4ff",
        accent: "#3f7fd9", accentLegend: "#eaf2ff",
        highlight: "#ffd479", glow: "#ffcf6a", knob: "#d4b06a",
        legendGlow: true, bg: "#07050a", ink: "#f4ecff",
    },
    // 人声：象牙白 + 淡紫的光
    shengtang: {
        name: "圣堂", en: "Chapel",
        case: "#cfc6e6", plate: "#9d92bf",
        alpha: "#fbf8ff", alphaLegend: "#6b5aa6",
        mod: "#b9aee0", modLegend: "#2e2352",
        accent: "#f0c0e0", accentLegend: "#4a1d3c",
        highlight: "#e8dcff", glow: "#cbb8ff", knob: "#e3dcf5",
        legendGlow: false, bg: "#0d0b16", ink: "#f3effd",
    },
    // 钢片琴：夜空蓝 + 银字
    xingchen: {
        name: "星辰", en: "Stardust",
        case: "#1b2447", plate: "#0d1227",
        alpha: "#25305c", alphaLegend: "#e6ecff",
        mod: "#2f3b6e", modLegend: "#b9c6ff",
        accent: "#c7d3ff", accentLegend: "#1b2447",
        highlight: "#eaf0ff", glow: "#b9ccff", knob: "#cfd6e6",
        legendGlow: true, bg: "#050814", ink: "#eef1ff",
    },
    // 钢鼓：加勒比海的蓝绿 + 沙色 + 太阳黄
    jialebi: {
        name: "加勒比", en: "Caribbean",
        case: "#0f7c86", plate: "#06464c",
        alpha: "#f7f1d8", alphaLegend: "#0f7c86",
        mod: "#25b3b8", modLegend: "#063b40",
        accent: "#ffcf3f", accentLegend: "#3d2c00",
        highlight: "#7ff2e8", glow: "#3ff5e0", knob: "#ffd36b",
        legendGlow: false, bg: "#031214", ink: "#eafffb",
    },
    // 贝斯：炭黑 + 黄铜，像深夜的爵士酒吧
    jueshi: {
        name: "爵士", en: "Jazz Club",
        case: "#262322", plate: "#121010",
        alpha: "#34302d", alphaLegend: "#e2b865",
        mod: "#45403c", modLegend: "#f0dcb0",
        accent: "#b8863b", accentLegend: "#1d1405",
        highlight: "#ffd28a", glow: "#ffb84d", knob: "#c8a05a",
        legendGlow: true, bg: "#0a0908", ink: "#f5ede0",
    },
    // 铺底：深紫星云 + 洋红与青的光
    xingyun: {
        name: "星云", en: "Nebula",
        case: "#1d1033", plate: "#0e0719",
        alpha: "#2a1848", alphaLegend: "#ff7ae0",
        mod: "#3a2262", modLegend: "#8fe8ff",
        accent: "#6a3cff", accentLegend: "#efe8ff",
        highlight: "#ff9ef0", glow: "#d06bff", knob: "#a58bd9",
        legendGlow: true, bg: "#06030d", ink: "#f4eaff",
    },
    // 手风琴：巴黎的红、奶油和深蓝
    bali: {
        name: "巴黎", en: "Paris",
        case: "#1e2a4a", plate: "#0f1528",
        alpha: "#f4ead8", alphaLegend: "#c0283a",
        mod: "#c0283a", modLegend: "#fff1e6",
        accent: "#f2c14e", accentLegend: "#3a2800",
        highlight: "#ffd6d6", glow: "#ff6a7a", knob: "#d9b56c",
        legendGlow: false, bg: "#070a14", ink: "#f8f1e8",
    },
    // 8-bit：老掌机的灰壳 + 橄榄绿屏幕色
    youxiji: {
        name: "掌机", en: "Handheld",
        case: "#c4c3b6", plate: "#7c7b70",
        alpha: "#8bac0f", alphaLegend: "#0f380f",
        mod: "#306230", modLegend: "#9bbc0f",
        accent: "#9a2257", accentLegend: "#f7dbe9",
        highlight: "#9bbc0f", glow: "#b4e02a", knob: "#5d5c55",
        legendGlow: false, bg: "#0b1a0b", ink: "#e8f5c8",
    },

    // ================= 场景 =================
    // 爱情：腮红粉 + 玫瑰红 + 玫瑰金旋钮
    meigui: {
        name: "玫瑰", en: "Rose",
        case: "#f3d7dc", plate: "#d6a6b0",
        alpha: "#fff4f4", alphaLegend: "#c2335b",
        mod: "#f29bb0", modLegend: "#5c0f24",
        accent: "#e2365f", accentLegend: "#fff0f3",
        highlight: "#ffc4d3", glow: "#ff6f95", knob: "#e8c2a0",
        legendGlow: false, bg: "#16070c", ink: "#ffeef2",
    },
    // 失恋：雨夜的蓝灰，所有颜色都褪掉一层
    yuye: {
        name: "雨夜", en: "Rainy Night",
        case: "#3a4552", plate: "#1e252e",
        alpha: "#8d99a6", alphaLegend: "#1c2530",
        mod: "#56626f", modLegend: "#d5dde5",
        accent: "#6d8bb3", accentLegend: "#0c1622",
        highlight: "#b8c9dc", glow: "#8fb4e8", knob: "#9aa4ad",
        legendGlow: false, bg: "#06090d", ink: "#dfe6ee",
    },
    // 冒险：峡谷的锈红和砂岩
    xiagu: {
        name: "峡谷", en: "Canyon",
        case: "#6b3a20", plate: "#34190c",
        alpha: "#e6c9a0", alphaLegend: "#6b3a20",
        mod: "#b0643a", modLegend: "#fff0dc",
        accent: "#2f6b5a", accentLegend: "#e6fff5",
        highlight: "#ffc27a", glow: "#ff9a3c", knob: "#c79a5a",
        legendGlow: false, bg: "#120804", ink: "#fbeee0",
    },
    // 梦想：长春花蓝 + 糖果粉 + 冰青的光
    mengjing: {
        name: "梦境", en: "Dreamscape",
        case: "#6b6fd6", plate: "#3f40a0",
        alpha: "#eef0ff", alphaLegend: "#5a4fd0",
        mod: "#9aa4ff", modLegend: "#1d1f66",
        accent: "#ff9ad5", accentLegend: "#4a0f33",
        highlight: "#bff3ff", glow: "#9ee8ff", knob: "#d9dbff",
        legendGlow: false, bg: "#07081a", ink: "#f0f1ff",
    },
    // 自然：苔藓、地衣和一片琥珀色的叶子
    senlin: {
        name: "森林", en: "Forest",
        case: "#2f4a2c", plate: "#172515",
        alpha: "#d9e6c3", alphaLegend: "#2f4a2c",
        mod: "#5f7f4a", modLegend: "#eef6e0",
        accent: "#c98f3c", accentLegend: "#2a1a04",
        highlight: "#d6f5a0", glow: "#b6f06a", knob: "#a88a5a",
        legendGlow: false, bg: "#050b05", ink: "#eef5e6",
    },
    // 城市：霓虹——黑色键帽里透出青色和洋红的字
    nihong: {
        name: "霓虹", en: "Neon",
        case: "#16161f", plate: "#0a0a10",
        alpha: "#1f1f2c", alphaLegend: "#3ef3ff",
        mod: "#2a2a3a", modLegend: "#ff4fd8",
        accent: "#ff2e88", accentLegend: "#fff0f7",
        highlight: "#6af7ff", glow: "#3ef3ff", knob: "#8a8aa0",
        legendGlow: true, bg: "#050508", ink: "#eef0ff",
    },
    // 海洋：深海蓝 + 会发光的字（像海里的荧光生物）+ 浪花白
    shenhai: {
        name: "深海", en: "Deep Sea",
        case: "#0b3a5a", plate: "#051d2e",
        alpha: "#1a5f86", alphaLegend: "#c8f4ff",
        mod: "#0f4a6e", modLegend: "#9fe3ff",
        accent: "#f4f1e6", accentLegend: "#0b3a5a",
        highlight: "#7fe0ff", glow: "#45d1ff", knob: "#9ac8d8",
        legendGlow: true, bg: "#020a12", ink: "#e6f7ff",
    },
    // 日落：暮紫外壳、蜜桃键帽、珊瑚修饰键、一颗橙色的太阳
    wanxia: {
        name: "晚霞", en: "Afterglow",
        case: "#5a2a52", plate: "#2c1228",
        alpha: "#ffd0a8", alphaLegend: "#8a2d4e",
        mod: "#e46a6a", modLegend: "#fff0e6",
        accent: "#ffb03a", accentLegend: "#3d1a00",
        highlight: "#ffd89a", glow: "#ff8a4c", knob: "#f0b070",
        legendGlow: false, bg: "#12060f", ink: "#fff0e8",
    },

    // 音乐模式里选"钢琴"时穿这一套：黑白键帽，红色 Esc / Enter
    classic: {
        name: "黑白",
        en: "Classic",
        case: "#18181c",
        plate: "#0e0e11",
        alpha: "#f3f3f0",
        alphaLegend: "#1b1b1e",
        mod: "#27272d",
        modLegend: "#ececea",
        accent: "#d8283f",
        accentLegend: "#ffffff",
        highlight: "#ffffff",
        glow: "#f4f1ea",
        knob: "#c4c4c8",
        legendGlow: false,
        bg: "#08080a",
        ink: "#f2f2ef",
    },
};

// 十二关依次穿的套装：从一个清晨走到下一个清晨
export const LEVEL_COLORWAYS = [
    "chenguang", "bohe", "haiwu", "miju", "xunyicao", "taiyuan",
    "muyun", "shuangye", "xinghuo", "jiguang", "qinglan", "poxiao",
];

export const HOME_COLORWAY = "qinglan";
