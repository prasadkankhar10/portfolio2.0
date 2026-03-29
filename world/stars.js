import * as THREE from 'three';

let starPoints = null;
let starSeeds = [];
const STAR_COUNT = 600;

export function setupStars(scene) {
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {
        // Random hemisphere above the island (no stars below horizon)
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.5; // Upper hemisphere only
        const r = 300 + Math.random() * 100;

        positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi) + 20; // Keep above island
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

        sizes[i] = 0.8 + Math.random() * 2.2;
        starSeeds[i] = Math.random() * Math.PI * 2; // Unique flicker seed per star
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.2,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    starPoints = new THREE.Points(geometry, material);
    starPoints.renderOrder = -1; // Draw behind everything
    scene.add(starPoints);
}

export function updateStars(time, nightStrength) {
    if (!starPoints) return;

    // Fade stars in/out smoothly with the night cycle
    starPoints.material.opacity = nightStrength * 0.95;

    // Subtle shimmer: jitter size attribute slightly per frame
    const sizes = starPoints.geometry.attributes.size;
    for (let i = 0; i < STAR_COUNT; i++) {
        const flicker = 1.0 + 0.3 * Math.sin(time * 1.5 + starSeeds[i] * 6.28);
        sizes.array[i] = (0.8 + (starSeeds[i] * 2.2)) * flicker;
    }
    sizes.needsUpdate = true;
}
