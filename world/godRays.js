import * as THREE from 'three';

let godRaySprite = null;

// Create a radial gradient canvas texture procedurally (no image files needed)
function createGodRayTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0.0, 'rgba(255, 230, 150, 0.8)');
    gradient.addColorStop(0.3, 'rgba(255, 200, 80, 0.3)');
    gradient.addColorStop(1.0, 'rgba(255, 150, 0, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(canvas);
}

export function setupGodRays(scene) {
    const texture = createGodRayTexture();

    const material = new THREE.SpriteMaterial({
        map: texture,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
    });

    godRaySprite = new THREE.Sprite(material);
    godRaySprite.scale.set(180, 180, 1); // Large halo around the sun
    godRaySprite.position.set(80, 90, -120); // Approximate sun arc position (east horizon)
    scene.add(godRaySprite);
}

export function updateGodRays(time) {
    if (!godRaySprite) return;

    // Use the exact same orbital math as lighting.js so the halo tracks the sun mesh perfectly
    const timeAngle = ((time - 6) / 24) * Math.PI * 2;
    const elevation = Math.sin(timeAngle);
    const azimuth   = Math.cos(timeAngle);
    
    const sunDir = new THREE.Vector3( azimuth * 100,  elevation * 80,  azimuth * 40).normalize();

    // Place the sprite slightly in front of the 350m sun mesh to prevent clipping
    godRaySprite.position.copy(sunDir.clone().multiplyScalar(330));

    // Sun is visible when elevation > -0.1 (accounting for sprite size over horizon)
    const visibility = Math.max(0, Math.min(1, (elevation + 0.1) * 3.0));
    
    // Keep max opacity at a balanced 0.25 so the bloom pass doesn't blow it out into a white square
    godRaySprite.material.opacity = visibility * 0.25;
}
