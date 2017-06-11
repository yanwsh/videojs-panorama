// @flow

import videojs from 'video.js';
import BaseVideoJs from './videojs';
import Panorama from '../Panorama';

class Videojs4 extends BaseVideoJs{
    static registerPlugin(): void{
        videojs.plugin("panorama", function(options){
            let instance = new Videojs4(this);
            let panorama = new Panorama(instance, options);
            return panorama;
        });
    }

    getVideoEl(): HTMLVideoElement{
        return this.playerInstance.tech?
            this.playerInstance.tech.el():
            this.playerInstance.h.el();
    }

    originalFullscreenClickFn(){
        return this.playerInstance.controlBar.fullscreenToggle.onClick || this.playerInstance.controlBar.fullscreenToggle.u;
    }
}

export default Videojs4;