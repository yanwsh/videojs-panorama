// @flow

import BaseCanvas from './BaseCanvas';
import Component from './Component';
import MarkerGroup from './MarkerGroup';
import type { Player, MarkerSettings } from '../types';

class MarkerContainer extends Component{
    _canvas: BaseCanvas;

    constructor(player: Player, options: {
        canvas: BaseCanvas;
        markers: MarkerSettings[];
        VREnable: boolean;
    }){
        super(player, options);
        this.el().classList.add("vjs-marker-container");
        this._canvas = this.options.canvas;

        if(this.options.VREnable){
            let leftMarkerGroup = new MarkerGroup(this.player, {
                id: "left_group",
                canvas: this._canvas,
                markers: this.options.markers,
                camera: this._canvas._camera
            });
            let rightMarkerGroup = new MarkerGroup(this.player, {
                id: "right_group",
                canvas: this._canvas,
                markers: this.options.markers,
                camera: this._canvas._camera
            });
            this.addChild("leftMarkerGroup", leftMarkerGroup);
            this.addChild("rightMarkerGroup", rightMarkerGroup);

            leftMarkerGroup.attachEvents();
            if(this._canvas.VRMode){
                rightMarkerGroup.attachEvents();
            }

            this.player.on("VRModeOn", ()=>{
                this.el().classList.add("vjs-marker-container--VREnable");
                leftMarkerGroup.camera = this._canvas._cameraL;
                rightMarkerGroup.camera = this._canvas._cameraR;
                rightMarkerGroup.attachEvents();
            });

            this.player.on("VRModeOff", ()=>{
                this.el().classList.remove("vjs-marker-container--VREnable");
                leftMarkerGroup.camera = this._canvas._camera;
                rightMarkerGroup.detachEvents();
            });
        }else{
            let markerGroup = new MarkerGroup(this.player, {
                id: "group",
                canvas: this._canvas,
                markers: this.options.Markers,
                camera: this._canvas._camera
            });
            this.addChild("markerGroup", markerGroup);
            markerGroup.attachEvents();
        }
    }
}

export default MarkerContainer;
