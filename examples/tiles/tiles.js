AFRAME.registerComponent('tiles', {
  dependencies: [
    'position'
],
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
    },
    radius: {
      default: 2
    }
  },

  init: function () {
    this.tiles = ['0,0']
    this.queue = []
    this._isBusy = true;

    const sceneEl = this.el.sceneEl;

    sceneEl.addEventListener('camera-set-active', (evt) => {
      this.camera = evt.detail.cameraEl.object3D.children[0]
    });
    this.camera = sceneEl.camera;


    console.log(this.el.components.position)
    this.mainTile = this._addTile(this.data.center, this.el.components.position);//new THREE.Vector3())

    var self = this;

    this.mainTile.addEventListener('model-loaded', function (e) {
      self._isBusy = false;
      self.leaflet = e.target.components['tangram-terrain'].getLeafletInstance()
    })

    this.tick = AFRAME.utils.throttleTick(this.tick, 1000, this);

  },
  _addToQueue: function (center, position) {

    this.queue.push({ center, position })
  },
  _processQueue: function () {
    var self = this;

    if (!this._isBusy && this.queue.length > 0) {
      console.log(this.queue)
      const first = this.queue[0];
      this._isBusy = true;
      const tile = this._addTile(first.center, first.position)
      tile.addEventListener('model-loaded', (e) => {
        self._isBusy = false;
        self.queue.shift();
      })
    }
  },
  _addTile: function (center, position) {

    this._isBusy = true
    const data = this.data;

    const terrain = document.createElement('a-entity')

    var geometry = {
      width: data.tileSize,
      height: data.tileSize,
      segmentsWidth: data.tileSegments,
      segmentsHeight: data.tileSegments
    }
    terrain.setAttribute('geometry', geometry);

    var material = {
      wireframe: data.wireframe,
      displacementScale: 25 // TODO
    }
    terrain.setAttribute('material', material);

    terrain.setAttribute('tangram-terrain',
      {
        'mapzenAPIKey': data.mapzenAPIKey,
        'center': center,
        'zoom': data.zoom,
        'pxToWorldRatio': data.pxToWorldRatio,
        'canvasOffsetPx': 0
      })

    terrain.setAttribute('position', position)

    this.el.appendChild(terrain)

    return terrain
  },
  tick: function (time, delta) {

    if (!this.leaflet) return;

    const data = this.data
    var pos = this.getPosition()

    var x = Math.floor((pos.x + data.tileSize * 0.5) / data.tileSize)
    var y = Math.floor((-pos.z + data.tileSize * 0.5) / data.tileSize)


    if (!this.tiles.includes(`${x},${y}`)) {
      this.tiles.push(`${x},${y}`)
      
      console.log(x + ' ' + y)
      var pX = x * (this.data.tileSize)
      var pY = y * (this.data.tileSize)
      var latLng = this.mainTile.components['tangram-terrain'].unproject(pX, pY)

      this._addToQueue([latLng.lon, latLng.lat], new THREE.Vector3(x * this.data.tileSize, y * this.data.tileSize, 0))
    } else {
      this._processQueue()
    }
  },
  getPosition: function () {
    var worldPos = new THREE.Vector3();
    return function () {
      worldPos.setFromMatrixPosition(this.camera.matrixWorld);
      return worldPos
    };
  }()
})