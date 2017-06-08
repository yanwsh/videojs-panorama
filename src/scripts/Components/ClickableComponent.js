// @flow

import type { Player } from '../types';
import Component from './Component';

class ClickableComponent extends Component{

    constructor(player: Player, options: any = {}){
        super(player, options);
        this.on("click", this.handleClick.bind(this));
        this.addListener("tap", this.handleClick.bind(this));
    }

    /**
     * Builds the default DOM `className`.
     *
     * @return {string}
     *         The DOM `className` for this object.
     */
    buildCSSClass() {
        return `vjs-control vjs-button ${super.buildCSSClass()}`;
    }

    handleClick(event: Event) {
        this.trigger("click");
    }
}

export default ClickableComponent;