const cuid = require('cuid')
const defaultMapStyle = require('./simple-style.yaml');


module.exports.leafletOptions = {
    "preferCanvas": true,
    "keyboard": false,
    "scrollWheelZoom": true,
    "tap": false,
    "touchZoom": true,
    "zoomControl": false,
    "attributionControl": false,
    "doubleClickZoom": false,
    "trackResize": false,
    "boxZoom": false,
    "dragging": false,
    "zoomAnimation": false,
    "fadeAnimation": false,
    "markerZoomAnimation": false,
}


module.exports.getCanvasContainerAssetElement = function(id, width, height, left) {

    let element = document.querySelector(`#${id}`);

    if (!element) {
        element = document.createElement('div');
    }

    element.setAttribute('id', id);
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;


    // This is necessary because mapbox-gl uses the offsetWidth/Height of the
    // container element to calculate the canvas size.  But those values are 0 if
    // the element (or its parent) are hidden. `position: fixed` means it can be
    // calculated correctly.
    element.style.position = 'fixed';
    element.style.left = `${left}px`;
    element.style.top = '0px';
    

    if (!document.body.contains(element)) {
        document.body.appendChild(element);
    }

    return element;
}

module.exports.processCanvasElement = function(canvasContainer) {
    const canvas = canvasContainer.querySelector('canvas');
    canvas.setAttribute('id', cuid());
    canvas.setAttribute('crossOrigin', 'anonymous');
}

module.exports.processStyle = function (style) {

    if (!style) {
        return defaultMapStyle;
    }

    return style;
}

module.exports.latLonFrom = function (lonLat) {
    return [lonLat[1], lonLat[0]];
}

        /*
                var loader = new THREE.FileLoader();
                loader.load(data.markers, file => {
                    const geojson = JSON.parse(file)
                    var geojsonLayer = L.geoJSON(geojson) //.addTo(map);
                    map.fitBounds(geojsonLayer.getBounds());
                    console.log(this.project(15.814647674560547,
                      47.77682884663196))
                })
        */
