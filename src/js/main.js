import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, ScanlineEffect, NoiseEffect, GlitchEffect, GlitchMode } from 'postprocessing';
import { gsap } from 'gsap';

// ==========================================
// 1. CONFIGURACIÓN BASE DE THREE.JS
// ==========================================
const canvas = document.getElementById('webgl-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ 
    canvas: canvas, 
    antialias: true, 
    alpha: true // Permite que el fondo CSS se vea debajo
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Añadimos una figura geométrica de alambre (wireframe) para que el glitch tenga algo físico que distorsionar
const geometry = new THREE.IcosahedronGeometry(2, 1);
const material = new THREE.MeshBasicMaterial({ 
    color: 0x06b6d4, // Cyan retro
    wireframe: true,
    transparent: true,
    opacity: 0.3
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// ==========================================
// 2. EFECTOS ANALÓGICOS (POSTPROCESSING)
// ==========================================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Efecto 1: Scanlines (Líneas horizontales)
const scanlineEffect = new ScanlineEffect({ density: 1.25 });

// Efecto 2: Ruido / Estática
const noiseEffect = new NoiseEffect({ premultiply: true, opacity: 0.15 });

// Efecto 3: Glitch estilo VHS
const glitchEffect = new GlitchEffect({
    delay: [2.0, 4.0],      // Segundos entre cada glitch
    duration: [0.1, 0.3],   // Cuánto dura el glitch
    strength: [0.1, 0.2],   // Fuerza de la distorsión
    mode: GlitchMode.SPORADIC
});

// Agregamos todos los filtros a la cámara
composer.addPass(new EffectPass(camera, scanlineEffect, noiseEffect, glitchEffect));

// ==========================================
// 3. BUCLE DE ANIMACIÓN
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // Rotación suave y continua de la figura
    mesh.rotation.x = elapsedTime * 0.1;
    mesh.rotation.y = elapsedTime * 0.15;

    // Renderizamos la escena CON los efectos aplicados
    composer.render();
}
animate();

// ==========================================
// 4. GSAP: INTERACCIÓN CON EL MOUSE
// ==========================================
// Seleccionamos cualquier elemento con la clase .hover-glitch
const glitchTriggers = document.querySelectorAll('.hover-glitch');

glitchTriggers.forEach(trigger => {
    trigger.addEventListener('mouseenter', () => {
        // Al pasar el mouse, el glitch del fondo se vuelve constante y más fuerte
        gsap.to(glitchEffect, {
            duration: 0.2,
            strength: [0.4, 0.7],
            mode: GlitchMode.CONSTANT
        });
    });

    trigger.addEventListener('mouseleave', () => {
        // Al quitar el mouse, vuelve a la estática suave y esporádica
        gsap.to(glitchEffect, {
            duration: 0.3,
            strength: [0.1, 0.2],
            mode: GlitchMode.SPORADIC
        });
    });
});

// ==========================================
// 5. RESPONSIVIDAD (REDIMENSIONAR PANTALLA)
// ==========================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});