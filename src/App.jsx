import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Play, Pause, RotateCcw, Sparkles, X, Loader2, Info, MessageSquare, Send, Bot } from 'lucide-react';

/* --- CONFIGURATION --- */
// In this environment, the API key is injected automatically.
const apiKey = import.meta.env.VITE_API_KEY;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800;

const CONFIG = {
  sunSize: 12,
  galacticSpeed: 0.6, // Slightly faster for better helical visualization
  inclination: 60,    // True approx inclination
  trailLength: isMobile ? 180 : 500,
  starRange: 4500,
  asteroidCount: isMobile ? 1000 : 5000,
  starCount: isMobile ? 2500 : 9000,
  enableBloom: !isMobile,
  geometrySegments: isMobile ? 32 : 64,
  textureSize: isMobile ? 256 : 1024, // Higher res for desktop
  antialias: !isMobile
};

/* --- UTILS --- */
// Simple Simplex Noise implementation for procedural textures
class SimplexNoise {
  constructor() {
    this.grad3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
    this.p = [];
    for (let i = 0; i < 256; i++) this.p[i] = Math.floor(Math.random() * 256);
    this.perm = [];
    for (let i = 0; i < 512; i++) this.perm[i] = this.p[i & 255];
  }
  dot(g, x, y) { return g[0] * x + g[1] * y; }
  noise(xin, yin) {
    let n0, n1, n2;
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.perm[ii + this.perm[jj]] % 12;
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 < 0) n0 = 0.0;
    else { t0 *= t0; n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 < 0) n1 = 0.0;
    else { t1 *= t1; n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 < 0) n2 = 0.0;
    else { t2 *= t2; n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2); }
    return 70.0 * (n0 + n1 + n2);
  }
}
const noiseGen = new SimplexNoise();

/* --- ASSET GENERATORS --- */
class TextureFactory {
  static create(type, c1, c2) {
    const size = CONFIG.textureSize;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    // Helper to mix colors
    const hexToRgb = (hex) => {
      const bigint = parseInt(hex.replace('#', ''), 16);
      return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
    };
    const col1 = hexToRgb(c1);
    const col2 = hexToRgb(c2);

    if (type === 'gas') {
      // Gas Giant: Banded noise + turbulence
      const scale = 0.02;
      const turbulence = 0.05;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          // Base bands driven by Y
          let n = noiseGen.noise(x * scale * 0.2, y * scale); // Low freq
          n += 0.5 * noiseGen.noise(x * scale, y * scale * 5.0); // High freq detail

          // Turbulence (distort Y)
          const distY = y + n * 50;
          const band = Math.sin(distY * 0.05); // Sine wave bands

          // Mix factor (0-1)
          const t = (band + 1) / 2;

          const idx = (y * size + x) * 4;
          data[idx] = col1[0] * t + col2[0] * (1 - t);
          data[idx + 1] = col1[1] * t + col2[1] * (1 - t);
          data[idx + 2] = col1[2] * t + col2[2] * (1 - t);
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Soft horizontal streaks
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 20; i++) {
        const y = Math.random() * size;
        const h = Math.random() * size * 0.1;
        ctx.fillRect(0, y, size, h);
      }

    } else if (type === 'rocky') {
      // Rocky Planet: Crater-like noise
      const scale = 0.015;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let n = noiseGen.noise(x * scale, y * scale);
          n += 0.5 * noiseGen.noise(x * scale * 4, y * scale * 4); // Detail

          // Ridge/Crater effect
          const v = Math.abs(n); // Ridges
          const t = Math.min(1, Math.max(0, v));

          const idx = (y * size + x) * 4;
          data[idx] = col1[0] * t + col2[0] * (1 - t);
          data[idx + 1] = col1[1] * t + col2[1] * (1 - t);
          data[idx + 2] = col1[2] * t + col2[2] * (1 - t);
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Craters
      ctx.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 50; i++) {
        const cx = Math.random() * size;
        const cy = Math.random() * size;
        const r = Math.random() * size * 0.05;
        const g = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r);
        g.addColorStop(0, 'rgba(0,0,0,0.4)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }

    } else if (type === 'sun') {
      // Plasma Sun
      const scale = 0.02;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let n = noiseGen.noise(x * scale, y * scale + Date.now() * 0.0001); // Animate? No, static texture for now
          n += 0.5 * noiseGen.noise(x * scale * 4, y * scale * 4);

          const t = (n + 1) / 2;
          const idx = (y * size + x) * 4;
          data[idx] = col1[0] * t + col2[0] * (1 - t);
          data[idx + 1] = col1[1] * t + col2[1] * (1 - t);
          data[idx + 2] = col1[2] * t + col2[2] * (1 - t);
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Glow overlay
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);

    } else if (type === 'glow') {
      // Soft Glow
      ctx.clearRect(0, 0, size, size);
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, c1);
      g.addColorStop(0.4, c2);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);

    } else if (type === 'ring') {
      // Ring Texture
      ctx.clearRect(0, 0, size, size);
      const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.5);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.2, c1);
      g.addColorStop(0.5, c2);
      g.addColorStop(0.8, c1);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);

      // Noise Grain
      for (let i = 0; i < 1000; i++) {
        const r = (Math.random() * 0.2 + 0.3) * size;
        const a = Math.random() * Math.PI * 2;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.arc(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    return new THREE.CanvasTexture(canvas);
  }
}

