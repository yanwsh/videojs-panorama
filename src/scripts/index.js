// @flow

import type {Player, Settings} from './types';
import Loader from './tech/Loader';
import Panorama from './Panorama';

let playerClass: Class<Player> = Loader(window.VIDEOJS_PANORAMA);
playerClass.registerPlugin();

const plugin = (playerDom: string | HTMLVideoElement, options: Settings) => {
    let videoEm = (typeof playerDom === "string")? document.querySelector(playerDom): playerDom;
    // $FlowFixMe
    let player = new playerClass(videoEm);
    let panorama = new Panorama(player, options);
    return panorama;
};

window.Panorama = plugin;

export default plugin;