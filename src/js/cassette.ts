// Motor del Lobby FM. El mixtape (todas las pistas seguidas en el lado A) se trata como UNA
// cinta con una línea de tiempo continua: "posición" son segundos desde el inicio de la cinta.
// La UI solo dibuja el estado y llama a estos métodos; el motor no sabe nada del diseño.
//
// Bobinado (REW/FF mantenidos), saltos animados entre pistas y arrastre sobre el cassette mueven
// una posición "virtual" sin tocar el audio; al terminar se busca ese punto una sola vez y se
// retoma lo que sonaba.
//
// El audio pasa por Web Audio (creado en el primer play, que es un gesto del usuario): la
// ganancia controla el volumen (también en iOS, donde audio.volume no funciona) y dos
// analizadores, uno por canal, alimentan los vúmetros. Las pistas son del mismo dominio, así
// que no hace falta CORS.

export type Pista = { id: string; titulo: string; artista: string; duracion: number; src: string };
export type Estado = 'detenido' | 'pausado' | 'reproduciendo' | 'avanzando' | 'rebobinando' | 'arrastrando';
/** Motivos por los que la cinta no puede sonar: deck apagado o tapa abierta. */
export type Bloqueo = 'apagado' | 'puerta';

/** Bobinado mantenido: arranca a esta velocidad (veces la normal)... */
const BOBINADO_INICIAL = 8;
/** ...y acelera hasta esta en ACELERACION_S segundos, como el motor de un deck. */
const BOBINADO_MAXIMO = 40;
const ACELERACION_S = 2;
/** "Anterior" vuelve al inicio de la pista actual si ya sonaron más de estos segundos. */
const UMBRAL_ANTERIOR = 3;

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

type Grafo = { ctx: AudioContext; ganancia: GainNode; izq: AnalyserNode; der: AnalyserNode };
type Animacion = { origen: number; destino: number; inicio: number; duracion: number };

export class Cinta extends EventTarget {
  readonly pistas: Pista[];
  readonly album: string;
  private audio = new Audio();
  private inicios: number[] = [];
  private _indice = 0;
  private _estado: Estado = 'detenido';
  private _cargando = false;
  private _sinSenal = false;
  /** Posición mientras se bobina, salta o arrastra (el audio queda quieto). */
  private virtual: number | null = null;
  /** Salto animado en curso (FF/REW de un toque, ir a una pista). */
  private animacion: Animacion | null = null;
  private inicioBobinado = 0;
  /** Tiempo local a aplicar cuando la pista termine de cargar sus metadatos. */
  private pendiente: number | null = null;
  /** Si sonaba antes de bobinar/arrastrar, se retoma al soltar. */
  private reanudar = false;
  private bloqueos = new Set<Bloqueo>();
  private grafo: Grafo | null = null;
  private _volumen = 0.8;
  private _velocidad = 0;
  private raf = 0;
  private ultimoTick = 0;
  private ultimaPos = 0;
  private ultimaSesion = 0;

  constructor(pistas: Pista[], album = 'LOBBY FM') {
    super();
    this.pistas = pistas.map(p => ({ ...p }));
    this.album = album;
    this.audio.preload = 'none';
    this.recalcular();
    this.conectarAudio();
    this.conectarSesion();
  }

  // ---------- lectura ----------
  get estado() { return this._estado; }
  get indice() { return this._indice; }
  get cargando() { return this._cargando; }
  get sinSenal() { return this._sinSenal; }
  get pista() { return this.pistas[this._indice]; }
  get duracionTotal() { return this.inicios[this.pistas.length] ?? 0; }
  get sonando() { return this._estado === 'reproduciendo'; }
  get bobinando() { return this._estado === 'avanzando' || this._estado === 'rebobinando'; }
  get bloqueado() { return this.bloqueos.size > 0; }
  estaBloqueado(motivo: Bloqueo) { return this.bloqueos.has(motivo); }
  /** Velocidad de la cinta en el último cuadro (segundos de cinta por segundo; 1 = normal). */
  get velocidad() { return this._velocidad; }
  inicioDe(i: number) { return this.inicios[i] ?? 0; }

