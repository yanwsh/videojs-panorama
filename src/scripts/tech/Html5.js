// @flow

import type Component from '../Components/Component';
import BasePlayer from './BasePlayer';

class Html5Player extends BasePlayer {
    _el: HTMLElement;
    constructor(playerInstance: any){
        super(playerInstance);
        //wrapper with div
        let wrapper = document.createElement("div");
        let parentNode = this.playerInstance.parentNode;
        wrapper.appendChild(this.playerInstance);
        parentNode.appendChild(wrapper);
        this._el = wrapper;
    }

    static registerPlugin(): void{
    }

    ready(fn: Function): void{
        fn.call(this);
    }

    el(): HTMLElement{
        return this._el;
    }

    getVideoEl(): HTMLVideoElement{
        return this.playerInstance;
    }

    on(...args: any): void{
        let name = args[0];
        let fn = args[1];
        this.el().addEventListener(name, fn.bind(this));
    }

    off(...args: any): void{
        let name = args[0];
        let fn = args[1];
        this.el().removeEventListener(name, fn.bind(this));
    }

    one(...args: any): void{
        let name = args[0];
        let fn = args[1];
        this.on(name, ()=>{
            fn.call(this);
            this.off(name);
        });
    }

    addClass(name: string): void{
        this.el().classList.add(name);
    }

    removeClass(name: string): void{
        this.el().classList.remove(name);
    }

    fullscreenOnIOS(): void{
        throw Error('Not implemented');
    }

    paused(): boolean{
        return this.playerInstance.paused;
    }

    readyState(): number{
        return this.playerInstance.readyState;
    }

    trigger(name: string): void{

    }

    reportUserActivity(): void{

    }

    controlBar(): HTMLElement{
        throw Error('Not implemented');
    }

    enableFullscreen(): void{
        throw Error('Not implemented');
    }

    ready(fn: Function): void{
        throw Error('Not implemented');
    }
}

export default Html5Player;