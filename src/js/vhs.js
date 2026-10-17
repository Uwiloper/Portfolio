// Estática VHS del fondo.
// El ruido se genera UNA vez en unas cuantas baldosas de 512 px; cada cuadro pinta
// una al azar, desplazada al azar, como patrón que cubre la pantalla. Se ve igual que
// generar cada píxel en cada cuadro (grano de 1 px, 40 % de opacidad) pero la CPU
// casi no trabaja: el pintado lo hace la GPU.
const BALDOSA = 512;
const VARIANTES = 4;

export class RealVHSEffect {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.lastDrawTime = 0;

        // Ajuste final del fondo: estática al 40% (scanlines y viñeta van en global.css)
        this.config = {
            fps: 30,
            snowOpacity: 0.4,
            tapeAge: 40
        };

        this.patrones = Array.from({ length: VARIANTES }, () => this.crearPatron());

        this.resize();
        window.addEventListener('resize', () => this.resize());
        requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    // Mitad de los píxeles transparentes, la otra mitad gris al azar con la opacidad de la estática
    crearPatron() {
        const baldosa = document.createElement('canvas');
        baldosa.width = baldosa.height = BALDOSA;
        const bctx = baldosa.getContext('2d');
        const d = bctx.createImageData(BALDOSA, BALDOSA);
        const b = new Uint32Array(d.data.buffer);
        const alpha = Math.floor(this.config.snowOpacity * 255);

        for (let i = 0; i < b.length; i++) {
            if (Math.random() < 0.5) {
                const val = (255 * Math.random()) | 0;
                b[i] = (alpha << 24) | (val << 16) | (val << 8) | val;
            }
        }
        bctx.putImageData(d, 0, 0);
        return this.ctx.createPattern(baldosa, 'repeat');
    }

    drawSnow() {
        const { width: w, height: h } = this.canvas;
        const dx = (Math.random() * BALDOSA) | 0;
        const dy = (Math.random() * BALDOSA) | 0;

        this.ctx.save();
        this.ctx.translate(-dx, -dy);
        this.ctx.fillStyle = this.patrones[(Math.random() * VARIANTES) | 0];
        this.ctx.fillRect(0, 0, w + dx, h + dy);
        this.ctx.restore();
    }

    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - Math.ceil(min) + 1)) + Math.ceil(min);
    }

    renderTrackingNoise() {
        if (this.config.tapeAge <= 0) return;

        let posy1 = 200;
        let posy2 = this.canvas.height;
        let posy3 = this.canvas.height - 200;
        const radius = 2;

        this.ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;

        for (let i = 0; i <= this.config.tapeAge; i++) {
            let x = Math.random() * this.canvas.width;
            let y1 = this.getRandomInt(posy1 += 3, posy2);
            let y2 = this.getRandomInt(0, posy3 -= 3);

            this.ctx.fillRect(x, y1, radius, radius);
            this.ctx.fillRect(x, y2, radius, radius);
        }
    }

    loop(timestamp) {
        requestAnimationFrame((t) => this.loop(t));
        if (timestamp - this.lastDrawTime < 1000 / this.config.fps) return;
        this.lastDrawTime = timestamp;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawSnow();
        this.renderTrackingNoise();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new RealVHSEffect('vhs-canvas');
});
