// @flow

import type { Player, Settings } from '../types';
import BaseCanvas from './BaseCanvas';
import THREE from "three";
import { getTouchesDistance, fovToProjection, mergeOptions } from '../utils'

class TwoDVideo extends BaseCanvas{
    _VRMode: boolean;
    _scene: any;
    _camera: any;

    _eyeFOVL: any;
    _eyeFOVR: any;

    _cameraL: any;
    _cameraR: any;

    constructor(player: Player, options: Settings){
        super(player, options);

        this._VRMode = false;
        //define scene
        this._scene = new THREE.Scene();
        //define camera
        this._camera = new THREE.PerspectiveCamera(this.options.initFov, this._width / this._height, 1, 2000);
        this._camera.target = new THREE.Vector3( 0, 0, 0 );
    }

    enableVR(){
        this._VRMode = true;

        if(typeof window.vrHMD !== 'undefined'){
            let eyeParamsL = window.vrHMD.getEyeParameters( 'left' );
            let eyeParamsR = window.vrHMD.getEyeParameters( 'right' );

            this._eyeFOVL = eyeParamsL.recommendedFieldOfView;
            this._eyeFOVR = eyeParamsR.recommendedFieldOfView;
        }

        this._cameraL = new THREE.PerspectiveCamera(this._camera.fov, this._width / 2 / this._height, 1, 2000);
        this._cameraR = new THREE.PerspectiveCamera(this._camera.fov, this._width / 2 / this._height, 1, 2000);
    }

    disableVR(){
        this._VRMode = false;
        this._renderer.setViewport( 0, 0, this._width, this._height );
        this._renderer.setScissor( 0, 0, this._width, this._height );
    }

    handleResize(){
        super.handleResize();
        this._camera.aspect = this._width / this._height;
        this._camera.updateProjectionMatrix();
        if(this._VRMode){
            this._cameraL.aspect = this._camera.aspect / 2;
            this._cameraR.aspect = this._camera.aspect / 2;
            this._cameraL.updateProjectionMatrix();
            this._cameraR.updateProjectionMatrix();
        }
    }

    handleMouseWheel(event: any){
        super.handleMouseWheel(event);

        // WebKit
        if ( event.wheelDeltaY ) {
            this._camera.fov -= event.wheelDeltaY * 0.05;
            // Opera / Explorer 9
        } else if ( event.wheelDelta ) {
            this._camera.fov -= event.wheelDelta * 0.05;
            // Firefox
        } else if ( event.detail ) {
            this._camera.fov += event.detail * 1.0;
        }
        this._camera.fov = Math.min(this.options.maxFov, this._camera.fov);
        this._camera.fov = Math.max(this.options.minFov, this._camera.fov);
        this._camera.updateProjectionMatrix();
        if(this._VRMode){
            this._cameraL.fov = this._camera.fov;
            this._cameraR.fov = this._camera.fov;
            this._cameraL.updateProjectionMatrix();
            this._cameraR.updateProjectionMatrix();
        }
    }

    handleTouchMove(event: any) {
        super.handleTouchMove(event);

        if(this._isUserPinch){
            let currentDistance = getTouchesDistance(event.touches);
            event.wheelDeltaY =  (currentDistance - this._multiTouchDistance) * 2;
            this.handleMouseWheel(event);
            this._multiTouchDistance = currentDistance;
        }
    }

    render(){
        super.render();

        this._camera.target.x = 500 * Math.sin( this._phi ) * Math.cos( this._theta );
        this._camera.target.y = 500 * Math.cos( this._phi );
        this._camera.target.z = 500 * Math.sin( this._phi ) * Math.sin( this._theta );
        this._camera.lookAt( this._camera.target );

        if(!this._VRMode){
            this._renderer.render( this._scene, this._camera );
        }
        else{
            let viewPortWidth = this._width / 2, viewPortHeight = this._height;
            if(typeof window.vrHMD !== 'undefined'){
                this._cameraL.projectionMatrix = fovToProjection( this._eyeFOVL, true, this._camera.near, this._camera.far );
                this._cameraR.projectionMatrix = fovToProjection( this._eyeFOVR, true, this._camera.near, this._camera.far );
            }else{
                let lonL = this._lon + this.options.VRGapDegree;
                let lonR = this._lon - this.options.VRGapDegree;

                let thetaL = THREE.Math.degToRad( lonL );
                let thetaR = THREE.Math.degToRad( lonR );

                //deep copy target value
                let targetL = mergeOptions({}, this._camera.target);
                targetL.x = 500 * Math.sin( this._phi ) * Math.cos( thetaL );
                targetL.z = 500 * Math.sin( this._phi ) * Math.sin( thetaL );
                this._cameraL.lookAt(targetL);

                let targetR = mergeOptions({}, this._camera.target);
                targetR.x = 500 * Math.sin( this._phi ) * Math.cos( thetaR );
                targetR.z = 500 * Math.sin( this._phi ) * Math.sin( thetaR );
                this._cameraR.lookAt(targetR);
            }
            // render left eye
            this._renderer.setViewport( 0, 0, viewPortWidth, viewPortHeight );
            this._renderer.setScissor( 0, 0, viewPortWidth, viewPortHeight );
            this._renderer.render( this._scene, this._cameraL );

            // render right eye
            this._renderer.setViewport( viewPortWidth, 0, viewPortWidth, viewPortHeight );
            this._renderer.setScissor( viewPortWidth, 0, viewPortWidth, viewPortHeight );
            this._renderer.render( this._scene, this._cameraR );
        }
    }
}

export default TwoDVideo;