// @flow

import makeVideoPlayableInline from 'iphone-inline-video';
import type {Settings, Player, VideoTypes} from './types/index';
import type BaseCanvas from './Components/BaseCanvas';
import EventEmitter from 'wolfy87-eventemitter';
import Equirectangular from './Components/Equirectangular';
import Fisheye from './Components/Fisheye';
import DualFisheye from './Components/DualFisheye'
import Notification from './Components/Notification';
import VRButton from './Components/VRButton';
import { Detector, webGLErrorMessage, transitionEvent, mergeOptions, mobileAndTabletcheck, isIos, isRealIphone } from './utils';
import { warning } from './utils/index';

const runOnMobile = mobileAndTabletcheck();

const videoTypes = ["equirectangular", "fisheye", "3dVideo", "dual_fisheye"];

const defaults: Settings = {
    videoType: "equirectangular",
    clickAndDrag: runOnMobile,
    clickToToggle: false,
    scrollable: true,
    resizable: true,
    useHelperCanvas: "auto",
    initFov: 75,
    maxFov: 105,
    minFov: 51,
    //initial position for the video
    initLat: 0,
    initLon: -180,
    //A float value back to center when mouse out the canvas. The higher, the faster.
    returnLatSpeed: 0.5,
    returnLonSpeed: 2,
    backToInitLat: !runOnMobile,
    backToInitLon: !runOnMobile,

    //limit viewable zoom
    minLat: -85,
    maxLat: 85,

    minLon: -Infinity,
    maxLon: Infinity,

    autoMobileOrientation: true,
    mobileVibrationValue: isIos()? 0.022 : 1,

    VREnable: true,
    VRGapDegree: 2.5,
    VRFullscreen: true,//auto fullscreen when in vr mode

    Sphere:{
        rotateX: 0,
        rotateY: 0,
        rotateZ: 0
    },

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
    },

    Notice: {
        Enable: true,
        Message: "Please use your mouse drag and drop the video.",
        HideTime: 3000,
    }
};

/**
 * panorama controller class which control required components
 */
class Panorama extends EventEmitter{
    _options: Settings;
    _player: Player;
    _canvas: BaseCanvas;

    /**
     * check legacy option settings and produce warning message if user use legacy options, automatically set it to new options.
     * @param options the option settings which user parse.
     * @returns {*} the latest version which we use.
     */
    static checkOptions(options: Settings): void {
        if(options.videoType && videoTypes.indexOf(options.videoType) === -1){
            warning(`videoType: ${String(options.videoType)} is not supported, set video type to ${String(defaults.videoType)}.`);
            options.videoType = defaults.videoType;
        }

        if(typeof options.backToVerticalCenter !== "undefined"){
            warning(`backToVerticalCenter is deprecated, please use backToInitLat.`);
            options.backToInitLat = options.backToVerticalCenter;
        }
        if(typeof options.backToHorizonCenter !== "undefined"){
            warning(`backToHorizonCenter is deprecated, please use backToInitLon.`);
            options.backToInitLon = options.backToHorizonCenter;
        }
        if(typeof options.returnStepLat !== "undefined"){
            warning(`returnStepLat is deprecated, please use returnLatSpeed.`);
            options.returnLatSpeed = options.returnStepLat;
        }
        if(typeof options.returnStepLon !== "undefined"){
            warning(`returnStepLon is deprecated, please use returnLonSpeed.`);
            options.returnLonSpeed = options.returnStepLon;
        }
        if(typeof options.helperCanvas !== "undefined"){
            warning(`helperCanvas is deprecated, you don't have to set it up on new version.`);
        }
        if(typeof options.Sphere === "undefined"){
            options.Sphere = {};
        }
        if(typeof options.rotateX !== "undefined"){
            warning(`rotateX is deprecated, please use Sphere:{ rotateX: 0, rotateY: 0, rotateZ: 0}.`);
            if(options.Sphere){
                options.Sphere.rotateX = options.rotateX;
            }
        }
        if(typeof options.rotateY !== "undefined"){
            warning(`rotateY is deprecated, please use Sphere:{ rotateX: 0, rotateY: 0, rotateZ: 0}.`);
            if(options.Sphere){
                options.Sphere.rotateY = options.rotateY;
            }
        }
        if(typeof options.rotateZ !== "undefined"){
            warning(`rotateZ is deprecated, please use Sphere:{ rotateX: 0, rotateY: 0, rotateZ: 0}.`);
            if(options.Sphere){
                options.Sphere.rotateY = options.rotateZ;
            }
        }
        if(typeof options.Notice === "undefined"){
            options.Notice = {};
        }
        if(typeof options.showNotice !== "undefined"){
            warning(`showNotice is deprecated, please use Notice: { Enable: true }`);
            if(options.Notice){
                options.Notice.Enable = options.showNotice;
            }
        }
        if(typeof options.NoticeMessage !== "undefined"){
            warning(`NoticeMessage is deprecated, please use Notice: { Message: "" }`);
            if(options.Notice){
                options.Notice.Message = options.NoticeMessage;
            }
        }
        if(typeof options.autoHideNotice !== "undefined"){
            warning(`autoHideNotice is deprecated, please use Notice: { HideTime: 3000 }`);
            if(options.Notice){
                options.Notice.HideTime = options.autoHideNotice;
            }
        }
    }

