import {
  loadImageAsync,
  ObjectKeys,
  noop
} from './util'

// el: {
//     state,
//     src,
//     error,
//     loading
// }

export default class ReactiveListener {
  constructor ({ el, src, error, loading, bindType, $parent, options, cors, elRenderer, imageCache }) {
    this.el = el
    this.src = src
    this.error = error
    this.loading = loading
    this.bindType = bindType
    this.attempt = 0
    this.cors = cors

    this.naturalHeight = 0
    this.naturalWidth = 0

    this.options = options

    this.rect = null

    this.$parent = $parent
    this.elRenderer = elRenderer
    this._imageCache = imageCache
    this.performanceData = {
      init: Date.now(),
      loadStart: 0,
      loadEnd: 0
    }

    // 调用用户传参时定义的filter方法，动态修改图片的src，比如添加前缀或者是否支持webp
    this.filter()
    // 初始化state dataset.src data-src
    this.initState()
    // 渲染image为loading
    this.render('loading', false)
  }

  /*
   * init listener state
   * @return
   */
  // 初始化state dataset.src data-src
  initState () {
    if ('dataset' in this.el) {
      this.el.dataset.src = this.src
    } else {
      this.el.setAttribute('data-src', this.src)
    }

    this.state = {
      loading: false,
      error: false,
      loaded: false,
      rendered: false
    }
  }

  /*
   * record performance
   * @return
   */
  // 记录event对应的时间戳
  record (event) {
    this.performanceData[event] = Date.now()
  }

  /*
   * update image listener data
   * @param  {String} image uri
   * @param  {String} loading image uri
   * @param  {String} error image uri
   * @return
   */
  // 更新src并清空尝试次数attempt
  update ({ src, loading, error }) {
    const oldSrc = this.src
    this.src = src
    this.loading = loading
    this.error = error
    this.filter()
    if (oldSrc !== this.src) {
      this.attempt = 0
      this.initState()
    }
  }

  /*
   * get el node rect
   * @return
   */
  getRect () {
    this.rect = this.el.getBoundingClientRect()
  }

  /*
   *  check el is in view
   * @return {Boolean} el is in view
   */
  // 判断元素位置是否处在预加载视图内，若元素处在视图内部则返回true，反之则返回false
  checkInView () {
    this.getRect()
    return (this.rect.top < window.innerHeight * this.options.preLoad && this.rect.bottom > this.options.preLoadTop) &&
            (this.rect.left < window.innerWidth * this.options.preLoad && this.rect.right > 0)
  }

  /*
   * listener filter
   */
  // 调用用户传参时定义的filter方法，动态修改图片的src，比如添加前缀或者是否支持webp
  // Vue.use(vueLazy, {
  //   filter: {
  //     progressive (listener, options) {
  //         const isCDN = /qiniudn.com/
  //         if (isCDN.test(listener.src)) {
  //             listener.el.setAttribute('lazy-progressive', 'true')
  //             listener.loading = listener.src + '?imageView2/1/w/10/h/10'
  //         }
  //     },
  //     webp (listener, options) {
  //         if (!options.supportWebp) return
  //         const isCDN = /qiniudn.com/
  //         if (isCDN.test(listener.src)) {
  //             listener.src += '?imageView2/2/format/webp'
  //         }
  //     }
  //   }
  // })
  filter () {
    ObjectKeys(this.options.filter).map(key => {
      this.options.filter[key](this, this.options)
    })
  }

  /*
   * render loading first
   * @params cb:Function
   * @return
   */
  // 渲染loading，loading image加载成功与否不影响后续src加载
  renderLoading (cb) {
    this.state.loading = true
    loadImageAsync({
      src: this.loading,
      cors: this.cors
    }, data => { // resolve
      // 渲染loading
      // 初始化的时候执行过this.render('loading', false)，这里再执行一次的意义???
      this.render('loading', false)
      this.state.loading = false
      cb()
    }, () => { // reject
      // handler `loading image` load failed
      cb()
      this.state.loading = false
      if (!this.options.silent) console.warn(`VueLazyload log: load failed with loading image(${this.loading})`)
    })
  }

  /*
   * try load image and  render it
   * @return
   */
  // 加载真实路径image并渲染
  // 如有缓存，直接渲染loaded
  // 如没有缓存，依次渲染loading和真实src并缓存
  load (onFinish = noop) {
    // 若尝试次数完毕并且对象状态为error，则打印错误提示并结束
    if ((this.attempt > this.options.attempt - 1) && this.state.error) {
      if (!this.options.silent) console.log(`VueLazyload log: ${this.src} tried too more than ${this.options.attempt} times`)
      onFinish()
      return
    }
    if (this.state.rendered && this.state.loaded) return
    // 从缓存中获取并渲染loaded，改变状态为loaded
    if (this._imageCache.has(this.src)) {
      this.state.loaded = true
      this.render('loaded', true)
      this.state.rendered = true
      return onFinish()
    }

    // 先执行loading，成功或失败都会执行回调，也就是loading image加载成功与否不影响src image加载
    // 初始化的时候已经加载过loading了，为什么在load时还需要先加载loading???
    this.renderLoading(() => {
      this.attempt++

      // 执行用户传入的beforeLoad回调
      this.options.adapter['beforeLoad'] && this.options.adapter['beforeLoad'](this, this.options)
      // 记录loadStart的时间戳
      this.record('loadStart')

      // 异步加载src image
      loadImageAsync({
        src: this.src,
        cors: this.cors
      }, data => {
        this.naturalHeight = data.naturalHeight
        this.naturalWidth = data.naturalWidth
        this.state.loaded = true
        this.state.error = false
        this.record('loadEnd')
        this.render('loaded', false)
        this.state.rendered = true
        // 缓存，下次就直接渲染loaded
        this._imageCache.add(this.src)
        onFinish()
      }, err => {
        !this.options.silent && console.error(err)
        this.state.error = true
        this.state.loaded = false
        this.render('error', false)
      })
    })
  }

  /*
   * render image
   * @param  {String} state to render // ['loading', 'src', 'error']
   * @param  {String} is form cache
   * @return
   */
  // 渲染image
  render (state, cache) {
    this.elRenderer(this, state, cache)
  }

  /*
   * output performance data
   * @return {Object} performance data
   */
  // 输出loaded所需的时间(秒)
  // 如果state为loading或是error，输出的time为0
  performance () {
    let state = 'loading'
    let time = 0

    if (this.state.loaded) {
      state = 'loaded'
      time = (this.performanceData.loadEnd - this.performanceData.loadStart) / 1000
    }

    if (this.state.error) state = 'error'

    return {
      src: this.src,
      state,
      time
    }
  }

  /*
   * $destroy
   * @return
   */
  $destroy () {
    this.el = null
    this.src = null
    this.error = null
    this.loading = null
    this.bindType = null
    this.attempt = 0
  }
}
