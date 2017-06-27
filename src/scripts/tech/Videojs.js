// @flow

import BasePlayer from './BasePlayer';
import Component from '../Components/Component';
import { isIos } from '../utils';

class Videojs extends BasePlayer{
    constructor(playerInstance: any){
        super(playerInstance);
        //ios device don't support fullscreen, we have to monkey patch the original fullscreen function.
        if(isIos()){
            this._fullscreenOnIOS();
        }
        //resize video if fullscreen change, this is used for ios device
        this.on("fullscreenchange",  () => {
            let canvas: Component = this.getComponent("VideoCanvas");
            canvas.handleResize();
        });
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

    _resizeCanvasFn(canvas: Component): Function{
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
        if(this._triggerCallback){
            this._triggerCallback(name);
        }
    }

    reportUserActivity(): void{
        this.playerInstance.reportUserActivity();
    }

    /**
     * Get original fullscreen function
     */
    _originalFullscreenClickFn(){
        throw Error('Not implemented');
    }

    _fullscreenOnIOS(): void{
        this.playerInstance.controlBar.fullscreenToggle.off("tap", this._originalFullscreenClickFn());
        this.playerInstance.controlBar.fullscreenToggle.on("tap", () => {
            let canvas: Component = this.getComponent("VideoCanvas");
            let resizeFn = this._resizeCanvasFn(canvas);
            if(!this.playerInstance.isFullscreen()){
                this.trigger("before_EnterFullscreen");
                //set to fullscreen
                this.playerInstance.isFullscreen(true);
                this.playerInstance.enterFullWindow();
                this.playerInstance.el().style.width = window.innerWidth + "px";
                this.playerInstance.el().style.height = window.innerHeight + "px";
                window.addEventListener("devicemotion", resizeFn); //trigger when user rotate screen
                this.trigger("after_EnterFullscreen");
            }else{
                this.trigger("before_ExitFullscreen");
                this.playerInstance.isFullscreen(false);
                this.playerInstance.exitFullWindow();
                this.playerInstance.el().style.width = "";
                this.playerInstance.el().style.height = "";
                window.removeEventListener("devicemotion", resizeFn);
                this.trigger("after_ExitFullscreen");
            }
            this.trigger("fullscreenchange");
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