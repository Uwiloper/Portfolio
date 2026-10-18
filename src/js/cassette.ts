// Motor del Lobby FM. El mixtape (todas las pistas seguidas en el lado A) se trata como UNA
// cinta con una línea de tiempo continua: "posición" son segundos desde el inicio de la cinta.
// La UI solo dibuja el estado y llama a estos métodos; el motor no sabe nada del diseño.
//
// Bobinado (REW/FF mantenidos) y arrastre sobre el cassette mueven una posición "virtual"
// sin tocar el audio; al soltar se busca ese punto una sola vez y se retoma lo que sonaba.

export type Pista = { id: string; titulo: string; artista: string; duracion: number; src: string };
export type Estado = 'detenido' | 'pausado' | 'reproduciendo' | 'avanzando' | 'rebobinando' | 'arrastrando';

/** Velocidad del bobinado rápido (veces la velocidad normal). */
const VELOCIDAD_BOBINADO = 12;
/** "Anterior" vuelve al inicio de la pista actual si ya sonaron más de estos segundos. */
const UMBRAL_ANTERIOR = 3;

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export class Cinta extends EventTarget {
  readonly pistas: Pista[];
  readonly album: string;
  private audio = new Audio();
  private inicios: number[] = [];
  private _indice = 0;
  private _estado: Estado = 'detenido';
  private _cargando = false;
  private _sinSenal = false;
  /** Posición mientras se bobina o arrastra (el audio queda quieto). */
  private virtual: number | null = null;
  /** Tiempo local a aplicar cuando la pista termine de cargar sus metadatos. */
  private pendiente: number | null = null;
  /** Si sonaba antes de bobinar/arrastrar, se retoma al soltar. */
  private reanudar = false;
  private raf = 0;
  private ultimoTick = 0;
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
  inicioDe(i: number) { return this.inicios[i] ?? 0; }

  /** Segundos desde el inicio de la cinta. */
  get posicion() {
    if (this.virtual !== null) return this.virtual;
    return this.inicioDe(this._indice) + (this.pendiente ?? this.audio.currentTime);
  }
  /** Segundos desde el inicio de la pista actual. */
  get posicionEnPista() { return this.posicion - this.inicioDe(this.indiceEn(this.posicion)); }
  /** Pista que corresponde a una posición de la cinta (útil durante bobinado y arrastre). */
  indiceEn(segundos: number) {
    let i = 0;
    while (i < this.pistas.length - 1 && segundos >= this.inicios[i + 1]) i++;
    return i;
  }

  // ---------- transporte ----------
  async reproducir() {
    if (this.virtual !== null || !this.pistas.length) return;
    if (this.posicion >= this.duracionTotal - 0.05) this.buscar(0); // cinta al final: vuelve al inicio
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

  /** Salto a la pista siguiente (como el buscador de canciones de un deck). En la última, va al final. */
  siguiente() {
    if (this._indice < this.pistas.length - 1) this.irAPista(this._indice + 1);
    else { this.buscar(this.duracionTotal); this.detener(); }
  }

  /** Vuelve al inicio de la pista; si recién empezó, a la anterior. */
  anterior() {
    const destino = this.posicionEnPista > UMBRAL_ANTERIOR ? this._indice : Math.max(0, this._indice - 1);
    this.irAPista(destino);
  }

  irAPista(i: number) {
    this.buscar(this.inicioDe(limitar(i, 0, this.pistas.length - 1)));
  }

  /** Lleva la cinta a una posición (segundos desde el inicio) manteniendo si suena o no. */
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

  // ---------- bobinado rápido (REW / FF mantenidos) ----------
  iniciarBobinado(direccion: 1 | -1) {
    if (this.virtual !== null) return;
    this.empezarMovimiento(direccion > 0 ? 'avanzando' : 'rebobinando');
  }
  terminarBobinado() {
    if (this._estado === 'avanzando' || this._estado === 'rebobinando') this.terminarMovimiento(true);
  }

  // ---------- arrastre sobre el cassette ----------
  empezarArrastre() {
    if (this.virtual !== null) return;
    this.empezarMovimiento('arrastrando');
  }
  /** Mueve la cinta: positivo adelanta, negativo rebobina (en segundos). */
  moverArrastre(segundos: number) {
    if (this._estado !== 'arrastrando' || this.virtual === null) return;
    this.virtual = limitar(this.virtual + segundos, 0, this.duracionTotal);
    this.emitir('posicion');
  }
  soltarArrastre() {
    if (this._estado === 'arrastrando') this.terminarMovimiento(true);
  }

  set volumen(v: number) { this.audio.volume = limitar(v, 0, 1); }
  get volumen() { return this.audio.volume; }

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
    if (aplicar) this.buscar(destino);
    const alFinal = destino >= this.duracionTotal - 0.05;
    if (this.reanudar && !alFinal) { this.cambiarEstado('pausado'); this.reproducir(); }
    else this.cambiarEstado(alFinal ? 'detenido' : 'pausado');
    this.reanudar = false;
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
    if (estado === 'reproduciendo' || estado === 'avanzando' || estado === 'rebobinando') this.arrancarReloj();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = estado === 'reproduciendo' ? 'playing' : 'paused';
    this.emitir('estado');
  }

  private emitir(tipo: 'estado' | 'pista' | 'posicion' | 'duraciones') {
    this.dispatchEvent(new Event(tipo));
  }

  /** Reloj de la cinta: avisa la posición en cada cuadro y avanza el bobinado. */
  private arrancarReloj() {
    if (this.raf) return;
    this.ultimoTick = performance.now();
    const tick = (ahora: number) => {
      const dt = (ahora - this.ultimoTick) / 1000;
      this.ultimoTick = ahora;
      if ((this._estado === 'avanzando' || this._estado === 'rebobinando') && this.virtual !== null) {
        const dir = this._estado === 'avanzando' ? 1 : -1;
        this.virtual = limitar(this.virtual + dir * VELOCIDAD_BOBINADO * dt, 0, this.duracionTotal);
        // Tope de cinta: el bobinado se detiene solo, como en un deck
        if (this.virtual === 0 || this.virtual === this.duracionTotal) this.terminarMovimiento(true);
      }
      this.emitir('posicion');
      if (this.sonando && ahora - this.ultimaSesion > 1000) { this.ultimaSesion = ahora; this.actualizarPosicionSesion(); }
      const sigue = this._estado === 'reproduciendo' || this._estado === 'avanzando' || this._estado === 'rebobinando';
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
