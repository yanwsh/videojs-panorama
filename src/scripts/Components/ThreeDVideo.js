// @flow

import type { Player, Settings } from '../types';
import BaseCanvas from './BaseCanvas';
import THREE from "three";

class ThreeDVideo extends BaseCanvas{
    _cameraL: any;
    _cameraR: any;

    _meshL: any;
    _meshR: any;

    constructor(player: Player, options: Settings, renderElement: HTMLElement){
        super(player, options, renderElement);

        //only show left part by default
        this._scene = new THREE.Scene();

        let aspectRatio = this._width / this._height;
        //define camera
        this._cameraL = new THREE.PerspectiveCamera(this.options.initFov, aspectRatio, 1, 2000);
        this._cameraL.target = new THREE.Vector3( 0, 0, 0 );

        this._cameraR = new THREE.PerspectiveCamera(this.options.initFov, aspectRatio / 2, 1, 2000);
        this._cameraR.position.set( 1000, 0, 0 );
        this._cameraR.target = new THREE.Vector3( 1000, 0, 0 );
    }

    handleResize(): void{
        super.handleResize();

        let aspectRatio = this._width / this._height;
        if(!this.VRMode) {
            this._cameraL.aspect = aspectRatio;
            this._cameraL.updateProjectionMatrix();
        }else{
            aspectRatio /= 2;
            this._cameraL.aspect = aspectRatio;
            this._cameraR.aspect = aspectRatio;
            this._cameraL.updateProjectionMatrix();
            this._cameraR.updateProjectionMatrix();
        }
    }

    handleMouseWheel(event: any){
        super.handleMouseWheel(event);

        // WebKit
        if ( event.wheelDeltaY ) {
            this._cameraL.fov -= event.wheelDeltaY * 0.05;
            // Opera / Explorer 9
        } else if ( event.wheelDelta ) {
            this._cameraL.fov -= event.wheelDelta * 0.05;
            // Firefox
        } else if ( event.detail ) {
            this._cameraL.fov += event.detail * 1.0;
        }
        this._cameraL.fov = Math.min(this.options.maxFov, this._cameraL.fov);
        this._cameraL.fov = Math.max(this.options.minFov, this._cameraL.fov);
        this._cameraL.updateProjectionMatrix();
        if(this.VRMode){
            this._cameraR.fov = this._cameraL.fov;
            this._cameraR.updateProjectionMatrix();
        }
    }

    enableVR() {
        super.enableVR();
        this._scene.add(this._meshR);
        this.handleResize();
    }

    disableVR() {
        super.disableVR();
        this._scene.remove(this._meshR);
        this.handleResize();
    }

    render(){
        super.render();

        this._cameraL.target.x = 500 * Math.sin( this._phi ) * Math.cos( this._theta );
        this._cameraL.target.y = 500 * Math.cos( this._phi );
        this._cameraL.target.z = 500 * Math.sin( this._phi ) * Math.sin( this._theta );
        this._cameraL.lookAt(this._cameraL.target);

        if(this.VRMode){
            let viewPortWidth = this._width / 2, viewPortHeight = this._height;
            this._cameraR.target.x = 1000 + 500 * Math.sin( this._phi ) * Math.cos( this._theta );
            this._cameraR.target.y = 500 * Math.cos( this._phi );
            this._cameraR.target.z = 500 * Math.sin( this._phi ) * Math.sin( this._theta );
            this._cameraR.lookAt( this._cameraR.target );

            // render left eye
            this._renderer.setViewport( 0, 0, viewPortWidth, viewPortHeight );
            this._renderer.setScissor( 0, 0, viewPortWidth, viewPortHeight );
            this._renderer.render( this._scene, this._cameraL );

            // render right eye
            this._renderer.setViewport( viewPortWidth, 0, viewPortWidth, viewPortHeight );
            this._renderer.setScissor( viewPortWidth, 0, viewPortWidth, viewPortHeight );
            this._renderer.render( this._scene, this._cameraR );
        }else{
            this._renderer.render( this._scene, this._cameraL );
        }
    }
}

export default ThreeDVideo;