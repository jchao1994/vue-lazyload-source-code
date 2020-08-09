import Lazy from './lazy'
import LazyComponent from './lazy-component'
import LazyContainer from './lazy-container'
import LazyImage from './lazy-image'
import { assign } from './util'

export default {
  /*
  * install function
  * @param  {Vue} Vue
  * @param  {object} options  lazyload options
  */
  install (Vue, options = {}) {
    const LazyClass = Lazy(Vue)
    const lazy = new LazyClass(options)
    const lazyContainer = new LazyContainer({ lazy })

    const isVue2 = Vue.version.split('.')[0] === '2'

    // 将lazy挂载到Vue原型上
    Vue.prototype.$Lazyload = lazy

    // 构建lazy-component组件
    // component组件形式的懒加载，将所需懒加载的img标签作为组件的children，当lazy-component组件的父元素进入可视区域，组件触发更新，将children渲染至组件中，实现懒加载
    if (options.lazyComponent) {
      Vue.component('lazy-component', LazyComponent(lazy))
    }

    // 构建lazy-image组件
    // component组件形式的懒加载，当lazy-image组件的父元素进入可视区域，组件触发更新，将自身的src属性更新为真实src，实现懒加载
    // v-lazy指令传入的src或对象，这里以props的形式传入lazy-image组件的src属性
    if (options.lazyImage) {
      Vue.component('lazy-image', LazyImage(lazy))
    }

    // directive指令形式的懒加载
    if (isVue2) { // Vue2.x
      // bind：只调用一次，指令第一次绑定到元素时调用。在这里可以进行一次性的初始化设置。
      // update：所在组件的 VNode 更新时调用，但是可能发生在其子 VNode 更新之前。指令的值可能发生了改变，也可能没有。但是你可以通过比较更新前后的值来忽略不必要的模板更新。
      // componentUpdated：指令所在组件的 VNode 及其子 VNode 全部更新后调用。
      // unbind：只调用一次，指令与元素解绑时调用。
      // v-lazy绑定单个img
      Vue.directive('lazy', {
        bind: lazy.add.bind(lazy),
        update: lazy.update.bind(lazy),
        componentUpdated: lazy.lazyLoadHandler.bind(lazy),
        unbind: lazy.remove.bind(lazy)
      })
      // v-lazy-container绑定一组img的父元素，对这组img都设置懒加载
      Vue.directive('lazy-container', {
        bind: lazyContainer.bind.bind(lazyContainer),
        componentUpdated: lazyContainer.update.bind(lazyContainer),
        unbind: lazyContainer.unbind.bind(lazyContainer)
      })
    } else { // Vue1.x
      Vue.directive('lazy', {
        bind: lazy.lazyLoadHandler.bind(lazy),
        update (newValue, oldValue) {
          assign(this.vm.$refs, this.vm.$els)
          lazy.add(this.el, {
            modifiers: this.modifiers || {},
            arg: this.arg,
            value: newValue,
            oldValue: oldValue
          }, {
            context: this.vm
          })
        },
        unbind () {
          lazy.remove(this.el)
        }
      })

      Vue.directive('lazy-container', {
        update (newValue, oldValue) {
          lazyContainer.update(this.el, {
            modifiers: this.modifiers || {},
            arg: this.arg,
            value: newValue,
            oldValue: oldValue
          }, {
            context: this.vm
          })
        },
        unbind () {
          lazyContainer.unbind(this.el)
        }
      })
    }
  }
}
