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
            
            console.log(`[Interaction] Setup '${id}' at X: ${center.x.toFixed(1)}, Z: ${center.z.toFixed(1)} on mesh: ${mesh.name}`);
            
            // Find the matching trigger and snap it to the mesh
            const trigger = triggers.find(t => t.id === id);
            if (trigger) {
                // Offset slightly based on mesh size if needed, but exact center usually works for radius
                trigger.position.x = center.x;
                trigger.position.z = center.z;
                trigger.active = true; // Mark as active because it's linked
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

export function updateInteraction(playerPos) {
    const promptEl = document.getElementById('interaction-prompt');
    let foundTrigger = null;

    // Check distance to all triggers
    for (const trigger of triggers) {
        // Skip triggers that haven't been linked to a 3D object yet
        if (!trigger.active) continue;

        // Simple 2D distance check (ignore Y)
        const dx = playerPos.x - trigger.position.x;
        const dz = playerPos.z - trigger.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < trigger.radius * trigger.radius) {
            foundTrigger = trigger;
            break;
        }
    }

    if (foundTrigger !== currentActiveTrigger) {
        currentActiveTrigger = foundTrigger;
        
        if (currentActiveTrigger) {
            let actionText = "Interact";
            if (currentActiveTrigger.id === 'arcade') actionText = "Projects";
            if (currentActiveTrigger.id === 'lab') actionText = "Skills";
            if (currentActiveTrigger.id === 'library') actionText = "Library";
            if (currentActiveTrigger.id === 'contact') actionText = "Contact";
            
            showPrompt(actionText);
        } else {
            hidePrompt();
        }
    }

    // Handle hover animations for all interactables
    for (const key in interactablesDict) {
        const mesh = interactablesDict[key];
        if (!mesh) continue;
        
        // Target scale is 1.1 if active, 1.0 if not
        const targetScale = (currentActiveTrigger && currentActiveTrigger.id === key) ? 1.1 : 1.0;
        
        // Smooth scaling
        mesh.scale.x += (targetScale - mesh.scale.x) * 0.1;
        mesh.scale.y += (targetScale - mesh.scale.y) * 0.1;
        mesh.scale.z += (targetScale - mesh.scale.z) * 0.1;
        
        // Add a pulsing effect if active
        if (targetScale > 1.0) {
            const pulse = 1.1 + Math.sin(performance.now() * 0.005) * 0.02;
            mesh.scale.set(pulse, pulse, pulse);
        }
    }
}
