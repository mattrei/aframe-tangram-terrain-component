(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(factory());
}(this, (function () { 'use strict';

require('./src/system');
require('./src/component');
require('./src/component-static');
require('./src/primitive');

})));
