// @ flow

import EventEmitter from 'wolfy87-eventemitter';
import type { Player } from '../types';
import { mergeOptions, ComponentData } from '../utils';

/**
 * base Component layer, which will be use when videojs is not supported environment.
 */
class Component extends EventEmitter{
    _options: any;
    _id: string;
    _el: HTMLElement | null;
    _player: Player;
    _renderElement: HTMLElement;
    _children: ComponentData[];

    constructor(player: Player, options: any = {}, renderElement?: HTMLElement, ready?: () => void){
        super();

        this._player = player;
        // Make a copy of prototype.options_ to protect against overriding defaults
        this._options = mergeOptions({}, this._options);
        // Updated options with supplied options
        this._options = mergeOptions(this._options, options);

        this._renderElement = renderElement;

        // Get ID from options or options element if one is supplied
        this._id = options.id || (options.el && options.el.id);

        this._el = (options.el)? options.el : this.createEl();

        this.emitTapEvents();

        this._children = [];

        if(ready){
            ready.call(this);
        }
    }

    dispose(){
        for(let i = 0; i < this._children.length; i++){
            this._children[i].component.dispose();
        }

        if(this._el){
            if(this._el.parentNode){
                this._el.parentNode.removeChild(this._el);
            }

            this._el = null;
        }
    }

    /**
     * Emit a 'tap' events when touch event support gets detected. This gets used to
     * support toggling the controls through a tap on the video. They get enabled
     * because every sub-component would have extra overhead otherwise.
     * */
    emitTapEvents() {
        // Track the start time so we can determine how long the touch lasted
        let touchStart = 0;
        let firstTouch = null;

        // Maximum movement allowed during a touch event to still be considered a tap
        // Other popular libs use anywhere from 2 (hammer.js) to 15,
        // so 10 seems like a nice, round number.
        const tapMovementThreshold = 10;

        // The maximum length a touch can be while still being considered a tap
        const touchTimeThreshold = 200;

        let couldBeTap;

        this.on('touchstart', function(event) {
            // If more than one finger, don't consider treating this as a click
            if (event.touches.length === 1) {
                // Copy pageX/pageY from the object
                firstTouch = {
                    pageX: event.touches[0].pageX,
                    pageY: event.touches[0].pageY
                };
                // Record start time so we can detect a tap vs. "touch and hold"
                touchStart = new Date().getTime();
                // Reset couldBeTap tracking
                couldBeTap = true;
            }
        });

        this.on('touchmove', function(event) {
            // If more than one finger, don't consider treating this as a click
            if (event.touches.length > 1) {
                couldBeTap = false;
            } else if (firstTouch) {
                // Some devices will throw touchmoves for all but the slightest of taps.
                // So, if we moved only a small distance, this could still be a tap
                const xdiff = event.touches[0].pageX - firstTouch.pageX;
                const ydiff = event.touches[0].pageY - firstTouch.pageY;
                const touchDistance = Math.sqrt(xdiff * xdiff + ydiff * ydiff);

                if (touchDistance > tapMovementThreshold) {
                    couldBeTap = false;
                }
            }
        });

        const noTap = function() {
            couldBeTap = false;
        };

        this.on('touchleave', noTap);
        this.on('touchcancel', noTap);

        // When the touch ends, measure how long it took and trigger the appropriate
        // event
        this.on('touchend', (event) => {
            firstTouch = null;
            // Proceed only if the touchmove/leave/cancel event didn't happen
            if (couldBeTap === true) {
                // Measure how long the touch lasted
                const touchTime = new Date().getTime() - touchStart;

                // Make sure the touch was less than the threshold to be considered a tap
                if (touchTime < touchTimeThreshold) {
                    // Don't let browser turn this into a click
                    event.preventDefault();
                    /**
                     * Triggered when a `Component` is tapped.
                     *
                     * @event Component#tap
                     * @type {EventTarget~Event}
                     */
                    this.trigger('tap');
                    // It may be good to copy the touchend event object and change the
                    // type to tap, if the other event properties aren't exact after
                    // Events.fixEvent runs (e.g. event.target)
                }
            }
        });
    }

    createEl(tagName?: string = "div", properties?: any, attributes?: any): HTMLElement{
        let el = document.createElement(tagName);
        el.className = this.buildCSSClass();

        for(let attribute in attributes){
            if(attributes.hasOwnProperty(attribute)){
                let value = attributes[attribute];
                el.setAttribute(attribute, value);
            }
        }
        return el;
    }

    el(): HTMLElement{
        return this._el;
    }

    /**
     * Builds the default DOM class name. Should be overriden by sub-components.
     *
     * @return {string}
     *         The DOM class name for this object.
     *
     * @abstract
     */
    buildCSSClass() {
        // Child classes can include a function that does:
        // return 'CLASS NAME' + this._super();
        return '';
    }

    on(name: string, action: Function): void{
        this.el().addEventListener(name, action);
    }

    off(name: string, action: Function): void{
        this.el().removeEventListener(name, action);
    }

    one(name: string, action: Function): void{
        let oneTimeFunction;
        this.on(name, oneTimeFunction = ()=>{
           action();
           this.off(name, oneTimeFunction);
        });
    }

    //Do nothing by default
    handleResize(): void{
    }

    addClass(name: string){
        this.el().classList.add(name);
    }

    removeClass(name: string){
        this.el().classList.remove(name);
    }

    toggleClass(name: string){
        this.el().classList.toggle(name);
    }

    show(){
        this.el().style.display = "block";
    }

    hide(){
        this.el().style.display = "none";
    }

    addChild(name: string, component: Component, index: ?number) : void{
        let location = this.el();
        if(!index){
            index = -1;
        }

        if(typeof component.el === "function" && component.el()){
            if(index === -1){
                location.appendChild(component.el());
            }else{
                let children = location.childNodes;
                let child = children[index];
                location.insertBefore(component.el(), child);
            }
        }

        this._children.push({
            name,
            component,
            location
        });
    }

    removeChild(name: string): void{
        this._children = this._children.reduce((acc, component)=>{
            if(component.name !== name){
                acc.push(component);
            }else{
                component.component.dispose();
            }
            return acc;
        }, []);
    }

    getChild(name: string): Component | null{
        let component;
        for(let i = 0; i < this._children.length; i++){
            if(this._children[i].name === name){
                component = this._children[i];
                break;
            }
        }
        return component? component.component: null;
    }

    get player(): Player{
        return this._player;
    }

    get options(): any {
        return this._options;
    }
}

export default Component;
