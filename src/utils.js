const cuid = require('cuid')
//const defaultMapStyle = require('./simple-style.yaml');
const defaultMapStyle = `
cameras:
    camera1:
        type: perspective

lights:
    light1:
        type: directional
        direction: [0, 1, -.5]
        diffuse: .3
        ambient: 1

sources:
    osm:
        type: TopoJSON
        url: https://tile.mapzen.com/mapzen/vector/v1/all/{z}/{x}/{y}.topojson
        url_params:
            api_key: global.sdk_mapzen_api_key
        max_zoom: 16

layers:
    earth:
        data: { source: osm }
        draw:
            polygons:
                order: function() { return feature.sort_rank; }
                color: '#ddeeee'

    landuse:
        data: { source: osm }
        draw:
            polygons:
                order: function() { return feature.sort_rank; }
                color: '#aaffaa'

    water:
        data: { source: osm }
        draw:
            polygons:
                order: function() { return feature.sort_rank; }
                color: '#88bbee'

    roads:
        data: { source: osm }
        filter:
            not: { kind: [path, rail, ferry] }
        draw:
            lines:
                order: function() { return feature.sort_rank; }
                color: gray
                width: 8
                cap: round
        highway:
            filter:
                kind: highway
            draw:
                lines:
                    order: function() { return feature.sort_rank; }
                    color: '#cc6666'
                    width: 12
                    outline:
                        color: grey
                        width: 1.5
        minor_road:
            filter:
                kind: minor_road
            draw:
                lines:
                    order: function() { return feature.sort_rank; }
                    color: lightgrey
                    width: 5

    buildings:
        data: { source: osm }
        draw:
            polygons:
                order: function() { return feature.sort_rank; }
                color: |
                    function () {
                        var h = feature.height || 20;
                        h = Math.min((h + 50)/ 255, .8); // max brightness: .8
                        h = Math.max(h, .4); // min brightness: .4
                        return [h, h, h];
                    }
        3d-buildings:
            filter: { $zoom: { min: 15 } }
            draw:
                polygons:
                    extrude: function () { return feature.height > 20 || $zoom >= 16; }
`                    


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
