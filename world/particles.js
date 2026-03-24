import * as THREE from 'three';

let particleMesh;
const PARTICLE_COUNT = 250;
const dummy = new THREE.Object3D();

// Store unique velocities and offsets for each particle
const particleData = [];

export function setupParticles(scene) {
    // 1. Geometry & Material
    // Use a very low-poly geometry for performance (tetrahedron or small sphere)
    const geometry = new THREE.TetrahedronGeometry(0.04, 1);
    
    const material = new THREE.MeshBasicMaterial({
        color: 0xffd700, // Warm golden firefly/dust color
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending, // Makes them glow when overlapping
        depthWrite: false
    });

    particleMesh = new THREE.InstancedMesh(geometry, material, PARTICLE_COUNT);
    particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // InstancedMesh for massive performance

    // 2. Initialise positions and velocities organically around the island
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Scatter particles in a 60x30x60 volume
        const x = (Math.random() - 0.5) * 60;
        const y = 5 + Math.random() * 25; // from 5m to 30m high
        const z = (Math.random() - 0.5) * 60;

        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        particleMesh.setMatrixAt(i, dummy.matrix);

        particleData.push({
            x: x,
            y: y,
            z: z,
            // Random speeds
            speedX: (Math.random() - 0.5) * 0.5,
            speedY: (Math.random() - 0.5) * 0.2, // Drift mostly horizontally
            speedZ: (Math.random() - 0.5) * 0.5,
            // Unique sine wave offsets so they bob uniquely
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
            phaseZ: Math.random() * Math.PI * 2
        });
    }

    scene.add(particleMesh);
    console.log(`✅ Emitted ${PARTICLE_COUNT} ambient particles`);
}

export function updateParticles(delta) {
    if (!particleMesh) return;

    const time = Date.now() * 0.001; // Global time for organic sine waves

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const data = particleData[i];

        // Organic Drift (Combine constant velocity with a sine wave bob)
        data.x += data.speedX * delta + Math.sin(time + data.phaseX) * 0.01;
        data.y += data.speedY * delta + Math.cos(time + data.phaseY) * 0.005;
        data.z += data.speedZ * delta + Math.sin(time + data.phaseZ) * 0.01;

        // Wrap particles around if they drift too far out of bounds
        // Creates a seamless endless loop of fireflies
        if (data.x > 30) data.x = -30;
        if (data.x < -30) data.x = 30;
        if (data.z > 30) data.z = -30;
        if (data.z < -30) data.z = 30;
        
        // Let them rise up and eventually loop back to the ground
        if (data.y > 30) data.y = 5;
        if (data.y < 5) data.y = 30;

        dummy.position.set(data.x, data.y, data.z);
        dummy.updateMatrix();
        particleMesh.setMatrixAt(i, dummy.matrix);
    }

    particleMesh.instanceMatrix.needsUpdate = true;
}
