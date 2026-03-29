import * as THREE from 'three';

let fishSchool = [];

export function setupFish(scene, waterHeight) {
    const fishCount = 20;
    
    // Low poly Koi aesthetics! 
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: 0xff6600, // Vibrant orange
        roughness: 0.8,
        flatShading: true
    });
    const tailMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, // White tail accent
        roughness: 0.8,
        flatShading: true
    });

    // Reusable geometries
    // Cone: radius, height, radialSegments
    const bodyGeo = new THREE.ConeGeometry(0.15, 0.6, 4);  // Smaller 60cm body
    bodyGeo.rotateX(Math.PI / 2); // Point forward along Z
    
    const tailGeo = new THREE.ConeGeometry(0.1, 0.25, 3); // Smaller tail
    tailGeo.rotateX(Math.PI / 2);
    
    for (let i = 0; i < fishCount; i++) {
        const fishGroup = new THREE.Group();
        
        // Body
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.z = 0.15; // Offset so center of rotation is roughly the middle
        fishGroup.add(body);
        
        // Tail
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.position.z = -0.2;
        fishGroup.add(tail);
        
        // Random placement dynamically adjusting to actual island water levels
        const angle = Math.random() * Math.PI * 2;
        const radius = 35 + Math.random() * 25; // Swim gently between 35m and 60m right next to the beach!
        
        const baseDepth = waterHeight - 0.3 - Math.random() * 0.8;
        
        fishGroup.position.set(
            Math.cos(angle) * radius,
            baseDepth, // Swim comfortably below true surface
            Math.sin(angle) * radius
        );
        
        // Set up AI Data
        fishGroup.userData = {
            baseDepth: baseDepth,
            speed: 1.5 + Math.random() * 1.5,
            wiggleSpeed: 10.0 + Math.random() * 5.0,
            wiggleOffset: Math.random() * Math.PI * 2,
            targetDirection: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
            panicTimer: 0,
            isJumping: false,
            jumpTimer: 0,
            tailMesh: tail,
            bodyMesh: body,
            turnSpeed: 1.5 + Math.random()
        };
        
        scene.add(fishGroup);
        fishSchool.push(fishGroup);
    }
}

export function updateFish(delta, playerPos = null, time = 0) {
    if (fishSchool.length === 0) return;
    
    for (let fish of fishSchool) {
        const data = fish.userData;
        
        // 1. Check for Player (Panic Response)
        let speedMult = 1.0;
        if (playerPos && data.panicTimer <= 0) {
            // Check distance to player flat XZ
            const dist = Math.hypot(fish.position.x - playerPos.x, fish.position.z - playerPos.z);
            if (dist < 10.0) {
                // PANIC! Dart directly away from the player
                data.panicTimer = 3.5; 
                const runDir = new THREE.Vector3(fish.position.x - playerPos.x, 0, fish.position.z - playerPos.z).normalize();
                data.targetDirection.copy(runDir);
            }
        }
        
        // 2. State Management (Panic vs Chill)
        if (data.panicTimer > 0) {
            data.panicTimer -= delta;
            speedMult = 4.0; // Swim extremely fast
            // Frantic tail wiggling
            data.tailMesh.rotation.y = Math.sin(time * data.wiggleSpeed * 3.0 + data.wiggleOffset) * 0.7;
            data.bodyMesh.rotation.y = Math.sin(time * data.wiggleSpeed * 3.0 + data.wiggleOffset + Math.PI) * 0.2;
        } else {
            // Calm swimming. Slowly drift target direction occasionally
            if (Math.random() < 0.01) { 
                const randomTurn = (Math.random() - 0.5) * Math.PI; // Up to 90 deg turn
                data.targetDirection.applyAxisAngle(new THREE.Vector3(0,1,0), randomTurn).normalize();
            }
            // Relaxed tail wiggling
            data.tailMesh.rotation.y = Math.sin(time * data.wiggleSpeed + data.wiggleOffset) * 0.4;
            data.bodyMesh.rotation.y = Math.sin(time * data.wiggleSpeed + data.wiggleOffset + Math.PI) * 0.1;
        }
        
        // 3. Environmental Boundary Checks
        const distFromCenter = Math.hypot(fish.position.x, fish.position.z);
        if (distFromCenter < 28) {
            // Too close to shore dirt! Turn violently outwards!
            const awayDir = new THREE.Vector3(fish.position.x, 0, fish.position.z).normalize();
            data.targetDirection.copy(awayDir);
        } else if (distFromCenter > 75) {
            // Too far out in the deep water! Turn back to the beach!
            const towardsDir = new THREE.Vector3(-fish.position.x, 0, -fish.position.z).normalize();
            data.targetDirection.copy(towardsDir);
        }
        
        // 4. Smooth Rotation
        // Calculate smoothly interpolating rotation to face the target Direction
        const currentForward = new THREE.Vector3(0, 0, 1).applyQuaternion(fish.quaternion);
        
        // Slerp the forward vector
        currentForward.lerp(data.targetDirection, data.turnSpeed * speedMult * delta).normalize();
        
        // Apply the new rotation
        const targetPos = fish.position.clone().add(currentForward);
        fish.lookAt(targetPos);
        
        // 5. Swim forwards
        fish.position.add(currentForward.multiplyScalar(data.speed * speedMult * delta));
        
        // 6. Parabolic Jumping Logic!
        if (!data.isJumping && Math.random() < 0.003) { // 0.3% chance per frame to leap!
            data.isJumping = true;
            data.jumpTimer = 0;
        }

        if (data.isJumping) {
            data.jumpTimer += delta * 1.8; // Speed of the jump (1.8 is a crisp, energetic leap)
            
            if (data.jumpTimer >= Math.PI) {
                // Jump finished, splashed back into the water
                data.isJumping = false;
                data.jumpTimer = 0;
                fish.position.y = data.baseDepth;
            } else {
                // Height: Sine wave from 0 to PI peaks at 1.0
                const jumpHeight = 1.3 + Math.random() * 0.8; // Beautiful small 1.5m hops!
                fish.position.y = data.baseDepth + Math.sin(data.jumpTimer) * jumpHeight;
                
                // Pitch: Cosine perfectly represents the "slope" of a Sine wave. 
                // At t=0 (jumping out), cos is 1 (pointing up). At apex, cos is 0 (level). At splash, cos is -1 (pointing down).
                fish.rotateX(-Math.cos(data.jumpTimer) * 1.0); 
            }
        } else {
            // Slowly bob up and down naturally relative to true sea level while swimming
            fish.position.y = data.baseDepth + Math.sin(time * 2.0 + data.wiggleOffset) * 0.4;
        }
    }
}
