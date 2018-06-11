'use strict';

if (!('includes' in Array.prototype)) {
  Array.prototype.includes = function includes(item, startIndex) {
    return this.indexOf(item, startIndex) >= 0;
  };
}

if (!('every' in Array.prototype)) {
  Array.prototype.every = function every(func, context) {
    if (!context) context = this;
    var bool = true;
    for (var i = this.length; bool && i--; ) {
      bool = bool && func.call(context, this[i], i, this);
    }
    return bool;
  };
}

if (!('Symbol' in window)) {
  window.Symbol = function (label) {
    label = label || '';
    return label + Math.random().toString(36).substring(2);
  };
}
