// @flow

import THREE from "three";
import type { Player, MarkerSettings } from '../types';
import Component from './Component';
import BaseCanvas from './BaseCanvas';
import Marker from './Marker';

class MarkerGroup extends Component{
    //save total markers enable to generate marker id
    _totalMarkers: number;
    _markers: Marker[];
    _camera: THREE.PerspectiveCamera;
    _canvas: BaseCanvas;

    constructor(player: Player, options: {
        id: string;
        markers: MarkerSettings[],
        canvas: BaseCanvas,
        camera: THREE.PerspectiveCamera
    }){
        super(player, options);
        this._totalMarkers = 0;
        this._markers = [];
        this._camera = options.camera;
        this.el().classList.add("vjs-marker-group");
        this._canvas = options.canvas;

        this.options.markers.forEach((markSetting)=>{
            this.addMarker(markSetting);
        });
    }

    attachEvents(){
        this.el().classList.add("vjs-marker-group--enable");
        this.player.on("timeupdate", this.updateMarkers.bind(this));
        this._canvas.addListener("render", this.renderMarkers.bind(this));
    }

    detachEvents(){
        this.el().classList.remove("vjs-marker-group--enable");
        this.player.off("timeupdate", this.updateMarkers.bind(this));
        this._canvas.removeListener("render", this.renderMarkers.bind(this));
    }

    addMarker(markSetting: any): Marker{
        this._totalMarkers++;
        markSetting.id= `${this.options.id}_` + (markSetting.id? markSetting.id : `marker_${this._totalMarkers}`);
        let marker = new Marker(this.player, markSetting);
        this.addChild(markSetting.id, marker);
        this._markers.push(marker);
        return marker;
    }

    removeMarker(markerId: string): void{
        this.removeChild(markerId);
    }

    updateMarkers(){
        let currentTime = this.player.getVideoEl().currentTime * 1000;
        this._markers.forEach((marker)=>{
            //only check keypoint greater and equal zero
            if(marker.options.keyPoint >= 0){
                if(marker.options.duration > 0){
                    (marker.options.keyPoint <= currentTime && currentTime < marker.options.keyPoint + marker.options.duration)?
                        !marker.enable && marker.enableMarker() : marker.enable && marker.disableMarker();
                }else{
                    (marker.options.keyPoint <= currentTime)?
                        !marker.enable && marker.enableMarker() : marker.enable && marker.disableMarker();
                }
            }
        });
    }

    renderMarkers(){
        this._markers.forEach((marker)=>{
            if(marker.enable){
                marker.render(this._canvas, this._camera);
            }
        });
    }

    set camera(camera: THREE.PerspectiveCamera){
        this._camera = camera;
    }
}

export default MarkerGroup;