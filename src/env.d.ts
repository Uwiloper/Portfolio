interface ImportMetaEnv {
  /** Carpeta o URL desde donde se sirven las pistas del Lobby FM (por defecto /audio/). */
  readonly PUBLIC_AUDIO_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
