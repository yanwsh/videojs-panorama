// @ flow

import  Panorama, { defaults } from '../Panorama';
import { mergeOptions, customEvent, isIos } from '../utils';
import BasePlayer from './BasePlayer';

class MediaElement extends BasePlayer{
    constructor(playerInstance: any){
        super(playerInstance);
        if(isIos()){
            this._fullscreenOnIOS();
        }
    }

    static registerPlugin(){
        mejs.MepDefaults = mergeOptions(mejs.MepDefaults, {
            Panorama: {
                ...defaults
            }
        });
        MediaElementPlayer.prototype = mergeOptions(MediaElementPlayer.prototype, {
            buildPanorama(player){
                if(player.domNode.tagName.toLowerCase() !== "video"){
                    throw new Error("Panorama don't support third party player");
                }
                let instance = new MediaElement(player);
                player.panorama = new Panorama(instance, this.options.Panorama);
            },
            clearPanorama(player){
                if(player.panorama){
                    player.panorama.dispose();
                }
            }
        })
    }

    el(): HTMLElement{
        return this.playerInstance.container;
    }

    getVideoEl(): HTMLVideoElement{
        return this.playerInstance.domNode;
    }

    getThumbnailURL(): string{
       return this.playerInstance.options.poster || this.getVideoEl().getAttribute("poster");
    }

    addClass(name: string): void{
        this.playerInstance.container.classList.add(name);
    }

    removeClass(name: string): void{
        this.playerInstance.container.classList.remove(name);
    }

    on(...args: any): void{
        let name = args[0];
        let fn = args[1];
        this.getVideoEl().addEventListener(name, fn);
    }

    off(...args: any): void{
        let name = args[0];
        let fn = args[1];
        this.getVideoEl().removeEventListener(name, fn);
    }

    one(...args: any): void{
        let name = args[0];
        let fn = args[1];
        let oneTimeFunction;
        this.on(name, oneTimeFunction = ()=>{
            fn();
            this.off(name, oneTimeFunction);
        });
    }

    trigger(name: string): void{
        let event = customEvent(name, this.el());
        this.getVideoEl().dispatchEvent(event);
        if(this._triggerCallback){
            this._triggerCallback(name);
        }
    }

    paused(): boolean{
        return this.getVideoEl().paused;
    }

    readyState(): number{
        return this.getVideoEl().readyState;
    }

    reportUserActivity(): void{
        this.playerInstance.showControls();
    }

    controlBar(): HTMLElement{
        return this.playerInstance.controls;
    }

    enableFullscreen(): void{
        if(!this.playerInstance.isFullScreen){
            this.playerInstance.enterFullScreen();
        }
    }

    _resizeCanvasFn(canvas: Component): Function{
        return ()=>{
            this.playerInstance.container.style.width = "100%";
            this.playerInstance.container.style.height = "100%";
            canvas.handleResize();
        };
    }

    _fullscreenOnIOS(){
        let self = this;
        //disable fullscreen on ios
        this.playerInstance.enterFullScreen = function(){
            let canvas: Component = self.getComponent("VideoCanvas");
            let resizeFn = self._resizeCanvasFn(canvas).bind(self);
            self.trigger("before_EnterFullscreen");
            document.documentElement.classList.add(`${this.options.classPrefix}fullscreen`);
            self.addClass(`${this.options.classPrefix}container-fullscreen`);
            this.container.style.width = "100%";
            this.container.style.height = "100%";
            window.addEventListener("devicemotion", resizeFn); //trigger when user rotate screen
            self.trigger("after_EnterFullscreen");
            this.isFullScreen = true;
            canvas.handleResize();
        };

        this.playerInstance.exitFullScreen = function(){
            let canvas: Component = self.getComponent("VideoCanvas");
            let resizeFn = self._resizeCanvasFn(canvas).bind(self);
            self.trigger("before_ExitFullscreen");
            document.documentElement.classList.remove(`${this.options.classPrefix}fullscreen`);
            self.removeClass(`${this.options.classPrefix}container-fullscreen`);
            this.isFullScreen = false;
            this.container.style.width = "";
            this.container.style.height = "";
            window.removeEventListener("devicemotion", resizeFn);
            self.trigger("after_ExitFullscreen");
            canvas.handleResize();
        };
    }

    ready(fn: Function): void{
        this.one('canplay', fn);
    }
}

export default MediaElement;