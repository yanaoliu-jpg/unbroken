// ============================================================
// 梦境的天空：页面背景上的一层 2D 画布——
//   星云（几团渐变色的光，慢慢漂、慢慢呼吸）· 会闪的星星（亮的几颗带十字星芒）·
//   慢慢往上浮的光斑（像失焦的灯）· 偶尔划过的流星
// 只在过关仪式里亮起来；30fps、按 1 倍像素画（背景要的就是软），淡出后整个停下
// ============================================================
const FADE_MS = 1500; // 和 CSS 里 .dream-canvas 的淡入淡出一致

// 一张软的圆光（光斑）：边缘比中间亮一点，像镜头里失焦的灯
export function orbSprite(color) {
    const S = 128;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    r.addColorStop(0, withAlpha(color, 0.45));
    r.addColorStop(0.72, withAlpha(color, 0.62));
    r.addColorStop(0.9, withAlpha(color, 0.85));
    r.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = r;
    g.fillRect(0, 0, S, S);
    return c;
}

// 十字星芒：两道白色细光交叉 + 一圈这颗星自己的颜色
export function sparkleSprite(color) {
    const S = 64;
    const m = S / 2;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    let r = g.createRadialGradient(m, m, 0, m, m, m * 0.55);
    r.addColorStop(0, withAlpha(color, 0.7));
    r.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = r;
    g.fillRect(0, 0, S, S);
    [[S, 2.4], [2.4, S]].forEach(([w, h]) => {
        const l = w > h ? g.createLinearGradient(0, m, S, m) : g.createLinearGradient(m, 0, m, S);
        l.addColorStop(0, "rgba(255,255,255,0)");
        l.addColorStop(0.5, "rgba(255,255,255,1)");
        l.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = l;
        g.fillRect(m - w / 2, m - h / 2, w, h);
    });
    r = g.createRadialGradient(m, m, 0, m, m, 7);
    r.addColorStop(0, "#ffffff");
    r.addColorStop(0.45, withAlpha(color, 1));
    r.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = r;
    g.fillRect(m - 7, m - 7, 14, 14);
    return c;
}

