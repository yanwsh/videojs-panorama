// @flow

import type {Settings} from './types';
import BasePlayer from './tech/BasePlayer';
import Loader from './tech/Loader';
import Panorama from './Panorama';

let playerClass: typeof BasePlayer | null = Loader(window.VIDEO_PANORAMA);

if(playerClass){
    playerClass.registerPlugin();
}

const plugin = (playerDom: string | HTMLVideoElement, options: Settings, playerType?: string) => {
    let videoEm = (typeof playerDom === "string")? document.querySelector(playerDom): playerDom;
    if(!playerClass){
        playerClass = Loader(playerType);
        if(!playerClass){
            throw new Error("Unable to figure out which media player in use.");
        }
        playerClass.registerPlugin();
    }
    let player = new playerClass(videoEm, options);
    let panorama = new Panorama(player, options);
    return panorama;
};

window.Panorama = plugin;

export default plugin;