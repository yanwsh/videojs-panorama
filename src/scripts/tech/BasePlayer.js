// @ flow

import type { Player, ComponentData } from '../types';

class BasePlayer implements Player {
    _components: Array<ComponentData>;
    constructor(playerInstance){
        if (Object.getPrototypeOf(this) === BasePlayer.prototype) {
            throw Error('abstract class should not be instantiated directly; write a subclass');
        }

        this.playerInstance = playerInstance;
        this._components = [];
    }

    static registerPlugin(){
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

    addComponent(name: string, component: Component, location: ?HTMLElement, index: ?number): Component{
        if(!location){
            location = this.el();
        }
        if(!index){
            index = -1;
        }

        if(typeof component.el === "function" && component.el()){
            if(index === -1){
                location.append(component.el());
            }else{
                let children = location.childNodes;
                let child = children[index];
                location.insertBefore(component.el(), child);
            }
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

    getComponent(name: string): ComponentData{
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
        throw Error('Not implemented');
    }

    readyState(): number{
        throw Error('Not implemented');
    }

    trigger(name: string): void{
        throw Error('Not implemented');
    }

    reportUserActivity(): void{
        throw Error('Not implemented');
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

export default BasePlayer;