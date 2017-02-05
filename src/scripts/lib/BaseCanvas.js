/**
 *
 * (c) Wensheng Yan <yanwsh@gmail.com>
 * Date: 10/30/16
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
'use strict';

import Detector from '../lib/Detector';
import MobileBuffering from '../lib/MobileBuffering';

const HAVE_CURRENT_DATA = 2;

var BaseCanvas = function (baseComponent, THREE, settings = {}) {
    return {
        constructor: function init(player, options){
            this.settings = options;
            //basic settings
            this.width = player.el().offsetWidth, this.height = player.el().offsetHeight;
            this.lon = options.initLon, this.lat = options.initLat, this.phi = 0, this.theta = 0;
            this.videoType = options.videoType;
            this.clickToToggle = options.clickToToggle;
            this.mouseDown = false;
            this.isUserInteracting = false;

            //define render
            this.renderer = new THREE.WebGLRenderer();
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(this.width, this.height);
            this.renderer.autoClear = false;
            this.renderer.setClearColor(0x000000, 1);

            //define texture, on ie 11, we need additional helper canvas to solve rendering issue.
            var video = settings.getTech(player);
            this.supportVideoTexture = Detector.supportVideoTexture();
            this.liveStreamOnSafari = Detector.isLiveStreamOnSafari(video);
            if(this.liveStreamOnSafari) this.supportVideoTexture = false;
            if(!this.supportVideoTexture){
                this.helperCanvas = player.addChild("HelperCanvas", {
                    video: video,
                    width: this.width,
                    height: this.height
                });
                var context = this.helperCanvas.el();
                this.texture = new THREE.Texture(context);
            }else{
                this.texture = new THREE.Texture(video);
            }

            video.style.display = "none";

            this.texture.generateMipmaps = false;
            this.texture.minFilter = THREE.LinearFilter;
            this.texture.maxFilter = THREE.LinearFilter;
            this.texture.format = THREE.RGBFormat;

            this.el_ = this.renderer.domElement;
            this.el_.classList.add('vjs-video-canvas');

            options.el = this.el_;
            baseComponent.call(this, player, options);

            this.attachControlEvents();
            this.player().on("play", function () {
                this.time = new Date().getTime();
                this.animate();
            }.bind(this));
        },

        attachControlEvents: function(){
            this.on('mousemove', this.handleMouseMove.bind(this));
            this.on('touchmove', this.handleMouseMove.bind(this));
            this.on('mousedown', this.handleMouseDown.bind(this));
            this.on('touchstart',this.handleMouseDown.bind(this));
            this.on('mouseup', this.handleMouseUp.bind(this));
            this.on('touchend', this.handleMouseUp.bind(this));
            if(this.settings.scrollable){
                this.on('mousewheel', this.handleMouseWheel.bind(this));
                this.on('MozMousePixelScroll', this.handleMouseWheel.bind(this));
            }
            this.on('mouseenter', this.handleMouseEnter.bind(this));
            this.on('mouseleave', this.handleMouseLease.bind(this));
        },

        handleResize: function () {
            this.width = this.player().el().offsetWidth, this.height = this.player().el().offsetHeight;
            this.renderer.setSize( this.width, this.height );
        },

        handleMouseUp: function(event){
            this.mouseDown = false;
            if(this.clickToToggle){
                var clientX = event.clientX || event.changedTouches && event.changedTouches[0].clientX;
                var clientY = event.clientY || event.changedTouches && event.changedTouches[0].clientY;
                if(typeof clientX === "undefined" || clientY === "undefined") return;
                var diffX = Math.abs(clientX - this.onPointerDownPointerX);
                var diffY = Math.abs(clientY - this.onPointerDownPointerY);
                if(diffX < 0.1 && diffY < 0.1)
                    this.player().paused() ? this.player().play() : this.player().pause();
            }
        },

        handleMouseDown: function(event){
            event.preventDefault();
            var clientX = event.clientX || event.touches && event.touches[0].clientX;
            var clientY = event.clientY || event.touches && event.touches[0].clientY;
            if(typeof clientX === "undefined" || clientY === "undefined") return;
            this.mouseDown = true;
            this.onPointerDownPointerX = clientX;
            this.onPointerDownPointerY = clientY;
            this.onPointerDownLon = this.lon;
            this.onPointerDownLat = this.lat;
        },

        handleMouseMove: function(event){
            var clientX = event.clientX || event.touches && event.touches[0].clientX;
            var clientY = event.clientY || event.touches && event.touches[0].clientY;
            if(typeof clientX === "undefined" || clientY === "undefined") return;
            if(this.settings.clickAndDrag){
                if(this.mouseDown){
                    this.lon = ( this.onPointerDownPointerX - clientX ) * 0.2 + this.onPointerDownLon;
                    this.lat = ( clientY - this.onPointerDownPointerY ) * 0.2 + this.onPointerDownLat;
                }
            }else{
                var x = event.pageX - this.el_.offsetLeft;
                var y = event.pageY - this.el_.offsetTop;
                this.lon = (x / this.width) * 430 - 225;
                this.lat = (y / this.height) * -180 + 90;
            }
        },

        handleMobileOrientation: function (event) {
            if(typeof event.rotationRate === "undefined") return;
            var x = event.rotationRate.alpha;
            var y = event.rotationRate.beta;
            var portrait = (typeof event.portrait !== "undefined")? event.portrait : window.matchMedia("(orientation: portrait)").matches;
            var landscape = (typeof event.landscape !== "undefined")? event.landscape : window.matchMedia("(orientation: landscape)").matches;
            var orientation = event.orientation || window.orientation;

            if (portrait) {
                this.lon = this.lon - y * this.settings.mobileVibrationValue;
                this.lat = this.lat + x * this.settings.mobileVibrationValue;
            }else if(landscape){
                var orientationDegree = -90;
                if(typeof orientation != "undefined"){
                    orientationDegree = orientation;
                }

                this.lon = (orientationDegree == -90)? this.lon + x * this.settings.mobileVibrationValue : this.lon - x * this.settings.mobileVibrationValue;
                this.lat = (orientationDegree == -90)? this.lat + y * this.settings.mobileVibrationValue : this.lat - y * this.settings.mobileVibrationValue;
            }
        },

        handleMouseWheel: function(event){
            event.stopPropagation();
            event.preventDefault();
        },

        handleMouseEnter: function (event) {
            this.isUserInteracting = true;
        },

        handleMouseLease: function (event) {
            this.isUserInteracting = false;
            if(this.mouseDown) {
                this.mouseDown = false;
            }
        },

        animate: function(){
            this.requestAnimationId = requestAnimationFrame( this.animate.bind(this) );
            if(!this.player().paused()){
                if(typeof(this.texture) !== "undefined" && (!this.isPlayOnMobile && this.player().readyState() >= HAVE_CURRENT_DATA || this.isPlayOnMobile && this.player().hasClass("vjs-playing"))) {
                    var ct = new Date().getTime();
                    if (ct - this.time >= 30) {
                        this.texture.needsUpdate = true;
                        this.time = ct;
                    }
                    if(this.isPlayOnMobile){
                        var currentTime = this.player().currentTime();
                        if(MobileBuffering.isBuffering(currentTime)){
                            if(!this.player().hasClass("vjs-panorama-mobile-inline-video-buffering")){
                                this.player().addClass("vjs-panorama-mobile-inline-video-buffering");
                            }
                        }else{
                            if(this.player().hasClass("vjs-panorama-mobile-inline-video-buffering")){
                                this.player().removeClass("vjs-panorama-mobile-inline-video-buffering");
                            }
                        }
                    }
                }
            }
            this.render();
        },

        render: function(){
            if(!this.isUserInteracting){
                var symbolLat = (this.lat > this.settings.initLat)?  -1 : 1;
                var symbolLon = (this.lon > this.settings.initLon)?  -1 : 1;
                if(this.settings.backToVerticalCenter){
                    this.lat = (
                        this.lat > (this.settings.initLat - Math.abs(this.settings.returnStepLat)) &&
                        this.lat < (this.settings.initLat + Math.abs(this.settings.returnStepLat))
                    )? this.settings.initLat : this.lat + this.settings.returnStepLat * symbolLat;
                }
                if(this.settings.backToHorizonCenter){
                    this.lon = (
                        this.lon > (this.settings.initLon - Math.abs(this.settings.returnStepLon)) &&
                        this.lon < (this.settings.initLon + Math.abs(this.settings.returnStepLon))
                    )? this.settings.initLon : this.lon + this.settings.returnStepLon * symbolLon;
                }
            }
            this.lat = Math.max( this.settings.minLat, Math.min( this.settings.maxLat, this.lat ) );
            this.lon = Math.max( this.settings.minLon, Math.min( this.settings.maxLon, this.lon ) );
            this.phi = THREE.Math.degToRad( 90 - this.lat );
            this.theta = THREE.Math.degToRad( this.lon );

            if(!this.supportVideoTexture){
                this.helperCanvas.update();
            }
            this.renderer.clear();
        },

        playOnMobile: function () {
            this.isPlayOnMobile = true;
            if(this.settings.autoMobileOrientation)
                window.addEventListener('devicemotion', this.handleMobileOrientation.bind(this));
        },

        el: function(){
            return this.el_;
        }
    }
};

export default BaseCanvas;
