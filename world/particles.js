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

export function updateParticles(delta, totalTime) {
    if (!particleMesh) return;

    const time = totalTime; // Use clock time passed from main.js — avoids Date.now() system call per frame

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

// ─── Firefly Swarms ───────────────────────────────────────────────────────────
const SWARM_COUNT = 80;
let swarmMesh = null;
const swarmData = [];

// 5 anchor positions near tree/dark areas — adjust XZ after testing!
const SWARM_ANCHORS = [
    { x: -20, y: 3, z: -10 },
    { x:  15, y: 3, z:  20 },
    { x: -10, y: 3, z:  25 },
    { x:  25, y: 3, z: -15 },
    { x:   0, y: 3, z:  15 },
];

export function setupFireflySwarms(scene) {
    const geometry = new THREE.TetrahedronGeometry(0.05, 0);
    const material = new THREE.MeshBasicMaterial({
        color: 0xaaff66, // Warm green-yellow firefly tint
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    swarmMesh = new THREE.InstancedMesh(geometry, material, SWARM_COUNT);
    swarmMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < SWARM_COUNT; i++) {
        const anchor = SWARM_ANCHORS[i % SWARM_ANCHORS.length];
        swarmData.push({
            ax: anchor.x + (Math.random() - 0.5) * 6,
            ay: anchor.y + Math.random() * 3,
            az: anchor.z + (Math.random() - 0.5) * 6,
            px: anchor.x, py: anchor.y, pz: anchor.z,
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
            phaseZ: Math.random() * Math.PI * 2,
            speed: 0.6 + Math.random() * 0.8,
        });
    }

    scene.add(swarmMesh);
}

export function updateFireflySwarms(delta, time) {
    if (!swarmMesh) return;

    for (let i = 0; i < SWARM_COUNT; i++) {
        const d = swarmData[i];
        d.px += Math.sin(time * d.speed + d.phaseX) * 0.015;
        d.py  = d.ay + Math.sin(time * 1.2 + d.phaseY) * 0.6;
        d.pz += Math.cos(time * d.speed + d.phaseZ) * 0.015;

        // Pull back to anchor if drifted > 4m
        const dx = d.ax - d.px;
        const dz = d.az - d.pz;
        d.px += dx * 0.005;
        d.pz += dz * 0.005;

        dummy.position.set(d.px, d.py, d.pz);
        dummy.updateMatrix();
        swarmMesh.setMatrixAt(i, dummy.matrix);
    }
    swarmMesh.instanceMatrix.needsUpdate = true;
}
