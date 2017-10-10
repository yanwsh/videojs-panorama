/**
 * Created by yanwsh on 4/3/16.
 */
'use strict';

import util from './lib/Util';
import Detector from './lib/Detector';

const runOnMobile = (typeof window !== "undefined")? util.mobileAndTabletcheck() : false;

// Default options for the plugin.
const defaults = {
    clickAndDrag: runOnMobile,
    showNotice: true,
    NoticeMessage: "Please use your mouse drag and drop the video.",
    autoHideNotice: 3000,
    //limit the video size when user scroll.
    scrollable: true,
    initFov: 75,
    maxFov: 105,
    minFov: 51,
    //initial position for the video
    initLat: 0,
    initLon: -180,
    //A float value back to center when mouse out the canvas. The higher, the faster.
    returnStepLat: 0.5,
    returnStepLon: 2,
    backToVerticalCenter: !runOnMobile,
    backToHorizonCenter: !runOnMobile,
    clickToToggle: false,

    //limit viewable zoom
    minLat: -85,
    maxLat: 85,

    minLon: -Infinity,
    maxLon: Infinity,

    videoType: "equirectangular",

    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,

    autoMobileOrientation: false,
    mobileVibrationValue: (runOnMobile && util.isIos())? 0.022 : 1,

    VREnable: true,
    VRGapDegree: 2.5,

    closePanorama: false,

    helperCanvas: {},

    dualFish: {
        width: 1920,
        height: 1080,
        circle1: {
            x: 0.240625,
            y: 0.553704,
            rx: 0.23333,
            ry: 0.43148,
            coverX: 0.913,
            coverY: 0.9
        },
        circle2: {
            x: 0.757292,
            y: 0.553704,
            rx: 0.232292,
            ry: 0.4296296,
            coverX: 0.913,
            coverY: 0.9308
        }
    }
};

function playerResize(player){
    var canvas = player.getChild('Canvas');
    return function () {
        player.el().style.width = window.innerWidth + "px";
        player.el().style.height = window.innerHeight + "px";
        canvas.handleResize();
    };
}

function fullscreenOnIOS(player, clickFn) {
    var resizeFn = playerResize(player);
    player.controlBar.fullscreenToggle.off("tap", clickFn);
    player.controlBar.fullscreenToggle.on("tap", function fullscreen() {
        var canvas = player.getChild('Canvas');
        if(!player.isFullscreen()){
            //set to fullscreen
            player.isFullscreen(true);
            player.enterFullWindow();
            resizeFn();
            window.addEventListener("devicemotion", resizeFn);
        }else{
            player.isFullscreen(false);
            player.exitFullWindow();
            player.el().style.width = "";
            player.el().style.height = "";
            canvas.handleResize();
            window.removeEventListener("devicemotion", resizeFn);
        }
    });
}

/**
 * Function to invoke when the player is ready.
 *
 * This is a great place for your plugin to initialize itself. When this
 * function is called, the player will have its DOM and child components
 * in place.
 *
 * @function onPlayerReady
 * @param    {Player} player
 * @param    {Object} [options={}]
 */
const onPlayerReady = (player, options, settings) => {
    player.addClass('vjs-panorama');
    if(!Detector.webgl){
        PopupNotification(player, {
            NoticeMessage: Detector.getWebGLErrorMessage(),
            autoHideNotice: options.autoHideNotice
        });
        if(options.callback){
            options.callback();
        }
        return;
    }
    player.addChild('Canvas', util.deepCopy(options));
    var canvas = player.getChild('Canvas');
    if(runOnMobile){
        var videoElement = settings.getTech(player);
        if(util.isRealIphone()){
            let makeVideoPlayableInline = require('iphone-inline-video');
            //ios 10 support play video inline
            videoElement.setAttribute("playsinline", "");
            makeVideoPlayableInline(videoElement, true);
        }
        if(util.isIos()){
            fullscreenOnIOS(player, settings.getFullscreenToggleClickFn(player));
        }
        player.addClass("vjs-panorama-mobile-inline-video");
        player.removeClass("vjs-using-native-controls");
        canvas.playOnMobile();
    }
    if(options.showNotice){
        player.on("playing", function(){
            PopupNotification(player, util.deepCopy(options));
        });
    }
    if(options.VREnable){
        player.controlBar.addChild('VRButton', {}, player.controlBar.children().length - 1);
    }
    canvas.hide();
    player.on("play", function () {
        canvas.show();
    });
    player.on("fullscreenchange", function () {
        canvas.handleResize();
    });
    if(options.callback) options.callback();
};

const PopupNotification = (player, options = {
    NoticeMessage: ""
}) => {
    var notice = player.addChild('Notice', options);

    if(options.autoHideNotice > 0){
        setTimeout(function () {
            if (!notice.el_) {
                return;
            }
            notice.addClass("vjs-video-notice-fadeOut");
            var transitionEvent = util.whichTransitionEvent();
            var hide = function () {
                notice.hide();
                notice.removeClass("vjs-video-notice-fadeOut");
                notice.off(transitionEvent, hide);
            };
            notice.on(transitionEvent, hide);
        }, options.autoHideNotice);
    }
};

const plugin = function(settings = {}){
    /**
     * A video.js plugin.
     *
     * In the plugin function, the value of `this` is a video.js `Player`
     * instance. You cannot rely on the player being in a "ready" state here,
     * depending on how the plugin is invoked. This may or may not be important
     * to you; if not, remove the wait for "ready"!
     *
     * @function panorama
     * @param    {Object} [options={}]
     *           An object of options left to the plugin author to define.
     */
    const videoTypes = ["equirectangular", "fisheye", "3dVideo", "dual_fisheye"];
    const panorama = function(options) {
        if(settings.mergeOption) options = settings.mergeOption(defaults, options);
        if(typeof settings._init === "undefined" || typeof settings._init !== "function") {
            console.error("plugin must implement init function().");
            return;
        }
        if(videoTypes.indexOf(options.videoType) == -1) options.videoType = defaults.videoType;
        settings._init(options);
        /* implement callback function when videojs is ready */
        this.ready(() => {
            onPlayerReady(this, options, settings);
        });
    };

// Include the version number.
    panorama.VERSION = '__VERSION__';

    return panorama;
};

export default plugin;
