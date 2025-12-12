<script lang="ts">
    import * as THREE from "three";

    let container: HTMLElement | null = null;

    // In Svelte 5, $effect runs after the component mounts to the DOM.
    // The return function inside $effect handles cleanup (onDestroy).
    $effect(() => {
        if (!container) return;

        // 1. Setup Scene
        const scene = new THREE.Scene();
        scene.background = null; // Transparent background
        // Fixed canvas dimensions
        const canvasWidth = 336;
        const canvasHeight = 262;

        const camera = new THREE.PerspectiveCamera(
            45,
            canvasWidth / canvasHeight,
            0.1,
            1000,
        );
        camera.position.set(0, 5, 20);
        camera.lookAt(0, -10, -50);

        // 2. Setup Renderer with Alpha
        const renderer = new THREE.WebGLRenderer({
            antialias: false,
            powerPreference: "high-performance",
            alpha: true, // Key for transparency
        });
        renderer.setSize(canvasWidth, canvasHeight);
        renderer.setPixelRatio(1); // Fixed pixel ratio
        renderer.setClearColor(0x000000, 0); // 0 opacity
        container.appendChild(renderer.domElement);

        // --- GRID SETUP ---
        const gridGeometry = new THREE.PlaneGeometry(1000, 1000);
        const gridMaterial = new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            uniforms: {
                uBaseColor: { value: new THREE.Color(0xaaaaaa) },
                uGlowColor: { value: new THREE.Color(0xaaaaaa) },
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
                    float line = step(min(pixelDist.x, pixelDist.y), 0.51);
                    
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
        scene.add(gridMesh);

        // --- PARTICLES SETUP ---
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
                uColor: { value: new THREE.Color(0xaaaaaa) },
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
        scene.add(particlesMesh);

        // --- ANIMATION LOOP ---
        const clock = new THREE.Clock();
        let animationId: number;

        const animate = () => {
            animationId = requestAnimationFrame(animate);

            const elapsedTime = clock.getElapsedTime();

            gridMaterial.uniforms.uCameraPos.value.copy(camera.position);
            gridMaterial.uniforms.uTime.value = elapsedTime;

            particlesMaterial.uniforms.uTime.value = elapsedTime;
            particlesMaterial.uniforms.uCameraPos.value.copy(camera.position);

            renderer.render(scene, camera);
        };

        animate();

        // --- RESIZE HANDLER ---
        const onResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener("resize", onResize);

        // --- CLEANUP FUNCTION ---
        // This runs automatically when the component is unmounted
        return () => {
            window.removeEventListener("resize", onResize);
            cancelAnimationFrame(animationId);

            // Dispose of Three.js objects to prevent memory leaks
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
    .canvas-wrapper {
        position: fixed; /* Fixed to viewport */
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 10; /* Ensure it's above background but below interactive UI */
        pointer-events: none; /* Allows clicking through the canvas */
        overflow: hidden;
    }
</style>
