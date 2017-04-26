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
    constructor(player, options = {}){
        let options = this.checkOptions(options);
        this._options = Util.mergeOptions({}, defaults, options);
        this._player = new Loader(this.options.playerType);
        this._canvas = new Canvas(this.player, this.options);


    }

    /**
     * check legacy option settings and produce warning message if user use legacy options, automatically set it to new options.
     * @param options the option settings which user parse.
     * @returns {*} the latest version which we use.
     */
    checkOptions(options){
        if(videoTypes.indexOf(options.videoType) == -1){
            console.warn(`videoType: ${options.videoType} is not supported.`);
            options.videoType = defaults.videoType;
        }
        return options;
    }

    get canvas(){
        return this._canvas;
    }

    get player(){
        return this._player;
    }

    get options(){
        return this._options;
    }
}

export default Panorama;