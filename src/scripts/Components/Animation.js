// @flow

import type { Player, AnimationSettings } from '../types';
import BaseCanvas from './BaseCanvas';
import { mergeOptions, easeFunctions } from '../utils';

type Timeline = {
    active: boolean;
    initialized: boolean;
    completed: boolean;
    startValue: any;
    byValue: any;
    endValue: any;
    ease?: Function;
    onComplete?: Function;
    keyPoint: number;
    duration: number;
    beginTime: number;
    endTime: number;
    from?: any;
    to: any;
}

class Animation {
    _player: Player;
    _options: {
        animation: AnimationSettings[];
        canvas: BaseCanvas
    };
    _canvas: BaseCanvas;
    _timeline: Timeline[];
    _active: boolean;

    constructor(player: Player, options: {animation: AnimationSettings[], canvas: BaseCanvas}){
        this._player = player;
        this._options = mergeOptions({}, this._options);
        this._options = mergeOptions(this._options, options);

        this._canvas = this._options.canvas;
        this._timeline = [];

        this._options.animation.forEach((obj: AnimationSettings) =>{
            this.addTimeline(obj);
        });
    }

    addTimeline(opt: AnimationSettings){
        let timeline: Timeline = {
            active: false,
            initialized: false,
            completed: false,
            startValue: {},
            byValue: {},
            endValue: {},
            keyPoint: opt.keyPoint,
            duration: opt.duration,
            beginTime: Infinity,
            endTime: Infinity,
            onComplete: opt.onComplete,
            from: opt.from,
            to: opt.to
        };

        if(typeof opt.ease === "string"){
            timeline.ease = easeFunctions[opt.ease];
        }
        if(typeof opt.ease === "undefined"){
            timeline.ease = easeFunctions.linear;
        }

        this._timeline.push(timeline);
        this.attachEvents();
    }

    initialTimeline(timeline: Timeline){
        for(let key in timeline.to){
            if(timeline.to.hasOwnProperty(key)){
                let from = timeline.from? (typeof timeline.from[key] !== "undefined"? timeline.from[key] : this._canvas[`_${key}`]) : this._canvas[`_${key}`];
                timeline.startValue[key] = from;
                timeline.endValue[key] = timeline.to[key];
                timeline.byValue[key]  = timeline.to[key] - from;
            }
        }
    }

    processTimeline(timeline: Timeline, animationTime: number){
        for (let key in timeline.to){
            if (timeline.to.hasOwnProperty(key)) {
                let newVal = timeline.ease && timeline.ease(animationTime, timeline.startValue[key], timeline.byValue[key], timeline.duration);
                if(key === "fov"){
                    this._canvas._camera.fov = newVal;
                    this._canvas._camera.updateProjectionMatrix();
                }else{
                    this._canvas[`_${key}`] = newVal;
                }
            }
        }
    }

    attachEvents(){
        this._active = true;
        this._canvas.addListener("beforeRender", this.renderAnimation.bind(this));
        this._player.on("seeked", this.handleVideoSeek.bind(this));
    }

    detachEvents(){
        this._active = false;
        this._canvas.controlable = true;
        this._canvas.removeListener("beforeRender", this.renderAnimation.bind(this));
    }

    handleVideoSeek(){
        let currentTime = this._player.getVideoEl().currentTime * 1000;
        let resetTimeline = 0;
        this._timeline.forEach((timeline: Timeline)=>{
            let res = timeline.keyPoint >= currentTime || (timeline.keyPoint <= currentTime && (timeline.keyPoint + timeline.duration) >= currentTime);
            if(res){
                resetTimeline++;
                timeline.completed = false;
                timeline.initialized = false;
            }
        });

        if(resetTimeline > 0 && !this._active){
            this.attachEvents();
        }
    }

    renderAnimation(){
        let currentTime = this._player.getVideoEl().currentTime * 1000;
        let completeTimeline = 0;
        let inActiveTimeline = 0;
        this._timeline.filter((timeline: Timeline)=>{
            if(timeline.completed) {
                completeTimeline++;
                return false;
            }
            let res = timeline.keyPoint <= currentTime && (timeline.keyPoint + timeline.duration) > currentTime;
            timeline.active = res;
            if(timeline.active === false) inActiveTimeline++;

            if(res && !timeline.initialized){
                timeline.initialized = true;
                timeline.beginTime = timeline.keyPoint;
                timeline.endTime = timeline.beginTime + timeline.duration;
                this.initialTimeline(timeline);
            }
            if(timeline.endTime <= currentTime){
                timeline.completed = true;
                this.processTimeline(timeline, timeline.duration);
                if(timeline.onComplete){
                    timeline.onComplete.call(this);
                }
            }
            return res;
        }).forEach((timeline: Timeline)=>{
            let animationTime = currentTime - timeline.beginTime;
            this.processTimeline(timeline, animationTime);
        });

        this._canvas.controlable = inActiveTimeline === this._timeline.length;

        if(completeTimeline === this._timeline.length){
            this.detachEvents();
        }
    }
}

export default Animation;