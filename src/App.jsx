import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Play, Pause, RotateCcw, Sparkles, X, Loader2, Info, MessageSquare, Send, Bot, MapPin } from 'lucide-react';

/* --- CONFIGURATION --- */
const apiKey = import.meta.env.VITE_API_KEY;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800;

const CONFIG = {
  // Galaxy Constants
  galaxyScale: 120000,
  starCount: isMobile ? 40000 : 120000,
  // Distance: We scale this for visual feasibility. 
  // Real scale: Sun is ~26k ly from center. Galaxy radius ~50k ly.
  solarSystemDistance: 45000,

  // Solar System Constants
  solarSystemScale: 1, // Keep local scale 1:1 for physics
  sunSize: 12,
  inclination: 60, // The 60 degree tilt of the ecliptic relative to galactic plane

  trailLength: isMobile ? 30 : 60,
  asteroidCount: isMobile ? 1000 : 5000,
  geometrySegments: isMobile ? 32 : 64,
  textureSize: isMobile ? 256 : 1024,
  antialias: !isMobile
};

/* --- UTILS --- */
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

/* --- SHADERS --- */
const LensingShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "blackHoleScreenPos": { value: new THREE.Vector2(0.5, 0.5) },
    "lensingStrength": { value: 0.14 },
    "lensingRadius": { value: 0.32 },
    "aspectRatio": { value: 1.0 },
    "chromaticAberration": { value: 0.006 }
  },
  vertexShader: `
    varying vec2 vUv; 
    void main() { 
      vUv = uv; 
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); 
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 blackHoleScreenPos;
    uniform float lensingStrength;
    uniform float lensingRadius;
    uniform float aspectRatio;
    uniform float chromaticAberration;
    varying vec2 vUv;
    void main() {
      vec2 screenPos = vUv;
      vec2 toCenter = screenPos - blackHoleScreenPos;
      toCenter.x *= aspectRatio;
      float dist = length(toCenter);
      float distortionAmount = lensingStrength / (dist * dist + 0.01);
      distortionAmount = clamp(distortionAmount, 0.0, 0.5); 
      float falloff = smoothstep(lensingRadius, 0.0, dist);
      distortionAmount *= falloff; 
      vec2 offset = normalize(toCenter) * distortionAmount;
      offset.x /= aspectRatio;
      vec2 distortedUvR = screenPos - offset * (1.0 + chromaticAberration);
      vec2 distortedUvG = screenPos - offset;
      vec2 distortedUvB = screenPos - offset * (1.0 - chromaticAberration);
      float r = texture2D(tDiffuse, distortedUvR).r;
      float g = texture2D(tDiffuse, distortedUvG).g;
      float b = texture2D(tDiffuse, distortedUvB).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }`
};

