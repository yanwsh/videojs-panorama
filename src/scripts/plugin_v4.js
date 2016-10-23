'use strict';

import Canvas  from './lib/Canvas';
import Notice  from './lib/Notice';
import HelperCanvas from './lib/HelperCanvas';
import VRButton from './lib/VRButton';
import panorama from './plugin';

function getTech(player) {
    return player.tech? player.tech.el():
        player.h.el();
}

function getFullscreenToggleClickFn(player) {
    return player.controlBar.fullscreenToggle.onClick || player.controlBar.fullscreenToggle.u;
}

var component = videojs.Component;
var compatiableInitialFunction = function (player, options) {
    this.constructor(player, options);
};
var canvas = Canvas(component, window.THREE, {
    getTech: getTech
});
canvas.init = compatiableInitialFunction;
videojs.Canvas = component.extend(canvas);

var notice = Notice(component);
notice.init = compatiableInitialFunction;
videojs.Notice = component.extend(notice);

var helperCanvas = HelperCanvas(component);
helperCanvas.init = compatiableInitialFunction;
videojs.HelperCanvas = component.extend(helperCanvas);

var button = videojs.Button;
var vrBtn = VRButton(button);
vrBtn.init = compatiableInitialFunction;
vrBtn.onClick = vrBtn.u = vrBtn.handleClick;
vrBtn.buttonText = vrBtn.ta = vrBtn.controlText_;
vrBtn.T = function () {
    return `vjs-VR-control ${button.prototype.T.call(this)}`;
};
videojs.VRButton = button.extend(vrBtn);

// Register the plugin with video.js.
videojs.plugin('panorama', panorama({
    mergeOption: function (defaults, options) {
        return videojs.util.mergeOptions(defaults, options);
    },
    getTech: getTech,
    getFullscreenToggleClickFn: getFullscreenToggleClickFn
}));