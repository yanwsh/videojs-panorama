// @flow
import type Component from '../Components/Component';

export interface ComponentData{
    name: string;
    component: Component;
    location: HTMLElement;
}

export interface Player {
    static registerPlugin(): void;

    registerTriggerCallback(callback: Function): void;
    el(): HTMLElement;
    getVideoEl(): HTMLVideoElement;
    getThumbnailURL(): string;

    on(...args: any): void;
    off(...args: any): void;
    one(...args: any): void;
    trigger(name: string, ...args: any): void;

    ready(fn: Function): void;

    addComponent(name: string, component: Component, location: ?HTMLElement, index: ?number): Component;
    removeComponent(name: string): void;
    getComponent(name: string): Component;

    addClass(name: string): void;
    removeClass(name: string): void;

    play(): void;
    pause(): void;
    paused(): boolean;
    readyState(): number;

    /**
     * The interaction on canvas won't be known by player and the control bar will hide automatically.
     * So this function will report the player not to hide control bar
     */
    reportUserActivity(): void;

    /**
     * Dom Element for control bar
     */
    controlBar(): HTMLElement;
    /**
     * let player goes to fullscreen
     */
    enableFullscreen(): void;
}