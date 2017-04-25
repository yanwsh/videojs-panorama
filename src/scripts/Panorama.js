'use strict';

import Canvas from './Components/Canvas';
import Loader from './tech/Loader';
import Util from '/lib/Util';

const videoTypes = ["equirectangular", "fisheye", "3dVideo", "dual_fisheye"];

const defaults = {
    playerType: null,
    videoType: "equirectangular",
};

class Panorama{
    constructor(options){
        let options = this.checkOptions(options);
        this._options = Object.assign({}, defaults, options);
        this._player = new Loader(this.options.playerType);

        this.canvas = new Canvas(this.player, this.options);


    }

    checkOptions(options){
        if(videoTypes.indexOf(options.videoType) == -1){
            console.warn(`videoType: ${options.videoType} is not supported.`);
            options.videoType = defaults.videoType;
        }
        return options;
    }

    get player(){
        return this._player;
    }

    get options(){
        return this._options;
    }
}

export default Panorama;