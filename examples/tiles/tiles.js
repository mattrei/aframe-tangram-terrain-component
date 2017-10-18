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
    style: {
      type: 'asset',
      default: ''
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
    displacementScale: {
      default: 1
    },
    radius: {
      default: 0
    }
  },

  init: function () {
    this.tiles = ['0,0'];
    this.queue = [];
    this._isBusy = true;

    const sceneEl = this.el.sceneEl;

    sceneEl.addEventListener('camera-set-active', (evt) => {
      this.camera = evt.detail.cameraEl.object3D.children[0];
    });
    this.camera = sceneEl.camera;

    this.mainTile = this._addTile('0,0', this.data.center, this.el.components.position);// new THREE.Vector3())

    var self = this;

    this.mainTile.addEventListener('model-loaded', function (e) {
      self._isBusy = false;
      self.leaflet = e.target.components['tangram-terrain'].getLeafletInstance();
    });

    this.tick = AFRAME.utils.throttleTick(this.tick, 1500, this);
  },
  _addToQueue: function (tile, center, position) {
    this.queue.push({ tile, center, position });
  },
  _processQueue: function () {
    var self = this;

    if (!this._isBusy && this.queue.length > 0) {
      const first = this.queue[0];
      this._isBusy = true;
      const tile = this._addTile(first.tile, first.center, first.position);
      tile.addEventListener('model-loaded', (e) => {
        self._isBusy = false;
        self.queue.shift();
      });
    }
  },
  _addTile: function (tile, center, position) {
    this._isBusy = true;
    const data = this.data;

    const terrain = document.createElement('a-entity');

    terrain.setAttribute('id', 'terrainTile_' + tile);
    var geometry = {
      width: data.tileSize,
      height: data.tileSize,
      segmentsWidth: data.tileSegments,
      segmentsHeight: data.tileSegments
    };
    terrain.setAttribute('geometry', geometry);

    var material = {
      wireframe: data.wireframe,
      displacementScale: data.displacementScale
    };
    terrain.setAttribute('material', material);

    terrain.setAttribute('tangram-terrain',
      {
        'mapzenAPIKey': data.mapzenAPIKey,
        'center': center,
        'style': data.style,
        'zoom': data.zoom,
        'pxToWorldRatio': data.pxToWorldRatio,
        'canvasOffsetPx': 9999
      });

    terrain.setAttribute('position', position);

    this.el.appendChild(terrain);

    return terrain;
  },
  _checkPosition: function () {
    const data = this.data;
    var pos = this.getCameraPosition();

    const x = Math.floor((pos.x + data.tileSize * 0.5) / data.tileSize);
    const y = Math.floor((-pos.z + data.tileSize * 0.5) / data.tileSize);

    this._addTileFor(x, y);
    if (data.radius > 0) {
      this._addTileFor(x + 1, y + 1);
      this._addTileFor(x + 1, y);
      this._addTileFor(x + 1, y - 1);
      this._addTileFor(x - 1, y - 1);
      this._addTileFor(x - 1, y);
      this._addTileFor(x - 1, y + 1);
      this._addTileFor(x, y - 1);
      this._addTileFor(x, y + 1);
    }
  },
  _addTileFor: function (x, y) {
    const data = this.data;

    const tile = `${x},${y}`;
    if (!this.tiles.includes(tile)) {
      this.tiles.push(tile);

      var pX = x * (this.data.tileSize);
      var pY = y * (this.data.tileSize);
      var latLng = this.mainTile.components['tangram-terrain'].unproject(pX, pY);

      // console.log(x + ' ' + y)
      // console.log(latLng)
      this._addToQueue(tile, [latLng.lon, latLng.lat], new THREE.Vector3(x * this.data.tileSize, y * this.data.tileSize, 0));
    }
  },
  tick: function (time, delta) {
    if (!this.leaflet) return;

    this._checkPosition();
    this._processQueue();
  },
  getCameraPosition: function () {
    var worldPos = new THREE.Vector3();
    return function () {
      worldPos.setFromMatrixPosition(this.camera.matrixWorld);
      return worldPos;
    };
  }()
});
