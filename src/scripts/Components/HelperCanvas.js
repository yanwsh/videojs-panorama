'use strict';

class HelperCanvas{
    constructor(player, options){
        this.player = player;
        this.width = options.width;
        this.height = options.height;

        this._el = document.createElement('canvas');
        this._el.className = "vjs-video-helper-canvas";

        this._el.width = this.width;
        this._el.height = this.height;
        this._el.style.display = "none";

        this._context = this._el.getContext('2d');
    }

    handleResize(options){
        this.width = options.width;
        this.height = options.height;
    }

    update(){
        this._context.drawImage(this.player, 0, 0, this.width, this.height);
    }

    get context(){
        return this._context;
    }

    get el(){
        return this._el;
    }
}