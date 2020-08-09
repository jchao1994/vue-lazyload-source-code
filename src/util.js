import assign from 'assign-deep'

const inBrowser = typeof window !== 'undefined' && window !== null

export const hasIntersectionObserver = checkIntersectionObserver()

function checkIntersectionObserver () {
  if (inBrowser &&
    'IntersectionObserver' in window &&
    'IntersectionObserverEntry' in window &&
    'intersectionRatio' in window.IntersectionObserverEntry.prototype) {
  // Minimal polyfill for Edge 15's lack of `isIntersecting`
  // See: https://github.com/w3c/IntersectionObserver/issues/211
    if (!('isIntersecting' in window.IntersectionObserverEntry.prototype)) {
      Object.defineProperty(window.IntersectionObserverEntry.prototype,
        'isIntersecting', {
          get: function () {
            return this.intersectionRatio > 0
          }
        })
    }
    return true
  }
  return false
}

export const modeType = {
  event: 'event',
  observer: 'observer'
}

// CustomEvent polyfill
const CustomEvent = (function () {
  if (!inBrowser) return
  if (typeof window.CustomEvent === 'function') return window.CustomEvent
  function CustomEvent (event, params) {
    params = params || { bubbles: false, cancelable: false, detail: undefined }
    var evt = document.createEvent('CustomEvent')
    evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail)
    return evt
  }
  CustomEvent.prototype = window.Event.prototype
  return CustomEvent
})()

function remove (arr, item) {
  if (!arr.length) return
  const index = arr.indexOf(item)
  if (index > -1) return arr.splice(index, 1)
}

function some (arr, fn) {
  let has = false
  for (let i = 0, len = arr.length; i < len; i++) {
    if (fn(arr[i])) {
      has = true
      break
    }
  }
  return has
}

// 根据data-srcset获取最佳的bestSelectedSrc(width比containerWidth大的最小的src)
// srcset="images/bg_star.jpg 1200w, images/share.jpg 800w, images/gun.png 320w"
function getBestSelectionFromSrcset (el, scale) {
  if (el.tagName !== 'IMG' || !el.getAttribute('data-srcset')) return

  let options = el.getAttribute('data-srcset')
  const result = []
  const container = el.parentNode
  const containerWidth = container.offsetWidth * scale

  let spaceIndex
  let tmpSrc
  let tmpWidth

  options = options.trim().split(',')

  options.map(item => {
    item = item.trim()
    spaceIndex = item.lastIndexOf(' ')
    if (spaceIndex === -1) {
      tmpSrc = item
      tmpWidth = 999998
    } else {
      tmpSrc = item.substr(0, spaceIndex)
      tmpWidth = parseInt(item.substr(spaceIndex + 1, item.length - spaceIndex - 2), 10)
    }
    result.push([tmpWidth, tmpSrc])
  })

  // 按width降序排序，width相同根据src中是否带有.webp排序
  result.sort(function (a, b) {
    if (a[0] < b[0]) {
      return 1
    }
    if (a[0] > b[0]) {
      return -1
    }
    if (a[0] === b[0]) {
      if (b[1].indexOf('.webp', b[1].length - 5) !== -1) {
        return 1
      }
      if (a[1].indexOf('.webp', a[1].length - 5) !== -1) {
        return -1
      }
    }
    return 0
  })
  let bestSelectedSrc = ''
  let tmpOption

  // 遍历result，找到正好比containerWidth大且下一个就比containerWidth小的src作为bestSelectedSrc
  // 如果都比containerWidth大，就取最后一个(也就是最小的，因为之前做了降序排序)
  for (let i = 0; i < result.length; i++) {
    tmpOption = result[i]
    bestSelectedSrc = tmpOption[1]
    const next = result[i + 1]
    if (next && next[0] < containerWidth) {
      bestSelectedSrc = tmpOption[1]
      break
    } else if (!next) {
      bestSelectedSrc = tmpOption[1]
      break
    }
  }

  return bestSelectedSrc
}

function find (arr, fn) {
  let item
  for (let i = 0, len = arr.length; i < len; i++) {
    if (fn(arr[i])) {
      item = arr[i]
      break
    }
  }
  return item
}

const getDPR = (scale = 1) => inBrowser ? (window.devicePixelRatio || scale) : scale

