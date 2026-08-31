import React, { useState, useEffect } from 'react';

export default function TvScreen({ 
  projectTitle = "PAGO FIRME", 
  slogan = "Q tus pagos sean firmes", 
  tech = "REACT • FIREBASE • ANDROID API", 
  demoUrl = "#" 
}) {
  const [time, setTime] = useState(0);

  // Simular el contador de tiempo del VHS (00:00:00)
  useEffect(() => {
    const timer = setInterval(() => setTime(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return (
    /* Marco del Televisor de tubo (Plástico negro grueso) */
    <div className="relative w-full max-w-5xl mx-auto aspect-[4/3] bg-neutral-900 rounded-3xl p-4 md:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)_inset] border-[16px] border-neutral-950 flex items-center justify-center overflow-hidden">

      {/* Sombra curva del vidrio del CRT */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.9)_100%)] z-30 pointer-events-none"></div>

      {/* Líneas de Escaneo (Scanlines) en CSS puro con Tailwind */}
      <div className="absolute inset-0 pointer-events-none z-40 opacity-15 bg-[linear-gradient(rgba(255,255,255,0)_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px]"></div>

      {/* Resplandor verde / Interferencia estática sutil */}
      <div className="absolute inset-0 bg-emerald-900/10 mix-blend-color-dodge pointer-events-none z-20"></div>

      {/* PANTALLA ACTIVA */}
      <div className="relative w-full h-full bg-[#0a0a0a] flex flex-col justify-between p-6 md:p-10 font-mono text-emerald-400 z-10 crt-screen">

        {/* HUD Superior (Play y Tiempo) */}
        <div className="flex justify-between items-start text-xl md:text-3xl font-bold drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]">
          <div className="flex flex-col">
            <span className="animate-pulse">PLAY ▶</span>
            <span className="text-sm md:text-lg mt-1 opacity-80">CH 3</span>
          </div>
          <div className="flex flex-col text-right tracking-wider">
            <span>{formatTime(time)}</span>
            <span className="text-sm md:text-lg mt-1 opacity-80">SP</span>
          </div>
        </div>

        {/* Contenido Multimedia del Proyecto */}
        <div className="flex-1 flex flex-col items-center justify-center text-center mt-4 relative z-50">
          
          {/* Contenedor del Video/Imagen (El "Feed" de tu proyecto) */}
          <div className="relative w-full max-w-2xl aspect-video bg-neutral-900 border border-emerald-500/20 flex items-center justify-center mb-6 overflow-hidden group shadow-[0_0_15px_rgba(52,211,153,0.1)]">
             <div className="absolute inset-0 flex items-center justify-center text-emerald-700/40 text-4xl md:text-6xl tracking-widest">
                [ VIDEO FEED ]
             </div>
             
             {/* Capa de interaccion para abrir la demo */}
             <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm">
                <a href={demoUrl} className="px-6 py-2 border-2 border-emerald-400 text-emerald-400 font-bold hover:bg-emerald-400 hover:text-black transition-colors z-50 text-sm md:text-base tracking-widest cursor-pointer">
                  ABRIR DEMO
                </a>
             </div>
          </div>

          <h2 className="text-4xl md:text-6xl font-black tracking-widest drop-shadow-[0_0_12px_rgba(52,211,153,0.9)] uppercase mb-2">
            {projectTitle}
          </h2>
          <p className="text-lg md:text-xl opacity-90 mb-5 italic text-emerald-300">
            "{slogan}"
          </p>
          
          {/* Cinta deslizante de tecnologías */}
          <div className="w-full max-w-lg overflow-hidden border-y border-emerald-500/30 py-2">
             {/* En React nativo, usamos animate-marquee personalizado en Tailwind, aquí lo simulamos con un div para evitar el tag deprecated <marquee> */}
             <div className="whitespace-nowrap text-sm md:text-base opacity-75 tracking-widest text-center">
               &lt;&lt;&lt; {tech} &gt;&gt;&gt;
             </div>
          </div>
        </div>

        {/* HUD Inferior (Tracking) */}
        <div className="flex justify-between items-end text-sm md:text-xl font-bold opacity-80 drop-shadow-md mt-4">
          <span className="tracking-widest">HI-FI STEREO</span>
          <span className="animate-[pulse_3s_ease-in-out_infinite]">AUTO TRACKING</span>
        </div>
      </div>
    </div>
  );
}