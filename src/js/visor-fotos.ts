// Visor de fotos del detalle de proyecto (marcado y estilos en VisorFotos.astro).
// Zoom: clic o doble toque en un punto, rueda, pellizco, botones + − y teclas + − 0 Z.
// Con zoom se arrastra para recorrer la foto; sin zoom, deslizar cambia de foto.
// Es una capa más de la pila (capas.ts): Esc o "atrás" la cierran.
import { abrirCapa, cerrarCapa } from './capas';

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_DOBLE = 2.5;
const UMBRAL_DESLIZAR = 60;

type Opciones = { fotos: string[]; indice?: number; etiqueta?: string; titulo?: string; origen?: HTMLElement | null };

let el: {
  visor: HTMLElement; escenario: HTMLElement; imagen: HTMLImageElement; miniaturas: HTMLElement;
  etiqueta: HTMLElement; actual: HTMLElement; total: HTMLElement; nivel: HTMLOutputElement;
  acercar: HTMLButtonElement; alejar: HTMLButtonElement; anterior: HTMLButtonElement; siguiente: HTMLButtonElement;
} | null = null;

let fotos: string[] = [];
let indice = 0;
let prefijo = 'FOTO';
let origen: HTMLElement | null = null;
let abierto = false;

// Transformación de la foto: escala y desplazamiento (px) respecto al centro del escenario
let escala = 1, x = 0, y = 0;

const dos = (n: number) => String(n).padStart(2, '0');
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function iniciar() {
  if (el) return el;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const visor = $('visor-fotos');
  if (!visor) return null;
  // Fuera de cualquier contenedor con transform/overflow: se monta directo en <body>
  if (visor.parentNode !== document.body) document.body.appendChild(visor);
  el = {
    visor, escenario: $('vf-escenario'), imagen: $<HTMLImageElement>('vf-imagen'), miniaturas: $('vf-miniaturas'),
    etiqueta: $('vf-etiqueta'), actual: $('vf-actual'), total: $('vf-total'), nivel: $<HTMLOutputElement>('vf-nivel'),
    acercar: $<HTMLButtonElement>('vf-acercar'), alejar: $<HTMLButtonElement>('vf-alejar'),
    anterior: $<HTMLButtonElement>('vf-anterior'), siguiente: $<HTMLButtonElement>('vf-siguiente'),
  };
  conectarEventos(el);
  return el;
}

// ---------- transformación ----------
function aplicar() {
  if (!el) return;
  // Límites: la foto ampliada no puede despegarse de los bordes del escenario
  const w = el.imagen.offsetWidth * escala, h = el.imagen.offsetHeight * escala;
  const maxX = Math.max(0, (w - el.escenario.clientWidth) / 2);
  const maxY = Math.max(0, (h - el.escenario.clientHeight) / 2);
  x = limitar(x, -maxX, maxX);
  y = limitar(y, -maxY, maxY);
  el.imagen.style.transform = `translate(${x}px, ${y}px) scale(${escala})`;
  el.escenario.classList.toggle('con-zoom', escala > 1.01);
  el.nivel.value = `${Math.round(escala * 100)}%`;
  el.alejar.disabled = escala <= ZOOM_MIN;
  el.acercar.disabled = escala >= ZOOM_MAX;
}

/** Cambia la escala manteniendo fijo el punto (px, py) del escenario (coordenadas de viewport). */
function zoomEn(nueva: number, px?: number, py?: number) {
  if (!el) return;
  nueva = limitar(nueva, ZOOM_MIN, ZOOM_MAX);
  const r = el.escenario.getBoundingClientRect();
  const cx = (px ?? r.left + r.width / 2) - (r.left + r.width / 2);
  const cy = (py ?? r.top + r.height / 2) - (r.top + r.height / 2);
  x = cx - (cx - x) * (nueva / escala);
  y = cy - (cy - y) * (nueva / escala);
  escala = nueva;
  if (escala === 1) { x = 0; y = 0; }
  aplicar();
}

