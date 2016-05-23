'use strict';

import Canvas  from './lib/Canvas';
import Notice  from './lib/Notice';
import HelperCanvas from './lib/HelperCanvas';
import panorama from './plugin';

var component = videojs.Component;
var compatiableInitialFunction = function (player, options) {
    this.constructor(player, options);
};
var canvas = Canvas(component, {
    getTech: function (player) {
        return player.tech.el();
    }
});
canvas.init = compatiableInitialFunction;
videojs.Canvas = component.extend(canvas);

var notice = Notice(component);
notice.init = compatiableInitialFunction;
videojs.Notice = component.extend(notice);

var helperCanvas = HelperCanvas(component);
helperCanvas.init = compatiableInitialFunction;
videojs.HelperCanvas = component.extend(helperCanvas);

// Register the plugin with video.js.
videojs.plugin('panorama', panorama({
    mergeOption: function (defaults, options) {
        return videojs.util.mergeOptions(defaults, options);
    }
}));
