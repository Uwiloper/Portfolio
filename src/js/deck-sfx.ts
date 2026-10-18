// Sonidos mecánicos del deck, sintetizados con Web Audio (sin archivos): el clic de las teclas
// y el zumbido de la cinta al bobinar. Salen por la ganancia de la cinta, así que respetan
// la perilla de volumen.
import type { Cinta } from './cassette';

let ruido: AudioBuffer | null = null;

function bufferRuido(ctx: BaseAudioContext) {
  if (ruido && ruido.sampleRate === ctx.sampleRate) return ruido;
  ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const datos = ruido.getChannelData(0);
  for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
  return ruido;
}

/** Clic de una tecla mecánica: golpe de plástico (ruido corto) más el "thump" del mecanismo. */
export function clic(cinta: Cinta, fuerte = false) {
  const salida = cinta.salidaEfectos;
  if (!salida) return;
  const { ctx, destino } = salida;
  const t = ctx.currentTime;

  const golpe = ctx.createBufferSource();
  golpe.buffer = bufferRuido(ctx);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = fuerte ? 1800 : 2600;
  filtro.Q.value = 1.4;
  const gGolpe = ctx.createGain();
  gGolpe.gain.setValueAtTime(fuerte ? 0.45 : 0.28, t);
  gGolpe.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
  golpe.connect(filtro).connect(gGolpe).connect(destino);
  golpe.start(t, Math.random() * 0.5, 0.06);

  const mecanismo = ctx.createOscillator();
  mecanismo.frequency.setValueAtTime(fuerte ? 110 : 150, t);
  mecanismo.frequency.exponentialRampToValueAtTime(50, t + 0.07);
  const gMec = ctx.createGain();
  gMec.gain.setValueAtTime(fuerte ? 0.3 : 0.18, t);
  gMec.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  mecanismo.connect(gMec).connect(destino);
  mecanismo.start(t);
  mecanismo.stop(t + 0.09);
}

/**
 * Zumbido de la cinta corriendo rápido. actualizar(velocidad) en cada cuadro: el tono y el
 * volumen siguen a la velocidad (veces la normal); por debajo de 2x queda en silencio.
 */
export class Zumbido {
  private nodos: { fuente: AudioBufferSourceNode; filtro: BiquadFilterNode; ganancia: GainNode; ctx: BaseAudioContext } | null = null;

  constructor(private cinta: Cinta) {}

  actualizar(velocidad: number) {
    const v = Math.abs(velocidad);
    if (v < 2) { this.silenciar(); return; }
    const n = this.nodos ?? this.crear();
    if (!n) return;
    const t = n.ctx.currentTime;
    n.filtro.frequency.setTargetAtTime(Math.min(3800, 380 + v * 45), t, 0.05);
    n.ganancia.gain.setTargetAtTime(Math.min(0.16, 0.035 + v * 0.0035), t, 0.05);
  }

  silenciar() {
    if (!this.nodos) return;
    this.nodos.ganancia.gain.setTargetAtTime(0, this.nodos.ctx.currentTime, 0.04);
  }

  private crear() {
    const salida = this.cinta.salidaEfectos;
    if (!salida) return null;
    const { ctx, destino } = salida;
    const fuente = ctx.createBufferSource();
    fuente.buffer = bufferRuido(ctx);
    fuente.loop = true;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.Q.value = 3;
    const ganancia = ctx.createGain();
    ganancia.gain.value = 0;
    fuente.connect(filtro).connect(ganancia).connect(destino);
    fuente.start();
    this.nodos = { fuente, filtro, ganancia, ctx };
    return this.nodos;
  }
}
