import * as THREE from 'three';

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

export default LensingShader;
