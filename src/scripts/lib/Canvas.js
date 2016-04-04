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
            this.lon = 0, this.lat = 0, this.phi = 0, this.theta = 0;
            this.mouseDown = false;
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
            this.texture = new THREE.Texture(video);
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
            this.on('mousewheel', this.handleMouseWheel.bind(this));
            this.on('MozMousePixelScroll', this.handleMouseWheel.bind(this));
        },

        handleMouseUp: function(){
            this.mouseDown = false;
        },

        handleMouseDown: function(event){
            event.preventDefault();
            this.mouseDown = true;
            this.onPointerDownPointerX = event.clientX;
            this.onPointerDownPointerY = event.clientY;
            this.onPointerDownLon = this.lon;
            this.onPointerDownLat = this.lat;
        },

        handleMouseMove: function(event){
            if(this.options_.clickAndDrag){
                if(this.mouseDown){
                    this.lon = ( this.onPointerDownPointerX - event.clientX ) * 0.2 + this.onPointerDownLon;
                    this.lat = ( event.clientY - this.onPointerDownPointerY ) * 0.2 + this.onPointerDownLat;
                }
            }else{
                var x = event.pageX - this.el_.offsetLeft;
                var y = event.pageY - this.el_.offsetTop;
                this.lon = (x / this.width) * 430 - 225;
                this.lat = (y / this.height) * -180 + 90;
            }
        },

        handleMouseWheel: function(event){
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
            this.camera.updateProjectionMatrix();
        },

        animate: function(){
            this.requestAnimationId = requestAnimationFrame( this.animate.bind(this) );
            if(!this.player.paused()){
                if(typeof(this.texture) !== "undefined" && this.player.readyState() === HAVE_ENOUGH_DATA) {
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
            this.lat = Math.max( - 85, Math.min( 85, this.lat ) );
            this.phi = THREE.Math.degToRad( 90 - this.lat );
            this.theta = THREE.Math.degToRad( this.lon );
            this.camera.target.x = 500 * Math.sin( this.phi ) * Math.cos( this.theta );
            this.camera.target.y = 500 * Math.cos( this.phi );
            this.camera.target.z = 500 * Math.sin( this.phi ) * Math.sin( this.theta );
            this.camera.lookAt( this.camera.target );

            this.renderer.clear();
            this.renderer.render( this.scene, this.camera );
        },

        el: function(){
            return this.el_;
        }
    }
};

module.exports = Canvas;