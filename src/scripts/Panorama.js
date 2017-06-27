// @flow

import makeVideoPlayableInline from 'iphone-inline-video';
import type {Settings, Player, VideoTypes, Coordinates} from './types/index';
import type BaseCanvas from './Components/BaseCanvas';
import EventEmitter from 'wolfy87-eventemitter';
import Equirectangular from './Components/Equirectangular';
import Fisheye from './Components/Fisheye';
import DualFisheye from './Components/DualFisheye';
import ThreeDVideo from './Components/ThreeDVideo';
import Notification from './Components/Notification';
import Thumbnail from './Components/Thumbnail';
import VRButton from './Components/VRButton';
import { Detector, webGLErrorMessage, crossDomainWarning, transitionEvent, mergeOptions, mobileAndTabletcheck, isIos, isRealIphone } from './utils';
import { warning } from './utils/index';

const runOnMobile = mobileAndTabletcheck();

const videoTypes = ["equirectangular", "fisheye", "3dVideo", "dual_fisheye"];

export const defaults: Settings = {
    videoType: "equirectangular",
    MouseEnable: true,
    clickAndDrag: true,
    movingSpeed: {
        x: 0.0005,
        y: 0.0005
    },
    clickToToggle: false,
    scrollable: true,
    resizable: true,
    useHelperCanvas: "auto",
    initFov: 75,
    maxFov: 105,
    minFov: 51,
    //initial position for the video
    initLat: 0,
    initLon: 180,
    //A float value back to center when mouse out the canvas. The higher, the faster.
    returnLatSpeed: 0.5,
    returnLonSpeed: 2,
    backToInitLat: false,
    backToInitLon: false,

    //limit viewable zoom
    minLat: -85,
    maxLat: 85,

    minLon: 0,
    maxLon: 360,

    autoMobileOrientation: true,
    mobileVibrationValue: isIos()? 0.022 : 1,

    VREnable: runOnMobile,
    VRGapDegree: 2.5,
    VRFullscreen: true,//auto fullscreen when in vr mode

    PanoramaThumbnail: false,
    KeyboardControl: false,
    KeyboardMovingSpeed: {
        x: 1,
        y: 1
    },

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
    },

    Markers: []
};

/**
 * panorama controller class which control required components
 */
