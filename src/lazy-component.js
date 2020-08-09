import { inBrowser } from './util'

export default (lazy) => {
  return {
    props: {
      tag: {
        type: String,
        default: 'div'
      }
    },
    // 当触发load()时，this.show变为true，触发组件更新，重新渲染render，将this.$slots.default渲染到lazy-component中，实现懒加载
    render (h) {
      return h(this.tag, null, this.show ? this.$slots.default : null)
    },
    data () {
      return {
        el: null,
        state: {
          loaded: false
        },
        rect: {},
        show: false
      }
    },
    mounted () {
      // 监听的是lazy-component这个组件的父元素的可见性，渲染的是当前这个组件lazy-component的子元素this.$slots.default
      this.el = this.$el
      lazy.addLazyBox(this)
      lazy.lazyLoadHandler()
    },
    beforeDestroy () {
      lazy.removeComponent(this)
    },
    methods: {
      getRect () {
        this.rect = this.$el.getBoundingClientRect()
      },
      checkInView () {
        this.getRect()
        return inBrowser &&
                    (this.rect.top < window.innerHeight * lazy.options.preLoad && this.rect.bottom > 0) &&
                    (this.rect.left < window.innerWidth * lazy.options.preLoad && this.rect.right > 0)
      },
      load () {
        this.show = true
        this.state.loaded = true
        // <lazy-component @show=handleShow></lazy-component>
        // 触发show的回调函数
        this.$emit('show', this)
      },
      destroy () {
        return this.$destroy
      }
    }
  }
}
