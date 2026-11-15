import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface OrbSignal {
  person_present?: boolean;
  status?: 'booting' | 'observing' | 'cloning';
  face?: { blink?: number; mouth_open?: number; yaw?: number; pitch?: number; roll?: number };
  body?: { gesture?: string[]; posture?: string };
  voice?: { speaking?: boolean; energy?: number; f0?: number };
  emotion?: string;
}

/**
 * Real-time glowing orb. Renders a layered sphere with a particle corona
 * and reacts to signals streamed from the Python sensing bridge over
 * WebSocket:
 *   - mouth_open / voice energy  -> core pulse + scale
 *   - blink                      -> brief dim
 *   - head yaw/pitch/roll        -> orb rotation
 *   - emotion                    -> hue shift
 */
export function Orb() {
  const mountRef = useRef<HTMLDivElement>(null);
  const signalRef = useRef<OrbSignal>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 5;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    // --- Core orb (layered for glow feel) ---
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshStandardMaterial({
        color: 0x22ccff,
        emissive: 0x1188ff,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.1,
      }),
    );
    scene.add(core);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0x22ccff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    scene.add(glow);

    // --- Particle corona ---
    const nParticles = 1500;
    const positions = new Float32Array(nParticles * 3);
    for (let i = 0; i < nParticles; i++) {
      const r = 1.4 + Math.random() * 1.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({
        color: 0x88ddff,
        size: 0.02,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    scene.add(particles);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(2, 2, 3);
    scene.add(dirLight);

    // --- Resize ---
    const resize = () => {
      const w = mount.clientWidth || 400;
      const h = mount.clientHeight || 400;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // --- Signal smoothing ---
    const state = {
      pulse: 0, blinkDim: 0, hue: 0.55, speed: 0.15,
      wake: 0, // 0 dormant -> 1 active (lights up on person detected)
      t0: performance.now(),
    };

    const animate = () => {
      requestAnimationFrame(animate);
      const s = signalRef.current;
      const personPresent = s.person_present ?? false;
      const t = (performance.now() - state.t0) / 1000;
      const mouth = s.face?.mouth_open ?? 0;
      const energy = s.voice?.energy ?? 0;
      const speaking = s.voice?.speaking ?? false;
      const blink = s.face?.blink ?? 0.5;

      // Boot / wake animation: lights up when person appears
      const targetWake = personPresent ? 1 : 0;
      state.wake += (targetWake - state.wake) * 0.08;
      const wake = state.wake;
      // Idle drift when dormant: slow breathing glow
      const idle = 0.15 + 0.05 * Math.sin(t * 1.5);
      // Observing = steady scan pulse; cloning = energetic pulse
      const scanPulse = s.status === 'observing'
        ? 0.25 + 0.15 * Math.sin(t * 3)
        : s.status === 'cloning' ? 0.5 + 0.3 * Math.sin(t * 6) : 0;

      // Pulse from speech/voice energy
      const targetPulse = speaking || energy > 0.01 ? 1 : 0;
      state.pulse += (targetPulse - state.pulse) * 0.15;
      const pulse = state.pulse;

      // Dim on blink (blink low = closed)
      const targetDim = blink < 0.2 ? 0.4 : 1;
      state.blinkDim += (targetDim - state.blinkDim) * 0.4;

      // Head pose -> rotation
      const yaw = s.face?.yaw ?? 0;
      const pitch = s.face?.pitch ?? 0;
      const roll = s.face?.roll ?? 0;
      core.rotation.y += ((yaw * 0.01) - core.rotation.y) * 0.2;
      core.rotation.x += ((-pitch * 0.01) - core.rotation.x) * 0.2;
      core.rotation.z += ((roll * 0.01) - core.rotation.z) * 0.2;
      glow.rotation.copy(core.rotation);
      particles.rotation.y += 0.002;

      // Emotion -> hue
      const emotionHue: Record<string, number> = {
        neutral: 0.55, happy: 0.12, sad: 0.65, angry: 0.0,
        surprised: 0.85, fearful: 0.75, disgusted: 0.25,
      };
      const targetHue = emotionHue[s.emotion ?? 'neutral'] ?? 0.55;
      state.hue += (targetHue - state.hue) * 0.1;

      // Scale from pulse + wake (dormant = shrunk, low light)
      const wakeScale = 0.35 + 0.65 * wake;
      const scale = wakeScale * (1 + pulse * 0.15);
      core.scale.setScalar(scale);
      glow.scale.setScalar(scale * 1.05);
      particles.scale.setScalar(scale * (1 + pulse * 0.2));

      // Apply color
      const color = new THREE.Color().setHSL(state.hue, 0.8, 0.6);
      (core.material as THREE.MeshStandardMaterial).emissive.set(color);
      (core.material as THREE.MeshStandardMaterial).color.set(color);
      (glow.material as THREE.MeshBasicMaterial).color.set(color);
      (particles.material as THREE.PointsMaterial).color.set(color);

      // Blink dim on emissive intensity; wake raises it, idle breathes
      const base = 0.8 * wake + idle * (1 - wake) + pulse * 1.2 + scanPulse;
      (core.material as THREE.MeshStandardMaterial).emissiveIntensity =
        base - (1 - state.blinkDim);
      (particles.material as THREE.PointsMaterial).opacity =
        0.7 * wake + idle * (1 - wake) + scanPulse * 0.3;

      renderer.render(scene, camera);
    };
    animate();

    // --- WebSocket to Python bridge ---
    const connect = () => {
      const ws = new WebSocket('ws://localhost:8765');
      ws.onmessage = (e) => {
        try {
          signalRef.current = JSON.parse(e.data);
        } catch { /* ignore malformed */ }
      };
      ws.onclose = () => {
        setTimeout(connect, 2000);
      };
      wsRef.current = ws;
    };
    connect();

    return () => {
      ro.disconnect();
      renderer.dispose();
      wsRef.current?.close();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100vh' }} />;
}
