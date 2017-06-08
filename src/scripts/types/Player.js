// @flow
import type Component from '../Components/Component';

export interface Player {
    static onPlayerReady(): void;

    el(): HTMLElement;
    getVideoEl(): HTMLVideoElement;
    fullscreenOnIOS(): void;

    on(...args: any): void;
    off(...args: any): void;
    one(...args: any): void;

    addComponent(name: string, component: Component, location: ?HTMLElement, index: ?number): Component;
    removeComponent(name: string): void;
    getComponent(name: string): Component;

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