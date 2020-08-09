import {
  inBrowser,
  CustomEvent,
  remove,
  some,
  find,
  _,
  throttle,
  supportWebp,
  getDPR,
  scrollParent,
  getBestSelectionFromSrcset,
  assign,
  isObject,
  hasIntersectionObserver,
  modeType,
  ImageCache
} from './util'

import ReactiveListener from './listener'

const DEFAULT_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const DEFAULT_EVENTS = ['scroll', 'wheel', 'mousewheel', 'resize', 'animationend', 'transitionend', 'touchmove']
// 生成IntersectionObserver实例时传入的options
const DEFAULT_OBSERVER_OPTIONS = {
  rootMargin: '0px', // 目标元素所在的容器节点（即根元素）的margin
  threshold: 0 // 当目标元素达到0%(也就是刚进入容器，或者全部离开容器)时触发回调函数，可以是数组，如[0, 0.25, 0.5, 0.75, 1] 表示当目标元素 0%、25%、50%、75%、100% 可见时会触发回调函数
}

export default function (Vue) {
  return class Lazy {
    constructor ({ preLoad, error, throttleWait, preLoadTop, dispatchEvent, loading, attempt, silent = true, scale, listenEvents, hasbind, filter, adapter, observer, observerOptions }) {
      this.version = '__VUE_LAZYLOAD_VERSION__'
      this.mode = modeType.event
      this.ListenerQueue = []
      this.TargetIndex = 0
      this.TargetQueue = []
      this.options = {
        silent: silent,
        dispatchEvent: !!dispatchEvent,
        throttleWait: throttleWait || 200,
        preLoad: preLoad || 1.3, // 预加载高度比例
        preLoadTop: preLoadTop || 0,
        error: error || DEFAULT_URL, // 图片加载失败显示图
        loading: loading || DEFAULT_URL, // 图片加载中显示图
        attempt: attempt || 3, // 图片加载尝试次数
        scale: scale || getDPR(scale),
        ListenEvents: listenEvents || DEFAULT_EVENTS, // 监听的事件
        hasbind: false,
        supportWebp: supportWebp(),
        filter: filter || {}, // 生成新的listener都会执行的filter
        adapter: adapter || {}, // loaded loading error完成时的回调函数
        observer: !!observer, // 是否使用IntersectionObserver，observer模式
        observerOptions: observerOptions || DEFAULT_OBSERVER_OPTIONS
      }
      // 初始化loading loaded error的事件监听方法
      this._initEvent()
      // image缓存
      this._imageCache = new ImageCache({ max: 200 })
      // 懒加载处理函数
      this.lazyLoadHandler = throttle(this._lazyLoadHandler.bind(this), this.options.throttleWait)

      // 设置监听模式event observer
      this.setMode(this.options.observer ? modeType.observer : modeType.event)
    }

    /**
     * update config
     * @param  {Object} config params
     * @return
     */
    config (options = {}) {
      assign(this.options, options)
    }

    /**
     * output listener's load performance
     * @return {Array}
     */
    // 输出ListenerQueue中所有listeners的loaded所需的时间(秒)，如state为loading或error，则时间为0
    performance () {
      let list = []

      this.ListenerQueue.map(item => {
        list.push(item.performance())
      })

      return list
    }

    /*
     * add lazy component to queue
     * @param  {Vue} vm lazy component instance
     * @return
     */
    addLazyBox (vm) {
      this.ListenerQueue.push(vm)
      if (inBrowser) {
        this._addListenerTarget(window)
        this._observer && this._observer.observe(vm.el)
        if (vm.$el && vm.$el.parentNode) {
          this._addListenerTarget(vm.$el.parentNode)
        }
      }
    }

    /*
     * add image listener to queue
     * @param  {DOM} el
     * @param  {object} binding vue directive binding
     * @param  {vnode} vnode vue directive vnode
     * @return
     */
    // 当前dom若已存在监听队列ListenerQueue中，则直接调用this.update方法，在dom渲染完毕后执行懒加载处理函数this.lazyLoadHandler()
    // 若当前dom不存在监听队列中
    //   则创建新的监听对象newListener并将其存放在监听队列ListenerQueue中
    //   设置window或$parent为scroll事件的监听目标对象，放在TargetQueue中
    //   执行懒加载处理函数this.lazyLoadHandler()
    add (el, binding, vnode) {
      // ListenerQueue中已经有了，直接调用update
      if (some(this.ListenerQueue, item => item.el === el)) {
        this.update(el, binding)
        return Vue.nextTick(this.lazyLoadHandler)
      }
      // 下面是add的流程

      // 根据value返回loading loaded error的image url
      let { src, loading, error, cors } = this._valueFormatter(binding.value)

      Vue.nextTick(() => {
        // 优先根据data-srcset获取bestSelectedSrc
        src = getBestSelectionFromSrcset(el, this.options.scale) || src
        this._observer && this._observer.observe(el)

        // .修饰符对象的key作为container, .修饰符只传一个key
        // v-lazy.xxx => 取ref='xxx'或者id='xxx'的dom元素作为$parent
        // $parent是监听可见性事件的对象
        const container = Object.keys(binding.modifiers)[0]
        let $parent

        if (container) {
          $parent = vnode.context.$refs[container]
          // if there is container passed in, try ref first, then fallback to getElementById to support the original usage
          $parent = $parent ? $parent.$el || $parent : document.getElementById(container)
        }

        // 如果没有$parent，就逐层往上找带scroll属性的标签
        // 还没有，就返回window
        if (!$parent) {
          $parent = scrollParent(el)
        }

        // 新生成一个ReactiveListener，渲染image为loading
        const newListener = new ReactiveListener({
          bindType: binding.arg, // v-lazy:xxx => binding.arg就为xxx
          $parent,
          el,
          loading,
          error,
          src,
          cors,
          elRenderer: this._elRenderer.bind(this),
          options: this.options,
          imageCache: this._imageCache
        })

        this.ListenerQueue.push(newListener)

        // 将window和$parent添加进TargetQueue，作为事件监听的对象
        if (inBrowser) {
          this._addListenerTarget(window)
          this._addListenerTarget($parent)
        }

        // lazyLoadHandler执行了两次???
        this.lazyLoadHandler()
        Vue.nextTick(() => this.lazyLoadHandler())
      })
    }

    /**
    * update image src
    * @param  {DOM} el
    * @param  {object} vue directive binding
    * @return
    */
    update (el, binding, vnode) {
      // 根据value返回loading loaded error的image url
      let { src, loading, error } = this._valueFormatter(binding.value)
      // 优先根据data-srcset获取bestSelectedSrc
      src = getBestSelectionFromSrcset(el, this.options.scale) || src

      const exist = find(this.ListenerQueue, item => item.el === el)
      // 不存在就添加，存在就更新
      if (!exist) {
        this.add(el, binding, vnode)
      } else {
        exist.update({
          src,
          loading,
          error
        })
      }
      // 重新监听
      if (this._observer) {
        this._observer.unobserve(el)
        this._observer.observe(el)
      }
      // lazyLoadHandler执行了两次???
      this.lazyLoadHandler()
      Vue.nextTick(() => this.lazyLoadHandler())
    }

    /**
    * remove listener form list
    * @param  {DOM} el
    * @return
    */
    remove (el) {
      if (!el) return
      this._observer && this._observer.unobserve(el)
      const existItem = find(this.ListenerQueue, item => item.el === el)
      if (existItem) {
        this._removeListenerTarget(existItem.$parent)
        this._removeListenerTarget(window)
        remove(this.ListenerQueue, existItem)
        existItem.$destroy()
      }
    }

    /*
     * remove lazy components form list
     * @param  {Vue} vm Vue instance
     * @return
     */
    removeComponent (vm) {
      if (!vm) return
      remove(this.ListenerQueue, vm)
      this._observer && this._observer.unobserve(vm.el)
      if (vm.$parent && vm.$el.parentNode) {
        this._removeListenerTarget(vm.$el.parentNode)
      }
      this._removeListenerTarget(window)
    }

    // 设置监听模式event observer
    // event => scroll wheel mousewheel resize animationend transitionend touchmove这些事件来触发lazyLoadHandler
    // observer => 使用IntersectionObserver来监听元素是否进入了设备的可视区域之内，然后触发_observerHandler，对ListenerQueue中进入可视区域之内的且还未load的listener执行load方法
    setMode (mode) {
      // 不支持IntersectionObserver且设为observer模式，还是强制改为event模式
      if (!hasIntersectionObserver && mode === modeType.observer) {
        mode = modeType.event
      }

      this.mode = mode // event or observer

      if (mode === modeType.event) { // event
        if (this._observer) {
          this.ListenerQueue.forEach(listener => {
            this._observer.unobserve(listener.el)
          })
          this._observer = null
        }

        // 监听window和父元素的事件，触发lazyLoadHandler
        this.TargetQueue.forEach(target => {
          this._initListen(target.el, true)
        })
      } else { // observer
        // 移除监听事件
        this.TargetQueue.forEach(target => {
          this._initListen(target.el, false)
        })
        // 初始化IntersectionObserver，监听元素是否进入了设备的可视区域之内
        this._initIntersectionObserver()
      }
    }

    /*
    *** Private functions ***
    */

    /*
     * add listener target
     * @param  {DOM} el listener target
     * @return
     */
    // 添加target至TargetQueue中
    _addListenerTarget (el) {
      if (!el) return
      let target = find(this.TargetQueue, target => target.el === el)
      if (!target) {
        target = {
          el: el,
          id: ++this.TargetIndex,
          childrenCount: 1,
          listened: true
        }
        this.mode === modeType.event && this._initListen(target.el, true)
        this.TargetQueue.push(target)
      } else {
        target.childrenCount++
      }
      return this.TargetIndex
    }

    /*
     * remove listener target or reduce target childrenCount
     * @param  {DOM} el or window
     * @return
     */
    _removeListenerTarget (el) {
      this.TargetQueue.forEach((target, index) => {
        if (target.el === el) {
          target.childrenCount--
          if (!target.childrenCount) {
            this._initListen(target.el, false)
            this.TargetQueue.splice(index, 1)
            target = null
          }
        }
      })
    }

    /*
     * add or remove eventlistener
     * @param  {DOM} el DOM or Window
     * @param  {boolean} start flag
     * @return
     */
    // 监听或移除事件
    // start为on  监听事件
    // start为off  移除事件
    _initListen (el, start) {
      this.options.ListenEvents.forEach((evt) => _[start ? 'on' : 'off'](el, evt, this.lazyLoadHandler))
    }

    // 初始化loading loaded error的事件监听方法
    _initEvent () {
      this.Event = {
        listeners: {
          loading: [],
          loaded: [],
          error: []
        }
      }

      this.$on = (event, func) => {
        if (!this.Event.listeners[event]) this.Event.listeners[event] = []
        this.Event.listeners[event].push(func)
      }

      this.$once = (event, func) => {
        const vm = this
        function on () {
          vm.$off(event, on)
          func.apply(vm, arguments)
        }
        this.$on(event, on)
      }

      this.$off = (event, func) => {
        if (!func) {
          if (!this.Event.listeners[event]) return
          this.Event.listeners[event].length = 0
          return
        }
        remove(this.Event.listeners[event], func)
      }

      this.$emit = (event, context, inCache) => {
        if (!this.Event.listeners[event]) return
        this.Event.listeners[event].forEach(func => func(context, inCache))
      }
    }

    /**
     * find nodes which in viewport and trigger load
     * @return
     */
    // 懒加载处理函数
    // 遍历所有监听对象并删除掉不存在的listener或父元素不存在、隐藏等不需要显示的listener。
    // 遍历所有监听对象并判断当前对象是否处在预加载位置，如果处在预加载位置，则执行监听对象的load方法。
    _lazyLoadHandler () {
      const freeList = []
      this.ListenerQueue.forEach((listener, index) => {
        if (!listener.el || !listener.el.parentNode) {
          freeList.push(listener)
        }
        // 判断当前对象是否处在预加载位置
        const catIn = listener.checkInView()
        if (!catIn) return
        // 执行load，对处于预加载容器视图内的元素加载真实路径
        // 
        listener.load()
      })
      freeList.forEach(item => {
        remove(this.ListenerQueue, item)
        item.$destroy()
      })
    }
    /**
    * init IntersectionObserver
    * set mode to observer
    * @return
    */
   // 初始化IntersectionObserver，监听元素是否进入了设备的可视区域之内
    _initIntersectionObserver () {
      if (!hasIntersectionObserver) return
      this._observer = new IntersectionObserver(this._observerHandler.bind(this), this.options.observerOptions)
      if (this.ListenerQueue.length) {
        this.ListenerQueue.forEach(listener => {
          this._observer.observe(listener.el)
        })
      }
    }

    /**
    * init IntersectionObserver
    * @return
    */
   // 当被监听元素的可见性变化时，触发的回调函数
   // 已经加载，就移除监听，否则调用load方法
    _observerHandler (entries, observer) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.ListenerQueue.forEach(listener => {
            if (listener.el === entry.target) {
              if (listener.state.loaded) return this._observer.unobserve(listener.el)
              listener.load()
            }
          })
        }
      })
    }

    /**
    * set element attribute with image'url and state
    * @param  {object} lazyload listener object
    * @param  {string} state will be rendered
    * @param  {bool} inCache  is rendered from cache
    * @return
    */
   // 设置attr url state 渲染image
    _elRenderer (listener, state, cache) {
      if (!listener.el) return
      const { el, bindType } = listener

      let src
      switch (state) {
        case 'loading':
          src = listener.loading
          break
        case 'error':
          src = listener.error
          break
        default:
          src = listener.src
          break
      }

      // 更新src
      // 如果传入bindType，就更新bindType，否则更新src
      // v-lazy:background-image='xxx' => 这里的bindType就是background-image
      if (bindType) {
        el.style[bindType] = 'url("' + src + '")'
      } else if (el.getAttribute('src') !== src) {
        el.setAttribute('src', src)
      }

      // 设置lazy属性为当前的state状态 loading loaded error
      el.setAttribute('lazy', state)

      // 触发用户监听状态结束的回调函数
      // this.$Lazyload.$on(state, callback)
      // this.$Lazyload.$off(state, callback)
      // this.$Lazyload.$once(state, callback)
      this.$emit(state, listener, cache)
      // Vue.use注册vue-lazyload插件的时候传入的adapter回调，包括loaded loading error
      this.options.adapter[state] && this.options.adapter[state](listener, this.options)

      if (this.options.dispatchEvent) {
        // 自定义事件
        const event = new CustomEvent(state, {
          detail: listener
        })
        el.dispatchEvent(event)
      }
    }

    /**
    * generate loading loaded error image url
    * @param {string} image's src
    * @return {object} image's loading, loaded, error url
    */
    // 根据value返回loading loaded error的image url
    // 如果value是object，优先取value上的url
    _valueFormatter (value) {
      // v-lazy = 'xxx'
      let src = value
      let loading = this.options.loading
      let error = this.options.error

      // value is object
      // v-lazy = "{src: 'xxx', loading: 'xxx', err: 'xxx'}"
      if (isObject(value)) {
        if (!value.src && !this.options.silent) console.error('Vue Lazyload warning: miss src with ' + value)
        src = value.src
        loading = value.loading || this.options.loading
        error = value.error || this.options.error
      }
      return {
        src,
        loading,
        error
      }
    }
  }
}
