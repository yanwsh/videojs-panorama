'use strict';

import Videojs4 from './Videojs4';
import Videojs5 from './Videojs5';
import HTML5 from './Html5';
import { getVideojsVersion } from '../lib/Util';

const VIDEOPLAYER = {
    'videojs_v4': Videojs4 ,
    'videojs_v5' : Videojs5,
    'native': HTML5
};

class Loader{
    constructor(playerType){
        let preferType = this.checkType(playerType);
        if(!preferType){
            preferType = this.chooseTech();
        }

        this._tech = new preferType();
    }

    checkType(playerType){
        if(typeof playerType !== "undefined"){
            if(VIDEOPLAYER[playerType]){
                return VIDEOPLAYER[playerType];
            }
            console.warn(`playerType: ${playerType} is not supported`);
        }
        return null;
    }

    chooseTech(){
        if(typeof window.videojs !== "undefined"){
            let version = window.videojs.VERSION;
            let major = getVideojsVersion(version);
            if(major === 0){
                return VIDEOPLAYER['native'];
            }else if(major === 4){
                return VIDEOPLAYER['videojs_v4'];
            }else {
                return VIDEOPLAYER['videojs_v5'];
            }
        }
        return VIDEOPLAYER['native'];
    }

    get tech(){
        return this._tech;
    }
}

export default Loader;