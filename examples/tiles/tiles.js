AFRAME.registerComponent('tiles', {
  schema: {
    mapzenAPIKey: {
      default: ''
    },
    center: {
      // lat lon
      default: [0, 0],
      type: 'array'
    },
    zoom: {
      default: 13
    },
    tileSize: {
      default: 1
    },
    tileSegments: {
      default: 5
    },
    pxToWorldRatio: {
      default: 10
    },
    wireframe: {
      default: true
    }
  },

  init: function () {
    this.tiles = {x: [0], y: [0]}

    const sceneEl = this.el.sceneEl;

    sceneEl.addEventListener('camera-set-active', (evt) => {
      this.camera = evt.detail.cameraEl.object3D.children[0]
    });
    this.camera = sceneEl.camera;


    this.mainTile = this._addTile(this.data.center, new THREE.Vector3())

    var self = this;

    this.mainTile.addEventListener('model-loaded', function(e) {
      self.leaflet = e.target.components['tangram-terrain'].getLeafletInstance()
    })
    
  },
  _addTile: function(center, position) {

    const data = this.data;

    var terrain = document.createElement('a-entity')  // TODO

    terrain.setAttribute('tangram-terrain', 
      {'mapzenAPIKey': data.mapzenAPIKey,
    'center': center,
    'zoom': data.zoom,
    'pxToWorldRatio': data.pxToWorldRatio,
    'canvasOffsetPx': 0})
/*
    terrain.setAttribute('mapzenAPIKey', data.mapzenAPIKey);
    terrain.setAttribute('center', center);
    terrain.setAttribute('zoom', data.zoom);
    */

    var geometry = {
      width: data.tileSize,
      height: data.tileSize,
      segmentsWidth: data.tileSegments,
      segmentsHeight: data.tileSegments
    }
    console.log(geometry)
    terrain.setAttribute('geometry', geometry);

    var material = {
      wireframe: data.wireframe,
      displacementScale: 10
    }
    terrain.setAttribute('material', material);

    terrain.setAttribute('position', position)

    this.el.appendChild(terrain)

    return terrain
  },
  tick: function() {

    if (!this.leaflet) return;
    
    const data = this.data
    var pos = this.getPosition()

    var x = Math.floor((pos.x + data.tileSize * 0.5) / data.tileSize)
    var y = 0

    if (!this.tiles.x.includes(x)) {

      this.tiles.x.push(x)
      var pX = x * (this.data.tileSize)
      var pY = y * (this.data.tileSize)
      var latLng = this.mainTile.components['tangram-terrain'].unproject(pX, pY)
      console.log(pX)
      console.log(latLng)

      //latLng.lat = 48.379634

      // load new
      //var latLng = this.leaflet.layerPointToLatLng([pX, 0])
      this._addTile([latLng.lon, latLng.lat], new THREE.Vector3(x * this.data.tileSize, 0, 0))
    }
  },
  getPosition: function() {
    var worldPos = new THREE.Vector3();
    return function() {
      worldPos.setFromMatrixPosition(this.camera.matrixWorld);
      return worldPos
    };
  }()
})