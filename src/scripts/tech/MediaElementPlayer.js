// @ flow

import  Panorama, { defaults } from '../Panorama';
import { mergeOptions } from '../utils/merge-options';
import BasePlayer from './BasePlayer';

class MediaElement extends BasePlayer{
    constructor(playerInstance: any){
        super(playerInstance);
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
        this.getVideoEl().addEventListener(name, fn.bind(this));
    }

    off(...args: any): void{
        let name = args[0];
        let fn = args[1];
        this.getVideoEl().removeEventListener(name, fn.bind(this));
    }

    one(...args: any): void{
        let name = args[0];
        let fn = args[1];
        this.on(name, ()=>{
            fn.call(this);
            this.off(name, fn);
        });
    }

    fullscreenOnIOS(): void{
        throw Error('Not implemented');
    }

    play(): void{
        this.playerInstance.play();
    }

    pause(): void{
        this.playerInstance.pause()
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

    ready(fn: Function): void{
        this.getVideoEl().addEventListener('canplay', ()=>{
            fn.call(this);
        });
    }
}

export default MediaElement;