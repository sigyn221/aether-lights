# 🌌 Aether Lights

**Aether Lights** is an interactive starfield built in pure JavaScript to help children learn about constellations through play and exploration.  
It includes **12 well-known constellations**, a creative drawing mode, and a physics-based “gravitational waves” sandbox full of special visual effects.

---

## ✨ Overview

The simulation features three distinct modes:

| Mode | Description |
|------|--------------|
| **Classic** | Watch a rotating 3D sky filled with stars and constellations. Meteor showers and auto-camera movement create a calm, space-like atmosphere. |
| **Creator** | Recreate real constellations or invent new ones by connecting stars. Random inspirational quotes appear at the center of the sky. |
| **Waves** | Experiment with gravity — emit waves, create planets and black holes, and observe how nearby stars react to their influence. |

All modes run directly in the browser, no installation or dependencies required.

---

## 🧭 Controls

| Key / Action | Classic | Creator | Waves |
|---------------|----------|----------|--------|
| **← ↑ → ↓** | Rotate sky | Rotate sky | Move camera |
| **Space** | Toggle auto-camera | Toggle auto-camera | Toggle auto-camera |
| **M** | Spawn single 3D meteor | — | — |
| **R** | Meteor shower | Meteor shower | — |
| **Click stars** | — | Connect stars | — |
| **Enter** | — | Save constellation | — |
| **Esc** | — | Cancel drawing | — |
| **Backspace** | — | Undo last line | — |
| **X** | — | Toggle quotes on/off | — |
| **Click canvas** | — | — | Emit wave |
| **Hold P** | — | — | Create planet |
| **Hold B** | — | — | Create black hole |

---

## 🌠 Features

- **Educational purpose** – helps children learn and recognize 12 major constellations.  
- **Interactive creator** – lets users manually recreate constellations or design new ones.  
- **Inspirational quotes** – fade in/out during Creator mode to add an emotional touch.  
- **3D motion** – fully animated stars projected from a virtual sphere.  
- **Special effects** – meteor trails, glowing connections, and gravitational wave ripples.  
- **Physics sandbox** – in Waves mode, celestial bodies attract or absorb stars dynamically.  
- **Lightweight** – runs entirely in the browser without external libraries.  

---

## 🚀 How to Run

1. Download or clone the repository.  
2. Open **`index.html`** in any modern browser.  
3. Switch between **Classic**, **Creator**, and **Waves** using the buttons at the top.  

Everything runs client-side — no build tools, setup, or internet connection required.

---

## 🧩 Technical Notes

- The app uses one main canvas (`<canvas id="sky">`) for all rendering.  
- A small HUD shows mode-specific controls, automatically updated by JavaScript.  
- Stars and bodies are stored in arrays and redrawn every animation frame.  
- Quotes are randomized and rendered with smooth fade-in/out transitions.  

---

## 🌟 Credits

Created with love for **astronomy, physics, and education**.  
Developed to make learning about constellations fun, interactive, and visually inspiring.  

---

