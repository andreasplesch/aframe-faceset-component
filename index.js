if (typeof AFRAME === 'undefined') {
  throw new Error('Component attempted to register before AFRAME was available.');
}

//THREE.geometry
//directly provide vertices
//and indices = faces
//perhaps optionally triangulate
//using https://github.com/ironwallaby/delaunay
//rewrite using registerGeometry
//parsing from line example
//default texture coordinate from bbox .computeBoundingBox, .BoundingBox

var Delaunay = require('./lib/delaunay.js');

AFRAME.registerComponent('faceset', {
  schema: {
    //color: { default: '#000' },
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
        return data.map(AFRAME.utils.coordinates.stringify).join(',');
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
    crease: { default: false },
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
    var translateNeedsUpdate = !AFRAME.utils.deepEqual(data.translate, currentTranslate);
    var facesNeedUpdate = ( data.vertices.length !== g.vertices.length ) || 
                          ( data.triangles.length !== g.faces.length ) ;
    var uvsNeedUpdate = 'uvs' in diff || facesNeedUpdate ;

    if (geometryNeedsUpdate) {
      mesh.geometry.dispose(); // hm, old geometry is not gc'ed
      mesh.geometry = null;
      var mat = mesh.material;
      g = getGeometry(this.data, this.dmaps, facesNeedUpdate);
      mesh = new THREE.Mesh(g, mat);
      //this.el.object3DMap.mesh = mesh;
      this.el.setObject3D('mesh', mesh);
      g.verticesNeedUpdate = true; // issue #7179, does not work, will need replace vertices
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
    
    if (data.crease) { mesh.material.shading = THREE.FlatShading; };
    //g.computeBoundingSphere(); // have boundingBox
    
  },
    
  /**
   * Removes geometry on remove (callback).
   */
  remove: function () {
    this.el.getObject3D('mesh').geometry.dispose = new THREE.Geometry();
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

