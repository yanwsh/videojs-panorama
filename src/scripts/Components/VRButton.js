// @flow

import type { Player } from '../types';
import ClickableComponent from './ClickableComponent';

class VRButton extends ClickableComponent{
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