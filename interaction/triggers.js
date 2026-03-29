export const triggers = [
    // ── Project Stalls & Cubes ────────────────────────────────────────────────
    // These are auto-snapped to the real 3D mesh center by interactionManager.js
    // Radius is also auto-expanded to (meshHalfSize + 0.9m) at runtime
    {
        id: 'project1',
        meshName: 'Cube003_0',
        position: { x: 0, z: 0 },
        radius: 0.9
    },
    {
        id: 'project2',
        meshName: 'Cube002_0',
        position: { x: 0, z: 0 },
        radius: 0.9
    },
    {
        id: 'project3',
        meshName: 'Cube001_0',
        position: { x: 0, z: 0 },
        radius: 0.9
    },
    {
        id: 'project4',
        meshName: 'stall2002_0',
        position: { x: 0, z: 0 },
        radius: 0.9
    },
    {
        id: 'project5',
        meshName: 'stall2001_0',
        position: { x: 0, z: 0 },
        radius: 0.9
    },
    {
        id: 'project6',
        meshName: 'stall2000_0',
        position: { x: 0, z: 0 },
        radius: 0.9
    },
    // ── Other Zones ───────────────────────────────────────────────────────────
    {
        id: 'lab',
        position: { x: 15, z: -15 },
        radius: 8
    },
    {
        id: 'library',
        position: { x: 0, z: -25 },
        radius: 8
    },
    {
        id: 'contact',
        position: { x: 20, z: 25 },
        radius: 8
    }
];
