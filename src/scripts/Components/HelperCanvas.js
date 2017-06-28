// @flow

import type { Player } from '../types';
import Component from './Component';

class HelperCanvas extends Component {
    _videoElement: HTMLVideoElement;
    _context: any;
    _width: number;
    _height: number;

    constructor(player: Player, options?: any = {}){
        let element: any = document.createElement('canvas');
        element.className = "vjs-panorama-video-helper-canvas";
        options.el = element;
        super(player, options);
        this._videoElement = player.getVideoEl();
        this._width = this._videoElement.offsetWidth;
        this._height = this._videoElement.offsetHeight;

        this.updateDimention();
        element.style.display = "none";

        this._context = element.getContext('2d');
        this._context.drawImage(this._videoElement, 0, 0, this._width, this._height);
        /**
         * Get actual video dimension after video load.
         */
        player.one("loadedmetadata", () => {
            this._width = this._videoElement.videoWidth;
            this._height = this._videoElement.videoHeight;
            this.updateDimention();
            this.render();
        });
    }

    updateDimention(){
        this.el().width = this._width;
        this.el().height = this._height;
    }

    el(){
        return this._el;
    }

    render(){
        this._context.drawImage(this._videoElement, 0, 0, this._width, this._height);
    }
}

export default HelperCanvas;