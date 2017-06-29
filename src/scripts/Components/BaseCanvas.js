// @flow

import type { Player, Settings, Point, Location } from '../types';
import THREE from "three";
import Component from './Component';
import HelperCanvas from './HelperCanvas';
import { supportVideoTexture, getTouchesDistance, mobileAndTabletcheck } from '../utils';

const HAVE_CURRENT_DATA = 2;

class BaseCanvas extends Component{
    /**
     * Dimension
     */
    _width: number;
    _height: number;

    /**
     * Position
     */
    _lon: number;
    _lat: number;
    _phi: number;
    _theta: number;

    /**
     * Three.js
     */
    _helperCanvas: HelperCanvas;
    _renderer: any;
    _texture: any;
    _scene: any;

    /**
     * Interaction
     */
    _VRMode: boolean;
    _mouseDown: boolean;
    _mouseDownPointer: Point;
    _mouseDownLocation: Location;
    _accelector: Point;

    _isUserInteracting: boolean;
    _isUserPinch: boolean;
    _multiTouchDistance: number;

    _requestAnimationId: window;
    _time: number;
    _runOnMobile: boolean;

    /**
     * Base constructor
     * @param player
     * @param options
     */
    constructor(player: Player, options: Settings, renderElement: HTMLElement){
        super(player, options, renderElement);
        this._width = this.player.el().offsetWidth, this._height = this.player.el().offsetHeight;
        this._lon = this.options.initLon, this._lat = this.options.initLat, this._phi = 0, this._theta = 0;
        this._accelector = {
            x: 0,
            y: 0
        };
        this._renderer.setSize(this._width, this._height);

        //init interaction
        this._mouseDown = false;
        this._isUserInteracting = false;
        this._runOnMobile = mobileAndTabletcheck();
        this._VRMode = false;

        this._mouseDownPointer = {
            x: 0,
            y: 0
        };

        this._mouseDownLocation = {
            Lat: 0,
            Lon: 0
        };

        this.attachControlEvents();
    }


    createEl(tagName?: string = "div", properties?: any, attributes?: any): HTMLElement{
        /**
         * initial webgl render
         */
        this._renderer = new THREE.WebGLRenderer();
        this._renderer.setPixelRatio(window.devicePixelRatio);
        this._renderer.autoClear = false;
        this._renderer.setClearColor(0x000000, 1);

        const renderElement = this._renderElement;

        if(renderElement.tagName.toLowerCase() === "video" && (this.options.useHelperCanvas === true || (!supportVideoTexture(renderElement) && this.options.useHelperCanvas === "auto"))){
            this._helperCanvas = this.player.addComponent("HelperCanvas", new HelperCanvas(this.player));

            const context = this._helperCanvas.el();
            this._texture = new THREE.Texture(context);
        }else{
            this._texture = new THREE.Texture(renderElement);
        }

        this._texture.generateMipmaps = false;
        this._texture.minFilter = THREE.LinearFilter;
        this._texture.maxFilter = THREE.LinearFilter;
        this._texture.format = THREE.RGBFormat;

        let el: HTMLElement = this._renderer.domElement;
        el.classList.add('vjs-panorama-canvas');

        return el;
    }

    dispose(){
        this.detachControlEvents();
        this.stopAnimation();
        super.dispose();
    }

    startAnimation() {
        this._time = new Date().getTime();
        this.animate();
    }

    stopAnimation(){
        if(this._requestAnimationId){
            cancelAnimationFrame(this._requestAnimationId);
        }
    }

    attachControlEvents(): void{
        this.on('mousemove', this.handleMouseMove.bind(this));
        this.on('touchmove', this.handleTouchMove.bind(this));
        this.on('mousedown', this.handleMouseDown.bind(this));
        this.on('touchstart',this.handleTouchStart.bind(this));
        this.on('mouseup', this.handleMouseUp.bind(this));
        this.on('touchend', this.handleTouchEnd.bind(this));
        this.on('mouseenter', this.handleMouseEnter.bind(this));
        this.on('mouseleave', this.handleMouseLease.bind(this));
        if(this.options.scrollable){
            this.on('mousewheel', this.handleMouseWheel.bind(this));
            this.on('MozMousePixelScroll', this.handleMouseWheel.bind(this));
        }
        if(this.options.resizable){
            window.addEventListener("resize", this.handleResize.bind(this));
        }
        if(this.options.autoMobileOrientation){
            window.addEventListener('devicemotion', this.handleMobileOrientation.bind(this));
        }
        if(this.options.KeyboardControl){
            window.addEventListener( 'keydown', this.handleKeyDown.bind(this));
            window.addEventListener( 'keyup', this.handleKeyUp.bind(this) );
        }
    }

