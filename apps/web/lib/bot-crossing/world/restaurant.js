import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const palette = ['#1b9985', '#db7867', '#8587c4', '#4b91b5']

/** Cutaway restaurants share Bot Crossing's renderer and camera, not its space-colony assets. */
export class RestaurantWorld {
  constructor(scene, outlets, language) {
    this.scene = scene
    this.root = new THREE.Group()
    this.restaurants = new Map()
    this.robots = []
    this.materials = new Map()
    this.geometries = new Map()
    this.textures = []
    this.mode = 'service'
    this.time = 0
    this.root.name = 'ganita-restaurant-world'
    scene.add(this.root)
    scene.background = new THREE.Color('#c9dfdf')
    scene.add(this.ambient = new THREE.HemisphereLight('#ffffff', '#90a6a0', 1.7))
    scene.add(this.sun = new THREE.DirectionalLight('#fff4e5', 2.4))
    this.sun.position.set(15, 35, 20)
    this.sun.castShadow = true
    Object.assign(this.sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 100 })
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.001

    const columns = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(outlets.length))))
    const rows = Math.max(1, Math.ceil(outlets.length / columns))
    this.extent = Math.max(columns * 23, rows * 22)
    this.width = columns * 23 + 12
    this.depth = rows * 22 + 12
    this.box(this.root, [columns * 23 + 12, 0.65, rows * 22 + 12], [0, -0.7, 0], '#92bcb0', 0.3)
    this.box(this.root, [columns * 23 + 10, 0.16, rows * 22 + 10], [0, -0.28, 0], '#dbe6df', 0.1)
    outlets.forEach((outlet, i) => {
      const x = (i % columns - (columns - 1) / 2) * 23
      const z = (Math.floor(i / columns) - (rows - 1) / 2) * 22
      this.restaurant(outlet, i, x, z, language)
    })
    for (let i = 0; i < columns * 2 + 2; i++) {
      const x = (i / (columns * 2 + 1) - 0.5) * (columns * 23 + 6)
      this.tree(x, -rows * 11 - 3)
      this.tree(x, rows * 11 + 3)
    }
  }

  material(color) {
    if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.72 }))
    return this.materials.get(color)
  }

  mesh(parent, geometry, color, position) {
    const mesh = new THREE.Mesh(geometry, this.material(color))
    mesh.position.set(...position)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  box(parent, size, position, color, radius = 0.07) {
    const key = `box:${size}:${radius}`
    if (!this.geometries.has(key)) this.geometries.set(key, new RoundedBoxGeometry(...size, 2, radius))
    return this.mesh(parent, this.geometries.get(key), color, position)
  }

  ball(parent, radius, position, color, scale = [1, 1, 1]) {
    const key = `sphere:${radius}`
    if (!this.geometries.has(key)) this.geometries.set(key, new THREE.SphereGeometry(radius, 12, 8))
    const mesh = this.mesh(parent, this.geometries.get(key), color, position)
    mesh.scale.set(...scale)
    return mesh
  }

  cylinder(parent, radius, height, position, color) {
    const key = `cylinder:${radius}:${height}`
    if (!this.geometries.has(key)) this.geometries.set(key, new THREE.CylinderGeometry(radius, radius, height, 16))
    return this.mesh(parent, this.geometries.get(key), color, position)
  }

  label(parent, text, position, width, background = '#173d34', foreground = '#ffffff') {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 160
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = background
    ctx.beginPath(); ctx.roundRect(0, 0, 1024, 160, 24); ctx.fill()
    ctx.fillStyle = foreground
    let size = 64
    ctx.font = `600 ${size}px sans-serif`
    while (ctx.measureText(text).width > 930 && size > 24) ctx.font = `600 ${--size}px sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, 512, 80, 940)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.textures.push(texture)
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false })
    const sprite = new THREE.Sprite(material)
    sprite.position.set(...position)
    sprite.scale.set(width, width / 6.4, 1)
    sprite.renderOrder = 2
    parent.add(sprite)
    return sprite
  }

  plant(parent, x, z) {
    this.cylinder(parent, 0.36, 0.6, [x, 0.4, z], '#f7f8f2')
    for (let i = 0; i < 4; i++) this.ball(parent, 0.34, [x + Math.sin(i * 2) * 0.2, 0.96 + i * 0.12, z + Math.cos(i * 2) * 0.2], i % 2 ? '#41967a' : '#70b481', [0.8, 1.5, 0.8])
  }

  tree(x, z) {
    this.cylinder(this.root, 0.18, 1.7, [x, 0.7, z], '#8c7970')
    this.ball(this.root, 1.35, [x, 2.5, z], '#599a78', [1, 1.3, 1])
    this.ball(this.root, 0.9, [x + 0.6, 2.1, z + 0.3], '#76b68c')
  }

  restaurant(outlet, index, x, z, language) {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.userData.outletId = outlet.id
    this.root.add(group)
    const accent = palette[index % palette.length]
    const base = this.box(group, [20, 0.55, 18], [0, 0.1, 0], '#c5d6d1', 0.24)
    this.box(group, [19.3, 0.18, 17.3], [0, 0.46, 0], '#fafbf8')
    // The open front and side make the dining room and kitchen readable from above.
    this.box(group, [19.3, 3.2, 0.3], [0, 2, -8.5], '#eff1e9')
    this.box(group, [0.3, 3.2, 17.3], [-9.5, 2, 0], '#e5eee9')
    this.box(group, [19.5, 0.16, 0.42], [0, 3.65, -8.5], accent)
    this.box(group, [0.42, 0.16, 17.3], [-9.5, 3.65, 0], accent)
    for (let i = 0; i < 3; i++) {
      this.box(group, [3, 1.6, 0.15], [-6 + i * 6, 2.35, -8.27], '#89bec8')
      this.box(group, [0.1, 1.6, 0.2], [-6 + i * 6, 2.35, -8.15], '#ffffff')
    }
    // Kitchen tiles, prep line, stove, sink, and ingredient shelving.
    for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) this.box(group, [2.02, 0.06, 1.35], [-8.2 + i * 2.05, 0.59, -6.85 + j * 1.4], (i + j) % 2 ? '#b8d4d0' : '#e8f1eb', 0.01)
    this.box(group, [10.5, 1.55, 1.65], [-2.7, 1.35, -7.1], '#a6bcbc')
    this.box(group, [10.7, 0.15, 1.8], [-2.7, 2.2, -7.1], '#f8fcfc')
    for (let i = 0; i < 4; i++) {
      this.cylinder(group, 0.4, 0.06, [-6.4 + (i % 2) * 1.1, 2.32, -7.55 + Math.floor(i / 2) * 0.85], '#354e50')
    }
    this.cylinder(group, 0.36, 0.45, [-6.4, 2.56, -7.55], '#5a777c')
    this.box(group, [1.7, 0.07, 1], [-2.5, 2.31, -7], '#d5b57c')
    for (let i = 0; i < 3; i++) this.ball(group, 0.16, [-2.9 + i * 0.35, 2.44, -7], '#e66e59')
    this.box(group, [1.5, 0.06, 1.1], [1.1, 2.31, -7], '#617f87')
    this.box(group, [0.1, 0.6, 0.1], [1.1, 2.58, -7.65], '#bbcbd0')
    this.box(group, [2.2, 3, 1.6], [7.5, 2, -7.2], '#e0e9e9')
    this.box(group, [0.09, 0.8, 0.12], [8.15, 2.3, -6.32], '#759594')
    for (let shelf = 0; shelf < 2; shelf++) {
      this.box(group, [3, 0.13, 1.3], [4.5, 1.2 + shelf, -7.2], '#b99c7a')
      for (let jar = 0; jar < 3; jar++) this.cylinder(group, 0.23, 0.55, [3.6 + jar * 0.8, 1.54 + shelf, -7.2], ['#e9b56e', '#91b990', '#dca490'][jar])
    }
    this.box(group, [13.5, 1.3, 0.85], [-2.1, 1.15, -2.7], accent)
    this.box(group, [13.8, 0.18, 1.1], [-2.1, 1.88, -2.7], '#f6f4e9')
    for (let i = 0; i < 3; i++) this.cylinder(group, 0.35, 0.08, [-4 + i * 2, 2.03, -2.7], '#ffffff')
    // Dining tables with plates, flower pots, and upholstered chairs.
    for (const tx of [-5.8, -0.4, 5.1]) for (const tz of [0.4, 5]) {
      this.cylinder(group, 0.18, 1.2, [tx, 1.2, tz], '#45585a')
      this.box(group, [2.9, 0.2, 2.1], [tx, 1.9, tz], '#e2b986', 0.18)
      for (const sign of [-1, 1]) {
        this.box(group, [1.05, 0.22, 1], [tx, 1.08, tz + sign * 1.8], accent, 0.16)
        this.box(group, [1.05, 0.85, 0.18], [tx, 1.48, tz + sign * 2.2], accent, 0.12)
        for (const side of [-0.35, 0.35]) this.box(group, [0.12, 0.6, 0.12], [tx + side, 0.73, tz + sign * 1.8], '#566563')
        this.cylinder(group, 0.34, 0.06, [tx, 2.05, tz + sign * 0.6], '#ffffff')
        this.ball(group, 0.15, [tx, 2.15, tz + sign * 0.6], '#7daa68', [1.5, 0.5, 1])
      }
      this.cylinder(group, 0.13, 0.25, [tx + 0.8, 2.16, tz], '#ffffff')
      this.ball(group, 0.19, [tx + 0.8, 2.4, tz], '#e498ad')
    }
    // Checkout counter and a striped entrance canopy.
    this.box(group, [2.2, 1.5, 2], [8, 1.3, 3.5], accent)
    this.box(group, [2.4, 0.16, 2.2], [8, 2.13, 3.5], '#fbf7ee')
    this.box(group, [0.8, 0.65, 0.13], [8, 2.55, 3.3], '#243d42').rotation.x = -0.25
    for (const px of [-3.8, 3.8]) this.box(group, [0.15, 3.4, 0.15], [px, 2.1, 9.1], '#f7f9f4')
    for (let i = 0; i < 10; i++) {
      this.box(group, [0.8, 0.16, 1.8], [-3.6 + i * 0.8, 3.84, 8.9], i % 2 ? '#f8f8f0' : accent)
      this.box(group, [0.8, 0.4, 0.12], [-3.6 + i * 0.8, 3.62, 9.8], i % 2 ? '#f8f8f0' : accent)
    }
    this.plant(group, -8.5, 7.5); this.plant(group, 8.5, 7.5)
    this.label(group, outlet.outletName, [0, 6.7, -6.5], 11)
    const scoreColor = outlet.score == null ? '#536d79' : outlet.score < 60 ? '#b94d49' : outlet.score < 78 ? '#956813' : '#16755e'
    const status = outlet.score == null ? (language === 'id' ? 'Belum ada skor' : 'No score yet') : `${outlet.score}/100 | ${outlet.score < 60 ? (language === 'id' ? 'Kritis' : 'Critical') : outlet.score < 78 ? (language === 'id' ? 'Perlu perhatian' : 'Needs attention') : (language === 'id' ? 'Sehat' : 'Healthy')}`
    this.label(group, status, [0, 4.4, -6.5], 9.5, scoreColor)
    this.restaurants.set(outlet.id, { group, base, position: new THREE.Vector3(x, 0, z) })
    for (let i = 0; i < 3; i++) {
      const robot = this.robot(group, i === 0 ? '#27bda3' : i === 1 ? '#e8ad55' : '#8597d0')
      this.robots.push({ mesh: robot, outletId: outlet.id, phase: i * 2.1 + index, index: i })
    }
  }

  robot(parent, accent) {
    const group = new THREE.Group()
    group.scale.setScalar(1.12)
    parent.add(group)
    this.box(group, [0.75, 0.9, 0.5], [0, 1.2, 0], '#edf2ef', 0.2)
    this.box(group, [0.6, 0.65, 0.1], [0, 1.16, 0.28], '#244a43', 0.06)
    this.ball(group, 0.1, [0, 1.35, 0.36], accent)
    this.box(group, [1.18, 0.92, 0.82], [0, 2.03, 0], '#f8f6ee', 0.25)
    this.box(group, [0.98, 0.68, 0.12], [0, 2.03, 0.43], '#112f32', 0.2)
    for (const sign of [-1, 1]) {
      this.ball(group, 0.065, [sign * 0.24, 2.14, 0.51], '#4ee7d2', [1, 1.4, 0.6])
      this.ball(group, 0.22, [sign * 0.66, 2.03, 0], accent, [0.5, 1, 1])
      this.ball(group, 0.19, [sign * 0.5, 1.22, 0], '#f6f8f1', [0.8, 1.6, 0.8])
      this.box(group, [0.31, 0.3, 0.45], [sign * 0.25, 0.6, 0.08], '#eaf0eb', 0.1)
    }
    this.ball(group, 0.12, [0, 1.88, 0.52], '#4ee7d2', [1, 0.4, 0.5])
    this.cylinder(group, 0.43, 0.15, [0, 2.56, 0], '#ffffff')
    for (const [x, y] of [[-0.24, 2.74], [0, 2.84], [0.24, 2.74]]) this.ball(group, 0.29, [x, y, 0], '#ffffff')
    this.box(group, [0.43, 0.6, 0.09], [0.55, 1.2, 0.3], accent)
    return group
  }

  select(id) {
    for (const [key, restaurant] of this.restaurants) restaurant.base.material = this.material(key === id ? '#38bea4' : '#c5d6d1')
  }

  update(dt, paused) {
    if (!paused) this.time += dt
    for (const robot of this.robots) {
      const time = this.time * 0.55 + robot.phase
      const kitchen = this.mode === 'kitchen' || robot.index === 1
      const stock = this.mode === 'stock' && robot.index !== 1
      const x = stock ? 5.4 + Math.sin(time) : kitchen ? -3.5 + Math.sin(time) * 3 : (robot.index === 0 ? -3 : 2.6) + Math.sin(time) * 0.2
      const z = stock ? -4.3 : kitchen ? -4.6 : 2.5 + Math.sin(time) * 3
      robot.mesh.position.set(x, Math.abs(Math.sin(time * 8)) * 0.045, z)
      robot.mesh.rotation.y = stock ? -0.7 : kitchen ? Math.PI : Math.cos(time) > 0 ? 0.3 : Math.PI - 0.3
    }
  }

  pick(x, y, camera) {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(x, y), camera)
    const hits = ray.intersectObjects([...this.restaurants.values()].map(r => r.group), true)
    for (const hit of hits) {
      let object = hit.object
      while (object) { if (object.userData.outletId) return object.userData.outletId; object = object.parent }
    }
    return null
  }

  dispose() {
    this.root.traverse(object => { if (object.isSprite) object.material.dispose() })
    this.geometries.forEach(geometry => geometry.dispose())
    this.materials.forEach(material => material.dispose())
    this.textures.forEach(texture => texture.dispose())
    this.sun.shadow.dispose()
    this.scene.remove(this.root, this.sun, this.ambient)
  }
}
