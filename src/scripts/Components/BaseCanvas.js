'use strict';

import EventEmitter from 'wolfy87-eventemitter';
import Util from '../lib/Util';

const HAVE_CURRENT_DATA = 2;

class BaseCanvas extends EventEmitter{
    constructor(player, options){
        super();
        this._options = options;
        this._player = player;
        //define canvas width and height base on player's dimension
        let width = this.player.offsetWidth, height = this.player.offsetHeight;
        this.lon = this.options.initLon, this.lat = this.options.initLat, this.phi = 0, this.theta = 0;
        this.videoType = this.options.videoType;
        this.mouseDown = false;
        this.isUserInteracting = false;

        //define render
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.width, this.height);
        this.renderer.autoClear = false;
        this.renderer.setClearColor(0x000000, 1);

        this.texture = new THREE.Texture(this.player);
        this.texture.generateMipmaps = false;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.maxFilter = THREE.LinearFilter;
        this.texture.format = THREE.RGBFormat;

        this._el = this.renderer.domElement;
        this._el.classList.add('vjs-video-canvas');

    }

    attachControlEvents(){
        this.on('mousemove', this.handleMouseMove.bind(this));
        this.on('touchmove', this.handleTouchMove.bind(this));
        this.on('mousedown', this.handleMouseDown.bind(this));
        this.on('touchstart',this.handleTouchStart.bind(this));
        this.on('mouseup', this.handleMouseUp.bind(this));
        this.on('touchend', this.handleTouchEnd.bind(this));
        if(this.options.scrollable){
            this.on('mousewheel', this.handleMouseWheel.bind(this));
            this.on('MozMousePixelScroll', this.handleMouseWheel.bind(this));
        }
        this.on('mouseenter', this.handleMouseEnter.bind(this));
        this.on('mouseleave', this.handleMouseLease.bind(this));
        this.on('dispose', this.handleDispose.bind(this));
    }

    handleMouseDown(event) {
        event.preventDefault();
        let clientX = event.clientX || event.touches && event.touches[0].clientX;
        let clientY = event.clientY || event.touches && event.touches[0].clientY;
        if (typeof clientX === "undefined" || clientY === "undefined") return;
        this.mouseDown = true;
        this.onPointerDownPointerX = clientX;
        this.onPointerDownPointerY = clientY;
        this.onPointerDownLon = this.lon;
        this.onPointerDownLat = this.lat;
    }

    handleMouseUp(event) {
        this.mouseDown = false;
        // enable to trigger click event
        if (this.options.clickToToggle) {
            let clientX = event.clientX || event.changedTouches && event.changedTouches[0].clientX;
            let clientY = event.clientY || event.changedTouches && event.changedTouches[0].clientY;
            if (typeof clientX === "undefined" || clientY === "undefined") return;
            var diffX = Math.abs(clientX - this.onPointerDownPointerX);
            var diffY = Math.abs(clientY - this.onPointerDownPointerY);
            if (diffX < 0.1 && diffY < 0.1)
                this.emitEvent("click");
        }
    }

    handleTouchStart(event) {
        if (event.touches.length > 1) {
            this.isUserPinch = true;
            this.multiTouchDistance = Util.getTouchesDistance(event.touches);
        }
        this.handleMouseDown(event);
    }

    handleTouchEnd(event) {
        this.isUserPinch = false;
        this.handleMouseUp(event);
    }

    handleMouseMove(event){
        let clientX = event.clientX || event.touches && event.touches[0].clientX;
        let clientY = event.clientY || event.touches && event.touches[0].clientY;
        if(typeof clientX === "undefined" || clientY === "undefined") return;
        if(this.options.clickAndDrag){
            if(this.mouseDown){
                this.lon = ( this.onPointerDownPointerX - clientX ) * 0.2 + this.onPointerDownLon;
                this.lat = ( clientY - this.onPointerDownPointerY ) * 0.2 + this.onPointerDownLat;
            }
        }else{
            var x = clientX - this.el_.offsetLeft;
            var y = clientY - this.el_.offsetTop;
            this.lon = (x / this.width) * 430 - 225;
            this.lat = (y / this.height) * -180 + 90;
        }
    }

    init() {
        this.render_animation = true;
        this.animate();
    }

    dispose(){
        this.render_animation = false;
        if(this.requestAnimationId){
            cancelAnimationFrame(this.requestAnimationId);
        }
    }

    animate(){
        if(!this.render_animation) return;
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
    }

    render(){
        if(!this.isUserInteracting){
            var symbolLat = (this.lat > this.options.initLat)?  -1 : 1;
            var symbolLon = (this.lon > this.options.initLon)?  -1 : 1;
            if(this.options.backToVerticalCenter){
                this.lat = (
                    this.lat > (this.options.initLat - Math.abs(this.options.returnStepLat)) &&
                    this.lat < (this.options.initLat + Math.abs(this.options.returnStepLat))
                )? this.options.initLat : this.lat + this.options.returnStepLat * symbolLat;
            }
            if(this.options.backToHorizonCenter){
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
    }

    on(eventName, fn){
        this.el().addEventListener(eventName, fn);
    }

    off(eventName, fn){
        this.el().removeEventListener(eventName, fn);
    }

    get player(){
        return this._player;
    }

    get el(){
        return this._el;
    }

    get options(){
        return this._options;
    }
}