    detachControlEvents(): void{
        this.off('mousemove', this.handleMouseMove.bind(this));
        this.off('touchmove', this.handleTouchMove.bind(this));
        this.off('mousedown', this.handleMouseDown.bind(this));
        this.off('touchstart',this.handleTouchStart.bind(this));
        this.off('mouseup', this.handleMouseUp.bind(this));
        this.off('touchend', this.handleTouchEnd.bind(this));
        this.off('mouseenter', this.handleMouseEnter.bind(this));
        this.off('mouseleave', this.handleMouseLease.bind(this));
        if(this.options.scrollable){
            this.off('mousewheel', this.handleMouseWheel.bind(this));
            this.off('MozMousePixelScroll', this.handleMouseWheel.bind(this));
        }
        if(this.options.resizable){
            window.removeEventListener("resize", this.handleResize.bind(this));
        }
        if(this.options.autoMobileOrientation){
            window.removeEventListener('devicemotion', this.handleMobileOrientation.bind(this));
        }
        if(this.options.KeyboardControl){
            window.removeEventListener( 'keydown', this.handleKeyDown.bind(this));
            window.removeEventListener( 'keyup', this.handleKeyUp.bind(this) );
        }
    }

    /**
     * trigger when window resized
     */
    handleResize(): void{
        this._width = this.player.el().offsetWidth, this._height = this.player.el().offsetHeight;
        this._renderer.setSize( this._width, this._height );
    }

    handleMouseWheel(event: MouseEvent){
        event.stopPropagation();
        event.preventDefault();
    }

    handleMouseEnter(event: MouseEvent) {
        this._isUserInteracting = true;
        this._accelector.x = 0;
        this._accelector.y = 0;
    }

    handleMouseLease(event: MouseEvent) {
        this._isUserInteracting = false;
        this._accelector.x = 0;
        this._accelector.y = 0;
        if(this._mouseDown) {
            this._mouseDown = false;
        }
    }

    handleMouseDown(event: any): void{
        event.preventDefault();
        const clientX = event.clientX || event.touches && event.touches[0].clientX;
        const clientY = event.clientY || event.touches && event.touches[0].clientY;
        if(typeof clientX !== "undefined" && clientY !== "undefined") {
            this._mouseDown = true;
            this._mouseDownPointer.x = clientX;
            this._mouseDownPointer.y = clientY;
            this._mouseDownLocation.Lon = this._lon;
            this._mouseDownLocation.Lat = this._lat;
        }
    }

    handleMouseMove(event: any): void{
        const clientX = event.clientX || event.touches && event.touches[0].clientX;
        const clientY = event.clientY || event.touches && event.touches[0].clientY;

        if(this.options.MouseEnable && typeof clientX !== "undefined" && typeof clientY !== "undefined") {
            if(this.options.clickAndDrag){
                if(this._mouseDown){
                    this._lon = ( this._mouseDownPointer.x - clientX ) * 0.2 + this._mouseDownLocation.Lon;
                    this._lat = ( clientY - this._mouseDownPointer.y ) * 0.2 + this._mouseDownLocation.Lat;
                    this._accelector.x = 0;
                    this._accelector.y = 0;
                }
                //do nothing if mouse down is not detected.
            }else{
                var rect = this.el().getBoundingClientRect();
                const x = clientX - this._width / 2 - rect.left;
                const y = this._height / 2 - (clientY - rect.top);
                let angle = 0;
                if(x === 0){
                    angle = (y > 0)? Math.PI / 2 : Math.PI * 3 / 2;
                }else if(x > 0 && y > 0){
                    angle = Math.atan(y / x);
                }else if(x > 0 && y < 0){
                    angle = 2 * Math.PI - Math.atan(y * -1 / x);
                }else if(x < 0 && y > 0){
                    angle = Math.PI - Math.atan(y / x * -1);
                }else {
                    angle = Math.PI + Math.atan(y / x);
                }
                this._accelector.x = Math.cos(angle) * this.options.movingSpeed.x * Math.abs(x);
                this._accelector.y = Math.sin(angle) * this.options.movingSpeed.y * Math.abs(y);
            }
        }
    }

    handleMouseUp(event: any): void{
        this._mouseDown = false;
        if(this.options.clickToToggle){
            const clientX = event.clientX || event.changedTouches && event.changedTouches[0].clientX;
            const clientY = event.clientY || event.changedTouches && event.changedTouches[0].clientY;
            if(typeof clientX !== "undefined" && clientY !== "undefined" && this.options.clickToToggle) {
                const diffX = Math.abs(clientX - this._mouseDownPointer.x);
                const diffY = Math.abs(clientY - this._mouseDownPointer.y);
                if(diffX < 0.1 && diffY < 0.1)
                    this.player.paused() ? this.player.play() : this.player.pause();
            }
        }
    }

