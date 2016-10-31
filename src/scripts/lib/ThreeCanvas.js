/**
 *
 * (c) Wensheng Yan <yanwsh@gmail.com>
 * Date: 10/21/16
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */
'use strict';

import BaseCanvas from './BaseCanvas';
import Util from './Util';

var ThreeDCanvas = function (baseComponent, THREE, settings = {}){
    var parent = BaseCanvas(baseComponent, THREE, settings);
    return Util.extend(parent, {
        constructor: function init(player, options){
            parent.constructor.call(this, player, options);

            //define scene
            this.scene = new THREE.Scene();
            var aspectRatio = this.width / this.height / 2;
            //define camera
            this.cameraL = new THREE.PerspectiveCamera(options.initFov, aspectRatio, 1, 2000);
            this.cameraL.target = new THREE.Vector3( 0, 0, 0 );

            this.cameraR = new THREE.PerspectiveCamera(options.initFov, aspectRatio, 1, 2000);
            this.cameraR.position.set( 1000, 0, 0 );
            this.cameraR.target = new THREE.Vector3( 1000, 0, 0 );

            var geometryL = new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();
            var geometryR = new THREE.SphereBufferGeometry(500, 60, 40).toNonIndexed();

            var uvsL = geometryL.attributes.uv.array;
            var normalsL = geometryL.attributes.normal.array;
            for ( var i = 0; i < normalsL.length / 3; i ++ ) {
                uvsL[ i * 2 + 1 ] = uvsL[ i * 2 + 1 ] / 2;
            }

            var uvsR = geometryR.attributes.uv.array;
            var normalsR = geometryR.attributes.normal.array;
            for ( var i = 0; i < normalsR.length / 3; i ++ ) {
                uvsR[ i * 2 + 1 ] = uvsR[ i * 2 + 1 ] / 2 + 0.5;
            }

            geometryL.scale( - 1, 1, 1 );
            geometryR.scale( - 1, 1, 1 );

            this.meshL = new THREE.Mesh(geometryL,
                new THREE.MeshBasicMaterial({ map: this.texture})
            );

            this.meshR = new THREE.Mesh(geometryR,
                new THREE.MeshBasicMaterial({ map: this.texture})
            );
            this.meshR.position.set(1000, 0, 0);

            this.scene.add(this.meshL);
            this.scene.add(this.meshR);

            if(options.callback) options.callback();
        },

        handleResize: function () {
            parent.handleResize.call(this);
            var aspectRatio = this.width / this.height / 2;
            this.cameraL.aspect = aspectRatio;
            this.cameraR.aspect = aspectRatio;
            this.cameraL.updateProjectionMatrix();
            this.cameraR.updateProjectionMatrix();
        },

        handleMouseWheel: function(event){
            parent.handleMouseWheel(event);
            // WebKit
            if ( event.wheelDeltaY ) {
                this.cameraL.fov -= event.wheelDeltaY * 0.05;
                // Opera / Explorer 9
            } else if ( event.wheelDelta ) {
                this.cameraL.fov -= event.wheelDelta * 0.05;
                // Firefox
            } else if ( event.detail ) {
                this.cameraL.fov += event.detail * 1.0;
            }
            this.cameraL.fov = Math.min(this.settings.maxFov, this.cameraL.fov);
            this.cameraL.fov = Math.max(this.settings.minFov, this.cameraL.fov);
            this.cameraR.fov = this.cameraL.fov;
            this.cameraL.updateProjectionMatrix();
            this.cameraR.updateProjectionMatrix();
        },

        render: function(){
            parent.render.call(this);
            var viewPortWidth = this.width / 2, viewPortHeight = this.height;
            this.cameraL.target.x = 500 * Math.sin( this.phi ) * Math.cos( this.theta );
            this.cameraL.target.y = 500 * Math.cos( this.phi );
            this.cameraL.target.z = 500 * Math.sin( this.phi ) * Math.sin( this.theta );
            this.cameraL.lookAt(this.cameraL.target);

            this.cameraR.target.x = 1000 + 500 * Math.sin( this.phi ) * Math.cos( this.theta );
            this.cameraR.target.y = 500 * Math.cos( this.phi );
            this.cameraR.target.z = 500 * Math.sin( this.phi ) * Math.sin( this.theta );
            this.cameraR.lookAt( this.cameraR.target );

            // render left eye
            this.renderer.setViewport( 0, 0, viewPortWidth, viewPortHeight );
            this.renderer.setScissor( 0, 0, viewPortWidth, viewPortHeight );
            this.renderer.render( this.scene, this.cameraL );

            // render right eye
            this.renderer.setViewport( viewPortWidth, 0, viewPortWidth, viewPortHeight );
            this.renderer.setScissor( viewPortWidth, 0, viewPortWidth, viewPortHeight );
            this.renderer.render( this.scene, this.cameraR );
        }
    });
};

export default ThreeDCanvas;