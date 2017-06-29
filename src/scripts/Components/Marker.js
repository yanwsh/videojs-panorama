// @flow

import type { Player, MarkerSettings, Point } from '../types';
import THREE from "three";
import Component from './Component';
import BaseCanvas from './BaseCanvas';
import { mergeOptions } from '../utils';

const defaults = {
    keyPoint: -1,
    duration: -1
};

class Marker extends Component{
    _position: THREE.Vector3;
    _enable: boolean;

    constructor(player: Player, options: MarkerSettings & {
        el?: HTMLElement;
    }){
        let el: HTMLElement;

        let elem = options.element;
        if(typeof elem === "string"){
            el = document.createElement('div');
            el.innerText = elem;
        }else {
            el = elem;
        }
        el.id = options.id || "";
        el.className = "vjs-marker";

        options.el = el;

        super(player, options);
        this._options = mergeOptions({}, defaults, options);

        let phi = THREE.Math.degToRad( 90 - options.location.lat );
        let theta = THREE.Math.degToRad( options.location.lon );
        this._position = new THREE.Vector3(
            options.radius * Math.sin( phi ) * Math.cos( theta ),
            options.radius * Math.cos( phi ),
            options.radius * Math.sin( phi ) * Math.sin( theta ),
        );
        if(this.options.keyPoint < 0){
            this.enableMarker();
        }
    }

    enableMarker(){
        this._enable = true;
        this.addClass("vjs-marker--enable");
    }

    disableMarker(){
        this._enable = false;
        this.removeClass("vjs-marker--enable");
    }

    render(canvas: BaseCanvas, camera: THREE.PerspectiveCamera){
        let angle = this._position.angleTo(camera.target);
        if(angle > Math.PI * 0.4){
            this.addClass("vjs-marker--backside");
        }else{
            this.removeClass("vjs-marker--backside");
            let vector = this._position.clone().project(camera);
            let width = canvas.VRMode? canvas._width / 2: canvas._width;
            let point: Point = {
                x: (vector.x + 1) / 2 * width,
                y: - (vector.y - 1) / 2 * canvas._height
            };
            this.el().style.left =  `${point.x}px`;
            this.el().style.top  =  `${point.y}px`;
        }
    }

    get enable(): boolean{
        return this._enable;
    }

    get position(): THREE.Vector3{
        return this._position;
    }
}

export default Marker;