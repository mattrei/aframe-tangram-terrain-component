/* global AFRAME THREE */

// https://github.com/felixpalmer/lod-terrain/blob/master/js/app/terrain.js

const Edge = {
  NONE: 0,
  TOP: 1,
  LEFT: 2,
  BOTTOM: 4,
  RIGHT: 8
};

const POOL_SIZE = 1;

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
      default: 1
    },
    levels: {
      default: 1
    },
    useLOD: {
      default: false,
      type: 'boolean'
    }
  },

  init: function () {
    this._count = 0;

    this.numTangrams = 0;


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

    this.tilesLoaded = 0;
    this.tilesTotal = 0;


    const initialScale = data.worldWidth / Math.pow(2, data.levels);
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


    this.createTile(-initialScale, -initialScale, initialScale, Edge.NONE);
    this.createTile(-initialScale, 0, initialScale, Edge.NONE);
    this.createTile(0, 0, initialScale, Edge.NONE);
    this.createTile(0, -initialScale, initialScale, Edge.NONE);

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

    const geomData = {
      segmentsWidth: (data.tileSegments) * Math.sqrt(this.tilesTotal),
      segmentsHeight: (data.tileSegments) * Math.sqrt(this.tilesTotal)

    }
    const hmData = {
      singleton: true
    }

    this.handleHeightmapCanvas = this.handleHeightmapCanvas.bind(this)
    this.heightmap = this.system.getOrCreateHeightmap(hmData, geomData, this.handleHeightmapCanvas);

    this.tick = AFRAME.utils.throttleTick(this.tick, 1000, this);
  },
  handleHeightmapCanvas: function (event) {

    const data = this.data;
    const renderer = this.el.sceneEl.renderer;

    const canvas = this.system.copyCanvas(event.canvas)
    const depthBuffer = event.depthBuffer;


    const worldWidth = data.worldWidth / Math.pow(2, data.levels);
    console.log(worldWidth)
    const f = Math.sqrt(this.tilesTotal) // 2

    for (let entity of this.entities) {
      if (!entity.hm) {
        const el = entity.el;
        const pos = el.object3D.position
        // canvas coordinate start from upper-left

        let x = pos.x + data.tileSize * data.worldWidth
        let y = pos.y + data.tileSize * data.worldWidth
        console.log(x + ' ' + y)

        x = x / data.tileSize
        y = f - (y / data.tileSize) - 1

        x = (canvas.width - 1) / f * x
        y = (canvas.height - 1) / f * y
        //const x = canvas.width / f - Math.abs(pos.x);
        //const y = canvas.height / f - Math.abs(pos.y);
        const w = data.tileSegments + 1;
        const h = data.tileSegments + 1;

        console.log(pos)
        console.log('copy ' + x + ' ' + y + ' ' + w + ' ' + h)

        const tileCanvas = this.system.copyCanvasTile(canvas, x, y, w, h)
        //console.log("Pixel",  tileCanvas.getContext('2d').getImageData(0, 0, 1, 1).data);
        el.setAttribute('material', 'displacementMap', tileCanvas)
        entity.hm = true;
      }

    }


    /*
    if (data.depthBuffer) {
        this.system.renderDepthBuffer(depthBuffer);
        this.depthBuffer = depthBuffer;
    }
    */

  },
  _addToQueue: function (tile, center, position) {
    this.queue.push({
      tile,
      center,
      position
    });
  },
  _processQueue: function () {
    const data = this.data;

    if (this.numTangrams < POOL_SIZE && this.queue.length > 0) {
      this.numTangrams++;
      const first = this.queue[0];
      this._isBusy = true;

      let center = null;

      let latLng = null;
      if (!this.isInitiated) {
        this.isInitiated = true;
        latLng = {
          lon: data.center[0],
          lat: data.center[1]
        }

        this.pivotEl = this._addTile(first.tile, latLng, first.position);


      } else {

        latLng = this.pivotEl.components['tangram-terrain'].unproject(first.center.pX, first.center.pY);
        this.pivotEl = this._addTile(first.tile, latLng, first.position);

      }

      center = first.center;
      this.pivotEl.addEventListener('tangram-terrain-loaded', (evt) => {


        this.tilesLoaded++;

        const map = evt.target.components['tangram-terrain'].getMap();
        const bounds = map.getBounds()


        if (!this.heightmapBounds) {
          this.heightmapBounds = new L.LatLngBounds(bounds.getSouthWest(), bounds.getNorthEast())
        } else {
          this.heightmapBounds.extend(bounds)
        }


        this.entities.push({
          el: this.pivotEl,
          center: center,
          hm: false
        })


        if (this.tilesLoaded === this.tilesTotal) {
          
          if (this.heightmap) {
              console.log("FIT hm bounds", this.heightmapBounds)
              this.heightmap.fitBounds(this.heightmapBounds)
              this.heightmap.invalidateSize();
              this.heightmap.fitBounds(this.heightmapBounds)
          }
        }

        this.numTangrams--;
        console.log("LOADED")
        
      });


      this.queue.shift();
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
      lod: 1, // TODO
      style: data.style,
      pxToWorldRatio: data.pxToWorldRatio,
      center: [latLng.lon, latLng.lat],
      zoom: data.zoom,
      useHeightmap: !this.heightmap
    }

    terrain.setAttribute('tangram-terrain', terrainData)

    this.el.appendChild(terrain);
    return terrain;
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

      console.log("Tile", x + ' ' + y);
      console.log("Tile p", pX + ' ' + pY);

      this.tilesTotal++;

      this._addToQueue(
        tile, {
          pX: pX,
          pY: pY
        },
        new THREE.Vector3(x * data.tileSize / scale, y * data.tileSize / scale, 0)
      );


    }
  },
  tick: function (time, delta) {
    //if (this._isBusy) return;

    this._processQueue();
    if (this.data.useLOD) {
      this.checkLOD();
    }
  },
  checkLOD: function () {

    const cameraPos = this.el.sceneEl.camera.getWorldPosition();

    for (let entity of this.entities) {

      const el = entity.el;

      const terrainPos = el.object3D.getWorldPosition();

      const dist = cameraPos.distanceTo /*Squared*/ (terrainPos);


      let lod = 1;
      if (dist > 35) {
        lod = 4;
      } else if (dist > 30) {
        lod = 3;
      } else if (dist > 20) {
        lod = 2;
      } else {
        lod = 1;
      }

      el.setAttribute('tangram-terrain', 'lod', lod)

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