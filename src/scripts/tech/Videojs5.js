// @flow

import videojs from 'video.js';
import BasePlayer from './BasePlayer';
import Panorama from '../Panorama';
import Component from '../Components/Component';

class Videojs5 extends BasePlayer{
    constructor(playerInstance: any){
        super(playerInstance);
    }

    static onPlayerReady(): void{
        videojs.plugin("panorama", function(options){
            this.ready(()=>{
                let instance = new Videojs5(this);
                let panorama = new Panorama(instance, options);

                panorama.addListener('fullscreen', ()=>{

                });
            });
        });
    }


    el(): HTMLElement{
        return this.playerInstance.el();
    }

    getVideoEl(): HTMLVideoElement{
        return this.playerInstance.tech({ IWillNotUseThisInPlugins: true }).el();
    }

    on(...args: any): void{
        this.playerInstance.on(...args);
    }

    off(...args: any): void{
        this.playerInstance.off(...args);
    }

    one(...args: any): void{
        this.playerInstance.one(...args);
    }

    addClass(name: string): void{
        this.playerInstance.addClass(name);
    }

    removeClass(name: string): void{
        this.playerInstance.removeClass(name);
    }

    resizeCanvasFn(canvas: Component): Function{
        return ()=>{
            this.playerInstance.el().style.width = window.innerWidth + "px";
            this.playerInstance.el().style.height = window.innerHeight + "px";
            canvas.component.handleResize();
        };
    }

    fullscreenOnIOS(): void{
        let canvas: Component = this.getComponent("Canvas");
        let resizeFn = this.resizeCanvasFn(canvas);
        this.playerInstance.controlBar.fullscreenToggle.off("tap", this.playerInstance.controlBar.fullscreenToggle.handleClick);
        this.playerInstance.controlBar.fullscreenToggle.on("tap", () => {
            if(!this.playerInstance.isFullscreen()){
                //set to fullscreen
                this.playerInstance.isFullscreen(true);
                this.playerInstance.enterFullWindow();
                resizeFn();
                window.addEventListener("devicemotion", resizeFn);
            }else{
                this.playerInstance.isFullscreen(false);
                this.playerInstance.exitFullWindow();
                this.playerInstance.el().style.width = "";
                this.playerInstance.el().style.height = "";
                canvas.component.handleResize();
                window.removeEventListener("devicemotion", resizeFn);
            }
        });
    }
}

export default Videojs5;