    static chooseVideoComponent(videoType: VideoTypes): Class<BaseCanvas>{
        let VideoClass: Class<BaseCanvas>;
        switch(videoType){
            case "equirectangular":
                VideoClass = Equirectangular;
                break;
            case "fisheye":
                VideoClass = Fisheye;
                break;
            case "dual_fisheye":
                VideoClass = DualFisheye;
                break;
            default:
                VideoClass = Equirectangular;
        }
        return VideoClass;
    }

    constructor(player: Player, options: any = {}){
        super();
        if (process.env.NODE_ENV !== 'production') {
            Panorama.checkOptions(options);
        }
        this._options = mergeOptions({}, defaults, options);
        this._player = player;

        this.player.addClass("vjs-panorama");

        if(!Detector.webgl){
            this.popupNotification(webGLErrorMessage());
            return;
        }

        let VideoClass = Panorama.chooseVideoComponent(this.options.videoType);
        //add canvas to player
        this._canvas = new VideoClass(player, this.options);
        this.canvas.hide();
        this.player.addComponent("Canvas", this.canvas);

        if(runOnMobile){
            var videoElement = this.player.getVideoEl();
            if(isRealIphone()){
                //ios 10 support play video inline
                videoElement.setAttribute("playsinline", "");
                makeVideoPlayableInline(videoElement, true);
            }
            if(isIos()){
                this.player.fullscreenOnIOS();
            }
            this.player.addClass("vjs-panorama-mobile-inline-video");
            this.player.removeClass("vjs-using-native-controls");
        }

        if(this.options.VREnable){
            let controlbar = this.player.controlBar();
            let index = controlbar.childNodes.length;
            this.player.addComponent("VRButton", new VRButton(player, this.options), this.player.controlBar(), index - 1);
        }

        this.attachEvents();
    }

    dispose(){
        this.detachEvents();
    }

    attachEvents(){
        if(this.options.Notice && this.options.Notice.Enable){
            this.player.one("playing", ()=>{
                let message = this.options.Notice && this.options.Notice.Message || "";
                this.popupNotification(message);
            });
        }

        const handlePlay = () => {
            this.player.getVideoEl().style.visibility = "hidden";
            this.canvas.startAnimation();
            this.canvas.show();
        };
        if(!this.player.paused()){
            handlePlay();
        }else{
            this.player.one("play", handlePlay);
        }

        this.player.on("fullscreenchange",  () => {
            this.canvas.handleResize();
        });

        const report = () => {
            this.player.reportUserActivity();
        };

        this.canvas.addListeners({
            "touchMove": report,
            "tap": report
        });

        if(this.options.clickToToggle){
            this.canvas.addListener("tap", ()=>{
                this.player.paused()? this.player.play() : this.player.pause();
            });
        }

        if(this.options.VREnable){
            let VRButton = this.player.getComponent("VRButton").component;
            VRButton.addListener("click", ()=>{
                let VRMode = this.canvas.VRMode;
                (!VRMode)? this.canvas.enableVR() : this.canvas.disableVR();
                (!VRMode)?  this.trigger('VRModeOn'):  this.trigger('VRModeOff');
                if(!VRMode && this.options.VRFullscreen){
                    this.player.enableFullscreen();
                }
            });
        }
    }

    detachEvents(){
        if(this.canvas){
            this.canvas.stopAnimation();
        }
    }

    popupNotification(message: string | HTMLElement){
        let notice = this.player.addComponent("Notice", new Notification(this.player, {
            Message: message
        }));

        if(this.options.Notice && this.options.Notice.HideTime && this.options.Notice.HideTime > 0){
            setTimeout(function () {
                notice.addClass("vjs-video-notice-fadeOut");
                notice.one(transitionEvent, ()=>{
                    notice.hide();
                    notice.removeClass("vjs-video-notice-fadeOut");
                });
            }, this.options.Notice.HideTime);
        }
    }

    get canvas(): BaseCanvas{
        return this._canvas;
    }

    get player(): Player{
        return this._player;
    }

    get options(): Settings{
        return this._options;
    }
}

export default Panorama;