// "#rrggbb" + 不透明度 → rgba()
export function withAlpha(hex, a) {
    const n = parseInt(String(hex).replace("#", "").slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class DreamSky {
    constructor(canvas, { reduced = false } = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.reduced = reduced;
        this.on = false;
        this.fadeUntil = 0;
        this.raf = null;
        this.last = 0;
        this.acc = 0;
        this.t = 0;
        this.colors = ["#ffffff"];
        this._loop = this._loop.bind(this);
        window.addEventListener("resize", () => {
            if (this.on) {
                this._size();
                this._seed();
            }
        });
        document.addEventListener("visibilitychange", () => this._sync());
    }

    // colors：这一关渐变上的几种颜色（CSS 十六进制）
    show(colors) {
        if (colors && colors.length) this.colors = colors;
        const fresh = !this.on;
        this.on = true;
        if (fresh || !this.stars) {
            this._size();
            this._seed();
        }
        this.canvas.classList.add("on");
        this._sync();
        if (this.reduced) this._draw(0);
    }

    hide() {
        if (!this.on) return;
        this.on = false;
        this.fadeUntil = performance.now() + FADE_MS;
        this.canvas.classList.remove("on");
    }

    _sync() {
        const run = (this.on || performance.now() < this.fadeUntil) && !document.hidden && !this.reduced;
        if (run && !this.raf) {
            this.last = performance.now();
            this.raf = requestAnimationFrame(this._loop);
        } else if (!run && this.raf) {
            cancelAnimationFrame(this.raf);
            this.raf = null;
        }
    }

    _size() {
        this.w = window.innerWidth;
        this.h = window.innerHeight;
        this.canvas.width = this.w;
        this.canvas.height = this.h;
    }

    _seed() {
        const W = this.w;
        const H = this.h;
        const R = Math.random;
        const cols = this.colors;
        // 星云：画在一张四分之一大小的图上，放大就是免费的柔焦
        const nw = Math.max(64, Math.round(W / 4));
        const nh = Math.max(64, Math.round(H / 4));
        const neb = document.createElement("canvas");
        neb.width = nw;
        neb.height = nh;
        const g = neb.getContext("2d");
        g.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
            const x = nw * (0.12 + R() * 0.76);
            const y = nh * (0.08 + R() * 0.6);
            const r = Math.min(nw, nh) * (0.35 + R() * 0.45);
            const grad = g.createRadialGradient(x, y, 0, x, y, r);
            const col = cols[i % cols.length];
            grad.addColorStop(0, withAlpha(col, 0.2 + R() * 0.12));
            grad.addColorStop(0.5, withAlpha(col, 0.07));
            grad.addColorStop(1, withAlpha(col, 0));
            g.fillStyle = grad;
            g.fillRect(0, 0, nw, nh);
        }
        this.neb = neb;
        this.orbSprites = cols.map(orbSprite);
        this.sparkSprites = cols.map(sparkleSprite);
        const small = W < 700;
        const nStars = Math.round((W * H) / (small ? 7000 : 9000));
        this.stars = Array.from({ length: nStars }, () => {
            const big = R() < 0.07;
            return {
                x: R() * W, y: R() * H * 0.92, r: big ? 12 + R() * 14 : 0.5 + R() * 1.3,
                a: big ? 0.8 : 0.35 + R() * 0.6, ph: R() * 6.28, sp: 0.6 + R() * 2.2, big, c: Math.floor(R() * cols.length),
            };
        });
        this.orbs = Array.from({ length: small ? 5 : 9 }, () => ({
            x: R() * W, y: R() * H, r: 10 + R() * 34, vy: -(5 + R() * 12), vx: (R() - 0.5) * 6,
            a: 0.05 + R() * 0.09, ph: R() * 6.28, c: Math.floor(R() * cols.length),
        }));
        this.shoots = [];
        this.nextShoot = 0.8 + R() * 1.5;
    }

    _loop(now) {
        this.raf = requestAnimationFrame(this._loop);
        if (!this.on && now >= this.fadeUntil) {
            // 淡完了：清空、停下
            cancelAnimationFrame(this.raf);
            this.raf = null;
            this.ctx.clearRect(0, 0, this.w, this.h);
            return;
        }
        const dt = Math.min(0.1, (now - this.last) / 1000);
        this.last = now;
        this.acc += dt;
        if (this.acc < 1 / 30) return; // 30fps 就够了
        const step = this.acc;
        this.acc = 0;
        this._draw(step);
    }

    _draw(dt) {
        const c = this.ctx;
        const W = this.w;
        const H = this.h;
        this.t += dt;
        const t = this.t;
        c.clearRect(0, 0, W, H);
        c.globalCompositeOperation = "lighter";
        // 星云：慢慢漂，慢慢呼吸
        c.globalAlpha = 0.8 + 0.2 * Math.sin(t * 0.4);
        const dx = Math.sin(t * 0.05) * W * 0.03;
        const dy = Math.cos(t * 0.043) * H * 0.03;
        c.drawImage(this.neb, dx - W * 0.06, dy - H * 0.06, W * 1.12, H * 1.12);
        // 星星：小的是一个点，大的是一颗十字星芒，各闪各的
        c.fillStyle = "#ffffff";
        this.stars.forEach((s) => {
            const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
            c.globalAlpha = s.a * tw;
            if (s.big) {
                const r = s.r * (0.75 + 0.25 * tw);
                c.drawImage(this.sparkSprites[s.c], s.x - r, s.y - r, r * 2, r * 2);
            } else {
                c.fillRect(s.x - s.r / 2, s.y - s.r / 2, s.r, s.r);
            }
        });
        // 光斑：慢慢往上浮，从上面出去再从下面进来
        this.orbs.forEach((o) => {
            o.y += o.vy * dt;
            o.x += (o.vx + Math.sin(t * 0.3 + o.ph) * 5) * dt;
            if (o.y < -o.r * 2) {
                o.y = H + o.r * 2;
                o.x = Math.random() * W;
            }
            c.globalAlpha = o.a * (0.75 + 0.25 * Math.sin(t * 0.7 + o.ph));
            c.drawImage(this.orbSprites[o.c], o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
        });
        // 流星
        this.nextShoot -= dt;
        if (this.nextShoot <= 0) {
            this.nextShoot = 1.6 + Math.random() * 3.2;
            const fromLeft = Math.random() < 0.5;
            this.shoots.push({
                x: fromLeft ? Math.random() * W * 0.5 : W * 0.5 + Math.random() * W * 0.5, y: Math.random() * H * 0.35,
                vx: (fromLeft ? 1 : -1) * (520 + Math.random() * 380), vy: 160 + Math.random() * 140,
                life: 0, max: 0.7 + Math.random() * 0.5, c: this.colors[Math.floor(Math.random() * this.colors.length)],
            });
        }
        this.shoots = this.shoots.filter((s) => {
            s.life += dt;
            if (s.life >= s.max) return false;
            const k = s.life / s.max;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            const tail = 0.16;
            const g = c.createLinearGradient(s.x - s.vx * tail, s.y - s.vy * tail, s.x, s.y);
            g.addColorStop(0, withAlpha(s.c, 0));
            g.addColorStop(0.7, withAlpha(s.c, 0.5));
            g.addColorStop(1, "rgba(255,255,255,0.95)");
            c.globalAlpha = Math.sin(Math.PI * k);
            c.strokeStyle = g;
            c.lineWidth = 1.8;
            c.lineCap = "round";
            c.beginPath();
            c.moveTo(s.x - s.vx * tail, s.y - s.vy * tail);
            c.lineTo(s.x, s.y);
            c.stroke();
            return true;
        });
        c.globalAlpha = 1;
        c.globalCompositeOperation = "source-over";
    }
}
