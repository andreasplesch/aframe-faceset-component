## aframe-faceset-component

A Face Set component for [A-Frame](https://aframe.io). This component produces a geometry directly constructed from the provided points. It includes optional triangulation and reasonable default texture coordinate calculations for convenient use. The envisioned use case is for geometries which are not compatible with simple geometric primitives but relatively easy to construct. Another use case is procedural geometry.

### Properties

| Property | Description | Default Value |
| -------- | ----------- | ------------- |
| vertices |  list of point  |  -0.5 0 0.5, 0.5 0 0.5,
| |          x, y, z triplets  |     0.5 0 -0.5, -0.5 0 -0.5   |
| triangles | list of face | empty list|
| |         index triplets |  |
| projectdir | axis along which | auto|
| |          to project for 2d triangulation | |
| uvs |    list of 2d vertex coord.  | empty list |
| crease | use creased shading | false |

- triangles: each triangle is defined by three indices into the vertices list. If no triangles are provided, Delaunay triangulation of the vertices is used. To determine the indices in this case, the vertices are first collapsed into a 2d plane along the axis given by the projectdir property.

- projectdir: one of x, y or z. Other values result in projection along the shortest dimension of the bounding box.

- uvs: the list should contain one 2d coordinate pair for each vertex in the vertices list. If no uvs are provided, uvs are assigned based on the two largest dimensions of the bounding box surrounding the vertices.The u coordinate varies from 0 to 1 along the largest dimension, the v coordinate along the second largest.

- crease: since the material component lacks this option, it is provided here.

### Usage

#### Browser Installation

Install and use by directly including the [browser files](dist):

```html
<head>
  <title>My A-Frame Scene</title>
  <script src="https://aframe.io/releases/0.2.0/aframe.min.js"></script>
  <script src="https://rawgit.com/andreasplesch/aframe-faceset-component/master/dist/aframe-faceset-component.min.js"></script>
</head>

<body>
  <a-scene>
    <a-entity example="exampleProp: exampleVal"></a-entity>
  </a-scene>
</body>
```

#### NPM Installation

Install via NPM:

```bash
npm install aframe-faceset-component
```

Then register and use.

```js
require('aframe');
require('aframe-faceset-component');
```
