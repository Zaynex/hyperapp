/**
 *
 * @param {*} name
 * @param {*} attributes
 *
 * 构建 vDOM
   h("div", {}, [
    h("h1", {}),
    h("button", {}, "-"),
    h("button", {}, "+")
  ])
 */

/**
 * 1. recycle Element 将真实的DOM转换成 Virtual DOM 以便后期diff
 * 2. 整合  state 和 actions.
 * 3. 执行render 调度系统
 * 4. Diff
 *    -  新的 node 和  old node 相同
 *    -  old node 不存在或者 nodeName 名称变更 createElement /removeOld
 *    -  updateElement 不需要删除节点，仅仅是更新 attributes 以及生命周期函数
 *    -  updateAttribute 具体的update 逻辑 key 相同就不更新, style 替换，click 等点击事件进行一个check/ 生命周期
 *    -  以上逻辑仅仅是单个顶层节点的判断，还有 children 等等，
 * 那么就需要继续通过 oldNode 的children 和 node 的 children 进行 patch
 */

export function h(name, attributes, ...rest) {
  var children = []
  var length = arguments.length

  while (rest.length) {
    var node = rest.pop()
    if (node && node.pop) {
      for (length = node.length; length--;) {
        rest.push(node[length])
      }
    } else if (node != null && node !== true && node !== false) {
      children.push(node)
    }
  }

  return typeof name === "function"
    ? name(attributes || {}, children) // 懒加载组件
    : {
      nodeName: name,
      attributes: attributes || {},
      children: children,
      key: attributes && attributes.key
    }
}

