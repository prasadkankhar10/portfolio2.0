import * as THREE from 'three';

let clouds = [];

export function setupClouds(scene) {
    // Low-poly cloud settings
    const cloudCount = 12;
    // We use a slightly warm white to match the golden hour vibe
    const cloudMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xfffcf2,
        roughness: 1.0, 
        flatShading: true 
    });
    
    // Icosahedron with detail 0 makes standard flat-shaded triangles (low-poly look!)
    const baseGeo = new THREE.IcosahedronGeometry(20, 0); // Much bigger base size
    
    for (let i = 0; i < cloudCount; i++) {
        const cloudGroup = new THREE.Group();
        
        // Add 3 to 6 random interlocking geometric puffs to form each cloud
        const puffs = 3 + Math.floor(Math.random() * 4);
        for (let p = 0; p < puffs; p++) {
            const puff = new THREE.Mesh(baseGeo, cloudMaterial);
            
            // Wider random offset within the cluster to form massive clouds
            puff.position.set(
                (Math.random() - 0.5) * 50,
                (Math.random() - 0.5) * 15,
                (Math.random() - 0.5) * 50
            );
            
            // Random scales to make it look organic
            const scale = 0.8 + Math.random() * 0.5;
            puff.scale.set(scale, scale * 0.6, scale); // Flattened height
            puff.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
            
            // Allow clouds to catch sunset light 
            puff.castShadow = true;
            puff.receiveShadow = true;
            
            cloudGroup.add(puff);
        }
        
        // Position the entire cloud high in the sky randomly within a huge radius
        cloudGroup.position.set(
            (Math.random() - 0.5) * 600,
            120 + Math.random() * 60, // Between 120 and 180 height
            (Math.random() - 0.5) * 600
        );
        
        // Give each cloud a totally unique personality for organic animation
        cloudGroup.userData = {
            bobOffset: Math.random() * Math.PI * 2,
            speedOffset: 0.4 + Math.random() * 1.6, // Huge parallax variation! Some very fast, some very slow.
            rotSpeed: (Math.random() - 0.5) * 0.05, // Spin extremely slowly in the wind
            driftX: -1.0 - Math.random() * 0.3,     // Main wind pushes Westward
            driftZ: (Math.random() - 0.5) * 0.6     // But they slip slightly North/South natively
        };
        
        clouds.push(cloudGroup);
        scene.add(cloudGroup);
    }
}

export function updateClouds(delta) {
    const baseSpeed = 5.0; // Units per second drifting

    for (const cloud of clouds) {
        const u = cloud.userData;
        
        // 1. Organic drifting (unique vectors and parallax speeds)
        const speed = baseSpeed * u.speedOffset;
        cloud.position.x += u.driftX * speed * delta; 
        cloud.position.z += u.driftZ * speed * delta;
        
        // 2. Slow rotation makes the cloud evolve in shape as it moves
        cloud.rotation.y += u.rotSpeed * delta;
        
        // 3. Wrap clouds around smoothly when they leave the visible sky bounds
        if (cloud.position.x < -350 || cloud.position.x > 350 || 
            cloud.position.z < -350 || cloud.position.z > 350) {
            
            cloud.position.x = 300 + Math.random() * 50; // Spawn far East
            cloud.position.z = (Math.random() - 0.5) * 600; // Random North/South
            
            // Randomize height on respawn
            cloud.position.y = 120 + Math.random() * 60;
        }
        
        // 4. Very gentle bobbing up and down over time
        cloud.position.y += Math.sin(performance.now() * 0.001 + u.bobOffset) * 0.02;
    }
}
