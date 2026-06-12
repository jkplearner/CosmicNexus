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

export { DiskShader, HorizonShader };
