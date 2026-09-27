require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.disable('x-powered-by');

// 静态文件每次都让浏览器回来确认一下有没有更新（没变就是一个 304，很便宜）。
// 不然改了 js 之后浏览器可能还在用旧的模块，页面会报一些莫名其妙的错
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));
// 请求体只有几个字母：给 2KB 足够，大了直接拒
app.use(express.json({ limit: '2kb' }));

// ---------- 输入校验 + 限流 ----------
// 只收 1–12 个英文字母：请求里别的东西一概进不了提示词
const LETTERS_RE = /^[A-Za-z]{1,12}$/;
// 同一个地址每分钟最多 30 次。放到公网上时，别让人拿你的 DeepSeek key 刷请求；
// 超了不报错，直接用本地词库拼一句（玩的人照样有句子看）
const RATE = { windowMs: 60 * 1000, max: 30 };
const hits = new Map();
function rateLimited(ip) {
    const now = Date.now();
    let h = hits.get(ip);
    if (!h || now > h.reset) {
        h = { count: 0, reset: now + RATE.windowMs };
        hits.set(ip, h);
    }
    h.count += 1;
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    return h.count > RATE.max;
}
// DeepSeek 偶尔会很慢（它要先想一大段）：20 秒还没回来就不等了，用兜底
const API_TIMEOUT_MS = 20000;

// ---------- 本地词库（兜底） ----------
const WORD_BANK = {
    a: ["Amazing", "Always", "All", "Awake", "Alive", "Awesome"],
    b: ["Brave", "Bright", "Beautiful", "Believe", "Bold", "Blessed"],
    c: ["Calm", "Cheerful", "Courageous", "Create", "Caring", "Cozy"],
    d: ["Dream", "Daring", "Delightful", "Dazzling", "Dear", "Devoted"],
    e: ["Eager", "Endless", "Ever", "Eternal", "Easy", "Enough"],
    f: ["Fearless", "Free", "Friendly", "Fun", "Fond", "Flourishing"],
    g: ["Gentle", "Great", "Graceful", "Grow", "Golden", "Grateful"],
    h: ["Happy", "Hopeful", "Heart", "Heal", "Home", "Humble"],
    i: ["Inspired", "Infinite", "Imagine", "Ideal", "Important", "Inviting"],
    j: ["Joyful", "Jubilant", "Just", "Jazzy", "Jolly", "Jaunty"],
    k: ["Kind", "Knowing", "Keen", "Key", "Kinetic", "Kindred"],
    l: ["Lovely", "Laughing", "Light", "Limitless", "Lucky", "Loyal"],
    m: ["Magic", "Mighty", "Merry", "Mindful", "Marvelous", "Mellow"],
    n: ["Noble", "New", "Nearby", "Nurturing", "Nimble", "Needed"],
    o: ["Open", "Optimistic", "Original", "Outstanding", "Onward", "Overjoyed"],
    p: ["Peaceful", "Playful", "Precious", "Proud", "Patient", "Plucky"],
    q: ["Quiet", "Quick", "Quality", "Quirky", "Quaint", "Quenching"],
    r: ["Radiant", "Real", "Ready", "Remarkable", "Resilient", "Rested"],
    s: ["Sunny", "Safe", "Sweet", "Sparkling", "Steady", "Seen"],
    t: ["True", "Tender", "Trusted", "Thriving", "Treasured", "Tranquil"],
    u: ["Unique", "Unbroken", "Uplifted", "Upbeat", "Unhurried", "Useful"],
    v: ["Vibrant", "Valued", "Vivid", "Victorious", "Vital", "Velvety"],
    w: ["Warm", "Wonderful", "Wise", "Welcome", "Whole", "Willing"],
    x: ["Xtra", "Xenial", "X-factor", "Xciting", "Xuberant"],
    y: ["Yes", "Yours", "Youthful", "Yielding", "Yummy", "Yearning"],
    z: ["Zen", "Zesty", "Zealous", "Zippy", "Zingy", "Zany"]
};

function generateFallback(letters) {
    return letters.split('').map(l => {
        const opts = WORD_BANK[l.toLowerCase()] || ['Great'];
        return opts[Math.floor(Math.random() * opts.length)];
    }).join(' ');
}

// 字母是否都出现过（位置随意、顺序无关）。
// 只用来在多个候选里择优，不作为「能不能用」的门槛。
function hasAllLetters(sentence, letters) {
    const lower = sentence.toLowerCase().replace(/[^a-z]/g, '');
    for (const ch of letters.toLowerCase()) {
        if (lower.indexOf(ch) === -1) return false;
    }
    return true;
}

// 模型在思考时会谈论任务本身（"Missing Q"、"That's 8 words"），
// 这些句子结构完整、还常常「字母齐全」，必须挡掉。
const META_WORDS = /\b(letter|letters|sentence|word|words|output|prompt|user|tag|include|missing|encouraging)\b/i;

function isUsable(candidate) {
    if (candidate.length < 5 || candidate.length > 200) return false;
    // 至少 3 个三字母以上的词，挡掉「Q, X, Z, J, V.」这类字母清单
    const realWords = candidate.split(/[^A-Za-z]+/).filter((w) => w.length >= 3);
    if (realWords.length < 3) return false;
    return !META_WORDS.test(candidate);
}

