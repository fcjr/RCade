<script lang="ts">
    import type EventEmitter from "events";
    import * as THREE from "three";
    import { SCREENSAVER } from "@rcade/plugin-sleep";

    let { events }: { events: EventEmitter } = $props();

    let container: HTMLElement | null = null;

    const GLIDE_DURATION_MS = 150;
    const CAMERA_MOVE_STEP = 2.0;

    let targetCameraX = 0;
    let currentAnimationId: number | null = null;

    const initialLookAtTarget = new THREE.Vector3(0, -10, -50);

    function lerp(start: number, end: number, t: number): number {
        return start * (1 - t) + end * t;
    }

    let screensaverActive = false;

    SCREENSAVER.addEventListener("started", () => {
        screensaverActive = true;
    });

    SCREENSAVER.addEventListener("stopped", () => {
        screensaverActive = false;
    });

    $effect(() => {
        if (!container) return;

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
        camera.lookAt(initialLookAtTarget);

        targetCameraX = camera.position.x;

        const renderer = new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: "high-performance",
            alpha: true,
        });
        renderer.setSize(canvasWidth, canvasHeight);
        renderer.setPixelRatio(1);
        renderer.setClearColor(0x000000, 0);
        container.appendChild(renderer.domElement);

        // Enhanced Grid with sharper lines
        const gridGeometry = new THREE.PlaneGeometry(1000, 1000);
        const gridMaterial = new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            uniforms: {
                uBaseColor: { value: new THREE.Color(0xfacc15) },
                uGlowColor: { value: new THREE.Color(0xfde047) },
                uSize: { value: 10.0 },
                uTime: { value: 0.0 },
                uFadeDistance: { value: 150.0 },
                uCameraPos: { value: new THREE.Vector3() },
                uOpacity: { value: 0.7 },
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
                    float speed = 1.2;
                    vec2 movedPos = vec2(vWorldPosition.x, vWorldPosition.z - (uTime * speed));

                    vec2 grid = movedPos / uSize;
                    vec2 gridDeriv = fwidth(grid);
                    vec2 gridDist = abs(fract(grid - 0.5) - 0.5);
                    vec2 pixelDist = gridDist / gridDeriv;
                    float line = step(min(pixelDist.x, pixelDist.y), 0.8);
                    
                    float distToCamera = distance(vWorldPosition.xz, uCameraPos.xz);
                    float glowRadius = 60.0;
                    float glowIntensity = 1.0 - smoothstep(0.0, glowRadius, distToCamera);
                    glowIntensity = pow(glowIntensity, 2.0);
                    vec3 finalColor = mix(uBaseColor, uGlowColor, glowIntensity * 0.7);

                    float fade = 1.0 - smoothstep(0.0, uFadeDistance, distToCamera);
                    float finalOpacity = (uOpacity + (glowIntensity * 1.5)) * fade;
                    
                    // Add bloom/glow effect
                    float bloomIntensity = glowIntensity * 0.5;
                    
                    if (line < 0.5) discard;
                    gl_FragColor = vec4(finalColor * (1.0 + bloomIntensity), finalOpacity);
                }
            `,
        });
        const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
        gridMesh.rotation.x = -Math.PI / 2;
        scene.add(gridMesh);

        // Camera glide animation
        let glideStartTime: number;
        let startCameraX: number;

        const glideCamera = (timestamp: number) => {
            if (!glideStartTime) {
                glideStartTime = timestamp;
                startCameraX = camera.position.x;
            }

            const elapsed = timestamp - glideStartTime;
            let t = elapsed / GLIDE_DURATION_MS;
            t = 1 - Math.pow(1 - t, 3);

            if (elapsed < GLIDE_DURATION_MS) {
                camera.position.x = lerp(startCameraX, targetCameraX, t);
                renderer.render(scene, camera);
                currentAnimationId = requestAnimationFrame(glideCamera);
            } else {
                camera.position.x = targetCameraX;
                renderer.render(scene, camera);
                currentAnimationId = null;
            }
        };

        // Main animation loop
        const clock = new THREE.Clock();
        let animationId: number;

        const animate = () => {
            animationId = requestAnimationFrame(animate);

            const elapsedTime = clock.getElapsedTime();

            if (screensaverActive) {
                gridMaterial.uniforms.uOpacity.value = 0.4;
                gridMaterial.uniforms.uGlowColor.value = new THREE.Color(
                    0xfacc15,
                );
                camera.position.x += 0.002;
            } else {
                gridMaterial.uniforms.uOpacity.value = 0.7;
            }

            gridMaterial.uniforms.uCameraPos.value.copy(camera.position);
            gridMaterial.uniforms.uTime.value = elapsedTime;

            if (currentAnimationId === null) {
                renderer.render(scene, camera);
            }
        };

        animate();

        const onResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener("resize", onResize);

        const handleMove = (isLeft: boolean) => {
            const moveDirection = isLeft ? -1 : 1;
            const newTargetX =
                camera.position.x + moveDirection * CAMERA_MOVE_STEP;
            targetCameraX = newTargetX;

            if (currentAnimationId) {
                cancelAnimationFrame(currentAnimationId);
            }

            glideStartTime = 0;
            currentAnimationId = requestAnimationFrame(glideCamera);
        };

        events.on("move", handleMove);

        return () => {
            window.removeEventListener("resize", onResize);
            cancelAnimationFrame(animationId);
            if (currentAnimationId) cancelAnimationFrame(currentAnimationId);

            events.off("move", handleMove);

            gridGeometry.dispose();
            gridMaterial.dispose();
            renderer.dispose();

            if (renderer.domElement && container) {
                container.removeChild(renderer.domElement);
            }
        };
    });
</script>

<div bind:this={container} class="canvas-wrapper"></div>

<style>
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
