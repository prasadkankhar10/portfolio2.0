import * as THREE from 'three';

let birds = [];

// Shared target for the main flock
const flockTarget = new THREE.Vector3();
let flockSpeed = 8.0;

function randomizeFlockTarget() {
    const range = 250;
    flockTarget.set(
        (Math.random() - 0.5) * range * 2,
        60 + Math.random() * 60, // Fly a bit higher
        (Math.random() - 0.5) * range * 2
    );
    flockSpeed = 6 + Math.random() * 5; // Unified speed for the flock
}

export function setupBirds(scene) {
    const birdCount = 25; // Slightly more birds to make a nice flock + solos
    
    // Use an almost-black silhouette color for the birds against the sunset
    const birdMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x111111,
        roughness: 1.0, 
        flatShading: true
    });

    const bodyGeo = new THREE.ConeGeometry(0.3, 1.5, 4);
    bodyGeo.rotateX(Math.PI / 2);

    const wingGeo = new THREE.BoxGeometry(1.6, 0.05, 0.6);
    wingGeo.translate(0.8, 0, 0);

    randomizeFlockTarget();

    // Generate the flock
    for (let i = 0; i < birdCount; i++) {
        const birdGroup = new THREE.Group();
        
        const body = new THREE.Mesh(bodyGeo, birdMaterial);
        body.castShadow = false;
        birdGroup.add(body);
        
        const leftWing = new THREE.Mesh(wingGeo, birdMaterial);
        leftWing.castShadow = false;
        birdGroup.add(leftWing);
        
        const rightWing = new THREE.Mesh(wingGeo, birdMaterial);
        rightWing.rotation.y = Math.PI; 
        rightWing.castShadow = false;
        birdGroup.add(rightWing);

        // Make ~60% of birds fly in a unified flock, 40% fly completely solo
        const isFlock = i < (birdCount * 0.6);

        birdGroup.userData = {
            leftWing: leftWing,
            rightWing: rightWing,
            flapSpeed: 10 + Math.random() * 8, 
            baseSpeed: isFlock ? flockSpeed : (4 + Math.random() * 8), 
            timeOffset: Math.random() * Math.PI * 2, 
            
            isFlock: isFlock,
            // Offset from the flock center so they fly side-by-side but don't clash
            flockOffset: new THREE.Vector3(
                (Math.random() - 0.5) * 35,
                (Math.random() - 0.5) * 15,
                (Math.random() - 0.5) * 35
            ),
            targetPos: new THREE.Vector3(),
            velocity: new THREE.Vector3(1, 0, 0)
        };
        
        // Spawn
        if (isFlock) {
            birdGroup.position.copy(flockTarget).add(birdGroup.userData.flockOffset);
        } else {
            randomizeBirdTarget(birdGroup);
            birdGroup.position.copy(birdGroup.userData.targetPos);
        }
        
        birdGroup.position.x += (Math.random() - 0.5) * 80;
        birdGroup.position.z += (Math.random() - 0.5) * 80;
        
        birds.push(birdGroup);
        scene.add(birdGroup);
    }
}

// Gives a bird a new random coordinate in the sky to fly towards
function randomizeBirdTarget(bird) {
    const range = 250;
    bird.userData.targetPos.set(
        (Math.random() - 0.5) * range * 2,
        30 + Math.random() * 80, // Keep them flying between 30m and 110m high
        (Math.random() - 0.5) * range * 2
    );
}

export function updateBirds(delta) {
    const time = performance.now() * 0.001;

    // Check if the main flock arrived at their destination
    const firstFlockBird = birds.find(b => b.userData.isFlock);
    if (firstFlockBird) {
        if (flockTarget.distanceTo(firstFlockBird.position) < 30) {
            randomizeFlockTarget();
            // Update speeds so they all stay synced together
            for (const b of birds) {
                if (b.userData.isFlock) b.userData.baseSpeed = flockSpeed;
            }
        }
    }

    // Global slow wind for the flock drafting
    const globalWindX = Math.sin(time * 0.5) * 1.5;
    const globalWindY = Math.cos(time * 0.3) * 1.0;

    for (const bird of birds) {
        const u = bird.userData;

        // === 1. FLAPPING ANIMATION ===
        const flapAngle = Math.sin(time * u.flapSpeed + u.timeOffset) * 0.6; 
        u.leftWing.rotation.z = flapAngle;
        u.rightWing.rotation.z = flapAngle;

        // === 2. ORGANIC TENDING/STEERING (Seek Behavior) ===
        // Flock birds use the shared target + their offset. Solos use their private target.
        const targetObj = u.isFlock ? new THREE.Vector3().copy(flockTarget).add(u.flockOffset) : u.targetPos;
        const pos = bird.position;
        const vel = u.velocity;

        // Pick a new target if solo bird arrived
        if (!u.isFlock && targetObj.distanceTo(pos) < 20) {
            randomizeBirdTarget(bird);
        }

        // Add force pushing bird towards target
        const dirToTarget = new THREE.Vector3().subVectors(targetObj, pos).normalize();
        
        // Flock birds steer much tighter to stay grouped, solos wander casually
        const steerForce = u.isFlock ? 3.5 : 1.5; 
        vel.addScaledVector(dirToTarget, steerForce * delta);
        
        // Cap max speed
        if (vel.lengthSq() > u.baseSpeed * u.baseSpeed) {
            vel.normalize().multiplyScalar(u.baseSpeed);
        }

        // Turbulence: Solos are buffeted wildly by wind. Flocks use tight global wind so they draft together.
        const localWobbleX = Math.sin(time * 1.5 + u.timeOffset) * (u.isFlock ? 0.3 : 1.5);
        const localWobbleY = Math.cos(time * 2.1 + u.timeOffset) * (u.isFlock ? 0.2 : 0.8);
        
        // Move bird
        pos.x += (vel.x + localWobbleX + (u.isFlock ? globalWindX : 0)) * delta;
        pos.y += (vel.y + localWobbleY + (u.isFlock ? globalWindY : 0)) * delta;
        pos.z += (vel.z) * delta;

        // === 3. SMOOTH BANKING & ROTATION ===
        const lookTarget = pos.clone().add(vel);
        const currentRot = new THREE.Quaternion().copy(bird.quaternion);
        bird.lookAt(lookTarget);
        const targetRot = new THREE.Quaternion().copy(bird.quaternion);
        
        bird.quaternion.slerpQuaternions(currentRot, targetRot, delta * (u.isFlock ? 4.0 : 3.0));
    }
}
