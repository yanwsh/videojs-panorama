// @flow

import videojs from 'video.js';
import BasePlayer from './BasePlayer';

import Component from '../Components/Component';

class Videojs extends BasePlayer{
    constructor(playerInstance: any){
        super(playerInstance);
    }

    el(): HTMLElement{
        return this.playerInstance.el();
    }

    getVideoEl(): HTMLVideoElement{
        throw Error('Not implemented');
    }

    getThumbnailURL(): string{
        return this.playerInstance.poster();
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
            canvas.handleResize();
        };
    }

    paused(): boolean{
        return this.playerInstance.paused();
    }

    readyState(): number{
        return this.playerInstance.readyState();
    }

    trigger(name: string): void{
        this.playerInstance.trigger(name);
    }

    reportUserActivity(): void{
        this.playerInstance.reportUserActivity();
    }

    /**
     * Get original fullscreen function
     */
    originalFullscreenClickFn(){
        throw Error('Not implemented');
    }

    fullscreenOnIOS(): void{
        let canvas: Component = this.getComponent("VideoCanvas").component;
        let resizeFn = this.resizeCanvasFn(canvas);
        this.playerInstance.controlBar.fullscreenToggle.off("tap", this.originalFullscreenClickFn());
        this.playerInstance.controlBar.fullscreenToggle.on("tap", () => {
            if(!this.playerInstance.isFullscreen()){
                this.trigger("before_EnterFullscreen");
                //set to fullscreen
                this.playerInstance.isFullscreen(true);
                this.playerInstance.enterFullWindow();
                resizeFn();
                window.addEventListener("devicemotion", resizeFn);
                this.trigger("after_EnterFullscreen");
            }else{
                this.trigger("before_ExitFullscreen");
                this.playerInstance.isFullscreen(false);
                this.playerInstance.exitFullWindow();
                this.playerInstance.el().style.width = "";
                this.playerInstance.el().style.height = "";
                canvas.handleResize();
                window.removeEventListener("devicemotion", resizeFn);
                this.trigger("after_ExitFullscreen");
            }
        });
    }

    controlBar(): HTMLElement{
        let controlBar = this.playerInstance.controlBar;
        return controlBar.el();
    }

    enableFullscreen(): void{
        if(!this.playerInstance.isFullscreen())
            this.playerInstance.controlBar.fullscreenToggle.trigger("tap");
    }

    ready(fn: Function): void{
        this.playerInstance.ready(fn);
    }
}

export default Videojs;