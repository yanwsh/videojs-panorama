// @flow

import type { Player, MarkerSettings } from '../types';
import Component from './Component';

const defaults = {
    duration: -1
};

class Marker extends Component{
    constructor(player: Player, options: MarkerSettings){
        super(player, options);
    }

    attachEvents(){

    }
}

export default Marker;