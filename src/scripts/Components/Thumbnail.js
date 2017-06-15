// @flow

import type { Player } from '../types';
import Component from './Component';

class Thumbnail extends Component{
    constructor(player: Player, options: {
        posterSrc: string;
        onComplete?: Function;
        el?: HTMLElement;
    }){
        let el: HTMLElement;

        el = document.createElement('img');
        el.src = options.posterSrc;

        options.el = el;

        super(player, options);

        this.one('load', ()=>{
            if(options.onComplete){
                options.onComplete();
            }
        })
    }
}

export default Thumbnail;