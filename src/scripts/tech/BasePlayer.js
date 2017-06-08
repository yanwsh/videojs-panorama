// @ flow

import type { Player } from '../types';
import type { Component } from '../Components/Component';


class BasePlayer implements Player {
    constructor(playerInstance){
        if (Object.getPrototypeOf(this) === BasePlayer.prototype) {
            throw Error('abstract class should not be instantiated directly; write a subclass');
        }

        this.playerInstance = playerInstance;
        this._components = [];
    }

    static onPlayerReady(){
        throw Error('Not implemented');
    }

    el(): HTMLVideoElement{
        throw Error('Not implemented');
    }

    getTechEl(): HTMLElement{
        throw Error('Not implemented');
    }

    on(...args: any): void{
        throw Error('Not implemented');
    }

    off(...args: any): void{
        throw Error('Not implemented');
    }

    one(...args: any): void{
        throw Error('Not implemented');
    }

    addClass(name: string): void{
        throw Error('Not implemented');
    }

    removeClass(name: string): void{
        throw Error('Not implemented');
    }

    fullscreenOnIOS(): void{
        throw Error('Not implemented');
    }

    addComponent(name: string, component: Component, location: ?HTMLElement): Component{
        if(!location){
            location = this.playerInstance.el();
        }

        if(typeof component.el === "function" && component.el()){
            location.append(component.el());
        }

        this._components.push({
            name,
            component,
            location
        });

        return component;
    }

    removeComponent(name: string): void{
        this._components = this._components.reduce((acc, component)=>{
            if(component.name !== name){
                acc.push(component)
            }else{
                if(typeof component.el === "function" && component.el()){
                    component.location.parentNode.removeChild(component.el());
                }
            }
            return acc;
        }, []);
    }

    getComponent(name: string): Component{
        let component;
        for(let i = 0; i < this._components.length; i++){
            if(this._components[i].name === name){
                component = this._components[i];
                break;
            }
        }
        return component;
    }

    play(): void{
        this.playerInstance.play();
    }

    pause(): void{
        this.playerInstance.pause();
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
}

export default BasePlayer;