# Portfolio World

An immersive, interactive 3D RPG-style portfolio built with Three.js, Rapier Physics, and Vite.

## Features
- **Walkable 3D Island:** Explore the portfolio natively in a 3D environment.
- **Physics Engine:** Full character collision and movement powered by Rapier3D.
- **Dynamic Environment:** Day/night cycle, procedural clouds, god rays, and particles.
- **Optimized for Web:** Uses Vite for lightning-fast bundling and Draco compression for 3D models.

## Development Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run Local Server:**
   You can either run the provided batch script `start.bat` or use the npm command:
   ```bash
   npm run dev
   ```

3. **Build for Production:**
   ```bash
   npm run build
   ```

## 🚨 CRITICAL PROJECT RULE: Version Control for Assets

**By explicit instruction:** **ALL files, including every single 3D model (`.glb`, `.blend`), texture, and asset, MUST be tracked in GitHub.** 

We do not use `.gitignore` to block large assets. If you are adding a new 3D model, ensure it is added, committed, and pushed to the repository so that any developer cloning this project has 100% of the files needed to run and modify the game.

Please see `PROJECT_RULES.md` for more details.