const StarShader = {
  vertexShader: `
        uniform float time;
        uniform float speed;
        uniform float range;
        attribute float size;
        varying float vAlpha;
        void main() {
            vec3 pos = position;
            // Infinite tunnel logic in Z-axis matching solar system movement
            pos.z = mod(position.z + (time * speed), range * 2.0) - range;
            
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
            
            // Fade out stars at the far edges to prevent popping
            float dist = abs(pos.z);
            vAlpha = 1.0 - smoothstep(range * 0.9, range, dist);
        }
    `,
  fragmentShader: `
        varying float vAlpha;
        void main() {
            // Circular particle
            if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
            gl_FragColor = vec4(1.0, 1.0, 1.0, vAlpha);
        }
    `
};

export default function App() {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [simSpeed, setSimSpeed] = useState(0.5);
  const [selectedBody, setSelectedBody] = useState(null);
  const [aiResponse, setAiResponse] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Chat Bot State
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([
    { role: 'bot', text: "Greetings, traveler. I am Nexus, your onboard astronomical guide. Ask me anything about the cosmos." }
  ]);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const chatEndRef = useRef(null);

  // Refs for Three.js objects
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const solarSystemRef = useRef(null);
  const starsRef = useRef(null);
  const bodiesRef = useRef([]);
  const voyagersRef = useRef([]);
  const asteroidsRef = useRef(null);
  const trailsRef = useRef([]);
  const labelsRef = useRef([]); // DOM labels for voyagers

  useEffect(() => {
    if (showChat && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, showChat]);

  // --- GEMINI API INTEGRATION (Chat & Analysis) ---

  // Generic Gemini Fetcher
  const callGemini = async (prompt) => {
    let attempts = 0;
    const maxAttempts = 3;
    const delays = [1000, 2000, 4000];

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        if (!response.ok) {
          if (response.status === 429) throw new Error("Rate limit exceeded");
          throw new Error(`API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty response");
        return text;
      } catch (err) {
        attempts++;
        if (attempts >= maxAttempts) throw err;
        await new Promise(resolve => setTimeout(resolve, delays[attempts - 1]));
      }
    }
  };

  const fetchGeminiAnalysis = async (name, type) => {
    if (!name) return;
    setIsAiLoading(true);
    setAiResponse("");
    const prompt = `You are a galactic historian. Provide a captivating, scientific summary (approx 60 words) of ${name} (${type}). Highlight its most unique feature (e.g., diamond rain, hexagon storm, subsurface ocean, golden record) and its significance to humanity.`;

    try {
      const text = await callGemini(prompt);
      setAiResponse(text);
    } catch (error) {
      setAiResponse("Uplink Failed: Unable to establish connection with AI core.");
      console.error("Gemini API Error:", error.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setChatInput("");
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatThinking(true);

    const prompt = `You are Nexus, a knowledgeable and slightly poetic AI assistant on a spaceship traveling through the solar system. Answer the following question concisely (max 50 words) and scientifically: "${userMsg}". IMPORTANT: If the question is NOT related to space, astronomy, or physics, politely decline to answer and steer the conversation back to the cosmos.`;

    try {
      const text = await callGemini(prompt);
      setChatHistory(prev => [...prev, { role: 'bot', text: text }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'bot', text: "Communication interference detected. Please try again." }]);
    } finally {
      setIsChatThinking(false);
    }
  };

  // --- INIT ENGINE ---
  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    // RESET REFS (Critical for Strict Mode)
    bodiesRef.current = [];
    voyagersRef.current = [];
    trailsRef.current = [];
    labelsRef.current = [];
    asteroidsRef.current = null;

    // 1. Setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020205, 0.00035);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(250, 120, 350);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: CONFIG.antialias,
      powerPreference: "high-performance",
      precision: isMobile ? "mediump" : "highp"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    if (CONFIG.enableBloom) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
    }

    renderer.shadowMap.enabled = !isMobile;
    if (!isMobile) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 8000;
    controlsRef.current = controls;

    // 2. Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);

    const hemiLight = new THREE.HemisphereLight(0x00d2ff, 0x222222, 0.2); // Cosmic background fill
    scene.add(hemiLight);

    const sunLight = new THREE.PointLight(0xffaa00, 3.5, 6000); // Range increased for voyagers
    if (!isMobile) {
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(2048, 2048);
      sunLight.shadow.bias = -0.0001;
    }
    scene.add(sunLight);

    // 3. Solar System Container (Tilted 60 degrees relative to Z movement)
    const solarSystem = new THREE.Group();
    solarSystem.rotation.x = THREE.MathUtils.degToRad(CONFIG.inclination);
    scene.add(solarSystem);
    solarSystemRef.current = solarSystem;

    // 4. Celestial Bodies

    // Sun
    const sunGeo = new THREE.SphereGeometry(CONFIG.sunSize, CONFIG.geometrySegments, CONFIG.geometrySegments);
    const sunMat = new THREE.MeshBasicMaterial({ map: TextureFactory.create('sun', '#ffaa00', '#ff4400') });
    const sun = new THREE.Mesh(sunGeo, sunMat);

    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TextureFactory.create('glow', 'rgba(255, 85, 0, 1)', 'rgba(255, 85, 0, 0.2)'),
      color: 0xff5500,
      blending: THREE.AdditiveBlending,
      opacity: 0.8,
      transparent: true
    }));
    sunGlow.scale.set(100, 100, 1);
    sun.add(sunGlow);
    solarSystem.add(sun);

    bodiesRef.current.push({
      name: "Sun", type: "Star", mesh: sun,
      data: { desc: "Designated Sol, this G2V main-sequence star fuses four million tons of hydrogen into energy every second. Its defining feature is the precise, stable calibration of its radiative output, which anchored Earth within the Habitable Zone. This stellar constancy catalyzed the biosphere, making the Sun the ultimate generator of human sentient and civilization.", d: "0", s: "N/A" }
    });

    // Planets Configuration
    const planets = [
      {
        name: "Mercury", r: 2, d: 25, s: 0.083, c: ['#a5a5a5', '#5a5a5a'],
        desc: "The smallest planet, shrinking as its iron core cools. It has no atmosphere to retain heat, swinging from 430°C to -180°C."
      },
      {
        name: "Venus", r: 3.2, d: 40, s: 0.032, c: ['#e3bb76', '#d49d42'],
        desc: "Wrapped in thick clouds of sulfuric acid, trapping heat in a runaway greenhouse effect. It spins backwards (retrograde) compared to other planets."
      },
      {
        name: "Earth", r: 3.5, d: 60, s: 0.02, c: ['#287ab8', '#1a3b5c'],
        desc: "The only known world to harbor life. It possesses a powerful magnetic field that shields its atmosphere from the solar wind."
      },
      {
        name: "Mars", r: 2.8, d: 80, s: 0.010, c: ['#e27b58', '#8e3b23'],
        desc: "Home to Olympus Mons, the largest volcano in the solar system. Its red hue comes from iron oxide (rust) covering its surface."
      },
      {
        name: "Jupiter", r: 8, d: 130, s: 0.0016, c: ['#c88b3a', '#9c6f3b'],
        desc: "A gas giant so massive it protects inner planets by deflecting comets. Its Great Red Spot is a storm larger than Earth that has raged for centuries."
      },
      {
        name: "Saturn", r: 7, d: 170, s: 0.0006, c: ['#ead6b8', '#c5a675'], ring: true,
        desc: "Its ring system is made of billions of ice and rock particles. Despite its size, Saturn is the only planet less dense than water."
      },
      {
        name: "Uranus", r: 5, d: 210, s: 0.0002, c: ['#d1f5f8', '#4b70dd'],
        desc: "An ice giant that rolls on its side, likely due to a massive ancient collision. Its blue-green color is caused by methane absorbing red light."
      },
      {
        name: "Neptune", r: 4.8, d: 240, s: 0.0001, c: ['#4b70dd', '#2d4596'],
        desc: "The windiest world, with supersonic winds reaching 2,100 km/h. It was the first planet located through mathematical prediction rather than observation."
      }
    ];

    planets.forEach(p => {
      // Pivot Group (Rotates around Sun)
      const pivot = new THREE.Object3D();
      solarSystem.add(pivot);

      // Planet Mesh
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.r, CONFIG.geometrySegments, CONFIG.geometrySegments),
        new THREE.MeshStandardMaterial({
          map: TextureFactory.create(p.name.match(/Jup|Sat|Ura|Nep/) ? 'gas' : 'rocky', p.c[0], p.c[1]),
          roughness: 0.8,
          metalness: 0.1
        })
      );
      mesh.position.x = p.d;
      if (!isMobile) { mesh.castShadow = true; mesh.receiveShadow = true; }
      pivot.add(mesh);

      // Ring
      if (p.ring) {
        const rGeo = new THREE.RingGeometry(p.r * 1.4, p.r * 2.2, 64);
        const rMat = new THREE.MeshStandardMaterial({ color: 0xc2b280, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(rGeo, rMat);
        ring.rotation.x = Math.PI / 2.2; // Tilt
        mesh.add(ring);
      }

      // Visual Orbit Line (Shown on pause)
      const orbitGeo = new THREE.RingGeometry(p.d - 0.15, p.d + 0.15, 128);
      const orbitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.08, transparent: true, side: THREE.DoubleSide });
      const orbitRing = new THREE.Mesh(orbitGeo, orbitMat);
      orbitRing.rotation.x = Math.PI / 2;
      orbitRing.visible = false;
      solarSystem.add(orbitRing);

      // Trail System
      const trailGeo = new THREE.BufferGeometry();
      const trailMax = CONFIG.trailLength;
      const positions = new Float32Array(trailMax * 3);
      trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      trailGeo.setDrawRange(0, 0); // Start hidden

      const trailMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(p.c[0]),
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending
      });
      const trailMesh = new THREE.Line(trailGeo, trailMat);
      trailMesh.frustumCulled = false; // CRITICAL: Prevents flickering trails
      scene.add(trailMesh);

      trailsRef.current.push({ mesh: trailMesh, points: [], max: trailMax });

      bodiesRef.current.push({
        name: p.name,
        type: "Planet",
        mesh, pivot, orbitRing,
        speed: p.s,
        data: { desc: p.desc, d: p.d + " Units", s: p.s },
        trailIdx: trailsRef.current.length - 1
      });
    });

    // 5. Voyagers (Probes)
    // Using a cone to represent the probe, scaled small but visible
    const probeGeo = new THREE.ConeGeometry(1.5, 4, 8);
    const probeMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa }); // Bright green for visibility

    // Voyager 1 (North Trajectory)
    const v1 = new THREE.Mesh(probeGeo, probeMat);
    const v1Dist = 320;
    const v1Lat = THREE.MathUtils.degToRad(35); // 35 degrees North
    v1.position.set(Math.cos(v1Lat) * v1Dist, Math.sin(v1Lat) * v1Dist, 0);
    v1.rotation.z = -v1Lat - (Math.PI / 2); // Point outward
    solarSystem.add(v1);
    voyagersRef.current.push({
      name: "Voyager 1", type: "Interstellar Probe", mesh: v1,
      data: { desc: "Launched in 1977, it is the furthest human-made object from Earth. It crossed the heliopause in 2012, entering interstellar space. It carries a Golden Record with sounds and images of Earth.", d: "163 AU", s: "17 km/s" }
    });

    // Voyager 2 (South Trajectory)
    const v2 = new THREE.Mesh(probeGeo, probeMat);
    const v2Dist = 340;
    const v2Lat = THREE.MathUtils.degToRad(-48); // 48 degrees South
    v2.position.set(Math.cos(v2Lat) * v2Dist, Math.sin(v2Lat) * v2Dist, 0);
    v2.rotation.z = -v2Lat - (Math.PI / 2);
    solarSystem.add(v2);
    voyagersRef.current.push({
      name: "Voyager 2", type: "Interstellar Probe", mesh: v2,
      data: { desc: "Launched in 1977, it is the only spacecraft to have visited the ice giants Uranus and Neptune. It entered interstellar space in 2018 and continues to beam back data from the darkness.", d: "136 AU", s: "15 km/s" }
    });

    // 6. Asteroid Belt (Instanced)
    const astGeo = new THREE.DodecahedronGeometry(0.35, 0);
    const astMat = new THREE.MeshLambertMaterial({ color: 0x777777 });
    const asteroids = new THREE.InstancedMesh(astGeo, astMat, CONFIG.asteroidCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < CONFIG.asteroidCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 30; // Between Mars (80) and Jupiter (130)
      const spread = (Math.random() - 0.5) * 8;
      dummy.position.set(Math.cos(angle) * dist, spread, Math.sin(angle) * dist);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      dummy.scale.setScalar(Math.random() * 1.5 + 0.5);
      dummy.updateMatrix();
      asteroids.setMatrixAt(i, dummy.matrix);
    }
    solarSystem.add(asteroids);
    asteroidsRef.current = asteroids;

    // 7. Starfield (Vertex Shader for infinite scroll)
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(CONFIG.starCount * 3);
    const starSizes = new Float32Array(CONFIG.starCount);
    for (let i = 0; i < CONFIG.starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * CONFIG.starRange * 2;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * CONFIG.starRange * 2;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * CONFIG.starRange * 2;
      starSizes[i] = Math.random() * 2.0 + 0.5;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        speed: { value: 0 },
        range: { value: CONFIG.starRange }
      },
      vertexShader: StarShader.vertexShader,
      fragmentShader: StarShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    scene.add(stars);
    starsRef.current = stars;

    // 8. Post Processing
    let composer = null;
    if (CONFIG.enableBloom) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
      bloom.threshold = 0.3;
      bloom.strength = 1.2;
      bloom.radius = 0.5;
      composer.addPass(bloom);
    }

    // 9. Create Labels for Voyagers (DOM elements)
    voyagersRef.current.forEach((v, i) => {
      const div = document.createElement('div');
      div.textContent = v.name;
      div.style.position = 'absolute';
      div.style.color = '#00ffaa';
      div.style.fontFamily = 'monospace';
      div.style.fontSize = '10px';
      div.style.padding = '2px 6px';
      div.style.border = '1px solid rgba(0, 255, 170, 0.5)';
      div.style.background = 'rgba(0, 0, 0, 0.7)';
      div.style.borderRadius = '4px';
      div.style.pointerEvents = 'none';
      div.style.display = 'none'; // Hidden initially
      document.body.appendChild(div);
      labelsRef.current.push({ div, mesh: v.mesh });
    });

    // --- LOOP ---
    const clock = new THREE.Clock();
    let animationId;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      // We do not use delta for physics to keep simulation consistent with user speed slider

      const isPaused = window._gamePaused;
      const speed = window._gameSpeed || 0.5;

      if (!isPaused) {
        const moveZ = CONFIG.galacticSpeed * speed;

        // Move System Group
        solarSystem.position.z += moveZ;

        // Move Camera Container
        camera.position.z += moveZ;
        controls.target.z += moveZ;

        // Update Stars Shader
        if (starsRef.current) {
          starsRef.current.material.uniforms.time.value += speed * 0.02;
          starsRef.current.material.uniforms.speed.value = CONFIG.galacticSpeed * 50;
        }

        // Planet Orbits
        bodiesRef.current.forEach(b => {
          if (b.pivot) {
            b.pivot.rotation.y += b.speed * speed;
            b.mesh.rotation.y += 0.005;

            // Trails
            if (b.trailIdx !== undefined) {
              const trail = trailsRef.current[b.trailIdx];
              const worldPos = new THREE.Vector3();
              b.mesh.getWorldPosition(worldPos);

              trail.points.push(worldPos.clone());
              if (trail.points.length > trail.max) trail.points.shift();

              const arr = trail.mesh.geometry.attributes.position.array;
              for (let i = 0; i < trail.points.length; i++) {
                arr[i * 3] = trail.points[i].x;
                arr[i * 3 + 1] = trail.points[i].y;
                arr[i * 3 + 2] = trail.points[i].z;
              }
              trail.mesh.geometry.attributes.position.needsUpdate = true;
              trail.mesh.geometry.setDrawRange(0, trail.points.length);
            }
          }
        });

        if (asteroidsRef.current) asteroidsRef.current.rotation.y += 0.0005 * speed;
      }

      // Update Labels
      labelsRef.current.forEach(lbl => {
        const pos = new THREE.Vector3();
        lbl.mesh.getWorldPosition(pos);
        pos.project(camera);

        const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(pos.y * 0.5) + 0.5) * window.innerHeight;

        // Visibility check (Frustum + simple Z)
        if (pos.z < 1 && x > 0 && x < window.innerWidth && y > 0 && y < window.innerHeight) {
          lbl.div.style.display = 'block';
          lbl.div.style.transform = 'translate(-50%, -150%)';
          lbl.div.style.left = `${x}px`;
          lbl.div.style.top = `${y}px`;
        } else {
          lbl.div.style.display = 'none';
        }
      });

      controls.update();
      if (composer) composer.render();
      else renderer.render(scene, camera);
    };

    animate();
    setLoading(false);

    return () => {
      cancelAnimationFrame(animationId);
      if (mountNode && renderer.domElement && mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      labelsRef.current.forEach(l => {
        if (l.div && l.div.parentNode) {
          document.body.removeChild(l.div);
        }
      });
    };
  }, []);

  // --- EVENTS ---
  useEffect(() => {
    const handleResize = () => {
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    window._gamePaused = paused;
    window._gameSpeed = simSpeed;
    if (bodiesRef.current) {
      bodiesRef.current.forEach(b => {
        if (b.orbitRing) b.orbitRing.visible = paused;
      });
    }
  }, [paused, simSpeed]);

  const handleCanvasClick = (e) => {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, cameraRef.current);

    const targets = [];
    bodiesRef.current.forEach(b => targets.push(b.mesh));
    voyagersRef.current.forEach(v => targets.push(v.mesh));

    const hits = raycaster.intersectObjects(targets);
    if (hits.length > 0) {
      const hitObj = hits[0].object;
      let found = bodiesRef.current.find(b => b.mesh === hitObj);
      if (!found) found = voyagersRef.current.find(v => v.mesh === hitObj);

      if (found) {
        setSelectedBody(found);
        setAiResponse("");
        // Close chat if open to focus on detail
        if (window.innerWidth < 768) setShowChat(false);
      }
    }
  };

  const handleResetCam = () => {
    if (cameraRef.current && solarSystemRef.current && controlsRef.current) {
      const z = solarSystemRef.current.position.z;
      // Reset to a nice chase view
      cameraRef.current.position.set(250, 120, z + 350);
      controlsRef.current.target.set(0, 0, z);
    }
  };

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative font-sans text-white select-none">
      <div ref={mountRef} onClick={handleCanvasClick} className="w-full h-full cursor-crosshair" />

      {/* LOADING */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
          <div className="text-cyan-400 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-xs tracking-[4px] uppercase">System Boot Sequence</span>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="absolute top-6 left-6 pointer-events-none z-10">
        <h1 className="text-3xl font-light tracking-[8px] drop-shadow-[0_0_10px_rgba(0,210,255,0.5)]">
          CELESTIAL <span className="text-cyan-400 font-bold">NEXUS</span>
        </h1>
        <div className="flex items-center gap-3 mt-2 pl-1">
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold shadow-lg transition-colors ${paused ? 'bg-amber-500 text-black' : 'bg-emerald-500 text-black'}`}>
            {paused ? 'PAUSED' : 'LIVE FEED'}
          </span>
          <span className="text-[9px] text-gray-400 font-mono tracking-widest uppercase">
            T-{simSpeed.toFixed(1)}x | 60° INCLINATION
          </span>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-black/60 backdrop-blur-xl px-8 py-4 rounded-full border border-white/10 shadow-2xl z-10 w-[90%] md:w-auto justify-center max-w-xl">
        <button
          onClick={() => setPaused(!paused)}
          className={`flex items-center gap-2 px-5 py-2 rounded-full text-[10px] font-bold tracking-widest transition-all shadow-lg border ${paused ? 'bg-amber-500 border-amber-400 text-black hover:bg-amber-400' : 'bg-white/5 border-white/20 text-white hover:bg-cyan-500 hover:text-black hover:border-cyan-400'}`}
        >
          {paused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
          {paused ? "RESUME" : "FREEZE"}
        </button>

        <div className="flex flex-col items-center w-32">
          <div className="flex justify-between w-full mb-1">
            <span className="text-[8px] text-cyan-200 font-bold tracking-widest">VELOCITY</span>
            <span className="text-[8px] text-cyan-200 font-mono">{simSpeed.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="0" max="3" step="0.1"
            value={simSpeed}
            onChange={(e) => setSimSpeed(parseFloat(e.target.value))}
            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>

        <button
          onClick={handleResetCam}
          className="p-2.5 rounded-full bg-white/5 border border-white/20 hover:bg-white/20 text-gray-300 hover:text-white transition-all"
          title="Recenter Camera"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* SPACE BOT CHAT INTERFACE */}
      <div className="absolute bottom-6 left-6 z-30 flex flex-col items-start gap-4">
        {/* Chat Window */}
        <div
          className={`
            w-80 bg-black/85 backdrop-blur-xl border border-cyan-500/30 rounded-lg shadow-[0_0_30px_rgba(0,210,255,0.15)] 
            flex flex-col transition-all duration-300 ease-in-out origin-bottom-left overflow-hidden
            ${showChat ? 'h-96 opacity-100 translate-y-0' : 'h-0 opacity-0 translate-y-10 pointer-events-none'}
          `}
        >
          {/* Header */}
          <div className="bg-cyan-950/50 p-3 border-b border-cyan-500/20 flex items-center gap-2">
            <Bot size={16} className="text-cyan-400" />
            <span className="text-xs font-bold text-cyan-100 tracking-widest uppercase">Nexus AI Link</span>
            <button onClick={() => setShowChat(false)} className="ml-auto text-cyan-400/50 hover:text-cyan-400">
              <X size={14} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs scrollbar-thin scrollbar-thumb-cyan-900 scrollbar-track-transparent">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`
                     max-w-[85%] p-3 rounded-lg leading-relaxed
                     ${msg.role === 'user'
                      ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-100 rounded-br-none'
                      : 'bg-cyan-950/40 border border-cyan-500/20 text-cyan-50 rounded-bl-none'}
                   `}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isChatThinking && (
              <div className="flex justify-start">
                <div className="bg-cyan-950/40 border border-cyan-500/20 p-3 rounded-lg rounded-bl-none flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleChatSubmit} className="p-3 border-t border-cyan-500/20 bg-black/40 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Query the database..."
              className="flex-1 bg-black/50 border border-cyan-500/20 rounded px-3 py-2 text-xs text-cyan-100 focus:outline-none focus:border-cyan-500/60 placeholder-cyan-800"
            />
            <button
              type="submit"
              disabled={isChatThinking || !chatInput.trim()}
              className="p-2 bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500/30 rounded text-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={14} />
            </button>
          </form>
        </div>

        {/* Floating Toggle Button */}
        <button
          onClick={() => setShowChat(!showChat)}
          className={`
            group relative p-3 rounded-full border shadow-lg transition-all duration-300
            ${showChat
              ? 'bg-cyan-500 border-cyan-400 text-black rotate-90 scale-0 opacity-0'
              : 'bg-black/40 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 scale-100 opacity-100'}
          `}
        >
          <MessageSquare size={20} />
          <span className="absolute left-full top-1/2 -translate-y-1/2 ml-3 w-max px-2 py-1 bg-cyan-950/90 border border-cyan-500/30 rounded text-[9px] text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none tracking-widest uppercase">
            Ask Nexus
          </span>
        </button>
      </div>


      {/* DETAIL PANEL */}
      <div
        className={`absolute top-6 right-6 md:top-10 md:right-10 w-80 max-w-[90vw] bg-black/80 backdrop-blur-xl border-r-0 border-l-2 border-cyan-500/50 p-6 rounded-l-sm shadow-[0_0_50px_rgba(0,0,0,0.8)] transform transition-all duration-500 z-20 ${selectedBody ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0'}`}
      >
        <button
          onClick={() => setSelectedBody(null)}
          className="absolute top-3 right-3 text-gray-600 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        {selectedBody && (
          <>
            <div className="flex items-baseline gap-3 mb-1">
              <h2 className="text-2xl font-light text-white">{selectedBody.name}</h2>
              <span className="text-[9px] text-cyan-400 font-bold tracking-widest border border-cyan-900 px-1.5 py-0.5 rounded">
                {selectedBody.type.toUpperCase()}
              </span>
            </div>
            <div className="h-0.5 w-12 bg-gradient-to-r from-cyan-500 to-transparent mb-5"></div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white/5 p-2 rounded border border-white/5">
                <span className="text-[8px] text-gray-500 block tracking-wider mb-1">DISTANCE</span>
                <span className="font-mono text-xs text-cyan-100">{selectedBody.data.d}</span>
              </div>
              <div className="bg-white/5 p-2 rounded border border-white/5">
                <span className="text-[8px] text-gray-500 block tracking-wider mb-1">VELOCITY</span>
                <span className="font-mono text-xs text-cyan-100">{typeof selectedBody.data.s === 'number' ? selectedBody.data.s.toFixed(3) : selectedBody.data.s}</span>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-gray-400 mb-6 font-light">
              {selectedBody.data.desc}
            </p>

            {/* AI ACTION */}
            <div className="mt-auto">
              {!aiResponse && !isAiLoading && (
                <button
                  onClick={() => fetchGeminiAnalysis(selectedBody.name, selectedBody.type)}
                  className="w-full py-3 rounded-sm bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-500/30 hover:border-indigo-400 text-indigo-200 text-[10px] font-bold tracking-[2px] flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] group"
                >
                  <Sparkles size={12} className="text-indigo-400 group-hover:text-white transition-colors" />
                  <span>INITIATE AI SCAN</span>
                </button>
              )}

              {isAiLoading && (
                <div className="w-full py-4 flex flex-col items-center justify-center text-indigo-300 bg-indigo-900/10 rounded border border-indigo-500/20">
                  <Loader2 size={16} className="animate-spin mb-2 opacity-50" />
                  <span className="text-[9px] tracking-widest animate-pulse">DECRYPTING SIGNALS...</span>
                </div>
              )}

              {aiResponse && (
                <div className="relative mt-2 p-4 bg-indigo-950/30 border border-indigo-500/30 rounded text-xs text-indigo-100 leading-relaxed shadow-inner animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/50 rounded-l"></div>
                  <div className="flex items-center gap-2 mb-2 text-indigo-300 text-[9px] font-bold tracking-widest uppercase opacity-70">
                    <Sparkles size={10} />
                    Analysis Log
                  </div>
                  {aiResponse}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {/* DISCLAIMER UI */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col items-end">
        {/* Modal */}
        {showDisclaimer && (
          <div className="mb-4 w-80 bg-black/90 backdrop-blur-xl border border-white/10 p-5 rounded-lg shadow-2xl animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-sm font-bold text-cyan-400 tracking-widest uppercase">Simulation Data</h3>
              <button onClick={() => setShowDisclaimer(false)} className="text-gray-500 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-gray-300 font-light">
              To ensure visual clarity and performance, this simulation employs scaled planetary sizes, compressed orbital distances, and accelerated time. While the 3D visualization is optimized for exploration, all technical data displayed in the information panel reflects accurate, real-world astronomical values.
            </p>
          </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={() => setShowDisclaimer(!showDisclaimer)}
          className="group relative p-3 rounded-full bg-white/5 border border-white/10 hover:bg-cyan-500/20 hover:border-cyan-400/50 text-gray-400 hover:text-cyan-300 transition-all"
        >
          <Info size={20} />

          {/* Tooltip (Short Version) */}
          {!showDisclaimer && (
            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 w-max max-w-[200px] px-3 py-1.5 bg-black/80 border border-white/10 rounded text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Visuals are scaled for clarity; accurate scientific data is provided in the detail panel.
            </div>
          )}
        </button>
      </div>
    </div>
  );
}