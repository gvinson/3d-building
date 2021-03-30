import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader";
import * as dat from 'dat.gui';

/**
 * Base
 */
// Debug
const gui = new dat.GUI();
const debugObject = {};

// Canvas
const canvas = document.querySelector('canvas.webgl');

// Scene
const scene = new THREE.Scene();
const textureLoader = new THREE.TextureLoader();
const bgTexture = textureLoader.load('/textures/envMap.jpg');
const lightMap = textureLoader.load('/textures/lightMap.png');
lightMap.flipY = false;
lightMap.generateMipmaps = true;
lightMap.minFilter = THREE.LinearMipMapLinearFilter;
lightMap.magFilter = THREE.NearestFilter;
lightMap.encoding = THREE.sRGBEncoding;
scene.background = bgTexture;
scene.environment = bgTexture;

/**
 * Loaders
 */
const gltfLoader = new GLTFLoader();

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
};

/**
 * Camera
 */
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100);
camera.position.set(-10, 1.44, -16);
scene.add(camera);
const cameraFolder = gui.addFolder('Camera');
cameraFolder.add(camera.position, 'x').min(-100).max(100).step(0.01);
cameraFolder.add(camera.position, 'y').min(-100).max(100).step(0.01);
cameraFolder.add(camera.position, 'z').min(-100).max(100).step(0.01);

const cameraSplinePoints = [];
let cameraSpline = null;
let cameraSplinePositionIndex = 0;
let stepsInteger = 75;

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
});
renderer.physicallyCorrectLights = true;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 0.2;

renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
gui
    .add(renderer, 'toneMapping', {
        No: THREE.NoToneMapping,
        Linear: THREE.LinearToneMapping,
        Reinhard: THREE.ReinhardToneMapping,
        Cineon: THREE.CineonToneMapping,
        ACESFilmic: THREE.ACESFilmicToneMapping
    })
    .onFinishChange(() => {
        renderer.toneMapping = Number(renderer.toneMapping);
        updateAllMaterials()
    });
gui.add(renderer, 'toneMappingExposure').min(0).max(10).step(0.001);

const pmremGenerator = new THREE.PMREMGenerator( renderer );
pmremGenerator.compileEquirectangularShader();


/**
 * Lights
 */
const hemiLight = new THREE.HemisphereLight(0xffeeb1, 0x080820, 0);
const hemiMaxIntensity = 33.5;
scene.add(hemiLight);
const hemiFolder = gui.addFolder('Hemisphere Light');
hemiFolder.add(hemiLight, 'intensity').min(0).max(100).step(0.1);

const mainLight = new THREE.RectAreaLight(0xd3eae7, 0, 50, 100);
const mainLightMaxIntensity = 11;
mainLight.position.set(-5, 9, -16);
scene.add(mainLight);
mainLight.lookAt( 0, -1000, 0 );
const mainLightFolder = gui.addFolder('Entry Light');
mainLightFolder.add(mainLight.position, 'x').min(-100).max(100);
mainLightFolder.add(mainLight.position, 'y').min(-100).max(100);
mainLightFolder.add(mainLight.position, 'z').min(-100).max(100);
mainLightFolder.add(mainLight, 'intensity').min(0).max(100).step(0.01);

/**
 * Update all materials
 */
const updateAllMaterials = () =>
{
    lightMap.anisotropy = renderer.capabilities.getMaxAnisotropy();

    scene.traverse((child) =>
    {
        if(child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial)
        {
            child.material.envMapIntensity = debugObject.envMapIntensity;
            child.material.lightMapIntensity = debugObject.lightMapIntensity;
            child.material.needsUpdate = true;
            child.geometry.buffersNeedUpdate = true;
            child.geometry.uvsNeedUpdate = true;
            child.material.uniformsNeedUpdate = true;
        }
    });
};

/**
 * Main Light color changer
 */
class ColorGUIHelper {
    constructor(object, prop) {
        this.object = object;
        this.prop = prop;
    }
    get value() {
        return `#${this.object[this.prop].getHexString()}`;
    }
    set value(hexString) {
        this.object[this.prop].set(hexString);
    }
}
mainLightFolder.addColor(new ColorGUIHelper(mainLight, 'color'), 'value');

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
debugObject.envMapIntensity = 3;
debugObject.lightMapIntensity = 0;
gui.add(debugObject, 'envMapIntensity').min(0).max(10).step(0.001).onChange(updateAllMaterials);
gui.add(debugObject, 'lightMapIntensity').min(0).max(100).step(0.01).onChange(updateAllMaterials);

/**
 * Raycaster
*/
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let currentRayIntersect = false;
const interactables = [];

/**
 * Models
 */
