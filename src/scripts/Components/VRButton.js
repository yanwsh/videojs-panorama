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
    }
}

export default VRButton;