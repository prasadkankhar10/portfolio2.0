import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function createCharacter(scene) {
    const playerGroup = new THREE.Group();
    playerGroup.position.set(0, 0, 0);
    scene.add(playerGroup);

    // Initial fallback mesh
    const fallbackMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 1.7, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.8, metalness: 0.2 })
    );
    fallbackMesh.position.set(0, 0.85, 0); // Origin at bottom, center at half-height
    fallbackMesh.castShadow = true;
    playerGroup.add(fallbackMesh);

    // Data object holding refs for movement.js and main.js
    const characterData = {
        mesh: playerGroup,
        mixer: null,
        animations: {}, // Name to Action mapping
        currentAction: null,
        isLoaded: false
    };

    const loader = new GLTFLoader();
    loader.load('./assets/Adventurer (2).glb', (gltf) => {
        fallbackMesh.visible = false;
        const model = gltf.scene;

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Store model reference
        characterData.model = model;

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        
        // Apply hardcoded scale from user
        model.scale.setScalar(0.293);
        
        // Add to group
        playerGroup.add(model);

        console.log(`🧍 Character loaded! Original Height: ${size.y.toFixed(2)}m`);

        // Setup Animations
        if (gltf.animations && gltf.animations.length > 0) {
            console.log(`🏃 Animations found: ${gltf.animations.map(a => a.name).join(', ')}`);
            characterData.mixer = new THREE.AnimationMixer(model);

            gltf.animations.forEach((clip) => {
                const action = characterData.mixer.clipAction(clip);
                action.play();
                action.setEffectiveWeight(0); // Everything starts playing but transparent
                
                // Map names (lowercased for easy finding: 'idle', 'walk', 'run')
                const lowerName = clip.name.toLowerCase();
                characterData.animations[lowerName] = action;
                
                // Fallbacks/Aliases (Only set if exact name hasn't been found yet, and avoid hybrid animations)
                if (lowerName.includes('idle') && !characterData.animations['idle']) characterData.animations['idle'] = action;
                if (lowerName.includes('walk') && !characterData.animations['walk']) characterData.animations['walk'] = action;
                if (lowerName.includes('run')  && !characterData.animations['run'] && !lowerName.includes('shoot')) characterData.animations['run'] = action;
                if (lowerName.includes('jump') && !characterData.animations['jump']) characterData.animations['jump'] = action;

                // Exact Names take ultimate precedence
                if (lowerName === 'idle') characterData.animations['idle'] = action;
                if (lowerName === 'walk') characterData.animations['walk'] = action;
                if (lowerName === 'run')  characterData.animations['run']  = action;
                if (lowerName === 'jump') characterData.animations['jump'] = action;
            });

            // Start Idle animation by default
            const idleAction = characterData.animations['idle'] || characterData.animations[gltf.animations[0].name.toLowerCase()];
            if (idleAction) {
                idleAction.setEffectiveWeight(1);
                characterData.currentAction = idleAction;
            }
        }

        characterData.isLoaded = true;
        
    }, undefined, (error) => {
        console.error('Error loading Adventurer (2).glb:', error);
    });

    return characterData;
}

// Function to smoothly transition between animations
export function fadeToAction(characterData, name, duration = 0.2) {
    if (!characterData.isLoaded || !characterData.mixer) return;
    
    // Check if we have the requested animation
    const newAction = characterData.animations[name];
    if (!newAction || newAction === characterData.currentAction) return;

    const previousAction = characterData.currentAction;

    // Crossfade
    if (previousAction) {
        previousAction.fadeOut(duration);
    }
    
    newAction.reset()
             .setEffectiveTimeScale(1)
             .setEffectiveWeight(1)
             .fadeIn(duration)
             .play();

    characterData.currentAction = newAction;
}
