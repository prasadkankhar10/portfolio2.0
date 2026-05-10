# Project Rules & AI Guidelines

This file serves as the definitive source of truth for repository management policies. Any AI assistant or developer working on this project MUST adhere to these rules.

## 1. Zero-Ignore Asset Policy
**Rule:** Absolutely EVERYTHING must be pushed to GitHub. 
- Do NOT add `*.glb`, `*.gltf`, `*.blend`, or `*.fbx` to the `.gitignore`.
- Every single 3D model, texture, audio file, and piece of code must be fully tracked in the repository.
- If a new model or asset is created or compressed, you must ensure it is added to Git and pushed successfully.

### Reasoning
This ensures that anyone (or any AI) who clones this project has 100% of the files needed to build, run, and modify the game instantly, without encountering 404 missing asset errors or having to track down original model files.

## 2. Deployment Pipeline
- The game uses Vite for bundling.
- Never use direct unpkg/CDN imports in `index.html`. Always install via `npm` and let Vite bundle the dependencies.
- Pushing to the `main` branch automatically triggers the `.github/workflows/deploy.yml` action, which builds the Vite project and pushes the `dist/` folder to GitHub Pages.
