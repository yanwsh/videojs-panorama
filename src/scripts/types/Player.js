// @flow
import type Component from '../Components/Component';

export interface ComponentData{
    name: string;
    component: Component;
    location: HTMLElement;
}

export interface Player {
    static registerPlugin(): void;

    el(): HTMLElement;
    getVideoEl(): HTMLVideoElement;
    fullscreenOnIOS(): void;

    on(...args: any): void;
    off(...args: any): void;
    one(...args: any): void;

    ready(fn: Function): void;

    addComponent(name: string, component: Component, location: ?HTMLElement, index: ?number): Component;
    removeComponent(name: string): void;
    getComponent(name: string): ComponentData;

    addClass(name: string): void;
    removeClass(name: string): void;

    play(): void;
    pause(): void;
    paused(): boolean;
    readyState(): number;

    trigger(name: string): void;
    reportUserActivity(): void;

    controlBar(): HTMLElement;
    enableFullscreen(): void;
}