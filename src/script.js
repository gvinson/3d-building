import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader";
import * as dat from 'dat.gui'
import {TransformControls} from "three/examples/jsm/controls/TransformControls";

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
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.set(-10, 1.44, -16);
scene.add(camera);
const cameraFolder = gui.addFolder('Camera');
cameraFolder.add(camera.position, 'x').min(-100).max(100).step(0.01);
cameraFolder.add(camera.position, 'y').min(-100).max(100).step(0.01);
cameraFolder.add(camera.position, 'z').min(-100).max(100).step(0.01);
const cameraSplinePoints = [];
let cameraSpline = null;

/**
 * Controls
 */
const controls = new OrbitControls(camera, canvas);
controls.maxPolarAngle = Math.PI / 2; // down
controls.minPolarAngle = Math.PI / 3;  // up

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
 * Raycaster
*/
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let currentIntersect = null;
const interactables = [];

/**
 * Models
 */
gltfLoader.load('/models/model-with-spline2.glb',
    (gltf) => {
        scene.add(gltf.scene);

        scene.traverse((child) => {
            if (child.name.includes('Spline_Point')) {
                cameraSplinePoints.push(child.position);
            } else if (child.name.includes('MacBook') || child.name.includes('iMac')) {
                child.children.forEach((child2) => {
                    interactables.push(child2);
                })
            }
        });

        cameraSpline = new THREE.CatmullRomCurve3(cameraSplinePoints);
        cameraSpline.arcLengthDivisions = 10;

        updateAllMaterials();

        tick();
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

/**
 * Mouse event listener
 */
let didClick = false;
window.addEventListener('click', (e) => {
    console.dir(currentIntersect);
    console.dir(interactables);
    // normalize x from -1 to 1 - left -> right
    mouse.x = ( e.clientX / sizes.width ) * 2 - 1;
    // normalize y - need to invert because we want +1 at top of screen, -1 at bottom
    mouse.y = -(e.clientY / sizes.height * 2 - 1);

    didClick = true;
});

/**
 * Spline movement listener
 */
let cameraSplinePositionIndex = 0;
let stepsInteger = 50;
// Every scroll, increment a number
canvas.addEventListener('wheel', (e) => {
    const index = -Math.sign(e.deltaY) * 0.1;

    if (cameraSplinePositionIndex + index > stepsInteger || cameraSplinePositionIndex + index < 0) {
        cameraSplinePositionIndex = 0;
    } else {
        cameraSplinePositionIndex += index;
    }
});

/**
 * Animate
 */
let firstRender = true;
const tick = () => {
    // Update camera around spline
    if (camera && cameraSplinePoints.length > 0 && cameraSpline) {
        // get next point on spline
        const equalDistanceValue = cameraSpline.getUtoTmapping(cameraSplinePositionIndex / stepsInteger);
        const camPos = cameraSpline.getPoint(equalDistanceValue);

        if (firstRender) {
            // set camera to first position on first render
            camera.position.copy(cameraSplinePoints[0]);
        } else {
            // move control target to move camera position
            // we do it this way instead of setting camera.position so we can maintain the orbit controls rotations/pans
            controls.target.set(camPos.x, camPos.y, camPos.z);
        }
    }

    // Update controls
    controls.update();

    // Raycaster Test
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactables);
    for(const intersect of intersects) {
        if (didClick) {
            alert(intersect.object.parent.name);
            didClick = false;
        }
    }

    // Render
    renderer.render(scene, camera)

    firstRender = false;

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}


