// @flow

import videojs from 'video.js';
import BaseVideoJs from './videojs';
import Panorama from '../Panorama';

class Videojs5 extends BaseVideoJs{
    static registerPlugin(): void{
        videojs.plugin("panorama", function(options){
            let instance = new Videojs5(this);
            let panorama = new Panorama(instance, options);
            return panorama;
        });
    }

    getVideoEl(): HTMLVideoElement{
        return this.playerInstance.tech({ IWillNotUseThisInPlugins: true }).el();
    }

    _originalFullscreenClickFn(){
        return this.playerInstance.controlBar.fullscreenToggle.handleClick;
    }
}

export default Videojs5;