// @flow

import type { Player } from '../types';
import Videojs4 from './Videojs4';
import Videojs5 from './Videojs5';
import HTML5 from './Html5';
import { getVideojsVersion, warning } from '../utils';

const VIDEOPLAYER = {
    'videojs_v4': Videojs4 ,
    'videojs_v5' : Videojs5,
    'native': HTML5
};

function checkType(playerType: string): Class<Player> | null{
    if(typeof playerType !== "undefined"){
        if(VIDEOPLAYER[playerType]){
            return VIDEOPLAYER[playerType];
        }
        warning(`playerType: ${playerType} is not supported`);
    }
    return null;
}

function chooseTech(): Class<Player> {
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

function Loader(playerType: string): Class<Player>{
    let preferType = checkType(playerType);
    if(!preferType){
        preferType = chooseTech();
    }

    return preferType;
}


export default Loader;