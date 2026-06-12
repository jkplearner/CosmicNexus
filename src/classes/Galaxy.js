import * as THREE from 'three';
import CONFIG from '../config';
import TextureFactory from '../utils/TextureFactory';

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
            size: config.starSize || 300,
            sizeAttenuation: true,
            depthWrite: false,
            vertexColors: true,
            map: TextureFactory.getStarTexture(),
            transparent: true,
            opacity: 1.0,
            onBeforeCompile: (shader) => {
                shader.vertexShader = `
        varying float vY;
        ${shader.vertexShader}
      `.replace(
                    'gl_PointSize = size;',
                    `
        gl_PointSize = clamp(size, 0.0, 8.0);
        vY = position.y;
      `
                );

                shader.fragmentShader = `
        varying float vY;
        ${shader.fragmentShader}
      `.replace(
                    'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
                    `
        float fade = smoothstep(0.0, 100.0, abs(vY));
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
            opacity: config.glowOpacity || 0.85,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(this.spriteMat);
        sprite.scale.set(radius * 0.4, radius * 0.25, 1);
        this.mesh.add(sprite);
    }
}

export default Galaxy;