function supportWebp () {
  if (!inBrowser) return false

  let support = true
  const d = document

  try {
    let el = d.createElement('object')
    el.type = 'image/webp'
    el.style.visibility = 'hidden'
    el.innerHTML = '!'
    d.body.appendChild(el)
    support = !el.offsetWidth
    d.body.removeChild(el)
  } catch (err) {
    support = false
  }

  return support
}

// 时间戳节流函数
function throttle (action, delay) {
  let timeout = null
  let lastRun = 0
  return function () {
    if (timeout) {
      return
    }
    let elapsed = Date.now() - lastRun
    let context = this
    let args = arguments
    let runCallback = function () {
      lastRun = Date.now()
      timeout = false
      action.apply(context, args)
    }
    if (elapsed >= delay) {
      runCallback()
    } else {
      timeout = setTimeout(runCallback, delay)
    }
  }
}

function testSupportsPassive () {
  if (!inBrowser) return
  let support = false
  try {
    let opts = Object.defineProperty({}, 'passive', {
      get: function () {
        support = true
      }
    })
    window.addEventListener('test', null, opts)
  } catch (e) {}
  return support
}

const supportsPassive = testSupportsPassive()

// 监听和移除事件
const _ = {
  on (el, type, func, capture = false) {
    if (supportsPassive) {
      el.addEventListener(type, func, {
        capture: capture,
        passive: true
      })
    } else {
      el.addEventListener(type, func, capture)
    }
  },
  off (el, type, func, capture = false) {
    el.removeEventListener(type, func, capture)
  }
}

// 异步加载image，成功执行resolve，失败执行reject
const loadImageAsync = (item, resolve, reject) => {
  let image = new Image()
  if (!item || !item.src) {
    const err = new Error('image src is required')
    return reject(err)
  }

  image.src = item.src
  if (item.cors) {
    image.crossOrigin = item.cors
  }

  image.onload = function () {
    resolve({
      naturalHeight: image.naturalHeight, // 图像原始高度
      naturalWidth: image.naturalWidth, // 图像原始宽度
      src: image.src
    })
  }

  image.onerror = function (e) {
    reject(e)
  }
}

const style = (el, prop) => {
  return typeof getComputedStyle !== 'undefined'
    ? getComputedStyle(el, null).getPropertyValue(prop)
    : el.style[prop]
}

const overflow = (el) => {
  return style(el, 'overflow') + style(el, 'overflow-y') + style(el, 'overflow-x')
}

const scrollParent = (el) => {
  if (!inBrowser) return
  if (!(el instanceof HTMLElement)) {
    return window
  }

  let parent = el

  while (parent) {
    if (parent === document.body || parent === document.documentElement) {
      break
    }

    if (!parent.parentNode) {
      break
    }

    if (/(scroll|auto)/.test(overflow(parent))) {
      return parent
    }

    parent = parent.parentNode
  }

  return window
}

function isObject (obj) {
  return obj !== null && typeof obj === 'object'
}

function ObjectKeys (obj) {
  if (!(obj instanceof Object)) return []
  if (Object.keys) {
    return Object.keys(obj)
  } else {
    let keys = []
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        keys.push(key)
      }
    }
    return keys
  }
}

// 类数组转换为数组
function ArrayFrom (arrLike) {
  let len = arrLike.length
  const list = []
  for (let i = 0; i < len; i++) {
    list.push(arrLike[i])
  }
  return list
}

function noop () {}

// image缓存，当缓存数量超过max时，移除第一个(也就是最先被缓存的那个)
// 缓存的是src
class ImageCache {
  constructor ({ max }) {
    this.options = {
      max: max || 100
    }
    this._caches = []
  }

  has (key) {
    return this._caches.indexOf(key) > -1
  }

  add (key) {
    if (this.has(key)) return
    this._caches.push(key)
    if (this._caches.length > this.options.max) {
      this.free()
    }
  }

  free () {
    this._caches.shift()
  }
}

export {
  ImageCache,
  inBrowser,
  CustomEvent,
  remove,
  some,
  find,
  assign,
  noop,
  ArrayFrom,
  _,
  isObject,
  throttle,
  supportWebp,
  getDPR,
  scrollParent,
  loadImageAsync,
  getBestSelectionFromSrcset,
  ObjectKeys
}
