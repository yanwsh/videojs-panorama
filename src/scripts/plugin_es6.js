'use strict';

import videojs from 'video.js';
import THREE from 'three';
import Canvas  from './lib/Canvas';
import ThreeDCanvas from './lib/ThreeCanvas';
import Notice  from './lib/Notice';
import HelperCanvas from './lib/HelperCanvas';
import VRButton from './lib/VRButton';
import panorama from './plugin';

function getTech(player) {
    return player.tech({ IWillNotUseThisInPlugins: true }).el();
}

function getFullscreenToggleClickFn(player) {
    return player.controlBar.fullscreenToggle.handleClick
}

var component = videojs.getComponent('Component');

var notice = Notice(component);
videojs.registerComponent('Notice', videojs.extend(component, notice));

var helperCanvas = HelperCanvas(component);
videojs.registerComponent('HelperCanvas', videojs.extend(component, helperCanvas));

var button = videojs.getComponent("Button");
var vrBtn = VRButton(button);
videojs.registerComponent('VRButton', videojs.extend(button, vrBtn));

// Register the plugin with video.js.
videojs.plugin('panorama', panorama({
    _init: function(options){
        var canvas = (options.videoType !== "3dVideo")?
            Canvas(component, THREE, {
                getTech: getTech
            }) :
            ThreeDCanvas(component, THREE, {
                getTech: getTech
            });
        videojs.registerComponent('Canvas', videojs.extend(component, canvas));
    },
    mergeOption: function (defaults, options) {
        return videojs.mergeOptions(defaults, options);
    },
    getTech: getTech,
    getFullscreenToggleClickFn: getFullscreenToggleClickFn
}));

export default function(player, options){
    return player.panorama(options);
};



