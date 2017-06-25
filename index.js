if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

var Delaunay = require('./lib/delaunay.js');

AFRAME.registerComponent('faceset', {
  schema: {
    vertices: {
      default: [
        { x: -0.5, y: 0, z: 0.5 },
        { x: 0.5, y: 0, z: 0.5 },
        { x: 0.5, y: 0, z: -0.5 },
        { x: -0.5, y: 0, z: -0.5 }
      ],
      // Deserialize vertices in the form of any-separated vec3s: `0 0 0, 1 1 1, 2 0 3`.
      parse: function (value) { return parseVec3s (value) },
      // Serialize array of vec3s in case someone does getAttribute('faceset', 'vertices', [...]).
      stringify: function (data) {
        return data.map(AFRAME.utils.coordinates.stringify).join(',');
      }
    },
    triangles: {
      default: [],
      // Deserialize index in the form of any-separated vec3s: `0 0 0, 1 1 1, 2 0 3`.
      parse: function (value) { return parseFace3s (value) } ,
      // Serialize array of vec3s in case someone does getAttribute('faceset', 'triangles', [...]).
      stringify: function (data) {
        return data.map(function face2coord(face) {
					return { x:face.a, y: face.b, z: face.c };
				} )
				.map(AFRAME.utils.coordinates.stringify).join(',');
      }
    }, 
    uvs: { // texture coordinates as list 
      default: [],
      parse: function (value) { return parseVec2s (value) } ,
      stringify: function (data) {
        return data.map( function stringify (data) {
          if (typeof data !== 'object') { return data; }
          return [data.x, data.y].join(' ');
        }).join(',');
      }
    },
    //crease: { default: false },
    projectdir: { 
      type: 'string',
      default: 'auto'
    }, // normal along which to project, x, y and z are recognized; otherwise based on bb
    translate: { type: 'vec3' }
  },
  
  init: function () {
    //always create new
    //collapse onto which plane
    this.dmaps = {
      x: {      //2d x coordinate will be
        x: 'y', //y if x size is smallest
        y: 'x',
        z: 'x'
      },
      y: {
        x: 'z',
        y: 'z',
        z: 'y'
      }
    }
    var mesh = this.el.getOrCreateObject3D('mesh', THREE.Mesh);
    mesh.geometry.dispose(); // remove BufferGeometry
    mesh.geometry = null;
    mesh.geometry = new THREE.Geometry(); // replace with regular geometry
  },

  update: function (previousData) {
   
    previousData = previousData || {};
    var data = this.data;
    var currentTranslate = previousData.translate || this.schema.translate.default;
    //var currentVertices = previousData.vertices || this.schema.vertices.default;
    //var currentTriangles = previousData.triangles || this.schema.triangles.default;
    
    var diff = AFRAME.utils.diff(previousData, data);
    var mesh = this.el.getOrCreateObject3D('mesh', THREE.Mesh);
    var g = mesh.geometry;
    var geometryNeedsUpdate = !( Object.keys(diff).length === 1 && ('translate' in diff || 'uvs' in diff) ); // also except uvs only diff
    var keepMesh = ( data.vertices.length == g.vertices.length ) && 
                   ( data.triangles.length == g.faces.length ) ;
		var translateNeedsUpdate = !AFRAME.utils.deepEqual(data.translate, currentTranslate);
		var facesNeedUpdate = true;
    var facesNeedUpdate = ( data.vertices.length !== g.vertices.length ) || 
                          ( data.triangles.length !== g.faces.length ) ;
    var uvsNeedUpdate = 'uvs' in diff || facesNeedUpdate ;
		

    if (geometryNeedsUpdate) {
			if (keepMesh) { updateGeometry(g, this.data); }
      else {
				mesh.geometry.dispose(); // hm, old geometry is not gc'ed
				mesh.geometry = null;
				var mat = mesh.material;
				g = getGeometry(this.data, this.dmaps, facesNeedUpdate);
				//var bg = new THREE.BufferGeometry().fromGeometry(g);
				mesh = new THREE.Mesh(g, mat);
				this.el.setObject3D('mesh', mesh);
      }
		}
    
    if (translateNeedsUpdate) {
      applyTranslate(g, data.translate, currentTranslate);
    }
    
    if (uvsNeedUpdate) {
      g.faceVertexUvs[0] = [];
      var fs = g.faces ;
      var _uvs = getUvs(data, g, this.dmaps)
      fs.forEach( function assignUVs(f, i) {
        g.faceVertexUvs[0].push( [ _uvs[f.a], _uvs[f.b], _uvs[f.c] ]) ;
      });
         
      g.uvsNeedUpdate = true;
    }
    
    g.mergeVertices();
			g.computeFaceNormals();
			g.computeVertexNormals();
      g.verticesNeedUpdate = true; // issue #7179, does not work, will need replace vertices
			
    //if (data.crease) { mesh.material.shading = THREE.FlatShading; };
    //g.computeBoundingSphere(); // have boundingBox
    
  },
    
  /**
   * Removes geometry on remove (callback).
   */
  remove: function () {
    this.el.getObject3D('mesh').geometry.dispose();
		this.el.getObject3D('mesh').geometry = new THREE.Geometry();
		
  }
});

function parseVec3s (value) {
  if (typeof value === 'object') {return value} // perhaps also check value.isArray
  var mc = value.match(/([+\-0-9eE\.]+)/g);
  var vecs = [];
  var vec = {};
  for (var i=0, n=mc?mc.length:0; i<n; i+=3) {
    vec = new THREE.Vector3(+mc[i+0], +mc[i+1], +mc[i+2]);
    vecs.push( vec );
  }
  return vecs;
}

