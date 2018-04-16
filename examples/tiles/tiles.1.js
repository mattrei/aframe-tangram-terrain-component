/* global AFRAME THREE */

// https://github.com/felixpalmer/lod-terrain/blob/master/js/app/terrain.js

AFRAME.registerComponent('tiles', {
  dependencies: [
    'position'
  ],
  schema: {
    mapzenAPIKey: {
      default: ''
    },
    center: {
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
    displacementBias: {
      default: 0
    },
    radius: {
      default: 0
    }
  },

  init: function () {
    this._count = 0;
    var self = this;
    const data = this.data;
    this.geomData = {
      width: data.tileSize,
      height: data.tileSize,
      segmentsWidth: data.tileSegments,
      segmentsHeight: data.tileSegments,
      primitive: 'plane',
      buffer: true
    };

    this.camera = this.el.sceneEl.camera;
    this.el.sceneEl.addEventListener('camera-set-active', (evt) => {
      this.camera = evt.detail.cameraEl.object3D.children[0];
    });

    this.system = this.el.sceneEl.systems['tangram-terrain'];
    this.heightmap = this.system.createHeightmap(data, this.geomData);
    this.overlaymap = this.system.createMap(data, this.geomData);

    this.depthBuffers = [];

    this.currentEl = null;

    this.el.sceneEl.addEventListener('heightmap-loaded', evt => {
      const canvas = self.system.copyCanvas(evt.detail.canvas);
      const depthBuffer = evt.detail.depthBuffer;

      self.currentEl.setAttribute('material', 'displacementMap', canvas);

      self.system.renderDepthBuffer(depthBuffer);

      // TODO save depthbuffer to each tile
      // self.depthBuffer = depthBuffer;

      this._next();
    });

    this.el.sceneEl.addEventListener('overlaymap-loaded', evt => {
      console.log('MAP LOADED');
      const canvas = evt.detail.canvas;
      const copyCanvas = self.system.copyCanvas(canvas);
      self.currentEl.setAttribute('material', 'src', copyCanvas);

      this._next();
    });

    // preload
    // document.querySelector('a-scene').renderer.setTexture2D(ourTexture, 0);

    this.tiles = ['0,0'];
    this.queue = [];
    this._isBusy = true;

    this.mainTile = this._addTile('0,0',
      this.data.center,
      this.el.components.position);

    this.tick = AFRAME.utils.throttleTick(this.tick, 1500, this);
  },
  _next: function () {
    this._count += 1;
    this._count %= 2;
    if (this._count === 0) {
      this._isBusy = false;
      this.queue.shift();
    }
  },
  _addToQueue: function (tile, center, position) {
    this.queue.push({ tile, center, position });
  },
  _processQueue: function () {
    if (!this._isBusy && this.queue.length > 0) {
      const first = this.queue[0];
      this._isBusy = true;
      this.currentEl = this._addTile(first.tile, first.center, first.position);
      /* tile.addEventListener('tangram-terrain-loaded', (e) => {
        self._isBusy = false;
        self.queue.shift();
      });*/
    }
  },
  _addTile: function (tile, center, position) {
    this._isBusy = true;
    const data = this.data;

    const terrain = document.createElement('a-entity');

    terrain.setAttribute('id', 'terrainTile_' + tile);

    terrain.setAttribute('geometry', this.geomData);

    const matData = {
      // color: "#aaa",//data.wireframe,
      wireframe: data.wireframe,
      displacementScale: data.displacementScale,
      displacementBias: data.displacementBias
    };
    terrain.setAttribute('material', matData);

    terrain.setAttribute('position', position);

    this.el.appendChild(terrain);

    console.log('new terrain ');
    console.log(this.latLonFrom(center));

    this.currentEl = terrain;

    this.heightmap.map._loaded = false;
    this.heightmap.map.setView(this.latLonFrom(center), data.zoom, {animate: false, reset: true});
    this.overlaymap.map._loaded = false;
    this.overlaymap.map.setView(this.latLonFrom(center), data.zoom, {animate: false, reset: true});

    return terrain;
  },
  _checkPosition: function () {
    const data = this.data;
    // var pos = this.getCameraPosition(); // camera.getWorldPosition()
    // const pos = this.camera.getWorldPosition();
    const pos = new THREE.Vector3(); // TODO

    const x = Math.floor((pos.x + data.tileSize * 0.5) / data.tileSize);
    const y = Math.floor((-pos.z + data.tileSize * 0.5) / data.tileSize);

    this._addTileFor(x, y);
    if (data.radius > 0) {
      // clockwise
      this._addTileFor(x, y + 1);
      this._addTileFor(x + 1, y + 1);
      this._addTileFor(x + 1, y);
      this._addTileFor(x + 1, y - 1);
      this._addTileFor(x, y - 1);
      this._addTileFor(x - 1, y - 1);
      this._addTileFor(x - 1, y);
      this._addTileFor(x - 1, y + 1);
    }
  },
  _addTileFor: function (x, y) {
    const data = this.data;

    const tile = `${x},${y}`;

    if (!this.tiles.includes(tile)) {
      this.tiles.push(tile);

      var pX = x * (data.tileSize);
      var pY = y * (data.tileSize);

      var latLng = this.system.unproject(data, this.geomData, this.overlaymap.map, pX, pY);
      // this.mainTile.components['tangram-terrain'].unproject(pX, pY);

      console.log(x + ' ' + y);
      console.log(latLng);
      this._addToQueue(tile, [latLng.lon, latLng.lat],
        new THREE.Vector3(x * data.tileSize, y * data.tileSize, 0));
    }
  },
  tick: function (time, delta) {
    if (!this.heightmap.map) return;
    if (this._isBusy) return;

    this._checkPosition();
    this._processQueue();
  },
  getCameraPosition: function () {
    var worldPos = new THREE.Vector3();
    return function () {
      worldPos.setFromMatrixPosition(this.camera.matrixWorld);
      return worldPos;
    };
  }(),
  latLonFrom: function (lonLat) {
    return [lonLat[1].toString(), lonLat[0].toString()];
  },

  // TODO
  _getHeight: function (x, y) {
    const geomData = this.geomData;

    const pxX = (x + (geomData.width / 2)) * this.data.pxToWorldRatio;
    const pxY = ((geomData.height / 2) - y) * this.data.pxToWorldRatio;

    const depthBuffer = null; // TODO get depthbuffer from array

    const data = this.data;

    return this.system.hitTest(data, geomData, depthBuffer, pxX, pxY);
  },
  unprojectHeight: function (x, y) {
    const matData = this.el.components.material.data;
    return this._getHeight(x, y) * matData.displacementScale + matData.displacementBias;
  }

});