gltfLoader.load('/models/model.glb',
    (gltf) => {
        scene.add(gltf.scene);
        console.dir(gltf);

        scene.traverse((child) => {

            // Make lights nice and bright white
            if (child.name.toLowerCase().includes('light_large')) {
                child.children.forEach((light) => {
                    if (light instanceof THREE.Mesh && light.material instanceof THREE.MeshStandardMaterial) {
                        light.material.emissiveIntensity = 20;
                    }
                })
            }

            // Create camera spline
            else if (child.name.includes('Spline_Point')) {
                cameraSplinePoints.push(child.position);
            }

            // Create array of objects for click interactions (computers)
            else if (child.name.includes('MacBook') || child.name.includes('iMac')) {
                child.children.forEach((child2) => {
                    interactables.push(child2);
                })
            }

            // Add light map to required objects
            if (child.name.includes('Lightmapped')) {
                if (child instanceof THREE.Group) {
                    child.children.forEach((obj) => {
                        // Get existing `uv` data array
                        if (obj.geometry.getAttribute('uv') && !obj.geometry.getAttribute('uv2')) {
                            const uv1Array = obj.geometry.getAttribute("uv").array;
                            obj.geometry.setAttribute( 'uv2', new THREE.BufferAttribute( uv1Array, 2 ) );
                        }
                        obj.material.lightMap = lightMap;
                    })
                } else if (child instanceof THREE.Mesh) {
                    // Get existing `uv` data array
                    if (child.geometry.getAttribute('uv') && !child.geometry.getAttribute('uv2')) {
                        const uv1Array = child.geometry.getAttribute("uv").array;
                        child.geometry.setAttribute( 'uv2', new THREE.BufferAttribute( uv1Array, 2 ) );
                    }
                    child.material.lightMap = lightMap;
                }
            }
        });

        // Create camera spline
        cameraSpline = new THREE.CatmullRomCurve3(cameraSplinePoints);
        cameraSpline.arcLengthDivisions = 11;

        updateAllMaterials();

        tick();
    },
);

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    // Update camera
    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();

    // Update renderer
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * Mouse event listener
 */
window.addEventListener('mousemove', (e) => {
    // normalize x from -1 to 1 - left -> right
    mouse.x = ( e.clientX / sizes.width ) * 2 - 1;

    // normalize y - need to invert because we want +1 at top of screen, -1 at bottom
    mouse.y = -(e.clientY / sizes.height * 2 - 1);
});

/**
 * Show active user modal
 */
window.addEventListener('click', () => {

    document.querySelectorAll('.modal').forEach((modal) => {
        modal.classList.add('fade-out');
        setTimeout(() => {
            modal.remove();
        }, 410);
    });

    if (currentRayIntersect) {
        document.getElementById('modal-container').innerHTML = `
        <div class="modal">
            <div class="modal-content">
                <h3>${currentRayIntersect.object.parent.name}</h3>
                <br>
                <ul>
                    <li><b>Make: </b> Apple, Inc.</li>
                    <li><b>Model #: </b> CCX7633HB${Math.floor(Math.random() * 100)}</li>
                    <li><b>Year: </b> 2019</li>
                </ul>
            </div>
        </div>
        `;
    }
});

/**
 * Spline movement listener
 * - Every scroll, increment a number
 */
let scrollPositionIndex = 0;
canvas.addEventListener('wheel', (e) => {
    scrollPositionIndex += -Math.sign(e.deltaY) * 0.1;
});

/**
 * Animate
 */
let firstRender = true;
const tick = () => {

    // Update camera around spline
    if (camera && cameraSplinePoints.length > 0 && cameraSpline) {
        // get next point on spline
        if (cameraSplinePositionIndex + scrollPositionIndex > stepsInteger || cameraSplinePositionIndex + scrollPositionIndex < 0) {
            cameraSplinePositionIndex = 0;
        } else {
            cameraSplinePositionIndex = scrollPositionIndex;
        }
        const equalDistanceValue = cameraSpline.getUtoTmapping(cameraSplinePositionIndex / stepsInteger);
        const camPos = cameraSpline.getPoint(equalDistanceValue);

        // Fade in lights if we are entering building (x >= -6.15)
        if (camPos.x >= -6.15) {
            if (mainLight.intensity < mainLightMaxIntensity) {
                mainLight.intensity += 1;
            }
            if (hemiLight.intensity < hemiMaxIntensity) {
                hemiLight.intensity += 1;
            }
            if (debugObject.lightMapIntensity < 50) {
                debugObject.lightMapIntensity += 1.5;
                updateAllMaterials();
            }
        }

        // set camera to first position on first render
        if (firstRender) {
            camera.position.copy(camPos);
            firstRender = false;
        }
        // Move the camera to the next position on the spline
        else {
            camera.position.lerp(camPos, 0.4);
            controls.target.set(camPos.x, camPos.y, camPos.z);
        }
    }

    // Raycaster - detect mouse pointer intersections
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactables);
    currentRayIntersect = false;
    if (intersects.length > 0) {
        currentRayIntersect = intersects[0];
    }

    // Update controls
    controls.update();

    // Render
    renderer.render(scene, camera);

    // Call tick again on the next frame
    window.requestAnimationFrame(tick);
};
