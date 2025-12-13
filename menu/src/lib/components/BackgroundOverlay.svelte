<script lang="ts">
    import type EventEmitter from "events";
    import * as THREE from "three";
    import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";

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
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
        gridMesh.receiveShadow = true;
        scene.add(gridMesh);

        // Lights for the model
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 500;
        scene.add(ambientLight, dirLight);

        // Model handling
        let modelGroup: THREE.Object3D | null = null;
        const objLoader = new OBJLoader();

        // Try to load /model_0.obj from server root
        objLoader.load(
            "/model_0.obj",
            (obj) => {
                // Basic scaling & placement — tweak these values if your model is huge/tiny
                const modelScale = 0.25;
                obj.scale.set(modelScale, modelScale, modelScale);

                // Place model above the grid
                obj.position.set(0, 4, 10); // y = 2 units above the grid; adjust as needed
                obj.rotation.set(Math.PI * 0.125, 0, 0); // Rotate to face camera
                obj.updateMatrixWorld(true);

                const axis = new THREE.Vector3(0, 1, 0);
                const q = new THREE.Quaternion();

                setInterval(() => {
                    if (obj) {
                        q.setFromAxisAngle(axis, 0.01);
                        obj.quaternion.premultiply(q);
                    }
                }, 16);

                // Ensure meshes cast/receive shadows and have a standard material if none present
                obj.traverse((child: any) => {
                    if (child.isMesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;

                        const wireMat = new THREE.MeshStandardMaterial({
                            color: 0xfacc15,
                            wireframe: true,
                            metalness: 0.0,
                            roughness: 0.3,
                        });

                        child.material = wireMat;
                    }
                });

                modelGroup = obj;
                scene.add(obj);
            },
            (xhr) => {
                // progress handler (optional)
                // console.log(`Model ${ (xhr.loaded / xhr.total) * 100 }% loaded`);
            },
            (err) => {
                console.error("Failed to load /model_0.obj", err);
            },
        );

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

            // remove and dispose model if present
            if (modelGroup) {
                scene.remove(modelGroup);
                modelGroup.traverse((child: any) => {
                    if (child.isMesh) {
                        if (child.geometry) {
                            child.geometry.dispose();
                        }
                        if (child.material) {
                            // dispose material and any textures
                            const mat = child.material;
                            if (Array.isArray(mat)) {
                                mat.forEach((m) => {
                                    if (m.map) m.map.dispose();
                                    m.dispose();
                                });
                            } else {
                                if (mat.map) mat.map.dispose();
                                mat.dispose();
                            }
                        }
                    }
                });
                modelGroup = null;
            }

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