function parseFace3s (value) {
  if (typeof value === 'object') {return value} // perhaps also check value.isArray
  var mc = value.match(/([+\-0-9eE\.]+)/g);
  var vecs = [];
  var vec = {};
  for (var i=0, n=mc?mc.length:0; i<n; i+=3) {
    vec = new THREE.Face3(+mc[i+0], +mc[i+1], +mc[i+2]);
    vecs.push( vec );
  }
  return vecs;
}

function parseVec2s (value) {
  if (typeof value === 'object') {return value} // perhaps also check value.isArray
  var mc = value.match(/([+\-0-9eE\.]+)/g);
  var vecs = [];
  var vec = {};
  for (var i=0, n=mc?mc.length:0; i<n; i+=2) {
    vec = new THREE.Vector2(+mc[i+0], +mc[i+1]);
    vecs.push( vec );
  }
  return vecs;
}

function updateGeometry (g, data) {
	g.vertices.forEach(function applyXYZ (v, i) {
		var d = data.vertices[i];
		g.vertices[i].set(d.x, d.y, d.z);
	});
  g.computeBoundingBox();
}


function getGeometry (data, dmaps, facesNeedUpdate) {
  var geometry = new THREE.Geometry();
  
  geometry.vertices = data.vertices;
  geometry.computeBoundingBox();

  if ( data.triangles.length == 0 ) {
    //if no triangles triangulate
    //find shortest dimension and ignore it for 2d vertices
    var size = BboxSize(geometry);
    var dir = ProjectionDirection(data, size);
    var xd = dmaps.x[dir];
    var yd = dmaps.y[dir];
    var vertices2d = data.vertices.map (
      function project (vtx) {
        //some very minor fuzzing to avoid identical vertices for triangulation
        //var fuzz = 1/10000; // 1/100000 too small if size around 1
        //var xfuzz = size[xd] * (Math.random() - 0.5) * fuzz;
        //var yfuzz = size[yd] * (Math.random() - 0.5) * fuzz;
        return [ vtx[xd] + 0, vtx[yd] + 0 ]
      }
    );
    //vertices2d: array of arrays [[2, 4], [5, 6]]
    //triangles: flat array of indices [0, 1, 2,   2, 1, 3 ]
    var triangles = Delaunay.triangulate(vertices2d); // look for a more robust algo
    for (var i=0; i < triangles.length; i+=3) {
      geometry.faces.push(
        new THREE.Face3( triangles[i], triangles[i+1], triangles[i+2] )
      );
    }
    return geometry
  }
  
  //if (facesNeedUpdate) { geometry.faces = data.triangles; } ;
  geometry.faces = data.triangles;
  
  return geometry
}

function BboxSize (geometry) {
  
  var bb = geometry.boundingBox;
    
  var size = bb.max.clone();
  size.sub(bb.min);
  return size
  
} 

function ProjectionDirection (data, size) {
  
    var dir = data.projectdir.toLowerCase();
    if ( !(dir === 'x' || dir === 'y' || dir === 'z') ) { // auto dir
      dir = 'z';
      if ( (size.x < size.y) && (size.x < size.z) ) { dir = 'x';}
      if ( (size.y < size.x) && (size.y < size.z) ) { dir = 'y';}
      // if size.y < size.x && size.y < size.z {xd='x',yd='z'}
    }
    return dir
}

function getUvs (data, g, dmaps) {
  var uvs = data.uvs ;
  if ( uvs.length > 0 ) {
    var uvsLength = +uvs.length ;
    //fill in missing uvs if any
    for (var i = uvsLength; i < g.vertices.length; i++) {
      uvs.push(uvs[uvsLength].clone) ;
    }
    return uvs
  }
  //else {
    //produce default uvs
    var size = BboxSize(g);
    var dir = ProjectionDirection(data, size);
    var xd = dmaps.x[dir];
    var yd = dmaps.y[dir];
    var vs = g.vertices;
    var bb = g.boundingBox ;
    var xoffset = bb.min[xd];
    var yoffset = bb.min[yd];
    var tmpUvs = [];
    vs.forEach( function computeUV(v) {
      tmpUvs.push( new THREE.Vector2 (
        (v[xd] - xoffset) / size[xd] ,
        (v[yd] - yoffset) / size[yd] 
        ));
    });
    
    return tmpUvs 
}

/**
 * Translates geometry vertices.
 *
 * @param {object} geometry - three.js geometry.
 * @param {object} translate - New translation.
 * @param {object} currentTranslate - Currently applied translation.
 */
function applyTranslate (geometry, translate, currentTranslate) {
  var translation = helperMatrix.makeTranslation(
    translate.x - currentTranslate.x,
    translate.y - currentTranslate.y,
    translate.z - currentTranslate.z
  );
  geometry.applyMatrix(translation);
  geometry.verticesNeedsUpdate = true;
}

//primitive

var extendDeep = AFRAME.utils.extendDeep;
// The mesh mixin provides common material properties for creating mesh-based primitives.
// This makes the material component a default component and maps all the base material properties.
var meshMixin = AFRAME.primitives.getMeshMixin();
AFRAME.registerPrimitive('a-faceset', extendDeep({}, meshMixin, {
  // Preset default components. These components and component properties will be attached to the entity out-of-the-box.
  defaultComponents: {
    faceset: {}
  },
  // Defined mappings from HTML attributes to component properties (using dots as delimiters).
  // If we set `depth="5"` in HTML, then the primitive will automatically set `geometry="depth: 5"`.
  mappings: {
    vertices: 'faceset.vertices',
    triangles: 'faceset.triangles',
    uvs: 'faceset.uvs',
    projectdir: 'faceset.projectdir'
  }
}));