// 从一段原始文本里捞出所有像句子的候选，按可信度排序。
// 不做字母校验——先保证「有句子可用」。
function extractCandidates(raw) {
    const text = (raw || '').trim();
    const out = [];
    const push = (s) => {
        const c = (s || '').trim();
        if (isUsable(c) && !out.includes(c)) out.push(c);
    };

    // 1. 完整标签 <sentence>xxx</sentence>
    let m = text.match(/<sentence>\s*(.+?)\s*<\/sentence>/i);
    if (m) push(m[1]);

    // 2. 标签被截断，只取后面第一句
    m = text.match(/<sentence>\s*([A-Z][A-Za-z\s,'’-]+[.!?])/i);
    if (m) push(m[1]);

    // 3. 引号里的内容。模型在思考时会把候选句子加引号试写，
    //    这些往往就是它最后想用的那句，优先于裸扫描。
    const quoted = text.matchAll(/["“]([^"”]{10,200})["”]/g);
    for (const q of quoted) push(q[1]);

    // 4. 整段本身就是句子（模型忘了加标签）
    const bare = text.replace(/<\/?sentence>/gi, ' ').trim();
    m = bare.match(/([A-Z][A-Za-z\s,'’-]{9,}[.!?])/);
    if (m) push(m[1]);

    return out;
}

app.post('/api/generate', async (req, res) => {
    const { letters } = req.body || {};

    if (typeof letters !== 'string' || !LETTERS_RE.test(letters)) {
        return res.status(400).json({ error: 'letters 只能是 1–12 个英文字母' });
    }
    if (rateLimited(req.ip)) {
        console.log(`⏳ 请求太频繁（${req.ip}），用兜底词库`);
        return res.json({ sentence: generateFallback(letters) + '!', fallback: true });
    }
    if (!process.env.DEEPSEEK_API_KEY) {
        return res.json({ sentence: generateFallback(letters) + '!', fallback: true });
    }

    console.log(`📤 收到请求: ${letters}`);

    const lettersStr = letters.toUpperCase().split('').join(', ');
    const userPrompt = `Write ONE short encouraging English sentence (max 14 words).` +
        ` Try to work in the letters ${lettersStr} somewhere — position and order do not matter,` +
        ` and it is fine to miss one or two. A natural, warm sentence matters more than the letters.` +
        ` Output ONLY: <sentence>your sentence here</sentence>`;

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(API_TIMEOUT_MS),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'deepseek-v4-flash',
                messages: [
                    {
                        role: 'system',
                        content: 'Output ONLY a <sentence>your text here</sentence> tag. No other text. No explanations.'
                    },
                    { role: 'user', content: userPrompt }
                ],
                // 这个模型会先输出一大段 reasoning 才写 <sentence>。900 在生僻字母组合上
                // 偶尔会在句子写完前截断、content 变空——这种情况由下面的分层提取兜住，
                // 会从 reasoning 里捞出模型试写过的句子。再往下调就会频繁失败。
                max_tokens: 900,
                temperature: 0.8,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('❌ API 错误:', response.status, errText);
            return res.json({ sentence: generateFallback(letters) + '!' });
        }

        const data = await response.json();
        const msg = data.choices?.[0]?.message || {};
        const content = (msg.content || '').trim();
        const reasoning = (msg.reasoning_content || '').trim();

        console.log('📝 content:', content ? content : '(empty)');
        if (reasoning) console.log('📝 reasoning:', reasoning.slice(-300));

        // 按可信度分层：content 最可信，reasoning 次之，整个响应体兜最后。
        // 择优只在同一层内部进行——否则 reasoning 里的碎片会盖过 content 里的正经句子。
        const tiers = [
            ['content', extractCandidates(content)],
            ['reasoning', extractCandidates(reasoning)],
            ['JSON', extractCandidates(JSON.stringify(data))],
        ];

        let sentence = '';
        for (const [name, list] of tiers) {
            if (!list.length) continue;
            // 同层里字母齐全的优先，没有就用第一个——只要有句子就不走兜底
            sentence = list.find((c) => hasAllLetters(c, letters)) || list[0];
            console.log(
                `✅ 采用 ${name} 候选（${list.length} 个，` +
                `字母${hasAllLetters(sentence, letters) ? '齐全' : '不全但可用'}）`
            );
            break;
        }

        if (!sentence) {
            console.log('⚠️ 模型没给出可用句子，使用兜底词库');
            sentence = generateFallback(letters) + '!';
        }

        sentence = sentence.replace(/^["'`]|["'`]$/g, '').trim();
        if (!/[.!?]$/.test(sentence)) sentence = sentence + '.';

        console.log(`✅ 最终返回: ${sentence}`);
        res.json({ sentence });

    } catch (error) {
        console.error('❌ 错误:', error.message);
        res.json({ sentence: generateFallback(letters) + '!' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 服务已启动`);
    console.log(`📍 本机访问: http://localhost:${PORT}`);
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`📍 内网访问: http://${net.address}:${PORT}`);
            }
        }
    }
    console.log(`🔑 API Key: ${process.env.DEEPSEEK_API_KEY ? '已设置 ✅' : '未设置 ❌'}`);
    console.log(`🤖 模型: deepseek-v4-flash`);
});