export function app(state, actions, view, container) {
  var map = [].map
  // 根节点
  var rootElement = (container && container.children[0]) || null
  var oldNode = rootElement && recycleElement(rootElement)
  var lifecycle = []
  var skipRender
  var isRecycling = true
  var globalState = clone(state)
  var wiredActions = wireStateToActions([], globalState, clone(actions))

  scheduleRender()

  return wiredActions

  // 将真实的 DOM 节点转换成 Virtual DOM
  function recycleElement(element) {
    return {
      nodeName: element.nodeName.toLowerCase(),
      attributes: {},
      children: map.call(element.childNodes, function (element) {
        return element.nodeType === 3 // Node.TEXT_NODE
          ? element.nodeValue
          : recycleElement(element)
      })
    }
  }

  /**
   *
   * const view = (state, actions) => (
   *  <div>
   *    <h1>{state.count}</h1>
   *    <button onclick={() => actions.down(1)}>-</button>
   *    <button onclick={() => actions.up(1)}>+</button>
   *  </div>
   * )
   *
   * view(globalState, wiredActions)
   */
  function resolveNode(node) {
    // 简单来说就是执行 view 函数，生成 一个 Vitrual Dom
    return typeof node === "function"
      ? resolveNode(node(globalState, wiredActions))
      : node
  }

  function render() {
    var node = resolveNode(view)

    if (container) {
      rootElement = patch(container, rootElement, oldNode, (oldNode = node))
    }

    skipRender = isRecycling = false

    //  执行生命周期函数
    while (lifecycle.length) lifecycle.pop()()
  }


  function scheduleRender() {
    if (!skipRender && (skipRender = true)) setTimeout(render)
  }

  function clone(target, source) {
    var out = {}

    for (var i in target) out[i] = target[i]
    for (var i in source) out[i] = source[i]
    // out = {...target, ...source};
    //  把 target 和 source 数据都 clone 一份，如果相同，以 source 为标准
    return out
  }

  // 设置深度嵌套的 object
  function set(path, value, source) {
    var target = {}
    if (path.length) {
      target[path[0]] =
        path.length > 1 ? set(path.slice(1), value, source[path[0]]) : value
      return clone(source, target)
    }
    return value
  }


  // const result = { winner: { name: 'Tony' } }
  // get(['winner', 'name'], result)  => Tony

  // 取深度嵌套的object
  function get(path, source) {
    var i = 0
    while (i < path.length) source = source[path[i++]]
    return source
  }

  function wireStateToActions(path, state, actions) {
    for (var key in actions) {
      typeof actions[key] === "function"
        ? (function (key, action) {
          // 传入当前的 key 和 value

          actions[key] = function (data) {
            var result = action(data)

            /**
             * 1. result 返回的是函数 包括 async 函数
             *
             * const actions = {
                down: value =>（state,action) => ({ count: state.count - value }),
                up: value => (state,action) => ({ count: state.count + value })
              }
             */
            if (typeof result === "function") {
              // 通过 path 和 state 来获得🌲中一个节点的state
              result = result(get(path, globalState), actions)
            }

            /**
             * 2. result 返回的是一个数组
             *
             * const actions = {
                getQuote: () => [
                  action("setQuote", "..."),
                  http(
                    "https://quotesondesign.com/wp-json/posts?filter[orderby]=rand&filter[posts_per_page]=1",
                    "quoteFetched"
                  )
                ],
                quoteFetched: ([{ content }]) => action("setQuote", content),
                setQuote: quote => ({ quote })
              }
             */

            if (
              result &&
              result !== (state = get(path, globalState)) &&
              !result.then // !isPromise
            ) {
              scheduleRender(
                (globalState = set(path, clone(state, result), globalState))
              )
            }

            return result
          }
        })(key, actions[key])
        :
        // 如果它是一个对象，继续执行这个函数去解构
        // https://github.com/hyperapp/hyperapp#nested-actions
        wireStateToActions(
          path.concat(key),
          (state[key] = clone(state[key])),
          (actions[key] = clone(actions[key]))
        )
    }

    return actions
  }

  function getKey(node) {
    return node ? node.key : null
  }

  function eventListener(event) {
    return event.currentTarget.events[event.type](event)
  }

  function updateAttribute(element, name, value, oldValue, isSvg) {
    if (name === "key") {
    } else if (name === "style") {
      for (var i in clone(oldValue, value)) {
        var style = value == null || value[i] == null ? "" : value[i]
        if (i[0] === "-") {
          // style.setProperty(propertyName, value, priority);
          element[name].setProperty(i, style)
        } else {
          element[name][i] = style
        }
      }
    } else {
      if (name[0] === "o" && name[1] === "n") {
        // 在 dom 对象上添加 events 对象
        if (!element.events) {
          element.events = {}
        }
        element.events[(name = name.slice(2))] = value

        if (value) {
          // 如果没有旧的节点，第一次render
          if (!oldValue) {
            element.addEventListener(name, eventListener)
          }
        } else {
          element.removeEventListener(name, eventListener)
        }


      } else if (name in element && name !== "list" && !isSvg) {
        element[name] = value == null ? "" : value
      } else if (value != null && value !== false) {
        element.setAttribute(name, value)
      }

      if (value == null || value === false) {
        element.removeAttribute(name)
      }
    }
  }

  function createElement(node, isSvg) {
    var element =
      typeof node === "string" || typeof node === "number"
        ? document.createTextNode(node)
        : (isSvg = isSvg || node.nodeName === "svg")
          ? document.createElementNS(
            "http://www.w3.org/2000/svg",
            node.nodeName
          )
          : document.createElement(node.nodeName)

    var attributes = node.attributes

    // life hook
    if (attributes) {
      if (attributes.oncreate) {
        lifecycle.push(function () {
          attributes.oncreate(element)
        })
      }

      for (var i = 0; i < node.children.length; i++) {
        element.appendChild(
          createElement(
            (node.children[i] = resolveNode(node.children[i])),
            isSvg
          )
        )
      }

      for (var name in attributes) {
        updateAttribute(element, name, attributes[name], null, isSvg)
      }
    }

    return element
  }

  function updateElement(element, oldAttributes, attributes, isSvg) {
    for (var name in clone(oldAttributes, attributes)) {
      if (
        attributes[name] !==
        (name === "value" || name === "checked"
          ? element[name]
          : oldAttributes[name])
      ) {
        updateAttribute(
          element,
          name,
          attributes[name],
          oldAttributes[name],
          isSvg
        )
      }
    }

    var cb = isRecycling ? attributes.oncreate : attributes.onupdate
    if (cb) {
      lifecycle.push(function () {
        cb(element, oldAttributes)
      })
    }
  }

  function removeChildren(element, node) {
    var attributes = node.attributes
    if (attributes) {
      for (var i = 0; i < node.children.length; i++) {
        removeChildren(element.childNodes[i], node.children[i])
      }
      // 比较适合做一些卸载事件

      if (attributes.ondestroy) {
        attributes.ondestroy(element)
      }
    }
    return element
  }

  function removeElement(parent, element, node) {
    function done() {
      parent.removeChild(removeChildren(element, node))
    }

    // remove 比较适合做移除的动画
    var cb = node.attributes && node.attributes.onremove
    if (cb) {
      cb(element, done)
    } else {
      done()
    }
  }

  /**
   * @param {*} parent 挂载的节点
   * @param {*} element 插入的 element?
   * @param {*} oldNode 旧的vnode
   * @param {*} node 新vnode
   * @param {*} isSvg
   */
  function patch(parent, element, oldNode, node, isSvg) {
    // shadow equal
    if (node === oldNode) {
    } else if (oldNode == null || oldNode.nodeName !== node.nodeName) {
      var newElement = createElement(node, isSvg)

      // 增加新节点
      parent.insertBefore(newElement, element)

      // 删除旧节点
      if (oldNode != null) {
        removeElement(parent, element, oldNode)
      }

      element = newElement
    } else if (oldNode.nodeName == null) {
      element.nodeValue = node
    } else {
      updateElement(
        element,
        oldNode.attributes,
        node.attributes,
        (isSvg = isSvg || node.nodeName === "svg")
      )

      var oldKeyed = {}
      var newKeyed = {}
      var oldElements = []
      var oldChildren = oldNode.children
      var children = node.children

      for (var i = 0; i < oldChildren.length; i++) {
        oldElements[i] = element.childNodes[i]

        var oldKey = getKey(oldChildren[i])
        if (oldKey != null) {
          // 数据结构如下
          // {
          //  zaynex:[
              //   <div key="zaynex"></div>,
              //   {nodeName:"div", attributes:{key: 'zaynex'}, children:[]}
              // ]
          // }
          oldKeyed[oldKey] = [oldElements[i], oldChildren[i]]
        }
      }

      // 旧 node 的 index

      var i = 0

      // 新 node 的index
      var k = 0


      // patch 新的所有 node
      while (k < children.length) {
        var oldKey = getKey(oldChildren[i])
        var newKey = getKey((children[k] = resolveNode(children[k])))

        // 如果新的 node key 在 old key 中存在
        //那么就不patch
        if (newKeyed[oldKey]) {
          i++
          continue
        }

        if (newKey == null || isRecycling) {
          // 如果没有设置新的 key
          if (oldKey == null) {
            // 并且 oldKey 也没有 直接 patch
            patch(element, oldElements[i], oldChildren[i], children[k], isSvg)
            k++
          }
          i++
        } else {
          // 根据新 key 去拿到对应的老节点
          var keyedNode = oldKeyed[newKey] || []

          if (oldKey === newKey) {
            // ?
            patch(element, keyedNode[0], keyedNode[1], children[k], isSvg)
            i++
          } else if (keyedNode[0]) {
            // ?
            patch(
              element,
              element.insertBefore(keyedNode[0], oldElements[i]),
              keyedNode[1],
              children[k],
              isSvg
            )
          } else {
            // 如果 oldNode 不存在
            patch(element, oldElements[i], null, children[k], isSvg)
          }

          newKeyed[newKey] = children[k]
          k++
        }
      }

      while (i < oldChildren.length) {
        // 多出来这些 node 如果没有 key 直接删掉
        if (getKey(oldChildren[i]) == null) {
          removeElement(element, oldElements[i], oldChildren[i])
        }
        i++
      }

      // 对于有key 但没用到的也直接删掉
      for (var i in oldKeyed) {
        if (!newKeyed[i]) {
          removeElement(element, oldKeyed[i][0], oldKeyed[i][1])
        }
      }
    }
    return element
  }
}
