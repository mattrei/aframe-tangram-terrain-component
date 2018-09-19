## aframe-tangram-terrain-component

A [Tangram](https://github.com/tangrams/tangram) terrain component for [A-Frame](https://aframe.io) with batteries included. 

> Supports A-Frame 0.8.0.

![Example](doc/example.jpg)

### API

#### `tangram-terrain` component

This component obtains a terrain normalmap from the [Amazon public dataset S3](https://aws.amazon.com/public-datasets/terrain/) servers and applies a overlay texture according the Tangram _style_ specification. The normlmap can be used both as a _displacement_ map for the geometry and also a a _normal_ map for the material. By using the _GPU picking technique_ for the normal map, the height calculation or hit testing is done on the shader. In addition the component also offers Level-of-Detail (LOD) of the geometry by using fast buffer geometry draw ranges on the vertex shader.

##### Schema
| Property | Description | Default Value |
| -------- | ----------- | ------------- |
| apiKey | Sets the global API key of the overlay map. May be empty if the style needs no API. | "" |
| style | The style definition document for the ovleray style. Must point to a custom style or to a [basemap style](https://www.nextzen.org/). May need an API key set. | "" |
| center | Center of the map, in the form of [longitude, latitude] | [0, 0] |
| zoom | The zoom level of the map. | 13 |
| heightmapFactor | Multiplication factor of the geometry's _segmentsWidth_ and _segmentsHeight_ for the heightmap. Higher factor will fetch more detailed heightmaps however will also increase bandwith and texture memory | 2 |
| pxToWorldRatio | The multiplication factor between meters in A-Frame and the pixels of the map. ie; when set to 100, will display 100 pixels per 1 meter in world space. (see [a note on fidelity](#a-note-on-fidelity)) | 100 |
| lodCount | Number of level of details for _geometry_. Set to 1 of no LOD is needed. | 1 |
| lod | Level-Of-Detail in the range between 1 and _lodCount_. May be set during runtime. | 1 |
| vertexNormals | Decides if a normalmap shall be applied to the material. Needed for lighting. Due to smart terrain tiles no additional data needs to transfered, just you are GPU needs to work harder. | true |

##### Events
| Name | Data | Description |
| -------- | ----------- | ------------- |
| tangram-terrain-loaded | None| Fired when the terrain that means the elevation data and the overlay map has finished loading or the corresponding Level-Of-Detail has been loaded. Only by then the public API will be usable. |



##### API
| Name | Data | Description |
| -------- | ----------- | ------------- |
| project | _lon_, _lat_| Returns the pixel x and y and z (depth) coordinates of the given longitude and latitude. |
| unproject | _x_, _y_| Gives the longitude and latitude of the world coordinates at the given pixel points. |
| unprojectHeight | _x_, _y_| Gives the depth value (GPU picked from the heightmap) from the pixel coordinates. Value is scaled according to the `displacementScale` scale and added the `displacementBias` value. |
| unprojectHeightInMeters | _x_, _y_| Gives the height value in meters. No physical exact values are possible though. Range between 0 and 8900 (Mount Everest) or -7000 and 8900 meters when `includeOceans` is set to true |
| renderDepthBuffer | | Renders the heightmap depth buffer. Needs to be only called manually if the heigtmap is panned programmtically |

##### Notes

You can also download the map data to your machine and use the component below to display and work with the terrain. This comes in handy if you want to provide the assets rathern than pulling it from a tile server directly. 
To download the normalmap from the current terrain press `<ctrl> + <alt> + t` on the keyboard. To download the styled map press `<ctrl> + <alt> + <shift> + t` on the keyboard. The bounds of the terrain area will be printed to the console which is need for the static terrain as an argument. See the following component for using those assets.

#### `tangram-static-terrain` component

This component does not pull data from a tile server but uses image assets, that may be produced manually by downloading them from the _tangram-terrain_ component. 
Those two maps must be provided as assets to the _map_ and _normalmap_ attributes and the original _pxtoWroldRatio_ value as well as the _bounds_ string from the `console.log` in order to be able to project data on the static terrain.

The geometry's _width_ and _height_ and _segments_ detail settings and materials detail may of course differ from the reference terrain.

##### Schema
| Property | Description | Default Value |
| -------- | ----------- | ------------- |
| map | Reference to the visible texture. | "" |
| normalmap | Reference to the normalmap texture. | "" |
| bounds | String of four elements obtained from the console log after taking the normalmap screenshot. | "0, 0, 0, 0" |
| pxToWorldRatio | This value must be the same as in the original _tangram-terrain_ component where the assets have been taken from  | 100 |
| lodCount | See `tangram-terrain` component | 1 |
| lod | See `tangram-terrain` component | 1 |
| vertexNormals | See `tangram-terrain` component | true |

##### API
| Name | Data | Description |
| -------- | ----------- | ------------- |
| project | _lon_, _lat_| Returns the pixel x and y and z (depth) coordinates of the given longitude and latitude. Return `null` if the given coordinates are outside the bounds. |
| unproject | _x_, _y_| Gives the longitude and latitude of the world coordinates at the given pixel points. Returns `null` if the given coordinates are outside the bounds. |
| unprojectHeight | _x_, _y_| Gives the depth value (GPU picked from the heightmap) from the pixel coordinates. Value is scaled according to the `displacementScale` scale and added the `displacementBias` value. |
| unprojectHeightInMeters | _x_, _y_| Gives the height value in meters. No physical exact values are possible though. Range between 0 and 8900 (Mount Everest) or -7000 and 8900 meters when `includeOceans` is set to true |

### Styling
The Tangram map is styled within a (set) of YAML files. See the [Tangram documentation](https://mapzen.com/documentation/tangram/) for details. 

### A note on fidelity

The higher `pxToWorldRatio`, the more map area will be displayed per world
unit. That canvas has to be translated into a plane in world space. This is
combined with the width and height in world space (from geometry.width and
geometry.height on the entity) to set up the plane for rendering in 3D.

The map is rendered as a texture on a 3D plane. For best performance, texture
sizes should be kept to powers of 2. Keeping this in mind, you should work to
ensure `width * pxToWorldRatio` and `height * pxToWorldRatio` are powers of 2.

### Dependencies
The Mapzen styling documents are in the YAML format, so you need a possiblity to require those files.
If you are using _Webpack_ install
`npm install yml-loader --save-dev` 
and configure the webpack configuration file

If you are using browserify install the
`nmp install yamlify --save-dev` 
and give pass the transform (-t) parameter to browserify.

### Installation

#### Browser

Install and use by directly including the [browser files](dist):

```html
<head>
  <title>My A-Frame Scene</title>
  <script src="https://aframe.io/releases/0.8.0/aframe.min.js"></script>
  <script src="https://unpkg.com/aframe-tangram-terrain-component/dist/aframe-tangram-terrain-component.min.js"></script>
</head>

<body>
  <a-scene>

    <a-assets>
      <a-asset-item id="yamlElevation" src="https://raw.githubusercontent.com/tangrams/terrain-demos/master/styles/terrarium-elevation.yaml" />
    </a-assets>

    <a-tangram-terrain
      map-style="#yamlElevation" 
      zoom="10" 
      center="15.8056, 7.7671" 
      px-world-ratio="12"
      wireframe="false" 
      height-scale="40"
      width="25" depth="25">
    </a-tangram-terrain>
  </a-scene>
</body>
```

<!-- If component is accepted to the Registry, uncomment this. -->
<!--
Or with [angle](https://npmjs.com/package/angle/), you can install the proper
version of the component straight into your HTML file, respective to your
version of A-Frame:

```sh
angle install aframe-tangram-terrain-component
```
-->

#### npm

Install via npm:

```bash
npm install aframe-tangram-terrain-component
```

Then require and use.

```js
require('aframe');
require('aframe-tangram-terrain-component');
```

#### Required step for Webpack
To get the import working you need to tell _Webpack_ not to parse the _Tangram_ library otherwise you will run into [this error](https://github.com/tangrams/tangram/issues/559). So you need to add this in your _webpack.config.js_.

```js
module: {
    noParse: [/tangram\/dist\/tangram/],
}
```

See also [here](https://github.com/tangrams/tangram-play/wiki/Advanced-Tangram-for-front-end-engineers:-bundlers,-frameworks,-etc) for more information.


### Known issues
* The maximum texture size (configured by the _pxToWorldRatio_ and _size_ parameters of the overlay map is restricted on mobile devies.  
* The _Tangram_ library only allows [one instance on a page] (https://github.com/tangrams/tangram/issues/350) that means a tiling algorithm cannot instance terrain entities in parallel! Hopefully this restriction of the _Tangram_ library may fall in the future.

### Implementation details
* To save bandwith and increase speed the elevation data is backed into the [normal map of the tiling webservice](https://s3.amazonaws.com/elevation-tiles-prod/normal/{z}/{x}/{y}.png), which is all done in a shader by the _Tangram_ library. _Three.JS_ does not support normals with displacement alpha channels so I use the `onBeforeCompile` hook on the `MeshStandardMaterial` to handle this texture format. 

* The commond functions are all within the `tangram-terrain` system.

* This is done by rendering a depth buffer to an external THREE.JS _scene_, so that the height from the normal map alpha channel is read by the GPU.
