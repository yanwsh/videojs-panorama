// @flow

function whichTransitionEvent(){
    let el: HTMLElement = document.createElement('div');
    let transitions = {
        'transition':'transitionend',
        'OTransition':'oTransitionEnd',
        'MozTransition':'transitionend',
        'WebkitTransition':'webkitTransitionEnd'
    };

    for(let t in transitions){
        const nodeStyle: Object = el.style;
        if( nodeStyle[t] !== undefined ){
            return transitions[t];
        }
    }
}

export const transitionEvent = whichTransitionEvent();

//adopt from http://gizma.com/easing/
function linear(t: number, b: number, c: number, d: number): number{
    return c*t/d + b;
}

function easeInQuad(t: number, b: number, c: number, d: number): number {
    t /= d;
    return c*t*t + b;
}

function easeOutQuad(t: number, b: number, c: number, d: number): number {
    t /= d;
    return -c * t*(t-2) + b;
}

function easeInOutQuad(t: number, b: number, c: number, d: number): number {
    t /= d / 2;
    if (t < 1) return c / 2 * t * t + b;
    t--;
    return -c / 2 * (t * (t - 2) - 1) + b;
}

export const easeFunctions = {
    linear: linear,
    easeInQuad: easeInQuad,
    easeOutQuad: easeOutQuad,
    easeInOutQuad: easeInOutQuad
};