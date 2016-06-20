/**
 * Created by yanwsh on 4/3/16.
 */
'use strict';

import util from './lib/Util';
import Detector from './lib/Detector';
import makeVideoPlayableInline from 'iphone-inline-video';

const runOnMobile = (util.mobileAndTabletcheck());

// Default options for the plugin.
const defaults = {
    clickAndDrag: runOnMobile,
    showNotice: true,
    NoticeMessage: "Please use your mouse drag and drop the video.",
    autoHideNotice: 3000,
    //limit the video size when user scroll.
    scrollable: true,
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
    videoType: "equirectangular",
    
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    
    autoMobileOrientation: false,
    mobileVibrationValue: util.isIos()? 0.022 : 1,

    vrEnable: false
};

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
    player.addChild('Canvas', options);
    var canvas = player.getChild('Canvas');
    if(runOnMobile){
        var videoElement = settings.getTech(player);
        if(util.isRealIphone()){
            makeVideoPlayableInline(videoElement, true);
        }
        player.addClass("vjs-panorama-moible-inline-video");
        canvas.playOnMobile();
    }
    if(options.showNotice){
        player.on("playing", function(){
            PopupNotification(player, options);
        });
    }
    canvas.hide();
    player.on("play", function () {
        canvas.show();
    });
};

const PopupNotification = (player, options = {
    NoticeMessage: ""
}) => {
    var notice = player.addChild('Notice', options);

    if(options.autoHideNotice > 0){
        setTimeout(function () {
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
    const videoTypes = ["equirectangular", "fisheye"];
    const panorama = function(options) {
        if(settings.mergeOption) options = settings.mergeOption(defaults, options);
        if(videoTypes.indexOf(options.videoType) == -1) defaults.videoType;
        //check vr support
        if(typeof vr !== "undefined"){
            options.vrEnable = true;
            if(!vr.isInstalled()){
                options.vrEnable = false;
                console.error('NPVR plugin not installed!');
            }
            vr.load(function(error){
                if(error){
                    options.vrEnable = false;
                    console.error('Plugin load failed: ' + error.toString());
                }
            });
        }
        this.ready(() => {
            onPlayerReady(this, options, settings);
        });
    };

// Include the version number.
    panorama.VERSION = '__VERSION__';

    return panorama;
}

export default plugin;