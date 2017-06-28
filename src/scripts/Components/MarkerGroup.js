// @flow

import THREE from "three";
import type { Player, MarkerSettings } from '../types';
import Component from './Component';
import Marker from './Marker';

class MarkerGroup extends Component{
    _totalMarkers: number;
    _markers: Marker;
    _camera: THREE.PerspectiveCamera;

    constructor(player: Player, options: {
        id: string;
        markers: MarkerSettings[]
    }){
        super(player, options);
        this._totalMarkers = 0;
        this.el().classList.add("vjs-markergroup");

        this.options.markers.forEach((markSetting)=>{
            this.addMarker(markSetting);
        });
    }

    attachEvents(){

    }

    addMarker(markSetting: any): Marker{
        this._totalMarkers++;
        markSetting.id= (markSetting.id? markSetting.id : `marker_${this._totalMarkers}`) + `_${this.options.id}`;
        let marker = new Marker(this.player, markSetting);
        this.addChild(markSetting.id, marker);
        this._markers.push(marker);
        return marker;
    }

    updateMarkers(){
        let currentTime = this.player.getVideoEl().currentTime * 1000;
        this._markers.forEach((marker)=>{
            if(marker.options.duration > 0){

            }

        });
    }
}

export default MarkerGroup;