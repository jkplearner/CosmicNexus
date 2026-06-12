import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Play, Pause, RotateCcw, Sparkles, X, Loader2, Info, MessageSquare, Send, Bot, MapPin, Rocket, Trophy } from 'lucide-react';

import { CONFIG, isMobile } from './config';
import LensingShader from './shaders/LensingShader';
import TextureFactory from './utils/TextureFactory';
import GargantuaBlackHole from './classes/BlackHole';
import Galaxy from './classes/Galaxy';

const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;

export default function App() {
  const mountRef = useRef(null);
  const frameIdRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [selectedBody, setSelectedBody] = useState(null);
  const [aiResponse, setAiResponse] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Refs for scene logic
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const galaxyRef = useRef(null);
  const sagARef = useRef(null);
  const solarSystemContainerRef = useRef(null);
  const bodiesRef = useRef([]);
  const voyagersRef = useRef([]);
  const asteroidsRef = useRef(null);
  const trailsRef = useRef([]);
  const labelsRef = useRef([]);

  // Animation Refs
  const clockRef = useRef(new THREE.Clock());
  const pausedRef = useRef(paused);

  // --- SHIP MODE STATE ---
  const [shipMode, setShipMode] = useState(false);
  const [activePopups, setActivePopups] = useState([]);
  const [shipSpeed, setShipSpeed] = useState(0);
  const shipRef = useRef(null);
  const shipExhaustRef = useRef(null);
  const shipVelocityRef = useRef(new THREE.Vector3());
  const shipModeRef = useRef(false);
  const keysRef = useRef(new Set());
  const achievementsRef = useRef(new Set());
  const joystickRef = useRef({ x: 0, y: 0, active: false });

  // --- TESSERACT STATE ---
  const [inTesseract, setInTesseract] = useState(false);
  const inTesseractRef = useRef(false);
  const tesseractRef = useRef(null);

  // --- ANDROMEDA STATE ---
  const andromedaGalaxyRef = useRef(null);
  const andromedaBHRef = useRef(null);
  const andromedaTesseractRef = useRef(null);
  const inAndromedaRef = useRef(false);
  const inAndromedaTesseractRef = useRef(false);
  const [inAndromedaTesseract, setInAndromedaTesseract] = useState(false);

  // Chat Bot State
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([
    { role: 'bot', text: "Greetings, traveler. I am Nexus, your onboard astronomical guide. We are currently holding position in the Orion Spur, 26,000 light-years from the Galactic Center." }
  ]);
  const [isChatThinking, setIsChatThinking] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (showChat && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, showChat]);

  // --- GROQ API INTEGRATION ---
  const callGroq = async (prompt) => {
    let attempts = 0;
    const maxAttempts = 3;
    const delays = [1000, 2000, 4000];

    while (attempts < maxAttempts) {
      try {
        if (!groqApiKey) throw new Error("Missing VITE_GROQ_API_KEY");

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqApiKey}`
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.4
          })
        });

        if (!response.ok) {
          if (response.status === 429) throw new Error("Rate limit exceeded");
          throw new Error(`API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error("Empty response");
        return text;
      } catch (err) {
        attempts++;
        if (attempts >= maxAttempts) throw err;
        await new Promise(resolve => setTimeout(resolve, delays[attempts - 1]));
      }
    }
  };

  const fetchAiAnalysis = async (name, type) => {
    if (!name) return;
    setIsAiLoading(true);
    setAiResponse("");
    const prompt = `You are a galactic historian. Provide a captivating, scientific summary (approx 60 words) of ${name} (${type}). Highlight its most unique feature (e.g., diamond rain, hexagon storm, subsurface ocean, golden record) and its significance to humanity.`;

    try {
      const text = await callGroq(prompt);
      setAiResponse(text);
    } catch (error) {
      setAiResponse("Uplink Failed: Unable to establish connection with AI core.");
      console.error("Groq API Error:", error.message);
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

    const prompt = `You are Nexus, a knowledgeable and slightly poetic AI assistant on a spaceship traveling through the Milky Way. Answer the following question concisely (max 50 words) and scientifically: "${userMsg}". Context: We are in the Orion Spur, looking towards Sagittarius A*.`;

    try {
      const text = await callGroq(prompt);
      setChatHistory(prev => [...prev, { role: 'bot', text: text }]);
    } catch (_error) {
      setChatHistory(prev => [...prev, { role: 'bot', text: "Communication interference detected. Please try again." }]);
    } finally {
      setIsChatThinking(false);
    }
  };

  // --- INIT ENGINE ---
  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    // RESET REFS
    bodiesRef.current = [];
    voyagersRef.current = [];
    trailsRef.current = [];
    labelsRef.current = [];
    asteroidsRef.current = null;

    // 1. Setup
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.000002);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 4000000); // Massive far clip for galaxy

    // 2. Galaxy & Black Hole Setup (The Grand Stage)
    galaxyRef.current = new Galaxy(scene, {
      position: new THREE.Vector3(0, 0, 0),
      radius: CONFIG.galaxyScale,
      arms: 5,
      winding: 2.5
    });

    sagARef.current = new GargantuaBlackHole(scene, new THREE.Vector3(0, 0, 0), 400);

    // 3. Solar System Container (The Local Stage)
    // We create a container that sits at the Orion Spur distance
    const solarSystemContainer = new THREE.Group();
    // Position: 26,000 light years (scaled units) away from center
    solarSystemContainer.position.set(0, 0, CONFIG.solarSystemDistance);

    // MECHANICS: Galactic Inclination
    // The solar system's ecliptic is tipped ~60 degrees relative to the galactic plane.
    solarSystemContainer.rotation.set(
      THREE.MathUtils.degToRad(60),   // correct tilt
      THREE.MathUtils.degToRad(15),   // yaw toward camera
      THREE.MathUtils.degToRad(10)    // final perfect Z alignment
    );


    scene.add(solarSystemContainer);
    solarSystemContainerRef.current = solarSystemContainer;

    // Camera Start Position (Near Solar System, looking at it)
    camera.position.set(0, 300, CONFIG.solarSystemDistance + 600);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: CONFIG.antialias,
      logarithmicDepthBuffer: true, // CRITICAL for mixed scales
      powerPreference: "high-performance"
    });
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountNode.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 200000;
    controls.target.copy(solarSystemContainer.position);
    controlsRef.current = controls;

    // 4. Lighting (Local & Galactic)
    const galacticAmbient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(galacticAmbient);

    const sunLight = new THREE.PointLight(0xffaa00, 5.0, 6000);
    solarSystemContainer.add(sunLight); // Light moves with the system

    // 5. Celestial Bodies (Added to Solar System Container)

    // Sun
    const sunGeo = new THREE.SphereGeometry(CONFIG.sunSize, CONFIG.geometrySegments, CONFIG.geometrySegments);
    const sunMat = new THREE.MeshBasicMaterial({ map: TextureFactory.create('sun', '#ffaa00', '#ff4400') });
    const sun = new THREE.Mesh(sunGeo, sunMat);

    const sunGlow = new THREE.Mesh(
      new THREE.RingGeometry(CONFIG.sunSize * 2.5, CONFIG.sunSize * 6, 64),
      new THREE.MeshBasicMaterial({
        color: 0xff5500,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false
      })
    );

    // Make it face upwards (like a halo)
    sunGlow.rotation.x = Math.PI / 2;
    solarSystemContainer.add(sunGlow);

    // sunGlow.scale.set(100, 100, 1);
    solarSystemContainer.add(sun);

    bodiesRef.current.push({
      name: "Sun", type: "Star", mesh: sun,
      data: { desc: "Designated Sol, this G2V main-sequence star fuses four million tons of hydrogen into energy every second. Its defining feature is the precise, stable calibration of its radiative output, which anchored Earth within the Habitable Zone.", d: "0", s: "N/A" }
    });

    // Planets
    const planets = [
      { name: "Mercury", r: 2, d: 25, s: 0.04, c: ['#a5a5a5', '#5a5a5a'], desc: "The smallest planet, shrinking as its iron core cools." },
      { name: "Venus", r: 3.2, d: 40, s: 0.025, c: ['#e3bb76', '#d49d42'], desc: "Wrapped in thick clouds of sulfuric acid, trapping heat." },
      { name: "Earth", r: 3.5, d: 60, s: 0.02, c: ['#287ab8', '#1a3b5c'], desc: "The only known world to harbor life. Home." },
      { name: "Mars", r: 2.8, d: 80, s: 0.015, c: ['#e27b58', '#8e3b23'], desc: "Home to Olympus Mons, the largest volcano in the solar system." },
      { name: "Jupiter", r: 8, d: 130, s: 0.008, c: ['#c88b3a', '#9c6f3b'], desc: "A gas giant so massive it protects inner planets by deflecting comets." },
      { name: "Saturn", r: 7, d: 170, s: 0.006, c: ['#ead6b8', '#c5a675'], ring: true, desc: "Its ring system is made of billions of ice and rock particles." },
      { name: "Uranus", r: 5, d: 210, s: 0.004, c: ['#d1f5f8', '#4b70dd'], desc: "An ice giant that rolls on its side." },
      { name: "Neptune", r: 4.8, d: 240, s: 0.003, c: ['#4b70dd', '#2d4596'], desc: "The windiest world, with supersonic winds." }
    ];

    planets.forEach(p => {
      const pivot = new THREE.Object3D();
      solarSystemContainer.add(pivot);

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.r, CONFIG.geometrySegments, CONFIG.geometrySegments),
        new THREE.MeshStandardMaterial({
          map: TextureFactory.create(p.name.match(/Jup|Sat|Ura|Nep/) ? 'gas' : 'rocky', p.c[0], p.c[1]),
          roughness: 0.8,
          metalness: 0.1
        })
      );
      mesh.position.x = p.d;
      pivot.add(mesh);

      if (p.ring) {
        const rGeo = new THREE.RingGeometry(p.r * 1.4, p.r * 2.2, 64);
        const rMat = new THREE.MeshStandardMaterial({ color: 0xc2b280, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(rGeo, rMat);
        ring.rotation.x = Math.PI / 2.2;
        mesh.add(ring);
      }

      // Visual Orbit Line
      const orbitGeo = new THREE.RingGeometry(p.d - 0.15, p.d + 0.15, 128);
      const orbitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.08, transparent: true, side: THREE.DoubleSide });
      const orbitRing = new THREE.Mesh(orbitGeo, orbitMat);
      orbitRing.rotation.x = Math.PI / 2;
      orbitRing.visible = false;
      solarSystemContainer.add(orbitRing);

      // Trails
      const trailGeo = new THREE.BufferGeometry();
      const trailMax = CONFIG.trailLength;
      const positions = new Float32Array(trailMax * 3);
      trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const trailMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(p.c[0]),
        transparent: true,
        opacity: 0.8, // Increased visibility
        blending: THREE.NormalBlending
      });
      const trailMesh = new THREE.Line(trailGeo, trailMat);
      trailMesh.frustumCulled = false;

      // FIX: Trails belong to the scene (world space) to track correctly
      scene.add(trailMesh);

      trailsRef.current.push({ mesh: trailMesh, points: [], max: trailMax, target: mesh });

      bodiesRef.current.push({
        name: p.name,
        type: "Planet",
        mesh, pivot, orbitRing,
        speed: p.s,
        data: { desc: p.desc, d: p.d + " Units", s: p.s }
      });
    });

    // 6. Voyagers
    const probeGeo = new THREE.ConeGeometry(1.5, 4, 8);
    const probeMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa });

    const v1 = new THREE.Mesh(probeGeo, probeMat);
    const v1Dist = 320;
    const v1Lat = THREE.MathUtils.degToRad(35);
    v1.position.set(Math.cos(v1Lat) * v1Dist, Math.sin(v1Lat) * v1Dist, 0);
    v1.rotation.z = -v1Lat - (Math.PI / 2);
    solarSystemContainer.add(v1);

    const v2 = new THREE.Mesh(probeGeo, probeMat);
    const v2Dist = 340;
    const v2Lat = THREE.MathUtils.degToRad(-48);
    v2.position.set(Math.cos(v2Lat) * v2Dist, Math.sin(v2Lat) * v2Dist, 0);
    v2.rotation.z = -v2Lat - (Math.PI / 2);
    solarSystemContainer.add(v2);

    voyagersRef.current.push(
      { name: "Voyager 1", type: "Interstellar Probe", mesh: v1, data: { desc: "Furthest human-made object.", d: "163 AU", s: "17 km/s" } },
      { name: "Voyager 2", type: "Interstellar Probe", mesh: v2, data: { desc: "Visited ice giants.", d: "136 AU", s: "15 km/s" } }
    );

    // Voyager Trails
    voyagersRef.current.forEach(v => {
      const trailGeo = new THREE.BufferGeometry();
      const trailMax = CONFIG.trailLength;
      const positions = new Float32Array(trailMax * 3);
      trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const trailMat = new THREE.LineBasicMaterial({
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
      });
      const trailMesh = new THREE.Line(trailGeo, trailMat);
      trailMesh.frustumCulled = false;
      scene.add(trailMesh);

      trailsRef.current.push({ mesh: trailMesh, points: [], max: trailMax, target: v.mesh });
    });

    // 7. Asteroids
    const astGeo = new THREE.DodecahedronGeometry(0.35, 0);
    const astMat = new THREE.MeshLambertMaterial({ color: 0x777777 });
    const asteroids = new THREE.InstancedMesh(astGeo, astMat, CONFIG.asteroidCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < CONFIG.asteroidCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 30;
      const spread = (Math.random() - 0.5) * 8;
      dummy.position.set(Math.cos(angle) * dist, spread, Math.sin(angle) * dist);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      dummy.scale.setScalar(Math.random() * 1.5 + 0.5);
      dummy.updateMatrix();
      asteroids.setMatrixAt(i, dummy.matrix);
    }
    solarSystemContainer.add(asteroids);
    asteroidsRef.current = asteroids;

    // --- ALPHA CENTAURI SYSTEM ---
    const alphaCentauriContainer = new THREE.Group();
    alphaCentauriContainer.position.set(CONFIG.solarSystemDistance - 1800, 200, CONFIG.solarSystemDistance + 1200);
    alphaCentauriContainer.rotation.set(THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(-10), 0);
    scene.add(alphaCentauriContainer);

    const acStarAGeo = new THREE.SphereGeometry(6, CONFIG.geometrySegments, CONFIG.geometrySegments);
    const acStarA = new THREE.Mesh(acStarAGeo, new THREE.MeshBasicMaterial({ map: TextureFactory.create('sun', '#fff4d6', '#ffcc44') }));
    const acStarAGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TextureFactory.getGlowTexture(), color: 0xffdd88, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.6, depthWrite: false }));
    acStarAGlow.scale.set(40, 40, 1);
    acStarA.add(acStarAGlow);
    acStarA.add(new THREE.PointLight(0xffdd88, 3, 3000));
    alphaCentauriContainer.add(acStarA);
    bodiesRef.current.push({ name: "Alpha Centauri A", type: "Star", mesh: acStarA, data: { desc: "A G2V main-sequence star nearly identical to the Sun but 1.1 times more massive and 1.5 times more luminous.", d: "4.37 ly", s: "21.7 km/s" } });

    const acPivotB = new THREE.Object3D();
    alphaCentauriContainer.add(acPivotB);
    const acStarB = new THREE.Mesh(new THREE.SphereGeometry(4.5, CONFIG.geometrySegments, CONFIG.geometrySegments), new THREE.MeshBasicMaterial({ map: TextureFactory.create('sun', '#ffcc88', '#ee8833') }));
    acStarB.position.x = 25;
    const acStarBGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TextureFactory.getGlowTexture(), color: 0xffaa44, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.5, depthWrite: false }));
    acStarBGlow.scale.set(30, 30, 1);
    acStarB.add(acStarBGlow);
    acStarB.add(new THREE.PointLight(0xffaa44, 2, 2000));
    acPivotB.add(acStarB);
    bodiesRef.current.push({ name: "Alpha Centauri B", type: "Star", mesh: acStarB, data: { desc: "A K1V orange dwarf, the secondary of the Alpha Centauri binary at 0.9 solar masses.", d: "4.37 ly", s: "21.7 km/s" } });

    const acOrbitRing = new THREE.Mesh(new THREE.RingGeometry(24, 26, 64), new THREE.MeshBasicMaterial({ color: 0xffaa44, side: THREE.DoubleSide, transparent: true, opacity: 0.08 }));
    acOrbitRing.rotation.x = Math.PI / 2;
    alphaCentauriContainer.add(acOrbitRing);

    const proximaPivot = new THREE.Object3D();
    alphaCentauriContainer.add(proximaPivot);
    const proximaStar = new THREE.Mesh(new THREE.SphereGeometry(1.5, CONFIG.geometrySegments, CONFIG.geometrySegments), new THREE.MeshBasicMaterial({ color: 0xff4422, emissive: 0x661100 }));
    proximaStar.position.x = 120;
    const proximaGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TextureFactory.getGlowTexture(), color: 0xff3311, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.4, depthWrite: false }));
    proximaGlow.scale.set(12, 12, 1);
    proximaStar.add(proximaGlow);
    proximaStar.add(new THREE.PointLight(0xff4422, 1, 500));
    proximaPivot.add(proximaStar);
    bodiesRef.current.push({ name: "Proxima Centauri", type: "Red Dwarf", mesh: proximaStar, data: { desc: "The closest known star to the Sun at 4.2465 ly. Hosts Proxima Centauri b, a rocky exoplanet in the habitable zone.", d: "4.246 ly", s: "22.4 km/s" } });

    const proxBPivot = new THREE.Object3D();
    proximaStar.add(proxBPivot);
    const proxBMesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, CONFIG.geometrySegments, CONFIG.geometrySegments), new THREE.MeshStandardMaterial({ map: TextureFactory.create('rocky', '#5588cc', '#334466'), roughness: 0.7, metalness: 0.2 }));
    proxBMesh.position.x = 5;
    proxBPivot.add(proxBMesh);
    bodiesRef.current.push({ name: "Proxima Centauri b", type: "Exoplanet", mesh: proxBMesh, pivot: proxBPivot, speed: 0.03, data: { desc: "A rocky exoplanet in the habitable zone of Proxima Centauri with 1.17 Earth masses.", d: "4.246 ly", s: "N/A" } });

    // --- SPACESHIP ---
    const shipGroup = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.ConeGeometry(3, 12, 4), new THREE.MeshStandardMaterial({ color: 0x00ddff, emissive: 0x004466, metalness: 0.8, roughness: 0.2 }));
    hull.rotation.x = Math.PI / 2;
    shipGroup.add(hull);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x0088aa, emissive: 0x003344, metalness: 0.7, roughness: 0.3 }));
    wings.position.z = 2;
    shipGroup.add(wings);
    const engineLight = new THREE.PointLight(0x00ffff, 2, 300);
    engineLight.position.z = 6;
    shipGroup.add(engineLight);
    const exhaust = new THREE.Mesh(new THREE.ConeGeometry(1.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
    exhaust.rotation.x = -Math.PI / 2;
    exhaust.position.z = 8;
    shipGroup.add(exhaust);
    shipExhaustRef.current = exhaust;
    shipGroup.position.set(0, 100, CONFIG.solarSystemDistance + 400);
    shipGroup.visible = false;
    scene.add(shipGroup);
    shipRef.current = shipGroup;

    // --- TESSERACT DIMENSION ---
    const tesseractGroup = new THREE.Group();
    tesseractGroup.visible = false;
    const cubeColors = [0xffaa44, 0xff6622, 0xffdd88];
    const cubeSizes = [800, 1300, 1900];
    const cubeRefs = [];
    cubeSizes.forEach((size, i) => {
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size));
      const wf = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: cubeColors[i], transparent: true, opacity: 0.5 - i * 0.12 }));
      wf.position.z = -3000;
      tesseractGroup.add(wf);
      cubeRefs.push(wf);
    });
    for (let i = 0; i < 8; i++) {
      const s = 250 + i * 120;
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s));
      const wf = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.18 }));
      wf.position.set(0, 0, -800 - i * 800);
      tesseractGroup.add(wf);
      cubeRefs.push(wf);
    }
    const gridMat = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.06, wireframe: true, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 8000, 30, 80), gridMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -250, -3000);
    tesseractGroup.add(floor);
    const ceiling = floor.clone(); ceiling.position.y = 250;
    tesseractGroup.add(ceiling);
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(8000, 500, 80, 30), gridMat.clone());
    leftWall.rotation.y = Math.PI / 2; leftWall.position.set(-250, 0, -3000);
    tesseractGroup.add(leftWall);
    const rightWall = leftWall.clone(); rightWall.position.x = 250;
    tesseractGroup.add(rightWall);
    const sliceCount = 500;
    const sliceGeo = new THREE.BufferGeometry();
    const slicePos = new Float32Array(sliceCount * 3);
    const sliceCol = new Float32Array(sliceCount * 3);
    for (let i = 0; i < sliceCount; i++) {
      slicePos[i * 3] = (Math.random() - 0.5) * 480; slicePos[i * 3 + 1] = (Math.random() - 0.5) * 480; slicePos[i * 3 + 2] = Math.random() * -7000;
      const c = new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 0.9, 0.4 + Math.random() * 0.4);
      sliceCol[i * 3] = c.r; sliceCol[i * 3 + 1] = c.g; sliceCol[i * 3 + 2] = c.b;
    }
    sliceGeo.setAttribute('position', new THREE.BufferAttribute(slicePos, 3));
    sliceGeo.setAttribute('color', new THREE.BufferAttribute(sliceCol, 3));
    tesseractGroup.add(new THREE.Points(sliceGeo, new THREE.PointsMaterial({ size: 14, vertexColors: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, map: TextureFactory.getGlowTexture() })));
    tesseractGroup.add(new THREE.AmbientLight(0xffaa44, 0.8));
    const tL1 = new THREE.PointLight(0xffaa44, 5, 4000); tL1.position.set(0, 0, -1000); tesseractGroup.add(tL1);
    const tL2 = new THREE.PointLight(0xff6622, 4, 4000); tL2.position.set(0, 0, -4000); tesseractGroup.add(tL2);
    const tL3 = new THREE.PointLight(0xffcc44, 3, 3000); tL3.position.set(0, 0, -6000); tesseractGroup.add(tL3);
    const exitPortal = new THREE.Mesh(new THREE.TorusGeometry(120, 12, 32, 64), new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    exitPortal.position.set(0, 0, -6000);
    exitPortal.add(new THREE.Mesh(new THREE.TorusGeometry(120, 60, 16, 64), new THREE.MeshBasicMaterial({ color: 0x2266ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending })));
    exitPortal.add(new THREE.PointLight(0x4488ff, 8, 1200));
    tesseractGroup.add(exitPortal);
    scene.add(tesseractGroup);
    tesseractRef.current = { group: tesseractGroup, cubes: cubeRefs, portal: exitPortal };

    // --- ANDROMEDA GALAXY ---
    const ANDROMEDA_OFFSET = new THREE.Vector3(CONFIG.galaxyScale * 2.5, 5000, CONFIG.galaxyScale * 1.5);
    andromedaGalaxyRef.current = new Galaxy(scene, {
      position: ANDROMEDA_OFFSET.clone(),
      radius: CONFIG.galaxyScale * 1.3,
      arms: 7, winding: 3.0,
      starCount: isMobile ? 30000 : 90000,
      colorCore: new THREE.Color(0xbbddff),
      colorArmBlue: new THREE.Color(0x6699ff),
      colorArmPink: new THREE.Color(0xaa66ff),
      colorDust: new THREE.Color(0x334488),
      glowColor: 0x6699ff,
      glowOpacity: 0.7,
      starSize: 280,
      bulgeSize: 3000
    });
    andromedaBHRef.current = new GargantuaBlackHole(scene, ANDROMEDA_OFFSET.clone(), 350);

    // Inter-Galaxy Portal (Milky Way edge → Andromeda edge)
    const mwPortalPos = new THREE.Vector3(CONFIG.galaxyScale * 0.9, 1000, CONFIG.galaxyScale * 0.5);
    const igPortalGeo = new THREE.TorusGeometry(200, 20, 32, 64);
    const mwPortal = new THREE.Mesh(igPortalGeo, new THREE.MeshBasicMaterial({ color: 0x8844ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    mwPortal.position.copy(mwPortalPos);
    mwPortal.add(new THREE.Mesh(new THREE.TorusGeometry(200, 80, 16, 64), new THREE.MeshBasicMaterial({ color: 0x6622ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending })));
    mwPortal.add(new THREE.PointLight(0x8844ff, 10, 2000));
    scene.add(mwPortal);

    // Return Portal (Andromeda edge → Milky Way edge)
    const andReturnPos = ANDROMEDA_OFFSET.clone().add(new THREE.Vector3(-CONFIG.galaxyScale * 0.8, -1000, -CONFIG.galaxyScale * 0.4));
    const andReturnPortal = new THREE.Mesh(igPortalGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    andReturnPortal.position.copy(andReturnPos);
    andReturnPortal.add(new THREE.Mesh(new THREE.TorusGeometry(200, 80, 16, 64), new THREE.MeshBasicMaterial({ color: 0x2288ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending })));
    andReturnPortal.add(new THREE.PointLight(0x44aaff, 10, 2000));
    scene.add(andReturnPortal);

    // Andromeda Tesseract (triggered by Andromeda's black hole)
    const andTessGroup = new THREE.Group();
    andTessGroup.visible = false;
    const andCubeRefs = [];
    [700, 1100, 1600].forEach((size, i) => {
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size));
      const wf = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: [0x6699ff, 0x4466cc, 0x88bbff][i], transparent: true, opacity: 0.5 - i * 0.12 }));
      wf.position.z = -2500;
      andTessGroup.add(wf);
      andCubeRefs.push(wf);
    });
    for (let i = 0; i < 6; i++) {
      const s = 200 + i * 100;
      const wf = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)), new THREE.LineBasicMaterial({ color: 0x6699ff, transparent: true, opacity: 0.15 }));
      wf.position.set(0, 0, -600 - i * 700);
      andTessGroup.add(wf);
      andCubeRefs.push(wf);
    }
    const andGridMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.06, wireframe: true, side: THREE.DoubleSide });
    const andFloor = new THREE.Mesh(new THREE.PlaneGeometry(450, 7000, 25, 70), andGridMat);
    andFloor.rotation.x = -Math.PI / 2; andFloor.position.set(0, -220, -2500);
    andTessGroup.add(andFloor);
    const andCeiling = andFloor.clone(); andCeiling.position.y = 220;
    andTessGroup.add(andCeiling);
    andTessGroup.add(new THREE.AmbientLight(0x4488ff, 0.6));
    const andTL = new THREE.PointLight(0x4488ff, 5, 4000); andTL.position.set(0, 0, -2000); andTessGroup.add(andTL);
    const andExitPortal = new THREE.Mesh(new THREE.TorusGeometry(100, 10, 32, 64), new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    andExitPortal.position.set(0, 0, -5000);
    andExitPortal.add(new THREE.Mesh(new THREE.TorusGeometry(100, 50, 16, 64), new THREE.MeshBasicMaterial({ color: 0x2266ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending })));
    andExitPortal.add(new THREE.PointLight(0x44aaff, 8, 1200));
    andTessGroup.add(andExitPortal);
    scene.add(andTessGroup);
    andromedaTesseractRef.current = { group: andTessGroup, cubes: andCubeRefs, portal: andExitPortal };

    // --- KEYBOARD EVENTS ---
    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      keysRef.current.add(e.key.toLowerCase());
      if (['w', 'a', 's', 'd', 'f', 'z', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const onKeyUp = (e) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);


    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.15;
    bloomPass.strength = 1.8;
    bloomPass.radius = 0.5;
    composer.addPass(bloomPass);

    const lensingPass = new ShaderPass(LensingShader);
    lensingPass.uniforms.aspectRatio.value = width / height;
    composer.addPass(lensingPass);

    // 9. Labels
    voyagersRef.current.forEach((v) => {
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
      div.style.display = 'none';
      document.body.appendChild(div);
      labelsRef.current.push({ div, mesh: v.mesh });
    });

    // --- LOOP ---
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      const isPaused = pausedRef.current;
      const time = clockRef.current.getElapsedTime();

      if (!isPaused) {
        // Galaxy Rotation
        if (galaxyRef.current) {
          galaxyRef.current.mesh.rotation.y = time * 0.005;
        }

        // Black Hole Animation
        if (sagARef.current) {
          sagARef.current.animate(time, camera.position);
        }

        // Solar System Orbit (The Galactic Year)
        // We rotate the container around the world Y axis (Galactic Center)
        const angle = time * 0.015; // Reduced speed for tighter, more circular helix
        const oldPos = solarSystemContainerRef.current.position.clone();

        const newX = Math.sin(angle) * CONFIG.solarSystemDistance;
        const newZ = Math.cos(angle) * CONFIG.solarSystemDistance;

        solarSystemContainerRef.current.position.set(newX, 0, newZ);

        // Move camera with the system ONLY if it is tracking the solar system
        const delta = new THREE.Vector3().subVectors(solarSystemContainerRef.current.position, oldPos);
        if (!shipModeRef.current) {
          const isTrackingSS = controls.target.distanceTo(solarSystemContainerRef.current.position) < 1;
          if (isTrackingSS) {
            camera.position.add(delta);
            controls.target.copy(solarSystemContainerRef.current.position);
          }
        }

        // Local Solar System Physics
        bodiesRef.current.forEach(b => {
          if (b.pivot) {
            b.pivot.rotation.y += b.speed * 0.5;
            b.mesh.rotation.y += 0.005;
          }
        });

        if (asteroidsRef.current) asteroidsRef.current.rotation.y += 0.0005;

        // Alpha Centauri binary orbit
        if (acPivotB) acPivotB.rotation.y += 0.01;
        if (proximaPivot) proximaPivot.rotation.y += 0.002;
        if (proxBPivot) proxBPivot.rotation.y += 0.04;

        // Update Trails (World Space conversion required)
        trailsRef.current.forEach(t => {
          const worldPos = new THREE.Vector3();
          t.target.getWorldPosition(worldPos);
          t.points.push(worldPos.clone());
          if (t.points.length > t.max) t.points.shift();

          const arr = t.mesh.geometry.attributes.position.array;
          let idx = 0;
          for (let i = 0; i < t.points.length; i++) {
            arr[idx++] = t.points[i].x;
            arr[idx++] = t.points[i].y;
            arr[idx++] = t.points[i].z;
          }
          t.mesh.geometry.attributes.position.needsUpdate = true;
          t.mesh.geometry.setDrawRange(0, t.points.length);
        });
      }

      // --- SHIP MOVEMENT ---
      if (shipModeRef.current && shipRef.current) {
        const ship = shipRef.current;
        const keys = keysRef.current;
        const joy = joystickRef.current;
        const vel = shipVelocityRef.current;
        const inTess = inTesseractRef.current;
        const inAndTess = inAndromedaTesseractRef.current;
        const isInAnyTesseract = inTess || inAndTess;
        const spd = isInAnyTesseract ? 90 : 180;
        const rotSpd = isInAnyTesseract ? 0.008 : 0.035;
        const damp = 0.97;

        let thrust = 0, yaw = 0, vertical = 0;
        if (keys.has('w') || keys.has('arrowup')) thrust += 1;
        if (keys.has('s') || keys.has('arrowdown')) thrust -= 1;
        if (keys.has('a') || keys.has('arrowleft')) yaw += 1;
        if (keys.has('d') || keys.has('arrowright')) yaw -= 1;
        if (keys.has('f')) vertical += 1;
        if (keys.has('z')) vertical -= 1;
        if (joy.active) { thrust = -joy.y; yaw = -joy.x; }

        if (isInAnyTesseract) {
          vel.z += -thrust * spd;
          vel.y += vertical * spd;
          vel.x += -yaw * spd;
          vel.x *= 0.85; vel.y *= 0.85;
          ship.rotation.y += yaw * rotSpd;
        } else {
          ship.rotation.y += yaw * rotSpd;
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion);
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(ship.quaternion);
          vel.addScaledVector(fwd, thrust * spd);
          vel.addScaledVector(up, vertical * spd);
        }
        vel.multiplyScalar(damp);
        ship.position.add(vel.clone().multiplyScalar(0.016));

        if (isInAnyTesseract) {
          ship.position.x = THREE.MathUtils.clamp(ship.position.x, -240, 240);
          ship.position.y = THREE.MathUtils.clamp(ship.position.y, -240, 240);
          ship.position.z = THREE.MathUtils.clamp(ship.position.z, -6200, 1000);
        }

        const ex = shipExhaustRef.current;
        if (ex) { ex.scale.z = 1 + Math.abs(thrust) * 2.5; ex.material.opacity = 0.2 + Math.abs(thrust) * 0.6; }
        ship.children[2].intensity = 1 + Math.abs(thrust) * 5;

        const camOff = new THREE.Vector3(0, 25, 70);
        camOff.applyQuaternion(ship.quaternion);
        camera.position.lerp(ship.position.clone().add(camOff), 0.035);
        camera.lookAt(ship.position);
        setShipSpeed(Math.round(vel.length()));

        // --- ENTRY / EXIT LOGIC ---
        const triggerAchievement = (id, name, desc) => {
          if (!achievementsRef.current.has(id)) {
            achievementsRef.current.add(id);
            const pid = Date.now() + Math.random();
            setActivePopups(prev => [...prev, { id: pid, name, desc }]);
            setTimeout(() => setActivePopups(prev => prev.filter(p => p.id !== pid)), 4500);
          }
        };

        if (!inTess && !inAndTess) {
          // Sagittarius A* entry → MW Tesseract
          if (ship.position.distanceTo(new THREE.Vector3(0, 0, 0)) < 2000) {
            inTesseractRef.current = true; setInTesseract(true);
            ship.position.set(0, 0, 800); ship.rotation.set(0, 0, 0); vel.set(0, 0, 0);
            triggerAchievement('sagittarius', '🕳️ Event Horizon', 'You fell into Sagittarius A*! Find the exit portal...');
          }
          // Andromeda BH entry → Andromeda Tesseract
          if (andromedaBHRef.current && ship.position.distanceTo(andromedaBHRef.current.group.position) < 2000) {
            inAndromedaTesseractRef.current = true; setInAndromedaTesseract(true);
            ship.position.set(0, 0, 800); ship.rotation.set(0, 0, 0); vel.set(0, 0, 0);
            triggerAchievement('andromeda_rift', '🌀 Andromeda Rift', 'You fell into Andromeda\'s black hole!');
          }
          // Inter-galaxy portal: MW → Andromeda
          if (ship.position.distanceTo(mwPortalPos) < 500) {
            const andPos = ANDROMEDA_OFFSET.clone().add(new THREE.Vector3(-CONFIG.galaxyScale * 0.5, 0, -CONFIG.galaxyScale * 0.3));
            ship.position.copy(andPos); vel.set(0, 0, 0);
            inAndromedaRef.current = true;
            triggerAchievement('intergalactic', '🌌 Intergalactic', 'You crossed the void between galaxies!');
          }
          // Return portal: Andromeda → MW
          if (ship.position.distanceTo(andReturnPos) < 500) {
            ship.position.set(CONFIG.galaxyScale * 0.7, 500, CONFIG.galaxyScale * 0.3); vel.set(0, 0, 0);
            inAndromedaRef.current = false;
          }
          // Normal checkpoints
          const checkpoints = [
            { id: 'solar_system', pos: solarSystemContainerRef.current.position, radius: 500, name: '🌍 Homecoming', desc: 'You reached our Solar System!' },
            { id: 'alpha_centauri', pos: new THREE.Vector3(CONFIG.solarSystemDistance - 1800, 200, CONFIG.solarSystemDistance + 1200), radius: 1000, name: '⭐ First Contact', desc: 'You reached the Alpha Centauri system!' },
            { id: 'milky_way_outer', pos: new THREE.Vector3(0, 0, CONFIG.galaxyScale * 0.95), radius: 5000, name: '🌌 Edge Runner', desc: 'You reached the outer rim of the Milky Way!' }
          ];
          checkpoints.forEach(cp => {
            if (!achievementsRef.current.has(cp.id) && ship.position.distanceTo(cp.pos) < cp.radius) {
              triggerAchievement(cp.id, cp.name, cp.desc);
            }
          });
        } else if (inTess) {
          // MW Tesseract exit portal
          if (tesseractRef.current && ship.position.distanceTo(tesseractRef.current.portal.position) < 400) {
            inTesseractRef.current = false; setInTesseract(false);
            const ssPos = solarSystemContainerRef.current.position;
            ship.position.set(ssPos.x, ssPos.y + 100, ssPos.z + 400);
            ship.rotation.set(0, 0, 0); vel.set(0, 0, 0);
            triggerAchievement('tesseract_escape', '✨ Tesseract Escape', 'You escaped the 4th dimension!');
          }
        } else if (inAndTess) {
          // Andromeda Tesseract exit portal
          if (andromedaTesseractRef.current && ship.position.distanceTo(andromedaTesseractRef.current.portal.position) < 400) {
            inAndromedaTesseractRef.current = false; setInAndromedaTesseract(false);
            const andEdge = ANDROMEDA_OFFSET.clone().add(new THREE.Vector3(-CONFIG.galaxyScale * 0.5, 0, -CONFIG.galaxyScale * 0.3));
            ship.position.copy(andEdge); ship.rotation.set(0, 0, 0); vel.set(0, 0, 0);
            triggerAchievement('andromeda_escape', '💫 Andromeda Escape', 'You escaped Andromeda\'s rift!');
          }
        }
      }

      // --- TESSERACT ANIMATION ---
      if (inTesseractRef.current && tesseractRef.current) {
        const tess = tesseractRef.current;
        tess.cubes[0].rotation.x = time * 0.3; tess.cubes[0].rotation.y = time * 0.2;
        tess.cubes[1].rotation.y = time * 0.15; tess.cubes[1].rotation.z = time * 0.25;
        tess.cubes[2].rotation.x = time * 0.1; tess.cubes[2].rotation.z = time * 0.18;
        for (let i = 3; i < tess.cubes.length; i++) {
          tess.cubes[i].rotation.x = time * (0.2 + i * 0.05);
          tess.cubes[i].rotation.y = time * (0.15 + i * 0.03);
        }
        const pulse = Math.sin(time * 3) * 0.3 + 0.7;
        tess.portal.material.opacity = pulse;
        tess.portal.rotation.z = time * 0.5;
        if (tess.portal.children[0]) tess.portal.children[0].material.opacity = pulse * 0.3;
      }

      // --- ANDROMEDA TESSERACT ANIMATION ---
      if (inAndromedaTesseractRef.current && andromedaTesseractRef.current) {
        const tess = andromedaTesseractRef.current;
        tess.cubes.forEach((cube, i) => {
          cube.rotation.x = time * (0.15 + i * 0.04);
          cube.rotation.y = time * (0.1 + i * 0.03);
        });
        const pulse = Math.sin(time * 2.5) * 0.3 + 0.7;
        tess.portal.material.opacity = pulse;
        tess.portal.rotation.z = time * 0.4;
      }

      // Andromeda BH Animation
      if (andromedaBHRef.current) andromedaBHRef.current.animate(time, camera.position);

      // Portal rotation animation
      if (mwPortal) mwPortal.rotation.z = time * 0.3;
      if (andReturnPortal) andReturnPortal.rotation.z = -time * 0.3;

      // Gravitational Lensing Update
      const distSag = camera.position.distanceTo(sagARef.current.group.position);
      const bhWorldPos = sagARef.current.group.position.clone();
      bhWorldPos.project(camera);
      lensingPass.uniforms.blackHoleScreenPos.value.set((bhWorldPos.x + 1) / 2, (bhWorldPos.y + 1) / 2);
      const maxDist = 30000;
      const strength = THREE.MathUtils.lerp(0.14, 0, Math.min(distSag / maxDist, 1.0));
      lensingPass.uniforms.lensingStrength.value = strength;

      // Labels Update
      labelsRef.current.forEach(lbl => {
        const pos = new THREE.Vector3();
        lbl.mesh.getWorldPosition(pos);
        pos.project(camera);
        const x = (pos.x * 0.5 + 0.5) * width;
        const y = (-(pos.y * 0.5) + 0.5) * height;
        if (pos.z < 1 && x > 0 && x < width && y > 0 && y < height) {
          lbl.div.style.display = 'block';
          lbl.div.style.transform = 'translate(-50%, -150%)';
          lbl.div.style.left = `${x}px`;
          lbl.div.style.top = `${y}px`;
        } else {
          lbl.div.style.display = 'none';
        }
      });

      // Tesseract visibility
      if (tesseractRef.current) tesseractRef.current.group.visible = inTesseractRef.current;
      if (andromedaTesseractRef.current) andromedaTesseractRef.current.group.visible = inAndromedaTesseractRef.current;

      if (!shipModeRef.current) controls.update();
      composer.render();
    };

    animate();
    setLoading(false);

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      lensingPass.uniforms.aspectRatio.value = w / h;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (mountNode && renderer.domElement) {
        mountNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      labelsRef.current.forEach(l => {
        if (l.div && l.div.parentNode) document.body.removeChild(l.div);
      });
    };
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    if (bodiesRef.current) {
      bodiesRef.current.forEach(b => {
        if (b.orbitRing) b.orbitRing.visible = paused;
      });
    }
  }, [paused]);

  useEffect(() => {
    shipModeRef.current = shipMode;
    if (shipRef.current) shipRef.current.visible = shipMode;
    if (controlsRef.current) controlsRef.current.enabled = !shipMode;
    if (shipMode && shipRef.current) {
      shipVelocityRef.current.set(0, 0, 0);
    }
  }, [shipMode]);

  useEffect(() => {
    inTesseractRef.current = inTesseract;
    if (inTesseract && shipRef.current) {
      shipRef.current.position.set(0, 0, 800);
      shipRef.current.rotation.set(0, 0, 0);
      shipVelocityRef.current.set(0, 0, 0);
    }
  }, [inTesseract]);

  useEffect(() => {
    inAndromedaTesseractRef.current = inAndromedaTesseract;
    if (inAndromedaTesseract && shipRef.current) {
      shipRef.current.position.set(0, 0, 800);
      shipRef.current.rotation.set(0, 0, 0);
      shipVelocityRef.current.set(0, 0, 0);
    }
  }, [inAndromedaTesseract]);

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
        if (window.innerWidth < 768) setShowChat(false);
      }
    }
  };

  const jumpToSolarSystem = () => {
    if (cameraRef.current && solarSystemContainerRef.current && controlsRef.current) {
      const pos = solarSystemContainerRef.current.position;
      cameraRef.current.position.set(pos.x, pos.y + 300, pos.z + 600);
      controlsRef.current.target.copy(pos);
      // Select Sun as representative
      const sun = bodiesRef.current.find(b => b.name === "Sun");
      if (sun) setSelectedBody(sun);
    }
  };

  const jumpToSagittarius = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 1000, 2000);
      controlsRef.current.target.set(0, 0, 0);
      setSelectedBody({
        name: "Sagittarius A*",
        type: "Supermassive Black Hole",
        data: {
          desc: "The supermassive black hole at the Galactic Center. It has a mass of 4 million Suns and governs the orbits of all stars in the galaxy.",
          d: "26,000 LY",
          s: "0 km/s"
        }
      });
    }
  };

  const jumpToGalaxy = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 40000, 80000);
      controlsRef.current.target.set(0, 0, 0);
      setSelectedBody({
        name: "Milky Way",
        type: "Barred Spiral Galaxy",
        data: {
          desc: "Our home galaxy, a barred spiral containing 100-400 billion stars. It spans 100,000 light-years and is part of the Local Group.",
          d: "100,000 LY Diameter",
          s: "210 km/s (Rotation)"
        }
      });
    }
  };

  const jumpToAndromeda = () => {
    if (cameraRef.current && controlsRef.current && andromedaGalaxyRef.current) {
      const andPos = andromedaGalaxyRef.current.mesh.position;
      cameraRef.current.position.set(andPos.x, andPos.y + 40000, andPos.z + 80000);
      controlsRef.current.target.copy(andPos);
      setSelectedBody({
        name: "Andromeda Galaxy (M31)",
        type: "Barred Spiral Galaxy",
        data: {
          desc: "The nearest large galaxy to the Milky Way, containing approximately 1 trillion stars. It will collide with our galaxy in about 4.5 billion years.",
          d: "2.537M LY",
          s: "-301 km/s (Approaching)"
        }
      });
    }
  };

  const jumpToAlphaCentauri = () => {
    if (cameraRef.current && controlsRef.current) {
      const acPos = new THREE.Vector3(CONFIG.solarSystemDistance - 1800, 200, CONFIG.solarSystemDistance + 1200);
      cameraRef.current.position.set(acPos.x, acPos.y + 100, acPos.z + 250);
      controlsRef.current.target.copy(acPos);
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
            <span className="text-xs tracking-[4px] uppercase">Galactic Sync In Progress</span>
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
            ORION SPUR | 60° INCLINATION
          </span>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-xl px-6 py-3 rounded-full border border-white/10 shadow-2xl z-10 w-[95%] md:w-auto justify-center max-w-4xl flex-wrap md:flex-nowrap">
        <button
          onClick={() => setPaused(!paused)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold tracking-widest transition-all shadow-lg border ${paused ? 'bg-amber-500 border-amber-400 text-black hover:bg-amber-400' : 'bg-white/5 border-white/20 text-white hover:bg-cyan-500 hover:text-black hover:border-cyan-400'}`}
        >
          {paused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
          {paused ? "RESUME" : "PAUSE"}
        </button>

        <button onClick={jumpToSolarSystem} className="p-2 rounded-full bg-white/5 border border-white/20 hover:bg-white/20 text-gray-300 hover:text-white transition-all flex items-center gap-1.5" title="Solar System">
          <RotateCcw size={13} /><span className="text-[9px] hidden md:inline">SOLAR</span>
        </button>

        <button onClick={jumpToAlphaCentauri} className="p-2 rounded-full bg-white/5 border border-white/20 hover:bg-orange-500/20 text-gray-300 hover:text-orange-300 transition-all flex items-center gap-1.5" title="Alpha Centauri">
          <Sparkles size={13} /><span className="text-[9px] hidden md:inline">α CEN</span>
        </button>

        <button onClick={jumpToSagittarius} className="p-2 rounded-full bg-white/5 border border-white/20 hover:bg-white/20 text-gray-300 hover:text-white transition-all flex items-center gap-1.5" title="Sagittarius A*">
          <MapPin size={13} /><span className="text-[9px] hidden md:inline">SAG A*</span>
        </button>

        <button onClick={jumpToGalaxy} className="p-2 rounded-full bg-white/5 border border-white/20 hover:bg-white/20 text-gray-300 hover:text-white transition-all flex items-center gap-1.5" title="Milky Way">
          <Sparkles size={13} /><span className="text-[9px] hidden md:inline">MW</span>
        </button>

        <button onClick={jumpToAndromeda} className="p-2 rounded-full bg-white/5 border border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-300 hover:text-indigo-200 transition-all flex items-center gap-1.5" title="Andromeda Galaxy">
          <Sparkles size={13} /><span className="text-[9px] hidden md:inline">M31</span>
        </button>

        <button
          onClick={() => setShipMode(!shipMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold tracking-widest transition-all shadow-lg border ${shipMode ? 'bg-cyan-500 border-cyan-400 text-black hover:bg-cyan-400' : 'bg-white/5 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400'}`}
        >
          <Rocket size={12} />
          {shipMode ? "EXIT SHIP" : "FLY"}
        </button>
      </div>

      {/* SHIP HUD */}
      {shipMode && (
        <div className="absolute top-6 right-6 z-20 space-y-2 pointer-events-none">
          <div className="bg-black/70 backdrop-blur border border-cyan-500/30 px-4 py-3 rounded-lg relative overflow-hidden">
            <div className="hud-scanline" />
            <div className="text-[9px] text-cyan-400 tracking-widest mb-1">VELOCITY</div>
            <div className="text-2xl font-mono text-white">{shipSpeed} <span className="text-[10px] text-cyan-400">u/s</span></div>
          </div>
          {(inTesseract || inAndromedaTesseract) && (
            <div className="bg-black/70 backdrop-blur border border-amber-500/30 px-4 py-2 rounded-lg">
              <div className="text-[9px] text-amber-400 tracking-widest animate-pulse">
                {inTesseract ? '⚡ TESSERACT DIMENSION' : '🌀 ANDROMEDA RIFT'}
              </div>
              <div className="text-[9px] text-amber-200 mt-1">Fly to the exit portal (blue ring) →</div>
            </div>
          )}
          <div className="bg-black/70 backdrop-blur border border-white/10 px-4 py-2 rounded-lg relative overflow-hidden">
            <div className="hud-scanline" style={{ animationDuration: '6s' }} />
            <div className="text-[9px] text-gray-400">W/S or ↑↓ = Forward/Back</div>
            <div className="text-[9px] text-gray-400">A/D or ←→ = Yaw Turn</div>
            <div className="text-[9px] text-cyan-400 font-bold">F / Z = Up / Down</div>
          </div>
        </div>
      )}

      {/* ACHIEVEMENT POPUPS */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 space-y-3 pointer-events-none">
        {activePopups.map(p => (
          <div key={p.id} className="bg-gradient-to-r from-amber-900/90 to-orange-900/90 backdrop-blur-xl border border-amber-500/50 px-6 py-3 rounded-lg shadow-[0_0_30px_rgba(255,170,0,0.4)] animate-[fadeInUp_0.5s_ease-out] flex items-center gap-3">
            <Trophy size={18} className="text-amber-400" />
            <div>
              <div className="text-sm font-bold text-amber-100">{p.name}</div>
              <div className="text-[10px] text-amber-300">{p.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* MOBILE JOYSTICK */}
      {shipMode && isMobile && (
        <div className="fixed bottom-28 right-8 z-40 flex flex-col items-center gap-6">
          <div className="flex flex-col gap-4">
            <button
              onTouchStart={() => keysRef.current.add('f')}
              onTouchEnd={() => keysRef.current.delete('f')}
              className="w-14 h-14 rounded-full bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-cyan-400 active:bg-cyan-500 active:text-black transition-colors"
            >
              <span className="font-bold text-lg">UP</span>
            </button>
            <button
              onTouchStart={() => keysRef.current.add('z')}
              onTouchEnd={() => keysRef.current.delete('z')}
              className="w-14 h-14 rounded-full bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-cyan-400 active:bg-cyan-500 active:text-black transition-colors"
            >
              <span className="font-bold text-lg">DN</span>
            </button>
          </div>

          <div
            className="w-28 h-28 rounded-full bg-white/10 border-2 border-cyan-500/40 flex items-center justify-center relative"
            onTouchStart={(e) => { e.preventDefault(); joystickRef.current.active = true; }}
            onTouchMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              const touch = e.touches[0];
              joystickRef.current.x = THREE.MathUtils.clamp((touch.clientX - cx) / (rect.width / 2), -1, 1);
              joystickRef.current.y = THREE.MathUtils.clamp((touch.clientY - cy) / (rect.height / 2), -1, 1);
            }}
            onTouchEnd={() => { joystickRef.current = { x: 0, y: 0, active: false }; }}
          >
            <div className="w-10 h-10 rounded-full bg-cyan-400/50 border border-cyan-300 pointer-events-none" />
          </div>
        </div>
      )}

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
                  onClick={() => fetchAiAnalysis(selectedBody.name, selectedBody.type)}
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
              To ensure visual clarity, planetary sizes and galactic distances are scaled. The 60° inclination of the Solar System relative to the Galactic Plane is accurately simulated.
            </p>
          </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={() => setShowDisclaimer(!showDisclaimer)}
          className="group relative p-3 rounded-full bg-white/5 border border-white/10 hover:bg-cyan-500/20 hover:border-cyan-400/50 text-gray-400 hover:text-cyan-300 transition-all"
        >
          <Info size={20} />

          {!showDisclaimer && (
            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 w-max max-w-[200px] px-3 py-1.5 bg-black/80 border border-white/10 rounded text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Simulation Info
            </div>
          )}
        </button>
      </div>
    </div>
  );
}



