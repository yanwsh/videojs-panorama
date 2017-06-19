// @flow

import type { Player } from '../types';
import Videojs4 from './Videojs4';
import Videojs5 from './Videojs5';
import MediaElement from './MediaElementPlayer';
import { getVideojsVersion, warning } from '../utils';

const VIDEOPLAYER = {
    'videojs_v4': Videojs4 ,
    'videojs_v5' : Videojs5,
    'MediaElementPlayer': MediaElement
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

function chooseTech(): Class<Player> | null {
    if(typeof window.videojs !== "undefined"){
        let version = window.videojs.VERSION;
        let major = getVideojsVersion(version);
        if(major === 4){
            return VIDEOPLAYER['videojs_v4'];
        }else{
            return VIDEOPLAYER['videojs_v5'];
        }
    }

    if(typeof window.MediaElementPlayer !== "undefined"){
        return VIDEOPLAYER["MediaElementPlayer"];
    }
    
    return null;
}

function Loader(playerType: string): Class<Player> | null{
    let preferType = checkType(playerType);
    if(!preferType){
        preferType = chooseTech();
    }

    return preferType;
}


export default Loader;