class Panorama extends EventEmitter{
    _options: Settings;
    _player: Player;
    _videoCanvas: BaseCanvas;
    _thumbnailCanvas: BaseCanvas | null;

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
        if(typeof options.callback !== "undefined"){
            warning(`callback is deprecated, please use ready.`);
            options.ready = options.callback;
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
            case "3dVideo":
                VideoClass = ThreeDVideo;
                break;
            default:
                VideoClass = Equirectangular;
        }
        return VideoClass;
    }

    constructor(player: Player, options: any = {}){
        super();
        Panorama.checkOptions(options);
        this._options = mergeOptions({}, defaults, options);
        this._player = player;

        this.player.addClass("vjs-panorama");

        if(!Detector.webgl){
            this.popupNotification(webGLErrorMessage());
            return;
        }

        let VideoClass = Panorama.chooseVideoComponent(this.options.videoType);
        //render 360 thumbnail
        if(this.options.PanoramaThumbnail && player.getThumbnailURL()){
            let thumbnailURL = player.getThumbnailURL();
            let poster = new Thumbnail(player, {
                posterSrc: thumbnailURL,
                onComplete: ()=>{
                    if(this.thumbnailCanvas){
                        this.thumbnailCanvas._texture.needsUpdate = true;
                        this.thumbnailCanvas.startAnimation();
                    }
                }
            });
            this.player.addComponent("Thumbnail", poster);

            poster.el().style.display = "none";
            this._thumbnailCanvas = new VideoClass(player, this.options, poster.el());
            this.player.addComponent("ThumbnailCanvas", this.thumbnailCanvas);

            this.player.one("play", () => {
                this.thumbnailCanvas && this.thumbnailCanvas.hide();
                this.player.removeComponent("Thumbnail");
                this.player.removeComponent("ThumbnailCanvas");
                this._thumbnailCanvas = null;
            });
        }

        //enable inline play on mobile
        if(runOnMobile){
            let videoElement = this.player.getVideoEl();
            if(isRealIphone()){
                //ios 10 support play video inline
                videoElement.setAttribute("playsinline", "");
                makeVideoPlayableInline(videoElement, true);
            }
            this.player.addClass("vjs-panorama-mobile-inline-video");
            //by default videojs hide control bar on mobile device.
            this.player.removeClass("vjs-using-native-controls");
        }

        //add vr icon to player
        if(this.options.VREnable){
            let controlbar = this.player.controlBar();
            let index = controlbar.childNodes.length;
            let vrButton = new VRButton(player, this.options);
            vrButton.disable();
            this.player.addComponent("VRButton", vrButton, this.player.controlBar(), index - 1);
        }

        this.player.ready(()=>{
            //add canvas to player
            this._videoCanvas = new VideoClass(player, this.options, player.getVideoEl());
            this.videoCanvas.hide();
            this.player.addComponent("VideoCanvas", this.videoCanvas);

            this.attachEvents();

            if(this.options.VREnable){
                let vrButton = this.player.getComponent("VRButton");
                vrButton && vrButton.enable();
            }

            if(this.options.ready){
                this.options.ready.call(this);
            }
        });

        //register trigger callback function, so everything trigger to player will also trigger in here
        this.player.registerTriggerCallback((eventName)=>{
            this.trigger(eventName);
        });
    }

    dispose(){
        this.detachEvents();
        this.player.getVideoEl().style.visibility = "visible";
        this.player.removeComponent("VideoCanvas");
    }

    attachEvents(){
        //show notice message
        if(this.options.Notice && this.options.Notice.Enable){
            this.player.one("playing", ()=>{
                let message = this.options.Notice && this.options.Notice.Message || "";
                this.popupNotification(message);
            });
        }

        //enable canvas rendering when video is playing
        const handlePlay = () => {
            this.player.getVideoEl().style.visibility = "hidden";
            this.videoCanvas.startAnimation();
            this.videoCanvas.show();

            //detect black screen
            if(window.console && window.console.error){
                let originalErrorFunction = window.console.error;
                window.console.error = (error)=>{
                    if(error.message.indexOf("insecure") !== -1){
                        this.popupNotification(crossDomainWarning());
                        this.dispose();
                    }
                };
                setTimeout(()=>{
                    window.console.error = originalErrorFunction;
                }, 500);
            }
        };
        if(!this.player.paused()){
            handlePlay();
        }else{
            this.player.one("play", handlePlay);
        }

        const report = () => {
            this.player.reportUserActivity();
        };

        this.videoCanvas.addListeners({
            "touchMove": report,
            "tap": report
        });
    }

    detachEvents(){
        if(this.thumbnailCanvas){
            this.thumbnailCanvas.stopAnimation();
        }
        if(this.videoCanvas){
            this.videoCanvas.stopAnimation();
        }
    }

    popupNotification(message: string | HTMLElement){
        let notice = this.player.addComponent("Notice", new Notification(this.player, {
            Message: message
        }));

        if(this.options.Notice && this.options.Notice.HideTime && this.options.Notice.HideTime > 0){
            setTimeout(function () {
                notice.removeClass("vjs-video-notice-show");
                notice.addClass("vjs-video-notice-fadeOut");
                notice.one(transitionEvent, ()=>{
                    notice.hide();
                    notice.removeClass("vjs-video-notice-fadeOut");
                });
            }, this.options.Notice.HideTime);
        }
    }

    getCoordinates(): Coordinates{
        let canvas = this.thumbnailCanvas || this.videoCanvas;
        return {
            lat: canvas._lat,
            lon: canvas._lon
        }
    }

    get thumbnailCanvas(): BaseCanvas | null{
        return this._thumbnailCanvas;
    }

    get videoCanvas(): BaseCanvas{
        return this._videoCanvas;
    }

    get player(): Player{
        return this._player;
    }

    get options(): Settings{
        return this._options;
    }
}

export default Panorama;