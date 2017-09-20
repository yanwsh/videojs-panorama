// @flow

import type {Settings} from './types';
import BasePlayer from './tech/BasePlayer';
import Loader from './tech/Loader';
import Panorama from './Panorama';

let playerClass: typeof BasePlayer | null = Loader(window.VIDEO_PANORAMA);

//todo: load from react?
if(playerClass){
    playerClass.registerPlugin();
}
else{
    throw new Error("Could not found support player.");
}

const plugin = (playerDom: string | HTMLVideoElement, options: Settings) => {
    let videoEm = (typeof playerDom === "string")? document.querySelector(playerDom): playerDom;
    if(playerClass){
        let player = new playerClass(videoEm, options);
        let panorama = new Panorama(player, options);
        return panorama;
    }
};

window.Panorama = plugin;

export default plugin;