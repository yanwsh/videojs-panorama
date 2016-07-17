'use strict';

import Canvas  from './lib/Canvas';
import Notice  from './lib/Notice';
import HelperCanvas from './lib/HelperCanvas';
import panorama from './plugin';

function getTech(player) {
    return player.tech({ IWillNotUseThisInPlugins: true }).el();
}

function getFullscreenToggleClickFn() {
    return player.controlBar.fullscreenToggle.handleClick
}

var component = videojs.getComponent('Component');
var canvas = Canvas(component, {
    getTech: getTech
});
videojs.registerComponent('Canvas', videojs.extend(component, canvas));

var notice = Notice(component);
videojs.registerComponent('Notice', videojs.extend(component, notice));

var helperCanvas = HelperCanvas(component);
videojs.registerComponent('HelperCanvas', videojs.extend(component, helperCanvas));

// Register the plugin with video.js.

videojs.plugin('panorama', panorama({
    mergeOption: function (defaults, options) {
        return videojs.mergeOptions(defaults, options);
    },
    getTech: getTech,
    getFullscreenToggleClickFn: getFullscreenToggleClickFn
}));
