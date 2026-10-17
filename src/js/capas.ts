// Pila de capas que se abren encima del visor (colección, detalle de proyecto, fotos),
// enlazada al historial del navegador. Abrir una capa agrega una entrada; Esc, el botón
// "atrás" del navegador, el gesto de volver del celular y los botones de cerrar retroceden
// una entrada, y se cierra solo la capa de más arriba.
//
// Las capas no cierran su UI directamente: llaman a cerrarCapa() y el cierre real ocurre
// en 'popstate', así el historial y la pantalla nunca se desincronizan.

type Capa = { nombre: string; cerrar: () => void };

const pila: Capa[] = [];

export function abrirCapa(nombre: string, cerrar: () => void) {
  pila.push({ nombre, cerrar });
  history.pushState({ capas: pila.length }, '', location.href);
}

export function cerrarCapa() {
  if (pila.length) history.back();
}

/** Con nombre: si esa capa es la de más arriba. Sin nombre: si hay alguna abierta. */
export function capaAbierta(nombre?: string) {
  return nombre ? pila[pila.length - 1]?.nombre === nombre : pila.length > 0;
}

window.addEventListener('popstate', (e) => {
  const profundidad = typeof e.state?.capas === 'number' ? e.state.capas : 0;
  while (pila.length > profundidad) pila.pop()!.cerrar();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pila.length) {
    e.preventDefault();
    cerrarCapa();
  }
});
