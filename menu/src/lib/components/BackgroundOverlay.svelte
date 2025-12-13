<script lang="ts">
    import type EventEmitter from "events";
    import * as THREE from "three";

    let { events }: { events: EventEmitter } = $props();

    let container: HTMLElement | null = null; // Camera glide animation state

    const GLIDE_DURATION_MS = 150;
    const CAMERA_MOVE_STEP = 2.0; // The fixed distance the camera should move per event

    let targetCameraX = 0;
    let currentAnimationId: number | null = null; // Fixed lookAt target is only used once in setup, but defined here for context

    const initialLookAtTarget = new THREE.Vector3(0, -10, -50); /**
     * @param start The starting value (e.g., camera.position.x)
     * @param end The target value (targetCameraX)
     * @param t The interpolation factor (0.0 to 1.0)
     * @returns The interpolated value
     */

    function lerp(start: number, end: number, t: number): number {
        return start * (1 - t) + end * t;
    } // --- THREE.JS SETUP EFFECT ---

    $effect(() => {
        if (!container) return; // 1. Setup Scene

        const scene = new THREE.Scene();
        scene.background = null;
        const canvasWidth = 336;
        const canvasHeight = 262;

        const camera = new THREE.PerspectiveCamera(
            45,
            canvasWidth / canvasHeight,
            0.1,
            1000,
        );
        camera.position.set(0, 5, 20);
        camera.lookAt(initialLookAtTarget); // Set the initial angle once
        // Initialize targetCameraX to current camera position

        targetCameraX = camera.position.x; // 2. Setup Renderer (Omitted Three.js setup for brevity)

        const renderer = new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: "high-performance",
            alpha: true,
        });
        renderer.setSize(canvasWidth, canvasHeight);
        renderer.setPixelRatio(1);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement); // --- GRID SETUP (Omitted) ---

        const gridGeometry = new THREE.PlaneGeometry(1000, 1000);
        const gridMaterial = new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            uniforms: {
                uBaseColor: { value: new THREE.Color(0xfacc15) },
                uGlowColor: { value: new THREE.Color(0xfacc15) },
                uSize: { value: 10.0 },
                uTime: { value: 0.0 },
                uFadeDistance: { value: 150.0 },
                uCameraPos: { value: new THREE.Vector3() },
                uOpacity: { value: 0.15 },
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vWorldPosition;
                uniform vec3 uBaseColor;
                uniform vec3 uGlowColor;
                uniform float uSize;
                uniform float uTime;
                uniform float uFadeDistance;
                uniform vec3 uCameraPos;
                uniform float uOpacity;

                void main() {
                    float speed = 1.0;
                    vec2 movedPos = vec2(vWorldPosition.x, vWorldPosition.z - (uTime * speed));

                    vec2 grid = movedPos / uSize;
                    vec2 gridDeriv = fwidth(grid);
                    vec2 gridDist = abs(fract(grid - 0.5) - 0.5);
                    vec2 pixelDist = gridDist / gridDeriv;
                    float line = step(min(pixelDist.x, pixelDist.y), 1.00);
                    
                    float distToCamera = distance(vWorldPosition.xz, uCameraPos.xz);
                    float glowRadius = 50.0;
                    float glowIntensity = 1.0 - smoothstep(0.0, glowRadius, distToCamera);
                    vec3 finalColor = mix(uBaseColor, uGlowColor, glowIntensity);

                    float fade = 1.0 - smoothstep(0.0, uFadeDistance, distToCamera);
                    float finalOpacity = (uOpacity + (glowIntensity * 0.5)) * fade;
                    
                    if (line < 0.5) discard;
                    gl_FragColor = vec4(finalColor, finalOpacity);
                }
            `,
        });
        const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
        gridMesh.rotation.x = -Math.PI / 2;
        scene.add(gridMesh); // --- PARTICLES SETUP (Omitted) ---

        const particlesCount = 500;
        const particlesGeometry = new THREE.BufferGeometry();
        const posArray = new Float32Array(particlesCount * 3);
        const randomArray = new Float32Array(particlesCount);
        for (let i = 0; i < particlesCount; i++) {
            posArray[i * 3 + 0] = (Math.random() - 0.5) * 300;
            posArray[i * 3 + 1] = Math.random() * 50;
            posArray[i * 3 + 2] = (Math.random() - 0.5) * 300;
            randomArray[i] = Math.random();
        }
        particlesGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(posArray, 3),
        );
        particlesGeometry.setAttribute(
            "aRandom",
            new THREE.BufferAttribute(randomArray, 1),
        );
        const particlesMaterial = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(0xffffff) },
                uFadeDistance: { value: 150.0 },
                uCameraPos: { value: new THREE.Vector3() },
            },
            vertexShader: `
                uniform float uTime;
                uniform float uFadeDistance;
                attribute float aRandom;
                varying float vAlpha;
                
                void main() {
                    vec3 pos = position;
                    float speed = 10.0;
                    float rangeZ = 300.0;
                    pos.z = mod(position.z + (uTime * speed), rangeZ) - (rangeZ * 0.5);
                    pos.y += sin(uTime * 2.0 + aRandom * 10.0) * 0.5;

                    vec4 mvPosition = viewMatrix * modelMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = (8.0 * aRandom + 8.0) * (20.0 / -mvPosition.z);

                    float dist = distance(pos.xz, vec2(0.0, 0.0)); 
                    vAlpha = 1.0 - smoothstep(uFadeDistance * 0.5, uFadeDistance, dist);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                varying float vAlpha;

                void main() {
                    float r = distance(gl_PointCoord, vec2(0.5));
                    if (r > 0.5) discard;
                    float glow = 1.0 - (r * 2.0);
                    glow = pow(glow, 1.5); 
                    gl_FragColor = vec4(uColor, glow * vAlpha);
                }
            `,
        });
        const particlesMesh = new THREE.Points(
            particlesGeometry,
            particlesMaterial,
        );
        scene.add(particlesMesh); // --- CAMERA GLIDE FUNCTION ---

        let glideStartTime: number;
        let startCameraX: number;

        const glideCamera = (timestamp: number) => {
            if (!glideStartTime) {
                glideStartTime = timestamp;
                startCameraX = camera.position.x;
            }

            const elapsed = timestamp - glideStartTime;
            let t = elapsed / GLIDE_DURATION_MS;
            t = 1 - Math.pow(1 - t, 3); // Simple ease-out

            if (elapsed < GLIDE_DURATION_MS) {
                // Interpolate camera position
                camera.position.x = lerp(startCameraX, targetCameraX, t);
                renderer.render(scene, camera);
                currentAnimationId = requestAnimationFrame(glideCamera);
            } else {
                // End of animation: ensure the camera is exactly at the target
                camera.position.x = targetCameraX;
                renderer.render(scene, camera);
                currentAnimationId = null;
            }
        }; // --- ANIMATION LOOP ---

        const clock = new THREE.Clock();
        let animationId: number;

        const animate = () => {
            animationId = requestAnimationFrame(animate);

            const elapsedTime = clock.getElapsedTime(); // Update shader uniforms using the camera's current position

            gridMaterial.uniforms.uCameraPos.value.copy(camera.position);
            gridMaterial.uniforms.uTime.value = elapsedTime;

            particlesMaterial.uniforms.uTime.value = elapsedTime;
            particlesMaterial.uniforms.uCameraPos.value.copy(camera.position); // Only render here if no glide animation is currently running

            if (currentAnimationId === null) {
                renderer.render(scene, camera);
            }
        };

        animate(); // --- RESIZE HANDLER (Omitted) ---

        const onResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener("resize", onResize); // --- EVENT LISTENER SETUP ---

        const handleMove = (isLeft: boolean) => {
            const moveDirection = isLeft ? -1 : 1;
            const newTargetX =
                camera.position.x + moveDirection * CAMERA_MOVE_STEP; // Set the new target X position
            // *** MODIFIED LINE: Removed THREE.MathUtils.clamp() ***

            targetCameraX = newTargetX; // If an animation is running, cancel it

            if (currentAnimationId) {
                cancelAnimationFrame(currentAnimationId);
            } // Restart the glide animation

            glideStartTime = 0; // Reset start time
            currentAnimationId = requestAnimationFrame(glideCamera);
        };

        events.on("move", handleMove); // --- CLEANUP FUNCTION ---

        return () => {
            window.removeEventListener("resize", onResize);
            cancelAnimationFrame(animationId);
            if (currentAnimationId) cancelAnimationFrame(currentAnimationId);

            events.off("move", handleMove); // Dispose of Three.js objects

            gridGeometry.dispose();
            gridMaterial.dispose();
            particlesGeometry.dispose();
            particlesMaterial.dispose();
            renderer.dispose();

            if (renderer.domElement && container) {
                container.removeChild(renderer.domElement);
            }
        };
    });
</script>

<div bind:this={container} class="canvas-wrapper"></div>

<style>
    /* Your CSS remains the same */
    .canvas-wrapper {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 10;
        pointer-events: none;
        overflow: hidden;
        image-rendering: pixelated;
    }
</style>
