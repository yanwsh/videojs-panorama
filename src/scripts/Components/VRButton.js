// @flow

import type { Player } from '../types';
import Button from './Button';

class VRButton extends Button{
    constructor(player: Player, options: any = {}){
        super(player, options);
    }

    buildCSSClass() {
        return `vjs-VR-control ${super.buildCSSClass()}`;
    }

    handleClick(event: Event){
        super.handleClick(event);
        this.toggleClass("enable");

        let videoCanvas = this.player.getComponent("VideoCanvas");
        let VRMode = videoCanvas.VRMode;
        (!VRMode)? videoCanvas.enableVR() : videoCanvas.disableVR();
        (!VRMode)?  this.player.trigger('VRModeOn'): this.player.trigger('VRModeOff');
        if(!VRMode && this.options.VRFullscreen){
            this.player.enableFullscreen();
        }
    }
}

export default VRButton;