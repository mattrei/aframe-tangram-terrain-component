AFRAME.registerComponent('map-geojson-on-heightmap', {
    dependencies: ['tangram-heightmap'],
    schema: {
        geojson: {
            type: "asset"
        }
    },
    init: function() {

        this.heightmap = this.el.components['tangram-heightmap']

        console.log(this.el.components['tangram-heightmap'])

        this.el.addEventListener('tangram-heightmap-loaded',
                this._create.bind(this))

    },
    _create: function(e) {

        

        var loader = new THREE.FileLoader();
        loader.load(this.data.geojson, file => {
            
            const geojson = JSON.parse(file)

            geojson.features.forEach(f => {
                if (f.geometry.type === "LineString") {
                    this._addLine(f)
                }  
            })


            
        })

    },
    _addLine: function(feature) {

        let points = feature.geometry.coordinates.map(c => {
            return this.heightmap.project(c[0], c[1])
        })

        console.log(points)


        var lineGeometry = new THREE.Geometry();
        points.forEach(p => {
            lineGeometry.vertices.push(new THREE.Vector(p.x, p.y, p.z))
        })

        var line = new THREE.Line( lineGeometry );
        line.name = `line_${feature.properties.name}`
        line.scale.z = 5;


        this.el.setObject3D(line.name, line)
    },

    tick: function(delta, time) {}
});