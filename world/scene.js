import * as THREE from 'three';

export function createScene() {
    const scene = new THREE.Scene();
    
    // Stylized golden hour background (softer peach)
    const skyColor = new THREE.Color(0xffc87a);
    scene.background = skyColor; 
    
    // Atmospheric fog matching the horizon color
    scene.fog = new THREE.FogExp2(skyColor, 0.0015);

    return scene;
}

export function createRenderer() {
    const container = document.getElementById('game-container');
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false }); // Antialias off for post-processing performance if using composer
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25)); // optimize performance
    
    // Enable shadows
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    
    // Tone mapping for better colors
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0; // Restored exposure

    container.appendChild(renderer.domElement);
    return renderer;
}
