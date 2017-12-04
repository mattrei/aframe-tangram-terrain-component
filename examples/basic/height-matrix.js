AFRAME.registerComponent('height-matrix', {
    schema: {
    },
    init: function () {
      this.enabled = false;
     
      
        const start = -8;
        const end = -1
        const gap = 0.2;

        this.el.addEventListener('terrain-loaded', evt => {
            for (var i=start; i <= end; i+=gap) {
                for (var j=start; j <= end; j+=gap) {
                    this._createSphere(i, j)
                }
            }
        })

      
    },
    _createSphere: function(x, y) {
        var e = document.createElement('a-sphere')
        e.setAttribute('color', 'blue')
        e.setAttribute('radius', '0.05')

        const tangramTerrain = this.el.components['tangram-terrain'];
        var height = tangramTerrain.unprojectHeight(x, y);

        //console.log(height)
        e.setAttribute('position', {
            x: x,
            y: y,
            z: height
        })
        this.el.appendChild(e)
    }

  });
  