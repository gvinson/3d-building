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
const debugObject = {
    cameraType: 'standard',
    envMapIntensity: 6.69,
    lightMapIntensity: 0,
};

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
let stepsInteger = 100;
gui.add(debugObject, 'cameraType').options(['standard', 'free']);

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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.035;

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
const hemiLight = new THREE.HemisphereLight(0xffeeb1, 0x080820, 20);
const hemiMaxIntensity = 100;
scene.add(hemiLight);
const hemiFolder = gui.addFolder('Hemisphere Light');
hemiFolder.add(hemiLight, 'intensity').min(0).max(100).step(0.1);

const mainLight = new THREE.RectAreaLight(0x191919, 0, 50, 100);
const mainLightMaxIntensity = 100;
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
hemiFolder.addColor(new ColorGUIHelper(hemiLight, 'groundColor'), 'value');
hemiFolder.addColor(new ColorGUIHelper(hemiLight, 'color'), 'value');

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
gui.add(debugObject, 'envMapIntensity').min(0).max(10).step(0.001).onChange(updateAllMaterials);
gui.add(debugObject, 'lightMapIntensity').min(0).max(100).step(0.01).onChange(updateAllMaterials);

/**
 * Raycaster
*/
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let currentRayIntersect = false;
const interactables = [];
let intersects = [];

/**
 * Models
 */
gltfLoader.load('/models/Clevyr_Building_E16.glb',
    (gltf) => {
        scene.add(gltf.scene);

        scene.traverse((child) => {

            // Fix metalness of logo in entrance
            if (child.name === 'Clevyr_Logo_V_Secondary006') {
                child.material.metalness = 0.5;
            }

            // Make lights nice and bright white
            else if (child.name.toLowerCase().includes('light_large')) {
                child.children.forEach((light) => {
                    if (light instanceof THREE.Mesh && light.material instanceof THREE.MeshStandardMaterial) {
                        light.material.emissiveIntensity = 20;
                    }
                })
            }

            // Create camera spline
            else if (child.name.includes('Spline_Point')) {
                cameraSplinePoints.push(child);
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
                        // we need an additional UV for lightmaps
                        if (obj.geometry.getAttribute('uv') && !obj.geometry.getAttribute('uv2')) {
                            const uv1Array = obj.geometry.getAttribute("uv").array;
                            obj.geometry.setAttribute( 'uv2', new THREE.BufferAttribute( uv1Array, 2 ) );
                        }
                        obj.material.lightMap = lightMap;
                    })
                } else if (child instanceof THREE.Mesh) {
                    // Get existing `uv` data array
                    // we need an additional UV for lightmaps
                    if (child.geometry.getAttribute('uv') && !child.geometry.getAttribute('uv2')) {
                        const uv1Array = child.geometry.getAttribute("uv").array;
                        child.geometry.setAttribute( 'uv2', new THREE.BufferAttribute( uv1Array, 2 ) );
                    }
                    child.material.lightMap = lightMap;
                }
            }
        });

        // Order spline points by name cause Blender is dumb
        const orderedSplinePoints = [];
        for (let i=1; i<cameraSplinePoints.length + 1; i++) {
            let index = i < 10 ? "0" + i : i; // append leading 0
            let foundPoint = cameraSplinePoints.filter((point) => point.name === 'Spline_Point_0' + index);

            if (foundPoint.length > 0) {
                orderedSplinePoints.push(foundPoint[0].position);
            }
        }

        // Create camera spline
        cameraSpline = new THREE.CatmullRomCurve3(orderedSplinePoints);
        cameraSpline.arcLengthDivisions = orderedSplinePoints.length;
        cameraSpline.type = 'catmullrom';
        cameraSpline.closed = false;

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
            window.clearInterval(window.tempInterval);
        }, 410);
    });

    if (currentRayIntersect) {
        let currentTemp = Math.floor(Math.random() * 100) + 50;

        document.getElementById('modal-container').innerHTML = `
        <div class="modal">
            <div class="modal-content">
                <h3>${currentRayIntersect.object.parent.name}</h3>
                <br>
                <ul>
                    <li><b>Make: </b> Apple, Inc.</li>
                    <li><b>Model #: </b> CCX7633HB${Math.floor(Math.random() * 100)}</li>
                    <li><b>Year: </b> 2019</li>
                    <li id="temp" class="green"><b>Temp: </b><span>${currentTemp}</span>&deg;F</li>
                </ul>
            </div>
        </div>
        `;

        // Random temp stat generator
        let tempDOM = document.getElementById('temp');
        window.tempInterval = setInterval(() => {
            let newTemp = Math.floor(Math.random() * currentTemp) + 100;
            tempDOM.querySelector('span').innerText = newTemp;
            if (newTemp < 175) {
                tempDOM.className = 'green';
            } else {
                tempDOM.className = 'red';
            }
            currentTemp = newTemp;
        }, 1000);

    }
});

/**
 * Spline movement listener
 * - Every scroll, increment a number
 */
canvas.addEventListener('wheel', (e) => {
    const index = -Math.sign(e.deltaY);

    if (cameraSplinePositionIndex + index > stepsInteger || cameraSplinePositionIndex + index < 0) {
        cameraSplinePositionIndex = 0;
    } else {
        cameraSplinePositionIndex += index;
    }

    camPosIndex += 0.075;
});

/**
 * Animate
 */
let firstRender = true;
let camPos = null;
let camPosIndex = 0;

const tick = () => {

    // Update camera around spline
    if (cameraSplinePoints.length > 0) {
        // get next point on spline
        let camPosU = cameraSpline.getUtoTmapping(cameraSplinePositionIndex / stepsInteger, camPosIndex);
        camPos = cameraSpline.getPoint(camPosU);

        // Fade in lights if we are entering building (x >= -6.15)
        if (camPos.x >= -6.15) {
            if (mainLight.intensity < mainLightMaxIntensity) {
              //  mainLight.intensity += 1;
            }
            if (hemiLight.intensity < hemiMaxIntensity) {
                hemiLight.intensity += 1;
            }
            if (debugObject.lightMapIntensity < 25.81) {
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
            if (debugObject.cameraType === 'free') {
                camera.position.copy(camPos);
                controls.target = new THREE.Vector3()
                    .addVectors(
                        camera.position,
                        camera.getWorldDirection(controls.target)
                    );
            }
            else {
                controls.target.copy(camPos);
            }
        }
    }


    // Raycaster - detect mouse pointer intersections
    raycaster.setFromCamera(mouse, camera);
    intersects = raycaster.intersectObjects(interactables);
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