  /** Segundos desde el inicio de la cinta. */
  get posicion() {
    if (this.virtual !== null) return this.virtual;
    return this.inicioDe(this._indice) + (this.pendiente ?? this.audio.currentTime);
  }
  /** Adónde va la cinta: el destino del salto en curso o la posición actual. */
  get posicionObjetivo() { return this.animacion?.destino ?? this.posicion; }
  /** Segundos desde el inicio de la pista actual. */
  get posicionEnPista() { return this.posicion - this.inicioDe(this.indiceEn(this.posicion)); }
  /** Pista que corresponde a una posición de la cinta. */
  indiceEn(segundos: number) {
    let i = 0;
    while (i < this.pistas.length - 1 && segundos >= this.inicios[i + 1]) i++;
    return i;
  }

  // ---------- audio procesado (volumen y vúmetros) ----------
  get analizadores() { return this.grafo ? { izq: this.grafo.izq, der: this.grafo.der } : null; }
  /** Contexto y salida para los sonidos del deck (clics, bobinado); pasan por el volumen. */
  get salidaEfectos() { return this.grafo ? { ctx: this.grafo.ctx, destino: this.grafo.ganancia } : null; }

  /** Crea el grafo de Web Audio. Debe llamarse desde un gesto del usuario (clic, toque). */
  prepararAudio() {
    if (this.grafo) { if (this.grafo.ctx.state === 'suspended') this.grafo.ctx.resume(); return; }
    const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexto) return;
    try {
      const ctx = new Contexto();
      const fuente = ctx.createMediaElementSource(this.audio);
      const ganancia = ctx.createGain();
      ganancia.gain.value = this._volumen;
      // Los vúmetros miden la señal antes del volumen, como en un deck (nivel de línea)
      const separador = ctx.createChannelSplitter(2);
      const izq = ctx.createAnalyser(), der = ctx.createAnalyser();
      izq.fftSize = der.fftSize = 1024;
      fuente.connect(ganancia).connect(ctx.destination);
      fuente.connect(separador);
      separador.connect(izq, 0);
      separador.connect(der, 1);
      this.grafo = { ctx, ganancia, izq, der };
    } catch { /* sin Web Audio: el audio sigue sonando directo, sin vúmetros */ }
  }

  set volumen(v: number) {
    this._volumen = limitar(v, 0, 1);
    if (this.grafo) this.grafo.ganancia.gain.setTargetAtTime(this._volumen, this.grafo.ctx.currentTime, 0.02);
    else this.audio.volume = this._volumen;
    this.emitir('volumen');
  }
  get volumen() { return this._volumen; }

  // ---------- transporte ----------
  async reproducir() {
    if (this.bloqueado || this.virtual !== null || !this.pistas.length) return;
    this.prepararAudio();
    // Cinta al final: se rebobina (animado) y arranca desde el inicio
    if (this.posicion >= this.duracionTotal - 0.05) { this.reanudar = true; this.saltarA(0, true); return; }
    if (!this.audio.src) this.cargar(this._indice);
    this._sinSenal = false;
    this.cambiarEstado('reproduciendo');
    try {
      await this.audio.play();
    } catch {
      if (!this._sinSenal && this._estado === 'reproduciendo') this.cambiarEstado('pausado');
    }
  }

  pausar() {
    if (this.virtual !== null) return;
    this.audio.pause();
    if (this._estado === 'reproduciendo') this.cambiarEstado('pausado');
  }

  detener() {
    this.terminarMovimiento(false);
    this.audio.pause();
    this.cambiarEstado('detenido');
  }

  alternar() { return this.sonando ? this.pausar() : this.reproducir(); }

  /** Salto animado a la pista siguiente (como el buscador de canciones de un deck). En la última, al final. */
  siguiente() {
    const i = this.indiceEn(this.posicionObjetivo);
    this.saltarA(i < this.pistas.length - 1 ? this.inicioDe(i + 1) : this.duracionTotal);
  }

  /** Vuelve al inicio de la pista; si recién empezó, a la anterior. Animado. */
  anterior() {
    const objetivo = this.posicionObjetivo;
    const i = this.indiceEn(objetivo);
    const enPista = objetivo - this.inicioDe(i);
    this.saltarA(this.inicioDe(enPista > UMBRAL_ANTERIOR ? i : Math.max(0, i - 1)));
  }

  irAPista(i: number) { this.saltarA(this.inicioDe(limitar(i, 0, this.pistas.length - 1))); }

  /**
   * Lleva la cinta a una posición bobinando rápido (animado): los rollos corren hasta el punto
   * y luego retoma lo que sonaba. Si se llama durante otro salto, sigue desde donde va.
   */
  saltarA(destino: number, forzarReanudar = false) {
    if (this.bloqueado) return;
    destino = limitar(destino, 0, this.duracionTotal);
    if (this.virtual === null) {
      this.reanudar = forzarReanudar || this.sonando;
      this.virtual = this.posicion;
      this.audio.pause();
    } else if (forzarReanudar) this.reanudar = true;
    const origen = this.virtual;
    const distancia = Math.abs(destino - origen);
    if (distancia < 0.3) { this.terminarMovimiento(true); return; }
    // Más lejos = más tiempo, pero siempre entre medio segundo y casi dos
    this.animacion = { origen, destino, inicio: performance.now(), duracion: limitar(0.45 + distancia / 220, 0.5, 1.8) * 1000 };
    this.cambiarEstado(destino > origen ? 'avanzando' : 'rebobinando');
    this.arrancarReloj();
  }

  /** Lleva la cinta a una posición al instante, manteniendo si suena o no. */
  buscar(segundos: number) {
    segundos = limitar(segundos, 0, this.duracionTotal);
    const i = this.indiceEn(segundos);
    const local = segundos - this.inicioDe(i);
    if (i !== this._indice || !this.audio.src) this.cargar(i);
    if (this.audio.readyState >= 1) { this.audio.currentTime = local; this.pendiente = null; }
    else this.pendiente = local;
    if (this.sonando) this.audio.play().catch(() => {});
    this.emitir('posicion');
  }

  // ---------- bobinado mantenido (REW / FF) ----------
  iniciarBobinado(direccion: 1 | -1) {
    if (this.bloqueado) return;
    if (this.animacion) this.animacion = null; // un salto en curso se convierte en bobinado
    if (this.virtual === null) this.empezarMovimiento(direccion > 0 ? 'avanzando' : 'rebobinando');
    else this.cambiarEstado(direccion > 0 ? 'avanzando' : 'rebobinando');
    this.inicioBobinado = performance.now();
    this.arrancarReloj();
  }
  terminarBobinado() {
    if (this.bobinando && !this.animacion) this.terminarMovimiento(true);
  }

  // ---------- arrastre sobre el cassette ----------
  empezarArrastre() {
    if (this.bloqueado) return;
    this.animacion = null;
    if (this.virtual === null) this.empezarMovimiento('arrastrando');
    else this.cambiarEstado('arrastrando');
  }
  /** Mueve la cinta: positivo adelanta, negativo rebobina (en segundos). */
  moverArrastre(segundos: number) {
    if (this._estado !== 'arrastrando' || this.virtual === null) return;
    const antes = this.virtual;
    this.virtual = limitar(this.virtual + segundos, 0, this.duracionTotal);
    this._velocidad = (this.virtual - antes) * 60; // aproximado a 60 cuadros por segundo
    this.emitir('posicion');
  }
  soltarArrastre() {
    if (this._estado === 'arrastrando') { this._velocidad = 0; this.terminarMovimiento(true); }
  }

  // ---------- POWER y EJECT ----------
  /** Bloquea la cinta (deck apagado o tapa abierta). Devuelve si estaba sonando, para retomar luego. */
  bloquear(motivo: Bloqueo) {
    const sonaba = this.sonando || (this.virtual !== null && this.reanudar);
    if (this.virtual !== null) { this.reanudar = false; this.terminarMovimiento(true); }
    this.audio.pause();
    this.bloqueos.add(motivo);
    this.cambiarEstado(motivo === 'apagado' ? 'detenido' : (this._estado === 'detenido' ? 'detenido' : 'pausado'));
    this.emitir('estado');
    return sonaba;
  }
  desbloquear(motivo: Bloqueo, reanudar = false) {
    this.bloqueos.delete(motivo);
    this.emitir('estado');
    if (reanudar && !this.bloqueado) this.reproducir();
  }

  // ---------- internos ----------
  private empezarMovimiento(estado: Estado) {
    this.reanudar = this.sonando;
    this.virtual = this.posicion;
    this.audio.pause();
    this.cambiarEstado(estado);
  }

  private terminarMovimiento(aplicar: boolean) {
    if (this.virtual === null) return;
    const destino = this.virtual;
    this.virtual = null;
    this.animacion = null;
    this._velocidad = 0;
    if (aplicar) this.buscar(destino);
    const alFinal = destino >= this.duracionTotal - 0.05;
    if (this.reanudar && !alFinal && !this.bloqueado) { this.cambiarEstado('pausado'); this.reanudar = false; this.reproducir(); }
    else { this.reanudar = false; this.cambiarEstado(alFinal ? 'detenido' : 'pausado'); }
  }

  private recalcular() {
    this.inicios = [0];
    for (const p of this.pistas) this.inicios.push(this.inicios[this.inicios.length - 1] + p.duracion);
  }

  private cargar(i: number) {
    this._indice = i;
    this.pendiente = null;
    this.audio.src = this.pistas[i].src;
    this.actualizarSesion();
    this.emitir('pista');
  }

  private cambiarEstado(estado: Estado) {
    if (this._estado === estado) return;
    this._estado = estado;
    if (estado === 'reproduciendo' || this.bobinando) this.arrancarReloj();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = estado === 'reproduciendo' ? 'playing' : 'paused';
    this.emitir('estado');
  }

  private emitir(tipo: 'estado' | 'pista' | 'posicion' | 'duraciones' | 'volumen') {
    this.dispatchEvent(new Event(tipo));
  }

  /** Reloj de la cinta: avanza saltos y bobinados y avisa la posición en cada cuadro. */
  private arrancarReloj() {
    if (this.raf) return;
    this.ultimoTick = performance.now();
    this.ultimaPos = this.posicion;
    const tick = (ahora: number) => {
      const dt = Math.max(0.001, (ahora - this.ultimoTick) / 1000);
      this.ultimoTick = ahora;

      if (this.animacion && this.virtual !== null) {
        const a = this.animacion;
        const t = limitar((ahora - a.inicio) / a.duracion, 0, 1);
        this.virtual = a.origen + (a.destino - a.origen) * suave(t);
        if (t >= 1) this.terminarMovimiento(true);
      } else if (this.bobinando && this.virtual !== null) {
        const dir = this._estado === 'avanzando' ? 1 : -1;
        const avance = limitar((ahora - this.inicioBobinado) / 1000 / ACELERACION_S, 0, 1);
        const vel = BOBINADO_INICIAL + (BOBINADO_MAXIMO - BOBINADO_INICIAL) * avance;
        this.virtual = limitar(this.virtual + dir * vel * dt, 0, this.duracionTotal);
        // Tope de cinta: el bobinado se detiene solo, como en un deck
        if (this.virtual === 0 || this.virtual === this.duracionTotal) this.terminarMovimiento(true);
      }

      const pos = this.posicion;
      if (this._estado !== 'arrastrando') this._velocidad = (pos - this.ultimaPos) / dt;
      this.ultimaPos = pos;
      this.emitir('posicion');
      if (this.sonando && ahora - this.ultimaSesion > 1000) { this.ultimaSesion = ahora; this.actualizarPosicionSesion(); }
      const sigue = this.sonando || this.bobinando;
      if (!sigue) this._velocidad = 0;
      this.raf = sigue ? requestAnimationFrame(tick) : 0;
    };
    this.raf = requestAnimationFrame(tick);
  }

  private conectarAudio() {
    const a = this.audio;
    a.addEventListener('loadedmetadata', () => {
      // La duración real manda sobre la del JSON
      const real = a.duration;
      if (Number.isFinite(real) && Math.abs(real - this.pista.duracion) > 0.25) {
        this.pista.duracion = real;
        this.recalcular();
        this.emitir('duraciones');
      }
      if (this.pendiente !== null) { a.currentTime = Math.min(this.pendiente, real || this.pendiente); this.pendiente = null; }
      this.actualizarPosicionSesion();
    });
    a.addEventListener('waiting', () => { this._cargando = true; this.emitir('estado'); });
    a.addEventListener('playing', () => { this._cargando = false; this.cambiarEstado('reproduciendo'); this.emitir('estado'); });
    // Pausa desde fuera (teclas multimedia, otra pestaña de audio): se refleja en el estado
    a.addEventListener('pause', () => { if (this._estado === 'reproduciendo' && !a.ended) this.cambiarEstado('pausado'); });
    a.addEventListener('ended', () => {
      if (this._indice < this.pistas.length - 1) {
        // El mixtape sigue solo con la pista siguiente
        this.cargar(this._indice + 1);
        a.play().catch(() => this.cambiarEstado('pausado'));
      } else {
        this.cambiarEstado('detenido');
        this.emitir('posicion');
      }
    });
    a.addEventListener('error', () => {
      if (!a.src) return;
      this._sinSenal = true;
      this._cargando = false;
      this.virtual = null;
      this.animacion = null;
      this.cambiarEstado('detenido');
      this.emitir('estado');
    });
  }

  // ---------- controles del sistema (pantalla de bloqueo, teclas multimedia) ----------
  private conectarSesion() {
    if (!('mediaSession' in navigator)) return;
    const s = navigator.mediaSession;
    const accion = (nombre: MediaSessionAction, fn: MediaSessionActionHandler) => { try { s.setActionHandler(nombre, fn); } catch { /* acción no soportada */ } };
    accion('play', () => this.reproducir());
    accion('pause', () => this.pausar());
    accion('stop', () => this.detener());
    accion('previoustrack', () => this.anterior());
    accion('nexttrack', () => this.siguiente());
    accion('seekbackward', (d) => this.buscar(this.posicion - (d.seekOffset ?? 10)));
    accion('seekforward', (d) => this.buscar(this.posicion + (d.seekOffset ?? 10)));
    accion('seekto', (d) => { if (d.seekTime != null) this.buscar(this.inicioDe(this._indice) + d.seekTime); });
  }

  private actualizarSesion() {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: this.pista.titulo,
      artist: this.pista.artista,
      album: this.album,
      artwork: [{ src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any' }],
    });
  }

  private actualizarPosicionSesion() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const duracion = this.pista.duracion;
    if (!Number.isFinite(duracion) || duracion <= 0) return;
    try {
      navigator.mediaSession.setPositionState({ duration: duracion, position: limitar(this.audio.currentTime, 0, duracion), playbackRate: 1 });
    } catch { /* algunos navegadores rechazan estados transitorios */ }
  }
}

// ---------- instancia única: la usan el Lobby y, más adelante, el indicador del HUD ----------
let instancia: Cinta | null = null;

export function crearCinta(pistas: Pista[], album?: string) {
  instancia ??= new Cinta(pistas, album);
  return instancia;
}
export const obtenerCinta = () => instancia;
