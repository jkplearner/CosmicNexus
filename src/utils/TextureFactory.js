import * as THREE from 'three';
import { noiseGen } from './SimplexNoise';
import CONFIG from '../config';

class TextureFactory {
    static create(type, c1, c2) {
        const size = CONFIG.textureSize;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(size, size);
        const data = imgData.data;

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

export default TextureFactory;
