/**
 * Created by yanwsh on 4/3/16.
 */

import BaseCanvas from './BaseCanvas';
import Util from './Util';

var Canvas = function (baseComponent, THREE, settings = {}) {
    var parent = BaseCanvas(baseComponent, THREE, settings);

    return Util.extend(parent, {
        constructor: function init(player, options){
            parent.constructor.call(this, player, options);

            this.VRMode = false;
            //define scene
            this.scene = new THREE.Scene();
            //define camera
            this.camera = new THREE.PerspectiveCamera(options.initFov, this.width / this.height, 1, 2000);
            this.camera.target = new THREE.Vector3( 0, 0, 0 );

            //define geometry
            var geometry = (this.videoType === "equirectangular")? new THREE.SphereGeometry(500, 60, 40): new THREE.SphereBufferGeometry( 500, 60, 40 ).toNonIndexed();
            if(this.videoType === "fisheye"){
                var normals = geometry.attributes.normal.array;
                var uvs = geometry.attributes.uv.array;
                for ( var i = 0, l = normals.length / 3; i < l; i ++ ) {
                    var x = normals[ i * 3 + 0 ];
                    var y = normals[ i * 3 + 1 ];
                    var z = normals[ i * 3 + 2 ];

                    var r = Math.asin(Math.sqrt(x * x + z * z) / Math.sqrt(x * x  + y * y + z * z)) / Math.PI;
                    if(y < 0) r = 1 - r;
                    var theta = (x == 0 && z == 0)? 0 : Math.acos(x / Math.sqrt(x * x + z * z));
                    if(z < 0) theta = theta * -1;
                    uvs[ i * 2 + 0 ] = -0.8 * r * Math.cos(theta) + 0.5;
                    uvs[ i * 2 + 1 ] = 0.8 * r * Math.sin(theta) + 0.5;
                }
                geometry.rotateX( options.rotateX);
                geometry.rotateY( options.rotateY);
                geometry.rotateZ( options.rotateZ);
            }
            geometry.scale( - 1, 1, 1 );
            //define mesh
            this.mesh = new THREE.Mesh(geometry,
                new THREE.MeshBasicMaterial({ map: this.texture})
            );
            //this.mesh.scale.x = -1;
            this.scene.add(this.mesh);
        },

        enableVR: function () {
            this.VRMode = true;
            if(typeof vrHMD !== 'undefined'){
                var eyeParamsL = vrHMD.getEyeParameters( 'left' );
                var eyeParamsR = vrHMD.getEyeParameters( 'right' );

                this.eyeFOVL = eyeParamsL.recommendedFieldOfView;
                this.eyeFOVR = eyeParamsR.recommendedFieldOfView;
            }

            this.cameraL = new THREE.PerspectiveCamera(this.camera.fov, this.width /2 / this.height, 1, 2000);
            this.cameraR = new THREE.PerspectiveCamera(this.camera.fov, this.width /2 / this.height, 1, 2000);
        },

        disableVR: function () {
            this.VRMode = false;
            this.renderer.setViewport( 0, 0, this.width, this.height );
            this.renderer.setScissor( 0, 0, this.width, this.height );
        },

        handleResize: function () {
            parent.handleResize.call(this);
            this.camera.aspect = this.width / this.height;
            this.camera.updateProjectionMatrix();
            if(this.VRMode){
                this.cameraL.aspect = this.camera.aspect / 2;
                this.cameraR.aspect = this.camera.aspect / 2;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
        },

        handleMouseWheel: function(event){
            parent.handleMouseWheel(event);
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
            this.camera.fov = Math.min(this.settings.maxFov, this.camera.fov);
            this.camera.fov = Math.max(this.settings.minFov, this.camera.fov);
            this.camera.updateProjectionMatrix();
            if(this.VRMode){
                this.cameraL.fov = this.camera.fov;
                this.cameraR.fov = this.camera.fov;
                this.cameraL.updateProjectionMatrix();
                this.cameraR.updateProjectionMatrix();
            }
        },

        render: function(){
            parent.render.call(this);
            this.camera.target.x = 500 * Math.sin( this.phi ) * Math.cos( this.theta );
            this.camera.target.y = 500 * Math.cos( this.phi );
            this.camera.target.z = 500 * Math.sin( this.phi ) * Math.sin( this.theta );
            this.camera.lookAt( this.camera.target );

            if(!this.VRMode){
                this.renderer.render( this.scene, this.camera );
            }
            else{
                var viewPortWidth = this.width / 2, viewPortHeight = this.height;
                if(typeof vrHMD !== 'undefined'){
                    this.cameraL.projectionMatrix = Util.fovToProjection( this.eyeFOVL, true, this.camera.near, this.camera.far );
                    this.cameraR.projectionMatrix = Util.fovToProjection( this.eyeFOVR, true, this.camera.near, this.camera.far );
                }else{
                    var lonL = this.lon + this.settings.VRGapDegree;
                    var lonR = this.lon - this.settings.VRGapDegree;

                    var thetaL = THREE.Math.degToRad( lonL );
                    var thetaR = THREE.Math.degToRad( lonR );

                    var targetL = Util.deepCopy(this.camera.target);
                    targetL.x = 500 * Math.sin( this.phi ) * Math.cos( thetaL );
                    targetL.z = 500 * Math.sin( this.phi ) * Math.sin( thetaL );
                    this.cameraL.lookAt(targetL);

                    var targetR = Util.deepCopy(this.camera.target);
                    targetR.x = 500 * Math.sin( this.phi ) * Math.cos( thetaR );
                    targetR.z = 500 * Math.sin( this.phi ) * Math.sin( thetaR );
                    this.cameraR.lookAt(targetR);
                }
                // render left eye
                this.renderer.setViewport( 0, 0, viewPortWidth, viewPortHeight );
                this.renderer.setScissor( 0, 0, viewPortWidth, viewPortHeight );
                this.renderer.render( this.scene, this.cameraL );

                // render right eye
                this.renderer.setViewport( viewPortWidth, 0, viewPortWidth, viewPortHeight );
                this.renderer.setScissor( viewPortWidth, 0, viewPortWidth, viewPortHeight );
                this.renderer.render( this.scene, this.cameraR );
            }
        }
    });
};

export default Canvas;
