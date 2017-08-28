## aframe-tangram-terrain-component

A Mapzen Tangram component for [A-Frame](https://aframe.io).

> Supports A-Frame 0.6.0.
> Works with Tangram 0.13.0.

![Example](doc/example.jpg)

### API

#### `tangram-terrain` component

This component so far can be just used as a texture for a geometry object (plane, sphere, etc). No feature selection events are fired. A strategy may be implemented in future releases. 

##### Schema
| Property | Description | Default Value |
| -------- | ----------- | ------------- |
| mapzenAPIKey | Your API key to make use of the Tangram API. | "" |
| style | The style definition document for the ovleray style. Defaults to the standard Tangam style. | "" |
| center | Center of the map, in the form of [longitude, latitude] | [0, 0] |
| maxBounds | The maximum bounds of the map. Given as [[southwest], [northeast]] | [] |
| fitBounds | Uses the optimal zoom level for the given map boundaries. Given as [[southwest], [northeast]] | [] |
| zoom | The zoom level of the map. Is ignored when _fitBounds_ is given. | 13 |
| pxToWorldRatio | The zoom level of the map. Is ignored when _fitBounds_ is given. | 13 |
| scaleFactor | The scaline factor of the heightmap. 1 is a sane value, change according to the expression of the terrain.| 1 |
| highestAltitudeMeter | The heightmap does not contain exact absolute height values. If you know the highest point of the map area than you can give it here to give exact height measuring results. _0_ ignores it | 0 |


##### Events
| Name | Data | Description |
| -------- | ----------- | ------------- |
| heightmap-loaded | None| Fired when the heightmap and its overlaymap has finished loading. |


##### API
| Name | Data | Description |
| -------- | ----------- | ------------- |
| project | _lon_, _lat_| Returns the pixel x and y and z coordinates of the given longitude and latitude. |
| unproject | _x_, _y_| Gives the longitude and latitude of the pixel coordinates. |
| projectAltitude | _lon_, _lat_| Returns the altitude in meters from the the longitude and latitude. |
| unprojectAltitude | _x_, _y_| Gives the altitude in meters from the pixel coordinates. |

### Styling
The Mapzen Tangram styling:

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
  <script src="https://aframe.io/releases/0.6.0/aframe.min.js"></script>
  <script src="https://mapzen.com/tangram/tangram.min.js"></script>
  <script src="https://unpkg.com/aframe-tangram-terrain-component/dist/aframe-tangram-terrain-component.min.js"></script>
</head>

<body>
  <a-scene>

      <a-entity 
        position="0 2.5 -2"
        geometry="primitive: plane; width: 7; height: 5;"
        
        material="shader: flat;"

        tangram-map="
        mapzenAPIKey: mapzen-sfnfVzq;
        center: 15.8056, 47.7671;
        zoom: 12;
        pxToWorldRatio: 100;
        "
        >
      </a-entity>
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


### Known issues
* The maximum texture size of the overlay map is restricted on mobile devies.  
* Future versions may include the support of map tiling to overcome this issue.

### 
For color scaling see https://github.com/d3/d3-scale