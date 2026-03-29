import * as THREE from 'three';

let companionGroup;
let coreMesh;
let pointLight;

export function setupCompanion(scene) {
    companionGroup = new THREE.Group();
    
    // Core glowing orb (The Fairy!)
    const geo = new THREE.SphereGeometry(0.04, 16, 16); // Half the size
    const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffaa00,
        emissiveIntensity: 1.5, // Very soft bloom
        transparent: true,
        opacity: 0.9,
    });
    coreMesh = new THREE.Mesh(geo, mat);
    companionGroup.add(coreMesh);
    
    // Outer magical additive halo
    const haloGeo = new THREE.SphereGeometry(0.1, 16, 16); // Half the size
    const haloMat = new THREE.MeshBasicMaterial({
        color: 0xff8800,
        transparent: true,
        opacity: 0.15, // Smooth haze, not blinding 
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    companionGroup.add(haloMesh);
    
    // Tiny PointLight that subtly illuminates ONLY the dirt right beneath the fairy
    pointLight = new THREE.PointLight(0xffaa00, 8.0, 4.0, 2.0); // 8 lumens, 4m falloff
    companionGroup.add(pointLight);
    
    // Start way up in the sky so it swoops down dramatically when it first spawns!
    companionGroup.position.set(0, 50, 0); 
    
    scene.add(companionGroup);
}

export function updateCompanion(delta, playerMesh, time, nightStrength = 1.0) {
    if (!companionGroup || !playerMesh) return;
    
    // 0. Dynamically Shift Persona Base Colors
    const dayColor = new THREE.Color(0x00aaff);   // Vivid Magical Cyan/Blue
    const nightColor = new THREE.Color(0xffaa00); // Cozy Warm Orange
    const currentColor = dayColor.clone().lerp(nightColor, nightStrength); // Smooth transition matching the sunset perfectly!

    coreMesh.material.emissive.copy(currentColor);
    companionGroup.children[1].material.color.copy(currentColor); // Update the Additive Halo
    pointLight.color.copy(currentColor);
    
    // Calculate the ideal "Shoulder" target position using safe local Y-rotation
    const playerPos = playerMesh.position;
    const playerYaw = playerMesh.rotation.y;
    
    // Desired local offset: 0.25m Right, 0.9m Up (waist height), 0.2m Behind (very close!)
    const localOffset = new THREE.Vector3(0.25, 0.9, 0.2);
    
    // Apply ONLY the flat visual Y-axis rotation to prevent the fairy from swinging wildly if the GLTF axis was exported strangely
    localOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw);
    
    const targetAnchor = playerPos.clone().add(localOffset);
        
    // 2. Add magical mathematical orbiting around the anchor
    // A single, very slow and incredibly smooth vertical bobbing motion (more elegant than butterfly fluttering)
    const flutterOffset = new THREE.Vector3(
        0,
        Math.sin(time * 2.0) * 0.15, // Soft, gentle breathing up and down
        0
    );
    
    targetAnchor.add(flutterOffset);
    
    // 3. Smooth Lerp (Spring Physics)
    // The magical delay: The fairy interpolates 4.0 units per second towards the target. 
    // This creates a gorgeous organic "lag" when the player runs, smoothly caching up when they stop!
    companionGroup.position.lerp(targetAnchor, delta * 4.0);
    
    // Pulse the light intensity seamlessly and gently
    pointLight.intensity = 8.0 + Math.sin(time * 5.0) * 2.5;
    coreMesh.scale.setScalar(1.0 + Math.sin(time * 5.0) * 0.1);
}
