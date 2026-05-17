import { spawnNPC, clearAllNPCs, npcInstances, NPC_CONFIGS } from './npcs.js';
import * as THREE from 'three';

export function initNPCEditor(scene, camera) {
    // Check if on PC (hide on mobile)
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice) return;

    let isEditorActive = false;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let currentConfig = {
        id: 'new_npc',
        behaviorType: 'idle_sway',
        colorTint: 0xffffff,
        spawnX: 0,
        spawnZ: 0
    };

    // Build UI
    const ui = document.createElement('div');
    ui.id = 'npc-editor';
    ui.style.cssText = `
        display: none; position: fixed; top: 12px; right: 12px; z-index: 9999;
        background: rgba(10,8,5,0.9); border: 1px solid rgba(255,215,0,0.5);
        border-radius: 8px; padding: 16px; color: #ffd700;
        font-family: 'Space Grotesk', sans-serif; width: 280px;
    `;
    ui.innerHTML = `
        <h3 style="margin: 0 0 12px 0; font-size: 1.1rem; border-bottom: 1px dashed rgba(255,215,0,0.3); padding-bottom: 8px;">NPC Editor (F4)</h3>
        
        <div style="margin-bottom: 12px;">
            <label style="display:block; font-size:0.8rem; margin-bottom:4px;">ID</label>
            <input type="text" id="ne-id" value="new_npc" style="width:100%; padding:4px; background:rgba(0,0,0,0.5); color:#fff; border:1px solid #555;">
        </div>

        <div style="margin-bottom: 12px;">
            <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Behavior</label>
            <select id="ne-behavior" style="width:100%; padding:4px; background:rgba(0,0,0,0.5); color:#fff; border:1px solid #555;">
                <option value="idle_sway">Idle Sway</option>
                <option value="patrol">Patrol Square</option>
                <option value="follow">Follow Player</option>
                <option value="flee">Flee Player</option>
            </select>
        </div>

        <div style="margin-bottom: 12px;">
            <label style="display:block; font-size:0.8rem; margin-bottom:4px;">Color (Hex)</label>
            <input type="text" id="ne-color" value="ffffff" style="width:100%; padding:4px; background:rgba(0,0,0,0.5); color:#fff; border:1px solid #555;">
        </div>

        <div style="margin-bottom: 12px; font-size:0.8rem; color: #aaa;">
            <i>Left-click ground to place NPC.</i>
        </div>

        <button id="ne-export" style="width:100%; padding:8px; background:rgba(255,215,0,0.2); color:#ffd700; border:1px solid rgba(255,215,0,0.5); cursor:pointer;">Export Config to Console</button>
        <button id="ne-clear" style="width:100%; padding:8px; background:rgba(255,0,0,0.2); color:#ff4444; border:1px solid rgba(255,0,0,0.5); cursor:pointer; margin-top:8px;">Clear All NPCs</button>
    `;
    document.body.appendChild(ui);

    // Toggle Editor
    window.addEventListener('keydown', (e) => {
        if (e.key === 'F4') {
            e.preventDefault();
            isEditorActive = !isEditorActive;
            ui.style.display = isEditorActive ? 'block' : 'none';
            if (isEditorActive) document.exitPointerLock();
        }
    });

    // Handle Clicks to Place
    window.addEventListener('mousedown', (e) => {
        if (!isEditorActive || e.button !== 0) return;
        // Ignore clicks on UI
        if (e.target.closest('#npc-editor')) return;

        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        
        // Find ground intersection
        const islandMeshes = [];
        scene.traverse(c => {
            if (c.isMesh && c.name !== 'water' && !c.parent.isSkinnedMesh) islandMeshes.push(c);
        });

        const intersects = raycaster.intersectObjects(islandMeshes, false);
        if (intersects.length > 0) {
            const pt = intersects[0].point;
            
            // Build config
            const idVal = document.getElementById('ne-id').value;
            const bVal = document.getElementById('ne-behavior').value;
            const cVal = document.getElementById('ne-color').value;

            const newCfg = {
                id: idVal + '_' + Date.now().toString().slice(-4),
                behaviorType: bVal,
                colorTint: new THREE.Color('#' + cVal)
            };

            if (bVal === 'patrol') {
                newCfg.patrolCenter = new THREE.Vector3(pt.x, pt.y, pt.z);
                newCfg.patrolRadius = 4;
                newCfg.patrolSpeed = 0.35;
            } else {
                newCfg.spawnX = pt.x;
                newCfg.spawnZ = pt.z;
            }

            if (bVal === 'follow') newCfg.followDistance = 3;
            if (bVal === 'flee') newCfg.fleeDistance = 8;

            spawnNPC(newCfg);
            console.log(`✨ Spawned ${newCfg.id} at [${pt.x.toFixed(1)}, ${pt.z.toFixed(1)}]`);
        }
    });

    // UI Buttons
    document.getElementById('ne-export').addEventListener('click', () => {
        const exportArr = npcInstances.map(n => {
            const c = n.cfg;
            const out = { id: c.id, behaviorType: c.behaviorType };
            // convert color to hex string
            out.colorTint = '#' + (c.colorTint instanceof THREE.Color ? c.colorTint.getHexString() : new THREE.Color(c.colorTint).getHexString());
            
            if (c.behaviorType === 'patrol') {
                out.patrolCenter = { x: c.patrolCenter.x, y: c.patrolCenter.y, z: c.patrolCenter.z };
                out.patrolRadius = c.patrolRadius;
                out.patrolSpeed = c.patrolSpeed;
            } else {
                out.spawnX = c.spawnX;
                out.spawnZ = c.spawnZ;
            }
            if (c.followDistance) out.followDistance = c.followDistance;
            if (c.fleeDistance) out.fleeDistance = c.fleeDistance;
            if (c.swaySpeed) out.swaySpeed = c.swaySpeed;
            if (c.moveSpeed) out.moveSpeed = c.moveSpeed;
            return out;
        });
        console.log("=== EXPORTED NPC CONFIG ===");
        console.log(JSON.stringify(exportArr, null, 2));
        console.log("===========================");
        alert("Config exported to DevTools console!");
    });

    document.getElementById('ne-clear').addEventListener('click', () => {
        clearAllNPCs();
        console.log("🗑️ All NPCs cleared.");
    });
}
