/**
 *
 * (c) Wensheng Yan <yanwsh@gmail.com>
 * Date: 10/21/16
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
'use strict';

import Detector from '../lib/Detector';
import MobileBuffering from '../lib/MobileBuffering';
import Util from './Util';

const HAVE_ENOUGH_DATA = 4;

var ThreeCanvas = function (baseComponent, settings = {}){
    return {
        constructor: function init(player, options){
            this.settings = options;
            this.width = player.el().offsetWidth, this.height = player.el().offsetHeight;
            this.lon = options.initLon, this.lat = options.initLat, this.phi = 0, this.theta = 0;
            this.videoType = options.videoType;
            this.clickToToggle = options.clickToToggle;
            this.mouseDown = false;
            this.isUserInteracting = false;
            this.threeddirection = options.threeddirection || "LeftRight";

            //define scene
            this.scene = new THREE.Scene();
            //define camera
            this.cameraL = new THREE.PerspectiveCamera(options.initFov, this.width / this.height, 1, 2000);
            this.cameraL.target = new THREE.Vector3( 0, 0, 0 );

            this.cameraR = new THREE.PerspectiveCamera(options.initFov, this.width / this.height, 1, 2000);
            this.cameraR.target = new THREE.Vector3( 1000, 0, 0 );

            //define render
            this.renderer = new THREE.WebGLRenderer();
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

            var geometryL = new THREE.SphereGeometry(500, 60, 40);
            var geometryR = new THREE.SphereGeometry(500, 60, 40);
            geometryR.position.set( 1000, 0, 0 );

            var uvsL = geometryL.attributes.uv.array;
            for ( var i = 0; i < uvsL.length / 2; i ++ ) {
                uvsL[ i * 2 + 1 ] = uvsL[ i * 2 + 1 ] / 2;
            }

            var uvsR = geometryR.attributes.uv.array;
            for ( var i = 0; i < uvsR.length / 2; i ++ ) {
                uvsR[ i * 2 + 1 ] = uvsR[ i * 2 + 1 ] / 2;
            }

            geometryL.scale( - 1, 1, 1 );
            geometryR.scale( - 1, 1, 1 );

            this.meshL = new THREE.Mesh(geometryL,
                new THREE.MeshBasicMaterial({ map: this.texture})
            );

            this.meshR = new THREE.Mesh(geometryR,
                new THREE.MeshBasicMaterial({ map: this.texture})
            );
        },


    };
};

module.exports = ThreeCanvas;