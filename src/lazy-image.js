import {
  inBrowser,
  loadImageAsync,
  noop
} from './util'

export default (lazyManager) => { // lazyManager就是lazy实例
  return {
    props: {
      src: [String, Object],
      tag: {
        type: String,
        default: 'img'
      }
    },
    // 当触发load()时，this.renderSrc改变，触发组件更新，重新渲染render，更新src属性，实现懒加载
    render (h) {
      return h(this.tag, {
        attrs: {
          src: this.renderSrc
        }
      }, this.$slots.default)
    },
    data () {
      return {
        el: null,
        options: {
          src: '',
          error: '',
          loading: '',
          attempt: lazyManager.options.attempt
        },
        state: {
          loaded: false,
          error: false,
          attempt: 0
        },
        rect: {},
        renderSrc: ''
      }
    },
    watch: {
      src () {
        this.init()
        lazyManager.addLazyBox(this)
        lazyManager.lazyLoadHandler()
      }
    },
    created () {
      // 初始化
      this.init()
      this.renderSrc = this.options.loading
    },
    mounted () {
      // dom元素挂载完毕，才可以对其进行监听事件
      // 监听的是这个lazy-image组件的父元素的可见性，渲染的是当前这个组件lazy-image的src
      this.el = this.$el
      lazyManager.addLazyBox(this)
      lazyManager.lazyLoadHandler()
    },
    beforeDestroy () {
      lazyManager.removeComponent(this)
    },
    methods: {
      // 更新props传入的src，设置初始的src error loading，并且将渲染renderSrc设为loading
      init () {
        const { src, loading, error } = lazyManager._valueFormatter(this.src)
        this.state.loaded = false
        this.options.src = src
        this.options.error = error
        this.options.loading = loading
        this.renderSrc = this.options.loading
      },
      getRect () {
        this.rect = this.$el.getBoundingClientRect()
      },
      checkInView () {
        this.getRect()
        return inBrowser &&
                    (this.rect.top < window.innerHeight * lazyManager.options.preLoad && this.rect.bottom > 0) &&
                    (this.rect.left < window.innerWidth * lazyManager.options.preLoad && this.rect.right > 0)
      },
      load (onFinish = noop) {
        if ((this.state.attempt > this.options.attempt - 1) && this.state.error) {
          if (!lazyManager.options.silent) console.log(`VueLazyload log: ${this.options.src} tried too more than ${this.options.attempt} times`)
          onFinish()
          return
        }
        const src = this.options.src
        loadImageAsync({ src }, ({ src }) => {
          this.renderSrc = src
          this.state.loaded = true
        }, e => {
          this.state.attempt++
          this.renderSrc = this.options.error
          this.state.error = true
        })
      }
    }
  }
}
