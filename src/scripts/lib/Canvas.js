/**
 * Created by yanwsh on 4/3/16.
 */
import Detector from '../lib/Detector';
const HAVE_ENOUGH_DATA = 4;

var Canvas = function (baseComponent, settings = {}) {
    return {
        constructor: function init(player, options){
            baseComponent.call(this, player, options);

            this.width = player.el().offsetWidth, this.height = player.el().offsetHeight;
            this.lon = options.initLon, this.lat = options.initLat, this.phi = 0, this.theta = 0;
            this.clickToToggle = options.clickToToggle;
            this.mouseDown = false;
            this.isUserInteracting = false;
            this.player = player;
            //define scene
            this.scene = new THREE.Scene();
            //define camera
            this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 1, 2000);
            this.camera.target = new THREE.Vector3( 0, 0, 0 );
            //define render
            this.renderer = Detector.webgl? new THREE.WebGLRenderer() : new THREE.CanvasRenderer();
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(this.width, this.height);
            this.renderer.autoClear = false;
            this.renderer.setClearColor(0x000000, 1);

            //define texture
            var video = settings.getTech(player);
            this.supportVideoTexture = Detector.supportVideoTexture();
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
            //define mesh
            this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 60, 40),
                new THREE.MeshBasicMaterial({ map: this.texture})
            );
            this.mesh.scale.x = -1;
            this.scene.add(this.mesh);
            this.el_ = this.renderer.domElement;
            this.el_.classList.add('vjs-video-canvas');

            this.attachControlEvents();
            this.player.on("play", function () {
                this.time = new Date().getTime();
                this.animate();
            }.bind(this));
            if(options.callback) options.callback();
        },

        attachControlEvents: function(){
            this.on('mousemove', this.handleMouseMove.bind(this));
            this.on('touchmove', this.handleMouseMove.bind(this));
            this.on('mousedown', this.handleMouseDown.bind(this));
            this.on('touchstart',this.handleMouseDown.bind(this));
            this.on('mouseup', this.handleMouseUp.bind(this));
            this.on('touchend', this.handleMouseUp.bind(this));
            if(this.options_.scrollable){
                this.on('mousewheel', this.handleMouseWheel.bind(this));
                this.on('MozMousePixelScroll', this.handleMouseWheel.bind(this));
            }
            this.on('mouseenter', this.handleMouseEnter.bind(this));
            this.on('mouseleave', this.handleMouseLease.bind(this));
        },

        handleMouseUp: function(event){
            this.mouseDown = false;
            if(this.clickToToggle){
                var clientX = event.clientX || event.changedTouches[0].clientX;
                var clientY = event.clientY || event.changedTouches[0].clientY;
                var diffX = Math.abs(clientX - this.onPointerDownPointerX);
                var diffY = Math.abs(clientY - this.onPointerDownPointerY);
                if(diffX < 0.1 && diffY < 0.1)
                    this.player.paused() ? this.player.play() : this.player.pause();
            }
        },

        handleMouseDown: function(event){
            event.preventDefault();
            var clientX = event.clientX || event.touches[0].clientX;
            var clientY = event.clientY || event.touches[0].clientY;
            this.mouseDown = true;
            this.onPointerDownPointerX = clientX;
            this.onPointerDownPointerY = clientY;
            this.onPointerDownLon = this.lon;
            this.onPointerDownLat = this.lat;
        },

        handleMouseMove: function(event){
            var clientX = event.clientX || event.touches[0].clientX;
            var clientY = event.clientY || event.touches[0].clientY;
            if(this.options_.clickAndDrag){
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
            this.lat = Math.min(this.options_.maxLat, this.lat);
            this.lat = Math.max(this.options_.minLat, this.lat);
        },

        handleMouseWheel: function(event){
            event.stopPropagation();
            event.preventDefault();
            // WebKit
            if ( event.wheelDeltaY ) {
                this.camera.fov -= event.wheelDeltaY * 0.05;
                // Opera / Explorer 9
            } else if ( event.wheelDelta ) {
                this.camera.fov -= event.wheelDelta * 0.05;
                // Firefox
            } else if ( event.detail ) {
                this.camera.fov += event.detail * 1.0;
            }
            this.camera.fov = Math.min(this.options_.maxFov, this.camera.fov);
            this.camera.fov = Math.max(this.options_.minFov, this.camera.fov);
            this.camera.updateProjectionMatrix();
        },

        handleMouseEnter: function (event) {
            this.isUserInteracting = true;
        },

        handleMouseLease: function (event) {
            this.isUserInteracting = false;
        },

        animate: function(){
            this.requestAnimationId = requestAnimationFrame( this.animate.bind(this) );
            if(!this.player.paused()){
                if(typeof(this.texture) !== "undefined" && (!this.isPlayOnMobile && this.player.readyState() === HAVE_ENOUGH_DATA || this.isPlayOnMobile && this.player.hasClass("vjs-playing"))) {
                    var ct = new Date().getTime();
                    if (ct - this.time >= 30) {
                        this.texture.needsUpdate = true;
                        this.time = ct;
                    }
                }
            }
            this.render();
        },

        render: function(){
            if(!this.isUserInteracting){
                var symbolLat = (this.lat > this.options_.initLat)?  -1 : 1;
                var symbolLon = (this.lon > this.options_.initLon)?  -1 : 1;
                if(this.options_.backToVerticalCenter){
                    this.lat = (
                        this.lat > (this.options_.initLat - Math.abs(this.options_.returnStepLat)) &&
                        this.lat < (this.options_.initLat + Math.abs(this.options_.returnStepLat))
                    )? this.options_.initLat : this.lat + this.options_.returnStepLat * symbolLat;
                }
                if(this.options_.backToHorizonCenter){
                    this.lon = (
                        this.lon > (this.options_.initLon - Math.abs(this.options_.returnStepLon)) &&
                        this.lon < (this.options_.initLon + Math.abs(this.options_.returnStepLon))
                    )? this.options_.initLon : this.lon + this.options_.returnStepLon * symbolLon;
                }
            }
            this.lat = Math.max( - 85, Math.min( 85, this.lat ) );
            this.phi = THREE.Math.degToRad( 90 - this.lat );
            this.theta = THREE.Math.degToRad( this.lon );
            this.camera.target.x = 500 * Math.sin( this.phi ) * Math.cos( this.theta );
            this.camera.target.y = 500 * Math.cos( this.phi );
            this.camera.target.z = 500 * Math.sin( this.phi ) * Math.sin( this.theta );
            this.camera.lookAt( this.camera.target );

            if(!this.supportVideoTexture){
                this.helperCanvas.update();
            }
            this.renderer.clear();
            this.renderer.render( this.scene, this.camera );
        },
        
        playOnMobile: function () {
          this.isPlayOnMobile = true;
        },

        el: function(){
            return this.el_;
        }
    }
};

module.exports = Canvas;