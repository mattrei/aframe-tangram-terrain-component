/* global AFRAME THREE */

// https://github.com/felixpalmer/lod-terrain/blob/master/js/app/terrain.js

const Edge = {
  NONE: 0,
  TOP: 1,
  LEFT: 2,
  BOTTOM: 4,
  RIGHT: 8
};

AFRAME.registerComponent('tiles', {
  dependencies: [
    'position'
  ],
  schema: {
    apiKey: {
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
    worldWidth: {
      default: 20
    },
    levels: {
      default: 1
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

    this.system = this.el.sceneEl.systems['tangram-terrain'];

    this.camera = this.el.sceneEl.camera;
    this.depthBuffers = []  

    this.pivotEl = null;
    this.entities = []

    // preload
    // document.querySelector('a-scene').renderer.setTexture2D(ourTexture, 0);

    this.tiles = [] //'0,0'];
    this.queue = [];
    this._isBusy = false;

    this.isInitiated = false;


    const initialScale = data.worldWidth / Math.pow( 2, data.levels );
    console.log(initialScale)
    this.lastX = 0;
    this.lastY = 0;
    // Create center layer first
    //    +---+---+
    //    | O | O |
    //    +---+---+
    //    | O | O |
    //    +---+---+
    

/*
    this.createTile(0, 0, initialScale);
    this.createTile(0, initialScale, initialScale);
    this.createTile(initialScale, initialScale, initialScale);
    this.createTile(initialScale, 0, initialScale);
*/

    this.createTile( -initialScale, -initialScale, initialScale, Edge.NONE );
    this.createTile( -initialScale, 0, initialScale, Edge.NONE );
    this.createTile( 0, 0, initialScale, Edge.NONE );
    this.createTile( 0, -initialScale, initialScale, Edge.NONE );


    // Create "quadtree" of tiles, with smallest in center
    // Each added layer consists of the following tiles (marked 'A'), with the tiles
    // in the middle being created in previous layers
    // +---+---+---+---+
    // | A | A | A | A |
    // +---+---+---+---+
    // | A |   |   | A |
    // +---+---+---+---+
    // | A |   |   | A |
    // +---+---+---+---+
    // | A | A | A | A |
    // +---+---+---+---+

    /*
    for ( var scale = initialScale; scale < data.worldWidth; scale *= 2 ) {
      this.createTile( -2 * scale, -2 * scale, scale, Edge.BOTTOM | Edge.LEFT );
      this.createTile( -2 * scale, -scale, scale, Edge.LEFT );
      this.createTile( -2 * scale, 0, scale, Edge.LEFT );
      this.createTile( -2 * scale, scale, scale, Edge.TOP | Edge.LEFT );

      this.createTile( -scale, -2 * scale, scale, Edge.BOTTOM );
      // 2 tiles 'missing' here are in previous layer
      this.createTile( -scale, scale, scale, Edge.TOP );

      this.createTile( 0, -2 * scale, scale, Edge.BOTTOM );
      // 2 tiles 'missing' here are in previous layer
      this.createTile( 0, scale, scale, Edge.TOP );

      this.createTile( scale, -2 * scale, scale, Edge.BOTTOM | Edge.RIGHT );
      this.createTile( scale, -scale, scale, Edge.RIGHT );
      this.createTile( scale, 0, scale, Edge.RIGHT );
      this.createTile( scale, scale, scale, Edge.TOP | Edge.RIGHT );
    }
    */


    this.tick = AFRAME.utils.throttleTick(this.tick, 500, this);
  },
  _nextIf: function () {
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
    const data = this.data;

    if (!this._isBusy && this.queue.length > 0) {
      const first = this.queue[0];
      this._isBusy = true;


      let latLng = null;
      if (!this.isInitiated) {
        this.isInitiated = true;
        latLng = {
          lon: data.center[0],
          lat: data.center[1]
        }

        this.pivotEl = this._addTile(first.tile, latLng, first.position);
      } else {
        console.log(first.center)
        latLng = this.pivotEl.components['tangram-terrain'].unproject(first.center.pX, first.center.pY);

        this.pivotEl = this._addTile(first.tile, latLng, first.position);
      }

      
      this.pivotEl.addEventListener('tangram-terrain-loaded', (e) => {
        this._isBusy = false;
        this.queue.shift();
      });

      this.entities.push(this.pivotEl)
    }
  },
  _addTile: function (tile, latLng, position) {
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

    const terrainData = {
      singleton: true,
      lodCount: 4,
      lod: 1,  // TODO
      style: data.style,
      pxToWorldRatio: data.pxToWorldRatio,
      center: [latLng.lon, latLng.lat],
      zoom: data.zoom
    }

    terrain.setAttribute('tangram-terrain', terrainData)

    this.el.appendChild(terrain);

    console.log('new terrain ', latLng);
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
  createTile: function (x, y, scale, edge) {
    const data = this.data;

    const tile = `${x},${y}`;

    if (!this.tiles.includes(tile)) {
      this.tiles.push(tile);

      var pX = (x - this.lastX) * (data.tileSize) / scale;
      var pY = (y - this.lastY) * (data.tileSize) / scale;

      this.lastX = x;
      this.lastY = y;
      
      // this.mainTile.components['tangram-terrain'].unproject(pX, pY);

      console.log(x + ' ' + y);
      
      this._addToQueue(
        tile,
        {pX: pX, pY: pY},
        new THREE.Vector3(x * data.tileSize / scale, y * data.tileSize / scale, 0)
      );
      
    }
  },
  tick: function (time, delta) {
    if (this._isBusy) return;

    //this._checkPosition();
    this._processQueue();
    this.checkLOD();
  },
  checkLOD: function() {

    const cameraPos = this.el.sceneEl.camera.getWorldPosition();

    for (let entity of this.entities) {


        const terrainPos = entity.object3D.getWorldPosition();
    
        const dist = cameraPos.distanceTo(terrainPos);
        
        
        let lod = 1;
        if (dist > 25) {
          lod = 4;
        } else if (dist > 22) {
          lod = 3;
        } else if (dist > 18) {
          lod = 2;
        } else {
          lod = 1;
        }

        entity.setAttribute('tangram-terrain', 'lod', lod)
        
        //console.log(dist)

    }



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

    const depthBuffer = null //TODO get depthbuffer from array

    const data = this.data;

    return this.system.hitTest(data, geomData, depthBuffer, pxX, pxY);
  },
  unprojectHeight: function (x, y) {
    const matData = this.el.components.material.data;
    return this._getHeight(x, y) * matData.displacementScale + matData.displacementBias;
  }

});