    handleTouchStart(event: TouchEvent) {
        if (event.touches.length > 1) {
            this._isUserPinch = true;
            this._multiTouchDistance = getTouchesDistance(event.touches);
        }
        this.handleMouseDown(event);
    }

    handleTouchMove(event: TouchEvent) {
        this.trigger("touchMove");
        //handle single touch event,
        if (!this._isUserPinch || event.touches.length <= 1) {
            this.handleMouseMove(event);
        }
    }

    handleTouchEnd(event: TouchEvent) {
        this._isUserPinch = false;
        this.handleMouseUp(event);
    }

    handleMobileOrientation(event: any){
        if(typeof event.rotationRate !== "undefined"){
            const x = event.rotationRate.alpha;
            const y = event.rotationRate.beta;
            const portrait = (typeof event.portrait !== "undefined")? event.portrait : window.matchMedia("(orientation: portrait)").matches;
            const landscape = (typeof event.landscape !== "undefined")? event.landscape : window.matchMedia("(orientation: landscape)").matches;
            const orientation = event.orientation || window.orientation;

            if (portrait) {
                this._lon = this._lon - y * this.options.mobileVibrationValue;
                this._lat = this._lat + x * this.options.mobileVibrationValue;
            }else if(landscape){
                let orientationDegree = -90;
                if(typeof orientation !== "undefined"){
                    orientationDegree = orientation;
                }

                this._lon = (orientationDegree === -90)? this._lon + x * this.options.mobileVibrationValue : this._lon - x * this.options.mobileVibrationValue;
                this._lat = (orientationDegree === -90)? this._lat + y * this.options.mobileVibrationValue : this._lat - y * this.options.mobileVibrationValue;
            }
        }
    }

    handleKeyDown(event: any){
        this._isUserInteracting = true;
        switch(event.keyCode){
            case 38: /*up*/
            case 87: /*W*/
                this._lat += this.options.KeyboardMovingSpeed.y;
                break;
            case 37: /*left*/
            case 65: /*A*/
                this._lon -= this.options.KeyboardMovingSpeed.x;
                break;
            case 39: /*right*/
            case 68: /*D*/
                this._lon += this.options.KeyboardMovingSpeed.x;
                break;
            case 40: /*down*/
            case 83: /*S*/
                this._lat -= this.options.KeyboardMovingSpeed.y;
                break;
        }
    }

    handleKeyUp(event: any){
        this._isUserInteracting = false;
    }

    enableVR() {
        this._VRMode = true;
    }

    disableVR() {
        this._VRMode = false;
    }


    animate(){
        this._requestAnimationId = requestAnimationFrame( this.animate.bind(this) );
        let ct = new Date().getTime();
        if (ct - this._time >= 30) {
            this._texture.needsUpdate = true;
            this._time = ct;
            this.trigger("textureRender");
        }

        //canvas should only be rendered when video is ready or will report `no video` warning message.
        if(this._renderElement.tagName.toLowerCase() !== "video" || this.player.readyState() >= HAVE_CURRENT_DATA){
            this.render();
        }
    }

    render(){
        if(!this._isUserInteracting){
            let symbolLat = (this._lat > this.options.initLat)?  -1 : 1;
            let symbolLon = (this._lon > this.options.initLon)?  -1 : 1;
            if(this.options.backToInitLat){
                this._lat = (
                    this._lat > (this.options.initLat - Math.abs(this.options.returnLatSpeed)) &&
                    this._lat < (this.options.initLat + Math.abs(this.options.returnLatSpeed))
                )? this.options.initLat : this._lat + this.options.returnLatSpeed * symbolLat;
            }
            if(this.options.backToInitLon){
                this._lon = (
                    this._lon > (this.options.initLon - Math.abs(this.options.returnLonSpeed)) &&
                    this._lon < (this.options.initLon + Math.abs(this.options.returnLonSpeed))
                )? this.options.initLon : this._lon + this.options.returnLonSpeed * symbolLon;
            }
        }else if(this._accelector.x !== 0 && this._accelector.y !== 0){
            this._lat += this._accelector.y;
            this._lon += this._accelector.x;
        }

        if(this._options.minLon === 0 && this._options.maxLon === 360){
            if(this._lon > 360){
                this._lon -= 360;
            }else if(this._lon < 0){
                this._lon += 360;
            }
        }

        this._lat = Math.max( this.options.minLat, Math.min( this.options.maxLat, this._lat ) );
        this._lon = Math.max( this.options.minLon, Math.min( this.options.maxLon, this._lon ) );
        this._phi = THREE.Math.degToRad( 90 - this._lat );
        this._theta = THREE.Math.degToRad( this._lon );

        if(this._helperCanvas){
            this._helperCanvas.render();
        }
        this._renderer.clear();
        this.trigger("render");
    }

    get VRMode(): boolean{
        return this._VRMode;
    }
}

export default BaseCanvas;