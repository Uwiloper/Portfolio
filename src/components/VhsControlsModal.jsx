import React, { useState } from 'react';

export default function VhsControlsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState({
    snow: 0.25,
    scanlines: 0.4,
    vignette: 0.7,
    glitchSpeed: 2,
    wobble: true
  });

  const handleChange = (key, value, cssVar) => {
    const updated = { ...config, [key]: value };
    setConfig(updated);

    if (cssVar) {
      document.documentElement.style.setProperty(
        cssVar, 
        cssVar === '--glitch-speed' ? `${value}s` : value
      );
    }

    if (key === 'snow' || key === 'wobble') {
      if (window.vhsEffect) {
        window.vhsEffect.updateConfig({
          snowOpacity: key === 'snow' ? value : config.snow,
          wobble: key === 'wobble' ? value : config.wobble
        });
      }
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 bg-neutral-900/90 text-emerald-400 font-mono text-xs px-4 py-2 border border-emerald-500/40 shadow-2xl hover:bg-emerald-500 hover:text-black transition-colors cursor-pointer uppercase tracking-widest"
        style={{ fontFamily: "'Press Start 2P', monospace" }}
      >
        [ ⚙ SETUP ]
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-sm bg-neutral-950 border-2 border-emerald-500/50 p-6 font-mono text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
            
            <div className="flex justify-between items-center border-b border-emerald-500/30 pb-3 mb-6">
              <h3 className="text-xs uppercase font-bold">AJUSTES DE EFECTOS</h3>
              <button onClick={() => setIsOpen(false)} className="text-white hover:text-emerald-400">✕</button>
            </div>

            <div className="space-y-5 text-[10px]">
              
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span>ESTÁTICA (RUIDO):</span>
                  <span className="text-white">{Math.round(config.snow * 100)}%</span>
                </div>
                <input type="range" min="0" max="0.6" step="0.05" value={config.snow}
                  onChange={(e) => handleChange('snow', parseFloat(e.target.value))}
                  className="accent-emerald-400 cursor-pointer" />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span>SCANLINES:</span>
                  <span className="text-white">{Math.round(config.scanlines * 100)}%</span>
                </div>
                <input type="range" min="0" max="0.8" step="0.05" value={config.scanlines}
                  onChange={(e) => handleChange('scanlines', parseFloat(e.target.value), '--scanlines-opacity')}
                  className="accent-emerald-400 cursor-pointer" />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span>GLITCH LETRAS:</span>
                  <span className="text-white">{config.glitchSpeed}s</span>
                </div>
                <input type="range" min="0.5" max="4" step="0.5" value={config.glitchSpeed}
                  onChange={(e) => handleChange('glitchSpeed', parseFloat(e.target.value), '--glitch-speed')}
                  className="accent-emerald-400 cursor-pointer" />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span>VIÑETA CRT:</span>
                  <span className="text-white">{Math.round(config.vignette * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.1" value={config.vignette}
                  onChange={(e) => handleChange('vignette', parseFloat(e.target.value), '--vignette-opacity')}
                  className="accent-emerald-400 cursor-pointer" />
              </div>

              <div className="flex justify-between items-center pt-2">
                <span>VIBRACIÓN (WOBBLE):</span>
                <button 
                  onClick={() => handleChange('wobble', !config.wobble)}
                  className={`px-3 py-1 text-[10px] font-bold uppercase border ${
                    config.wobble 
                      ? 'bg-emerald-500 text-black border-emerald-400' 
                      : 'bg-transparent text-emerald-400 border-emerald-500/40'
                  }`}
                >
                  {config.wobble ? 'ON' : 'OFF'}
                </button>
              </div>

            </div>

            <button 
              onClick={() => setIsOpen(false)}
              className="w-full mt-6 py-2 bg-emerald-500 text-black font-bold text-[10px] uppercase hover:bg-emerald-400"
            >
              CERRAR
            </button>

          </div>
        </div>
      )}
    </>
  );
}