const reiniciar = () => { escala = 1; x = 0; y = 0; aplicar(); };

// ---------- fotos ----------
function mostrar(nuevo: number, direccion: 1 | -1 | 0 = 0) {
  if (!el || !fotos.length) return;
  indice = (nuevo + fotos.length) % fotos.length;
  escala = 1; x = 0; y = 0;
  el.imagen.style.transform = '';
  el.imagen.src = fotos[indice];
  el.imagen.alt = `${prefijo} ${dos(indice + 1)} de ${dos(fotos.length)}`;
  el.imagen.classList.remove('entra-der', 'entra-izq');
  if (direccion) { void el.imagen.offsetWidth; el.imagen.classList.add(direccion > 0 ? 'entra-der' : 'entra-izq'); }
  el.etiqueta.textContent = `${prefijo} ${dos(indice + 1)}`;
  el.actual.textContent = dos(indice + 1);
  el.miniaturas.querySelectorAll<HTMLElement>('.vf-mini').forEach((b, i) => {
    b.setAttribute('aria-selected', String(i === indice));
    if (i === indice) b.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  aplicar();
  // Precarga las vecinas para que el cambio sea inmediato
  [indice + 1, indice - 1].forEach(i => { new Image().src = fotos[(i + fotos.length) % fotos.length]; });
}

const siguiente = () => fotos.length > 1 && mostrar(indice + 1, 1);
const anterior = () => fotos.length > 1 && mostrar(indice - 1, -1);

export function abrirVisorFotos(opciones: Opciones) {
  const e = iniciar();
  if (!e || !opciones.fotos.length) return;
  fotos = opciones.fotos;
  prefijo = opciones.etiqueta || 'FOTO';
  origen = opciones.origen ?? null;
  e.visor.setAttribute('aria-label', opciones.titulo ? `Fotos de ${opciones.titulo}` : 'Fotos del proyecto');
  e.total.textContent = dos(fotos.length);
  e.anterior.hidden = e.siguiente.hidden = fotos.length < 2;

  e.miniaturas.replaceChildren(...fotos.map((src, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vf-mini';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `${prefijo} ${dos(i + 1)}`);
    const img = document.createElement('img');
    img.src = src; img.alt = ''; img.loading = 'lazy'; img.draggable = false;
    b.append(img);
    b.addEventListener('click', () => mostrar(i, i > indice ? 1 : i < indice ? -1 : 0));
    return b;
  }));
  e.miniaturas.hidden = fotos.length < 2;

  e.visor.hidden = false;
  abierto = true;
  mostrar(opciones.indice ?? 0);
  requestAnimationFrame(() => e.visor.classList.add('is-open'));
  // El foco va al botón de cerrar para quien usa teclado; en táctil solo agregaría un borde sin sentido
  if (matchMedia('(hover: hover)').matches) (document.getElementById('vf-cerrar') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  abrirCapa('fotos', cerrarUI);
}

function cerrarUI() {
  if (!el) return;
  const visor = el.visor;
  abierto = false;
  visor.classList.remove('is-open');
  setTimeout(() => { if (!abierto) { visor.hidden = true; reiniciar(); } }, 300);
  origen?.focus({ preventScroll: true });
}

// ---------- eventos ----------
function conectarEventos(e: NonNullable<typeof el>) {
  document.getElementById('vf-cerrar')?.addEventListener('click', cerrarCapa);
  e.siguiente.addEventListener('click', siguiente);
  e.anterior.addEventListener('click', anterior);
  e.acercar.addEventListener('click', () => zoomEn(escala + 0.5));
  e.alejar.addEventListener('click', () => zoomEn(escala - 0.5));
  window.addEventListener('resize', () => { if (abierto) aplicar(); });

  window.addEventListener('keydown', (ev) => {
    if (!abierto) return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); siguiente(); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); anterior(); }
    else if (ev.key === '+' || ev.key === '=') zoomEn(escala + 0.5);
    else if (ev.key === '-' || ev.key === '_') zoomEn(escala - 0.5);
    else if (ev.key === '0') reiniciar();
    else if (ev.key === 'z' || ev.key === 'Z') escala > 1 ? reiniciar() : zoomEn(ZOOM_DOBLE);
  });

  // Rueda: zoom hacia el puntero
  e.escenario.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    zoomEn(escala * Math.exp(-ev.deltaY * 0.0015), ev.clientX, ev.clientY);
  }, { passive: false });

  // Punteros: arrastrar (con zoom), deslizar (sin zoom), pellizcar (dos dedos), doble toque
  const punteros = new Map<number, { x: number; y: number }>();
  let inicio = { x: 0, y: 0, px: 0, py: 0 };
  let movido = false;
  let pellizco: { dist: number; escala: number } | null = null;
  let ultimoToque = 0;

  const distancia = () => {
    const [a, b] = [...punteros.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const centro = () => {
    const [a, b] = [...punteros.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  e.escenario.addEventListener('pointerdown', (ev) => {
    if ((ev.target as HTMLElement).closest('button')) return;
    e.escenario.setPointerCapture(ev.pointerId);
    punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (punteros.size === 2) {
      pellizco = { dist: distancia(), escala };
    } else {
      inicio = { x: ev.clientX, y: ev.clientY, px: x, py: y };
      movido = false;
    }
    e.escenario.classList.add('arrastrando');
  });

  e.escenario.addEventListener('pointermove', (ev) => {
    if (!punteros.has(ev.pointerId)) return;
    punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pellizco && punteros.size >= 2) {
      const c = centro();
      zoomEn(pellizco.escala * (distancia() / pellizco.dist), c.x, c.y);
      movido = true;
      return;
    }
    const dx = ev.clientX - inicio.x, dy = ev.clientY - inicio.y;
    if (Math.hypot(dx, dy) > 6) movido = true;
    if (escala > 1.01) {
      x = inicio.px + dx; y = inicio.py + dy;
      aplicar();
    } else if (fotos.length > 1) {
      // Vista previa del deslizamiento: la foto sigue al dedo y se resiste un poco
      e.imagen.style.transform = `translate(${dx * 0.6}px, 0)`;
    }
  });

  const soltar = (ev: PointerEvent) => {
    if (!punteros.has(ev.pointerId)) return;
    punteros.delete(ev.pointerId);
    if (punteros.size > 0) { pellizco = null; return; }
    e.escenario.classList.remove('arrastrando');

    const dx = ev.clientX - inicio.x;
    if (pellizco) { pellizco = null; return; }

    if (escala <= 1.01 && movido && fotos.length > 1 && Math.abs(dx) > UMBRAL_DESLIZAR) {
      dx < 0 ? siguiente() : anterior();
      return;
    }
    if (escala <= 1.01) e.imagen.style.transform = '';

    if (!movido && ev.pointerType !== 'mouse') {
      // Doble toque: alterna zoom en ese punto
      const ahora = Date.now();
      if (ahora - ultimoToque < 300) { escala > 1 ? reiniciar() : zoomEn(ZOOM_DOBLE, ev.clientX, ev.clientY); ultimoToque = 0; }
      else ultimoToque = ahora;
    } else if (!movido && ev.pointerType === 'mouse') {
      // Clic sobre la foto: acerca en ese punto (o vuelve al tamaño normal). Clic en el fondo sin zoom: cierra
      const r = e.imagen.getBoundingClientRect();
      const dentro = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (escala > 1.01) reiniciar();
      else if (dentro) zoomEn(ZOOM_DOBLE, ev.clientX, ev.clientY);
      else cerrarCapa();
    }
  };
  e.escenario.addEventListener('pointerup', soltar);
  e.escenario.addEventListener('pointercancel', soltar);
}
