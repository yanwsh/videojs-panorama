// @flow

import type {Player, Settings} from './types';
import Loader from './tech/Loader';
import Panorama from './Panorama';

let playerClass: Class<Player> | null = Loader(window.VIDEO_PANORAMA);

if(playerClass){
    playerClass.registerPlugin();
}
else{
    throw new Error("could not found support player.");
}

const plugin = (playerDom: string | HTMLVideoElement, options: Settings) => {
    let videoEm = (typeof playerDom === "string")? document.querySelector(playerDom): playerDom;
    if(playerClass){
        // $FlowFixMe
        let player = new playerClass(videoEm, options);
        let panorama = new Panorama(player, options);
        return panorama;
    }
};

window.Panorama = plugin;

export default plugin;