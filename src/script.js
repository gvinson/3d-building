import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader";
import * as dat from 'dat.gui'

/**
 * Base
 */
// Debug
const gui = new dat.GUI()
const debugObject = {}

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()

/**
 * Loaders
 */
const gltfLoader = new GLTFLoader()

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.set(0,0,0);
scene.add(camera);
const cameraFolder = gui.addFolder('Camera');
cameraFolder.add(camera.position, 'x').min(-100).max(100).step(0.01);
cameraFolder.add(camera.position, 'y').min(-100).max(100).step(0.01);
cameraFolder.add(camera.position, 'z').min(-100).max(100).step(0.01);
const cameraSplinePoints = [];
let cameraSpline = null;

// Controls
const controls = new OrbitControls(camera, canvas)
controls.target.set(0, 0, 0);
// controls.enableDamping = true;   //damping
// controls.dampingFactor = 0.025;
// Limit up/down
// controls.maxPolarAngle = Math.PI / 2.25; // down
// controls.minPolarAngle = Math.PI / 3;  // up
// Limit left/right
// controls.minAzimuthAngle = -Math.PI / 2; // radians
// controls.maxAzimuthAngle = Math.PI / 2; // radians

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
})
renderer.physicallyCorrectLights = true
renderer.outputEncoding = THREE.sRGBEncoding
renderer.toneMapping = THREE.ReinhardToneMapping
renderer.toneMappingExposure = 0.4;
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
gui
    .add(renderer, 'toneMapping', {
        No: THREE.NoToneMapping,
        Linear: THREE.LinearToneMapping,
        Reinhard: THREE.ReinhardToneMapping,
        Cineon: THREE.CineonToneMapping,
        ACESFilmic: THREE.ACESFilmicToneMapping
    })
    .onFinishChange(() =>
    {
        renderer.toneMapping = Number(renderer.toneMapping)
        updateAllMaterials()
    })
gui.add(renderer, 'toneMappingExposure').min(0).max(10).step(0.001)

const pmremGenerator = new THREE.PMREMGenerator( renderer );
pmremGenerator.compileEquirectangularShader();


/**
 * Lights
 */
const topLight = new THREE.DirectionalLight(0xffffff, 27);
topLight.position.set(2, 2.7, -1);
scene.add(topLight);
const topLightFolder = gui.addFolder('Top Light');
topLightFolder.add(topLight.position, 'x').min(-5).max(10);
topLightFolder.add(topLight.position, 'y').min(-5).max(10);
topLightFolder.add(topLight.position, 'z').min(-5).max(10);
topLightFolder.add(topLight, 'intensity').min(0).max(100).step(0.01);

const sideLight = new THREE.RectAreaLight(0xffffff, 4.9, 10, 20);
sideLight.position.set(0, 0, 5);
scene.add(sideLight);
const sideLightFolder = gui.addFolder('Side Light');
sideLightFolder.add(sideLight, 'width').min(0).max(100).step(1);
sideLightFolder.add(sideLight, 'height').min(0).max(100).step(1);
sideLightFolder.add(sideLight.position, 'x').min(-5).max(10);
sideLightFolder.add(sideLight.position, 'y').min(-5).max(10);
sideLightFolder.add(sideLight.position, 'z').min(-5).max(10);
sideLightFolder.add(sideLight, 'intensity').min(0).max(100).step(0.01);

/**
 * Update all materials
 */
const updateAllMaterials = () =>
{
    scene.traverse((child) =>
    {
        if(child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial)
        {
            child.material.envMapIntensity = debugObject.envMapIntensity
            child.material.needsUpdate = true
            child.castShadow = true
            child.receiveShadow = true
        }
    });
}

/**
 * Environment map
 */
const newLoader = new RGBELoader();
let environmentMap = null;
newLoader.load( '/textures/3.hdr', function ( texture ) {
    const envMap = pmremGenerator.fromEquirectangular( texture ).texture;
    scene.environment = envMap;
    texture.dispose();
    pmremGenerator.dispose();
    environmentMap = envMap;
});
debugObject.envMapIntensity = 1.28;
gui.add(debugObject, 'envMapIntensity').min(0).max(10).step(0.001).onChange(updateAllMaterials)

/**
 * Models
 */
gltfLoader.load('/models/model-with-spline.glb',
    (gltf) => {
        scene.add(gltf.scene);

        scene.traverse((child) => {
            if (child.name.includes('Spline_Point')) {
                cameraSplinePoints.push(child.position);
            }
        });

        cameraSpline = new THREE.CatmullRomCurve3(cameraSplinePoints);

        updateAllMaterials();
    },
);

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
});

// Spline movement listener
let camPosIndex = 0;
canvas.addEventListener('wheel', (e) => {
    camPosIndex += -Math.sign(e.deltaY) * 0.1;
    if (camPosIndex < 0) {
        camPosIndex = 0;
    }
});

/**
 * Animate
 */
const tick = () => {

    // Update camera around spline
    if (camera && cameraSplinePoints.length > 0 && cameraSpline) {
        const camPos = cameraSpline.getPoint(camPosIndex / 100);
        const camRot = cameraSpline.getTangent(camPosIndex / 100);

        camera.position.x = camPos.x;
        camera.position.y = camPos.y;
        camera.position.z = camPos.z;

        camera.rotation.x = camRot.x;
        camera.rotation.y = camRot.y;
        camera.rotation.z = camRot.z;

        camera.lookAt(cameraSpline.getPoint((camPosIndex+1) / 100));
    }

    // Update controls
    controls.update()

    // Render
    renderer.render(scene, camera)

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()


