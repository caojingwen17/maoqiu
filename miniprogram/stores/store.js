// store.js
// 极简状态容器：get / set / subscribe
// 用法：var store = createStore({ count: 0 });
//   store.get()            读取当前状态（浅拷贝对象）
//   store.set(patch)       合并更新并通知所有订阅者
//   var off = store.subscribe(fn)  订阅变更，返回取消订阅函数
function createStore(initialState) {
  var state = Object.assign({}, initialState);
  var listeners = [];

  function get() {
    return state;
  }

  function set(patch) {
    state = Object.assign({}, state, patch);
    // 拷贝一份再遍历，避免回调里取消订阅导致遍历错乱
    listeners.slice().forEach(function (fn) {
      fn(state);
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      var i = listeners.indexOf(fn);
      if (i > -1) {
        listeners.splice(i, 1);
      }
    };
  }

  return { get: get, set: set, subscribe: subscribe };
}

module.exports = { createStore: createStore };
