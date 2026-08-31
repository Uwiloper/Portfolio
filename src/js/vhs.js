export class RealVHSEffect {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.lastDrawTime = 0;
        
        this.config = {
            fps: 30,
            snowOpacity: 0.25,
            tapeAge: 40,
            wobble: true
        };

        this.resize();
        window.addEventListener('resize', () => this.resize());
        requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        const vhsLayer = document.getElementById('layer-2-vhs');
        if (vhsLayer) {
            if (this.config.wobble) {
                vhsLayer.classList.add('wobbley');
            } else {
                vhsLayer.classList.remove('wobbley');
            }
        }
    }

    generateSnow() {
        const w = this.ctx.canvas.width;
        const h = this.ctx.canvas.height;
        const d = this.ctx.createImageData(w, h);
        const b = new Uint32Array(d.data.buffer);
        const len = b.length;
        const alpha = Math.floor(this.config.snowOpacity * 255);

        for (let i = 0; i < len; i++) {
            if (Math.random() < 0.5) {
                const val = (255 * Math.random()) | 0;
                b[i] = (alpha << 24) | (val << 16) | (val << 8) | val;
            }
        }
        this.ctx.putImageData(d, 0, 0);
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
        this.ctx.beginPath();
        
        for (let i = 0; i <= this.config.tapeAge; i++) {
            let x = Math.random() * this.canvas.width;
            let y1 = this.getRandomInt(posy1 += 3, posy2);
            let y2 = this.getRandomInt(0, posy3 -= 3);
            
            this.ctx.fillRect(x, y1, radius, radius);
            this.ctx.fillRect(x, y2, radius, radius);
            this.ctx.fill();
        }
        this.ctx.closePath();
    }

    loop(timestamp) {
        requestAnimationFrame((t) => this.loop(t));
        if (timestamp - this.lastDrawTime < 1000 / this.config.fps) return;
        this.lastDrawTime = timestamp;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.generateSnow();
        this.renderTrackingNoise();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.vhsEffect = new RealVHSEffect('vhs-canvas');
});