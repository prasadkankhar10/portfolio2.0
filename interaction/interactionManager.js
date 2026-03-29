import { triggers } from './triggers.js';
import { openModal, showPrompt, hidePrompt } from '../ui/uiController.js';
import * as THREE from 'three';

let currentActiveTrigger = null;
let interactKeyPressed = false;
let interactablesDict = {};

export function setupInteraction(interactables) {
    interactablesDict = interactables || {};
    
    // Auto-update trigger positions to match their 3D models exactly
    for (const id in interactablesDict) {
        const mesh = interactablesDict[id];
        if (mesh) {
            // Get accurate world center using Bounding Box (fixes bad origin points from 3D software)
            const box = new THREE.Box3().setFromObject(mesh);
            const center = new THREE.Vector3();
            box.getCenter(center);
            
            // Store base Y position for sine wave animation
            mesh.userData.baseY = mesh.position.y;
            
            // Generate AAA Inverted-Hull Spatial Outline!
            // We clone the geometry, flip it inside out, make it gold, and scale it up slightly.
            const outlineMaterial = new THREE.MeshBasicMaterial({
                color: 0xffd700, // Magical Gold Outline
                side: THREE.BackSide,
                transparent: true,
                opacity: 0.0, // Invisible by default
                depthWrite: false
            });
            const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMaterial);
            // Apply original scale/rotation locally
            outlineMesh.position.copy(mesh.position);
            outlineMesh.rotation.copy(mesh.rotation);
            outlineMesh.scale.copy(mesh.scale).multiplyScalar(1.05); // 5% larger to form the outline!
            
            mesh.parent.add(outlineMesh);
            mesh.userData.outlineMesh = outlineMesh;
            
            // Find the matching trigger and intelligently snap it to the mesh
            const trigger = triggers.find(t => t.id === id);
            if (trigger) {
                // Restore automatic coordinates (otherwise the trigger spawns at default 0,0)
                trigger.position.x = center.x;
                trigger.position.z = center.z;
                
                // Intelligently calculate radius based on actual object size so the player can always reach it
                const size = new THREE.Vector3();
                box.getSize(size);
                
                // 0.9m beyond the physical edge of the table!
                trigger.radius = Math.max(trigger.radius, (Math.max(size.x, size.z) / 2) + 0.5);
                
                trigger.active = true;
            }
        }
    }
    
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'e' && !interactKeyPressed) {
            interactKeyPressed = true;
            if (currentActiveTrigger) {
                // Unlock pointer to allow interacting with the UI
                document.exitPointerLock();
                openModal(currentActiveTrigger.id);
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key.toLowerCase() === 'e') {
            interactKeyPressed = false;
        }
    });
}

export function getCinematicTarget() {
    if (currentActiveTrigger && interactablesDict[currentActiveTrigger.id]) {
        const mesh = interactablesDict[currentActiveTrigger.id];
        
        // Calculate where the camera SHOULD be!
        const box = new THREE.Box3().setFromObject(mesh);
        const center = new THREE.Vector3();
        box.getCenter(center);
        
        // The cinematic target goes 3 meters in front of the object and slightly up
        const cinematicPos = center.clone().add(new THREE.Vector3(0, 1.0, 3.0));
        
        return {
            lookAt: center,
            position: cinematicPos
        };
    }
    return null;
}

export function updateInteraction(playerPos, camera) {
    const promptEl = document.getElementById('interaction-prompt');
    let foundTrigger = null;
    let closestDistSq = Infinity;

    // CLOSEST-WINS: scan ALL triggers and pick the physically nearest one
    for (const trigger of triggers) {
        if (!trigger.active) continue;

        const dx = playerPos.x - trigger.position.x;
        const dz = playerPos.z - trigger.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < trigger.radius * trigger.radius && distSq < closestDistSq) {
            closestDistSq = distSq;
            foundTrigger = trigger;
        }
    }

    if (foundTrigger !== currentActiveTrigger) {
        currentActiveTrigger = foundTrigger;
        
        if (currentActiveTrigger) {
            let actionText = "Interact";
            if (window.portfolioData && window.portfolioData.spatialPrompts) {
                actionText = window.portfolioData.spatialPrompts[currentActiveTrigger.id] || "Interact";
            }
            
            showPrompt(actionText);
        } else {
            hidePrompt();
        }
    }

    // 2. Float the 3D Text Prompt directly above the targeted object EVERY FRAME!
    if (currentActiveTrigger) {
        const interactMesh = interactablesDict[currentActiveTrigger.id];
        if (interactMesh && camera) {
            const box = new THREE.Box3().setFromObject(interactMesh);
            const center = new THREE.Vector3();
            box.getCenter(center);
            
            // Position anchor almost flush with the highest point of the object
            center.y = box.max.y + 0.2;
            
            // Project 3D coordinate to 2D Screen Space
            center.project(camera);
            
            // Convert normalized device coordinates to CSS pixels
            const x = (center.x * 0.5 + 0.5) * window.innerWidth;
            const y = -(center.y * 0.5 - 0.5) * window.innerHeight;
            
            // Override static CSS with dynamic spatial positioning on the absolute ROOT layer!
            const promptLayer = document.getElementById('prompt-layer');
            if (promptLayer) {
                // Hide if mathematically behind the camera!
                if (center.z > 1.0) {
                    promptLayer.style.display = 'none';
                } else {
                    promptLayer.style.display = ''; // Restore standard flow
                    promptLayer.style.left = `${x}px`;
                    promptLayer.style.top = `${y}px`;
                    promptLayer.style.bottom = 'auto';
                    promptLayer.style.transform = 'translate(-50%, -100%)';
                }
            }
        }
    }

    // Handle hover animations for all interactables
    for (const key in interactablesDict) {
        const mesh = interactablesDict[key];
        if (!mesh) continue;
        
        // Transition logic
        const isActive = (currentActiveTrigger && currentActiveTrigger.id === key);
        
        // Sine Wave Breathing Animation
        let targetScale = 1.0;
        if (isActive) {
            // Math.sin oscillates -1 to 1. Normalize it to 0 to 1, then scale up to 15% larger
            const breath = (Math.sin(performance.now() * 0.004) + 1.0) / 2.0;
            targetScale = 1.0 + (breath * 0.15); // Pulsates endlessly between 1.0x and 1.15x
        }
        
        const targetOpacity = isActive ? 0.7 : 0.0;
        
        // Smooth scaling mesh
        mesh.scale.x += (targetScale - mesh.scale.x) * 0.2;
        mesh.scale.y += (targetScale - mesh.scale.y) * 0.2;
        mesh.scale.z += (targetScale - mesh.scale.z) * 0.2;
        
        // Return to ground if it was previously hovering
        if (mesh.userData.baseY !== undefined) {
            mesh.position.y += (mesh.userData.baseY - mesh.position.y) * 0.2;
        }
        
        // Smooth fade outline HUD glow
        if (mesh.userData.outlineMesh) {
            const currentOpacity = mesh.userData.outlineMesh.material.opacity;
            mesh.userData.outlineMesh.material.opacity += (targetOpacity - currentOpacity) * 0.1;
            
            // Sync outline position & scale
            mesh.userData.outlineMesh.position.copy(mesh.position);
            mesh.userData.outlineMesh.scale.copy(mesh.scale).multiplyScalar(1.05);
        }
    }
}