const DiskShader = {
  vertex: `
    varying vec2 vUv;
    varying float vRadius;
    varying float vAngle;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vRadius = length(position.xy);
      vAngle = atan(position.y, position.x);
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: `
    uniform float uTime;
    uniform vec3 uColorHot;
    uniform vec3 uColorMid1;
    uniform vec3 uColorMid2;
    uniform vec3 uColorMid3;
    uniform vec3 uColorOuter;
    uniform float uNoiseScale;
    uniform float uFlowSpeed;
    uniform float uDensity;
    uniform vec3 uCameraPosition;
    varying vec2 vUv;
    varying float vRadius;
    varying float vAngle;
    varying vec3 vWorldPosition;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx) ;
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
      float n_ = 0.142857142857;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }

    void main() {
      float normalizedRadius = smoothstep(1.50, 8.00, vRadius);
      float spiral = vAngle * 3.5 - (1.0 / (normalizedRadius + 0.05)) * 3.0;
      vec2 noiseUv = vec2(vUv.x + uTime * uFlowSpeed * (2.0 / (vRadius * 0.4 + 0.5)) + sin(spiral) * 0.15, vUv.y * 0.7 + cos(spiral) * 0.15);
      float noiseVal = snoise(vec3(noiseUv * uNoiseScale, uTime * 0.2));
      noiseVal = (noiseVal + 1.0) * 0.5;
      vec3 color = uColorOuter;
      color = mix(color, uColorMid3, smoothstep(0.0, 0.3, normalizedRadius));
      color = mix(color, uColorMid2, smoothstep(0.25, 0.6, normalizedRadius));
      color = mix(color, uColorMid1, smoothstep(0.55, 0.85, normalizedRadius));
      color = mix(color, uColorHot, smoothstep(0.8, 0.98, normalizedRadius));
      color *= (0.4 + noiseVal * 1.3);
      float brightness = pow(1.0 - normalizedRadius, 1.2) * 4.0 + 0.3;
      brightness *= (0.4 + noiseVal * 2.5);
      vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
      vec3 diskTangent = normalize(cross(vec3(0.0, 1.0, 0.0), vWorldPosition));
      float doppler = dot(viewDir, diskTangent);
      brightness *= (1.0 + doppler * 0.6);
      color = mix(color, color * vec3(1.1, 1.05, 1.0), smoothstep(0.0, 0.5, doppler)); 
      color = mix(color, color * vec3(1.0, 0.9, 0.8), smoothstep(0.0, -0.5, doppler)); 
      float pulse = sin(uTime * 2.0 + normalizedRadius * 15.0 + vAngle * 3.0) * 0.1 + 0.9;
      brightness *= pulse;
      float alpha = uDensity * (0.1 + noiseVal * 0.9);
      alpha *= smoothstep(0.0, 0.08, normalizedRadius);
      alpha *= (1.0 - smoothstep(0.9, 1.0, normalizedRadius));
      alpha = clamp(alpha, 0.0, 1.0);
      gl_FragColor = vec4(color * brightness, alpha);
    }
  `
};

const HorizonShader = {
  vertex: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragment: `
    uniform float uTime;
    uniform vec3 uCameraPosition;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vec3 viewDirection = normalize(uCameraPosition - vPosition);
      float fresnel = 1.0 - abs(dot(vNormal, viewDirection));
      fresnel = pow(fresnel, 4.0);
      vec3 glowColor = vec3(1.0, 0.7, 0.4);
      float pulse = sin(uTime * 2.0) * 0.1 + 0.9;
      float noise = sin(vPosition.x * 10.0 + uTime) * sin(vPosition.y * 10.0 - uTime) * 0.1;
      gl_FragColor = vec4(glowColor * (fresnel + noise) * pulse * 1.5, fresnel * 0.8);
    }
  `
};

/* --- FACTORIES --- */
class TextureFactory {
  // Existing Solar System Textures
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
      const scale = 0.02;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let n = noiseGen.noise(x * scale * 0.2, y * scale);
          n += 0.5 * noiseGen.noise(x * scale, y * scale * 5.0);
          const distY = y + n * 50;
          const band = Math.sin(distY * 0.05);
          const t = (band + 1) / 2;
          const idx = (y * size + x) * 4;
          data[idx] = col1[0] * t + col2[0] * (1 - t);
          data[idx + 1] = col1[1] * t + col2[1] * (1 - t);
          data[idx + 2] = col1[2] * t + col2[2] * (1 - t);
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 20; i++) {
        const y = Math.random() * size;
        const h = Math.random() * size * 0.1;
        ctx.fillRect(0, y, size, h);
      }
    } else if (type === 'rocky') {
      const scale = 0.015;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let n = noiseGen.noise(x * scale, y * scale);
          n += 0.5 * noiseGen.noise(x * scale * 4, y * scale * 4);
          const v = Math.abs(n);
          const t = Math.min(1, Math.max(0, v));
          const idx = (y * size + x) * 4;
          data[idx] = col1[0] * t + col2[0] * (1 - t);
          data[idx + 1] = col1[1] * t + col2[1] * (1 - t);
          data[idx + 2] = col1[2] * t + col2[2] * (1 - t);
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
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
      const scale = 0.02;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let n = noiseGen.noise(x * scale, y * scale);
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
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    } else if (type === 'glow') {
      ctx.clearRect(0, 0, size, size);
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, c1);
      g.addColorStop(0.4, c2);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    }
    return new THREE.CanvasTexture(canvas);
  }

  // Galaxy Textures
  static getGlowTexture() {
    if (this._glowTex) return this._glowTex;
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    grad.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    this._glowTex = new THREE.CanvasTexture(canvas);
    return this._glowTex;
  }

  static getStarTexture() {
    if (this._starTex) return this._starTex;
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    this._starTex = new THREE.CanvasTexture(canvas);
    return this._starTex;
  }
}

/* --- CLASSES --- */
class GargantuaBlackHole {
  constructor(scene, pos, scale) {
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.group.scale.set(scale, scale, scale);
    scene.add(this.group);

    const BLACK_HOLE_RADIUS = 1.3;
    const DISK_INNER_RADIUS = BLACK_HOLE_RADIUS + 0.1;
    const DISK_OUTER_RADIUS = 7.0;

    const bhGeo = new THREE.SphereGeometry(BLACK_HOLE_RADIUS, 64, 64);
    const bhMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.core = new THREE.Mesh(bhGeo, bhMat);
    this.group.add(this.core);

    const ehGeo = new THREE.SphereGeometry(BLACK_HOLE_RADIUS * 1.02, 64, 64);
    this.ehMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCameraPosition: { value: new THREE.Vector3() }
      },
      vertexShader: HorizonShader.vertex,
      fragmentShader: HorizonShader.fragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false
    });
    const ehMesh = new THREE.Mesh(ehGeo, this.ehMat);
    this.group.add(ehMesh);

    const diskGeo = new THREE.RingGeometry(DISK_INNER_RADIUS, DISK_OUTER_RADIUS, 128, 64);
    this.diskMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0.0 },
        uColorHot: { value: new THREE.Color(0xffffff) },
        uColorMid1: { value: new THREE.Color(0xffd700) },
        uColorMid2: { value: new THREE.Color(0xff8c00) },
        uColorMid3: { value: new THREE.Color(0x8b0000) },
        uColorOuter: { value: new THREE.Color(0x483d8b) },
        uNoiseScale: { value: 4.0 },
        uFlowSpeed: { value: 0.3 },
        uDensity: { value: 1.5 },
        uCameraPosition: { value: new THREE.Vector3() }
      },
      vertexShader: DiskShader.vertex,
      fragmentShader: DiskShader.fragment,

      // IMPORTANT FIXES
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,   // 🔥 ADD THIS LINE
      blending: THREE.AdditiveBlending
    });

    this.disk = new THREE.Mesh(diskGeo, this.diskMat);
    this.disk.rotation.x = Math.PI / 3.5;
    this.group.add(this.disk);
  }

  animate(time, cameraPos) {
    const localCam = cameraPos.clone();
    this.group.worldToLocal(localCam);
    this.diskMat.uniforms.uTime.value = time;
    this.diskMat.uniforms.uCameraPosition.value.copy(localCam);
    this.ehMat.uniforms.uTime.value = time;
    this.ehMat.uniforms.uCameraPosition.value.copy(localCam);
    this.disk.rotation.z -= 0.005;
  }
}

class Galaxy {
  constructor(scene, config = {}) {
    const particles = config.starCount || CONFIG.starCount;
    const radius = config.radius || CONFIG.galaxyScale;
    const position = config.position || new THREE.Vector3(0, 0, 0);
    const rotation = config.rotation || new THREE.Euler(0, 0, 0);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particles * 3);
    const colors = new Float32Array(particles * 3);

    const colorCore = config.colorCore || new THREE.Color(0xffeebb);
    const colorArmBlue = config.colorArmBlue || new THREE.Color(0xaaccff);
    const colorArmPink = config.colorArmPink || new THREE.Color(0xff55aa);
    const colorDust = config.colorDust || new THREE.Color(0x884444);

    const arms = config.arms || 5;
    const armWinding = config.winding || 2.5;

    for (let i = 0; i < particles; i++) {
      const i3 = i * 3;
      let r;
      const rand = Math.random();
      let isRingParticle = false;
      let isFillParticle = false;

      if (config.hasRing && rand > 0.85) {
        r = radius * 0.3 + (Math.random() - 0.5) * radius * 0.05;
        isRingParticle = true;
      } else {
        r = Math.pow(Math.random(), 0.7) * radius;
        if (Math.random() > 0.5) {
          isFillParticle = true;
        }
      }

      const angleOffset = armWinding * Math.log(r / 3000.0);
      let finalAngle;

      if (isFillParticle) {
        finalAngle = Math.random() * Math.PI * 2;
      } else {
        const armIndex = i % arms;
        const branchAngle = (armIndex / arms) * Math.PI * 2;
        finalAngle = branchAngle + angleOffset;
      }

      const spread = (r / radius) * 6000 + 1000;
      const randomX = (Math.random() - 0.5) * spread;
      const randomZ = (Math.random() - 0.5) * spread;
      const noiseAmp = r * 0.1;
      const noiseX = (Math.random() - 0.5) * noiseAmp;
      const noiseZ = (Math.random() - 0.5) * noiseAmp;

      const x = r * Math.cos(finalAngle) + randomX + noiseX;
      const z = r * Math.sin(finalAngle) + randomZ + noiseZ;
      const thickness = (config.bulgeSize || 2500) * Math.exp(-r / (radius * 0.25)) + 300;
      const y = (Math.random() - 0.5) * thickness;

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      const color = new THREE.Color();
      if (isRingParticle) {
        if (Math.random() > 0.3) color.setHex(0xaa44ff);
        else color.setHex(0xff0066);
      } else if (r < radius * 0.1) {
        color.copy(colorCore);
      } else if (isFillParticle) {
        if (Math.random() > 0.6) color.copy(colorCore);
        else color.copy(colorArmBlue).multiplyScalar(0.8);
      } else {
        const randC = Math.random();
        if (randC > 0.4) color.copy(colorArmBlue);
        else if (randC > 0.2) color.copy(colorDust);
        else color.copy(colorArmPink);
      }

      color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: config.starSize || 150,
      sizeAttenuation: true,
      depthWrite: false,
      vertexColors: true,
      map: TextureFactory.getStarTexture(),
      transparent: true,
      opacity: 0.8,
      onBeforeCompile: (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
          'gl_PointSize = size;',
          `
        // clamp so stars don't grow into rectangles
        gl_PointSize = clamp(size, 0.0, 8.0);
      `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
          `
        // fade stars within ±100 units of solar system plane (y=0)
        float fade = smoothstep(0.0, 100.0, abs(position.y));
        gl_FragColor = vec4(outgoingLight, diffuseColor.a * fade);
      `
        );
      }
    });


    this.mesh = new THREE.Points(geometry, material);
    this.mesh.position.copy(position);
    this.mesh.rotation.copy(rotation);
    scene.add(this.mesh);

    this.spriteMat = new THREE.SpriteMaterial({
      map: TextureFactory.getGlowTexture(),
      color: config.glowColor || 0xffaa55,
      blending: THREE.AdditiveBlending,
      opacity: config.glowOpacity || 0.4,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(this.spriteMat);
    sprite.scale.set(radius * 0.4, radius * 0.25, 1);
    this.mesh.add(sprite);
  }
}

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

  // --- GEMINI API INTEGRATION ---
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

    const prompt = `You are Nexus, a knowledgeable and slightly poetic AI assistant on a spaceship traveling through the Milky Way. Answer the following question concisely (max 50 words) and scientifically: "${userMsg}". Context: We are in the Orion Spur, looking towards Sagittarius A*.`;

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

    scene.add(sunGlow);

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

    // 8. Post Processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.15;
    bloomPass.strength = 1.0;
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

        // Move camera with the system
        const delta = new THREE.Vector3().subVectors(solarSystemContainerRef.current.position, oldPos);
        camera.position.add(delta);
        controls.target.copy(solarSystemContainerRef.current.position);

        // Local Solar System Physics
        bodiesRef.current.forEach(b => {
          if (b.pivot) {
            b.pivot.rotation.y += b.speed * 0.5;
            b.mesh.rotation.y += 0.005;
          }
        });

        if (asteroidsRef.current) asteroidsRef.current.rotation.y += 0.0005;

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

      controls.update();
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
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-black/60 backdrop-blur-xl px-8 py-4 rounded-full border border-white/10 shadow-2xl z-10 w-[90%] md:w-auto justify-center max-w-2xl">
        <button
          onClick={() => setPaused(!paused)}
          className={`flex items-center gap-2 px-5 py-2 rounded-full text-[10px] font-bold tracking-widest transition-all shadow-lg border ${paused ? 'bg-amber-500 border-amber-400 text-black hover:bg-amber-400' : 'bg-white/5 border-white/20 text-white hover:bg-cyan-500 hover:text-black hover:border-cyan-400'}`}
        >
          {paused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
          {paused ? "RESUME" : "PAUSE"}
        </button>

        <button
          onClick={jumpToSolarSystem}
          className="p-2.5 rounded-full bg-white/5 border border-white/20 hover:bg-white/20 text-gray-300 hover:text-white transition-all flex items-center gap-2"
          title="Solar System"
        >
          <RotateCcw size={14} />
          <span className="text-[10px] hidden md:inline">SOLAR SYSTEM</span>
        </button>

        <button
          onClick={jumpToSagittarius}
          className="p-2.5 rounded-full bg-white/5 border border-white/20 hover:bg-white/20 text-gray-300 hover:text-white transition-all flex items-center gap-2"
          title="Sagittarius A*"
        >
          <MapPin size={14} />
          <span className="text-[10px] hidden md:inline">SAGITTARIUS</span>
        </button>

        <button
          onClick={jumpToGalaxy}
          className="p-2.5 rounded-full bg-white/5 border border-white/20 hover:bg-white/20 text-gray-300 hover:text-white transition-all flex items-center gap-2"
          title="Milky Way Galaxy"
        >
          <Sparkles size={14} />
          <span className="text-[10px] hidden md:inline">MILKY WAY</span>
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