/* global AFRAME */

const latLonFrom = require('./utils').latLonFrom
const leafletOptions = require('./utils').leafletOptions
const getCanvasContainerAssetElement = require('./utils').getCanvasContainerAssetElement
const processCanvasElement = require('./utils').processCanvasElement
const processStyle = require('./utils').processStyle
const LEFT_OFFSET_PX = 0

if (typeof AFRAME === 'undefined') {
    throw new Error('Component attempted to register before AFRAME was available.');
}

const cuid = require('cuid')

require('leaflet')

const MAP_LOADED_EVENT = 'map-loaded';
const MAP_MOVE_END_EVENT = 'map-moveend';


function setDimensions(id, el, width, height) {

    const element = document.querySelector(`#${id}`);
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;

    el.setAttribute('material', 'width', width);
    el.setAttribute('material', 'height', height);
}

/**
 * Tangram component for A-Frame.
 */
AFRAME.registerComponent('tangram-map', {
    dependencies: [
        'geometry',
        'material'
    ],

    schema: {
        mapzenAPIKey: {
            default: ''
        },
        style: {
            type: "asset",
            default: ''
        },
        center: {
            // lon lat
            default: [0, 0],
            type: 'array',
        },
        /**
            [0] southwest
            [1] northeast
        */
        maxBounds: {
            default: [],
            type: 'array',
            parse: value => {
                return value
            },
        },
        fitBounds: {
            default: [],
            type: 'array',
            parse: value => {
                return value
            },
        },
        zoom: {
            default: 13
        },
        pxToWorldRatio: {
            default: 100
        },
        canvasOffsetPx: {
            default: 9999 // debug
        }
    },

    multiple: false,

    init: function() {
        this.creatingMap = false
        this._mapInstance = null
        this._scene = null

        this._initMap()
    },
    update: function(oldData) {
        // Nothing changed
        if (AFRAME.utils.deepEqual(oldData, this.data)) {
            return;
        }

        if (oldData.pxToWorldRatio !== this.data.pxToWorldRatio) {
            const geomComponent = this.el.components.geometry;
            const width = geomComponent.data.width * this.data.pxToWorldRatio;
            const height = geomComponent.data.height * this.data.pxToWorldRatio;
            setDimensions(this._canvasContainerId, this.el, width, height);
        }

        // Everything after this requires a map instance
        if (!this._mapInstance) {
            return;
        }

        //if (!AFRAME.utils.deepEqual(oldData.maxBounds, this.data.maxBounds)) {
        if (oldData.maxBounds !== this.data.maxBounds) {
            var bounds = L.latLngBounds(this.data.maxBounds);
            this._mapInstance.setMaxBounds(bounds)
        }

        var moved = false;
        //if (!AFRAME.utils.deepEqual(oldData.center, this.data.center)) {
        if (oldData.center !== this.data.center) {
            moved = true
            this._mapInstance.setView(latLonFrom(this.data.center), this.data.zoom)
        }

        //if (!AFRAME.utils.deepEqual(oldData.fitBounds, this.data.fitBounds)) {
        if (this.data.fitBounds.length > 0 && oldData.fitBounds !== this.data.fitBounds) {
            moved = true
            var bounds = L.latLngBounds(this.data.fitBounds);
            this._mapInstance.fitBounds(bounds)
        }

        if (moved) {
            // A way to signal when these async actions have completed
            this._mapInstance.once('moveend', e => {
                this.el.emit(MAP_MOVE_END_EVENT);
            });
        }
    },
    _initMap: function() {

        var data = this.data

        const geomComponent = this.el.components.geometry;
        var width = geomComponent.data.width * this.data.pxToWorldRatio
        var height = geomComponent.data.height * this.data.pxToWorldRatio

        this._canvasContainerId = _canvasContainerId = cuid();
        const canvasContainer = getCanvasContainerAssetElement(_canvasContainerId,
            width, height, data.canvasOffsetPx);


        var map = L.map(canvasContainer, leafletOptions);


        const sceneStyle = processStyle(this.data.style);

        var layer = Tangram.leafletLayer({
            scene: {
                import: sceneStyle,
                global: {
                    sdk_mapzen_api_key: data.mapzenAPIKey
                }
            },
            webGLContextOptions: {
                preserveDrawingBuffer: true
            },
            attribution: ''
        });
        layer.scene.subscribe({
            load: () => {
                processCanvasElement(canvasContainer)
            },
            view_complete: () => {

                const canvasId = document.querySelector(`#${_canvasContainerId} canvas`).id;
                this.el.setAttribute('material', 'src', `#${canvasId}`);
                this.el.emit(MAP_LOADED_EVENT);
            }
        });
        layer.addTo(map);


        this._mapInstance = map
    },
    remove: function() {},

    tick: function(delta, time) {},

    project(lon, lat) {


        const {
            x: pxX,
            y: pxY
        } = this._mapInstance.latLngToLayerPoint([lat, lon]);

        const {
            width: elWidth,
            height: elHeight
        } = this.el.components.geometry.data;


        return {
            x: (pxX / this.data.pxToWorldRatio) - (elWidth / 2),
            // y-coord is inverted (positive up in world space, positive down in
            // pixel space)
            y: -(pxY / this.data.pxToWorldRatio) + (elHeight / 2),
            z: 0,
        };

    },

    unproject(x, y) {

        // The 3D world size of the entity
        const {
            width: elWidth,
            height: elHeight
        } = this.el.components.geometry.data;

        // Converting back to pixel space
        const pxX = (x + (elWidth / 2)) * this.data.pxToWorldRatio;
        // y-coord is inverted (positive up in world space, positive down in
        // pixel space)
        const pxY = ((elHeight / 2) - y) * this.data.pxToWorldRatio;

        // Return the lat / long of that pixel on the map
        var latLng = this._mapInstance.layerPointToLatLng([pxX, pxY])
        return {
            lon: latLng.lng,
            lat: latLng.lat
        }
    },
    distanceTo(lngLat) {
        return L.latLng(lngLat).distanceTo(this.data.center)
    }
});