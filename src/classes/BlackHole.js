import * as THREE from 'three';
import { DiskShader, HorizonShader } from '../shaders/DiskShader';

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
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false,
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

export default GargantuaBlackHole;
