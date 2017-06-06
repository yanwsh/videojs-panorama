// @flow

import type {Player} from './types';
import Loader from './tech/Loader';
import Notification from './Components/Notification';
import HelperCanvas from './Components/HelperCanvas';
import Panorama from './Panorama';

let playerClass: Class<Player> = Loader(window.VIDEOJS_PANORAMA);
playerClass.onPlayerReady();

const plugin = () => {

};

export default plugin;